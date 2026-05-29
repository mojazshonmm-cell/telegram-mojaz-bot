import express from "express";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH || "mojaz0762";
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ Bot is Online!");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body;

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === "/start") {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: "سلام! ربات با موفقیت بالا آمد و آماده کار است. 🚀"
          })
        });
      }

      if (text === "/ping") {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: "pong ✅"
          })
        });
      }
    }
  } catch (error) {
    console.error("Webhook error:", error);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`✅ Webhook path: /webhook/${SECRET_PATH}`);
});
