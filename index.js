require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

/* =========================
   CONFIG
========================= */
const CONFIG = {
  TOKEN: process.env.BOT_TOKEN,
  PORT: process.env.PORT || 3000,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  BOT_USERNAME: process.env.BOT_USERNAME || '',
  ADMIN_IDS: (process.env.ADMIN_IDS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean),

  DATA_DIR: path.join(process.cwd(), 'data'),
  USERS_FILE: path.join(process.cwd(), 'data', 'users.json'),
  META_FILE: path.join(process.cwd(), 'data', 'meta.json'),
  ADMIN_LOG_FILE: path.join(process.cwd(), 'data', 'admin.log'),
  ERROR_LOG_FILE: path.join(process.cwd(), 'data', 'error.log')
};

if (!CONFIG.TOKEN) {
  console.error('BOT_TOKEN تنظیم نشده');
  process.exit(1);
}

/* =========================
   HELPERS
========================= */
function now() {
  return Date.now();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.floor(n || 0));
}

function isNumeric(v) {
  return /^-?\d+$/.test(String(v));
}

function safeJsonParse(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function formatDuration(ms) {
  if (ms <= 0) return '0ث';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const parts = [];
  if (d) parts.push(`${d}روز`);
  if (h) parts.push(`${h}ساعت`);
  if (m) parts.push(`${m}دقیقه`);
  if (sec && parts.length < 2) parts.push(`${sec}ث`);
  return parts.join(' ');
}

function parseCommand(text = '') {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].replace('/', '').split('@')[0].toLowerCase();
  return { cmd, args: parts.slice(1) };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureFile(file, defaultContent = '') {
  if (!fs.existsSync(file)) fs.writeFileSync(file, defaultContent, 'utf8');
}

function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}

function appendLog(file, text) {
  ensureFile(file, '');
  fs.appendFileSync(file, text + '\n', 'utf8');
}

function logAdmin(text) {
  appendLog(CONFIG.ADMIN_LOG_FILE, `[${new Date().toISOString()}] ${text}`);
}

function logError(err, context = '') {
  const msg = err?.stack || err?.message || String(err);
  appendLog(CONFIG.ERROR_LOG_FILE, `[${new Date().toISOString()}] ${context} ${msg}`);
}

function isAdmin(userId) {
  return CONFIG.ADMIN_IDS.includes(String(userId));
}

/* =========================
   STORAGE
========================= */
const state = {
  users: {},
  meta: {
    createdAt: now(),
    updatedAt: now(),
    totalUsers: 0
  }
};

function ensureDataFiles() {
  ensureDir(CONFIG.DATA_DIR);
  ensureFile(CONFIG.USERS_FILE, '{}');
  ensureFile(CONFIG.META_FILE, JSON.stringify(state.meta, null, 2));
  ensureFile(CONFIG.ADMIN_LOG_FILE, '');
  ensureFile(CONFIG.ERROR_LOG_FILE, '');
}

function loadData() {
  try {
    ensureDataFiles();
    state.users = safeJsonParse(fs.readFileSync(CONFIG.USERS_FILE, 'utf8'), {});
    state.meta = safeJsonParse(fs.readFileSync(CONFIG.META_FILE, 'utf8'), state.meta);
    state.meta.totalUsers = Object.keys(state.users).length;
  } catch (err) {
    logError(err, 'loadData');
  }
}

function saveData() {
  try {
    ensureDataFiles();
    state.meta.updatedAt = now();
    state.meta.totalUsers = Object.keys(state.users).length;

    atomicWrite(CONFIG.USERS_FILE, JSON.stringify(state.users, null, 2));
    atomicWrite(CONFIG.META_FILE, JSON.stringify(state.meta, null, 2));
  } catch (err) {
    logError(err, 'saveData');
  }
}

function startAutosave(intervalMs = 30000) {
  setInterval(() => {
    try {
      saveData();
    } catch (err) {
      logError(err, 'autosave');
    }
  }, intervalMs).unref();
}

