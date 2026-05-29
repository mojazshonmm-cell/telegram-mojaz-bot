import express from "express";
import Database from "better-sqlite3";

const app = express();
app.use(express.json({ limit: "2mb" }));

const TOKEN = process.env.BOT_TOKEN;
const SECRET = process.env.SECRET_PATH;
const PORT = process.env.PORT || 3000;

if (!TOKEN) throw new Error("BOT_TOKEN is missing. Please set it in Railway Variables.");
if (!SECRET) throw new Error("SECRET_PATH is missing. Please set it in Railway Variables.");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null;

// --- Database Setup ---
// Use /data volume for persistence
const db = new Database("/data/bot.db");
db.pragma("journal_mode = WAL"); // Improves write performance

// Ensure users table exists
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY,
  stage TEXT NOT NULL DEFAULT 'new',
  age INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  last_active INTEGER NOT NULL DEFAULT 0
);
`);

// Prepared statements for efficiency
const getUserStmt = db.prepare(`SELECT * FROM users WHERE chat_id = ?`);
const upsertUserStmt = db.prepare(`
INSERT INTO users(chat_id, stage, age, xp, coins, last_active)
VALUES(@chat_id, @stage, @age, @xp, @coins, @last_active)
ON CONFLICT(chat_id) DO UPDATE SET
  stage=excluded.stage,
  age=excluded.age,
  xp=excluded.xp,
  coins=excluded.coins,
  last_active=excluded.last_active
`);
const resetUserStmt = db.prepare(`DELETE FROM users WHERE chat_id = ?`);

function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000); // Unix timestamp in seconds
}

function getUser(chatId) {
  let user = getUserStmt.get(chatId);
  if (!user) {
    user = {
      chat_id: chatId,
      stage: "new",
      age: 0,
      xp: 0,
      coins: 0,
      last_active: getCurrentTimestamp()
    };
    upsertUserStmt.run(user);
  }
  return user;
}

function saveUser(user) {
  user.last_active = getCurrentTimestamp();
  upsertUserStmt.run(user);
}

// --- Telegram API Helper ---
async function telegramApi(method, payload) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`Telegram API Error: ${data.description} (code: ${data.error_code})`);
      const error = new Error(`Telegram API error: ${data.description}`);
      error.telegram = data;
      throw error;
    }
    return data.result;
  } catch (error) {
    console.error(`Failed to call Telegram API method ${method}:`, error);
    throw error;
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

// --- Keyboards ---
function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "▶️ Start Game (Childhood)", callback_data: "go:kid" }],
      [{ text: "📊 My Status", callback_data: "go:status" }],
      [{ text: "🔄 Reset Game", callback_data: "go:reset" }]
    ]
  };
}

function kidChoiceKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🏫 Go to School", callback_data: "kid:school" }],
      [{ text: "🎮 Go Play", callback_data: "kid:play" }],
      [{ text: "📊 My Status", callback_data: "go:status" }]
    ]
  };
}

function afterKidKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⏭️ Next Stage (Teenager) [Coming Soon]", callback_data: "noop" }],
      [{ text: "📊 My Status", callback_data: "go:status" }],
      [{ text: "⬅️ Main Menu", callback_data: "go:menu" }]
    ]
  };
}

// --- Notification ---
async function notifyAdmin(message) {
  if (!ADMIN_CHAT_ID) return;
  try {
    await sendMessage(ADMIN_CHAT_ID, `🚨 Bot Error Notification:\n\`\`\`\n${message}\n\`\`\``);
  } catch (error) {
    console.error("Failed to notify admin:", error);
  }
}

// --- Core Logic ---
async function handleCommand(chatId, firstName, command) {
  const user = getUser(chatId);

  switch (command) {
    case "/start":
      user.stage = "menu";
      saveUser(user);
      await sendMessage(
        chatId,
        `Welcome, ${firstName}! You've entered the 'Mojaz' game.\nChoose an option:`,
        { reply_markup: mainMenuKeyboard() }
      );
      break;

    case "/status":
      await sendMessage(chatId, formatStatus(user));
      break;

    case "/reset":
      resetUserStmt.run(chatId);
      await sendMessage(chatId, "Game state has been reset. Use /start to begin again.");
      break;

    default:
      await sendMessage(chatId, "Unknown command. Please use /start to see options.");
      break;
  }
}

