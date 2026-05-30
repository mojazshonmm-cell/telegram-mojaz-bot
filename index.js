import 'dotenv/config'
import express from 'express'

const BOT_TOKEN = process.env.BOT_TOKEN
const SECRET_PATH = process.env.SECRET_PATH
const PORT = process.env.PORT || 3000

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is missing')
if (!SECRET_PATH) throw new Error('SECRET_PATH is missing')

const API = `https://api.telegram.org/bot${BOT_TOKEN}`

const app = express()
app.use(express.json())

// --------------------
// RAM Storage
// --------------------
const users = new Map()

function getUser(id, name = 'بازیکن') {
  const key = String(id)
  if (!users.has(key)) {
    users.set(key, {
      id: key,
      name,
      money: 200000, // تومان
      bank: 0,
      health: 100,
      xp: 0,
      level: 1,
      lastWork: 0,
      lastFun: 0
    })
  }
  return users.get(key)
}

function clamp(u) {
  u.money = Math.max(0, u.money | 0)
  u.bank = Math.max(0, u.bank | 0)
  u.health = Math.max(0, Math.min(100, u.health | 0))
  u.xp = Math.max(0, u.xp | 0)
  u.level = Math.max(1, u.level | 0)
  return u
}

function formatMoney(n) {
  return `${Number(n).toLocaleString('en-US')} تومان`
}

function cooldownLeft(lastTime, seconds) {
  const passed = Math.floor((Date.now() - lastTime) / 1000)
  return Math.max(0, seconds - passed)
}

function safeName(from) {
  return from?.first_name || from?.username || 'بازیکن'
}

// --------------------
// Telegram helpers (direct API)
// --------------------
async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    // برای ساده‌سازی و جلوگیری از کرش‌های HTML:
    // parse_mode حذف شد
    ...extra
  })
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...extra
  })
}

async function answerCb(id, text = '') {
  return tg('answerCallbackQuery', { callback_query_id: id, text })
}

// --------------------
// UI
// --------------------
function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 پروفایل', callback_data: 'profile' }],
      [{ text: '💼 کار', callback_data: 'work' }, { text: '🎉 تفریح', callback_data: 'fun' }],
      [{ text: '🏦 بانک', callback_data: 'bank' }]
    ]
  }
}

function bankKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🏦 واریز 50,000', callback_data: 'bank_deposit' }],
      [{ text: '💸 برداشت 50,000', callback_data: 'bank_withdraw' }],
      [{ text: '⬅️ بازگشت', callback_data: 'back' }]
    ]
  }
}

function profileText(u) {
  return [
    `پروفایل ${u.name}`,
    `پول نقد: ${formatMoney(u.money)}`,
    `بانک: ${formatMoney(u.bank)}`,
    `سلامتی: ${u.health}/100`,
    `XP: ${u.xp} | Level: ${u.level}`
  ].join('\n')
}

async function renderMain(chatId, messageId, u) {
  const text = [
    'ربات شبیه‌ساز زندگی (نسخه ساده)',
    'واحد پول: تومان',
    '',
    profileText(u)
  ].join('\n')

  if (messageId) return editMessage(chatId, messageId, text, { reply_markup: mainKeyboard() })
  return sendMessage(chatId, text, { reply_markup: mainKeyboard() })
}

// --------------------
// Handlers
// --------------------
async function handleMessage(msg) {
  const chatId = msg.chat.id
  const from = msg.from
  const text = (msg.text || '').trim()
  const u = clamp(getUser(from.id, safeName(from)))

  if (text === '/start') {
    return renderMain(chatId, null, u)
  }

  if (text === '/myid') {
    return sendMessage(chatId, `ID: ${from.id}`)
  }

  return sendMessage(chatId, 'برای شروع /start را بزن.')
}

async function handleCallback(cq) {
  const data = cq.data
  const chatId = cq.message.chat.id
  const messageId = cq.message.message_id
  const u = clamp(getUser(cq.from.id, safeName(cq.from)))

  if (data === 'back' || data === 'profile') {
    await answerCb(cq.id, 'OK')
    return renderMain(chatId, messageId, u)
  }

  if (data === 'work') {
    const left = cooldownLeft(u.lastWork, 30)
    if (left > 0) {
      await answerCb(cq.id, `کول‌داون: ${left}s`)
      return
    }
    const gain = 40000 + Math.floor(Math.random() * 40000)
    u.money += gain
    u.xp += 5
    u.lastWork = Date.now()
    if (u.xp >= u.level * 50) {
      u.xp = 0
      u.level += 1
    }
    clamp(u)

    await answerCb(cq.id, 'کار انجام شد')
    return editMessage(chatId, messageId, `کار کردی و ${formatMoney(gain)} گرفتی.\n\n${profileText(u)}`, {
      reply_markup: mainKeyboard()
    })
  }

  if (data === 'fun') {
    const left = cooldownLeft(u.lastFun, 20)
    if (left > 0) {
      await answerCb(cq.id, `کول‌داون: ${left}s`)
      return
    }
    u.health = Math.min(100, u.health + 8)
    u.lastFun = Date.now()
    clamp(u)

    await answerCb(cq.id, 'تفریح انجام شد')
    return editMessage(chatId, messageId, `تفریح کردی و سلامتی‌ات بهتر شد.\n\n${profileText(u)}`, {
      reply_markup: mainKeyboard()
    })
  }

  if (data === 'bank') {
    await answerCb(cq.id, 'بانک')
    return editMessage(chatId, messageId, `بانک:\nپول نقد: ${formatMoney(u.money)}\nبانک: ${formatMoney(u.bank)}`, {
      reply_markup: bankKeyboard()
    })
  }

  if (data === 'bank_deposit') {
    const amount = Math.min(50000, u.money)
    if (amount <= 0) {
      await answerCb(cq.id, 'پول نقد نداری')
      return
    }
    u.money -= amount
    u.bank += amount
    clamp(u)

    await answerCb(cq.id, 'واریز شد')
    return editMessage(chatId, messageId, `واریز: ${formatMoney(amount)}\n\n${profileText(u)}`, {
      reply_markup: bankKeyboard()
    })
  }

  if (data === 'bank_withdraw') {
    const amount = Math.min(50000, u.bank)
    if (amount <= 0) {
      await answerCb(cq.id, 'پول توی بانک نداری')
      return
    }
    u.bank -= amount
    u.money += amount
    clamp(u)

    await answerCb(cq.id, 'برداشت شد')
    return editMessage(chatId, messageId, `برداشت: ${formatMoney(amount)}\n\n${profileText(u)}`, {
      reply_markup: bankKeyboard()
    })
  }

  await answerCb(cq.id, 'ناشناخته')
}

// --------------------
// Routes
// --------------------
app.get('/', (req, res) => res.send('OK'))

app.post(`/${SECRET_PATH}`, (req, res) => {
  // سریع جواب می‌دیم تا تلگرام retry نکنه
  res.sendStatus(200)

  // بقیه کار async
  ;(async () => {
    try {
      const update = req.body
      if (update?.message) await handleMessage(update.message)
      if (update?.callback_query) await handleCallback(update.callback_query)
    } catch (e) {
      console.error('Webhook handler error:', e)
    }
  })()
})

app.listen(PORT, () => {
  console.log('Running on', PORT)
})
