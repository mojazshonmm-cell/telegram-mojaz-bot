import express from 'express';

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH || 'max-secret';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN تنظیم نشده');
  process.exit(1);
}

app.get('/', (req, res) => {
  res.send('MAX bot is running ✅');
});

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  try {
    console.log('📩 update received');
    console.log(JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
  } catch (err) {
    console.error('webhook error:', err);
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Webhook path: /webhook/${SECRET_PATH}`);
});
