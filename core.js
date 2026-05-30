// core.js
export const users = new Map();

export function getUser(chatId) {
  if (!users.has(chatId)) {
    users.set(chatId, {
      money: 100,
      bank: 0,
      health: 100,
      xp: 0,
      level: 1,

      job: 'بیکار',
      education: 'ابتدایی',

      married: false,
      spouse: null,
      children: 0,

      house: 'ندارد',
      car: 'ندارد',
      business: 'ندارد',

      familyLove: 50,

      criminal: 0,
      jailTurns: 0,

      mafiaJoined: false,
      mafiaRank: 'عضو ساده'
    });
  }
  return users.get(chatId);
}

export function clamp(user) {
  user.money = Math.max(0, user.money);
  user.bank = Math.max(0, user.bank);
  user.health = Math.min(100, Math.max(0, user.health));
  user.xp = Math.max(0, user.xp);
  user.level = Math.max(1, user.level);
  user.children = Math.max(0, user.children);
  user.familyLove = Math.min(100, Math.max(0, user.familyLove));
  user.jailTurns = Math.max(0, user.jailTurns);
}

export function levelUp(user) {
  const need = user.level * 50;
  if (user.xp >= need) {
    user.xp -= need;
    user.level += 1;
    return true;
  }
  return false;
}

export function reward(user, money = 0, xp = 0, health = 0) {
  user.money += money;
  user.xp += xp;
  user.health += health;
  clamp(user);
  return levelUp(user);
}

export function statusText(user) {
  return (
`📊 وضعیت شما:
💰 پول: ${user.money}$
🏦 بانک: ${user.bank}$
❤️ سلامتی: ${user.health}%
⭐ XP: ${user.xp}
🏅 لول: ${user.level}
💼 شغل: ${user.job}
🎓 تحصیلات: ${user.education}
💍 متأهل: ${user.married ? 'بله' : 'خیر'}
👩‍❤️‍👨 همسر: ${user.spouse || 'ندارد'}
👶 بچه‌ها: ${user.children}
🏠 خانه: ${user.house}
🚗 ماشین: ${user.car}
🏪 کسب‌وکار: ${user.business}
👪 عشق خانوادگی: ${user.familyLove}
🚔 سابقه جرم: ${user.criminal}
⛓ زندان: ${user.jailTurns > 0 ? `بله (${user.jailTurns} نوبت)` : 'خیر'}
🕶 مافیا: ${user.mafiaJoined ? user.mafiaRank : 'عضو نیست'}`
  );
}

// یک ردیف دکمه برگشت
export const back = [
  [{ text: '🔙 بازگشت', callback_data: 'main' }]
];

// منوی اصلی
export const mainMenu = [
  [{ text: '💼 کار', callback_data: 'work_menu' }],
  [{ text: '🎮 تفریح', callback_data: 'fun_menu' }],
  [{ text: '👪 خانواده', callback_data: 'family_menu' }],
  [{ text: '💍 ازدواج', callback_data: 'marriage_menu' }],
  [{ text: '🏠 خانه', callback_data: 'house_menu' }],
  [{ text: '🚗 ماشین', callback_data: 'car_menu' }],
  [{ text: '🎓 تحصیل', callback_data: 'edu_menu' }],
  [{ text: '🏦 بانک', callback_data: 'bank_menu' }],
  [{ text: '🏪 کسب‌وکار', callback_data: 'biz_menu' }],
  [{ text: '🚔 جرم', callback_data: 'crime_menu' }],
  [{ text: '🕶 مافیا', callback_data: 'mafia_menu' }],
  [{ text: '🏥 بیمارستان', callback_data: 'hospital' }],
  [{ text: '🔄 بروزرسانی', callback_data: 'refresh' }]
];
