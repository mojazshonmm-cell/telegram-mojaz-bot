import 'dotenv/config'
import express from 'express'

const app = express()
app.use(express.json())

const BOT_TOKEN = process.env.BOT_TOKEN
const SECRET_PATH = process.env.SECRET_PATH || 'webhook'
const PORT = process.env.PORT || 3000
const ADMIN_ID = process.env.ADMIN_ID || '5576592239'

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN تنظیم نشده')
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`

// =========================
// RAM STORAGE
// =========================
const users = new Map()

function createUser(id, name = 'بازیکن') {
  return {
    id: String(id),
    name,

    money: 500000, // تومان
    bank: 0,
    debt: 0,

    health: 100,
    energy: 100,
    happiness: 70,

    xp: 0,
    level: 1,
    age: 18,

    job: 'بیکار',
    education: 'بی‌سواد',
    married: false,
    partner: null,
    children: 0,
    familyLove: 40,

    house: 'ندارد',
    car: 'ندارد',
    business: 'ندارد',

    mafia: false,
    crimeLevel: 0,
    jailTurns: 0,

    lastWork: 0,
    lastFun: 0,
    lastStudy: 0,
    lastCrime: 0,
    lastFamily: 0,
    lastMafia: 0,

    inventory: [],
    createdAt: Date.now()
  }
}

function getUser(id, name = 'بازیکن') {
  const userId = String(id)
  if (!users.has(userId)) {
    users.set(userId, createUser(userId, name))
  }
  return users.get(userId)
}

function clamp(user) {
  user.money = Math.max(0, user.money || 0)
  user.bank = Math.max(0, user.bank || 0)
  user.debt = Math.max(0, user.debt || 0)

  user.health = Math.max(0, Math.min(100, user.health || 0))
  user.energy = Math.max(0, Math.min(100, user.energy || 0))
  user.happiness = Math.max(0, Math.min(100, user.happiness || 0))

  user.xp = Math.max(0, user.xp || 0)
  user.level = Math.max(1, user.level || 1)
  user.age = Math.max(18, user.age || 18)
  user.children = Math.max(0, user.children || 0)
  user.familyLove = Math.max(0, Math.min(100, user.familyLove || 0))
  user.crimeLevel = Math.max(0, user.crimeLevel || 0)
  user.jailTurns = Math.max(0, user.jailTurns || 0)

  return user
}

function addXP(user, amount) {
  user.xp += amount
  while (user.xp >= user.level * 120) {
    user.xp -= user.level * 120
    user.level += 1
    user.money += 50000
  }
  clamp(user)
}

function isAdmin(userId) {
  return String(userId) === String(ADMIN_ID)
}

function formatMoney(amount) {
  return `${Number(amount).toLocaleString('en-US')} تومان`
}

function cooldownLeft(lastTime, seconds) {
  const passed = Math.floor((Date.now() - lastTime) / 1000)
  return Math.max(0, seconds - passed)
}

function prettyCooldown(sec) {
  if (sec < 60) return `${sec} ثانیه`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m} دقیقه و ${s} ثانیه`
}

function statusBar(label, value, max = 100) {
  const filled = Math.round((value / max) * 10)
  const empty = 10 - filled
  return `${label}: ${'🟩'.repeat(filled)}${'⬜'.repeat(empty)} ${value}/${max}`
}

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '📊 وضعیت من', callback_data: 'profile' }],
      [{ text: '💼 کار', callback_data: 'work_menu' }, { text: '🎉 تفریح', callback_data: 'fun_menu' }],
      [{ text: '👨‍👩‍👧 خانواده', callback_data: 'family_menu' }, { text: '💍 ازدواج', callback_data: 'marriage_menu' }],
      [{ text: '🏠 خانه', callback_data: 'house_menu' }, { text: '🚗 ماشین', callback_data: 'car_menu' }],
      [{ text: '🎓 تحصیل', callback_data: 'edu_menu' }, { text: '🏦 بانک', callback_data: 'bank_menu' }],
      [{ text: '🏢 کسب‌وکار', callback_data: 'biz_menu' }, { text: '🕵️ جرم', callback_data: 'crime_menu' }],
      [{ text: '🖤 مافیا', callback_data: 'mafia_menu' }, { text: '🏥 بیمارستان', callback_data: 'hospital' }],
      [{ text: '🔄 تازه‌سازی', callback_data: 'refresh_main' }]
    ]
  }
}

