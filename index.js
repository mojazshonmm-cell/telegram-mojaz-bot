const express = require("express");

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH || "secret";
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// =========================
// In-memory game store
// =========================
const players = new Map();

// =========================
// Helpers
// =========================
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function chance(probability) {
  return Math.random() < probability;
}

function getEducationName(level) {
  const map = {
    0: "بی‌سواد رسمی ولی بااعتمادبه‌نفس",
    1: "ابتدایی",
    2: "راهنمایی",
    3: "دبیرستان",
    4: "لیسانس",
    5: "فوق‌لیسانس",
    6: "دکترا"
  };
  return map[level] || "نامشخص";
}

function getJobName(job) {
  const jobs = {
    none: "بیکار حرفه‌ای",
    worker: "کارگر",
    artist: "هنرمند",
    bartender: "ساقی",
    doctor: "پزشک",
    entrepreneur: "کارآفرین"
  };
  return jobs[job] || "نامشخص";
}

function createNewPlayer(user) {
  return {
    id: user.id,
    firstName: user.first_name || "رفیق",
    age: 18,
    money: 1000,
    energy: 80,
    happiness: 70,
    intelligence: 60,
    health: 80,
    education: 3,
    job: "none",
    married: false,
    children: 0,
    house: false,
    car: false,
    alive: true,
    log: ["زندگی از ۱۸ سالگی شروع شد."],
    lastEvent: "هنوز هیچ گندی نزدی. امیدوارکننده‌ست."
  };
}

function getPlayer(user) {
  if (!players.has(user.id)) {
    players.set(user.id, createNewPlayer(user));
  }
  return players.get(user.id);
}

function resetPlayer(user) {
  const player = createNewPlayer(user);
  players.set(user.id, player);
  return player;
}

function statBar(value) {
  const full = Math.round(value / 10);
  const empty = 10 - full;
  return "🟩".repeat(full) + "⬜".repeat(empty);
}

function formatStatus(player) {
  return `
🎭 <b>وضعیت زندگی ${escapeHtml(player.firstName)}</b>

👤 سن: <b>${player.age}</b>
💰 پول: <b>${player.money}$</b>
⚡ انرژی: <b>${player.energy}</b> ${statBar(player.energy)}
😄 خوشحالی: <b>${player.happiness}</b> ${statBar(player.happiness)}
🧠 هوش: <b>${player.intelligence}</b> ${statBar(player.intelligence)}
❤️ سلامتی: <b>${player.health}</b> ${statBar(player.health)}

🎓 تحصیلات: <b>${getEducationName(player.education)}</b>
💼 شغل: <b>${getJobName(player.job)}</b>
💍 ازدواج: <b>${player.married ? "داره" : "نداره"}</b>
👶 بچه: <b>${player.children}</b>
🏠 خانه: <b>${player.house ? "دارد" : "ندارد"}</b>
🚗 ماشین: <b>${player.car ? "دارد" : "ندارد"}</b>

📝 آخرین اتفاق:
<i>${escapeHtml(player.lastEvent)}</i>
  `.trim();
}

function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📊 وضعیت من", callback_data: "menu_status" }],
      [{ text: "⏭ سال بعد", callback_data: "next_year" }],
      [{ text: "🎓 تحصیل", callback_data: "menu_education" }],
      [{ text: "💼 شغل", callback_data: "menu_job" }],
      [{ text: "🎉 تفریح", callback_data: "act_fun" }, { text: "😴 استراحت", callback_data: "act_rest" }],
      [{ text: "💍 ازدواج", callback_data: "act_marry" }, { text: "👶 بچه‌دار شو", callback_data: "act_child" }],
      [{ text: "🏠 خرید خانه", callback_data: "act_buy_house" }, { text: "🚗 خرید ماشین", callback_data: "act_buy_car" }],
      [{ text: "🔄 شروع دوباره", callback_data: "restart_game" }]
    ]
  };
}

