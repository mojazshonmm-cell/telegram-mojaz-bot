import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// ضروری
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing in env vars");
  process.exit(1);
}

// همین مقدار باید دقیقاً با setWebhook یکی باشد
const SECRET_PATH = process.env.SECRET_PATH || "mojaz0762";

// --- helpers ---
async function tg(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data.result;
}

async function sendMessage(chatId, text) {
  return tg("sendMessage", { chat_id: chatId, text });
}

// --- routes ---
app.get("/", (req, res) => {
  res.status(200).send("ربات MAX در حال اجرا است ✅");
});

// تست با مرورگر: باید 200 بدهد
app.get(`/webhook/${SECRET_PATH}`, (req, res) => {
  res.status(200).send("webhook endpoint reachable ✅");
});

// وبهوک واقعی تلگرام: باید سریع 200 بدهد
app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  // خیلی مهم: اول 200 بده که تلگرام 502 نگیرد
  res.sendStatus(200);

  try {
    const update = req.body;

    const message = update.message;
    if (!message) return;

    const chatId = message.chat?.id;
    const text = message.text || "";

    if (!chatId) return;

    if (text === "/start") {
      await sendMessage(chatId, "سلام! من مکس هستم. ✅");
      return;
    }

    await sendMessage(chatId, `گفتی: ${text}`);
  } catch (err) {
    console.error("Webhook handler error:", err);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Webhook: /webhook/${SECRET_PATH}`);
});
