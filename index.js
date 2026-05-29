// index.js

// --- Imports ---
import express from 'express';
import fetch from 'node-fetch'; // برای ارتباط با API تلگرام و سرویس‌های دیگر
import bodyParser from 'body-parser'; // برای خواندن body درخواست‌های HTTP
import crypto from 'crypto'; // برای امنیت احتمالی (در صورت نیاز)

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000; // پورت مورد استفاده در Railway یا پورت پیش‌فرض
const BOT_TOKEN = process.env.BOT_TOKEN; // توکن ربات تلگرام از متغیرهای محیطی Railway
const ADMIN_ID = '5576592239'; // آیدی ادمین ربات
const WEBHOOK_PATH = '/webhook/mojaz0762'; // مسیر Webhook برای دریافت آپدیت‌ها از تلگرام

// --- Middleware ---
// استفاده از body-parser برای پردازش JSON و URL-encoded data
// اگر از express نسخه 4.16 به بالا استفاده می‌کنید، express.json() و express.urlencoded() کافی هستند
// اما برای اطمینان و سازگاری با نسخه های قدیمی تر، از body-parser هم استفاده می کنیم.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Data Storage (In-Memory) ---
// توجه: این داده‌ها با ری‌استارت ربات پاک می‌شوند. برای پایداری، نیاز به دیتابیس است.
const usersData = new Map(); // Map<userId, userData>
const businesses = new Map(); // Map<businessId, businessData>
const items = new Map(); // Map<itemId, itemData>

// --- Telegram API Helper Functions ---

/**
 * ارسال پیام متنی به یک چت ID مشخص.
 * @param {string | number} chatId - آیدی چت تلگرام.
 * @param {string} text - متن پیام.
 * @param {object} options - گزینه‌های اضافی مانند reply_markup.
 * @returns {Promise<object | null>} - نتیجه پاسخ API تلگرام یا null در صورت خطا.
 */
async function sendMessage(chatId, text, options = {}) {
    if (!BOT_TOKEN) {
        console.error("BOT_TOKEN is not defined. Cannot send messages.");
        return null;
    }
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML', // پشتیبانی از تگ‌های HTML در پیام
                ...options,
            }),
        });
        const result = await response.json();
        if (!result.ok) {
            console.error(`Error sending message to ${chatId}: ${result.description} (Error Code: ${result.error_code})`);
            // اگر پیام به ادمین ارسال نشده، ممکن است توکن یا تنظیمات webhook مشکل داشته باشد
            if (String(chatId) === ADMIN_ID && result.error_code === 401) {
                 console.error("Admin message failed. Check BOT_TOKEN. It might be invalid.");
            } else if (String(chatId) === ADMIN_ID && result.error_code === 400) {
                 console.error("Admin message failed. Check webhook path or bot configuration.");
            }
        }
        return result;
    } catch (error) {
        console.error(`Network error sending message to ${chatId}:`, error);
        return null;
    }
}

/**
 * ارسال عکس به یک چت ID مشخص.
 * @param {string | number} chatId - آیدی چت تلگرام.
 * @param {string} photoUrl - URL عکس یا file_id.
 * @param {string} caption - کپشن عکس.
 * @param {object} options - گزینه‌های اضافی.
 * @returns {Promise<object | null>} - نتیجه پاسخ API تلگرام یا null در صورت خطا.
 */
async function sendPhoto(chatId, photoUrl, caption = '', options = {}) {
     if (!BOT_TOKEN) {
        console.error("BOT_TOKEN is not defined. Cannot send photos.");
        return null;
    }
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                photo: photoUrl,
                caption: caption,
                parse_mode: 'HTML',
                ...options,
            }),
        });
        const result = await response.json();
        if (!result.ok) {
            console.error(`Error sending photo to ${chatId}: ${result.description} (Error Code: ${result.error_code})`);
        }
        return result;
    } catch (error) {
        console.error(`Network error sending photo to ${chatId}:`, error);
        return null;
    }
}

// --- Game Data and Helpers ---

