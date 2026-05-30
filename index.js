import express from 'express';
import { getUser, statusText, mainMenu, back, reward } from './core.js';
import * as workMenu from './menus/work.js';

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH;
const PORT = process.env.PORT || 3000;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const handlers = [workMenu];

async function tg(method, payload) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return res.json();
}

async function sendMessage(chatId, text, keyboard = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML'
  };

  if (keyboard) {
    payload.reply_markup = { inline_keyboard: keyboard };
  }

  return tg('sendMessage', payload);
}

async function answerCallbackQuery(callbackQueryId) {
  return tg('answerCallbackQuery', { callback_query_id: callbackQueryId });
}

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  try {
    const { message, callback_query } = req.body || {};

    if (callback_query?.id) {
      await answerCallbackQuery(callback_query.id);
    }

    const chatId = message?.chat?.id || callback_query?.message?.chat?.id;
    if (!chatId) return res.sendStatus(200);

    const user = getUser(chatId);
    const text = message?.text;

    if (text === '/start') {
      await sendMessage(chatId, `سلام 👋\n\n${statusText(user)}`, mainMenu);
      return res.sendStatus(200);
    }

    if (!callback_query) {
      return res.sendStatus(200);
    }

    const data = callback_query.data;

    if (data === 'main' || data === 'refresh') {
      await sendMessage(chatId, `${statusText(user)}`, mainMenu);
      return res.sendStatus(200);
    }

    for (const h of handlers) {
      if (h.canHandle(data)) {
        const ok = await h.handle({
          chatId,
          data,
          user,
          sendMessage,
          back,
          reward
        });
        if (ok) {
          return res.sendStatus(200);
        }
      }
    }

    await sendMessage(chatId, '❓ گزینه نامعتبر است.', mainMenu);
    return res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    return res.sendStatus(200);
  }
});

app.get('/', (_, res) => res.send('Bot is running'));

app.listen(PORT, () => {
  console.log(`Running on ${PORT}`);
});
