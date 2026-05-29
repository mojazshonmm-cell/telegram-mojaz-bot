// index.js

// --- Imports ---
import express from 'express';
import fetch from 'node-fetch'; // برای ارتباط با API تلگرام
import bodyParser from 'body-parser'; // برای خواندن body درخواست‌ها
import crypto from 'crypto'; // برای امنیت احتمالی (اگر لازم شود)

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN; // توکن ربات از متغیرهای محیطی Railway
const ADMIN_ID = '5576592239'; // آیدی ادمین که قبلا مشخص شده
const WEBHOOK_PATH = '/webhook/mojaz0762'; // مسیر Webhook شما

// --- Data Storage (In-Memory) ---
// برای سادگی، وضعیت کاربرها در حافظه RAM ذخیره می‌شود.
// در صورت ری‌استارت ربات، این داده‌ها پاک می‌شوند.
// برای ذخیره‌سازی دائمی، نیاز به دیتابیس (مثل PostgreSQL, MongoDB) است.
const usersData = new Map(); // Map<userId, userData>
const businesses = new Map(); // Map<businessId, businessData> - اگر کسب‌وکارها دینامیک باشند
const items = new Map(); // Map<itemId, itemData> - اگر آیتم‌ها دینامیک باشند

// --- Helper Functions ---

// دریافت اطلاعات کاربر (در صورت نبودن، ایجاد کاربر جدید)
async function getUser(userId) {
    if (!usersData.has(userId)) {
        usersData.set(userId, {
            id: userId,
            money: 1000, // پول اولیه
            xp: 0,
            level: 1,
            job: null,
            education: null,
            family: { married: false, spouse: null, children: [] },
            house: null,
            car: null,
            business: null,
            inventory: [],
            lastActive: Date.now(),
            health: 100, // سلامتی
            energy: 100, // انرژی
            skills: {}, // مهارت‌ها
        });
    }
    // آپدیت زمان آخرین فعالیت
    usersData.get(userId).lastActive = Date.now();
    return usersData.get(userId);
}

// ذخیره اطلاعات کاربر
function saveUser(userData) {
    usersData.set(userData.id, userData);
}

// ارسال پیام به کاربر
async function sendMessage(chatId, text, options = {}) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML', // برای استفاده از تگ‌های HTML در پیام
                ...options,
            }),
        });
        const result = await response.json();
        if (!result.ok) {
            console.error(`Error sending message to ${chatId}: ${result.description}`);
            // اگر پیام ادمین بود و ارور داد، شاید مشکل توکن است
            if (chatId.toString() === ADMIN_ID) {
                console.error("Admin message failed. Check BOT_TOKEN and webhook setup.");
            }
        }
        return result;
    } catch (error) {
        console.error(`Network error sending message to ${chatId}:`, error);
        return null;
    }
}

// ارسال عکس به کاربر
async function sendPhoto(chatId, photoUrl, caption = '', options = {}) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                photo: photoUrl, // می‌تواند URL عکس باشد
                caption: caption,
                parse_mode: 'HTML',
                ...options,
            }),
        });
        const result = await response.json();
        if (!result.ok) {
            console.error(`Error sending photo to ${chatId}: ${result.description}`);
        }
        return result;
    } catch (error) {
        console.error(`Network error sending photo to ${chatId}:`, error);
        return null;
    }
}

// افزایش XP و Level کاربر
function addXP(userId, amount) {
    const user = usersData.get(userId);
    if (!user) return;

    user.xp += amount;
    let xpToNextLevel = calculateXPForLevel(user.level);

    while (user.xp >= xpToNextLevel) {
        user.level++;
        user.xp -= xpToNextLevel;
        xpToNextLevel = calculateXPForLevel(user.level);
        sendMessage(userId, `🎉 تبریک! شما به لول ${user.level} رسیدید! XP مورد نیاز برای لول بعد: ${xpToNextLevel}`);
    }
    saveUser(user);
}

// محاسبه XP مورد نیاز برای رسیدن به لول بعدی
function calculateXPForLevel(level) {
    // یک فرمول ساده برای رشد XP: level^2 * 100
    return Math.pow(level, 2) * 100;
}

// --- Core Game Logic Functions ---

