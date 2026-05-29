import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is missing');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// دیتای ساده داخل حافظه
const users = new Map();

const jobs = {
  farmer: { name: 'کشاورز', minIncome: 15, maxIncome: 30, xp: 5 },
  miner: { name: 'معدن‌کار', minIncome: 20, maxIncome: 40, xp: 7 },
  guard: { name: 'نگهبان', minIncome: 25, maxIncome: 45, xp: 8 },
  merchant: { name: 'تاجر', minIncome: 30, maxIncome: 55, xp: 10 }
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getLevelFromXp(xp) {
  return Math.floor(xp / 100) + 1;
}

async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text
    });
  } catch (error) {
    console.error('sendMessage error:', error.response?.data || error.message);
  }
}

function getUser(userId, firstName = 'بازیکن') {
  if (!users.has(userId)) {
    users.set(userId, {
      id: userId,
      name: firstName,
      coins: 100,
      xp: 0,
      level: 1,
      energy: 100,
      health: 100,
      job: 'unemployed',
      inventory: []
    });
  }

  const user = users.get(userId);
  user.level = getLevelFromXp(user.xp);
  return user;
}

function getProfileText(user) {
  const jobName = user.job === 'unemployed' ? 'بیکار' : jobs[user.job]?.name || user.job;

  return `👤 نام: ${user.name}
🏆 لول: ${user.level}
✨ XP: ${user.xp}
💰 سکه: ${user.coins}
⚡ انرژی: ${user.energy}
❤️ سلامتی: ${user.health}
💼 شغل: ${jobName}
🎒 موجودی: ${user.inventory.length ? user.inventory.join('، ') : 'خالی'}`;
}

function getHelpText() {
  return `🎮 دستورات بازی:

/start - شروع بازی
/help - راهنما
/profile - پروفایل
/work - کار کردن
/relax - استراحت
/findjob - پیدا کردن شغل
/inventory - کیف وسایل
/shop - فروشگاه
/buybread - خرید نان
/eat - خوردن غذا
/fight - مبارزه
/heal - درمان`;
}