function educationKeyboard(player) {
  return {
    inline_keyboard: [
      [{ text: "📘 تا مقطع بعدی ادامه تحصیل", callback_data: "study_next" }],
      [{ text: "📊 وضعیت", callback_data: "menu_status" }],
      [{ text: "⬅️ بازگشت", callback_data: "back_main" }]
    ]
  };
}

function jobsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👷 کارگر", callback_data: "job_worker" }, { text: "🎨 هنرمند", callback_data: "job_artist" }],
      [{ text: "🍷 ساقی", callback_data: "job_bartender" }, { text: "🩺 پزشک", callback_data: "job_doctor" }],
      [{ text: "💸 کارآفرین", callback_data: "job_entrepreneur" }],
      [{ text: "⬅️ بازگشت", callback_data: "back_main" }]
    ]
  };
}

function startKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🎮 شروع بازی", callback_data: "start_game" }]
    ]
  };
}

function gameOverKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔄 دوباره از نو", callback_data: "restart_game" }],
      [{ text: "📊 دیدن وضعیت", callback_data: "menu_status" }]
    ]
  };
}

// =========================
// Telegram API helpers
// =========================
async function telegram(method, payload) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log(`📨 Telegram ${method}:`, JSON.stringify(data));

    return data;
  } catch (error) {
    console.error(`❌ Telegram ${method} failed:`, error);
    return null;
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text
  });
}

// =========================
// Game logic
// =========================
function canBecomeDoctor(player) {
  return player.education >= 4 && player.intelligence >= 70;
}

function canBecomeEntrepreneur(player) {
  return player.money >= 2000 || player.intelligence >= 75;
}

function getYearlySalary(player) {
  switch (player.job) {
    case "worker":
      return rand(700, 1400);
    case "artist":
      return rand(300, 2600);
    case "bartender":
      return rand(800, 2200);
    case "doctor":
      return rand(2500, 5000);
    case "entrepreneur":
      return rand(-1500, 7000);
    default:
      return 0;
  }
}

function applyJobEffect(player) {
  if (player.job === "worker") {
    player.energy -= rand(8, 14);
    player.health -= rand(2, 6);
  } else if (player.job === "artist") {
    player.happiness += rand(4, 10);
    player.money += rand(-200, 400);
  } else if (player.job === "bartender") {
    player.money += rand(200, 700);
    player.health -= rand(4, 12);
    player.happiness += rand(-4, 8);
  } else if (player.job === "doctor") {
    player.money += rand(400, 900);
    player.energy -= rand(6, 12);
    player.intelligence += rand(1, 3);
  } else if (player.job === "entrepreneur") {
    const roll = Math.random();
    if (roll < 0.25) {
      player.money -= rand(500, 2000);
      player.lastEvent = "استارتاپت مثل یخ وسط تابستون آب شد.";
    } else if (roll < 0.70) {
      player.money += rand(500, 2500);
      player.lastEvent = "یه قرارداد بستی و فعلاً قیافه موفق‌ها رو گرفتی.";
    } else {
      player.money += rand(2500, 6000);
      player.lastEvent = "استارتاپ ترکوند! همه می‌گن نابغه‌ای، خودت می‌دونی شانسی بود.";
    }
    player.energy -= rand(8, 16);
    player.happiness += rand(-5, 6);
  }
}