function backButton() {
  return { inline_keyboard: [[{ text: '⬅️ بازگشت', callback_data: 'back_main' }]] }
}

function combineButtons(rows) {
  return { inline_keyboard: [...rows, [{ text: '⬅️ بازگشت', callback_data: 'back_main' }]] }
}

function profileText(user) {
  return `
🎮 <b>پروفایل زندگی ${user.name}</b>

💵 پول نقد: <b>${formatMoney(user.money)}</b>
🏦 موجودی بانک: <b>${formatMoney(user.bank)}</b>
📉 بدهی: <b>${formatMoney(user.debt)}</b>

❤️ سلامتی: <b>${user.health}</b>/100
⚡ انرژی: <b>${user.energy}</b>/100
😄 خوشحالی: <b>${user.happiness}</b>/100

⭐ XP: <b>${user.xp}</b>
🏅 لِول: <b>${user.level}</b>
🎂 سن: <b>${user.age}</b>

💼 شغل: <b>${user.job}</b>
🎓 تحصیلات: <b>${user.education}</b>

💍 ازدواج: <b>${user.married ? `متأهل با ${user.partner}` : 'مجرد'}</b>
👶 تعداد بچه: <b>${user.children}</b>
❤️‍🔥 عشق خانوادگی: <b>${user.familyLove}</b>/100

🏠 خانه: <b>${user.house}</b>
🚗 ماشین: <b>${user.car}</b>
🏢 کسب‌وکار: <b>${user.business}</b>

🖤 عضو مافیا: <b>${user.mafia ? 'بله' : 'خیر'}</b>
🕵️ سطح جرم: <b>${user.crimeLevel}</b>
🚔 نوبت زندان: <b>${user.jailTurns}</b>

${statusBar('سلامتی', user.health)}
${statusBar('انرژی', user.energy)}
${statusBar('خوشحالی', user.happiness)}
`.trim()
}

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
    parse_mode: 'HTML',
    ...extra
  })
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    ...extra
  })
}

async function answerCallbackQuery(callbackId, text = '') {
  return tg('answerCallbackQuery', {
    callback_query_id: callbackId,
    text,
    show_alert: false
  })
}

function safeName(user) {
  return user?.first_name || user?.username || 'بازیکن'
}

function applyNeedDecay(user, energyLoss = 0, healthLoss = 0, happinessLoss = 0) {
  user.energy -= energyLoss
  user.health -= healthLoss
  user.happiness -= happinessLoss
  clamp(user)
}

function canAct(user) {
  if (user.jailTurns > 0) {
    return { ok: false, msg: `🚔 شما در زندان هستید. ${user.jailTurns} نوبت دیگر باقی مانده.` }
  }
  if (user.health <= 10) {
    return { ok: false, msg: '🏥 سلامتی شما خیلی پایین است. اول درمان کن.' }
  }
  if (user.energy <= 5) {
    return { ok: false, msg: '⚡ انرژی شما خیلی کم است. کمی تفریح یا استراحت لازم داری.' }
  }
  return { ok: true }
}

// =========================
// MENUS
// =========================
function workMenuText() {
  return `
💼 <b>منوی کار</b>

شغل و تلاش، منبع اصلی درآمد تو هستند.
هر کار:
- مقداری <b>تومان</b> می‌دهد
- کمی <b>XP</b> می‌دهد
- مقداری از <b>انرژی</b> و گاهی سلامتی کم می‌کند

کارهای موجود:
🔨 کارگری
🏢 کار اداری
🚕 رانندگی
💻 فریلنسری
`.trim()
}

function funMenuText() {
  return `
🎉 <b>منوی تفریح</b>

تفریح باعث بالا رفتن:
- خوشحالی
- انرژی
- گاهی سلامتی

انتخاب‌ها:
🎬 سینما
🎵 موسیقی
🌳 پارک
🛌 استراحت
`.trim()
}