async function handleCommand(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const firstName = message.from.first_name || 'بازیکن';
  const messageText = (message.text || '').trim();

  const user = getUser(userId, firstName);

  if (messageText === '/start') {
    await sendMessage(
      chatId,
      `سلام ${firstName} 👋
به بازی متنی خوش اومدی.

تو الان 100 سکه، 100 انرژی و 100 سلامتی داری.
برای دیدن دستورات از /help استفاده کن.`
    );
    return;
  }

  if (messageText === '/help') {
    await sendMessage(chatId, getHelpText());
    return;
  }

  if (messageText === '/profile') {
    await sendMessage(chatId, getProfileText(user));
    return;
  }

  if (messageText === '/inventory') {
    const text = user.inventory.length
      ? `🎒 وسایل شما:\n- ${user.inventory.join('\n- ')}`
      : '🎒 کیف شما خالی است.';
    await sendMessage(chatId, text);
    return;
  }

  if (messageText === '/findjob') {
    const jobKeys = Object.keys(jobs);
    const selectedJob = jobKeys[randomBetween(0, jobKeys.length - 1)];
    user.job = selectedJob;

    await sendMessage(
      chatId,
      `💼 تبریک! شغل جدید پیدا کردی: ${jobs[selectedJob].name}
از حالا می‌تونی با /work کار کنی.`
    );
    return;
  }

  if (messageText === '/work') {
    if (!user.job || user.job === 'unemployed') {
      await sendMessage(chatId, 'شما شغلی ندارید. ابتدا با /findjob یک شغل پیدا کنید.');
      return;
    }

    if (user.energy < 20) {
      await sendMessage(chatId, '⚡ انرژی شما کافی نیست. لطفاً با /relax استراحت کن.');
      return;
    }

    const job = jobs[user.job];
    const income = randomBetween(job.minIncome, job.maxIncome);
    const gainedXp = randomBetween(job.xp, job.xp + 3);

    user.coins += income;
    user.xp += gainedXp;
    user.energy = Math.max(0, user.energy - 20);
    user.level = getLevelFromXp(user.xp);

    await sendMessage(
      chatId,
      `🛠 شما امروز به‌عنوان ${job.name} کار کردی.
💰 درآمد: ${income} سکه
✨ XP: ${gainedXp}
⚡ انرژی باقی‌مانده: ${user.energy}`
    );
    return;
  }

  if (messageText === '/relax') {
    const restored = randomBetween(15, 35);
    user.energy = Math.min(100, user.energy + restored);

    await sendMessage(
      chatId,
      `🛌 کمی استراحت کردی.
⚡ ${restored} انرژی برگشت.
⚡ انرژی فعلی: ${user.energy}`
    );
    return;
  }

  if (messageText === '/shop') {
    await sendMessage(
      chatId,
      `🏪 فروشگاه:

🥖 /buybread — نان (20 سکه)
بعد از خرید، با /eat آن را بخور.`
    );
    return;
  }

  if (messageText === '/buybread') {
    if (user.coins < 20) {
      await sendMessage(chatId, '💸 سکه‌ی کافی نداری.');
      return;
    }

    user.coins -= 20;
    user.inventory.push('نان');

    await sendMessage(chatId, '🥖 یک نان خریدی و داخل کیف گذاشتی.');
    return;
  }

  if (messageText === '/eat') {
    const breadIndex = user.inventory.indexOf('نان');

    if (breadIndex === -1) {
      await sendMessage(chatId, '🍽 چیزی برای خوردن نداری. اول از /shop خرید کن.');
      return;
    }

    user.inventory.splice(breadIndex, 1);
    user.energy = Math.min(100, user.energy + 25);
    user.health = Math.min(100, user.health + 10);

    await sendMessage(
      chatId,
      `🍞 نان خوردی.
⚡ انرژی: ${user.energy}
❤️ سلامتی: ${user.health}`
    );
    return;
  }

  if (messageText === '/fight') {
    if (user.energy < 15) {
      await sendMessage(chatId, '⚡ برای مبارزه انرژی کافی نداری. کمی استراحت کن.');
      return;
    }

    const win = Math.random() > 0.4;
    user.energy = Math.max(0, user.energy - 15);

    if (win) {
      const reward = randomBetween(20, 50);
      const gainedXp = randomBetween(8, 18);
      user.coins += reward;
      user.xp += gainedXp;
      user.level = getLevelFromXp(user.xp);

      await sendMessage(
        chatId,
        `⚔️ تو در مبارزه پیروز شدی!
💰 جایزه: ${reward} سکه
✨ XP: ${gainedXp}
⚡ انرژی: ${user.energy}`
      );
    } else {
      const damage = randomBetween(10, 25);
      user.health = Math.max(0, user.health - damage);

      await sendMessage(
        chatId,
        `💥 در مبارزه آسیب دیدی.
❤️ میزان آسیب: ${damage}
❤️ سلامتی فعلی: ${user.health}
⚡ انرژی: ${user.energy}`
      );
    }
    return;
  }

  if (messageText === '/heal') {
    if (user.coins < 30) {
      await sendMessage(chatId, '💸 برای درمان حداقل 30 سکه لازم داری.');
      return;
    }

    if (user.health >= 100) {
      await sendMessage(chatId, '❤️ سلامتی شما کامل است.');
      return;
    }

    user.coins -= 30;
    user.health = Math.min(100, user.health + 30);

    await sendMessage(
      chatId,
      `🩹 درمان انجام شد.
❤️ سلامتی فعلی: ${user.health}
💰 سکه باقی‌مانده: ${user.coins}`
    );
    return;
  }

  await sendMessage(chatId, '❓ دستور نامعتبر است. برای دیدن دستورات /help را بزن.');
}

app.get('/', (req, res) => {
  res.send('Bot is running');
});

app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;

    if (update.message) {
      await handleCommand(update.message);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('webhook error:', error);
    res.sendStatus(500);
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  if (BASE_URL) {
    try {
      await axios.post(`${TELEGRAM_API}/setWebhook`, {
        url: `${BASE_URL}/webhook`
      });
      console.log('Webhook set successfully');
    } catch (error) {
      console.error('setWebhook error:', error.response?.data || error.message);
    }
  } else {
    console.log('BASE_URL is missing, webhook not set');
  }
});
