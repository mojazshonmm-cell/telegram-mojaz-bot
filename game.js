// game.js (ESM)

export function buildGame(ctx) {
  const {
    getUser,
    clamp,
    statusText,
    sendMessage,
    levelUp,
    reward,
    mainMenu,
    back
  } = ctx;

  async function handleCallback({ chatId, data }) {
    const user = getUser(chatId);

    // MAIN / REFRESH
    if (data === 'main' || data === 'refresh') {
      await sendMessage(chatId, `${statusText(user)}\nیکی از گزینه‌ها را انتخاب کن:`, mainMenu);
      return;
    }

    // نمونه: منوی جدید برای ادامه بازی
    if (data === 'continue_menu') {
      await sendMessage(chatId, `${statusText(user)}\nادامه بازی:`, [
        [{ text: '🛒 فروشگاه', callback_data: 'shop_menu' }],
        [{ text: '🎯 ماموریت روزانه', callback_data: 'daily_mission' }],
        ...back
      ]);
      return;
    }

    // نمونه: فروشگاه
    if (data === 'shop_menu') {
      await sendMessage(chatId, `${statusText(user)}\nفروشگاه:`, [
        [{ text: '🍔 غذا (-25$ | +15❤️)', callback_data: 'buy_food' }],
        [{ text: '🛡 بیمه سلامت (-120$)', callback_data: 'buy_insurance' }],
        ...back
      ]);
      return;
    }

    if (data === 'buy_food') {
      if (user.money < 25) {
        await sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
        return;
      }
      user.money -= 25;
      user.health += 15;
      clamp(user);
      await sendMessage(chatId, `🍔 غذا خوردی.\n\n${statusText(user)}`, mainMenu);
      return;
    }

    if (data === 'buy_insurance') {
      if (user.money < 120) {
        await sendMessage(chatId, '💸 پول کافی نداری.', mainMenu);
        return;
      }
      user.money -= 120;
      user.health = Math.max(user.health, 80);
      clamp(user);
      await sendMessage(chatId, `🛡 بیمه سلامت خریدی.\n\n${statusText(user)}`, mainMenu);
      return;
    }

    // نمونه: ماموریت روزانه
    if (data === 'daily_mission') {
      const win = Math.random() < 0.7;
      if (win) {
        user.money += 60;
        user.xp += 20;
        let txt = '🎯 ماموریت روزانه موفق! +60$ +20XP';
        if (levelUp(user)) txt += '\n🎉 لول آپ!';
        clamp(user);
        await sendMessage(chatId, `${txt}\n\n${statusText(user)}`, mainMenu);
      } else {
        user.health -= 10;
        clamp(user);
        await sendMessage(chatId, `❌ ماموریت خراب شد. -10❤️\n\n${statusText(user)}`, mainMenu);
      }
      return;
    }

    // اگر اینجا رسید یعنی گزینه ناشناخته است
    await sendMessage(chatId, '❓ گزینه نامعتبر است.', mainMenu);
  }

  return { handleCallback };
}
