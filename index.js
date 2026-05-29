const express = require('express');
const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH || "mojaz0762";
const PORT = process.env.PORT || 3000;

// مسیر تست برای مرورگر
app.get('/', (req, res) => {
    res.send('✅ Bot is Online!');
});

// مسیر اصلی وب‌هوک
app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
    res.sendStatus(200);
    const update = req.body;
    
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;

        if (text === '/start') {
            const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
            try {
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: "سلام! ربات با موفقیت بالا آمد و آماده کار است. 🚀"
                    })
                });
            } catch (e) {
                console.error("Error sending message:", e);
            }
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
