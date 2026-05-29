import express from 'express';

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH;
const PORT = process.env.PORT || 3000;

// حافظه موقت برای ذخیره وضعیت بازی (اگر سرور ریستارت شود، پاک می‌شود)
const userStates = new Map();

const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ---------- Telegram Request Helper ----------
async function telegram(method, payload) {
    try {
        const res = await fetch(`${TELEGRAM_API_URL}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return await res.json();
    } catch (err) {
        console.error(err);
        return { ok: false };
    }
}

// ---------- Keyboards (Glass Buttons) ----------
const mainMenu = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: "🎮 شروع بازی", callback_data: "start_game" }],
            [{ text: "❓ راهنما", callback_data: "help" }]
        ]
    }
});

const gameLevelMarkup = (options) => ({
    reply_markup: {
        inline_keyboard: options.map(opt => [{ text: opt.text, callback_data: opt.data }])
    }
});

const gameOverMarkup = () => ({
    reply_markup: {
        inline_keyboard: [[{ text: "🏠 بازگشت به منو", callback_data: "main_menu" }]]
    }
});

// ---------- Webhook Route ----------
app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
    res.sendStatus(200);
    const update = req.body;

    // --- مدیریت کلیک روی دکمه‌ها ---
    if (update.callback_query) {
        const { id, message, data, from } = update.callback_query;
        const chatId = message.chat.id;
        const msgId = message.message_id;

        await telegram('answerCallbackQuery', { callback_query_id: id }); // حذف حالت لودینگ دکمه

        if (data === "start_game") {
            userStates.set(chatId, { step: 1, score: 0 });
            await telegram('editMessageText', {
                chat_id: chatId, message_id: msgId, text: "سوال ۱: حاصل ۲ + ۲ چند است؟",
                ...gameLevelMarkup([{text: "3", data: "ans_wrong"}, {text: "4", data: "ans_correct1"}])
            });
        } 
        else if (data.startsWith("ans_correct")) {
            const state = userStates.get(chatId) || { step: 1, score: 0 };
            state.score += 10;
            
            if (state.step === 1) {
                state.step = 2;
                await telegram('editMessageText', {
                    chat_id: chatId, message_id: msgId, text: "آفرین! سوال ۲: پایتخت ایران کجاست؟",
                    ...gameLevelMarkup([{text: "تهران", data: "ans_correct2"}, {text: "شیراز", data: "ans_wrong"}])
                });
            } else {
                await telegram('editMessageText', {
                    chat_id: chatId, message_id: msgId, text: `🎉 عالی! بازی تمام شد.\nامتیاز نهایی: ${state.score}`,
                    ...gameOverMarkup()
                });
            }
        } 
        else if (data === "ans_wrong") {
            await telegram('editMessageText', {
                chat_id: chatId, message_id: msgId, text: "❌ غلط بود! بازی تمام شد.",
                ...gameOverMarkup()
            });
        }
        else if (data === "main_menu" || data === "help") {
            const text = data === "help" ? "این یک بازی کوییز ساده است." : "به منوی اصلی خوش آمدید.";
            await telegram('editMessageText', { chat_id: chatId, message_id: msgId, text, ...mainMenu() });
        }
    }

    // --- مدیریت پیام متنی /start ---
    if (update.message?.text === '/start') {
        await telegram('sendMessage', { chat_id: update.message.chat.id, text: "سلام! آماده بازی هستی؟", ...mainMenu() });
    }
});

app.listen(PORT, () => console.log(`Bot active on port ${PORT}`));
