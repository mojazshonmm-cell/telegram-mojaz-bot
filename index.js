// ===== BOT SETUP =====
import express from 'express';
import fetch from 'node-fetch'; // اگر node-fetch نصب نیست: npm install node-fetch

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH || 'mysecretpath'; // مسیر امن برای webhook

const WEBHOOK_URL = `https://your-domain.com/webhook/${SECRET_PATH}`; // آدرس عمومی ربات شما

// ===== ADMIN PRIVATE CONTROLS =====
const ADMIN_ID = 5576592239; // <<< شناسه عددی تلگرام شما

// بررسی ادمین بودن
function isAdmin(update) {
  const fromId =
    update?.message?.from?.id ??
    update?.callback_query?.from?.id ??
    null;
  return fromId === ADMIN_ID;
}

// فقط در پی‌وی (برای اینکه بقیه نبینن)
function isPrivateChat(update) {
  const chatType = update?.message?.chat?.type ?? null;
  return chatType === "private";
}

// ارسال پیام به تلگرام (از fetch یا کتابخانه خودت استفاده کن)
async function tgSendMessage(chatId, text, extra = {}) {
  if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is not set!");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error("Telegram API Error:", data.description);
    }
    return data;
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// ===== USER STATE MANAGEMENT =====
// ذخیره وضعیت کاربر در حافظه RAM (با ری‌استارت پاک می‌شود)
const users = globalThis.__life_users ?? new Map();
globalThis.__life_users = users;

// تعریف ساختار اولیه کاربر
const defaultUserState = {
  money: 100,
  bank: 0,
  health: 100,
  energy: 100,
  xp: 0,
  level: 1,
  job: null,
  education: null,
  job_level: 0, // سطح شغلی
  education_level: 0, // سطح تحصیلات
  married: false,
  spouse: null,
  spouseId: null,
  familyLove: 50, // عشق و علاقه خانوادگی
  house: "اجاره‌ای کوچک",
  house_level: 1,
  car: null,
  car_level: 0,
  children: 0,
  business: null, // نام کسب‌وکار
  business_level: 0,
  business_income: 0,
  criminal_record: 0, // سابقه کیفری (امتیاز منفی)
  jail_turns: 0, // تعداد دورهای زندان
  mafia_joined: false,
  mafia_rank: 0, // رتبه در مافیا
  mafia_missions_done: 0,
  last_daily_claim: 0, // آخرین زمان دریافت حقوق روزانه
  last_work_time: 0, // آخرین زمان کار
  last_study_time: 0, // آخرین زمان مطالعه
  last_fun_time: 0, // آخرین زمان تفریح
  last_crime_time: 0, // آخرین زمان جرم
  last_rest_time: 0, // آخرین زمان استراحت
};

// گرفتن یا ساختن استیت کاربر
function getUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, { ...defaultUserState, id: userId });
    console.log(`New user created: ${userId}`);
  }
  return users.get(userId);
}

// به‌روزرسانی وضعیت کاربر (برای اطمینان از وجود متغیرها)
function updateUserState(userId, updates) {
  const user = getUser(userId);
  Object.assign(user, updates);
  users.set(userId, user); // بازنویسی در Map
}

// ===== GAME LOGIC & UTILS =====

const JOB_OFFERS = [
  { name: "کارگر ساده", base_salary: 50, level_req: 1, energy_cost: 10, xp_gain: 5, cooldown: 60000 }, // 1 دقیقه
  { name: "حسابدار", base_salary: 100, level_req: 3, energy_cost: 15, xp_gain: 10, cooldown: 120000 }, // 2 دقیقه
  { name: "برنامه‌نویس", base_salary: 150, level_req: 5, energy_cost: 20, xp_gain: 15, cooldown: 180000 }, // 3 دقیقه
  { name: "مدیر پروژه", base_salary: 250, level_req: 7, energy_cost: 25, xp_gain: 20, cooldown: 240000 }, // 4 دقیقه
];

const EDUCATION_OFFERS = [
  { name: "دیپلم", xp_cost: 30, money_cost: 200, level_req: 2, stat_boost: { job_level: 1, money_income_mult: 1.1 } },
  { name: "کاردانی", xp_cost: 60, money_cost: 500, level_req: 4, stat_boost: { job_level: 2, money_income_mult: 1.2 } },
  { name: "کارشناسی", xp_cost: 100, money_cost: 1000, level_req: 6, stat_boost: { job_level: 3, money_income_mult: 1.3 } },
  { name: "کارشناسی ارشد", xp_cost: 150, money_cost: 2000, level_req: 8, stat_boost: { job_level: 4, money_income_mult: 1.4 } },
];

const HOUSES = [
  { name: "اتاق اشتراکی", rent: 50, money_cost: 0, level_req: 1, health_regen: 1, energy_regen: 2 },
  { name: "آپارتمان کوچک", rent: 100, money_cost: 5000, level_req: 3, health_regen: 2, energy_regen: 3 },
  { name: "خانه ویلایی", rent: 200, money_cost: 20000, level_req: 6, health_regen: 3, energy_regen: 5 },
  { name: "عمارت مجلل", rent: 500, money_cost: 100000, level_req: 9, health_regen: 5, energy_regen: 8 },
];

const CARS = [
  { name: "دوچرخه", money_cost: 0, level_req: 1, energy_cost: 5, fun_gain: 5 },
  { name: "موتورسیکلت", money_cost: 2000, level_req: 3, energy_cost: 8, fun_gain: 10 },
  { name: "خودروی اقتصادی", money_cost: 8000, level_req: 5, energy_cost: 10, fun_gain: 15 },
  { name: "خودروی لوکس", money_cost: 30000, level_req: 8, energy_cost: 12, fun_gain: 20 },
];

const BUSINESSES = [
    { name: "دکه روزنامه‌فروشی", money_cost: 5000, level_req: 4, base_income: 50, workers_needed: 1, workers_max: 2 },
    { name: "رستوران کوچک", money_cost: 15000, level_req: 6, base_income: 150, workers_needed: 3, workers_max: 5 },
    { name: "شرکت نرم‌افزاری", money_cost: 50000, level_req: 8, base_income: 400, workers_needed: 5, workers_max: 10 },
];

// محاسبه درآمد شغل با توجه به سطح تحصیلات و شغل
function calculateJobSalary(user) {
    const job = JOB_OFFERS.find(j => j.name === user.job);
    if (!job) return 0;

    let salary = job.base_salary + (user.job_level -1) * (job.base_salary * 0.2); // افزایش حقوق با سابقه شغل
    let income_mult = 1.0;

    if (user.education) {
        const edu = EDUCATION_OFFERS.find(e => e.name === user.education);
        if (edu) {
            income_mult = edu.stat_boost.money_income_mult;
        }
    }

    return Math.round(salary * income_mult);
}

// محاسبه درآمد کسب و کار
function calculateBusinessIncome(user) {
    if (!user.business) return 0;
    const business = BUSINESSES.find(b => b.name === user.business);
    if (!business) return 0;

    // درآمد با توجه به سطح کسب و کار و تعداد کارمند
    const income = business.base_income + (user.business_level - 1) * (business.base_income * 0.3);
    return Math.round(income);
}

