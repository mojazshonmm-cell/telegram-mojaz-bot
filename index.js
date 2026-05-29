import express from 'express';

const app = express();
app.use(express.json());

// ----- متغیرهای محیطی -----
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN in variables is missing!");
if (!SECRET_PATH) throw new Error("SECRET_PATH in variables is missing!");

const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ----- تابع ارسال پیام (بدون نیاز به هیچ ایمپورت اضافی) -----
async function sendTelegramMessage(chatId, text, replyMarkup = {}) {
  try {
    // از fetch داخلی خود Node.js استفاده می‌کنیم
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        ...replyMarkup,
        parse_mode: 'HTML'
      }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`Telegram API Error: ${data.description}`);
    }
    return data.result;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

// ----- کیبوردهای ساده -----
function getMainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "شروع بازی 🚀" }, { text: "راهنما ❓" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function getBackButton() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "بازگشت به منو ↩️" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

// ----- مسیرهای سرور -----
app.get("/", (req, res) => res.status(200).send("Bot is Alive!"));

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  res.sendStatus(200); // پاسخ سریع به تلگرام

  const update = req.body;
  const message = update.message;

  if (!message || !message.chat || !message.text) return;

  const chatId = message.chat.id;
  const firstName = message.from.first_name || "کاربر";
  const text = message.text.trim();

  // ----- منطق ربات -----
  if (text === '/start') {
    await sendTelegramMessage(chatId, `سلام ${firstName} عزیز! به ربات خوش آمدی.\n\nبرای شروع یکی از گزینه‌های زیر را انتخاب کن:`, getMainKeyboard());
    return;
  }

  if (text === 'شروع بازی 🚀') {
    await sendTelegramMessage(chatId, "به بازی خوش آمدی! این بخش به زودی تکمیل می‌شود...", getBackButton());
    return;
  }

  if (text === 'راهنما ❓') {
    await sendTelegramMessage(chatId, "راهنمای ربات:\nبا دکمه شروع بازی می‌توانید مراحل را آغاز کنید.", getMainKeyboard());
    return;
  }

  if (text === 'بازگشت به منو ↩️') {
    await sendTelegramMessage(chatId, "به منوی اصلی برگشتید:", getMainKeyboard());
    return;
  }

  // اگر پیامی فرستاد که متوجه نشدیم
  await sendTelegramMessage(chatId, "متوجه این پیام نشدم. لطفاً از دکمه‌های منو استفاده کن.", getMainKeyboard());
});

// ----- اجرای سرور -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