function randomEvent(player) {
  const roll = Math.random();

  if (roll < 0.10) {
    const prize = rand(500, 5000);
    player.money += prize;
    player.happiness += 10;
    player.lastEvent = `لاتاری بردی و ${prize}$ خورد تو حسابت. بالاخره دنیا یه بار هم بهت لبخند زد.`;
  } else if (roll < 0.20) {
    const loss = rand(200, 2000);
    player.money -= loss;
    player.happiness -= 8;
    player.lastEvent = `یه خرج الکی ${loss}$ رو دستت گذاشت. زندگی گفت سورپرایز.`;
  } else if (roll < 0.28) {
    player.health -= rand(8, 18);
    player.money -= rand(100, 700);
    player.lastEvent = "یه تصادف تابلو کردی. زنده‌ای، ولی با آبروی کمتر.";
  } else if (roll < 0.36) {
    player.intelligence += rand(3, 8);
    player.lastEvent = "یه کتاب خوب خوندی و ناگهان مغزت روشن شد.";
  } else if (roll < 0.44) {
    player.happiness += rand(8, 15);
    player.lastEvent = "یه سفر خفن رفتی و چند روزی آدم شدی.";
  } else if (roll < 0.50) {
    player.energy += rand(10, 18);
    player.health += rand(4, 10);
    player.lastEvent = "غذا و خواب درست‌حسابی داشتی؛ بدنِ محترم تشکر کرد.";
  } else if (roll < 0.56) {
    player.money += rand(200, 1500);
    player.lastEvent = "یه کار رندانه کردی و یه پولی از جیب دنیا کشیدی بیرون.";
  } else if (roll < 0.62) {
    player.happiness -= rand(6, 12);
    player.lastEvent = "عشق یک‌طرفه دوباره اومد سراغت. چه چیز مزخرفی.";
  } else if (roll < 0.68) {
    player.health += rand(5, 10);
    player.lastEvent = "چکاپ دادی و دکتر گفت فعلاً نمی‌میری. خبر خوبیه.";
  } else if (roll < 0.73) {
    player.money += rand(1000, 4000);
    player.lastEvent = "یه آشنای دور از ناکجاآباد یه ارث ریز و مشکوک برات گذاشت.";
  } else if (roll < 0.78) {
    player.happiness += 5;
    player.intelligence += 4;
    player.lastEvent = "با یه آدم باحال آشنا شدی. فعلاً زندگی بوی لجن نمی‌ده.";
  } else if (roll < 0.83) {
    player.money -= rand(300, 1200);
    player.health -= rand(3, 8);
    player.lastEvent = "مریض شدی و پول دوا دکتر ازت انتقام گرفت.";
  } else if (roll < 0.88) {
    player.happiness += 12;
    player.lastEvent = "یه مهمونی رفتی که بعدش تا یک هفته الکی لبخند می‌زدی.";
  } else if (roll < 0.93) {
    player.intelligence -= rand(1, 5);
    player.lastEvent = "یه مدت خیلی احمقانه تصمیم گرفتی. نگران نباش، طبیعیته.";
  } else {
    player.money += rand(500, 2500);
    player.happiness += rand(5, 10);
    player.lastEvent = "شایعه شده فضایی‌ها برکت دادن به زندگیت. توضیح منطقی نداریم.";
  }
}

function processYear(player) {
  player.age += 1;

  // base effects
  player.energy -= rand(4, 10);
  player.happiness -= rand(1, 4);
  player.health -= rand(1, 5);

  // family costs
  if (player.married) {
    player.money -= rand(150, 500);
    player.happiness += rand(-2, 5);
  }

  if (player.children > 0) {
    player.money -= player.children * rand(200, 500);
    player.energy -= player.children * rand(1, 3);
    player.happiness += player.children * rand(0, 2);
  }

  // house & car expenses
  if (player.house) {
    player.money -= rand(100, 300);
  }

  if (player.car) {
    player.money -= rand(100, 400);
  }

  // salary
  const salary = getYearlySalary(player);
  player.money += salary;

  // job effects
  applyJobEffect(player);

  // random event
  if (!player.lastEvent || player.lastEvent.includes("شروع")) {
    randomEvent(player);
  } else {
    if (chance(0.75)) {
      randomEvent(player);
    }
  }

  // age effects
  if (player.age >= 40) {
    player.health -= rand(1, 4);
    player.energy -= rand(1, 3);
  }

  if (player.age >= 55) {
    player.health -= rand(2, 6);
  }

  // clamp
  player.energy = clamp(player.energy, 0, 100);
  player.happiness = clamp(player.happiness, 0, 100);
  player.intelligence = clamp(player.intelligence, 0, 100);
  player.health = clamp(player.health, 0, 100);

  // money can go negative
  player.log.push(`در ${player.age} سالگی: ${player.lastEvent}`);
}

