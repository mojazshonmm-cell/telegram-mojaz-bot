import express from 'express';
import fetch from 'node-fetch'; // در نسخه‌های جدید Node.js fetch داخلی است، اما برای اطمینان اضافه می‌کنیم
// اگر از SQLite استفاده می‌کنی، این خط را هم اضافه کن:
// import sqlite3 from 'better-sqlite3';

const app = express();
app.use(express.json());

// ----- متغیرهای محیطی -----
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // اختیاری

if (!BOT_TOKEN) throw new Error("BOT_TOKEN تعریف نشده است.");
if (!SECRET_PATH) throw new Error("SECRET_PATH تعریف نشده است.");

const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ----- توابع کمکی -----
async function sendTelegramMessage(chatId, text, replyMarkup = {}) {
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        ...replyMarkup,
        parse_mode: 'HTML' // برای استفاده از فرمت‌دهی HTML
      }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`Telegram API Error: ${data.description}`);
      if (ADMIN_CHAT_ID && chatId != ADMIN_CHAT_ID) {
        // اگر خطایی رخ داد و ادمین تعریف شده بود، به ادمین اطلاع بده
        await sendTelegramMessage(ADMIN_CHAT_ID, `خطا در ارسال پیام به ${chatId}: ${data.description}`);
      }
    }
    return data.result;
  } catch (error) {
    console.error('Error sending message:', error);
    if (ADMIN_CHAT_ID && chatId != ADMIN_CHAT_ID) {
      await sendTelegramMessage(ADMIN_CHAT_ID, `خطای فنی در ارسال پیام به ${chatId}: ${error.message}`);
    }
    return null;
  }
}

// ----- مدیریت دیتابیس (اگر لازم بود) -----
// const db = new sqlite3('./data/database.db'); // مسیر دیتابیس در Volume

// // برای ایجاد جدول در اولین اجرا
// db.exec(`CREATE TABLE IF NOT EXISTS users (
//     chatId INTEGER PRIMARY KEY,
//     firstName TEXT,
//     state TEXT DEFAULT 'start',
//     age INTEGER,
//     score INTEGER DEFAULT 0
// )`);

// // تابع برای گرفتن اطلاعات کاربر
// function getUser(chatId) {
//     const stmt = db.prepare('SELECT * FROM users WHERE chatId = ?');
//     return stmt.get(chatId);
// }

// // تابع برای ذخیره یا آپدیت کاربر
// function setUser(chatId, firstName, state = 'start', age = null, score = 0) {
//     const stmt = db.prepare(`
//         INSERT OR REPLACE INTO users (chatId, firstName, state, age, score)
//         VALUES (@chatId, @firstName, @state, @age, @score)
//     `);
//     stmt.run({ chatId, firstName, state, age, score });
// }


// ----- کیبوردها -----
function getMainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "بازی جدید 🚀" }, { text: "راهنما ❓" }],
        // [{ text: "امتیازات من ⭐" }] // مثال برای دکمه دیگر
      ],
      resize_keyboard: true, // اندازه کیبورد را بهینه می‌کند
      one_time_keyboard: true // کیبورد بعد از انتخاب یک بار نمایش داده شود
    }
  };
}

function getBackButton() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: "بازگشت ↩️" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
}


// ----- پردازش پیام‌های تلگرام -----
app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  res.sendStatus(200); // پاسخ سریع به تلگرام

  const update = req.body;
  const message = update.message;

  if (!message || !message.chat || !message.text) return;

  const chatId = message.chat.id;
  const firstName = message.from.first_name || "کاربر";
  const text = message.text.trim();

  // ----- پردازش دستورات -----
  if (text === '/start') {
    // const user = getUser(chatId); // اگر دیتابیس داری
    // if (!user) {
    //   setUser(chatId, firstName); // اگر دیتابیس داری
    // }
    await sendTelegramMessage(chatId, `سلام ${firstName}! 👋\nبه ربات ما خوش آمدی.\nبرای شروع بازی /menu را بزن.`, getMainKeyboard());
    return;
  }

  if (text === '/menu') {
    // const user = getUser(chatId); // اگر دیتابیس داری
    // if (user && user.state === 'playing') {
    //   await sendTelegramMessage(chatId, "شما در حال حاضر در بازی هستید. برای ادامه /continue یا برای شروع مجدد /restart را بزن.", getBackButton());
    // } else {
      await sendTelegramMessage(chatId, "لطفاً یکی از گزینه‌های زیر را انتخاب کن:", getMainKeyboard());
    // }
    return;
  }

   if (text === 'بازی جدید 🚀') {
       // اینجا منطق شروع بازی جدید را اضافه می‌کنیم
       // فعلا یک پیام ساده می‌فرستیم
       await sendTelegramMessage(chatId, "بازی در حال آماده‌سازی است...\n\n(اینجا بعدا سوال اول بازی پرسیده می‌شود)", getBackButton());
        // اگر از دیتابیس استفاده می‌کنی:
       // setUser(chatId, firstName, 'playing_stage_1'); // وضعیت کاربر را به مرحله ۱ بازی تغییر بده
       return;
   }

   if (text === 'راهنما ❓') {
       await sendTelegramMessage(chatId, "این ربات به شما کمک می‌کند تا یک بازی را تجربه کنید. با دستور /menu می‌توانید بازی را شروع کنید.", getMainKeyboard());
       return;
   }

   if (text === 'بازگشت ↩️') {
       await sendTelegramMessage(chatId, "به منوی اصلی خوش برگشتی.", getMainKeyboard());
       return;
   }

  // ----- اگر متن عادی بود -----
  await sendTelegramMessage(chatId, `متوجه نشدم. برای شروع /start یا برای دیدن منو /menu را بزن.`, getMainKeyboard());

});

// ----- سرور -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // وقتی سرور بالا آمد، اینجا می‌توانیم به ادمین هم اطلاع دهیم
  if (ADMIN_CHAT_ID) {
      sendTelegramMessage(ADMIN_CHAT_ID, `ربات با موفقیت بالا آمد (پورت ${PORT}).`);
  }
});