function formatStatus(user) {
  return `📊 Your Current Status:
🎂 Age: ${user.age}
🏆 Stage: ${user.stage}
⚡️ XP: ${user.xp}
💰 Coins: ${user.coins}`;
}

async function handleCallbackQuery(chatId, firstName, data, callbackQueryId) {
  const user = getUser(chatId);

  // Always acknowledge callback query to prevent loading indicator on Telegram client
  await telegramApi("answerCallbackQuery", { callback_query_id: callbackQueryId });

  switch (data) {
    case "noop":
      await sendMessage(chatId, "This feature is not yet implemented. Please continue with the current stage.");
      break;

    case "go:menu":
      user.stage = "menu";
      saveUser(user);
      await sendMessage(chatId, "Main Menu:", { reply_markup: mainMenuKeyboard() });
      break;

    case "go:status":
      await sendMessage(chatId, formatStatus(user), { reply_markup: mainMenuKeyboard() });
      break;

    case "go:reset":
      resetUserStmt.run(chatId);
      await sendMessage(chatId, "Game state reset. Use /start to begin again.", { reply_markup: mainMenuKeyboard() });
      break;

    case "go:kid":
      user.age = 6;
      user.stage = "kid-choice";
      saveUser(user);
      await sendMessage(
        chatId,
        `Alright ${firstName}, you are 6 years old. What do you want to do?`,
        { reply_markup: kidChoiceKeyboard() }
      );
      break;

    case "kid:school":
      if (user.stage !== "kid-choice") {
        await sendMessage(chatId, "Please start by selecting 'Start Game (Childhood)' from the menu.", { reply_markup: mainMenuKeyboard() });
        return;
      }
      user.stage = "kid-school";
      user.xp += 12;
      user.coins += 4;
      saveUser(user);
      await sendMessage(
        chatId,
        "You went to school and gained XP.\nChildhood stage completed for now.",
        { reply_markup: afterKidKeyboard() }
      );
      break;

    case "kid:play":
      if (user.stage !== "kid-choice") {
        await sendMessage(chatId, "Please start by selecting 'Start Game (Childhood)' from the menu.", { reply_markup: mainMenuKeyboard() });
        return;
      }
      user.stage = "kid-play";
      user.xp += 6;
      user.coins += 12;
      saveUser(user);
      await sendMessage(
        chatId,
        "You went to play and earned coins.\nChildhood stage completed for now.",
        { reply_markup: afterKidKeyboard() }
      );
      break;

    default:
      await sendMessage(chatId, "Unknown callback option.", { reply_markup: mainMenuKeyboard() });
      break;
  }
}

// --- Webhook Route ---
app.post(`/webhook/${SECRET}`, async (req, res) => {
  try {
    const update = req.body;
    res.sendStatus(200); // Acknowledge receipt immediately

    if (update.message) {
      const chatId = update.message.chat.id;
      const firstName = update.message.from?.first_name || "friend";
      const text = update.message.text;

      if (typeof text === "string" && text.startsWith("/")) {
        await handleCommand(chatId, firstName, text.trim());
      } else if (typeof text === "string") {
        await sendMessage(chatId, "Please use the buttons provided or type /start.");
      }
      return;
    }

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const firstName = cq.from?.first_name || "friend";
      const data = cq.data;
      const callbackQueryId = cq.id;

      if (chatId && data) {
        await handleCallbackQuery(chatId, firstName, data, callbackQueryId);
      }
      return;
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    await notifyAdmin(`Error processing webhook: ${error.message}\n${error.stack}`);
    res.sendStatus(500); // Indicate an internal server error
  }
});

// --- Health Check Endpoint ---
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, message: "Bot is healthy." });
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
