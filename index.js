    import express from 'express';

    const app = express();
    app.use(express.json());

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const SECRET_PATH = process.env.SECRET_PATH || 'my-secret-life-bot';
    const ADMIN_ID = '5576592239'; // <<< آیدی شما اینجا تنظیم شد
    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    if (!BOT_TOKEN) {
      console.error('❌ BOT_TOKEN تنظیم نشده');
      process.exit(1);
    }

    // RAM storage
    const users = new Map();

    function getUser(chatId) {
      if (!users.has(chatId)) {
        users.set(chatId, {
          money: 100,
          bank: 0,
          health: 100,
          xp: 0,
          level: 1,
          job: 'بیکار',
          education: 'ندارد',
          married: false,
          spouse: null,
          house: null,
          car: null,
          children: 0,
          familyLove: 50,
          business: null,
          criminal: false,
          jailTurns: 0,
          mafiaJoined: false,
          mafiaRank: null
        });
      }
      return users.get(chatId);
    }

    function isAdmin(userId) {
      return String(userId) === ADMIN_ID;
    }

    function clamp(user) {
      user.money = Math.max(0, user.money);
      user.bank = Math.max(0, user.bank);
      user.health = Math.max(0, Math.min(100, user.health));
      user.familyLove = Math.max(0, Math.min(100, user.familyLove));
      user.xp = Math.max(0, user.xp);
    }

    function statusText(user) {
      return `📊 *وضعیت شما*
    💰 پول نقد: ${user.money}$
    🏦 بانک: ${user.bank}$
    ❤️ سلامتی: ${user.health}%
    ⭐ لول: ${user.level}
    🧠 XP: ${user.xp}
    💼 شغل: ${user.job}
    🎓 تحصیل: ${user.education}
    💍 تاهل: ${user.married ? `متاهل با ${user.spouse}` : 'مجرد'}
    🏠 خانه: ${user.house || 'ندارد'}
    🚗 ماشین: ${user.car || 'ندارد'}
    👶 بچه: ${user.children}
    👨‍👩‍👧 عشق خانوادگی: ${user.familyLove}%
    🏢 کسب‌وکار: ${user.business || 'ندارد'}
    🚔 وضعیت جرم: ${user.criminal ? 'خلافکار' : 'سالم'}
    🔒 زندان: ${user.jailTurns > 0 ? `${user.jailTurns} نوبت` : 'آزاد'}
    🕴 مافیا: ${user.mafiaJoined ? `عضو (${user.mafiaRank || 'عضو'})` : 'عضو نیست'}
    ━━━━━━━━━━━━━━`;
    }

    async function sendMessage(chatId, text, keyboard = null) {
      const body = {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined
      };

      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    function levelUp(user) {
      const need = user.level * 50;
      if (user.xp >= need) {
        user.xp -= need;
        user.level++;
        return true;
      }
      return false;
    }

    function reward(user, money, xp, health = 0) {
      user.money += money;
      user.xp += xp;
      user.health += health;
      const up = levelUp(user);
      clamp(user);
      return up;
    }

    function punishment(user, money, health = 0) {
      user.money -= money;
      user.health -= health;
      clamp(user);
    }

    const mainMenu = [
      [{ text: '💼 کار', callback_data: 'work_menu' }, { text: '🎡 تفریح', callback_data: 'fun_menu' }],
      [{ text: '👨‍👩‍👧 خانواده', callback_data: 'family_menu' }, { text: '💍 ازدواج', callback_data: 'marriage_menu' }],
      [{ text: '🏠 خانه', callback_data: 'house_menu' }, { text: '🚗 ماشین', callback_data: 'car_menu' }],
      [{ text: '🎓 تحصیل', callback_data: 'edu_menu' }, { text: '🏦 بانک', callback_data: 'bank_menu' }],
      [{ text: '🏢 کسب‌وکار', callback_data: 'biz_menu' }, { text: '🚔 جرم و زندان', callback_data: 'crime_menu' }],
      [{ text: '🕴 مافیا', callback_data: 'mafia_menu' }, { text: '🏥 بیمارستان', callback_data: 'hospital' }],
      [{ text: '🔄 تازه‌سازی', callback_data: 'refresh' }]
    ];

    const back = [[{ text: '🔙 بازگشت', callback_data: 'main' }]];

    app.get('/', (req, res) => {
      res.send('Life Simulator Bot is running ✅');
    });

    app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
      try {
        const { message, callback_query } = req.body;
        const chatId = message?.chat?.id || callback_query?.message?.chat?.id;
        const fromId = message?.from?.id || callback_query?.from?.id;

        if (!chatId) return res.sendStatus(200);

        const user = getUser(chatId);

        if (user.jailTurns > 0 && callback_query?.data !== 'main' && callback_query?.data !== 'refresh') {
          user.jailTurns--;
          clamp(user);
          if (user.jailTurns === 0) {
            user.criminal = false;
            await sendMessage(chatId, '🔓 از زندان آزاد شدی!', mainMenu);
          } else {
            await sendMessage(chatId, `🚔 هنوز زندانی هستی. ${user.jailTurns} نوبت باقی مانده.`, mainMenu);
          }
          return res.sendStatus(200);
        }

        if (message?.text === '/admin') {
          if (!isAdmin(fromId)) {
            await sendMessage(chatId, '⛔ فقط ادمین');
            return res.sendStatus(200);
          }

          await sendMessage(chatId, '🛠 دستورات ادمین:\n/givecoins USER_ID AMOUNT');
          return res.sendStatus(200);
        }

        if (message?.text?.startsWith('/givecoins ')) {
          if (!isAdmin(fromId)) {
            await sendMessage(chatId, '⛔ فقط ادمین');
            return res.sendStatus(200);
          }

          const parts = message.text.trim().split(/\s+/);
          const targetUserId = Number(parts[1]);
          const amount = Number(parts[2]);

          if (!targetUserId || Number.isNaN(amount) || amount <= 0) {
            await sendMessage(chatId, 'فرمت درست:\n/givecoins USER_ID AMOUNT');
            return res.sendStatus(200);
          }

          const targetUser = getUser(targetUserId);
          targetUser.money += amount;
          clamp(targetUser);

          await sendMessage(
            chatId,
            `✅ ${amount}$ به کاربر ${targetUserId} داده شد.\n💰 پول فعلی: ${targetUser.money}$`
          );

          try {
            await sendMessage(
              targetUserId,
              `🎁 ادمین بهت ${amount}$ پول داد.\n💰 موجودی فعلی: ${targetUser.money}$`
            );
          } catch (e) {
            console.error('خطا در ارسال پیام به کاربر:', e);
          }

          return res.sendStatus(200);
        }

        if (message?.text === '/start') {
          await sendMessage(chatId, `سلام 👋\nبه شبیه‌ساز زندگی خوش اومدی.\n\n${statusText(user)}\nیکی از بخش‌ها رو انتخاب کن:`, mainMenu);
          return res.sendStatus(200);
        }

        if (!callback_query) return res.sendStatus(200);

        const data = callback_query.data;

        if (data === 'main' || data === 'refresh') {
          await sendMessage(chatId, `${statusText(user)}\nیکی از گزینه‌ها را انتخاب کن:`, mainMenu);
        }

        else if (data === 'work_menu') {
          await sendMessage(chatId, `${statusText(user)}\nیک شغل انتخاب کن:`, [
            [{ text: '🔨 کارگری (+20 | -10❤️ | +10XP)', callback_data: 'work_simple' }],
            [{ text: '💻 کار اداری (+35 | -15❤️ | +15XP)', callback_data: 'work_office' }],
            [{ text: '🚕 رانندگی (+25 | -12❤️ | +12XP)', callback_data: 'work_driver' }],
            ...back
          ]);
        }

        else if (data === 'work_simple') {
          if (user.health < 10) return sendMessage(chatId, '😵 خسته‌ای، اول استراحت کن.', mainMenu);
          user.job = 'کارگر';
          const up = reward(user, 20 + user.level * 2, 10, -10);
          let txt = '✅ کارگری کردی.';
          if (Math.random() < 0.12) {
            user.money += 30;
            txt += '\n🎁 پاداش گرفتی: 30$';
          }
          if (up) txt += `\n🎉 لول آپ! لول ${user.level}`;
          clamp(user);
          await sendMessage(chatId, `${txt}\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'work_office') {
          if (user.health < 15) return sendMessage(chatId, '😵 انرژی کافی نداری.', mainMenu);
          user.job = 'کارمند';
          const up = reward(user, 35 + user.level * 3, 15, -15);
          let txt = '✅ کار اداری انجام دادی.';
          if (Math.random() < 0.1) {
            user.money += 50;
            txt += '\n📈 پاداش عملکرد: 50$';
          }
          if (up) txt += `\n🎉 لول آپ! لول ${user.level}`;
          clamp(user);
          await sendMessage(chatId, `${txt}\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'work_driver') {
          if (user.health < 12) return sendMessage(chatId, '🚫 خیلی خسته‌ای برای رانندگی.', mainMenu);
          user.job = 'راننده';
          const up = reward(user, 25 + user.level * 2, 12, -12);
          let txt = '✅ رانندگی کردی.';
          if (Math.random() < 0.08) {
            user.money -= 20;
            txt += '\n🚓 جریمه شدی: 20$';
          }
          if (up) txt += `\n🎉 لول آپ! لول ${user.level}`;
          clamp(user);
          await sendMessage(chatId, `${txt}\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'fun_menu') {
          await sendMessage(chatId, `${statusText(user)}\nتفریح انتخاب کن:`, [
            [{ text: '🎬 سینما (-30$ | +15❤️)', callback_data: 'fun_movie' }],
            [{ text: '🚶 پیاده‌روی (+10❤️)', callback_data: 'fun_walk' }],
            [{ text: '🎵 موسیقی (+5❤️)', callback_data: 'fun_music' }],
            ...back
          ]);
        }

        else if (data === 'fun_movie') {
          if (user.money < 30) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 30;
          user.health += 15;
          clamp(user);
          await sendMessage(chatId, `🍿 سینما رفتی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'fun_walk') {
          user.health += 10;
          let txt = '🚶 پیاده‌روی کردی.';
          if (Math.random() < 0.15) {
            user.money += 10;
            txt += '\n💵 10$ پیدا کردی!';
          }
          clamp(user);
          await sendMessage(chatId, `${txt}\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'fun_music') {
          user.health += 5;
          clamp(user);
          await sendMessage(chatId, `🎵 موسیقی گوش دادی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'family_menu') {
          await sendMessage(chatId, `${statusText(user)}\nبخش خانواده:`, [
            [{ text: '📞 تماس (+10 عشق)', callback_data: 'family_call' }],
            [{ text: '🍽 شام (-20$ | +20 عشق | +5❤️)', callback_data: 'family_dinner' }],
            [{ text: '🧸 وقت با بچه‌ها (+15 عشق)', callback_data: 'family_kids_time' }],
            ...back
          ]);
        }

        else if (data === 'family_call') {
          user.familyLove += 10;
          clamp(user);
          await sendMessage(chatId, `📞 تماس گرفتی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'family_dinner') {
          if (user.money < 20) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 20;
          user.familyLove += 20;
          user.health += 5;
          clamp(user);
          await sendMessage(chatId, `🍽 شام خانوادگی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'family_kids_time') {
          if (user.children <= 0) return sendMessage(chatId, '👶 بچه‌ای نداری.', mainMenu);
          user.familyLove += 15;
          user.health += 5;
          clamp(user);
          await sendMessage(chatId, `🧸 با بچه‌ها وقت گذروندی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'marriage_menu') {
          await sendMessage(chatId, `${statusText(user)}\nازدواج و بچه:`, [
            [{ text: '💘 آشنایی (-20$)', callback_data: 'find_partner' }],
            [{ text: '💍 ازدواج (-100$)', callback_data: 'get_married' }],
            [{ text: '👶 بچه‌دار شدن (-50$)', callback_data: 'have_child' }],
            ...back
          ]);
        }

        else if (data === 'find_partner') {
          if (user.married) return sendMessage(chatId, '💍 قبلاً ازدواج کردی.', mainMenu);
          if (user.money < 20) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          const names = ['سارا', 'نگار', 'بهار', 'رها', 'امیر', 'علی', 'محمد', 'آرزو'];
          const name = names[Math.floor(Math.random() * names.length)];
          user.money -= 20;
          user.spouse = name;
          user.familyLove += 10;
          clamp(user);
          await sendMessage(chatId, `💘 با ${name} آشنا شدی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'get_married') {
          if (user.married) return sendMessage(chatId, '💍 قبلاً ازدواج کردی.', mainMenu);
          if (!user.spouse) return sendMessage(chatId, 'اول باید آشنا بشی.', mainMenu);
          if (user.money < 100) return sendMessage(chatId, '💸 پول کافی برای ازدواج نداری.', mainMenu);
          user.money -= 100;
          user.married = true;
          user.familyLove += 25;
          clamp(user);
          await sendMessage(chatId, `🎉 ازدواج کردی با ${user.spouse}!\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'have_child') {
          if (!user.married) return sendMessage(chatId, 'اول باید ازدواج کنی.', mainMenu);
          if (user.money < 50) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 50;
          user.children += 1;
          user.familyLove += 20;
          clamp(user);
          await sendMessage(chatId, `👶 بچه‌دار شدی!\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'house_menu') {
          await sendMessage(chatId, `${statusText(user)}\nبخش خانه:`, [
            [{ text: '🏚 اجاره کوچک (-40$)', callback_data: 'rent_small_house' }],
            [{ text: '🏠 خرید معمولی (-200$)', callback_data: 'buy_normal_house' }],
            [{ text: '🏡 خرید ویلا (-500$)', callback_data: 'buy_villa' }],
            ...back
          ]);
        }

        else if (data === 'rent_small_house') {
          if (user.money < 40) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 40;
          user.house = 'خانه کوچک اجاره‌ای';
          user.familyLove += 5;
          clamp(user);
          await sendMessage(chatId, `🏚 خانه اجاره کردی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'buy_normal_house') {
          if (user.money < 200) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 200;
          user.house = 'خانه معمولی';
          user.familyLove += 15;
          clamp(user);
          await sendMessage(chatId, `🏠 خانه خریدی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'buy_villa') {
          if (user.money < 500) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 500;
          user.house = 'ویلای بزرگ';
          user.familyLove += 30;
          clamp(user);
          await sendMessage(chatId, `🏡 ویلا خریدی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'car_menu') {
          await sendMessage(chatId, `${statusText(user)}\nماشین:`, [
            [{ text: '🚗 خرید ماشین معمولی (-150$)', callback_data: 'buy_car_normal' }],
            [{ text: '🚙 خرید ماشین خوب (-350$)', callback_data: 'buy_car_good' }],
            [{ text: '🏎 ماشین لوکس (-800$)', callback_data: 'buy_car_luxury' }],
            ...back
          ]);
        }

        else if (data === 'buy_car_normal') {
          if (user.money < 150) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 150;
          user.car = 'ماشین معمولی';
          clamp(user);
          await sendMessage(chatId, `🚗 ماشین خریدی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'buy_car_good') {
          if (user.money < 350) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 350;
          user.car = 'ماشین خوب';
          clamp(user);
          await sendMessage(chatId, `🚙 ماشین خوب خریدی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'buy_car_luxury') {
          if (user.money < 800) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 800;
          user.car = 'ماشین لوکس';
          clamp(user);
          await sendMessage(chatId, `🏎 ماشین لوکس خریدی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'edu_menu') {
          await sendMessage(chatId, `${statusText(user)}\nتحصیل:`, [
            [{ text: '📘 مدرسه (+10XP)', callback_data: 'edu_school' }],
            [{ text: '🎓 دانشگاه (-100$ | +30XP)', callback_data: 'edu_university' }],
            [{ text: '📚 دوره تخصصی (-50$ | +20XP)', callback_data: 'edu_course' }],
            ...back
          ]);
        }

        else if (data === 'edu_school') {
          user.education = 'دیپلم';
          reward(user, 0, 10, 0);
          await sendMessage(chatId, `📘 به مدرسه رفتی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'edu_university') {
          if (user.money < 100) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 100;
          user.education = 'دانشگاهی';
          reward(user, 0, 30, 0);
          await sendMessage(chatId, `🎓 دانشگاه رفتی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'edu_course') {
          if (user.money < 50) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 50;
          user.education = 'دوره تخصصی';
          reward(user, 0, 20, 0);
          await sendMessage(chatId, `📚 دوره تخصصی گذروندی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'bank_menu') {
          await sendMessage(chatId, `${statusText(user)}\nبانک:`, [
            [{ text: '💵 واریز به بانک', callback_data: 'bank_deposit' }, { text: '💸 برداشت از بانک', callback_data: 'bank_withdraw' }],
            ...back
          ]);
        }

        else if (data === 'bank_deposit') {
          const amount = Math.min(50, user.money);
          if (amount <= 0) return sendMessage(chatId, 'پول نقدی نداری.', mainMenu);
          user.money -= amount;
          user.bank += amount;
          clamp(user);
          await sendMessage(chatId, `💵 ${amount}$ به بانک واریز شد.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'bank_withdraw') {
          const amount = Math.min(50, user.bank);
          if (amount <= 0) return sendMessage(chatId, 'موجودی بانک نداری.', mainMenu);
          user.bank -= amount;
          user.money += amount;
          clamp(user);
          await sendMessage(chatId, `💸 ${amount}$ از بانک برداشت شد.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'biz_menu') {
          await sendMessage(chatId, `${statusText(user)}\nکسب‌وکار:`, [
            [{ text: '🏪 مغازه کوچک (-200$)', callback_data: 'biz_shop' }],
            [{ text: '🏬 شرکت متوسط (-500$)', callback_data: 'biz_company' }],
            ...back
          ]);
        }

        else if (data === 'biz_shop') {
          if (user.money < 200) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 200;
          user.business = 'مغازه کوچک';
          reward(user, 0, 25, 0);
          await sendMessage(chatId, `🏪 مغازه باز کردی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'biz_company') {
          if (user.money < 500) return sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
          user.money -= 500;
          user.business = 'شرکت متوسط';
          reward(user, 0, 50, 0);
          await sendMessage(chatId, `🏬 شرکت راه انداختی.\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'crime_menu') {
          await sendMessage(chatId, `${statusText(user)}\nجرم و زندان:`, [
            [{ text: '😈 دزدی (+40$ | خطر زندان)', callback_data: 'steal' }],
            [{ text: '🚔 تسلیم پلیس', callback_data: 'surrender' }],
            ...back
          ]);
        }

        else if (data === 'steal') {
          if (Math.random() < 0.45) {
            user.money += 40;
            user.criminal = true;
            let txt = '😈 دزدی موفق بودی و 40$ گرفتی.';
            if (Math.random() < 0.5) {
              user.jailTurns = 2;
              txt += '\n🚔 گیر افتادی و رفتی زندان!';
            }
            clamp(user);
            await sendMessage(chatId, `${txt}\n\n${statusText(user)}`, mainMenu);
          } else {
            user.criminal = true;
            user.jailTurns = 2;
            clamp(user);
            await sendMessage(chatId, `🚔 دزدی ناموفق بود و دستگیر شدی.\n\n${statusText(user)}`, mainMenu);
          }
        }

        else if (data === 'surrender') {
          if (user.criminal) {
            user.jailTurns = 1;
            clamp(user);
            await sendMessage(chatId, `🚔 خودت را تسلیم کردی.\n\n${statusText(user)}`, mainMenu);
          } else {
            await sendMessage(chatId, 'تو خلافکار نیستی.', mainMenu);
          }
        }

        else if (data === 'mafia_menu') {
          await sendMessage(chatId, `${statusText(user)}\nمافیا:`, [
            [{ text: '🕶 ورود به مافیا (-100$)', callback_data: 'join_mafia' }],
            [{ text: '💣 مأموریت مافیا', callback_data: 'mafia_mission' }],
            ...back
          ]);
        }

        else if (data === 'join_mafia') {
          if (user.money < 100) return sendMessage(chatId, '💸 برای ورود به مافیا 100$ لازم داری.', mainMenu);
          user.money -= 100;
          user.mafiaJoined = true;
          user.mafiaRank = 'عضو';
          user.criminal = true;
          clamp(user);
          await sendMessage(chatId, `🕶 وارد مافیا شدی!\n\n${statusText(user)}`, mainMenu);
        }

        else if (data === 'mafia_mission') {
          if (!user.mafiaJoined) return sendMessage(chatId, 'اول باید عضو مافیا بشی.', mainMenu);
          const win = Math.random() < 0.6;
          if (win) {
            user.money += 120;
            user.xp += 30;
            if (Math.random() < 0.2) user.health -= 10;
            let txt = '💣 مأموریت موفق بود و 120$ گرفتی.';
            if (levelUp(user)) txt += `\n🎉 لول آپ!`;
            clamp(user);
            await sendMessage(chatId, `${txt}\n\n${statusText(user)}`, mainMenu);
          } else {
            user.jailTurns = 2;
            user.criminal = true;
            clamp(user);
            await sendMessage(chatId, `🚔 مأموریت لو رفت و رفتی زندان.\n\n${statusText(user)}`, mainMenu);
          }
        }

        else if (data === 'hospital') {
          if (user.money < 50) return sendMessage(chatId, '💸 هزینه بیمارستان 50$ است.', mainMenu);
          user.money -= 50;
          user.health = 100;
          clamp(user);
          await sendMessage(chatId, `🏥 درمان شدی.\n\n${statusText(user)}`, mainMenu);
        }

        else {
          await sendMessage(chatId, '❓ گزینه نامعتبر است.', mainMenu);
        }

        return res.sendStatus(200);
      } catch (err) {
        console.error(err);
        return res.sendStatus(500);
      }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
