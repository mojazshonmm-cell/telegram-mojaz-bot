import express from 'express';

const app = express();

// متغیرهای محیطی را مستقیماً از process.env بخوان
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH;
const PORT = process.env.PORT || 3000; // Railway پورت را از طریق PORT تامین می‌کند

// بررسی وجود توکن و مسیر مخفی
if (!BOT_TOKEN) {
    console.error("FATAL ERROR: BOT_TOKEN is not set in environment variables.");
    process.exit(1); // خروج از برنامه اگر توکن تنظیم نشده باشد
}
if (!SECRET_PATH) {
    console.error("FATAL ERROR: SECRET_PATH is not set in environment variables.");
    process.exit(1); // خروج از برنامه اگر مسیر مخفی تنظیم نشده باشد
}

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
            console.error(`Telegram API Error: ${data.description} (Code: ${data.error_code})`);
            // مدیریت خطاهای خاص
            if (data.error_code === 400 && data.description.includes('chat not found')) {
                console.warn(`Chat ID ${chatId} not found. User might have blocked the bot.`);
            }
        }
        return data.result;
    } catch (error) {
        console.error('Error sending message via Telegram API:', error);
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
            console.error(`Telegram API Error (editMessageText): ${data.description} (Code: ${data.error_code})`);
            // ممکن است پیام تکراری باشد یا خطای دیگری رخ دهد
             if (data.error_code === 400 && data.description.includes('message is not modified')) {
                 console.log('Message was not modified (already the same text).');
             }
        }
        return data.result;
    } catch (error) {
        console.error('Error editing message via Telegram API:', error);
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
// اطمینان حاصل کنید که Express JSON request body را پارس می‌کند
app.use(express.json());

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
    // همیشه یک پاسخ 200 OK سریع بفرست تا تلگرام دوباره پیام نفرستد
    res.sendStatus(200);

    const update = req.body;

    // پردازش callback_query (کلیک روی دکمه inline)
    if (update.callback_query) {
        const callbackQuery = update.callback_query;
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const data = callbackQuery.data;
        const firstName = callbackQuery.from.first_name || "کاربر";

        console.log(`Received callback query: "${data}" from chat ID: ${chatId}`);

        switch (data) {
            case "play_game":
                await sendTelegramMessage(chatId, `سلام ${firstName}! آماده‌ای بازی کنیم؟`, getGameMenuKeyboard());
                // Optional: Edit the original message to show the action taken
                // await editTelegramMessage(chatId, messageId, "شما گزینه 'بازی کن' را انتخاب کردید.");
                break;
            case "high_scores":
                await sendTelegramMessage(chatId, "امتیازات برتر به زودی نمایش داده می‌شود...", { inline_keyboard: [[{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }]] });
                break;
            case "help":
                await sendTelegramMessage(chatId, "این ربات به شما امکان بازی می‌دهد. برای شروع، دکمه 'بازی کن' را بزنید.", { inline_keyboard: [[{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }]] });
                break;
            case "start_level_1":
                await sendTelegramMessage(chatId, "شروع مرحله اول...", { inline_keyboard: [[{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }]] });
                // اینجا منطق شروع مرحله اول بازی اضافه می‌شود
                break;
            case "back_to_menu":
                // ویرایش پیام فعلی برای نمایش منوی اصلی
                await editTelegramMessage(chatId, messageId, "به منوی اصلی خوش آمدید!", getMainMenuKeyboard());
                break;
            default:
                await sendTelegramMessage(chatId, "دستور ناشناخته.", { inline_keyboard: [[{ text: "بازگشت به منو ↩️", callback_data: "back_to_menu" }]] });
                break;
        }

    } else if (update.message) { // پردازش پیام عادی
        const message = update.message;
        const chatId = message.chat.id;
        const firstName = message.from.first_name || "کاربر";
        const text = message.text.trim();

        console.log(`Received message: "${text}" from chat ID: ${chatId}`);

        if (text === '/start') {
            // نمایش منوی اصلی با دکمه‌های inline
            await sendTelegramMessage(chatId, `سلام ${firstName} عزیز! \nبه ربات خوش آمدی. گزینه‌ی مورد نظرت را انتخاب کن:`, getMainMenuKeyboard());
        } else {
            // پاسخ به پیام‌های متنی دیگر با نمایش منوی اصلی
            await sendTelegramMessage(chatId, "لطفاً از دکمه‌های زیر برای تعامل با ربات استفاده کن.", getMainMenuKeyboard());
        }
    }
});

// ----- مسیر اصلی برای چک کردن آنلاین بودن ربات -----
app.get("/", (req, res) => {
    res.send("Bot is running!");
});

// ----- اجرای سرور -----
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Webhook endpoint: /webhook/${SECRET_PATH}`);
});