// محاسبه هزینه نگهداری خانه
function getHouseRent(user) {
    const house = HOUSES.find(h => h.name === user.house);
    return house ? house.rent : 0;
}

// محاسبه هزینه نگهداری ماشین
function getCarMaintenance(user) {
    const car = CARS.find(c => c.name === user.car);
    // هزینه نگهداری ماشین معمولا کمتر از اجاره خانه است
    return car ? Math.round(car.money_cost * 0.01) : 0;
}

// محاسبه هزینه غذا و ... (هزینه زندگی روزانه)
function getDailyLivingCost(user) {
    let cost = 20; // پایه
    if (user.children > 0) cost += user.children * 15;
    if (user.married) cost += 10;
    if (user.house_level > 1) cost += user.house_level * 5;
    if (user.car) cost += 5;
    return Math.max(20, cost); // حداقل 20
}

// محاسبه XP لازم برای سطح بعدی
function xpForLevel(level) {
    return level * 100 + 50;
}

// ===== BUTTON GENERATORS =====

function getMainKeyboard(user) {
    const buttons = [
        [{ text: "📊 وضعیت", callback_data: "status" }],
        [{ text: "💼 کار", callback_data: "job_menu" }, { text: "📚 تحصیل", callback_data: "education_menu" }],
        [{ text: "🏠 خانه", callback_data: "house_menu" }, { text: "🚗 ماشین", callback_data: "car_menu" }],
        [{ text: "❤️ خانواده", callback_data: "family_menu" }, { text: "🎉 تفریح", callback_data: "fun_menu" }],
        [{ text: "💰 بانک", callback_data: "bank_menu" }, { text: "📈 کسب و کار", callback_data: "business_menu" }],
        [{ text: "⚖️ جرم/مافیا", callback_data: "crime_mafia_menu" }],
        [{ text: "🛒 فروشگاه", callback_data: "shop_menu" }], // فروشگاه آیتم‌های مختلف
    ];
    return { inline_keyboard: buttons };
}

function getStatusDetailsKeyboard(user) {
    const buttons = [
        [{ text: "⬅️ بازگشت", callback_data: "main_menu" }],
    ];
    return { inline_keyboard: buttons };
}