// داده‌های ثابت بازی (شغل‌ها، تحصیلات، خانه‌ها، ماشین‌ها)
// این داده‌ها می‌توانند از فایل‌های JSON جداگانه بارگذاری شوند.
const jobs = {
    'unemployed': { name: 'بیکار', salary: 0, xp: 0, cost: 0, description: 'در جستجوی شغل...' },
    'waiter': { name: 'پیش‌خدمت', salary: 50, xp: 10, cost: 100, description: 'سرو غذا و نوشیدنی در رستوران.' },
    'programmer': { name: 'برنامه‌نویس', salary: 200, xp: 30, cost: 500, description: 'کدنویسی و توسعه نرم‌افزار.' },
    'doctor': { name: 'پزشک', salary: 400, xp: 60, cost: 2000, description: 'درمان بیماران و ارائه خدمات پزشکی.' },
    'ceo': { name: 'مدیرعامل', salary: 1000, xp: 150, cost: 10000, description: 'مدیریت شرکت و تصمیم‌گیری‌های استراتژیک.' },
};

const educations = {
    'none': { name: 'بدون تحصیلات', cost: 0, xp_gain: 0 },
    'high_school': { name: 'دیپلم', cost: 500, xp_gain: 50 },
    'university': { name: 'لیسانس', cost: 2000, xp_gain: 150 },
    'master': { name: 'فوق لیسانس', cost: 5000, xp_gain: 300 },
    'phd': { name: 'دکترا', cost: 10000, xp_gain: 600 },
};

const houses = {
    'apartment': { name: 'آپارتمان کوچک', price: 5000, rent: 50, description: 'یک شروع ساده.' },
    'house': { name: 'خانه متوسط', price: 20000, rent: 200, description: 'فضای کافی برای زندگی.' },
    'mansion': { name: 'عمارت لوکس', price: 100000, rent: 1000, description: 'زندگی در نهایت تجمل.' },
};

const cars = {
    'bicycle': { name: 'دوچرخه', price: 100, description: 'برای مسافت‌های کوتاه.' },
    'sedan': { name: 'سدان معمولی', price: 5000, description: 'یک ماشین کاربردی.' },
    'suv': { name: 'شاسی‌بلند', price: 15000, description: 'مناسب برای خانواده و سفر.' },
    'sports_car': { name: 'خودروی اسپرت', price: 50000, description: 'سرعت و هیجان.' },
};

// ----- Helper Functions -----

/**
 * دریافت اطلاعات کاربر. اگر کاربر وجود نداشته باشد، یک پروفایل جدید ایجاد می‌کند.
 * @param {string | number} userId - آیدی کاربر تلگرام.
 * @returns {Promise<object>} - شیء حاوی اطلاعات کاربر.
 */
async function getUser(userId) {
    if (!usersData.has(userId)) {
        console.log(`Creating new user profile for: ${userId}`);
        usersData.set(userId, {
            id: String(userId), // اطمینان از اینکه همیشه استرینگ است
            money: 1000,
            xp: 0,
            level: 1,
            job: 'unemployed', // شغل پیش‌فرض
            education: 'none', // تحصیلات پیش‌فرض
            family: { married: false, spouse: null, children: [] },
            house: null,
            car: null,
            business: null,
            inventory: [],
            lastActive: Date.now(),
            health: 100,
            energy: 100,
            skills: {},
            lastDailyReward: 0, // برای پاداش روزانه
        });
    }
    // آپدیت زمان آخرین فعالیت و اطمینان از وجود مقدار اولیه برای پاداش روزانه
    const user = usersData.get(userId);
    user.lastActive = Date.now();
    if (user.lastDailyReward === undefined) {
        user.lastDailyReward = 0;
    }
    saveUser(user); // ذخیره مجدد برای اطمینان از آپدیت lastActive
    return user;
}

/**
 * ذخیره اطلاعات کاربر در Map.
 * @param {object} userData - شیء اطلاعات کاربر.
 */
function saveUser(userData) {
    usersData.set(userData.id, userData);
}

