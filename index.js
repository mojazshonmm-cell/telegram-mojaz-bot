import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

// --- ENV ---
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

// --- Telegram helper ---
async function tg(method, payload) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function formatMoney(n) {
  const sign = n < 0 ? "-" : "";
  const x = Math.abs(Math.floor(n));
  return `${sign}${x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}💰`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Game data ---
const JOBS = [
  { id: "jobless", name: "بیکار", reqEdu: 0, reqSkill: 0, salary: 0 },
  { id: "intern", name: "کارآموز", reqEdu: 0, reqSkill: 5, salary: 50 },
  { id: "clerk", name: "کارمند", reqEdu: 1, reqSkill: 15, salary: 150 },
  { id: "specialist", name: "متخصص", reqEdu: 2, reqSkill: 30, salary: 350 },
  { id: "manager", name: "مدیر", reqEdu: 3, reqSkill: 50, salary: 700 },
];

const EDUCATION = [
  { level: 0, name: "بدون مدرک", cost: 0, days: 0, skillGain: 0 },
  { level: 1, name: "دیپلم", cost: 200, days: 2, skillGain: 5 },
  { level: 2, name: "لیسانس", cost: 600, days: 4, skillGain: 10 },
  { level: 3, name: "فوق‌لیسانس", cost: 1200, days: 6, skillGain: 15 },
];

const SHOP = [
  { id: "coffee", name: "قهوه", cost: 20, energy: +15, health: 0, happiness: +3 },
  { id: "gym", name: "باشگاه", cost: 80, energy: -10, health: +10, happiness: +5 },
  { id: "meal", name: "غذای خوب", cost: 60, energy: +10, health: +6, happiness: +2 },
  { id: "game", name: "تفریح", cost: 50, energy: -5, health: 0, happiness: +10 },
];

const DAILY_COST = 15; // هزینه زندگی روزانه
const WORK_ENERGY_COST = 18;
const STUDY_ENERGY_COST = 14;

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

// --- In-memory user state ---
/**
 * RAM storage: resets on deploy/restart.
 * key: userId (number)
 */
const users = new Map();

function defaultState(user) {
  const firstName = user?.first_name || "رفیق";
  return {
    id: user?.id || 0,
    firstName,

    createdAt: now(),
    lastTickAt: now(), // last time we applied daily tick

    day: 1,
    age: 18,

    money: 200,

    health: 80,
    energy: 80,
    happiness: 60,

    edu: 0, // education level
    skill: 0, // 0..100
    jobId: "jobless",

    bank: {
      balance: 0,
      debt: 0,
    },
  };
}

function getUser(user) {
  const id = user?.id;
  if (!id) return null;

  if (!users.has(id)) users.set(id, defaultState(user));
  const s = users.get(id);

  // keep name fresh
  if (user?.first_name) s.firstName = user.first_name;

  return s;
}

function resetUser(user) {
  const id = user?.id;
  if (!id) return null;
  const s = defaultState(user);
  users.set(id, s);
  return s;
}

// --- Time progression ---
// We'll simulate "day" passing based on real time to keep it simple.
// Every 6 hours -> +1 game day (you can change).
const DAY_MS = 6 * 60 * 60 * 1000;

function applyDailyTick(s) {
  const t = now();
  const elapsed = t - (s.lastTickAt || s.createdAt);
  if (elapsed < DAY_MS) return { advanced: 0, events: [] };

  const daysToAdvance = Math.floor(elapsed / DAY_MS);
  s.lastTickAt += daysToAdvance * DAY_MS;

  const events = [];
  for (let i = 0; i < daysToAdvance; i++) {
    s.day += 1;

    // aging: every 30 days -> +1 year
    if (s.day % 30 === 0) s.age += 1;

    // daily life cost
    s.money -= DAILY_COST;

    // small natural changes
    s.energy = clamp(s.energy + 6, 0, 100);
    s.health = clamp(s.health + 1, 0, 100);
    s.happiness = clamp(s.happiness - 1, 0, 100);

    // interest on debt (tiny) and bank (tiny)
    if (s.bank.debt > 0) s.bank.debt = Math.floor(s.bank.debt * 1.01);
    if (s.bank.balance > 0) s.bank.balance = Math.floor(s.bank.balance * 1.003);

    // random event (25% chance)
    if (Math.random() < 0.25) {
      const ev = pick(EVENT_POOL);
      ev.effect(s);
      events.push(`${ev.title}\n${ev.text}`);
    }

    // clamp vital stats
    s.health = clamp(s.health, 0, 100);
    s.energy = clamp(s.energy, 0, 100);
    s.happiness = clamp(s.happiness, 0, 100);
  }

  return { advanced: daysToAdvance, events };
}

// --- Game actions ---
function jobById(id) {
  return JOBS.find((j) => j.id === id) || JOBS[0];
}

function eduByLevel(level) {
  return EDUCATION.find((e) => e.level === level) || EDUCATION[0];
}

function canWork(s) {
  return s.energy >= WORK_ENERGY_COST && s.health > 10;
}

function doWork(s) {
  if (!canWork(s)) {
    return { ok: false, text: "❌ الان انرژی/سلامت کافی برای کار نداری." };
  }

  const job = jobById(s.jobId);
  const base = job.salary;

  // performance bonus based on skill and happiness
  const bonus = Math.floor((s.skill * 0.8 + s.happiness * 0.2) / 10); // 0..10
  const pay = base + bonus;

  s.money += pay;
  s.energy = clamp(s.energy - WORK_ENERGY_COST, 0, 100);
  s.happiness = clamp(s.happiness - 2, 0, 100);
  s.skill = clamp(s.skill + 1, 0, 100);

  return { ok: true, text: `✅ کار کردی و ${formatMoney(pay)} درآمد داشتی.` };
}

function canStudy(s) {
  return s.energy >= STUDY_ENERGY_COST && s.health > 10;
}

function startEducation(s, targetLevel) {
  const current = s.edu;
  if (targetLevel <= current) {
    return { ok: false, text: "❌ این مقطع رو قبلاً گرفتی یا پایین‌تره." };
  }
  if (targetLevel !== current + 1) {
    return { ok: false, text: "❌ باید مقطع‌ها رو به ترتیب بگذرونی." };
  }

  const edu = eduByLevel(targetLevel);
  if (s.money < edu.cost) {
    return { ok: false, text: `❌ پولت کافی نیست. هزینه: ${formatMoney(edu.cost)}` };
  }
  if (!canStudy(s)) {
    return { ok: false, text: "❌ الان انرژی/سلامت کافی برای درس خوندن نداری." };
  }

  s.money -= edu.cost;
  s.energy = clamp(s.energy - STUDY_ENERGY_COST, 0, 100);
  s.happiness = clamp(s.happiness - 1, 0, 100);
  s.skill = clamp(s.skill + edu.skillGain, 0, 100);
  s.edu = targetLevel;

  return { ok: true, text: `🎓 تبریک! مدرک «${edu.name}» رو گرفتی.` };
}

function tryPromote(s) {
  // pick best job you qualify for
  const eligible = JOBS.filter((j) => s.edu >= j.reqEdu && s.skill >= j.reqSkill);
  const best = eligible[eligible.length - 1] || JOBS[0];

  if (best.id === s.jobId) {
    return { ok: false, text: "ℹ️ فعلاً شغل بهتری که شرایطش رو داشته باشی پیدا نشد." };
  }

  s.jobId = best.id;
  s.happiness = clamp(s.happiness + 6, 0, 100);
  return { ok: true, text: `📈 ارتقاء گرفتی! شغل جدید: «${best.name}»` };
}

function buyItem(s, itemId) {
  const item = SHOP.find((x) => x.id === itemId);
  if (!item) return { ok: false, text: "❌ آیتم نامعتبره." };
  if (s.money < item.cost) return { ok: false, text: "❌ پولت کافی نیست." };

  s.money -= item.cost;
  s.energy = clamp(s.energy + item.energy, 0, 100);
  s.health = clamp(s.health + item.health, 0, 100);
  s.happiness = clamp(s.happiness + item.happiness, 0, 100);

  return { ok: true, text: `✅ خریدی: ${item.name} (هزینه: ${formatMoney(item.cost)})` };
}

function bankDeposit(s, amount) {
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, text: "❌ مبلغ نامعتبره." };
  if (s.money < amount) return { ok: false, text: "❌ پول نقد کافی نداری." };

  s.money -= amount;
  s.bank.balance += amount;
  return { ok: true, text: `🏦 واریز شد: ${formatMoney(amount)}` };
}

