import express from "express";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET = process.env.SECRET;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) throw new Error("Missing env BOT_TOKEN");
if (!SECRET) throw new Error("Missing env SECRET");

// --- in-memory DB (temporary) ---
const users = new Map(); // key: chatId, value: user state

function getUser(chatId) {
  if (!users.has(chatId)) {
    users.set(chatId, {
      step: "idle",     // idle | kid_menu
      age: 6,
      money: 10,
      energy: 10,
      xp: 0,
    });
  }
  return users.get(chatId);
}

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!data.ok) {
    console.error("Telegram API error:", data);
  }
  return data;
}

function statusText(u) {
  return (
    `وضعیتت:\n` +
    `سن: ${u.age}\n` +
    `پول: ${u.money}\n` +
    `انرژی: ${u.energy}\n` +
    `تجربه: ${u.xp}\n`
  );
}

// health
app.get("/", (_req, res) => res.status(200).send("OK"));

app.post(`/webhook/${SECRET}`, async (req, res) => {
  // IMPORTANT: respond fast to Telegram
  res.sendStatus(200);

  const msg = req.body?.message;
  if (!msg?.chat?.id || !msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  const u = getUser(chatId);

  // commands
  if (text === "/start") {
    users.set(chatId, { step: "idle", age: 6, money: 10, energy: 10, xp: 0 });
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `خوش اومدی!\n` +
        `این یه بازی متنیه.\n\n` +
        `برای شروع بزن: /kid\n` +
        `برای دیدن وضعیت: /status`,
    });
    return;
  }

  if (text === "/status") {
    await tg("sendMessage", { chat_id: chatId, text: statusText(u) });
    return;
  }

  if (text === "/reset") {
    users.delete(chatId);
    await tg("sendMessage", { chat_id: chatId, text: "ریست شد. دوباره /start بزن." });
    return;
  }

  if (text === "/kid") {
    u.step = "kid_menu";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `شیش سالته. انتخاب کن:\n/school یا /play`,
    });
    return;
  }

  // stage actions
  if (u.step === "kid_menu") {
    if (text === "/school") {
      // effects
      u.xp += 3;
      u.energy -= 2;
      u.money -= 1;
      if (u.energy < 0) u.energy = 0;

      u.step = "idle";
      await tg("sendMessage", {
        chat_id: chatId,
        text:
          `رفتی مدرسه. +تجربه، -انرژی، -پول\n\n` +
          statusText(u) +
          `مرحله بعد؟ دوباره /kid بزن.`,
      });
      return;
    }

    if (text === "/play") {
      u.xp += 1;
      u.energy -= 1;
      u.money -= 0; // بازی مجانی :)
      if (u.energy < 0) u.energy = 0;

      u.step = "idle";
      await tg("sendMessage", {
        chat_id: chatId,
        text:
          `بازی کردی. +تجربه کم، -انرژی کم\n\n` +
          statusText(u) +
          `مرحله بعد؟ دوباره /kid بزن.`,
      });
      return;
    }

    await tg("sendMessage", {
      chat_id: chatId,
      text: `فقط یکی از اینا رو انتخاب کن:\n/school یا /play`,
    });
    return;
  }

  // default
  await tg("sendMessage", {
    chat_id: chatId,
    text: `دستورها:\n/start\n/kid\n/status\n/reset`,
  });
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