// شغل‌ها (می‌تواند از یک فایل جداگانه خوانده شود)
const jobs = {
    'unemployed': { name: 'بیکار', salary: 0, xp: 0, description: 'در جستجوی شغل...' },
    'waiter': { name: 'پیش‌خدمت', salary: 50, xp: 10, description: 'سرو غذا و نوشیدنی در رستوران.' },
    'programmer': { name: 'برنامه‌نویس', salary: 200, xp: 30, description: 'کدنویسی و توسعه نرم‌افزار.' },
    'doctor': { name: 'پزشک', salary: 400, xp: 60, description: 'درمان بیماران و ارائه خدمات پزشکی.' },
    'ceo': { name: 'مدیرعامل', salary: 1000, xp: 150, description: 'مدیریت شرکت و تصمیم‌گیری‌های استراتژیک.' },
};

// تحصیلات
const educations = {
    'none': { name: 'بدون تحصیلات', cost: 0, xp_gain: 0 },
    'high_school': { name: 'دیپلم', cost: 500, xp_gain: 50 },
    'university': { name: 'لیسانس', cost: 2000, xp_gain: 150 },
    'master': { name: 'فوق لیسانس', cost: 5000, xp_gain: 300 },
    'phd': { name: 'دکترا', cost: 10000, xp_gain: 600 },
};

// خانه‌ها
const houses = {
    'apartment': { name: 'آپارتمان کوچک', price: 5000, rent: 50, description: 'یک شروع ساده.' },
    'house': { name: 'خانه متوسط', price: 20000, rent: 200, description: 'فضای کافی برای زندگی.' },
    'mansion': { name: 'عمارت لوکس', price: 100000, rent: 1000, description: 'زندگی در نهایت تجمل.' },
};

// ماشین‌ها
const cars = {
    'bicycle': { name: 'دوچرخه', price: 100, description: 'برای مسافت‌های کوتاه.' },
    'sedan': { name: 'سدان معمولی', price: 5000, description: 'یک ماشین کاربردی.' },
    'suv': { name: 'شاسی‌بلند', price: 15000, description: 'مناسب برای خانواده و سفر.' },
    'sports_car': { name: 'خودروی اسپرت', price: 50000, description: 'سرعت و هیجان.' },
};

// کسب‌وکارها (مثال)
// businesses.set('restuarant', { id: 'restuarant', name: 'رستوران', price: 50000, income: 500, workers: 5, upkeep: 200 });

// آیتم‌ها (مثال)
// items.set('food_pack', { id: 'food_pack', name: 'بسته غذایی', effect: { health: 10, energy: 20 } });

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
        if (user.family.children.length > 0) {
            message += ` | <b>فرزندان:</b> ${user.family.children.length} نفر`;
        }
        message += '\n';
    } else {
        message += `<b>💍 وضعیت تاهل:</b> مجرد\n`;
    }

    // کسب‌وکار (اگر داشته باشد)
    if (user.business) {
        const businessData = businesses.get(user.business); // فرض می‌کنیم کسب‌وکار در 'businesses' ذخیره شده
        if (businessData) {
            message += `<b>🏢 کسب‌وکار:</b> ${businessData.name} (درآمد روزانه: ${businessData.income} تومان)\n`;
        }
    }

    // موجودی (چند آیتم اول)
    if (user.inventory.length > 0) {
        message += `<b>🎒 موجودی:</b> ${user.inventory.slice(0, 3).map(itemId => items.get(itemId)?.name || 'نامشخص').join(', ')}${user.inventory.length > 3 ? '...' : ''}\n`;
    }

    // دکمه‌های کیبورد
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

async function handleStartCommand(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    await getUser(userId); // اطمینان از وجود کاربر
    await sendMessage(chatId, `به شبیه‌ساز زندگی خوش آمدید، ${msg.from.first_name}! با دستور /help می‌توانید منو را ببینید.`);
    await displayStatus(userId); // نمایش وضعیت اولیه
}

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
    if (userId.toString() === ADMIN_ID) {
        helpMessage += `\n<b>🔑 دستورات ادمین:</b>\n`;
        helpMessage += `/setmoney [USER_ID] [AMOUNT] - تعیین پول کاربر\n`;
        helpMessage += `/addmoney [USER_ID] [AMOUNT] - اضافه کردن پول به کاربر\n`;
        helpMessage += `/resetuser [USER_ID] - پاک کردن اطلاعات کاربر\n`;
        helpMessage += `/adminhelp - نمایش این راهنما برای ادمین\n`;
    }

    await sendMessage(chatId, helpMessage);
}

async function handleStatusCommand(msg) {
    const userId = msg.from.id;
    await displayStatus(userId);
}