function familyMenuText() {
  return `
👨‍👩‍👧 <b>منوی خانواده</b>

خانواده روی کیفیت زندگی تو اثر مستقیم دارد.
این بخش باعث افزایش:
- عشق خانوادگی
- خوشحالی
- گاهی سلامتی

فعالیت‌ها:
📞 تماس با خانواده
🍽 شام خانوادگی
🎁 خرید هدیه
👶 وقت با بچه‌ها
`.trim()
}

function marriageMenuText(user) {
  return `
💍 <b>منوی ازدواج</b>

وضعیت فعلی: <b>${user.married ? `متأهل با ${user.partner}` : 'مجرد'}</b>

گزینه‌ها:
💕 آشنایی با شریک
💒 ازدواج
👶 بچه‌دار شدن

شرایط:
- برای ازدواج باید اول شریک داشته باشی
- برای بچه‌دار شدن باید متأهل باشی
`.trim()
}

function houseMenuText() {
  return `
🏠 <b>منوی خانه</b>

خانه روی پرستیژ و حس پیشرفت زندگی تو اثر دارد.

انتخاب‌ها:
🏚 اجاره خانه کوچک - 150,000 تومان
🏠 خرید خانه معمولی - 900,000 تومان
🏡 خرید ویلای شیک - 3,500,000 تومان
`.trim()
}

function carMenuText() {
  return `
🚗 <b>منوی ماشین</b>

ماشین یعنی کلاس، راحتی و پیشرفت.

انتخاب‌ها:
🚙 ماشین اقتصادی - 700,000 تومان
🚘 ماشین خوب - 2,000,000 تومان
🏎 ماشین لوکس - 6,000,000 تومان
`.trim()
}

function eduMenuText() {
  return `
🎓 <b>منوی تحصیل</b>

تحصیل باعث رشد تو می‌شود:
- XP بیشتر
- شغل‌های بهتر
- حس پیشرفت بیشتر

انتخاب‌ها:
📘 مدرسه - 80,000 تومان
🎓 دانشگاه - 400,000 تومان
🧠 دوره تخصصی - 900,000 تومان
`.trim()
}

function bankMenuText() {
  return `
🏦 <b>منوی بانک</b>

در بانک می‌تونی:
- پول نقدت را واریز کنی
- از حساب بانکی برداشت کنی
- وام بگیری
- بدهی را تسویه کنی

عملیات سریع بانکی در این نسخه مرحله‌ای هستند.
`.trim()
}

function bizMenuText() {
  return `
🏢 <b>منوی کسب‌وکار</b>

اگر پول و لِول کافی داشته باشی، می‌تونی کسب‌وکار بخری.

انتخاب‌ها:
🏪 مغازه کوچک - 1,500,000 تومان
🏬 فروشگاه متوسط - 5,000,000 تومان
🏭 شرکت بزرگ - 15,000,000 تومان

کسب‌وکار پرستیژ و درآمد بهتر می‌دهد.
`.trim()
}

function crimeMenuText() {
  return `
🕵️ <b>منوی جرم</b>

این بخش ریسک بالا و سود بالا دارد.
ممکن است:
- پول گیرت بیاید
- زخمی شوی
- زندانی شوی

انتخاب‌ها:
👜 کیف‌قاپی
🏪 دزدی از مغازه
🚨 تسلیم پلیس
`.trim()
}

function mafiaMenuText(user) {
  return `
🖤 <b>منوی مافیا</b>

وضعیت عضویت: <b>${user.mafia ? 'عضو هستی' : 'عضو نیستی'}</b>

اگر عضو مافیا شوی:
- مأموریت‌های خطرناک‌تر می‌گیری
- پول بیشتری می‌گیری
- احتمال زندان هم بیشتر می‌شود

انتخاب‌ها:
🤝 عضویت در مافیا
🎯 مأموریت مافیا
`.trim()
}

function hospitalText() {
  return `
🏥 <b>بیمارستان</b>

در اینجا می‌توانی:
- درمان کامل بگیری
- بخشی از انرژی برگردانی

درمان کامل: 120,000 تومان
`.trim()
}

// =========================
// CALLBACK HANDLERS
// =========================
async function renderMain(chatId, messageId, user) {
  const text = `
🌆 <b>ربات شبیه‌ساز زندگی</b>

به دنیای زندگی واقعی خوش اومدی.
اینجا باید:
- کار کنی
- پول دربیاری
- درس بخونی
- خانواده بسازی
- خانه و ماشین بخری
- اگر خواستی وارد جرم و مافیا بشی!

💵 واحد پول بازی: <b>تومان</b>

${profileText(user)}
`.trim()

  if (messageId) {
    return editMessage(chatId, messageId, text, { reply_markup: mainMenu() })
  }
  return sendMessage(chatId, text, { reply_markup: mainMenu() })
}