function getUser(id) {
  const key = String(id);

  if (!state.users[key]) {
    state.users[key] = {
      id: key,
      username: '',
      firstName: '',
      coins: 500,
      bank: 0,
      level: 1,
      xp: 0,
      health: 100,
      happiness: 100,
      hunger: 100,
      energy: 100,
      banned: false,
      banReason: '',
      createdAt: now(),
      updatedAt: now(),
      lastActionAt: 0,
      cooldowns: {},
      stats: {
        work: 0,
        fun: 0,
        family: 0,
        marriage: 0,
        house: 0,
        car: 0,
        education: 0,
        bank: 0,
        business: 0,
        crime: 0,
        mafia: 0,
        hospital: 0
      },
      _spam: {}
    };
  }

  state.users[key].updatedAt = now();
  return state.users[key];
}

/* =========================
   TELEGRAM API
========================= */
async function tg(method, data) {
  const res = await fetch(`https://api.telegram.org/bot${CONFIG.TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

function sendMessage(chatId, text, reply_markup = undefined, parse_mode = undefined) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup,
    parse_mode
  });
}

function editMessageText(chatId, messageId, text, reply_markup = undefined, parse_mode = undefined) {
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup,
    parse_mode
  });
}

function answerCallbackQuery(callbackQueryId, text = undefined, show_alert = false) {
  return tg('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert
  });
}

function setWebhook(url) {
  return tg('setWebhook', { url });
}

/* =========================
   MENUS
========================= */
function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '💼 کار', callback_data: 'game:work' }, { text: '🎉 سرگرمی', callback_data: 'game:fun' }],
      [{ text: '👨‍👩‍👧 خانواده', callback_data: 'game:family' }, { text: '💍 ازدواج', callback_data: 'game:marriage' }],
      [{ text: '🏠 خانه', callback_data: 'game:house' }, { text: '🚗 ماشین', callback_data: 'game:car' }],
      [{ text: '🎓 آموزش', callback_data: 'game:education' }, { text: '🏦 بانک', callback_data: 'game:bank' }],
      [{ text: '🏢 بیزینس', callback_data: 'game:business' }, { text: '🕵️ جرم', callback_data: 'game:crime' }],
      [{ text: '👑 مافیا', callback_data: 'game:mafia' }, { text: '🏥 بیمارستان', callback_data: 'game:hospital' }],
      [{ text: '👤 پروفایل', callback_data: 'game:profile' }]
    ]
  };
}

function adminMenu() {
  return {
    inline_keyboard: [
      [{ text: '📊 آمار', callback_data: 'admin:stats' }],
      [{ text: 'راهنما', callback_data: 'admin:help' }]
    ]
  };
}

/* =========================
   COOLDOWNS / ANTI SPAM
========================= */
const COOLDOWNS = {
  work: 60 * 1000,
  fun: 30 * 1000,
  family: 5 * 60 * 1000,
  marriage: 10 * 60 * 1000,
  house: 15 * 60 * 1000,
  car: 15 * 60 * 1000,
  education: 20 * 60 * 1000,
  bank: 2 * 60 * 1000,
  business: 5 * 60 * 1000,
  crime: 3 * 60 * 1000,
  mafia: 10 * 60 * 1000,
  hospital: 2 * 60 * 1000
};

function checkCooldown(user, action) {
  const cd = COOLDOWNS[action];
  if (!cd) return { ok: true };

  const last = user.cooldowns?.[action] || 0;
  const diff = now() - last;

  if (diff < cd) {
    return {
      ok: false,
      text: `⏳ باید ${formatDuration(cd - diff)} صبر کنی.`
    };
  }

  return { ok: true };
}

function setCooldown(user, action) {
  user.cooldowns ||= {};
  user.cooldowns[action] = now();
}

function checkSpam(user, key = 'callback', limit = 500) {
  user._spam ||= {};
  const last = user._spam[key] || 0;
  const diff = now() - last;
  user._spam[key] = now();
  return diff < limit;
}

/* =========================
   GAME ACTIONS
========================= */
function runWork(user) {
  const cd = checkCooldown(user, 'work');
  if (!cd.ok) return cd;

  const gain = Math.floor(100 + Math.random() * 400);
  user.coins += gain;
  user.xp += 10;
  user.energy = clamp(user.energy - 10, 0, 100);
  user.happiness = clamp(user.happiness - 2, 0, 100);
  user.stats.work++;
  user.lastActionAt = now();
  setCooldown(user, 'work');
  saveData();

  return { ok: true, text: `💼 کار کردی و ${formatNumber(gain)} کوین گرفتی.` };
}

function runFun(user) {
  const cd = checkCooldown(user, 'fun');
  if (!cd.ok) return cd;

  const cost = 50;
  if (user.coins < cost) return { ok: false, text: `❌ برای سرگرمی ${formatNumber(cost)} کوین نیاز داری.` };

  user.coins -= cost;
  user.happiness = clamp(user.happiness + 12, 0, 100);
  user.energy = clamp(user.energy + 3, 0, 100);
  user.stats.fun++;
  user.lastActionAt = now();
  setCooldown(user, 'fun');
  saveData();

  return { ok: true, text: `🎉 خوش گذروندی. ${formatNumber(cost)} کوین خرج شد.` };
}

function runFamily(user) {
  const cd = checkCooldown(user, 'family');
  if (!cd.ok) return cd;

  user.happiness = clamp(user.happiness + 10, 0, 100);
  user.energy = clamp(user.energy - 5, 0, 100);
  user.stats.family++;
  user.lastActionAt = now();
  setCooldown(user, 'family');
  saveData();

  return { ok: true, text: `👨‍👩‍👧 با خانواده وقت گذراندی و حالت بهتر شد.` };
}

function runMarriage(user) {
  const cd = checkCooldown(user, 'marriage');
  if (!cd.ok) return cd;

  user.happiness = clamp(user.happiness + 5, 0, 100);
  user.stats.marriage++;
  user.lastActionAt = now();
  setCooldown(user, 'marriage');
  saveData();

  return { ok: true, text: `💍 بخش ازدواج فعلاً در حالت ساده فعال است.` };
}

function runHouse(user) {
  const cd = checkCooldown(user, 'house');
  if (!cd.ok) return cd;

  user.stats.house++;
  user.lastActionAt = now();
  setCooldown(user, 'house');
  saveData();

  return { ok: true, text: `🏠 بخش خانه فعال شد.` };
}

function runCar(user) {
  const cd = checkCooldown(user, 'car');
  if (!cd.ok) return cd;

  user.stats.car++;
  user.lastActionAt = now();
  setCooldown(user, 'car');
  saveData();

  return { ok: true, text: `🚗 بخش ماشین فعال شد.` };
}

function runEducation(user) {
  const cd = checkCooldown(user, 'education');
  if (!cd.ok) return cd;

  user.xp += 20;
  user.energy = clamp(user.energy - 5, 0, 100);
  user.stats.education++;
  user.lastActionAt = now();
  setCooldown(user, 'education');
  saveData();

  return { ok: true, text: `🎓 درس خواندی و 20 XP گرفتی.` };
}

function runBank(user) {
  const cd = checkCooldown(user, 'bank');
  if (!cd.ok) return cd;

  const amount = Math.floor(Math.min(user.coins, 200));
  if (amount <= 0) return { ok: false, text: '🏦 پولی برای واریز به بانک نداری.' };

  user.coins -= amount;
  user.bank += amount;
  user.stats.bank++;
  user.lastActionAt = now();
  setCooldown(user, 'bank');
  saveData();

  return { ok: true, text: `🏦 مبلغ ${formatNumber(amount)} کوین به بانک واریز شد.` };
}

function runBusiness(user) {
  const cd = checkCooldown(user, 'business');
  if (!cd.ok) return cd;

  if (user.coins < 200) return { ok: false, text: '🏢 برای بیزینس حداقل 200 کوین نیاز داری.' };

  const gain = Math.floor(50 + Math.random() * 250);
  user.coins += gain;
  user.stats.business++;
  user.lastActionAt = now();
  setCooldown(user, 'business');
  saveData();

  return { ok: true, text: `🏢 از بیزینست ${formatNumber(gain)} کوین سود کردی.` };
}

function runCrime(user) {
  const cd = checkCooldown(user, 'crime');
  if (!cd.ok) return cd;

  const success = Math.random() < 0.6;
  const amount = Math.floor(100 + Math.random() * 500);

  if (success) {
    user.coins += amount;
  } else {
    user.coins = Math.max(0, user.coins - Math.floor(amount / 2));
    user.health = clamp(user.health - 10, 0, 100);
  }

  user.stats.crime++;
  user.lastActionAt = now();
  setCooldown(user, 'crime');
  saveData();

  return {
    ok: true,
    text: success
      ? `🕵️ جرم موفق بود و ${formatNumber(amount)} کوین به دست آوردی.`
      : `🚨 گیر افتادی و جریمه شدی.`
  };
}

function runMafia(user) {
  const cd = checkCooldown(user, 'mafia');
  if (!cd.ok) return cd;

  const success = Math.random() < 0.45;
  const amount = Math.floor(300 + Math.random() * 1000);

  if (success) {
    user.coins += amount;
    user.happiness = clamp(user.happiness + 5, 0, 100);
  } else {
    user.coins = Math.max(0, user.coins - Math.floor(amount / 3));
    user.health = clamp(user.health - 20, 0, 100);
  }

  user.stats.mafia++;
  user.lastActionAt = now();
  setCooldown(user, 'mafia');
  saveData();

  return {
    ok: true,
    text: success
      ? `👑 عملیات مافیا موفق شد و ${formatNumber(amount)} کوین گرفتی.`
      : `💥 عملیات مافیا شکست خورد و آسیب دیدی.`
  };
}

function runHospital(user) {
  const cd = checkCooldown(user, 'hospital');
  if (!cd.ok) return cd;

  const cost = 100;
  if (user.coins < cost) return { ok: false, text: `🏥 برای درمان ${formatNumber(cost)} کوین نیاز داری.` };

  user.coins -= cost;
  user.health = clamp(user.health + 25, 0, 100);
  user.stats.hospital++;
  user.lastActionAt = now();
  setCooldown(user, 'hospital');
  saveData();

  return { ok: true, text: `🏥 درمان شدی و ${formatNumber(cost)} کوین پرداخت کردی.` };
}

function getProfileText(user) {
  return [
    `👤 پروفایل ${user.firstName || 'کاربر'}`,
    ``,
    `💰 کوین: ${formatNumber(user.coins)}`,
    `🏦 بانک: ${formatNumber(user.bank)}`,
    `⭐ سطح: ${formatNumber(user.level)}`,
    `🧠 XP: ${formatNumber(user.xp)}`,
    `❤️ سلامتی: ${formatNumber(user.health)}`,
    `😄 خوشحالی: ${formatNumber(user.happiness)}`,
    `🍔 گرسنگی: ${formatNumber(user.hunger)}`,
    `⚡ انرژی: ${formatNumber(user.energy)}`
  ].join('\n');
}

/* =========================
   ADMIN COMMANDS
========================= */
async function handleAdminCommand(msg, user, cmd, args) {
  const chatId = msg.chat.id;

  if (!isAdmin(user.id)) {
    return sendMessage(chatId, '⛔️ شما ادمین نیستی.');
  }

  if (cmd === 'stats') {
    const totalUsers = Object.keys(state.users).length;
    return sendMessage(chatId, `📊 آمار ربات\n\n👥 تعداد کاربران: ${formatNumber(totalUsers)}`);
  }

  if (cmd === 'admin') {
    return sendMessage(
      chatId,
      [
        '👮 پنل ادمین',
        '',
        '/stats',
        '/givecoins USER_ID AMOUNT',
        '/takecoins USER_ID AMOUNT',
        '/setcoins USER_ID AMOUNT',
        '/ban USER_ID دلیل',
        '/unban USER_ID'
      ].join('\n'),
      adminMenu()
    );
  }

  const targetId = args[0];
  if (!targetId || !isNumeric(targetId)) {
    return sendMessage(chatId, '❗️ آیدی عددی کاربر را درست وارد کن.');
  }

  const target = getUser(targetId);

  if (cmd === 'givecoins') {
    const amount = Number(args[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return sendMessage(chatId, '❗️ مقدار نامعتبر است.');
    }
    target.coins += Math.floor(amount);
    saveData();
    logAdmin(`givecoins by ${user.id} to ${targetId} amount=${amount}`);
    return sendMessage(chatId, `✅ ${formatNumber(amount)} کوین به ${targetId} داده شد.`);
  }

  if (cmd === 'takecoins') {
    const amount = Number(args[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return sendMessage(chatId, '❗️ مقدار نامعتبر است.');
    }
    target.coins = Math.max(0, target.coins - Math.floor(amount));
    saveData();
    logAdmin(`takecoins by ${user.id} from ${targetId} amount=${amount}`);
    return sendMessage(chatId, `✅ ${formatNumber(amount)} کوین از ${targetId} گرفته شد.`);
  }

  if (cmd === 'setcoins') {
    const amount = Number(args[1]);
    if (!Number.isFinite(amount) || amount < 0) {
      return sendMessage(chatId, '❗️ مقدار نامعتبر است.');
    }
    target.coins = Math.floor(amount);
    saveData();
    logAdmin(`setcoins by ${user.id} to ${targetId} amount=${amount}`);
    return sendMessage(chatId, `✅ کوین کاربر ${targetId} روی ${formatNumber(amount)} تنظیم شد.`);
  }

  if (cmd === 'ban') {
    const reason = args.slice(1).join(' ') || 'No reason';
    target.banned = true;
    target.banReason = reason;
    saveData();
    logAdmin(`ban by ${user.id} target=${targetId} reason=${reason}`);
    return sendMessage(chatId, `✅ کاربر ${targetId} بن شد.\n📝 دلیل: ${reason}`);
  }

  if (cmd === 'unban') {
    target.banned = false;
    target.banReason = '';
    saveData();
    logAdmin(`unban by ${user.id} target=${targetId}`);
    return sendMessage(chatId, `✅ کاربر ${targetId} آنبن شد.`);
  }

  return sendMessage(chatId, '❓ دستور ادمین نامعتبر است.');
}

/* =========================
   MESSAGE / CALLBACK
========================= */
async function onMessage(msg) {
  try {
    const chatId = msg.chat.id;
    const from = msg.from;
    if (!from) return;

    const user = getUser(from.id);
    user.username = from.username || user.username || '';
    user.firstName = from.first_name || user.firstName || '';

    if (user.banned) {
      return sendMessage(chatId, `🚫 شما بن هستی.\n📝 دلیل: ${user.banReason || 'نامشخص'}`);
    }

    if (!msg.text) return;

    const { cmd, args } = parseCommand(msg.text);

    if (cmd === 'start') {
      saveData();
      return sendMessage(
        chatId,
        `سلام ${user.firstName || 'دوست من'} 👋\n\nبه ربات شبیه‌ساز زندگی خوش اومدی.`,
        mainMenu()
      );
    }

    if (cmd === 'profile') {
      return sendMessage(chatId, getProfileText(user), mainMenu());
    }

    const adminCommands = ['admin', 'stats', 'givecoins', 'takecoins', 'setcoins', 'ban', 'unban'];
    if (adminCommands.includes(cmd)) {
      return handleAdminCommand(msg, user, cmd, args);
    }

    const actionMap = {
      work: runWork,
      fun: runFun,
      family: runFamily,
      marriage: runMarriage,
      house: runHouse,
      car: runCar,
      education: runEducation,
      bank: runBank,
      business: runBusiness,
      crime: runCrime,
      mafia: runMafia,
      hospital: runHospital
    };

    if (actionMap[cmd]) {
      const result = actionMap[cmd](user);
      return sendMessage(chatId, result.text, mainMenu());
    }

    return sendMessage(chatId, '❓ دستور ناشناخته است.', mainMenu());
  } catch (err) {
    logError(err, 'onMessage');
  }
}

async function onCallback(q) {
  try {
    const chatId = q.message.chat.id;
    const messageId = q.message.message_id;
    const user = getUser(q.from.id);

    if (checkSpam(user, 'callback')) {
      return answerCallbackQuery(q.id, 'خیلی سریع کلیک نکن.', false);
    }

    if (user.banned) {
      return answerCallbackQuery(q.id, 'شما بن هستی.', true);
    }

    const data = q.data || '';
    const [group, action] = data.split(':');

    if (group === 'admin') {
      if (!isAdmin(user.id)) {
        return answerCallbackQuery(q.id, 'شما ادمین نیستی.', true);
      }

      if (action === 'stats') {
        const totalUsers = Object.keys(state.users).length;
        await answerCallbackQuery(q.id, 'نمایش آمار', false);
        return editMessageText(
          chatId,
          messageId,
          `📊 آمار ربات\n\n👥 تعداد کاربران: ${formatNumber(totalUsers)}`,
          adminMenu()
        );
      }

      if (action === 'help') {
        await answerCallbackQuery(q.id, 'راهنما', false);
        return editMessageText(
          chatId,
          messageId,
          [
            '👮 راهنمای ادمین',
            '',
            '/stats',
            '/givecoins USER_ID AMOUNT',
            '/takecoins USER_ID AMOUNT',
            '/setcoins USER_ID AMOUNT',
            '/ban USER_ID دلیل',
            '/unban USER_ID'
          ].join('\n'),
          adminMenu()
        );
      }
    }

    if (group !== 'game') {
      return answerCallbackQuery(q.id, 'نامعتبر', false);
    }

    if (action === 'profile') {
      await answerCallbackQuery(q.id, 'پروفایل', false);
      return editMessageText(chatId, messageId, getProfileText(user), mainMenu());
    }

    const actionMap = {
      work: runWork,
      fun: runFun,
      family: runFamily,
      marriage: runMarriage,
      house: runHouse,
      car: runCar,
      education: runEducation,
      bank: runBank,
      business: runBusiness,
      crime: runCrime,
      mafia: runMafia,
      hospital: runHospital
    };

    const fn = actionMap[action];
    if (!fn) {
      return answerCallbackQuery(q.id, 'اکشن نامعتبر است.', false);
    }

    const result = fn(user);
    await answerCallbackQuery(q.id, result.text, true);
    return editMessageText(chatId, messageId, result.text, mainMenu());
  } catch (err) {
    logError(err, 'onCallback');
    try {
      await answerCallbackQuery(q.id, 'خطای داخلی', true);
    } catch {}
  }
}

/* =========================
   START SERVER
========================= */
async function start() {
  loadData();
  startAutosave(30000);

  process.on('unhandledRejection', err => logError(err, 'unhandledRejection'));
  process.on('uncaughtException', err => logError(err, 'uncaughtException'));
  process.on('SIGINT', () => {
    saveData();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    saveData();
    process.exit(0);
  });

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/', (_, res) => {
    res.send('OK');
  });

  app.post(`/webhook/${CONFIG.TOKEN}`, async (req, res) => {
    try {
      const update = req.body;
      res.sendStatus(200);

      if (update.message) await onMessage(update.message);
      if (update.callback_query) await onCallback(update.callback_query);
    } catch (err) {
      logError(err, 'webhook');
      try { res.sendStatus(200); } catch {}
    }
  });

  app.listen(CONFIG.PORT, async () => {
    console.log(`Bot running on port ${CONFIG.PORT}`);

    if (CONFIG.WEBHOOK_URL) {
      try {
        const webhook = `${CONFIG.WEBHOOK_URL}/webhook/${CONFIG.TOKEN}`;
        const result = await setWebhook(webhook);
        console.log('Webhook set:', result);
      } catch (err) {
        logError(err, 'setWebhook');
      }
    }
  });
}

start();