/**
 * افزایش XP کاربر و بررسی ارتقاء سطح.
 * @param {string} userId - آیدی کاربر.
 * @param {number} amount - مقدار XP برای اضافه کردن.
 */
function addXP(userId, amount) {
    const user = usersData.get(userId);
    if (!user || amount <= 0) return;

    user.xp += amount;
    let xpToNextLevel = calculateXPForLevel(user.level);

    while (user.xp >= xpToNextLevel) {
        user.level++;
        user.xp -= xpToNextLevel; // کم کردن XP که برای سطح فعلی استفاده شده
        xpToNextLevel = calculateXPForLevel(user.level);
        sendMessage(userId, `🎉 تبریک! شما به لول ${user.level} رسیدید! XP مورد نیاز برای لول بعد: ${xpToNextLevel}`);
    }
    saveUser(user);
}

/**
 * محاسبه XP مورد نیاز برای رسیدن به لول بعدی.
 * @param {number} level - سطح فعلی کاربر.
 * @returns {number} - مقدار XP لازم برای رسیدن به سطح بعدی.
 */
function calculateXPForLevel(level) {
    // فرمول: level^2 * 100 + 50 (برای شروع کمی آسان‌تر)
    return Math.pow(level, 2) * 100 + 50;
}

/**
 * نمایش وضعیت فعلی کاربر به همراه دکمه‌های اینلاین.
 * @param {string | number} userId - آیدی کاربر.
 */
async function displayStatus(userId) {
    const user = await getUser(userId);
    let message = `<b>📊 وضعیت شما (${user.id})</b>\n\n`;
    message += `<b>💰 پول:</b> ${user.money.toLocaleString()} تومان\n`;
    message += `<b>⭐ XP:</b> ${user.xp} | <b> Lvl:</b> ${user.level} (نیاز به ${calculateXPForLevel(user.level)} XP برای لول بعد)\n`;
    message += `<b>❤️ سلامتی:</b> ${user.health}/100 | <b>⚡ انرژی:</b> ${user.energy}/100\n`;

    // شغل
    const jobDetails = jobs[user.job] || jobs['unemployed'];
    message += `<b>💼 شغل:</b> ${jobDetails.name}${user.job === 'unemployed' ? '' : ` (${jobDetails.salary.toLocaleString()} تومان در روز)`}\n`;

    // تحصیلات
    const eduDetails = educations[user.education] || educations['none'];
    message += `<b>🎓 تحصیلات:</b> ${eduDetails.name}\n`;

    // خانه
    message += `<b>🏠 خانه:</b> ${user.house ? houses[user.house].name : 'اجاره‌ای / ندارد'}\n`;

    // ماشین
    message += `<b>🚗 ماشین:</b> ${user.car ? cars[user.car].name : 'ندارد'}\n`;

    // خانواده
    if (user.family.married) {
        message += `<b>💍 وضعیت تاهل:</b> متاهل (همسر: ${user.family.spouse || 'نامشخص'})`;
        if (user.family.children && user.family.children.length > 0) {
            message += ` | <b>فرزندان:</b> ${user.family.children.length} نفر`;
        }
        message += '\n';
    } else {
        message += `<b>💍 وضعیت تاهل:</b> مجرد\n`;
    }

    // کسب‌وکار (اگر داشته باشد)
    if (user.business) {
        const businessData = businesses.get(user.business);
        if (businessData) {
            message += `<b>🏢 کسب‌وکار:</b> ${businessData.name} (درآمد روزانه: ${businessData.income} تومان)\n`;
        }
    }

    // موجودی (چند آیتم اول)
    if (user.inventory && user.inventory.length > 0) {
        // فرض می‌کنیم آیتم‌ها در Map items ذخیره شده‌اند
        const itemNames = user.inventory.slice(0, 3).map(itemId => items.get(itemId)?.name || 'نامشخص');
        message += `<b>🎒 موجودی:</b> ${itemNames.join(', ')}${user.inventory.length > 3 ? '...' : ''}\n`;
    }

    // تعریف دکمه‌های کیبورد اینلاین
    const keyboard = {
        inline_keyboard: [
            [{ text: 'وضعیت 📊', callback_data: 'status' }],
            [{ text: 'کار 💼', callback_data: 'job_menu' }],
            [{ text: 'تحصیل 🎓', callback_data: 'education_menu' }],
            [{ text: 'خرید 🏠🚗', callback_data: 'shop_menu' }],
            [{ text: 'ازدواج 💍', callback_data: 'marriage_menu' }],
            [{ text: 'کسب‌وکار 🏢', callback_data: 'business_menu' }],
            [{ text: 'فعالیت‌ها 🏃‍♂️', callback_data: 'activities_menu' }],
            [{ text: 'راهنما ❓', callback_data: 'help' }],
        ]
    };

    await sendMessage(userId, message, { reply_markup: keyboard });
}