function bankWithdraw(s, amount) {
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, text: "❌ مبلغ نامعتبره." };
  if (s.bank.balance < amount) return { ok: false, text: "❌ موجودی بانک کافی نیست." };

  s.bank.balance -= amount;
  s.money += amount;
  return { ok: true, text: `🏦 برداشت شد: ${formatMoney(amount)}` };
}

function bankBorrow(s, amount) {
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, text: "❌ مبلغ نامعتبره." };

  // simple limits
  const limit = 2000 + s.edu * 1000 + s.skill * 20;
  if (s.bank.debt + amount > limit) {
    return { ok: false, text: `❌ سقف وام تو: ${formatMoney(limit)} (بدهی فعلی: ${formatMoney(s.bank.debt)})` };
  }

  s.money += amount;
  s.bank.debt += amount;
  s.happiness = clamp(s.happiness + 2, 0, 100);
  return { ok: true, text: `💳 وام گرفتی: ${formatMoney(amount)} (بدهی: ${formatMoney(s.bank.debt)})` };
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
  return { ok: true, text: `✅ پرداخت شد: ${formatMoney(pay)} (بدهی باقی: ${formatMoney(s.bank.debt)})` };
}

// --- UI builders ---
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
      [{ text: "🔁 ریست بازی", callback_data: "menu:reset" }],
    ],
  };
}