function getJobMenuKeyboard(user) {
    const buttons = [
        [{ text: "📋 لیست مشاغل", callback_data: "job_list" }],
    ];
    if (user.job) {
        buttons.push([{ text: "☕ استراحت (انرژی)", callback_data: "rest" }]);
        buttons.push([{ text: "💼 انجام کار", callback_data: "do_job" }]);
        buttons.push([{ text: "📊 وضعیت شغل", callback_data: "job_status" }]);
    }
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getEducationMenuKeyboard(user) {
    const buttons = [
        [{ text: "📚 لیست دوره‌های آموزشی", callback_data: "education_list" }],
    ];
    if (user.education) {
        buttons.push([{ text: "🎓 شروع تحصیل", callback_data: "start_study" }]);
        buttons.push([{ text: "📊 وضعیت تحصیل", callback_data: "education_status" }]);
    }
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getHouseMenuKeyboard(user) {
    const buttons = [
        [{ text: "🏠 لیست خانه‌ها", callback_data: "house_list" }],
    ];
    if (user.house !== "اجاره‌ای کوچک") { // اگر خانه بهتری دارد
        buttons.push([{ text: "📜 اجاره خانه", callback_data: "rent_house" }]);
    }
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getCarMenuKeyboard(user) {
    const buttons = [
        [{ text: "🚗 لیست ماشین‌ها", callback_data: "car_list" }],
    ];
    if (user.car) {
        buttons.push([{ text: "💨 استفاده از ماشین (تفریح)", callback_data: "use_car_fun" }]);
    }
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getFamilyMenuKeyboard(user) {
    const buttons = [
        [{ text: "💍 ازدواج", callback_data: "marriage_menu" }],
    ];
    if (user.married) {
        buttons.push([{ text: "❤️ افزایش عشق خانواده", callback_data: "increase_family_love" }]);
        if (user.children < 3) { // حداکثر 3 بچه
            buttons.push([{ text: "👶 بچه‌دار شدن", callback_data: "have_child" }]);
        }
    }
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getFunMenuKeyboard(user) {
    const buttons = [
        [{ text: "🎬 رفتن به سینما", callback_data: "go_cinema" }],
        [{ text: "🏖️ سفر تفریحی", callback_data: "go_vacation" }],
        [{ text: "🎮 بازی", callback_data: "play_game" }],
    ];
    if (user.car) {
        buttons.push([{ text: "🚗 رانندگی تفریحی", callback_data: "use_car_fun" }]);
    }
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getBankMenuKeyboard(user) {
    const buttons = [
        [{ text: "🏦 واریز به بانک", callback_data: "deposit_bank" }],
        [{ text: "💸 برداشت از بانک", callback_data: "withdraw_bank" }],
        [{ text: "📈 مشاهده سود", callback_data: "view_interest" }],
    ];
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getBusinessMenuKeyboard(user) {
    const buttons = [
        [{ text: "📈 لیست کسب و کارها", callback_data: "business_list" }],
    ];
    if (user.business) {
        buttons.push([{ text: "💰 دریافت درآمد", callback_data: "get_business_income" }]);
        buttons.push([{ text: "🏢 ارتقاء کسب و کار", callback_data: "upgrade_business" }]);
    }
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getCrimeMafiaMenuKeyboard(user) {
    const buttons = [
        [{ text: "💥 انجام جرم", callback_data: "do_crime" }],
        [{ text: "🚨 زندان", callback_data: "check_jail" }],
    ];
    if (!user.mafia_joined) {
        buttons.push([{ text: "🥷 پیوستن به مافیا", callback_data: "join_mafia" }]);
    } else {
        buttons.push([{ text: "🕵️ ماموریت مافیا", callback_data: "mafia_mission" }]);
        buttons.push([{ text: "📊 وضعیت مافیا", callback_data: "mafia_status" }]);
    }
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

function getShopMenuKeyboard(user) {
    const buttons = [
        // فعلا فروشگاه خالی است، می‌توان بعدا آیتم اضافه کرد
        [{ text: "🛒 غذا", callback_data: "buy_food" }],
        [{ text: "💊 دارو (سلامتی)", callback_data: "buy_medicine" }],
        [{ text: "⬆️ آیتم‌های دیگر", callback_data: "buy_other_items" }],
    ];
     buttons.push([{ text: "⬅️ بازگشت", callback_data: "main_menu" }]);
    return { inline_keyboard: buttons };
}

// ===== HELPER FUNCTIONS =====

// فرمت پول برای نمایش بهتر
function formatMoney(amount) {
    return amount.toLocaleString('en-US'); // نمایش با کاما، مثلا 1,000,000
}

// فرمت زمان (مثلا "2 ساعت پیش")
function timeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} روز پیش`;
    if (hours > 0) return `${hours} ساعت پیش`;
    if (minutes > 0) return `${minutes} دقیقه پیش`;
    return `${seconds} ثانیه پیش`;
}

// کاهش انرژی و سلامتی با گذر زمان
function updateStatsOverTime(user) {
    const now = Date.now();
    const timePassed = now - user.last_rest_time; // فرض می‌کنیم آخرین استراحت مبنای زمان است
    const minutesPassed = Math.floor(timePassed / (60 * 1000));

    let energyDecay = Math.max(0, minutesPassed * 0.5); // نیم درصد انرژی در هر دقیقه
    let healthDecay = 0;

    if (user.house_level > 1) {
        const house = HOUSES.find(h => h.name === user.house);
        if (house) {
            energyDecay -= house.energy_regen * minutesPassed * 0.1; // با خانه بهتر، مصرف انرژی کمتر
            healthDecay -= house.health_regen * minutesPassed * 0.1; // با خانه بهتر، سلامتی بیشتر
        }
    }

    user.energy = Math.max(0, Math.min(100, user.energy - energyDecay));
    user.health = Math.max(0, Math.min(100, user.health - healthDecay));

    // اگر سلامتی یا انرژی خیلی کم شد، تاثیر منفی روی بازی
    if (user.health < 30) {
        user.xp -= minutesPassed * 0.1; // کاهش XP
    }
    if (user.energy < 30) {
        user.xp -= minutesPassed * 0.1; // کاهش XP
    }
    user.xp = Math.max(0, user.xp); // XP منفی نمی‌شود

    // به‌روزرسانی زمان آخرین استراحت (برای محاسبه زمان در آینده)
    user.last_rest_time = now;

    return user;
}


// ===== COMMAND HANDLERS =====

// دستور /start
async function handleStart(bot, chatId, user) {
    const welcomeMessage = `به شبیه‌ساز زندگی خوش آمدید! 🚀\n\nشما با ${formatMoney(user.money)}$ و ${user.health}% سلامتی شروع می‌کنید.\nهدف شما در این بازی، ساختن یک زندگی موفق است.\n\nاز منوی اصلی استفاده کنید:`;
    await tgSendMessage(chatId, welcomeMessage, { reply_markup: getMainKeyboard(user) });
}

// دستور /help
async function handleHelp(bot, chatId, user) {
    const helpMessage = `
راهنمای بازی:
- 📊 وضعیت: اطلاعات فعلی شما را نشان می‌دهد.
- 💼 کار: شغل پیدا کنید، کار کنید و درآمد کسب کنید.
- 📚 تحصیل: مهارت‌های خود را بالا ببرید تا شغل بهتر پیدا کنید.
- 🏠 خانه: خانه‌های مختلف بخرید یا اجاره کنید.
- 🚗 ماشین: ماشین بخرید و از آن برای تفریح استفاده کنید.
- ❤️ خانواده: ازدواج کنید، بچه‌دار شوید و عشق خانواده را افزایش دهید.
- 🎉 تفریح: برای بازیابی انرژی و افزایش روحیه.
- 💰 بانک: پولتان را ذخیره کنید و سود بگیرید.
- 📈 کسب و کار: کسب‌وکار خود را راه‌اندازی و توسعه دهید.
- ⚖️ جرم/مافیا: مسیر خلافکارانه را انتخاب کنید یا به مافیا بپیوندید.
- 🛒 فروشگاه: برای خرید آیتم‌های مصرفی.

هدف بازی: رسیدن به ثروت، موفقیت شغلی و زندگی خانوادگی شاد!
`;
    await tgSendMessage(chatId, helpMessage, { reply_markup: getMainKeyboard(user) });
}

// --- Admin Commands ---
async function handleAdminCommands(update, chatId, user) {
    const text = update.message.text.trim();
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === "/addmoney" || cmd === "/setmoney") {
        const targetId = Number(parts[1]);
        const amount = Number(parts[2]);

        if (!Number.isFinite(targetId) || !Number.isFinite(amount)) {
            await tgSendMessage(chatId, "فرمت صحیح:\n/addmoney USER_ID AMOUNT\n/setmoney USER_ID AMOUNT");
            return true; // خوردیم
        }

        const targetUser = getUser(targetId); // اگر کاربر نباشد، ساخته می‌شود

        if (cmd === "/addmoney") {
            targetUser.money = Math.floor((targetUser.money ?? 0) + amount);
            await tgSendMessage(chatId, `✅ پول کاربر ${targetId} ${amount > 0 ? 'افزایش' : 'کاهش'} یافت.\n💰 پول جدید: ${formatMoney(targetUser.money)}`);
        } else if (cmd === "/setmoney") {
            targetUser.money = Math.floor(amount);
            await tgSendMessage(chatId, `✅ پول کاربر ${targetId} دقیقاً ${formatMoney(amount)} تنظیم شد.\n💰 پول جدید: ${formatMoney(targetUser.money)}`);
        }
        return true; // دستور پردازش شد
    }

    if (cmd === "/resetuser") {
        const targetId = Number(parts[1]);
        if (!Number.isFinite(targetId)) {
            await tgSendMessage(chatId, "فرمت صحیح:\n/resetuser USER_ID");
            return true;
        }
        if (users.has(targetId)) {
            users.delete(targetId);
            await tgSendMessage(chatId, `✅ وضعیت کاربر ${targetId} ریست شد.`);
        } else {
            await tgSendMessage(chatId, `❌ کاربر ${targetId} یافت نشد.`);
        }
        return true;
    }

     if (cmd === "/adminhelp") {
        const adminHelpMessage = `
📌 دستورات ادمین (فقط پی‌وی):
/addmoney USER_ID AMOUNT  (پول را اضافه/کم می‌کند)
/setmoney USER_ID AMOUNT  (پول را دقیقاً برابر AMOUNT می‌کند)
/resetuser USER_ID        (وضعیت کاربر را پاک می‌کند)
/adminhelp                (نمایش این راهنما)
`;
        await tgSendMessage(chatId, adminHelpMessage);
        return true;
    }

    return false; // دستور ادمین نبود
}

// --- Callback Query Handlers ---

async function handleCallbackQuery(bot, update, user) {
    const chatId = update.callback_query.message.chat.id;
    const messageId = update.callback_query.message.message_id;
    const data = update.callback_query.data;

    // اطمینان از به‌روز بودن آمار کاربر قبل از هر عملیات
    let currentUser = getUser(user.id); // کاربر فعلی
    currentUser = updateStatsOverTime(currentUser); // کاهش خودکار انرژی/سلامتی

    // --- Admin Checks ---
    if (data.startsWith("admin_")) {
        if (!isAdmin(update)) {
            await tgSendMessage(chatId, "شما مجوز دسترسی به این بخش را ندارید.");
            return;
        }
        // اگر اینجا دستور ادمین باشد، بعدا اضافه می‌شود
        await bot.answerCallbackQuery(update.callback_query.id, { text: "عملیات ادمین..." });
        return;
    }
    // --- End Admin Checks ---


    // --- Main Menu Navigation ---
    if (data === "main_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `به منوی اصلی خوش آمدید!`, { reply_markup: getMainKeyboard(currentUser) });
    }

    // --- Status ---
    else if (data === "status") {
        let statusText = `
📊 **وضعیت فعلی شما:**
    *نام:* ${update.callback_query.from.first_name}
    *آیدی:* \`${currentUser.id}\`
    *سطح:* ${currentUser.level} (${currentUser.xp}/${xpForLevel(currentUser.level)})
    *سلامتی:* ${currentUser.health}% ❤️
    *انرژی:* ${currentUser.energy}% ⚡
    *پول:* 💰 ${formatMoney(currentUser.money)}
    *بانک:* 🏦 ${formatMoney(currentUser.bank)}
    *شغل:* ${currentUser.job || 'بیکار'} (سطح: ${currentUser.job_level})
    *تحصیلات:* ${currentUser.education || 'بی‌سواد'} (سطح: ${currentUser.education_level})
    *خانه:* ${currentUser.house} (اجاره: ${formatMoney(getHouseRent(currentUser))})
    *ماشین:* ${currentUser.car || 'ندارد'}
    *وضعیت تاهل:* ${currentUser.married ? `متاهل (همسر: ${currentUser.spouse || 'نامشخص'})` : 'مجرد'}
    *فرزندان:* ${currentUser.children} 👶
    *عشق خانواده:* ${currentUser.familyLove}%
    *کسب و کار:* ${currentUser.business ? `${currentUser.business} (سطح: ${currentUser.business_level})` : 'ندارد'}
    *سابقه کیفری:* ${currentUser.criminal_record} ⚖️
    *زندان:* ${currentUser.jail_turns > 0 ? ` ${currentUser.jail_turns} دور مانده` : 'آزاد'}
    *مافیا:* ${currentUser.mafia_joined ? `عضو (رنک: ${currentUser.mafia_rank})` : 'خارج'}
    `;
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, statusText, { parse_mode: 'Markdown', reply_markup: getStatusDetailsKeyboard(currentUser) });
    }

    // --- Job Menu ---
    else if (data === "job_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به منوی کار خوش آمدید. شغل خود را انتخاب کنید یا کار کنید.", { reply_markup: getJobMenuKeyboard(currentUser) });
    } else if (data === "job_list") {
        let jobsText = "لیست مشاغل موجود:\n\n";
        JOB_OFFERS.forEach((job, index) => {
            jobsText += `**${index + 1}. ${job.name}**\n`;
            jobsText += `   - حقوق پایه: 💰 ${formatMoney(job.base_salary)}\n`;
            jobsText += `   - سطح مورد نیاز: ${job.level_req}\n`;
            jobsText += `   - هزینه انرژی: ${job.energy_cost}⚡\n`;
            jobsText += `   - XP: ${job.xp_gain}\n`;
            jobsText += `   - زمان انتظار: ${job.cooldown / 60000} دقیقه\n\n`;
        });
        jobsText += "برای انتخاب شغل، روی نام آن کلیک کنید (اگر شغل دارید، اول باید آن را رها کنید).";
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, jobsText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: JOB_OFFERS.map(job => [{ text: `انتخاب ${job.name}`, callback_data: `select_job_${job.name}` }]).concat([[ { text: "⬅️ بازگشت", callback_data: "job_menu" } ]]) } });
    } else if (data.startsWith("select_job_")) {
        const jobName = data.split('_')[2];
        const jobOffer = JOB_OFFERS.find(j => j.name === jobName);
        if (currentUser.job && currentUser.job !== jobName) { // اگر شغل دیگری دارد
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `ابتدا باید شغل فعلی خود (${currentUser.job}) را رها کنید.`, { reply_markup: getJobMenuKeyboard(currentUser) });
             return;
        }
        if (currentUser.level < jobOffer.level_req) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما باید حداقل سطح ${jobOffer.level_req} باشید تا بتوانید این شغل را انتخاب کنید.`, { reply_markup: getJobMenuKeyboard(currentUser) });
            return;
        }
        updateUserState(currentUser.id, { job: jobName, job_level: 1, xp: currentUser.xp + jobOffer.xp_gain }); // تنظیم شغل و افزایش XP
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما با موفقیت به عنوان ${jobName} استخدام شدید!`, { reply_markup: getJobMenuKeyboard(currentUser) });
    } else if (data === "do_job") {
        if (!currentUser.job) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "شما شغلی ندارید. ابتدا یک شغل انتخاب کنید.", { reply_markup: getJobMenuKeyboard(currentUser) });
             return;
        }
        const job = JOB_OFFERS.find(j => j.name === currentUser.job);
        const now = Date.now();
        if (now - currentUser.last_work_time < job.cooldown) {
            const remainingTime = Math.ceil((job.cooldown - (now - currentUser.last_work_time)) / 1000);
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `هنوز زود است! باید ${remainingTime} ثانیه دیگر صبر کنید تا بتوانید دوباره کار کنید.`, { reply_markup: getJobMenuKeyboard(currentUser) });
            return;
        }
        if (currentUser.energy < job.energy_cost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `انرژی کافی ندارید! (${currentUser.energy}/${job.energy_cost}) باید استراحت کنید.`, { reply_markup: getJobMenuKeyboard(currentUser) });
            return;
        }

        const salary = calculateJobSalary(currentUser);
        const xpGain = job.xp_gain;
        const newEnergy = currentUser.energy - job.energy_cost;
        const newXp = currentUser.xp + xpGain;

        updateUserState(currentUser.id, {
            money: currentUser.money + salary,
            energy: newEnergy,
            xp: newXp,
            last_work_time: now,
            job_level: currentUser.job_level + 1, // افزایش سابقه کار
        });

        let message = `شما ${job.name} را انجام دادید.\n\n`;
        message += `💰 ${formatMoney(salary)} درآمد کسب کردید.\n`;
        message += `⚡ ${job.energy_cost} انرژی مصرف شد.\n`;
        message += `✨ ${xpGain} XP به دست آوردید.`;

        // Check for level up
        if (newXp >= xpForLevel(currentUser.level)) {
            const newLevel = currentUser.level + 1;
            const remainingXp = newXp - xpForLevel(currentUser.level);
            message += `\n🎉 **سطح شما به ${newLevel} ارتقا یافت!** 🎉`;
             updateUserState(currentUser.id, { level: newLevel, xp: remainingXp });
        }

        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, message, { reply_markup: getJobMenuKeyboard(currentUser) });

    } else if (data === "rest") {
        const now = Date.now();
        const energyGain = 30; // مقدار ثابتی انرژی که با استراحت به دست می‌آید
        const newEnergy = Math.min(100, currentUser.energy + energyGain);
        updateUserState(currentUser.id, { energy: newEnergy, last_rest_time: now });
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `استراحت کردید و ${energyGain} انرژی به دست آوردید. (انرژی فعلی: ${newEnergy}%)`, { reply_markup: getJobMenuKeyboard(currentUser) });
    } else if (data === "job_status") {
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما ${currentUser.job} هستید. سابقه کار شما ${currentUser.job_level} است.`, { reply_markup: getJobMenuKeyboard(currentUser) });
    }

    // --- Education Menu ---
    else if (data === "education_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به منوی تحصیل خوش آمدید. مهارت‌های خود را ارتقا دهید.", { reply_markup: getEducationMenuKeyboard(currentUser) });
    } else if (data === "education_list") {
        let eduText = "لیست دوره‌های آموزشی:\n\n";
        EDUCATION_OFFERS.forEach((edu, index) => {
            eduText += `**${index + 1}. ${edu.name}**\n`;
            eduText += `   - هزینه XP: ${edu.xp_cost}✨\n`;
            eduText += `   - هزینه پول: 💰 ${formatMoney(edu.money_cost)}\n`;
            eduText += `   - سطح مورد نیاز: ${edu.level_req}\n`;
            eduText += `   - افزایش سطح شغل: +${edu.stat_boost.job_level}\n`;
            eduText += `   - ضریب درآمد شغل: x${edu.stat_boost.money_income_mult.toFixed(1)}\n\n`;
        });
        eduText += "برای شروع دوره، روی نام آن کلیک کنید.";
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, eduText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: EDUCATION_OFFERS.map(edu => [{ text: `گذراندن ${edu.name}`, callback_data: `select_education_${edu.name}` }]).concat([[ { text: "⬅️ بازگشت", callback_data: "education_menu" } ]]) } });
    } else if (data.startsWith("select_education_")) {
        const eduName = data.split('_')[2];
        const eduOffer = EDUCATION_OFFERS.find(e => e.name === eduName);

        if (currentUser.level < eduOffer.level_req) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `سطح شما (${currentUser.level}) پایین‌تر از حد نیاز (${eduOffer.level_req}) است.`, { reply_markup: getEducationMenuKeyboard(currentUser) });
            return;
        }
        if (currentUser.xp < eduOffer.xp_cost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `XP کافی ندارید! (${currentUser.xp}/${eduOffer.xp_cost})`, { reply_markup: getEducationMenuKeyboard(currentUser) });
            return;
        }
        if (currentUser.money < eduOffer.money_cost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `پول کافی ندارید! (${formatMoney(currentUser.money)}/${formatMoney(eduOffer.money_cost)})`, { reply_markup: getEducationMenuKeyboard(currentUser) });
            return;
        }

        updateUserState(currentUser.id, {
            education: eduName,
            xp: currentUser.xp - eduOffer.xp_cost,
            money: currentUser.money - eduOffer.money_cost,
            job_level: currentUser.job_level + eduOffer.stat_boost.job_level,
            // در صورت داشتن شغل، ضریب درآمد را هم آپدیت می‌کنیم
            // (این بخش پیچیده‌تر است و شاید نیاز به محاسبه مجدد در زمان درآمد باشد)
        });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `دوره ${eduName} را با موفقیت گذراندید!`, { reply_markup: getEducationMenuKeyboard(currentUser) });

    } else if (data === "education_status") {
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما ${currentUser.education || 'تحصیلات رسمی ندارید'}. سطح تحصیلات شما ${currentUser.education_level} است.`, { reply_markup: getEducationMenuKeyboard(currentUser) });
    }

    // --- House Menu ---
    else if (data === "house_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به منوی خانه خوش آمدید. خانه خود را مدیریت کنید.", { reply_markup: getHouseMenuKeyboard(currentUser) });
    } else if (data === "house_list") {
        let houseText = "لیست خانه‌ها:\n\n";
        HOUSES.forEach((house, index) => {
            houseText += `**${index + 1}. ${house.name}**\n`;
            houseText += `   - اجاره ماهیانه: 💰 ${formatMoney(house.rent)}\n`;
            houseText += `   - هزینه خرید: 💰 ${house.money_cost === 0 ? 'رایگان' : formatMoney(house.money_cost)}\n`;
            houseText += `   - سطح مورد نیاز: ${house.level_req}\n`;
            houseText += `   - بازیابی سلامتی: +${house.health_regen}/دقیقه\n`;
            houseText += `   - بازیابی انرژی: +${house.energy_regen}/دقیقه\n\n`;
        });
        houseText += "برای خرید خانه، روی نام آن کلیک کنید.";
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, houseText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: HOUSES.map(house => [{ text: `خرید ${house.name}`, callback_data: `buy_house_${house.name}` }]).concat([[ { text: "⬅️ بازگشت", callback_data: "house_menu" } ]]) } });
    } else if (data.startsWith("buy_house_")) {
         const houseName = data.split('_')[2];
         const houseOffer = HOUSES.find(h => h.name === houseName);

         if (currentUser.level < houseOffer.level_req) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `سطح شما (${currentUser.level}) پایین‌تر از حد نیاز (${houseOffer.level_req}) است.`, { reply_markup: getHouseMenuKeyboard(currentUser) });
            return;
         }
          if (houseOffer.money_cost > 0 && currentUser.money < houseOffer.money_cost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `پول کافی ندارید! (${formatMoney(currentUser.money)}/${formatMoney(houseOffer.money_cost)})`, { reply_markup: getHouseMenuKeyboard(currentUser) });
            return;
         }

         // اگر خانه فعلی بهتر از خانه جدید است، اجازه خرید نده
         const currentHouseIndex = HOUSES.findIndex(h => h.name === currentUser.house);
         const newHouseIndex = HOUSES.findIndex(h => h.name === houseName);
         if (currentHouseIndex >= newHouseIndex && houseOffer.money_cost > 0) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما خانه بهتری دارید یا خانه فعلی شما هم‌سطح است.`, { reply_markup: getHouseMenuKeyboard(currentUser) });
             return;
         }

         let costMessage = "";
         if (houseOffer.money_cost > 0) {
             updateUserState(currentUser.id, { money: currentUser.money - houseOffer.money_cost });
             costMessage = `\nخرید خانه ${houseName} با موفقیت انجام شد.`;
         } else {
              costMessage = `\nشما خانه ${houseName} را انتخاب کردید.`;
         }
         updateUserState(currentUser.id, { house: houseName, house_level: HOUSES.findIndex(h => h.name === houseName) + 1 });
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `خانه شما ${houseName} است.${costMessage}`, { reply_markup: getHouseMenuKeyboard(currentUser) });

    } else if (data === "rent_house") {
        // این بخش برای اجاره دادن خانه‌های بهتر است، فعلا پیاده‌سازی نشده
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "قابلیت اجاره دادن خانه های بهتر به زودی اضافه می‌شود.", { reply_markup: getHouseMenuKeyboard(currentUser) });
    }

     // --- Car Menu ---
    else if (data === "car_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به منوی ماشین خوش آمدید. ماشین خود را انتخاب کنید.", { reply_markup: getCarMenuKeyboard(currentUser) });
    } else if (data === "car_list") {
        let carText = "لیست ماشین‌ها:\n\n";
        CARS.forEach((car, index) => {
            carText += `**${index + 1}. ${car.name}**\n`;
            carText += `   - هزینه خرید: 💰 ${car.money_cost === 0 ? 'رایگان' : formatMoney(car.money_cost)}\n`;
            carText += `   - سطح مورد نیاز: ${car.level_req}\n`;
            carText += `   - هزینه انرژی برای استفاده: ${car.energy_cost}⚡\n`;
            carText += `   - افزایش تفریح: +${car.fun_gain}\n\n`;
        });
        carText += "برای خرید ماشین، روی نام آن کلیک کنید.";
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, carText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: CARS.map(car => [{ text: `خرید ${car.name}`, callback_data: `buy_car_${car.name}` }]).concat([[ { text: "⬅️ بازگشت", callback_data: "car_menu" } ]]) } });
    } else if (data.startsWith("buy_car_")) {
        const carName = data.split('_')[2];
        const carOffer = CARS.find(c => c.name === carName);

        if (currentUser.level < carOffer.level_req) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `سطح شما (${currentUser.level}) پایین‌تر از حد نیاز (${carOffer.level_req}) است.`, { reply_markup: getCarMenuKeyboard(currentUser) });
            return;
        }
        if (carOffer.money_cost > 0 && currentUser.money < carOffer.money_cost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `پول کافی ندارید! (${formatMoney(currentUser.money)}/${formatMoney(carOffer.money_cost)})`, { reply_markup: getCarMenuKeyboard(currentUser) });
            return;
        }

        // اگر ماشین فعلی بهتر است، اجازه خرید نده
        const currentCarIndex = currentUser.car ? CARS.findIndex(c => c.name === currentUser.car) : -1;
        const newCarIndex = CARS.findIndex(c => c.name === carName);
        if (currentCarIndex >= newCarIndex && carOffer.money_cost > 0) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما ماشین بهتری دارید یا ماشین فعلی شما هم‌سطح است.`, { reply_markup: getCarMenuKeyboard(currentUser) });
            return;
        }

         let costMessage = "";
         if (carOffer.money_cost > 0) {
             updateUserState(currentUser.id, { money: currentUser.money - carOffer.money_cost });
             costMessage = `\nماشین ${carName} با موفقیت خریداری شد.`;
         } else {
             costMessage = `\nشما ${carName} را انتخاب کردید.`;
         }
         updateUserState(currentUser.id, { car: carName, car_level: CARS.findIndex(c => c.name === carName) + 1 });
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `ماشین شما ${carName} است.${costMessage}`, { reply_markup: getCarMenuKeyboard(currentUser) });
    } else if (data === "use_car_fun") {
         if (!currentUser.car) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "شما ماشینی ندارید.", { reply_markup: getCarMenuKeyboard(currentUser) });
             return;
         }
         const car = CARS.find(c => c.name === currentUser.car);
         if (currentUser.energy < car.energy_cost) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `انرژی کافی ندارید! (${currentUser.energy}/${car.energy_cost})`, { reply_markup: getCarMenuKeyboard(currentUser) });
             return;
         }

         const funGain = car.fun_gain;
         const newEnergy = currentUser.energy - car.energy_cost;
         updateUserState(currentUser.id, { energy: newEnergy, fun: (currentUser.fun || 0) + funGain }); // فرض می‌کنیم 'fun' داریم

         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `با ماشین ${car.name} رانندگی کردید و ${funGain} واحد تفریح به دست آوردید.`, { reply_markup: getCarMenuKeyboard(currentUser) });
    }

    // --- Family Menu ---
    else if (data === "family_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به منوی خانواده خوش آمدید.", { reply_markup: getFamilyMenuKeyboard(currentUser) });
    } else if (data === "marriage_menu") {
        if (currentUser.married) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما متاهل هستید و همسرتان ${currentUser.spouse} است.`, { reply_markup: getFamilyMenuKeyboard(currentUser) });
            return;
        }
        // فعلا امکان ازدواج با NPC تعریف نشده، فقط برای تست
        const marriageOptions = [
            [{ text: "ازدواج با لیلا (1000$)", callback_data: "marry_Leila" }],
            [{ text: "ازدواج با احمد (1500$)", callback_data: "marry_Ahmad" }],
            [{ text: "بازگشت", callback_data: "family_menu" }],
        ];
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "با چه کسی می‌خواهید ازدواج کنید؟ (نیاز به پول دارد)", { reply_markup: { inline_keyboard: marriageOptions } });
    } else if (data.startsWith("marry_")) {
        const spouseName = data.split('_')[1];
        let spouseCost = 0;
        if (spouseName === "Leila") spouseCost = 1000;
        if (spouseName === "Ahmad") spouseCost = 1500;

        if (currentUser.money < spouseCost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `پول کافی ندارید! (نیاز ${formatMoney(spouseCost)})`, { reply_markup: getFamilyMenuKeyboard(currentUser) });
            return;
        }

        updateUserState(currentUser.id, { married: true, spouse: spouseName, spouseId: spouseName, money: currentUser.money - spouseCost }); // spouseId برای آینده
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما با ${spouseName} ازدواج کردید!`, { reply_markup: getFamilyMenuKeyboard(currentUser) });

    } else if (data === "increase_family_love") {
        const loveGain = 10;
        const newLove = Math.min(100, currentUser.familyLove + loveGain);
        updateUserState(currentUser.id, { familyLove: newLove });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `عشق خانواده شما ${loveGain} واحد افزایش یافت. (فعلی: ${newLove}%)`, { reply_markup: getFamilyMenuKeyboard(currentUser) });
    } else if (data === "have_child") {
        if (!currentUser.married) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "فقط افراد متاهل می‌توانند بچه‌دار شوند.", { reply_markup: getFamilyMenuKeyboard(currentUser) });
             return;
        }
        if (currentUser.children >= 3) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "شما به حداکثر تعداد فرزند (3) رسیده‌اید.", { reply_markup: getFamilyMenuKeyboard(currentUser) });
             return;
        }

        const childCost = 5000; // هزینه بچه‌دار شدن
        if (currentUser.money < childCost) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `هزینه بچه‌دار شدن ${formatMoney(childCost)} است. پول کافی ندارید.`, { reply_markup: getFamilyMenuKeyboard(currentUser) });
             return;
        }

        updateUserState(currentUser.id, { children: currentUser.children + 1, money: currentUser.money - childCost });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `تبریک! شما صاحب فرزند شدید. (تعداد فرزندان: ${currentUser.children + 1})`, { reply_markup: getFamilyMenuKeyboard(currentUser) });
    }

    // --- Fun Menu ---
    else if (data === "fun_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به بخش تفریح خوش آمدید! انرژی خود را بازیابی کنید.", { reply_markup: getFunMenuKeyboard(currentUser) });
    } else if (data === "go_cinema") {
        const funGain = 15;
        const energyCost = 15;
        if (currentUser.energy < energyCost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `انرژی کافی ندارید! (${currentUser.energy}/${energyCost})`, { reply_markup: getFunMenuKeyboard(currentUser) });
            return;
        }
        updateUserState(currentUser.id, { energy: currentUser.energy - energyCost, fun: (currentUser.fun || 0) + funGain });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `به سینما رفتید و ${funGain} واحد تفریح کسب کردید.`, { reply_markup: getFunMenuKeyboard(currentUser) });
    } else if (data === "go_vacation") {
        const funGain = 30;
        const energyCost = 25;
        if (currentUser.energy < energyCost) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `انرژی کافی ندارید! (${currentUser.energy}/${energyCost})`, { reply_markup: getFunMenuKeyboard(currentUser) });
            return;
        }
        updateUserState(currentUser.id, { energy: currentUser.energy - energyCost, fun: (currentUser.fun || 0) + funGain });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `سفر تفریحی خوبی بود! ${funGain} واحد تفریح کسب کردید.`, { reply_markup: getFunMenuKeyboard(currentUser) });
    } else if (data === "play_game") {
        const funGain = 10;
        const energyCost = 10;
         if (currentUser.energy < energyCost) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `انرژی کافی ندارید! (${currentUser.energy}/${energyCost})`, { reply_markup: getFunMenuKeyboard(currentUser) });
            return;
        }
        updateUserState(currentUser.id, { energy: currentUser.energy - energyCost, fun: (currentUser.fun || 0) + funGain });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `بازی کردید و ${funGain} واحد تفریح به دست آوردید.`, { reply_markup: getFunMenuKeyboard(currentUser) });
    }

    // --- Bank Menu ---
    else if (data === "bank_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `به بانک خوش آمدید.\nموجودی شما در بانک: 🏦 ${formatMoney(currentUser.bank)}\n\nچه کاری می‌خواهید انجام دهید؟`, { reply_markup: getBankMenuKeyboard(currentUser) });
    } else if (data === "deposit_bank") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "مقدار پولی که می‌خواهید به بانک واریز کنید را وارد کنید:", { reply_markup: { inline_keyboard: [[{ text: "انصراف", callback_data: "bank_menu" }]] } });
        // اینجا باید منطق دریافت ورودی کاربر (مقدار پول) اضافه شود
    } else if (data === "withdraw_bank") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "مقدار پولی که می‌خواهید از بانک برداشت کنید را وارد کنید:", { reply_markup: { inline_keyboard: [[{ text: "انصراف", callback_data: "bank_menu" }]] } });
        // اینجا باید منطق دریافت ورودی کاربر (مقدار پول) اضافه شود
    } else if (data === "view_interest") {
        // محاسبه سود بانکی (مثلا 5% در روز)
        const dailyInterestRate = 0.05;
        const interest = Math.round(currentUser.bank * dailyInterestRate);
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `سود روزانه شما ${formatMoney(interest)}$ است. (نرخ سود ${dailyInterestRate * 100}%)`, { reply_markup: getBankMenuKeyboard(currentUser) });
    }

     // --- Business Menu ---
    else if (data === "business_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به منوی کسب و کار خوش آمدید.", { reply_markup: getBusinessMenuKeyboard(currentUser) });
    } else if (data === "business_list") {
        let busText = "لیست کسب و کارها:\n\n";
        BUSINESSES.forEach((biz, index) => {
            busText += `**${index + 1}. ${biz.name}**\n`;
            busText += `   - هزینه راه اندازی: 💰 ${formatMoney(biz.money_cost)}\n`;
            busText += `   - سطح مورد نیاز: ${biz.level_req}\n`;
            busText += `   - درآمد پایه: 💰 ${formatMoney(biz.base_income)}/روز\n`;
            busText += `   - کارمند مورد نیاز: ${biz.workers_needed}\n\n`;
        });
        busText += "برای راه اندازی کسب و کار، روی نام آن کلیک کنید.";
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, busText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: BUSINESSES.map(biz => [{ text: `راه اندازی ${biz.name}`, callback_data: `start_business_${biz.name}` }]).concat([[ { text: "⬅️ بازگشت", callback_data: "business_menu" } ]]) } });
    } else if (data.startsWith("start_business_")) {
         const bizName = data.split('_')[2];
         const businessOffer = BUSINESSES.find(b => b.name === bizName);

         if (currentUser.level < businessOffer.level_req) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `سطح شما (${currentUser.level}) پایین‌تر از حد نیاز (${businessOffer.level_req}) است.`, { reply_markup: getBusinessMenuKeyboard(currentUser) });
             return;
         }
         if (currentUser.money < businessOffer.money_cost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `پول کافی ندارید! (${formatMoney(currentUser.money)}/${formatMoney(businessOffer.money_cost)})`, { reply_markup: getBusinessMenuKeyboard(currentUser) });
            return;
         }
         if (currentUser.business) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما در حال حاضر ${currentUser.business} را دارید.`, { reply_markup: getBusinessMenuKeyboard(currentUser) });
            return;
         }

         updateUserState(currentUser.id, { business: bizName, business_level: 1, money: currentUser.money - businessOffer.money_cost });
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `کسب و کار ${bizName} را راه انداختید!`, { reply_markup: getBusinessMenuKeyboard(currentUser) });
    } else if (data === "get_business_income") {
        if (!currentUser.business) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "کسب و کاری ندارید.", { reply_markup: getBusinessMenuKeyboard(currentUser) });
            return;
        }
        const income = calculateBusinessIncome(currentUser);
        updateUserState(currentUser.id, { money: currentUser.money + income });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `درآمد کسب و کار شما ${formatMoney(income)}$ بود.`, { reply_markup: getBusinessMenuKeyboard(currentUser) });
    } else if (data === "upgrade_business") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "قابلیت ارتقاء کسب و کار به زودی اضافه می‌شود.", { reply_markup: getBusinessMenuKeyboard(currentUser) });
    }

    // --- Crime & Mafia Menu ---
    else if (data === "crime_mafia_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به منوی جرم و مافیا خوش آمدید.", { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
    } else if (data === "do_crime") {
        // فعلا جرم ساده: دزدی
        const crimeOffer = { name: "سرقت", money_reward_min: 50, money_reward_max: 200, energy_cost: 20, xp_gain: 5, criminal_record_gain: 1, cooldown: 3600000 }; // 1 ساعت
        const now = Date.now();
        if (now - currentUser.last_crime_time < crimeOffer.cooldown) {
            const remainingTime = Math.ceil((crimeOffer.cooldown - (now - currentUser.last_crime_time)) / 1000);
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `هنوز زود است! ${remainingTime} ثانیه دیگر صبر کنید.`, { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
            return;
        }
         if (currentUser.energy < crimeOffer.energy_cost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `انرژی کافی ندارید! (${currentUser.energy}/${crimeOffer.energy_cost})`, { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
            return;
        }

        const reward = Math.floor(Math.random() * (crimeOffer.money_reward_max - crimeOffer.money_reward_min + 1)) + crimeOffer.money_reward_min;
        const newCriminalRecord = currentUser.criminal_record + crimeOffer.criminal_record_gain;
        const newEnergy = currentUser.energy - crimeOffer.energy_cost;
        const newXp = currentUser.xp + crimeOffer.xp_gain;

        updateUserState(currentUser.id, {
            money: currentUser.money + reward,
            energy: newEnergy,
            xp: newXp,
            criminal_record: newCriminalRecord,
            last_crime_time: now,
        });

        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `جرم ${crimeOffer.name} با موفقیت انجام شد!\n💰 ${formatMoney(reward)} به دست آوردید.\n⚖️ سابقه کیفری شما ${newCriminalRecord} شد.`, { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });

    } else if (data === "check_jail") {
        if (currentUser.jail_turns > 0) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما ${currentUser.jail_turns} دور دیگر در زندان هستید.`, { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
        } else {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "شما در حال حاضر زندانی نیستید.", { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
        }
    } else if (data === "join_mafia") {
        const mafiaCost = 10000; // هزینه ورود به مافیا
        if (currentUser.money < mafiaCost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `برای پیوستن به مافیا نیاز به ${formatMoney(mafiaCost)}$ دارید.`, { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
            return;
        }
        updateUserState(currentUser.id, { mafia_joined: true, mafia_rank: 1, money: currentUser.money - mafiaCost });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به دنیای تاریک مافیا خوش آمدید! رنک شما 1 است.", { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
    } else if (data === "mafia_mission") {
        // فعلا ماموریت مافیایی ساده
        const missionOffer = { name: "تحویل بسته", xp_gain: 20, money_reward_min: 1000, money_reward_max: 5000, criminal_record_gain: 2, cooldown: 7200000 }; // 2 ساعت
        const now = Date.now();
        if (!currentUser.mafia_joined) {
             await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "شما عضو مافیا نیستید.", { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
             return;
        }
        if (now - currentUser.last_crime_time < missionOffer.cooldown) { // از همین کولدown جرم استفاده می‌کنیم
            const remainingTime = Math.ceil((missionOffer.cooldown - (now - currentUser.last_crime_time)) / 1000);
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `هنوز زود است! ${remainingTime} ثانیه دیگر صبر کنید.`, { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
            return;
        }

        const reward = Math.floor(Math.random() * (missionOffer.money_reward_max - missionOffer.money_reward_min + 1)) + missionOffer.money_reward_min;
        const xpGain = missionOffer.xp_gain;
        const criminalRecord = currentUser.criminal_record + missionOffer.criminal_record_gain;

        updateUserState(currentUser.id, { money: currentUser.money + reward, xp: currentUser.xp + xpGain, criminal_record: criminalRecord, last_crime_time: now, mafia_missions_done: currentUser.mafia_missions_done + 1 });

        // چک برای ارتقاء رنک مافیا
        let newRankMsg = "";
        if (currentUser.mafia_missions_done >= 5 && currentUser.mafia_rank === 1) {
            updateUserState(currentUser.id, { mafia_rank: 2 });
            newRankMsg = "\n🎉 **رنک شما در مافیا به 2 ارتقا یافت!** 🎉";
        }

        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `ماموریت "${missionOffer.name}" با موفقیت انجام شد!\n💰 ${formatMoney(reward)} دریافت کردید.\n✨ ${xpGain} XP به دست آوردید.\n⚖️ سابقه کیفری شما ${criminalRecord} شد.${newRankMsg}`, { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });

    } else if (data === "mafia_status") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `شما عضو مافیا با رنک ${currentUser.mafia_rank} هستید. ${currentUser.mafia_missions_done} ماموریت انجام داده‌اید.`, { reply_markup: getCrimeMafiaMenuKeyboard(currentUser) });
    }

    // --- Shop Menu ---
    else if (data === "shop_menu") {
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, "به فروشگاه خوش آمدید.", { reply_markup: getShopMenuKeyboard(currentUser) });
    } else if (data === "buy_food") {
         const foodCost = 20;
         const healthGain = 10;
         if (currentUser.money < foodCost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `پول کافی ندارید! (نیاز ${formatMoney(foodCost)})`, { reply_markup: getShopMenuKeyboard(currentUser) });
            return;
         }
         updateUserState(currentUser.id, { money: currentUser.money - foodCost, health: Math.min(100, currentUser.health + healthGain) });
         await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `غذا خریدید و سلامتی شما ${healthGain} واحد افزایش یافت.`, { reply_markup: getShopMenuKeyboard(currentUser) });
    } else if (data === "buy_medicine") {
        const medicineCost = 50;
        const healthGain = 25;
        if (currentUser.money < medicineCost) {
            await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `پول کافی ندارید! (نیاز ${formatMoney(medicineCost)})`, { reply_markup: getShopMenuKeyboard(currentUser) });
            return;
        }
         updateUserState(currentUser.id, { money: currentUser.money - medicineCost, health: Math.min(100, currentUser.health + healthGain) });
        await bot.editMessageText({ chat_id: chatId, message_id: messageId }, `دارو خریدید و سلامتی شما ${healthGain} واحد افزایش یافت.`, { reply_markup: getShopMenuKeyboard(currentUser) });
    }
    // ... آیتم‌های دیگر فروشگاه

    await bot.answerCallbackQuery(update.callback_query.id); // تایید دریافت callback
}