async function handleCallback(cq) {
  const data = cq.data
  const callbackId = cq.id
  const chatId = cq.message.chat.id
  const messageId = cq.message.message_id
  const user = getUser(cq.from.id, safeName(cq.from))

  clamp(user)

  if (data === 'back_main' || data === 'refresh_main' || data === 'profile') {
    await answerCallbackQuery(callbackId, 'به‌روزرسانی شد')
    return renderMain(chatId, messageId, user)
  }

  if (data === 'work_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, workMenuText(), {
      reply_markup: combineButtons([
        [{ text: '🔨 کارگری', callback_data: 'work_worker' }],
        [{ text: '🏢 کار اداری', callback_data: 'work_office' }],
        [{ text: '🚕 رانندگی', callback_data: 'work_driver' }],
        [{ text: '💻 فریلنسری', callback_data: 'work_freelance' }]
      ])
    })
  }

  if (data === 'fun_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, funMenuText(), {
      reply_markup: combineButtons([
        [{ text: '🎬 سینما', callback_data: 'fun_cinema' }],
        [{ text: '🎵 موسیقی', callback_data: 'fun_music' }],
        [{ text: '🌳 پارک', callback_data: 'fun_park' }],
        [{ text: '🛌 استراحت', callback_data: 'fun_rest' }]
      ])
    })
  }

  if (data === 'family_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, familyMenuText(), {
      reply_markup: combineButtons([
        [{ text: '📞 تماس با خانواده', callback_data: 'family_call' }],
        [{ text: '🍽 شام خانوادگی', callback_data: 'family_dinner' }],
        [{ text: '🎁 خرید هدیه', callback_data: 'family_gift' }],
        [{ text: '👶 وقت با بچه‌ها', callback_data: 'family_children' }]
      ])
    })
  }

  if (data === 'marriage_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, marriageMenuText(user), {
      reply_markup: combineButtons([
        [{ text: '💕 آشنایی با شریک', callback_data: 'marriage_partner' }],
        [{ text: '💒 ازدواج', callback_data: 'marriage_wed' }],
        [{ text: '👶 بچه‌دار شدن', callback_data: 'marriage_child' }]
      ])
    })
  }

  if (data === 'house_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, houseMenuText(), {
      reply_markup: combineButtons([
        [{ text: '🏚 اجاره خانه کوچک', callback_data: 'house_small' }],
        [{ text: '🏠 خرید خانه معمولی', callback_data: 'house_normal' }],
        [{ text: '🏡 خرید ویلای شیک', callback_data: 'house_villa' }]
      ])
    })
  }

  if (data === 'car_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, carMenuText(), {
      reply_markup: combineButtons([
        [{ text: '🚙 ماشین اقتصادی', callback_data: 'car_basic' }],
        [{ text: '🚘 ماشین خوب', callback_data: 'car_good' }],
        [{ text: '🏎 ماشین لوکس', callback_data: 'car_luxury' }]
      ])
    })
  }

  if (data === 'edu_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, eduMenuText(), {
      reply_markup: combineButtons([
        [{ text: '📘 مدرسه', callback_data: 'edu_school' }],
        [{ text: '🎓 دانشگاه', callback_data: 'edu_university' }],
        [{ text: '🧠 دوره تخصصی', callback_data: 'edu_special' }]
      ])
    })
  }

  if (data === 'bank_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, bankMenuText(), {
      reply_markup: combineButtons([
        [{ text: '🏦 واریز 50,000 تومان', callback_data: 'bank_deposit' }],
        [{ text: '💸 برداشت 50,000 تومان', callback_data: 'bank_withdraw' }],
        [{ text: '💳 دریافت وام 200,000 تومان', callback_data: 'bank_loan' }],
        [{ text: '✅ پرداخت بدهی 100,000 تومان', callback_data: 'bank_pay_debt' }]
      ])
    })
  }

  if (data === 'biz_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, bizMenuText(), {
      reply_markup: combineButtons([
        [{ text: '🏪 مغازه کوچک', callback_data: 'biz_small' }],
        [{ text: '🏬 فروشگاه متوسط', callback_data: 'biz_medium' }],
        [{ text: '🏭 شرکت بزرگ', callback_data: 'biz_big' }]
      ])
    })
  }

  if (data === 'crime_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, crimeMenuText(), {
      reply_markup: combineButtons([
        [{ text: '👜 کیف‌قاپی', callback_data: 'crime_pickpocket' }],
        [{ text: '🏪 دزدی از مغازه', callback_data: 'crime_shop' }],
        [{ text: '🚨 تسلیم پلیس', callback_data: 'crime_surrender' }]
      ])
    })
  }

  if (data === 'mafia_menu') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, mafiaMenuText(user), {
      reply_markup: combineButtons([
        [{ text: '🤝 عضویت در مافیا', callback_data: 'mafia_join' }],
        [{ text: '🎯 مأموریت مافیا', callback_data: 'mafia_mission' }]
      ])
    })
  }

  if (data === 'hospital') {
    await answerCallbackQuery(callbackId)
    return editMessage(chatId, messageId, hospitalText(), {
      reply_markup: combineButtons([
        [{ text: '💉 درمان کامل', callback_data: 'hospital_heal' }]
      ])
    })
  }

  // =========================
  // WORK
  // =========================
  if (data.startsWith('work_')) {
    const allowed = canAct(user)
    if (!allowed.ok) {
      await answerCallbackQuery(callbackId, allowed.msg)
      return
    }

    const left = cooldownLeft(user.lastWork, 60)
    if (left > 0) {
      await answerCallbackQuery(callbackId, `⏳ ${prettyCooldown(left)} دیگر صبر کن`)
      return
    }

    let income = 0
    let xp = 0
    let text = ''

    if (data === 'work_worker') {
      income = 80000 + Math.floor(Math.random() * 50000)
      xp = 12
      user.job = 'کارگر'
      applyNeedDecay(user, 20, 8, 4)
      text = `🔨 امروز کارگری کردی و <b>${formatMoney(income)}</b> درآمد داشتی.`
    }

    if (data === 'work_office') {
      income = 120000 + Math.floor(Math.random() * 70000)
      xp = 16
      user.job = 'کارمند اداری'
      applyNeedDecay(user, 15, 3, 2)
      text = `🏢 در کار اداری امروز <b>${formatMoney(income)}</b> حقوق گرفتی.`
    }

    if (data === 'work_driver') {
      income = 150000 + Math.floor(Math.random() * 90000)
      xp = 18
      user.job = 'راننده'
      applyNeedDecay(user, 18, 5, 3)
      text = `🚕 با رانندگی امروز <b>${formatMoney(income)}</b> درآوردی.`
    }

    if (data === 'work_freelance') {
      income = 180000 + Math.floor(Math.random() * 120000)
      xp = 20
      user.job = 'فریلنسر'
      applyNeedDecay(user, 12, 2, 1)
      text = `💻 پروژه فریلنسری انجام دادی و <b>${formatMoney(income)}</b> گرفتی.`
    }

    user.money += income
    addXP(user, xp)
    user.lastWork = Date.now()
    clamp(user)

    await answerCallbackQuery(callbackId, 'کار انجام شد')
    return editMessage(chatId, messageId, `
${text}

⭐ XP دریافتی: <b>${xp}</b>
❤️ سلامتی: <b>${user.health}</b>
⚡ انرژی: <b>${user.energy}</b>
😄 خوشحالی: <b>${user.happiness}</b>

💵 پول نقد فعلی: <b>${formatMoney(user.money)}</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '💼 دوباره منوی کار', callback_data: 'work_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  // =========================
  // FUN
  // =========================
  if (data.startsWith('fun_')) {
    const left = cooldownLeft(user.lastFun, 45)
    if (left > 0) {
      await answerCallbackQuery(callbackId, `⏳ ${prettyCooldown(left)} دیگر صبر کن`)
      return
    }

    let cost = 0
    let hp = 0
    let en = 0
    let happy = 0
    let xp = 0
    let text = ''

    if (data === 'fun_cinema') {
      cost = 40000
      hp = 3
      en = 8
      happy = 18
      xp = 5
      text = '🎬 رفتی سینما و حسابی حالت خوب شد.'
    }

    if (data === 'fun_music') {
      cost = 15000
      hp = 2
      en = 5
      happy = 12
      xp = 4
      text = '🎵 موسیقی گوش دادی و آروم شدی.'
    }

    if (data === 'fun_park') {
      cost = 10000
      hp = 6
      en = 10
      happy = 14
      xp = 4
      text = '🌳 رفتی پارک و هوای تازه خوردی.'
    }

    if (data === 'fun_rest') {
      cost = 0
      hp = 4
      en = 20
      happy = 8
      xp = 3
      text = '🛌 کمی استراحت کردی و جون گرفتی.'
    }

    if (user.money < cost) {
      await answerCallbackQuery(callbackId, 'پولت کافی نیست')
      return
    }

    user.money -= cost
    user.health += hp
    user.energy += en
    user.happiness += happy
    addXP(user, xp)
    user.lastFun = Date.now()
    clamp(user)

    await answerCallbackQuery(callbackId, 'تفریح انجام شد')
    return editMessage(chatId, messageId, `
${text}

💸 هزینه: <b>${formatMoney(cost)}</b>
❤️ سلامتی: <b>+${hp}</b>
⚡ انرژی: <b>+${en}</b>
😄 خوشحالی: <b>+${happy}</b>
⭐ XP: <b>+${xp}</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '🎉 دوباره منوی تفریح', callback_data: 'fun_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  // =========================
  // FAMILY
  // =========================
  if (data.startsWith('family_')) {
    const left = cooldownLeft(user.lastFamily, 60)
    if (left > 0) {
      await answerCallbackQuery(callbackId, `⏳ ${prettyCooldown(left)} دیگر صبر کن`)
      return
    }

    let cost = 0
    let family = 0
    let happy = 0
    let hp = 0
    let text = ''

    if (data === 'family_call') {
      family = 10
      happy = 6
      text = '📞 با خانواده تماس گرفتی و حال همه را پرسیدی.'
    }

    if (data === 'family_dinner') {
      cost = 70000
      family = 18
      happy = 10
      hp = 4
      text = '🍽 یک شام گرم خانوادگی داشتی.'
    }

    if (data === 'family_gift') {
      cost = 120000
      family = 20
      happy = 8
      text = '🎁 برای خانواده هدیه خریدی.'
    }

    if (data === 'family_children') {
      if (user.children <= 0) {
        await answerCallbackQuery(callbackId, 'فعلاً بچه‌ای نداری')
        return
      }
      family = 16
      happy = 12
      text = '👶 با بچه‌ها وقت گذراندی.'
    }

    if (user.money < cost) {
      await answerCallbackQuery(callbackId, 'پولت کافی نیست')
      return
    }

    user.money -= cost
    user.familyLove += family
    user.happiness += happy
    user.health += hp
    addXP(user, 6)
    user.lastFamily = Date.now()
    clamp(user)

    await answerCallbackQuery(callbackId, 'خانواده خوشحال شد')
    return editMessage(chatId, messageId, `
${text}

❤️‍🔥 عشق خانوادگی: <b>+${family}</b>
😄 خوشحالی: <b>+${happy}</b>
❤️ سلامتی: <b>+${hp}</b>
💸 هزینه: <b>${formatMoney(cost)}</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '👨‍👩‍👧 دوباره منوی خانواده', callback_data: 'family_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  // =========================
  // MARRIAGE
  // =========================
  if (data === 'marriage_partner') {
    if (user.partner) {
      await answerCallbackQuery(callbackId, 'قبلاً شریک پیدا کرده‌ای')
      return
    }
    const names = ['سارا', 'نگار', 'مهسا', 'آرین', 'آتنا', 'پارسا', 'نیکی']
    const partner = names[Math.floor(Math.random() * names.length)]
    user.partner = partner
    user.happiness += 10
    user.familyLove += 8
    clamp(user)

    await answerCallbackQuery(callbackId, 'شریک پیدا شد')
    return editMessage(chatId, messageId, `
💕 با <b>${partner}</b> آشنا شدی.
رابطه‌ات شروع شد و زندگی‌ات رنگ گرفت.
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '💒 ازدواج', callback_data: 'marriage_wed' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  if (data === 'marriage_wed') {
    if (user.married) {
      await answerCallbackQuery(callbackId, 'تو قبلاً ازدواج کرده‌ای')
      return
    }
    if (!user.partner) {
      await answerCallbackQuery(callbackId, 'اول باید شریک پیدا کنی')
      return
    }
    if (user.money < 500000) {
      await answerCallbackQuery(callbackId, 'برای مراسم حداقل 500,000 تومان لازم داری')
      return
    }

    user.money -= 500000
    user.married = true
    user.familyLove += 20
    user.happiness += 20
    addXP(user, 25)
    clamp(user)

    await answerCallbackQuery(callbackId, 'ازدواج انجام شد')
    return editMessage(chatId, messageId, `
💒 تو با <b>${user.partner}</b> ازدواج کردی!

💸 هزینه مراسم: <b>${formatMoney(500000)}</b>
😄 خوشحالی: <b>+20</b>
❤️‍🔥 عشق خانوادگی: <b>+20</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '👶 بچه‌دار شدن', callback_data: 'marriage_child' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  if (data === 'marriage_child') {
    if (!user.married) {
      await answerCallbackQuery(callbackId, 'اول باید ازدواج کنی')
      return
    }
    if (user.money < 300000) {
      await answerCallbackQuery(callbackId, 'برای بچه‌دار شدن حداقل 300,000 تومان لازم داری')
      return
    }

    user.money -= 300000
    user.children += 1
    user.familyLove += 15
    user.happiness += 18
    addXP(user, 20)
    clamp(user)

    await answerCallbackQuery(callbackId, 'بچه‌دار شدی')
    return editMessage(chatId, messageId, `
👶 تبریک! خانواده‌ات بزرگ‌تر شد.

تعداد بچه‌ها: <b>${user.children}</b>
💸 هزینه: <b>${formatMoney(300000)}</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  // =========================
  // HOUSE
  // =========================
  if (data === 'house_small' || data === 'house_normal' || data === 'house_villa') {
    let price = 0
    let title = ''

    if (data === 'house_small') {
      price = 150000
      title = 'خانه کوچک'
    }
    if (data === 'house_normal') {
      price = 900000
      title = 'خانه معمولی'
    }
    if (data === 'house_villa') {
      price = 3500000
      title = 'ویلای شیک'
    }

    if (user.money < price) {
      await answerCallbackQuery(callbackId, 'پولت کافی نیست')
      return
    }

    user.money -= price
    user.house = title
    user.happiness += 10
    user.familyLove += 8
    addXP(user, 18)
    clamp(user)

    await answerCallbackQuery(callbackId, 'خانه خریدی')
    return editMessage(chatId, messageId, `
🏠 تو حالا صاحب <b>${title}</b> شدی.

💸 هزینه: <b>${formatMoney(price)}</b>
😄 خوشحالی: <b>+10</b>
❤️‍🔥 عشق خانوادگی: <b>+8</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '🏠 دوباره منوی خانه', callback_data: 'house_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  // =========================
  // CAR
  // =========================
  if (data === 'car_basic' || data === 'car_good' || data === 'car_luxury') {
    let price = 0
    let title = ''

    if (data === 'car_basic') {
      price = 700000
      title = 'ماشین اقتصادی'
    }
    if (data === 'car_good') {
      price = 2000000
      title = 'ماشین خوب'
    }
    if (data === 'car_luxury') {
      price = 6000000
      title = 'ماشین لوکس'
    }

    if (user.money < price) {
      await answerCallbackQuery(callbackId, 'پولت کافی نیست')
      return
    }

    user.money -= price
    user.car = title
    user.happiness += 12
    addXP(user, 16)
    clamp(user)

    await answerCallbackQuery(callbackId, 'ماشین خریدی')
    return editMessage(chatId, messageId, `
🚗 تو یک <b>${title}</b> خریدی.

💸 هزینه: <b>${formatMoney(price)}</b>
😄 خوشحالی: <b>+12</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '🚗 دوباره منوی ماشین', callback_data: 'car_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  // =========================
  // EDUCATION
  // =========================
  if (data === 'edu_school' || data === 'edu_university' || data === 'edu_special') {
    const left = cooldownLeft(user.lastStudy, 80)
    if (left > 0) {
      await answerCallbackQuery(callbackId, `⏳ ${prettyCooldown(left)} دیگر صبر کن`)
      return
    }

    let price = 0
    let title = ''
    let xp = 0

    if (data === 'edu_school') {
      price = 80000
      title = 'مدرسه‌رفته'
      xp = 14
    }
    if (data === 'edu_university') {
      price = 400000
      title = 'دانشگاهی'
      xp = 28
    }
    if (data === 'edu_special') {
      price = 900000
      title = 'متخصص'
      xp = 42
    }

    if (user.money < price) {
      await answerCallbackQuery(callbackId, 'پولت کافی نیست')
      return
    }

    user.money -= price
    user.education = title
    user.happiness += 4
    addXP(user, xp)
    user.lastStudy = Date.now()
    clamp(user)

    await answerCallbackQuery(callbackId, 'تحصیل انجام شد')
    return editMessage(chatId, messageId, `
🎓 وضعیت تحصیلی تو حالا <b>${title}</b> است.

💸 هزینه: <b>${formatMoney(price)}</b>
⭐ XP: <b>+${xp}</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '🎓 دوباره منوی تحصیل', callback_data: 'edu_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  // =========================
  // BANK
  // =========================
  if (data === 'bank_deposit') {
    const amount = Math.min(50000, user.money)
    if (amount <= 0) {
      await answerCallbackQuery(callbackId, 'پول نقد کافی نداری')
      return
    }
    user.money -= amount
    user.bank += amount
    clamp(user)

    await answerCallbackQuery(callbackId, 'واریز انجام شد')
    return editMessage(chatId, messageId, `
🏦 <b>واریز موفق</b>

💸 مبلغ واریز: <b>${formatMoney(amount)}</b>
💵 پول نقد: <b>${formatMoney(user.money)}</b>
🏦 موجودی بانک: <b>${formatMoney(user.bank)}</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '🏦 دوباره منوی بانک', callback_data: 'bank_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  if (data === 'bank_withdraw') {
    const amount = Math.min(50000, user.bank)
    if (amount <= 0) {
      await answerCallbackQuery(callbackId, 'پول کافی در بانک نداری')
      return
    }
    user.bank -= amount
    user.money += amount
    clamp(user)

    await answerCallbackQuery(callbackId, 'برداشت انجام شد')
    return editMessage(chatId, messageId, `
💸 <b>برداشت موفق</b>

💰 مبلغ برداشت: <b>${formatMoney(amount)}</b>
💵 پول نقد: <b>${formatMoney(user.money)}</b>
🏦 موجودی بانک: <b>${formatMoney(user.bank)}</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '🏦 دوباره منوی بانک', callback_data: 'bank_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  if (data === 'bank_loan') {
    user.money += 200000
    user.debt += 240000
    clamp(user)

    await answerCallbackQuery(callbackId, 'وام دریافت شد')
    return editMessage(chatId, messageId, `
💳 <b>وام دریافت کردی</b>

💵 مبلغ وام: <b>${formatMoney(200000)}</b>
📉 بدهی جدید: <b>${formatMoney(240000)}</b>

نکته: سود وام روی بدهی اعمال شده.
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '🏦 دوباره منوی بانک', callback_data: 'bank_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  if (data === 'bank_pay_debt') {
    const amount = Math.min(100000, user.money, user.debt)
    if (amount <= 0) {
      await answerCallbackQuery(callbackId, 'نه بدهی داری نه پول کافی')
      return
    }

    user.money -= amount
    user.debt -= amount
    clamp(user)

    await answerCallbackQuery(callbackId, 'بدهی پرداخت شد')
    return editMessage(chatId, messageId, `
✅ <b>بخشی از بدهی پرداخت شد</b>

💸 مبلغ پرداختی: <b>${formatMoney(amount)}</b>
📉 بدهی باقی‌مانده: <b>${formatMoney(user.debt)}</b>
`.trim(), {
      reply_markup: combineButtons([
        [{ text: '🏦 دوباره منوی بانک', callback_data: 'bank_menu' }],
        [{ text: '📊 پروفایل', callback_data: 'profile' }]
      ])
    })
  }

  // =========================
  // BUSINES
