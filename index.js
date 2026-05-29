import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));

const TOKEN = process.env.BOT_TOKEN;
const SECRET = process.env.SECRET_PATH;
const PORT = process.env.PORT || 3000;

if (!TOKEN) throw new Error("BOT_TOKEN is missing. Please set it in Railway Variables.");
if (!SECRET) throw new Error("SECRET_PATH is missing. Please set it in Railway Variables.");

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
      console.error(`Telegram API Error: ${data.description}`);
      throw new Error(`Telegram API error: ${data.description}`);
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
function backToMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Back to Menu", callback_data: "go:menu" }]
    ]
  };
}

// --- Core Logic ---
async function handleCommand(chatId, firstName, command) {
  switch (command) {
    case "/start":
      await sendMessage(
        chatId,
        `Welcome, ${firstName}! This is a simple bot. Type something or use /menu.`,
        { reply_markup: backToMenuKeyboard() }
      );
      break;
    case "/menu":
       await sendMessage(
        chatId,
        "This is the main menu.",
        { reply_markup: backToMenuKeyboard() }
      );
      break;
    default:
      await sendMessage(chatId, "I received your command, but I don't know what to do with it. Try /start or /menu.");
      break;
  }
}

async function handleCallbackQuery(chatId, data, callbackQueryId) {
  await telegramApi("answerCallbackQuery", { callback_query_id: callbackQueryId });

  switch (data) {
    case "go:menu":
      await sendMessage(chatId, "You returned to the main menu.", { reply_markup: backToMenuKeyboard() });
      break;
    default:
      await sendMessage(chatId, "Unknown option.");
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
        await sendMessage(chatId, `You said: "${text}". Use /start or /menu.`, { reply_markup: backToMenuKeyboard() });
      }
      return;
    }

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const data = cq.data;
      const callbackQueryId = cq.id;

      if (chatId && data) {
        await handleCallbackQuery(chatId, data, callbackQueryId);
      }
      return;
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.sendStatus(500);
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