// --- Command Handlers ---

/**
 * مدیریت دستور /start.
 * @param {object} msg - آبجکت پیام تلگرام.
 */
async function handleStartCommand(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    await getUser(userId); // اطمینان از وجود کاربر
    await sendMessage(chatId, `به شبیه‌ساز زندگی خوش آمدید، ${msg.from.first_name}! برای شروع و دیدن منو، دستور /help را وارد کنید.`);
    await displayStatus(userId); // نمایش وضعیت اولیه
}

/**
 * مدیریت دستور /help.
 * @param {object} msg - آبجکت پیام تلگرام.
 */
async function handleHelpCommand(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    let helpMessage = `<b>راهنمای ربات زندگی</b>\n\n`;
    helpMessage += `<b>دستورات اصلی:</b>\n`;
    helpMessage += `/start - شروع ربات و نمایش خوش‌آمدگویی\n`;
    helpMessage += `/help - نمایش این راهنما\n`;
    helpMessage += `/status - نمایش وضعیت فعلی شما\n`;
    helpMessage += `/daily - دریافت پاداش روزانه\n\n`;

    helpMessage += `<b>منو (دکمه‌های زیر):</b>\n`;
    helpMessage += `📊 <b>وضعیت:</b> جزئیات کامل زندگی شما\n`;
    helpMessage += `💼 <b>کار:</b> پیدا کردن شغل، رفتن به سر کار\n`;
    helpMessage += `🎓 <b>تحصیل:</b> ارتقاء سطح تحصیلات\n`;
    helpMessage += `🏠🚗 <b>خرید:</b> خرید خانه و ماشین\n`;
    helpMessage += `💍 <b>ازدواج:</b> شروع روابط و تشکیل خانواده\n`;
    helpMessage += `🏢 <b>کسب‌وکار:</b> راه‌اندازی و مدیریت کسب‌وکار\n`;
    helpMessage += `🏃‍♂️ <b>فعالیت‌ها:</b> کارهای روزمره مثل ورزش، تفریح\n`;

    // دستورات ادمین (فقط اگر کاربر ادمین باشد)
    if (String(userId) === ADMIN_ID) {
        helpMessage += `\n<b>🔑 دستورات ادمین:</b>\n`;
        helpMessage += `/setmoney [USER_ID] [AMOUNT] - تعیین پول کاربر\n`;
        helpMessage += `/addmoney [USER_ID] [AMOUNT] - اضافه کردن پول به کاربر\n`;
        helpMessage += `/resetuser [USER_ID] - پاک کردن اطلاعات کاربر\n`;
        helpMessage += `/adminhelp - نمایش این راهنما برای ادمین\n`;
    }

    await sendMessage(chatId, helpMessage);
}

/**
 * مدیریت دستور /status.
 * @param {object} msg - آبجکت پیام تلگرام.
 */
async function handleStatusCommand(msg) {
    const userId = msg.from.id;
    await displayStatus(userId);
}

/**
 * مدیریت دستور /daily برای دریافت پاداش روزانه.
 * @param {object} msg - آبجکت پیام تلگرام.
 */