// ===== MAIN BOT LOGIC =====

async function processUpdate(update) {
    // Handle text messages
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const user = getUser(userId); // همیشه اول کاربر را می‌گیریم

        // آپدیت آمار کاربر بر اساس گذر زمان (برای سلامتی/انرژی)
        user = updateStatsOverTime(user);

        const text = update.message.text.trim();

        // Admin check for private commands
        if (isAdmin(update) && isPrivateChat(update)) {
            if (await handleAdminCommands(update, chatId, user)) {
                return; // اگر دستور ادمین بود، کار تمام است
            }
        }

        // Handle game commands
        if (text === '/start') {
            await handleStart(bot, chatId, user);
        } else if (text === '/help') {
            await handleHelp(bot, chatId, user);
        }
        // Add other text commands here...
        else {
             // اگر دستور ناشناس بود، منوی اصلی را نشان بده
            await tgSendMessage(chatId, "دستور نامعتبر است. از /start یا /help استفاده کنید یا از منوی زیر استفاده کنید:", { reply_markup: getMainKeyboard(user) });
        }
    }

    // Handle callback queries
    else if (update.callback_query) {
        const userId = update.callback_query.from.id;
        let user = getUser(userId); // کاربر فعلی

        // آپدیت آمار کاربر بر اساس گذر زمان
        user = updateStatsOverTime(user);

        // پردازش callback query
        await handleCallbackQuery(bot, update, user);
    }
}

