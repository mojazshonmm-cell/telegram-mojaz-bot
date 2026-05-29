import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const { BOT_TOKEN, SECRET } = process.env;
if (!BOT_TOKEN || !SECRET) {
  throw new Error("❌ BOT_TOKEN یا SECRET تنظیم نشده! برو Railway → Variables");
}

const userStates = new Map();
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      // اگه خواستی می‌تونیم Markdown هم فعال کنیم
      // parse_mode: "Markdown"
    }),
  });
}

app.post(`/webhook/${SECRET}`, async (req, res) => {
  res.sendStatus(200);

  const msg = req.body?.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (!userStates.has(chatId)) {
    userStates.set(chatId, { age: 0, money: 100, step: "start" });
  }
  const state = userStates.get(chatId);

  // /start
  if (text === "/start") {
    state.age = 0;
    state.money = 100;
    state.step = "start";
    await sendMessage(
      chatId,
      "👋😄 سلام خوش اومدی!\n" +
        "🎮 اینجا بازیِ زندگیه!\n\n" +
        "برای شروع بزن:\n" +
        "🧒 /kid"
    );
    return;
  }

  // /kid
  if (text === "/kid") {
    state.age = 6;
    state.step = "childhood";
    await sendMessage(
      chatId,
      "🧒✨ الان ۶ سالته!\n" +
        "⏳ وقت انتخابه...\n\n" +
        "🏫 بری مدرسه: /school\n" +
        "🕹️ بری بازی: /play\n\n" +
        "📌 وضعیت: /status"
    );
    return;
  }

  // /school (فقط وقتی تو مرحله childhood باشه)
  if (text === "/school" && state.step === "childhood") {
    state.age = 7;
    state.step = "student";
    await sendMessage(
      chatId,
      "🏫📚 آفرین! رفتی مدرسه!\n" +
        "🧠✨ مغزت آپدیت شد!\n\n" +
        "🎂 الان ۷ سالته.\n" +
        "📊 ببین چی شد: /status\n\n" +
        "ادامه می‌خوای؟ بگو مرحله بعدی رو بسازم 😄🔧"
    );
    return;
  }

  // /play (فقط وقتی تو مرحله childhood باشه)
  if (text === "/play" && state.step === "childhood") {
    state.age = 7;
    state.money -= 10;
    state.step = "gamer";
    await sendMessage(
      chatId,
      "🕹️🔥 رفتی بازی!\n" +
        "😎 خوش گذشت ولی...\n" +
        "💸 ۱۰ سکه خرج کردی!\n\n" +
        "🎂 الان ۷ سالته.\n" +
        "📊 وضعیت: /status\n\n" +
        "ادامه می‌خوای؟ مرحله بعدی رو می‌سازیم 🚀"
    );
    return;
  }

  // /status
  if (text === "/status") {
    await sendMessage(
      chatId,
      "📊✨ وضعیت فعلی شما:\n" +
        `🎂 سن: ${state.age}\n` +
        `💰 سکه: ${state.money}\n` +
        `🧩 مرحله: ${state.step}\n\n` +
        "🧒 شروع دوباره: /kid\n" +
        "🔁 از اول: /start"
    );
    return;
  }

  // حالت اشتباه/نامرتبط
  await sendMessage(
    chatId,
    "🤔😅 این دستور رو نفهمیدم!\n\n" +
      "📌 اینا رو امتحان کن:\n" +
      "🚀 /start\n" +
      "🧒 /kid\n" +
      "📊 /status"
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on :${PORT}`));