async function handleDailyCommand(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const user = await getUser(userId);
    const now = Date.now();
    const dayInMillis = 24 * 60 * 60 * 1000;

    // چک کردن اینکه آیا امروز پاداش گرفته یا نه
    if (user.lastDailyReward && (now - user.lastDailyReward < dayInMillis)) {
        const remainingTime = dayInMillis - (now - user.lastDailyReward);
        const remainingHours = Math.floor(remainingTime / (60 * 60 * 1000));
        const remainingMinutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
        await sendMessage(chatId, `هنوز ${remainingHours} ساعت و ${remainingMinutes} دقیقه دیگر تا پاداش روزانه بعدی مانده است.`);
        return;
    }

    const dailyBonusMoney = 100; // مقدار پاداش نقدی روزانه
    const dailyBonusXP = 5;    // مقدار پاداش XP روزانه
    user.money += dailyBonusMoney;
    user.lastDailyReward = now; // ثبت زمان دریافت پاداش
    addXP(userId, dailyBonusXP); // اضافه کردن XP
    saveUser(user);
    await sendMessage(chatId, `🎁 پاداش روزانه شما ${dailyBonusMoney.toLocaleString()} تومان و ${dailyBonusXP} XP دریافت شد!`);
    await displayStatus(userId); // نمایش وضعیت به‌روز شده
}

// --- Admin Command Handlers ---
async function handleSetMoneyCommand(msg) {
    if (String(msg.chat.id) !== ADMIN_ID || msg.chat.type !== 'private') {
        await sendMessage(msg.chat.id, "این دستور فقط برای ادمین در چت خصوصی قابل استفاده است.");
        return;
    }
    const parts = msg.text.split(' ');
    if (parts.length !== 3) {
        await sendMessage(msg.chat.id, "فرمت دستور اشتباه است. از /setmoney [USER_ID] [AMOUNT] استفاده کنید.");
        return;
    }
    const userIdToSet = parts[1];
    const amount = parseInt(parts[2], 10);

    if (isNaN(amount) || amount < 0) {
        await sendMessage(msg.chat.id, "مقدار پول باید یک عدد نامنفی باشد.");
        return;
    }

    if (!usersData.has(userIdToSet)) {
        await sendMessage(msg.chat.id, `کاربر با آیدی ${userIdToSet} یافت نشد.`);
        return;
    }

    const user = usersData.get(userIdToSet);
    user.money = amount;
    saveUser(user);
    await sendMessage(msg.chat.id, `پول کاربر ${userIdToSet} به ${amount.toLocaleString()} تومان تنظیم شد.`);
    await sendMessage(userIdToSet, `مقدار پول شما توسط ادمین به ${amount.toLocaleString()} تومان تغییر یافت.`);
}

async function handleAddMoneyCommand(msg) {
    if (String(msg.chat.id) !== ADMIN_ID || msg.chat.type !== 'private') {
        await sendMessage(msg.chat.id, "این دستور فقط برای ادمین در چت خصوصی قابل استفاده است.");
        return;
    }
    const parts = msg.text.split(' ');
    if (parts.length !== 3) {
        await sendMessage(msg.chat.id, "فرمت دستور اشتباه است. از /addmoney [USER_ID] [AMOUNT] استفاده کنید.");
        return;
    }
    const userIdToAdd = parts[1];
    const amount = parseInt(parts[2], 10);

    if (isNaN(amount) || amount <= 0) {
        await sendMessage(msg.chat.id, "مقدار پول باید یک عدد مثبت باشد.");
        return;
    }

    if (!usersData.has(userIdToAdd)) {
        await sendMessage(msg.chat.id, `کاربر با آیدی ${userIdToAdd} یافت نشد.`);
        return;
    }

    const user = usersData.get(userIdToAdd);
    user.money += amount;
    saveUser(user);
    await sendMessage(msg.chat.id, `${amount.toLocaleString()} تومان به پول کاربر ${userIdToAdd} اضافه شد. پول جدید: ${user.money.toLocaleString()} تومان.`);
    await sendMessage(userIdToAdd, `${amount.toLocaleString()} تومان به حساب شما اضافه شد. موجودی فعلی: ${user.money.toLocaleString()} تومان.`);
}

