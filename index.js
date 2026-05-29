import express from "express";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;   // تو Railway/Render ست می‌کنیم
const SECRET = process.env.SECRET || "";   // اختیاری
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tg(method, body) {
  const res = await fetch(`${BASE_URL}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

app.get("/", (req, res) => res.send("OK"));

app.post(`/webhook/${SECRET}`, async (req, res) => {
  const update = req.body;

  const msg = update.message;
  if (msg?.text) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (text === "/start") {
      await tg("sendMessage", { chat_id: chatId, text: "سلام! ربات وصل شد." });
    } else {
      await tg("sendMessage", { chat_id: chatId, text: `گفتی: ${text}` });
    }
  }

  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on", port));