function checkGameStatus(player) {
  if (player.health <= 0) {
    player.alive = false;
    return {
      over: true,
      text: "☠️ <b>پایان بازی</b>\nسلامتی‌ات ته کشید و عمرت به آخر رسید. زیادم تعجب نداره با این سبک زندگی."
    };
  }

  if (player.energy <= 0) {
    player.alive = false;
    return {
      over: true,
      text: "💀 <b>پایان بازی</b>\nاز شدت فرسودگی و بی‌انرژی بودن، عملاً سیستم خاموش شد."
    };
  }

  if (player.money < -5000) {
    player.alive = false;
    return {
      over: true,
      text: "💸 <b>پایان بازی</b>\nورشکست شدی و زندگی با لگد پرتت کرد بیرون."
    };
  }

  if (player.age >= 60) {
    player.alive = false;

    let title = "زندگی معمولی";
    if (player.money >= 30000 && player.happiness >= 70) {
      title = "افسانه پولدارِ خوشحال";
    } else if (player.money >= 20000) {
      title = "پیرِ پولدار";
    } else if (player.education >= 5 && player.job === "doctor") {
      title = "فرهیخته‌ی زحمتکش";
    } else if (player.children >= 2 && player.married) {
      title = "خانواده‌سالارِ خسته";
    } else if (player.job === "artist" && player.happiness >= 75) {
      title = "هنرمندِ دیوانه ولی راضی";
    }

    return {
      over: true,
      text: `🎬 <b>پایان زندگی</b>\nتو تا ۶۰ سالگی زنده موندی.\n🏆 لقب نهایی تو: <b>${title}</b>`
    };
  }

  return { over: false };
}

// =========================
// Screens
// =========================
async function showWelcome(chatId, firstName = "رفیق") {
  const text = `
🎮 <b>بازی زندگی طنز</b>

سلام <b>${escapeHtml(firstName)}</b>!
اینجا قراره از ۱۸ سالگی زندگیتو جلو ببری:
تحصیل کنی، کار پیدا کنی، پول دربیاری، عشق و بدبختی بچشی و ببینی آخرش چی از آب درمیای 😈

برای شروع روی دکمه زیر بزن.
  `.trim();

  return sendMessage(chatId, text, {
    reply_markup: startKeyboard()
  });
}

async function showMainMenu(chatId, player, messageId = null) {
  const text = formatStatus(player);

  if (messageId) {
    return editMessage(chatId, messageId, text, {
      reply_markup: mainMenuKeyboard()
    });
  }

  return sendMessage(chatId, text, {
    reply_markup: mainMenuKeyboard()
  });
}

async function showEducationMenu(chatId, player, messageId) {
  const text = `
🎓 <b>بخش تحصیل</b>

سطح فعلی: <b>${getEducationName(player.education)}</b>

هر بار ادامه تحصیل:
- کمی پول کم می‌کند
- هوش را زیاد می‌کند
- آینده شغلی را بهتر می‌کند

می‌خوای ادامه بدی یا برگردی؟
  `.trim();

  return editMessage(chatId, messageId, text, {
    reply_markup: educationKeyboard(player)
  });
}

async function showJobMenu(chatId, player, messageId) {
  const text = `
💼 <b>بخش شغل</b>

شغل فعلی: <b>${getJobName(player.job)}</b>

شرایط بعضی شغل‌ها:
🩺 پزشک: حداقل لیسانس + هوش بالا
💸 کارآفرین: پول اولیه یا هوش مناسب

یکی رو انتخاب کن.
  `.trim();

  return editMessage(chatId, messageId, text, {
    reply_markup: jobsKeyboard()
  });
}