async function handleResetUserCommand(msg) {
    if (String(msg.chat.id) !== ADMIN_ID || msg.chat.type !== 'private') {
        await sendMessage(msg.chat.id, "این دستور فقط برای ادمین در چت خصوصی قابل استفاده است.");
        return;
    }
    const parts = msg.text.split(' ');
    if (parts.length !== 2) {
        await sendMessage(msg.chat.id, "فرمت دستور اشتباه است. از /resetuser [USER_ID] استفاده کنید.");
        return;
    }
    const userIdToReset = parts[1];

    if (usersData.has(userIdToReset)) {
        usersData.delete(userIdToReset);
        console.log(`User data reset for: ${userIdToReset}`);
        await sendMessage(msg.chat.id, `اطلاعات کاربر ${userIdToReset} با موفقیت پاک شد.`);
        // تلاش برای اطلاع‌رسانی به کاربر، در صورت بلاک نبودن ربات
        try {
            await sendMessage(userIdToReset, "اطلاعات حساب شما توسط ادمین ریست شد. لطفاً ربات را دوباره با /start شروع کنید.");
        } catch (e) {
            console.log(`Could not notify user ${userIdToReset}: Bot might be blocked or user not found.`);
        }
    } else {
        await sendMessage(msg.chat.id, `کاربر با آیدی ${userIdToReset} یافت نشد.`);
    }
}

async function handleAdminHelpCommand(msg) {
     if (String(msg.chat.id) === ADMIN_ID && msg.chat.type === 'private') {
         await handleHelpCommand(msg); // فقط نمایش راهنمای کلی
     } else {
         await sendMessage(msg.chat.id, "این دستور فقط برای ادمین در چت خصوصی قابل استفاده است.");
     }
}


// --- Inline Keyboard Callbacks ---

/**
 * مدیریت کلیک روی دکمه‌های اینلاین کیبورد.
 * @param {object} query - آبجکت callback_query تلگرام.
 */