// ===== WEBHOOK HANDLING =====

app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
    const update = req.body;
    // console.log("Received update:", JSON.stringify(update, null, 2)); // برای دیباگ

    try {
        await processUpdate(update);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error processing update:", error);
        res.sendStatus(500);
    }
});

// ===== SERVER START =====

// Set webhook (Only run this once or when needed)
async function setWebhook() {
    if (!BOT_TOKEN) {
        console.error("BOT_TOKEN is not set. Cannot set webhook.");
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok) {
            console.log("Webhook set successfully:", WEBHOOK_URL);
        } else {
            console.error("Failed to set webhook:", data.description);
        }
    } catch (error) {
        console.error("Error setting webhook:", error);
    }
}

// Uncomment to set webhook when the server starts
// setWebhook();


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Webhook path: /webhook/${SECRET_PATH}`);
    if (!BOT_TOKEN) {
        console.warn("⚠️ BOT_TOKEN environment variable is not set. The bot will not be able to send messages.");
    }
});

// ===== PLACEHOLDER BOT OBJECT =====
// This is a placeholder. In a real scenario, you'd use a library like 'node-telegram-bot-api'
// or handle API calls directly via fetch as done in tgSendMessage.
// For this example, we assume tgSendMessage works.
const bot = {
    // Mock function to simulate bot actions needed by handlers
    editMessageText: async ({ chat_id, message_id }, text, extra) => {
        console.log(`[EDIT MESSAGE] ChatID: ${chat_id}, MsgID: ${message_id}`);
        console.log(`   Text: ${text.substring(0, 50)}...`);
        if (extra.reply_markup) {
            console.log(`   Reply Markup: ${JSON.stringify(extra.reply_markup)}`);
        }
        await tgSendMessage(chat_id, text, extra); // Use the actual sender
    },
    answerCallbackQuery: async (callbackQueryId, options) => {
         console.log(`[ANSWER CALLBACK] QueryID: ${callbackQueryId}, Options:`, options);
         // In a real bot, you'd call the Telegram API here.
         // For now, we just log it.
         if (!BOT_TOKEN) return;
         try {
            const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery?callback_query_id=${callbackQueryId}`;
            await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(options)
            });
         } catch (error) { console.error("Error answering callback:", error); }
    }
};