async function showGameOver(chatId, player, gameOverText, messageId = null) {
  const finalText = `
${gameOverText}

📊 <b>خلاصه نهایی</b>
👤 سن: <b>${player.age}</b>
💰 پول: <b>${player.money}$</b>
🎓 تحصیلات: <b>${getEducationName(player.education)}</b>
💼 شغل: <b>${getJobName(player.job)}</b>
💍 ازدواج: <b>${player.married ? "بله" : "خیر"}</b>
👶 بچه: <b>${player.children}</b>
🏠 خانه: <b>${player.house ? "دارد" : "ندارد"}</b>
🚗 ماشین: <b>${player.car ? "دارد" : "ندارد"}</b>
  `.trim();

  if (messageId) {
    return editMessage(chatId, messageId, finalText, {
      reply_markup: gameOverKeyboard()
    });
  }

  return sendMessage(chatId, finalText, {
    reply_markup: gameOverKeyboard()
  });
}

// =========================
// Actions
// =========================
function doStudy(player) {
  if (player.education >= 6) {
    player.lastEvent = "دیگه دکترا هم گرفتی، الان بیشتر از این فقط باید دانشگاه بزنی.";
    return;
  }

  const cost = rand(400, 1200);

  if (player.money < cost) {
    player.lastEvent = `پول ادامه تحصیل نداشتی. دانشگاه هم گفت اول پول، بعد ژست علمی.`;
    return;
  }

  player.money -= cost;
  player.education += 1;
  player.intelligence += rand(5, 10);
  player.energy -= rand(4, 8);
  player.happiness += rand(1, 5);

  player.intelligence = clamp(player.intelligence, 0, 100);
  player.energy = clamp(player.energy, 0, 100);
  player.happiness = clamp(player.happiness, 0, 100);

  player.lastEvent = `تحصیلت رو تا <b>${getEducationName(player.education)}</b> ادامه دادی. یه کم باکلاس‌تر شدی.`;
}

function doRest(player) {
  player.energy = clamp(player.energy + rand(12, 25), 0, 100);
  player.health = clamp(player.health + rand(4, 10), 0, 100);
  player.happiness = clamp(player.happiness + rand(2, 7), 0, 100);
  player.lastEvent = "استراحت کردی و برای مدتی از حالت جنازه فاصله گرفتی.";
}

function doFun(player) {
  const cost = rand(100, 600);
  if (player.money < cost) {
    player.lastEvent = "خواستی تفریح کنی ولی جیبت گفت بشین سر جات.";
    player.happiness -= 2;
    player.happiness = clamp(player.happiness, 0, 100);
    return;
  }

  player.money -= cost;
  player.happiness = clamp(player.happiness + rand(8, 18), 0, 100);
  player.energy = clamp(player.energy - rand(2, 8), 0, 100);
  player.lastEvent = `رفتی تفریح و ${cost}$ دود شد، ولی حداقل بهت خوش گذشت.`;
}

function doMarry(player) {
  if (player.married) {
    player.lastEvent = "تو همین الانم متأهلی، دیگه شورشو درنیار.";
    return;
  }

  if (player.age < 22) {
    player.lastEvent = "هنوز برای ازدواج زیادی خامی. اول خودتو جمع کن.";
    return;
  }

  if (player.money < 1500) {
    player.lastEvent = "خواستی ازدواج کنی ولی هزینه‌ها بهت خندیدن.";
    return;
  }

  if (chance(0.65)) {
    player.married = true;
    player.money -= rand(1000, 3000);
    player.happiness = clamp(player.happiness + rand(10, 20), 0, 100);
    player.lastEvent = "ازدواج کردی. از اینجا به بعد یا عاشقانه‌ست یا هزینه‌محور.";
  } else {
    player.happiness = clamp(player.happiness - rand(5, 12), 0, 100);
    player.lastEvent = "جواب رد شنیدی. دنیا همون‌قدر بی‌رحمه که فکر می‌کردی.";
  }
}

