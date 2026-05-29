import express from "express";
import Database from "better-sqlite3";

const app = express();
app.use(express.json({ limit: "2mb" }));

const TOKEN = process.env.BOT_TOKEN;
const SECRET = process.env.SECRET_PATH;
const PORT = process.env.PORT || 3000;

if (!TOKEN) throw new Error("BOT_TOKEN is missing (Railway Variables).");
if (!SECRET) throw new Error("SECRET_PATH is missing (Railway Variables).");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null;

// --- DB (persistent if /data volume exists) ---
const db = new Database("/data/bot.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY,
  stage TEXT NOT NULL DEFAULT 'new',
  age INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
`);

const getUserStmt = db.prepare(`SELECT * FROM users WHERE chat_id = ?`);
const upsertUserStmt = db.prepare(`
INSERT INTO users(chat_id, stage, age, xp, coins, updated_at)
VALUES(@chat_id, @stage, @age, @xp, @coins, @updated_at)
ON CONFLICT(chat_id) DO UPDATE SET
  stage=excluded.stage,
  age=excluded.age,
  xp=excluded.xp,
  coins=excluded.coins,
  updated_at=excluded.updated_at
`);

const resetUserStmt = db.prepare(`DELETE FROM users WHERE chat_id = ?`);

function now() {
  return Date.now();
}

function getUser(chatId) {
  let u = getUserStmt.get(chatId);
  if (!u) {
    u = {
      chat_id: chatId,
      stage: "new",
      age: 0,
      xp: 0,
      coins: 0,
      updated_at: now()
    };
    upsertUserStmt.run(u);
  }
  return u;
}

function saveUser(u) {
  u.updated_at = now();
  upsertUserStmt.run(u);
}

// --- Telegram API helpers ---
async function tg(method, payload) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  if (!j.ok) {
    const e = new Error(`Telegram API error on ${method}: ${j.description}`);
    e.telegram = j;
    throw e;
  }
  return j.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🌟 شروع بازی (کودکی)", callback_data: "go:kid" }],
      [{ text: "📊 وضعیت من", callback_data: "go:status" }],
      [{ text: "❌ ریست", callback_data: "go:reset" }]
    ]
  };
}

function kidChoiceKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🏫 برم مدرسه", callback_data: "kid:school" }],
      [{ text: "🎮 برم بازی", callback_data: "kid:play" }],
      [{ text: "📊 وضعیت من", callback_data: "go:status" }]
    ]
  };
}

function afterKidKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🚀 مرحله بعد (نوجوانی) [بعداً اضافه می‌کنیم]", callback_data: "noop" }],
      [{ text: "📊 وضعیت من", callback_data: "go:status" }],
      [{ text: "⬅️ منوی اصلی", callback_data: "go:menu" }]
    ]
  };
}

async function safeNotifyAdmin(text) {
  if (!ADMIN_CHAT_ID) return;
  try {
    await sendMessage(ADMIN_CHAT_ID, `‼️ Bot Error:\n${text}`);
  } catch (_) {}
}

// --- Logic ---
async function handleCommand(chatId, firstName, text) {
  const u = getUser(chatId);

  if (text === "/start") {
    u.stage = "menu";
    saveUser(u);
    await sendMessage(
      chatId,
      `سلام ${firstName} 👋\nبه بازی «مجاز» خوش اومدی! 🚀\nاز منو انتخاب کن:`,
      { reply_markup: mainMenuKeyboard() }
    );
    return;
  }

  if (text === "/status") {
    await sendMessage(chatId, formatStatus(u));
    return;
  }

  if (text === "/reset") {
    resetUserStmt.run(chatId);
    await sendMessage(chatId, "✅ ریست شد. دوباره /start بزن.");
    return;
  }

  // fallback
  await sendMessage(chatId, `دستور نامعتبره. لطفاً از /start استفاده کن.`);
}

function formatStatus(u) {
  return `📊 وضعیت فعلی شما:
🎂 سن: ${u.age}
🏆 مرحله: ${u.stage}
⚡️ XP: ${u.xp}
💰 Coins: ${u.coins}`;
}

async function handleCallback(chatId, firstName, data, callbackQueryId) {
  const u = getUser(chatId);

  await tg("answerCallbackQuery", { callback_query_id: callbackQueryId });

  if (data === "noop") {
    await sendMessage(chatId, "این بخش هنوز آماده نیست. 🚧 فعلاً همین مسیر کودکی رو کامل کنیم.");
    return;
  }

  if (data === "go:menu") {
    u.stage = "menu";
    saveUser(u);
    await sendMessage(chatId, "منوی اصلی 🏠:", { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (data === "go:status") {
    await sendMessage(chatId, formatStatus(u), { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (data === "go:reset") {
    resetUserStmt.run(chatId);
    await sendMessage(chatId, "✅ ریست شد. دوباره /start بزن.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (data === "go:kid") {
    u.age = 6;
    u.stage = "kid-choice";
    saveUser(u);

    await sendMessage(
      chatId,
      `خب ${firstName}، تو الان ۶ سالته. 👧👦\nمی‌خوای چی کار کنی؟`,
      { reply_markup: kidChoiceKeyboard() }
    );
    return;
  }

  if (data === "kid:school") {
    if (u.stage !== "kid-choice") {
      await sendMessage(chatId, "لطفاً اول «شروع بازی (کودکی)» رو بزن.", { reply_markup: mainMenuKeyboard() });
      return;
    }
    u.stage = "kid-school";
    u.xp += 12;
    u.coins += 4;
    saveUser(u);

    await sendMessage(
      chatId,
      "📚 رفتی مدرسه. درس خوندی و XP گرفتی.\nمرحله کودکی فعلاً همین‌جا تموم شد.",
      { reply_markup: afterKidKeyboard() }
    );
    return;
  }

  if (data === "kid:play") {
    if (u.stage !== "kid-choice") {
      await sendMessage(chatId, "لطفاً اول «شروع بازی (کودکی)» رو بزن.", { reply_markup: mainMenuKeyboard() });
      return;
    }
    u.stage = "kid-play";
    u.xp += 6;
    u.coins += 12;
    saveUser(u);

    await sendMessage(
      chatId,
      "🎮 رفتی بازی. خوش گذشت و سکه جمع کردی.\nمرحله کودکی فعلاً همین‌جا تموم شد.",
      { reply_markup: afterKidKeyboard() }
    );
    return;
  }

  await sendMessage(chatId, "گزینه ناشناخته ❓.", { reply_markup: mainMenuKeyboard() });
}

// --- Routes ---
app.get("/", (req, res) => res.status(200).send("OK 👍"));

app.post(`/webhook/${SECRET}`, async (req, res) => {
  try {
    const update = req.body;
    res.sendStatus(200); // Important: Telegram expects a 200 OK quickly

    if (update.message) {
      const chatId = update.message.chat.id;
      const firstName = update.message.from?.first_name || "دوست من";
      const text = update.message.text;

      if (typeof text === "string" && text.startsWith("/")) {
        await handleCommand(chatId, firstName, text.trim());
      } else if (typeof text === "string") {
        await sendMessage(chatId, "لطفاً از دکمه‌ها استفاده کن یا /start بزن. 👆");
      }
      return;
    }

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const firstName = cq.from?.first_name || "دوست من";
      const data = cq.data;
      const callbackQueryId = cq.id;

      if (chatId && data) {
        await handleCallback(chatId, firstName, data, callbackQueryId);
      }
      return;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    await safeNotifyAdmin(`❌ Bot Error:\n\`\`\`\n${err?.message || err}\n\`\`\``);
  }
});

// Health check endpoint
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