async function handleDailyCommand(msg) {
    const userId = msg.from.id;
    const user = await getUser(userId);
    const now = Date.now();
    const dayInMillis = 24 * 60 * 60 * 1000;

    // چک کردن اینکه آیا امروز پاداش گرفته یا نه
    if (user.lastDailyReward && (now - user.lastDailyReward < dayInMillis)) {
        const remainingTime = dayInMillis - (now - user.lastDailyReward);
        const remainingHours = Math.floor(remainingTime / (60 * 60 * 1000));
        const remainingMinutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
        await sendMessage(msg.chat.id, `هنوز ${remainingHours} ساعت و ${remainingMinutes} دقیقه دیگر تا پاداش روزانه بعدی مانده است.`);
        return;
    }

    const dailyBonus = 100; // مقدار پاداش روزانه
    const dailyXp = 5;
    user.money += dailyBonus;
    user.lastDailyReward = now; // ثبت زمان دریافت پاداش
    addXP(userId, dailyXp); // اضافه کردن XP
    saveUser(user);
    await sendMessage(msg.chat.id, `🎁 پاداش روزانه شما ${dailyBonus.toLocaleString()} تومان و ${dailyXp} XP دریافت شد!`);
    await displayStatus(userId);
}

// --- Admin Commands ---
async function handleSetMoneyCommand(msg) {
    if (msg.chat.id.toString() !== ADMIN_ID || msg.chat.type !== 'private') {
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

    if (isNaN(amount)) {
        await sendMessage(msg.chat.id, "مقدار پول باید عدد باشد.");
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
    await sendMessage(userIdToSet, `پول شما توسط ادمین به ${amount.toLocaleString()} تومان تغییر یافت.`);
}

async function handleAddMoneyCommand(msg) {
    if (msg.chat.id.toString() !== ADMIN_ID || msg.chat.type !== 'private') {
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

    if (isNaN(amount)) {
        await sendMessage(msg.chat.id, "مقدار پول باید عدد باشد.");
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
    if (msg.chat.id.toString() !== ADMIN_ID || msg.chat.type !== 'private') {
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
        await sendMessage(msg.chat.id, `اطلاعات کاربر ${userIdToReset} با موفقیت پاک شد.`);
        // سعی کن به کاربر اطلاع بدهی (اگر ممکن بود)
        try {
            await sendMessage(userIdToReset, "اطلاعات حساب شما توسط ادمین ریست شد. لطفاً ربات را دوباره با /start شروع کنید.");
        } catch (e) {
            console.log(`User ${userIdToReset} not found or blocked bot.`);
        }
    } else {
        await sendMessage(msg.chat.id, `کاربر با آیدی ${userIdToReset} یافت نشد.`);
    }
}

async function handleAdminHelpCommand(msg) {
     if (msg.chat.id.toString() === ADMIN_ID && msg.chat.type === 'private') {
         await handleHelpCommand(msg); // فقط نمایش راهنمای کلی
     } else {
         await sendMessage(msg.chat.id, "این دستور فقط برای ادمین در چت خصوصی قابل استفاده است.");
     }
}


// --- Inline Keyboard Callbacks ---

async function handleCallbackQuery(query) {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    // حذف دکمه‌ها پس از کلیک (اختیاری)
    // await deleteMessage(chatId, messageId);

    const user = await getUser(userId);

    switch (data) {
        case 'status':
            await displayStatus(userId);
            break;

        case 'job_menu':
            let jobMessage = `<b>💼 منوی شغل</b>\n\n`;
            jobMessage += `شغل فعلی شما: <b>${(jobs[user.job] || jobs['unemployed']).name}</b>\n`;
            if (user.job && user.job !== 'unemployed') {
                jobMessage += `حقوق روزانه: ${jobs[user.job].salary} تومان | XP: ${jobs[user.job].xp}\n\n`;
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
            eduMessage += `هزینه: ${user.money} | XP: ${user.xp}\n\n`;
            eduMessage += `<b>گزینه‌ها:</b>\n`;
            for (const [key, edu] of Object.entries(educations)) {
                if (key === 'none') continue;
                if (user.education && educations[user.education].xp_gain >= edu.xp_gain) continue; // اگر سطح بالاتری دارد، نشان نده

                const canAfford = user.money >= edu.cost;
                const buttonText = `${edu.name} (هزینه: ${edu.cost.toLocaleString()} | XP: ${edu.xp_gain}) ${canAfford ? '✅' : '❌'}`;
                eduMessage += `- /study ${key} - ${buttonText}\n`;
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
                marriageMessage += `شما ${user.family.children.length} فرزند دارید.\n`;
                marriageMessage += `- /divorce - درخواست طلاق\n`;
            } else {
                marriageMessage += `شما مجرد هستید.\n`;
                marriageMessage += `- /propose [USER_ID] - پیشنهاد ازدواج به کاربر دیگر\n`;
                marriageMessage += `- /search_partner - جستجو برای همسر (قابلیت پیشرفته)\n`;
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
                businessMessage += `- /startbusiness [ID] - راه‌اندازی کسب‌وکار (لیست کسب‌وکارهای قابل راه‌اندازی: رستوران، فروشگاه، ...)\n`;
            }
             await sendMessage(chatId, businessMessage);
            break;

        case 'activities_menu':
             let activityMessage = `<b>🏃‍♂️ منوی فعالیت‌ها</b>\n\n`;
             activityMessage += `انرژی فعلی: ${user.energy}/100 | سلامتی: ${user.health}/100\n`;
             activityMessage += `- /exercise - ورزش (افزایش انرژی، کاهش سلامتی)\n`;
             activityMessage += `- /relax - استراحت (افزایش انرژی و سلامتی)\n`;
             activityMessage += `- /eat [ITEM_ID] - خوردن آیتم از موجودی\n`;
             activityMessage += `- /crime - انجام جرم (ریسک بالا، پاداش بالا)\n`;
             await sendMessage(chatId, activityMessage);
            break;

        case 'help':
            await handleHelpCommand({ from: query.from, chat: query.message.chat });
            break;

        default:
            // اگر داده ناشناس بود، فقط پیام را پاک کن یا پیغام خطا بده
            await sendMessage(chatId, "گزینه نامعتبر.");
            break;
    }
     // پس از پردازش callback، آن را تأیید کن تا دایره بارگذاری روی دکمه حذف شود.
     // بدون این، دکمه برای همیشه در حالت "فشرده" باقی می‌ماند.
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: query.id })
    });
}


// --- Main Message Handler ---
async function handleMessage(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const chatType = msg.chat.type; // 'private', 'group', 'supergroup', 'channel'
    const messageText = msg.text;

    // اطمینان از لود شدن کاربر
    await getUser(userId);

    // --- Admin Commands Handling ---
    if (userId.toString() === ADMIN_ID && chatType === 'private') {
        if (messageText.startsWith('/setmoney')) {
            await handleSetMoneyCommand(msg);
            return;
        }
        if (messageText.startsWith('/addmoney')) {
            await handleAddMoneyCommand(msg);
            return;
        }
        if (messageText.startsWith('/resetuser')) {
            await handleResetUserCommand(msg);
            return;
        }
        if (messageText === '/adminhelp') {
            await handleAdminHelpCommand(msg);
            return;
        }
    }

    // --- Regular User Commands ---
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
        // منطق پیدا کردن شغل جدید
        const user = usersData.get(userId);
        const availableJobs = Object.keys(jobs).filter(key => key !== 'unemployed'); // شغل‌هایی که می‌توان گرفت
        const randomIndex = Math.floor(Math.random() * availableJobs.length);
        const newJobKey = availableJobs[randomIndex];
        const newJob = jobs[newJobKey];

        if (user.money < newJob.cost) { // اگر برای شغل هزینه لازم است
             await sendMessage(chatId, `برای گرفتن شغل ${newJob.name} به ${newJob.cost} تومان نیاز دارید.`);
             return;
        }

        if (user.job && user.job !== 'unemployed') {
            // اگر شغل دارد، اول باید ترک کند یا هزینه‌ای بدهد
             await sendMessage(chatId, `شما در حال حاضر ${jobs[user.job].name} هستید. برای تغییر شغل، ابتدا شغل قبلی را ترک کنید (/quitjob).`);
             return;
        }

        user.job = newJobKey;
        user.money -= newJob.cost || 0; // کم کردن هزینه شغل اگر دارد
        addXP(userId, newJob.xp);
        saveUser(user);
        await sendMessage(chatId, `شما به عنوان ${newJob.name} استخدام شدید! ${newJob.description}`);
        await displayStatus(userId);
    } else if (messageText.startsWith('/work')) {
        const user = usersData.get(userId);
        if (!user.job || user.job === 'unemployed') {
            await sendMessage(chatId, "شما شغلی ندارید. ابتدا با /findjob یک شغل پیدا کنید.");
            return;
        }
        if (user.energy < 20) {
            await sendMessage(chatId, "انرژی شما کافی نیست. لطفاً استراحت کنید.");
            return;
        }

        const job = jobs[user.job];
        const salaryEarned = job.salary + Math.floor(Math.random() * 50); // مقداری تصادفی
        const xpGained = job.xp + Math.floor(Math.random() * 10);
        user.money += salaryEarned;
        user.energy -= 20; // مصرف انرژی
        addXP(userId, xpGained);
        saveUser(user);
        await sendMessage(chatId, `شما ${salaryEarned} تومان درآمد کسب کردید و ${xpGained} XP گرفتید. انرژی شما کم شد.`);
        await displayStatus(userId);
    } else if (messageText.startsWith('/quitjob')) {
        const user = usersData.get(userId);
        if (!user.job || user.job === 'unemployed') {
            await sendMessage(chatId, "شما شغلی ندارید که ترک کنید.");
            return;
        }
        const jobName = jobs[user.job].name;
        user.job = 'unemployed';
        saveUser(user);
        await sendMessage(chatId, `شما شغل ${jobName} را ترک کردید.`);
        await displayStatus(userId);
    }
    // --- Education Commands ---
    else if (messageText.startsWith('/study')) {
        const parts = messageText.split(' ');
        if (parts.length === 2) {
            const eduKey = parts[1];
            const edu = educations[eduKey];
            if (edu) {
                if (user.money >= edu.cost) {
                    if (user.education && educations[user.education].xp_gain >= edu.xp_gain) {
                         await sendMessage(chatId, `شما سطح تحصیلات بالاتری دارید.`);
                         return;
                    }
                    user.money -= edu.cost;
                    addXP(userId, edu.xp_gain);
                    user.education = eduKey;
                    saveUser(user);
                    await sendMessage(chatId, `شما ${edu.name} را با موفقیت گذراندید!`);
                    await displayStatus(userId);
                } else {
                    await sendMessage(chatId, `برای ${edu.name} به ${edu.cost.toLocaleString()} تومان نیاز دارید.`);
                }
            } else {
                await sendMessage(chatId, "سطح تحصیلات نامعتبر است.");
            }
        } else {
            await sendMessage(chatId, "فرمت دستور اشتباه است. از /study [KEY] استفاده کنید. (مثلا: /study university)");
        }
    }
    // --- Shop Commands ---
     else if (messageText.startsWith('/buy')) {
        const parts = messageText.split(' ');
        // /buy house apartment
        // /buy car sedan
        if (parts.length === 3) {
            const itemType = parts[1]; // 'house' or 'car'
            const itemKey = parts[2]; // 'apartment', 'sedan', etc.

            if (itemType === 'house') {
                const house = houses[itemKey];
                if (house) {
                    if (user.money >= house.price) {
                        if (user.house) {
                             await sendMessage(chatId, `شما قبلاً یک ${houses[user.house].name} دارید. برای خرید خانه جدید، ابتدا خانه فعلی را بفروشید یا اجاره دهید.`);
                             return;
                        }
                        user.money -= house.price;
                        user.house = itemKey;
                        addXP(userId, 100); // XP برای خرید خانه
                        saveUser(user);
                        await sendMessage(chatId, `شما ${house.name} را به قیمت ${house.price.toLocaleString()} تومان خریداری کردید.`);
                        await displayStatus(userId);
                    } else {
                        await sendMessage(chatId, `پول کافی برای خرید ${house.name} ندارید. قیمت: ${house.price.toLocaleString()} تومان.`);
                    }
                } else {
                    await sendMessage(chatId, "نوع خانه نامعتبر است.");
                }
            } else if (itemType === 'car') {
                 const car = cars[itemKey];
                if (car) {
                    if (user.money >= car.price) {
                         if (user.car) {
                             await sendMessage(chatId, `شما قبلاً یک ${cars[user.car].name} دارید. برای خرید ماشین جدید، ابتدا ماشین فعلی را بفروشید.`);
                             return;
                        }
                        user.money -= car.price;
                        user.car = itemKey;
                        addXP(userId, 50); // XP برای خرید ماشین
                        saveUser(user);
                        await sendMessage(chatId, `شما ${car.name} را به قیمت ${car.price.toLocaleString()} تومان خریداری کردید.`);
                        await displayStatus(userId);
                    } else {
                        await sendMessage(chatId, `پول کافی برای خرید ${car.name} ندارید. قیمت: ${car.price.toLocaleString()} تومان.`);
                    }