function backButton() {
  return { inline_keyboard: [[{ text: "⬅️ برگشت", callback_data: "menu:home" }]] };
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

function shopMenu() {
  return {
    inline_keyboard: [
      [{ text: "☕ قهوه (20)", callback_data: "shop:coffee" }],
      [{ text: "🍱 غذای خوب (60)", callback_data: "shop:meal" }],
      [{ text: "🏋️ باشگاه (80)", callback_data: "shop:gym" }],
      [{ text: "🎮 تفریح (50)", callback_data: "shop:game" }],
      [{ text: "⬅️ برگشت", callback_data: "menu:home" }],
    ],
  };
}

function eduMenu(s) {
  const next = s.edu + 1;
  const options = EDUCATION.filter((e) => e.level === next);
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
  return { inline_keyboard: rows };
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

function statusText(s) {
  const job = jobById(s.jobId);
  const edu = eduByLevel(s.edu);

  return (
    `👤 ${s.firstName}\n` +
    `📆 روز ${s.day} | 🎂 سن ${s.age}\n\n` +
    `💼 شغل: ${job.name}\n` +
    `🎓 تحصیلات: ${edu.name}\n` +
    `🧠 مهارت: ${s.skill}/100\n\n` +
    `💰 پول نقد: ${formatMoney(s.money)}\n` +
    `🏦 بانک: ${formatMoney(s.bank.balance)}\n` +
    `💳 بدهی: ${formatMoney(s.bank.debt)}\n\n` +
    `❤️ سلامت: ${s.health}/100\n` +
    `⚡ انرژی: ${s.energy}/100\n` +
    `😊 شادی: ${s.happiness}/100\n` +
    `\nℹ️ هر ~6 ساعت یک روز جلو می‌ره.`
  );
}

function homeText() {
  return "🎮 بازی زندگی\nیکی از گزینه‌ها رو انتخاب کن:";
}

// --- Routes ---
app.get("/", (req, res) => res.status(200).send("✅ Life Game Bot is running"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  // IMPORTANT: reply fast to Telegram
  res.sendStatus(200);

  try {
    const update = req.body;

    // messages
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id;
      const user = msg.from;
      const text = (msg.text || "").trim();

      if (!chatId || !user) return;

      const s = getUser(user);
      if (!s) return;

      // apply time progress on interaction
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
          text: "🔁 بازی ریست شد. /start",
        });
        return;
      }

      // ignore other text
      return;
    }

    // callback queries
    if (update.callback_query) {
      const cq = update.callback_query;
      const user = cq.from;
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const data = cq.data || "";

      // always answer callback to remove loading state
      await tg("answerCallbackQuery", { callback_query_id: cq.id });

      if (!user || !chatId || !messageId) return;

      const s = getUser(user);
      if (!s) return;

      // apply time progress on interaction
      const tick = applyDailyTick(s);

      const edit = async (text, replyMarkup) => {
        return tg("editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text,
          reply_markup: replyMarkup,
        });
      };

      const withTickNote = (text) => {
        if (tick.advanced <= 0) return text;
        const eventsBlock = tick.events.length ? `\n- ${tick.events.join("\n- ")}` : "";
        return (
          text +
          `\n\n⏭️ ${tick.advanced} روز جلو رفت.` +
          (eventsBlock ? `\n\nرویدادها:\n${eventsBlock}` : "")
        );
      };

      // routing
      if (data === "menu:home") {
        await edit(withTickNote(homeText()), mainMenu());
        return;
      }

      if (data === "menu:status") {
        await edit(withTickNote(statusText(s)), mainMenu());
        return;
      }

      if (data === "menu:tick") {
        // tick already applied; just show status
        await edit(withTickNote("⏭️ بررسی شد.\n\n" + statusText(s)), mainMenu());
        return;
      }

      if (data === "menu:work") {
        const job = jobById(s.jobId);
        await edit(
          withTickNote(
            `💼 بخش کار\nشغل فعلی: ${job.name}\nحقوق پایه هر کار: ${formatMoney(job.salary)}\n\nیکی رو انتخاب کن:`
          ),
          workMenu()
        );
        return;
      }

      if (data === "work:do") {
        const r = doWork(s);
        await edit(withTickNote(`${r.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "work:promote") {
        const r = tryPromote(s);
        await edit(withTickNote(`${r.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:edu") {
        const edu = eduByLevel(s.edu);
        await edit(
          withTickNote(
            `🎓 بخش تحصیل\nتحصیلات فعلی: ${edu.name}\n\nبرای ارتقاء، گزینه زیر رو بزن:`
          ),
          eduMenu(s)
        );
        return;
      }

      if (data.startsWith("edu:buy:")) {
        const level = Number(data.split(":")[2]);
        const r = startEducation(s, level);
        await edit(withTickNote(`${r.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:shop") {
        await edit(withTickNote("🛒 فروشگاه\nیکی رو انتخاب کن:"), shopMenu());
        return;
      }

      if (data.startsWith("shop:")) {
        const itemId = data.split(":")[1];
        const r = buyItem(s, itemId);
        await edit(withTickNote(`${r.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:bank") {
        await edit(
          withTickNote(
            `🏦 بانک\nموجودی: ${formatMoney(s.bank.balance)}\nبدهی: ${formatMoney(s.bank.debt)}\n\nعملیات:`
          ),
          bankMenu()
        );
        return;
      }

      if (data.startsWith("bank:dep:")) {
        const amount = Number(data.split(":")[2]);
        const r = bankDeposit(s, amount);
        await edit(withTickNote(`${r.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data.startsWith("bank:wd:")) {
        const amount = Number(data.split(":")[2]);
        const r = bankWithdraw(s, amount);
        await edit(withTickNote(`${r.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data.startsWith("bank:borrow:")) {
        const amount = Number(data.split(":")[2]);
        const r = bankBorrow(s, amount);
        await edit(withTickNote(`${r.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data.startsWith("bank:repay:")) {
        const amount = Number(data.split(":")[2]);
        const r = bankRepay(s, amount);
        await edit(withTickNote(`${r.text}\n\n${statusText(s)}`), mainMenu());
        return;
      }

      if (data === "menu:reset") {
        resetUser(user);
        await edit("🔁 بازی ریست شد.\n\n" + homeText(), mainMenu());
        return;
      }

      if (data === "noop") {
        // do nothing
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "فعلاً گزینه‌ای نیست." });
        return;
      }

      // unknown callback
      await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "دکمه نامعتبر." });
      return;
    }
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
  }
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`✅ Webhook: /webhook/${SECRET_PATH}`);
});