async function handleCallbackQuery(query) {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    // پاسخ به callback query برای حذف دایره بارگذاری روی دکمه
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: query.id })
    });

    const user = await getUser(userId); // اطمینان از وجود کاربر

    switch (data) {
        case 'status':
            await displayStatus(userId);
            break;

        case 'job_menu':
            let jobMessage = `<b>💼 منوی شغل</b>\n\n`;
            jobMessage += `شغل فعلی شما: <b>${(jobs[user.job] || jobs['unemployed']).name}</b>\n`;
            if (user.job && user.job !== 'unemployed') {
                jobMessage += `حقوق روزانه: ${jobs[user.job].salary.toLocaleString()} تومان | XP: ${jobs[user.job].xp}\n\n`;
            }
            jobMessage += `<b>گزینه‌ها:</b>\n`;
            jobMessage += `- /findjob - جستجو برای شغل جدید\n`;
            jobMessage += `- /work - رفتن به سر کار (اگر شغل دارید)\n`;
            jobMessage += `- /quitjob - ترک شغل فعلی\n`;
            await sendMessage(chatId, jobMessage);
            break;

        case 'education_menu':
            let eduMessage = `<b>🎓 منوی تحصیلات</b>\n\n`;
            eduMessage += `سطح تحصیلات فعلی: <b>${(educations[user.education] || educations['none']).name}</b>\n`;
            eduMessage += `موجودی شما: ${user.money.toLocaleString()} تومان\n\n`;
            eduMessage += `<b>گزینه‌های ارتقاء:</b>\n`;
            for (const [key, edu] of Object.entries(educations)) {
                if (key === 'none') continue; // بدون تحصیلات، قابل ارتقا نیست
                // اگر کاربر قبلا سطح بالاتری دارد، این گزینه را نشان نده
                if (user.education && educations[user.education].xp_gain >= edu.xp_gain) continue;

                const canAfford = user.money >= edu.cost;
                const buttonText = `${edu.name} (هزینه: ${edu.cost.toLocaleString()} | XP: ${edu.xp_gain})`;
                eduMessage += `- /study ${key} - ${buttonText} ${canAfford ? '✅' : '❌'}\n`;
            }
            await sendMessage(chatId, eduMessage);
            break;

        case 'shop_menu':
            let shopMessage = `<b>🛒 فروشگاه</b>\n\n`;
            shopMessage += `موجودی شما: ${user.money.toLocaleString()} تومان\n\n`;
            shopMessage += `<b>خانه‌ها:</b>\n`;
            for (const [key, house] of Object.entries(houses)) {
                const canAfford = user.money >= house.price;
                const owned = user.house === key;
                shopMessage += `- /buy house ${key} - ${house.name} (قیمت: ${house.price.toLocaleString()} | اجاره: ${house.rent}) ${owned ? '[شما دارید]' : (canAfford ? '✅' : '❌')}\n`;
            }
            shopMessage += `\n<b>ماشین‌ها:</b>\n`;
            for (const [key, car] of Object.entries(cars)) {
                const canAfford = user.money >= car.price;
                const owned = user.car === key;
                shopMessage += `- /buy car ${key} - ${car.name} (قیمت: ${car.price.toLocaleString()}) ${owned ? '[شما دارید]' : (canAfford ? '✅' : '❌')}\n`;
            }
            await sendMessage(chatId, shopMessage);
            break;

        case 'marriage_menu':
             let marriageMessage = `<b>💍 منوی ازدواج و خانواده</b>\n\n`;
            if (user.family.married) {
                marriageMessage += `شما متاهل هستید و همسر شما ${user.family.spouse} است.\n`;
                marriageMessage += `شما ${user.family.children ? user.family.children.length : 0} فرزند دارید.\n`;
                marriageMessage += `- /divorce - درخواست طلاق\n`;
            } else {
                marriageMessage += `شما مجرد هستید.\n`;
                marriageMessage += `- /propose [USER_ID] - پیشنهاد ازدواج به کاربر دیگر (نیاز به تایید طرف مقابل)\n`;
                // marriageMessage += `- /search_partner - جستجو برای همسر (قابلیت پیشرفته)\n`; // فعلا پیاده‌سازی نشده
            }
            await sendMessage(chatId, marriageMessage);
            break;

        case 'business_menu':
             let businessMessage = `<b>🏢 منوی کسب‌وکار</b>\n\n`;
            if (user.business) {
                const biz = businesses.get(user.business);
                if (biz) {
                    businessMessage += `شما ${biz.name} را دارید.\n`;
                    businessMessage += `قیمت: ${biz.price.toLocaleString()} | درآمد روزانه: ${biz.income.toLocaleString()} | هزینه نگهداری: ${biz.upkeep.toLocaleString()}\n`;
                    businessMessage += `- /sellbusiness - فروش کسب‌وکار\n`;
                    // می‌توان گزینه‌های دیگری مثل استخدام کارمند، ارتقا و... اضافه کرد
                } else {
                     businessMessage += `خطا در یافتن اطلاعات کسب‌وکار شما.\n`;
                }
            } else {
                businessMessage += `شما هیچ کسب‌وکاری ندارید.\n`;
                businessMessage += `- /startbusiness [ID] - راه‌اندازی کسب‌وکار (مثال: /startbusiness restaurant)\n`;
                businessMessage += `کسب‌وکارهای موجود: رستوران (restaurant)، فروشگاه (store)، ...\n`; // لیست کسب‌وکارهای قابل راه‌اندازی
            }
             await sendMessage(chatId, businessMessage);
            break;

        case 'activities_menu':
             let activityMessage = `<b>🏃‍♂️ منوی فعالیت‌ها</b>\n\n`;
             activityMessage += `انرژی فعلی: ${user.energy}/100 | سلامتی: ${user.health}/100\n`;
             activityMessage += `- /exercise - ورزش (مصرف انرژی، افزایش مهارت)\n`;
             activityMessage += `- /relax - استراحت (افزایش انرژی و سلامتی)\n`;
             activityMessage += `- /eat [ITEM_ID] - خوردن آیتم از موجودی (مثلا: /eat food_pack)\n`;
             activityMessage += `- /crime - انجام جرم (ریسک بالا، پاداش بالا)\n`; // پیاده‌سازی نشده
             await sendMessage(chatId, activityMessage);
            break;

        case 'help':
            // ارسال پیام راهنما با استفاده از هندلر مربوطه
            await handleHelpCommand({ from: query.from, chat: query.message.chat });
            break;

        default:
            await sendMessage(chatId, "گزینه نامعتبر.");
            break;
    }
}


