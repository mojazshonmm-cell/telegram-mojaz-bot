import express from 'express';
import bodyParser from 'body-parser'; // برای پردازش webhook

const app = express();
// const PORT = process.env.PORT || 3000; // Railway خودش پورت را مدیریت می‌کند

// استفاده از body-parser برای پردازش JSON payload از تلگرام
app.use(bodyParser.json());

// ----- متغیرهای محیطی -----
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN in variables is missing!");
if (!SECRET_PATH) throw new Error("SECRET_PATH in variables is missing!");

const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ----- تابع کمکی برای ارسال پیام -----
async function sendTelegramMessage(chatId, text, options = {}) {
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML', // برای استفاده از فرمت‌بندی HTML
        ...options, // شامل inline_keyboard و بقیه آپشن‌ها
      }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`Telegram API Error: ${data.description}`);
      // اینجا می‌توان خطا را مدیریت کرد، مثلاً پیام به کاربر یا لاگ دقیق‌تر
      if (data.error_code === 400 && data.description.includes('chat not found')) {
          console.warn(`Chat ID ${chatId} not found. Maybe the user blocked the bot?`);
      }
    }
    return data.result;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

// ----- تابع کمکی برای ویرایش پیام -----
async function editTelegramMessage(chatId, messageId, text, options = {}) {
    try {
        const response = await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'HTML',
                ...options,
            }),
        });
        const data = await response.json();
        if (!data.ok) {
            console.error(`Telegram API Error (editMessageText): ${data.description}`);
        }
        return data.result;
    } catch (error) {
        console.error('Error editing message:', error);
        return null;
    }
}


// ----- ساخت Inline Keyboard -----
function getMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "بازی کن 🚀", callback_data: "play_game" }],
      [{ text: "امتیازات برتر 🏆", callback_data: "high_scores" }],
      [{ text: "راهنما ❓", callback_data: "help" }],
    ],
  };
}

function getGameMenuKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "شروع مرحله اول 🟢", callback_data: "start_level_1" }],
            [{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }],
        ]
    };
}


// ----- مسیر Webhook -----
app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  // همیشه یک پاسخ 200 OK سریع بفرست تا تلگرام دوباره پیام نفرستد
  res.sendStatus(200);

  const update = req.body;

  // اگر callback_query بود (یعنی کاربر روی inline button کلیک کرده)
  if (update.callback_query) {
    const callbackQuery = update.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data; // اطلاعات دکمه کلیک شده
    const firstName = callbackQuery.from.first_name || "کاربر";

    console.log(`Received callback query: ${data} from chat ID: ${chatId}`);

    // بررسی data و اجرای دستورات مربوطه
    if (data === "play_game") {
      await sendTelegramMessage(chatId, `سلام ${firstName}! آماده‌ای بازی کنیم؟`, getGameMenuKeyboard());
      // ویرایش پیام اصلی برای اینکه دکمه‌ها از روش برداشته شوند (اختیاری)
      // await editTelegramMessage(chatId, messageId, "شما گزینه 'بازی کن' را انتخاب کردید.");
    } else if (data === "high_scores") {
      await sendTelegramMessage(chatId, "امتیازات برتر به زودی نمایش داده می‌شود...", { inline_keyboard: [[{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }]] });
    } else if (data === "help") {
      await sendTelegramMessage(chatId, "این ربات به شما امکان بازی می‌دهد. برای شروع، دکمه 'بازی کن' را بزنید.", { inline_keyboard: [[{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }]] });
    } else if (data === "start_level_1") {
        await sendTelegramMessage(chatId, "شروع مرحله اول...", { inline_keyboard: [[{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }]] });
        // اینجا منطق شروع مرحله اول بازی اضافه می‌شود
    } else if (data === "back_to_menu") {
        // پیام فعلی را ویرایش کن و منوی اصلی را برگردان
        await editTelegramMessage(chatId, messageId, "به منوی اصلی خوش آمدید!", getMainMenuKeyboard());
    } else {
      // اگر دکمه ناشناخته بود
      await sendTelegramMessage(chatId, "دستور ناشناخته.", { inline_keyboard: [[{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }]] });
    }

  } else if (update.message) { // اگر پیام عادی بود
    const message = update.message;
    const chatId = message.chat.id;
    const firstName = message.from.first_name || "کاربر";
    const text = message.text.trim();

    console.log(`Received message: "${text}" from chat ID: ${chatId}`);

    if (text === '/start') {
      // نمایش منوی اصلی با دکمه‌های inline
      await sendTelegramMessage(chatId, `سلام ${firstName} عزیز! \nبه ربات خوش آمدی. گزینه‌ی مورد نظرت را انتخاب کن:`, getMainMenuKeyboard());
    } else {
      // اگر کاربر پیام متنی فرستاد که با دستور /start شروع نمی‌شود
      await sendTelegramMessage(chatId, "لطفاً از دکمه‌های زیر برای تعامل با ربات استفاده کن.", getMainMenuKeyboard());
    }
  }
});

// ----- اجرای سرور -----
// Railway پورت را از طریق متغیر محیطی PORT تعیین می‌کند
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Webhook setup expected at: /webhook/${SECRET_PATH}`);
});