function doChild(player) {
  if (!player.married) {
    player.lastEvent = "اول باید ازدواج کنی، بعد وارد فاز بچه و بی‌خوابی بشی.";
    return;
  }

  const cost = rand(500, 1500);
  if (player.money < cost) {
    player.lastEvent = "از نظر احساسی آماده بودی، از نظر مالی مضحک.";
    return;
  }

  if (chance(0.7)) {
    player.children += 1;
    player.money -= cost;
    player.happiness = clamp(player.happiness + rand(8, 16), 0, 100);
    player.energy = clamp(player.energy - rand(5, 12), 0, 100);
    player.lastEvent = `بچه‌دار شدی. مبارکه! حالا رسماً خواب باهات قهر می‌کنه.`;
  } else {
    player.lastEvent = "فعلاً بچه‌دار نشدی. شاید کائنات گفتن هنوز وقت فاجعه نیست.";
  }
}

function doBuyHouse(player) {
  if (player.house) {
    player.lastEvent = "تو قبلاً خونه خریدی، مگه چندتا می‌خوای؟";
    return;
  }

  const price = rand(8000, 15000);
  if (player.money < price) {
    player.lastEvent = `خواستی خونه بخری ولی ${price}$ کم داشتی، یعنی تقریباً هیچی نداشتی.`;
    return;
  }

  player.house = true;
  player.money -= price;
  player.happiness = clamp(player.happiness + 15, 0, 100);
  player.lastEvent = `خونه خریدی! ${price}$ پرید ولی حس بزرگسالی همزمان فعال شد.`;
}

function doBuyCar(player) {
  if (player.car) {
    player.lastEvent = "تو ماشین داری. دنبال کلکسیونری یا چی؟";
    return;
  }

  const price = rand(3000, 8000);
  if (player.money < price) {
    player.lastEvent = `برای خرید ماشین ${price}$ لازم داشتی، ولی جیبت خندید و رد شد.`;
    return;
  }

  player.car = true;
  player.money -= price;
  player.happiness = clamp(player.happiness + 8, 0, 100);
  player.lastEvent = `ماشین خریدی. حالا می‌تونی تو ترافیک با پرستیژ بیشتری حرص بخوری.`;
}

function setJob(player, jobKey) {
  if (jobKey === "worker") {
    player.job = "worker";
    player.lastEvent = "شغل کارگری رو گرفتی. زحمت زیاد، پول متوسط، کمر درد رایگان.";
    return true;
  }

  if (jobKey === "artist") {
    player.job = "artist";
    player.lastEvent = "هنرمند شدی. یا می‌درخشی یا نون خالی می‌خوری، وسط ندارد.";
    return true;
  }

  if (jobKey === "bartender") {
    player.job = "bartender";
    player.lastEvent = "ساقی شدی. درآمد بد نیست، ولی داستان و دردسر زیاده.";
    return true;
  }

  if (jobKey === "doctor") {
    if (!canBecomeDoctor(player)) {
      player.lastEvent = "برای پزشک شدن هنوز نه درسش رو داری نه قیافه اعتمادبخشش رو.";
      return false;
    }
    player.job = "doctor";
    player.lastEvent = "پزشک شدی. تبریک، از این به بعد خسته ولی پولدارتر می‌شی.";
    return true;
  }

  if (jobKey === "entrepreneur") {
    if (!canBecomeEntrepreneur(player)) {
      player.lastEvent = "برای کارآفرینی هنوز نه پولت می‌رسه نه مغزت کامل قانع‌کننده‌ست.";
      return false;
    }
    player.job = "entrepreneur";
    player.lastEvent = "کارآفرین شدی. یا می‌زنی می‌ترکونی یا می‌خوری زمین.";
    return true;
  }

  return false;
}

// =========================
// Routes
// =========================
app.get("/", (req, res) => {
  res.status(200).send("✅ Life Simulator Bot is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "life-simulator-bot"
  });
});

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  try {
    console.log("📥 Incoming update:", JSON.stringify(req.body, null, 2));
    const update = req.body;

    // message
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const user = msg.from || {};
      const text = msg.text || "";

      if (text.startsWith("/start")) {
        await showWelcome(chatId, user.first_name || "رفیق");
      } else if (text.startsWith("/status")) {
        const player = getPlayer(user);
        await showMainMenu(chatId