// --- Message Routing ---

/**
 * مدیریت تمام پیام‌های دریافتی از کاربران.
 * @param {object} msg - آبجکت پیام تلگرام.
 */
async function handleMessage(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const chatType = msg.chat.type; // 'private', 'group', 'supergroup', 'channel'
    const messageText = msg.text;

    // اگر پیام متن نداشت (مثلا عکس یا استیکر) فعلا نادیده گرفته می‌شود
    if (!messageText) return;

    // اطمینان از وجود کاربر
    await getUser(userId);

    // --- Admin Commands Handling ---
    // بررسی اینکه آیا کاربر، ادمین است و در چت خصوصی است
    if (String(userId) === ADMIN_ID && chatType === 'private') {
        if (messageText.startsWith('/setmoney')) {
            await handleSetMoneyCommand(msg); return;
        }
        if (messageText.startsWith('/addmoney')) {
            await handleAddMoneyCommand(msg); return;
        }
        if (messageText.startsWith('/resetuser')) {
            await handleResetUserCommand(msg); return;
        }
        if (messageText === '/adminhelp') {
            await handleAdminHelpCommand(msg); return;
        }
    }

    // --- Regular User Commands ---
    // اولویت با دستورات خاص است
    if (messageText.startsWith('/start')) {
        await handleStartCommand(msg);
    } else if (messageText.startsWith('/help')) {
        await handleHelpCommand(msg);
    } else if (messageText.startsWith('/status')) {
        await handleStatusCommand(msg);
    } else if (messageText.startsWith('/daily')) {
        await handleDailyCommand(msg);
    }
    // --- Job Commands ---
    else if (messageText.startsWith('/findjob')) {
        const user = await getUser(userId);
        const availableJobs = Object.keys(jobs).filter(key => key !== 'unemployed');
        // انتخاب یک شغل تصادفی از بین شغل‌های قابل گرفتن
        const randomIndex = Math.floor(Math.random() * availableJobs.length);
        const newJobKey = availableJobs[randomIndex];
        const newJob = jobs[newJobKey];

        // اگر کاربر در حال حاضر بیکار است و پول کافی دارد
        if (user.job === 'unemployed' && user.money >= newJob.cost) {
            user.money -= newJob.cost;
            user.job = newJobKey;
            addXP(userId, newJob.xp); // اضافه کردن XP اولیه شغل
            saveUser(user);
            await sendMessage(chatId, `شما به عنوان ${newJob.name} استخدام شدید! ${newJob.description}`);
            await displayStatus(userId);
        } else if (user.job !== 'unemployed') {
            await sendMessage(chatId, `شما در حال حاضر ${jobs[user.job].name} هستید. برای تغییر شغل، ابتدا شغل فعلی را ترک کنید (/quitjob).`);
        } else {
            await sendMessage(chatId, `برای گرفتن شغل ${newJob.name} به ${newJob.cost.toLocaleString()} تومان نیاز دارید.`);
        }
    } else if (messageText.startsWith('/work')) {
        const user = await getUser(userId);
        if (!user.job || user.job === 'unemployed') {
            await sendMessage(chatId, "شما شغلی ندارید. ابتدا با /findjob یک شغل پیدا کنید.");
            return;
        }
        if (user.energy < 20) {
            await sendMessage(chatId, "انرژی شما کافی نیست. لطفاً استراحت کنید (/relax).");
            return;
        }

        const job = jobs[user.job];
        // درآمد و XP کمی تصادفی برای جذابیت بیشتر
