import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

// =========================
// ENV
// =========================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("❌ Missing BOT_TOKEN env var");
  process.exit(1);
}

if (!SECRET_PATH) {
  console.error("❌ Missing SECRET_PATH env var");
  process.exit(1);
}

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

// =========================
// Helpers
// =========================
async function tg(method, payload) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    console.error("❌ Telegram API error:", method, res.status, data);
  }

  return data;
}

function now() {
  return Date.now();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatMoney(n) {
  const sign = n < 0 ? "-" : "";
  const value = Math.abs(Math.floor(n));
  return `${sign}${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}💰`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// =========================
// Game constants
// =========================
const JOBS = [
  { id: "jobless", name: "بیکار", reqEdu: 0, reqSkill: 0, salary: 0 },
  { id: "intern", name: "کارآموز", reqEdu: 0, reqSkill: 5, salary: 50 },
  { id: "clerk", name: "کارمند", reqEdu: 1, reqSkill: 15, salary: 150 },
  { id: "specialist", name: "متخصص", reqEdu: 2, reqSkill: 30, salary: 350 },
  { id: "manager", name: "مدیر", reqEdu: 3, reqSkill: 50, salary: 700 },
];

const EDUCATION = [
  { level: 0, name: "بدون مدرک", cost: 0, skillGain: 0 },
  { level: 1, name: "دیپلم", cost: 200, skillGain: 5 },
  { level: 2, name: "لیسانس", cost: 600, skillGain: 10 },
  { level: 3, name: "فوق‌لیسانس", cost: 1200, skillGain: 15 },
];

const SHOP = [
  { id: "coffee", name: "قهوه", cost: 20, energy: +15, health: 0, happiness: +3 },
  { id: "gym", name: "باشگاه", cost: 80, energy: -10, health: +10, happiness: +5 },
  { id: "meal", name: "غذای خوب", cost: 60, energy: +10, health: +6, happiness: +2 },
  { id: "game", name: "تفریح", cost: 50, energy: -5, health: 0, happiness: +10 },
];

const DAILY_COST = 15;
const WORK_ENERGY_COST = 18;
const STUDY_ENERGY_COST = 14;
const DAY_MS = 6 * 60 * 60 * 1000; // هر 6 ساعت = 1 روز بازی

const EVENT_POOL = [
  {
    title: "🎁 جایزه کوچک",
    text: "یک نفر ناشناس بهت جایزه داد!",
    effect: (s) => {
      s.money += 120;
      s.happiness = clamp(s.happiness + 5, 0, 100);
    },
  },
  {
    title: "🛠 خرج تعمیرات",
    text: "یه وسیله خراب شد و هزینه دادی.",
    effect: (s) => {
      s.money -= 90;
      s.happiness = clamp(s.happiness - 3, 0, 100);
    },
  },
  {
    title: "💪 انگیزه",
    text: "امروز خیلی پرانرژی هستی!",
    effect: (s) => {
      s.energy = clamp(s.energy + 15, 0, 100);
      s.skill = clamp(s.skill + 2, 0, 100);
    },
  },
  {
    title: "🤒 سرماخوردگی",
    text: "یه کم مریض شدی.",
    effect: (s) => {
      s.health = clamp(s.health - 12, 0, 100);
      s.energy = clamp(s.energy - 8, 0, 100);
    },
  },
];

// =========================
// Memory storage
// =========================
const users = new Map();

function defaultState(user) {
  const firstName = user?.first_name || "رفیق";

  return {
    id: user?.id || 0,
    firstName,

    createdAt: now(),
    lastTickAt: now(),

    day: 1,
    age: 18,

    money: 200,

    health: 80,
    energy: 80,
    happiness: 60,

    edu: 0,
    skill: 0,
    jobId: "jobless",

    family: {
      relation: 50,
    },

    bank: {
      balance: 0,
      debt: 0,
    },
  };
}

function getUser(user) {
  const id = user?.id;
  if (!id) return null;

  if (!users.has(id)) {
    users.set(id, defaultState(user));
  }

  const state = users.get(id);

  if (user?.first_name) {
    state.firstName = user.first_name;
  }

  return state;
}

function resetUser(user) {
  const id = user?.id;
  if (!id) return null;

  const fresh = defaultState(user);
  users.set(id, fresh);
  return fresh;
}

// =========================
// Basic getters
// =========================
function jobById(id) {
  return JOBS.find((j) => j.id === id) || JOBS[0];
}

function eduByLevel(level) {
  return EDUCATION.find((e) => e.level === level) || EDUCATION[0];
}

// =========================
// Daily progression
// =========================
function applyDailyTick(s) {
  const current = now();
  const elapsed = current - (s.lastTickAt || s.createdAt);

  if (elapsed < DAY_MS) {
    return { advanced: 0, events: [] };
  }

  const daysToAdvance = Math.floor(elapsed / DAY_MS);
  s.lastTickAt += daysToAdvance * DAY_MS;

  const events = [];

  for (let i = 0; i < daysToAdvance; i++) {
    s.day += 1;

    if (s.day % 30 === 0) {
      s.age += 1;
    }

    s.money -= DAILY_COST;

    s.energy = clamp(s.energy + 6, 0, 100);
    s.health = clamp(s.health + 1, 0, 100);
    s.happiness = clamp(s.happiness - 1, 0, 100);

    if (s.bank.debt > 0) {
      s.bank.debt = Math.floor(s.bank.debt * 1.01);
    }

    if (s.bank.balance > 0) {
      s.bank.balance = Math.floor(s.bank.balance * 1.003);
    }

    if (Math.random() < 0.25) {
      const ev = pick(EVENT_POOL);
      ev.effect(s);
      events.push(`${ev.title}\n${ev.text}`);
    }

    s.health = clamp(s.health, 0, 100);
    s.energy = clamp(s.energy, 0, 100);
    s.happiness = clamp(s.happiness, 0, 100);
    s.family.relation = clamp(s.family.relation, 0, 100);
  }

  return { advanced: daysToAdvance, events };
}

// =========================
// Game actions
// =========================
function canWork(s) {
  return s.energy >= WORK_ENERGY_COST && s.health > 10;
}

function doWork(s) {
  if (!canWork(s)) {
    return {
      ok: false,
      text: "❌ الان انرژی یا سلامت کافی برای کار نداری.",
    };
  }

  const job = jobById(s.jobId);
  const base = job.salary;
  const bonus = Math.floor((s.skill * 0.8 + s.happiness * 0.2) / 10);
  const pay = base + bonus;

  s.money += pay;
  s.energy = clamp(s.energy - WORK_ENERGY_COST, 0, 100);
  s.happiness = clamp(s.happiness - 2, 0, 100);
  s.skill = clamp(s.skill + 1, 0, 100);

  return {
    ok: true,
    text: `✅ کار کردی و ${formatMoney(pay)} درآمد داشتی.`,
  };
}

function canStudy(s) {
  return s.energy >= STUDY_ENERGY_COST && s.health > 10;
}

function startEducation(s, targetLevel) {
  const current = s.edu;

  if (targetLevel <= current) {
    return { ok: false, text: "❌ این مقطع رو قبلاً گرفتی." };
  }

  if (targetLevel !== current + 1) {
    return { ok: false, text: "❌ باید مقطع‌ها رو به ترتیب بگذرونی." };
  }

  const edu = eduByLevel(targetLevel);

  if (s.money < edu.cost) {
    return {
      ok: false,
      text: `❌ پولت کافی نیست. هزینه: ${formatMoney(edu.cost)}`,
    };
  }

  if (!canStudy(s)) {
    return {
      ok: false,
      text: "❌ الان انرژی یا سلامت کافی برای درس خوندن نداری.",
    };
  }

  s.money -= edu.cost;
  s.energy = clamp(s.energy - STUDY_ENERGY_COST, 0, 100);
  s.happiness = clamp(s.happiness - 1, 0, 100);
  s.skill = clamp(s.skill + edu.skillGain, 0, 100);
  s.edu = targetLevel;

  return {
    ok: true,
    text: `🎓 تبریک! مدرک «${edu.name}» رو گرفتی.`,
  };
}

function tryPromote(s) {
  const eligible = JOBS.filter((j) => s.edu >= j.reqEdu && s.skill >= j.reqSkill);
  const best = eligible[eligible.length - 1] || JOBS[0];

  if (best.id === s.jobId) {
    return {
      ok: false,
      text: "ℹ️ فعلاً شغل بهتری که شرایطش رو داشته باشی پیدا نشد.",
    };
  }

  s.jobId = best.id;
  s.happiness = clamp(s.happiness + 6, 0, 100);

  return {
    ok: true,
    text: `📈 ارتقاء گرفتی! شغل جدید: «${best.name}»`,
  };
}

function buyItem(s, itemId) {
  const item = SHOP.find((x) => x.id === itemId);

  if (!item) {
    return { ok: false, text: "❌ آیتم نامعتبره." };
  }

  if (s.money < item.cost) {
    return { ok: false, text: "❌ پولت کافی نیست." };
  }

  s.money -= item.cost;
  s.energy = clamp(s.energy + item.energy, 0, 100);
  s.health = clamp(s.health + item.health, 0, 100);
  s.happiness = clamp(s.happiness + item.happiness, 0, 100);

  return {
    ok: true,
    text: `✅ خریدی: ${item.name} (هزینه: ${formatMoney(item.cost)})`,
  };
}

function bankDeposit(s, amount) {
  amount = Math.floor(amount);

  if (amount <= 0) return { ok: false, text: "❌ مبلغ نامعتبره." };
  if (s.money < amount) return { ok: false, text: "❌ پول نقد کافی نداری." };

  s.money -= amount;
  s.bank.balance += amount;

  return {
    ok: true,
    text: `🏦 واریز شد: ${formatMoney(amount)}`,
  };
}

function bankWithdraw(s, amount) {
  amount = Math.floor(amount);

  if (amount <= 0) return { ok: false, text: "❌ مبلغ نامعتبره." };
  if (s.bank.balance < amount) return { ok: false, text: "❌ موجودی بانک کافی نیست." };

  s.bank.balance -= amount;
  s.money += amount;

  return {
    ok: true,
    text: `🏦 برداشت شد: ${formatMoney(amount)}`,
  };
}

function bankBorrow(s, amount) {
  amount = Math.floor(amount);

  if (amount <= 0) return { ok: false, text: "❌ مبلغ نامعتبره." };

  const limit = 2000 + s.edu * 1000 + s.skill * 20;

  if (s.bank.debt + amount > limit) {
    return {
      ok: false,
      text: `❌ سقف وام تو: ${formatMoney(limit)} | بدهی فعلی: ${formatMoney(s.bank.debt)}`,
    };
  }

  s.money += amount;
  s.bank.debt += amount;
  s.happiness = clamp(s.happiness + 2, 0, 100);

  return {
    ok: true,
    text: `💳 وام گرفتی: ${formatMoney(amount)} | بدهی: ${formatMoney(s.bank.debt)}`,
  };
}

function bankRepay(s, amount) {
  amount = Math.floor(amount);

  if (amount <= 0) return { ok: false, text: "❌ مبلغ نامعتبره." };
  if (s.money < amount) return { ok: false, text: "❌ پول نقد کافی نداری." };
  if (s.bank.debt <= 0) return { ok: false, text: "ℹ️ بدهی نداری." };

  const pay = Math.min(amount, s.bank.debt);

  s.money -= pay;
  s.bank.debt -= pay;
  s.happiness = clamp(s.happiness + 2, 0, 100);

  return {
    ok: true,
    text: `✅ پرداخت شد: ${formatMoney(pay)} | بدهی باقی: ${formatMoney(s.bank.debt)}`,
  };
}

// =========================
// New: Fun actions
// =========================
function doFun(s, type) {
  if (type === "movie") {
    const cost = 40;
    if (s.money < cost) {
      return { ok: false, text: "❌ پولت برای فیلم کافی نیست." };
    }

    s.money -= cost;
    s.happiness = clamp(s.happiness + 12, 0, 100);
    s.energy = clamp(s.energy - 6, 0, 100);

    return {
      ok: true,
      text: `✅ فیلم دیدی. هزینه: ${formatMoney(cost)}`,
    };
  }

  if (type === "walk") {
    s.happiness = clamp(s.happiness + 7, 0, 100);
    s.health = clamp(s.health + 4, 0, 100);
    s.energy = clamp(s.energy - 4, 0, 100);

    return {
      ok: true,
      text: "✅ پیاده‌روی کردی و حالت بهتر شد.",
    };
  }

  if (type === "music") {
    const cost = 10;

    if (s.money < cost) {
      return { ok: false, text: "❌ پولت کافی نیست." };
    }

    s.money -= cost;
    s.happiness = clamp(s.happiness + 8, 0, 100);
    s.energy = clamp(s.energy + 2, 0, 100);

    return {
      ok: true,
      text: `✅ موسیقی گوش دادی. هزینه: ${formatMoney(cost)}`,
    };
  }

  return {
    ok: false,
    text: "❌ گزینه تفریح نامعتبره.",
  };
}

// =========================
// New: Family actions
// =========================
function doFamily(s, type) {
  if (type === "call") {
    const cost = 5;

    if (s.money < cost) {
      return { ok: false, text: "❌ پولت کافی نیست." };
    }

    s.money -= cost;
    s.happiness = clamp(s.happiness + 8, 0, 100);
    s.family.relation = clamp(s.family.relation + 6, 0, 100);

    return {
      ok: true,
      text: `✅ با خانواده تماس گرفتی. هزینه: ${formatMoney(cost)}`,
    };
  }

  if (type === "dinner") {
    const cost = 70;

    if (s.money < cost) {
      return {
        ok: false,
        text: "❌ پولت برای شام خانوادگی کافی نیست.",
      };
    }

    s.money -= cost;
    s.happiness = clamp(s.happiness + 15, 0, 100);
    s.health = clamp(s.health + 3, 0, 100);
    s.energy = clamp(s.energy + 5, 0, 100);
    s.family.relation = clamp(s.family.relation + 10, 0, 100);

    return {
      ok: true,
      text: `✅ رفتی شام خانوادگی. هزینه: ${formatMoney(cost)}`,
    };
  }

  if (type === "time") {
    s.happiness = clamp(s.happiness + 10, 0, 100);
    s.energy = clamp(s.energy - 3, 0, 100);
    s.family.relation = clamp(s.family.relation + 8, 0, 100);

    return {
      ok: true,
      text: "✅ با خانواده وقت گذروندی.",
    };
  }

  return {
    ok: false,
    text: "❌ گزینه خانواده نامعتبره.",
  };
}

// =========================
// UI
// =========================
function mainMenu() {
  return {
    inline_keyboard: [
      [
        { text: "📊 وضعیت", callback_data: "menu:status" },
        { text: "⏭️ پیشرفت زمان", callback_data: "menu:tick" },
      ],
      [
        { text: "💼 کار", callback_data: "menu:work" },
        { text: "🎓 تحصیل", callback_data: "menu:edu" },
      ],
      [
        { text: "🛒 فروشگاه", callback_data: "menu:shop" },
        { text: "🏦 بانک", callback_data: "menu:bank" },
      ],
      [
        { text: "🎉 تفریح", callback_data: "menu:fun" },
        { text: "👨‍👩‍👧‍👦 خانواده", callback_data: "menu:family" },
      ],
      [{ text: "🔁 ریست بازی", callback_data: "menu:reset" }],
    ],
  };
}

function workMenu() {
  return {
    inline_keyboard: [
      [{ text: "🧰 کار کن", callback_data: "work:do" }],
      [{ text: "📈 درخواست ارتقاء شغلی", callback_data: "work:promote" }],
      [{ text: "⬅️ برگشت", callback_data: "menu:home" }],
    ],
  };
}

function eduMenu(s) {
  const nextLevel = s.edu + 1;
  const options = EDUCATION.filter((e) => e.level === nextLevel);
  const rows = options.map((e) => [
    {
      text: `📚 ${e.name} | هزینه ${e.cost} | +مهارت ${e.skillGain}`,
      callback_data: `edu:buy:${e.level}`,
    },
  ]);

  if (rows.length === 0) {
    rows.push([{ text: "✅ تحصیلاتت کامل شده", callback_data: "noop" }]);
  }

  rows.push([{ text: "⬅️ برگشت", callback_data: "menu:home" }]);

  return {
    inline_keyboard: rows,
  };
}

function shopMenu() {
  return {
    inline_keyboard: [
      [{ text: "☕ قهوه (20)", callback_data: "shop:coffee" }],
      [{ text: "🍱 غذای خوب (60)", callback_data: "shop:meal" }],
      [{ text: "🏋️ باشگاه (80)", callback_data: "shop:gym" }],
      [{ text: "🎮 تفریح فروشگاه (50)", callback_data: "shop:game" }],
      [{ text: "⬅️ برگشت", callback_data: "menu:home" }],
    ],
  };
}

function bankMenu() {
  return {
    inline_keyboard: [
      [
        { text: "➕ واریز 200", callback_data: "bank:dep:200" },
        { text: "➖ برداشت 200", callback_data: "bank:wd:200" },
      ],
      [
        { text: "💳 وام 500", callback_data: "bank:borrow:500" },
        { text: "✅ پرداخت 500", callback_data: "bank:repay:500" },
      ],
      [{ text: "⬅️ برگشت", callback_data: "menu:home" }],
    ],
  };
}

function funMenu() {
  return {
    inline_keyboard: [
      [{ text: "🎬 فیلم (40)", callback_data: "fun:movie" }],
      [{ text: "🚶 پیاده‌روی (0)", callback_data: "fun:walk" }],
      [{ text: "🎵 موسیقی (10)", callback_data: "fun:music" }],
      [{ text: "⬅️ برگشت", callback_data: "menu:home" }],
    ],
  };
}

function familyMenu() {
  return {
    inline_keyboard: [
      [{ text: "📞 تماس با خانواده (5)", callback_data: "family:call" }],
      [{ text: "🍽 شام خانوادگی (70)", callback_data: "family:dinner" }],
      [{ text: "🧸 وقت‌گذرانی با خانواده (0)", callback_data: "family:time" }],
      [{ text: "⬅️ برگشت", callback_data: "menu:home" }],
    ],
  };
}

function statusText(s) {
  const job = jobById(s.jobId);
  const edu = eduByLevel(s.edu);

  return (
    `👤 ${s.firstName}\n` +
    `📆 روز ${s.day} | 🎂 سن ${s.age}\n\n` +
    `💼 شغل: ${job.name}\n` +
    `🎓 تحصیلات: ${edu.name}\n` +
    `🧠 مهارت: ${s.skill}/100\n` +
    `👨‍👩‍👧‍👦 رابطه با خانواده: ${s.family.relation}/100\n\n` +
    `💰 پول نقد: ${formatMoney(s.money)}\n` +
    `🏦 بانک: ${formatMoney(s.bank.balance)}\n` +
    `💳 بدهی: ${formatMoney(s.bank.debt)}\n\n` +
    `❤️ سلامت: ${s.health}/100\n` +
    `⚡ انرژی: ${s.energy}/100\n` +
    `😊 شادی: ${s.happiness}/100\n\n` +
    `ℹ️ هر حدود 6 ساعت، 1 روز در بازی جلو می‌ره.`
  );
}

function homeText() {
  return "🎮 بازی زندگی\nیکی از گزینه‌ها را انتخاب کن:";
}

// =========================
// Routes
// =========================
app.get("/", (req, res) => {
  res.status(200).send("✅ Life Game Bot is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body;

    // -------------------------
    // MESSAGE
    // -------------------------
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id;
      const user = msg.from;
      const text = (msg.text || "").trim();

      if (!chatId || !user) return;

      const s = getUser(user);
      if (!s) return;

      const tick = applyDailyTick(s);

      if (text.startsWith("/start")) {
        let extra = "";

        if (tick.advanced > 0) {
          extra =
            `\n\n⏭️ ${tick.advanced} روز جلو رفت.` +
            (tick.events.length ? `\n\nرویدادها:\n- ${tick.events.join("\n- ")}` : "");
        }

        await tg("sendMessage", {
          chat_id: chatId,
          text: `سلام ${s.firstName}!${extra}\n\n${homeText()}`,
          reply_markup: mainMenu(),
        });
        return;
      }

      if (text === "/status") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: statusText(s),
          reply_markup: mainMenu(),
        });
        return;
      }

      if (text === "/reset") {
        resetUser(user);

        await tg("sendMessage", {
          chat_id: chatId,
          text: "🔁 بازی ریست شد. دوباره /start بزن.",
        });
        return;
      }

      return;
    }

    // -------------------------
    // CALLBACK QUERY
    // -------------------------
    if (update.callback_query) {
      const cq = update.callback_query;
      const user = cq.from;
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const data = cq.data || "";

      await tg("answerCallbackQuery", {
        callback_query_id: cq.id,
      });

      if (!user || !chatId || !messageId) return;

      const s = getUser(user);
      if (!s) return;

      const tick = applyDailyTick(s);

      const withTickNote = (text) => {
        if (tick.advanced <= 0) return text;

        const eventsBlock = tick.events.length ? `\n- ${tick.events.join("\n- ")}` : "";

        return (
          text +
          `\n\n⏭️ ${tick.advanced} روز جلو رفت.` +
          (eventsBlock ? `\n\nرویدادها:\n${eventsBlock}` : "")
        );
      };

      const edit = async (text, replyMarkup) => {
        return tg("editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text,
          reply_markup: replyMarkup,
        });
      };

      if (data === "menu:home") {
        await edit(withTickNote(homeText()), mainMenu());
        return;
      }

      if (data === "menu:status") {
        await edit(withTickNote(statusText(s)), mainMenu());
        return;
      }

      if (data === "menu:tick") {
        await edit(withTickNote("⏭️ زمان بررسی شد.\n\n" + statusText(s)), mainMenu());
        return;
      }

      if (data === "menu:work") {
        const job = jobById(s.jobId);

        await edit(
          withTickNote(
            `💼 بخش کار\n` +
              `شغل فعلی: ${job.name}\n` +
              `حقوق پایه هر کار: ${formatMoney(job.salary)}\n\n` +
              `یکی از گزینه‌ها را انتخاب کن:`
          ),
          workMenu()
        );
        return;
      }

      if (data === "work:do") {
        const result = doWork(s);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "work:promote") {
        const result = tryPromote(s);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:edu") {
        const edu = eduByLevel(s.edu);

        await edit(
          withTickNote(
            `🎓 بخش تحصیل\n` +
              `تحصیلات فعلی: ${edu.name}\n\n` +
              `برای ارتقاء، گزینه زیر را انتخاب کن:`
          ),
          eduMenu(s)
        );
        return;
      }

      if (data.startsWith("edu:buy:")) {
        const level = Number(data.split(":")[2]);
        const result = startEducation(s, level);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:shop") {
        await edit(withTickNote("🛒 فروشگاه\nیکی از گزینه‌ها را انتخاب کن:"), shopMenu());
        return;
      }

      if (data.startsWith("shop:")) {
        const itemId = data.split(":")[1];
        const result = buyItem(s, itemId);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:bank") {
        await edit(
          withTickNote(
            `🏦 بانک\n` +
              `موجودی: ${formatMoney(s.bank.balance)}\n` +
              `بدهی: ${formatMoney(s.bank.debt)}\n\n` +
              `عملیات موردنظر را انتخاب کن:`
          ),
          bankMenu()
        );
        return;
      }

      if (data.startsWith("bank:dep:")) {
        const amount = Number(data.split(":")[2]);
        const result = bankDeposit(s, amount);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data.startsWith("bank:wd:")) {
        const amount = Number(data.split(":")[2]);
        const result = bankWithdraw(s, amount);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data.startsWith("bank:borrow:")) {
        const amount = Number(data.split(":")[2]);
        const result = bankBorrow(s, amount);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data.startsWith("bank:repay:")) {
        const amount = Number(data.split(":")[2]);
        const result = bankRepay(s, amount);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:fun") {
        await edit(withTickNote("🎉 بخش تفریح\nیکی از گزینه‌ها را انتخاب کن:"), funMenu());
        return;
      }

      if (data.startsWith("fun:")) {
        const type = data.split(":")[1];
        const result = doFun(s, type);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:family") {
        await edit(withTickNote("👨‍👩‍👧‍👦 بخش خانواده\nیکی از گزینه‌ها را انتخاب کن:"), familyMenu());
        return;
      }

      if (data.startsWith("family:")) {
        const type = data.split(":")[1];
        const result = doFamily(s, type);
        await edit(withTickNote(`${result.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:reset") {
        resetUser(user);
        await edit("🔁 بازی ریست شد.\n\n" + homeText(), mainMenu());
        return;
      }

      if (data === "noop") {
        await tg("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "فعلاً گزینه‌ای وجود ندارد.",
        });
        return;
      }

      await tg("answerCallbackQuery", {
        callback_query_id: cq.id,
        text: "دکمه نامعتبر.",
      });
      return;
    }
  } catch (error) {
    console.error("❌ Webhook handler error:", error);
  }
});

// =========================
// Start server
// =========================
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`✅ Webhook path: /webhook/${SECRET_PATH}`);
});
