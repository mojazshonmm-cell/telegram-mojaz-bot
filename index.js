import express from "express";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !SECRET_PATH) {
  console.error("BOT_TOKEN or SECRET_PATH is missing");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// --- Player State ---
const players = new Map(); // stores player state in RAM

// --- Game Data ---
const careers = {
  // Basic Jobs
  unemployed: { name: "بیکار", money: -10, energy: 5, happiness: -10, intelligence: 0, requires: null, min_age: 18, max_age: 60, description: "هیچ شغلی نداری و دخل و خرجت جور نیست." },
  worker: { name: "کارگر ساده", money: 20, energy: -15, happiness: -5, intelligence: -2, requires: null, min_age: 18, max_age: 60, description: "یه شغل معمولی با درآمد کم و سختی زیاد." },
  seller: { name: "فروشنده", money: 40, energy: -12, happiness: 0, intelligence: 3, requires: "high_school", min_age: 20, max_age: 60, description: "با مردم سروکار داری و کمیسیون می‌گیری." },
  artist: { name: "هنرمند", money: 30, energy: -10, happiness: 10, intelligence: 5, requires: "university", min_age: 22, max_age: 55, description: "استعدادت رو به نمایش می‌ذاری، گاهی پولداری، گاهی نه." },
  // Funny/Risky Jobs
  "saggi": { name: "ساقی (پنهانی!)", money: 60, energy: -20, happiness: -15, intelligence: -5, requires: "middle_school", min_age: 20, max_age: 45, description: "کار خطرناک با درآمد خوب، ولی ریسک بالایی داره!", special_risk: "arrest_gambling", risk_chance: 0.3, risk_penalty: { money: -200, happiness: -25, alive: true } },
  // Professional Jobs
  doctor: { name: "پزشک", money: 100, energy: -25, happiness: 5, intelligence: 15, requires: "university", min_age: 28, max_age: 60, description: "زندگی مردم رو نجات می‌دی، ولی خیلی خسته‌کننده‌ست." },
  entrepreneur: { name: "کارآفرین", money: 80, energy: -18, happiness: 15, intelligence: 10, requires: "university", min_age: 25, max_age: 55, description: "کسب و کار خودت رو راه می‌ندازی، پر از ریسک و موفقیت." },
  teacher: { name: "معلم", money: 50, energy: -10, happiness: 10, intelligence: 8, requires: "university", min_age: 22, max_age: 60, description: "آینده‌سازان رو تربیت می‌کنی، با درآمد متوسط." },
};

const educationLevels = {
  none: { name: "بی‌سواد", intelligence_boost: 0, money_boost: -5, happiness_boost: -5, requires_age: 18, cost: 10, next: "primary_school", description: "هیچ مدرکی نداری." },
  primary_school: { name: "ابتدایی", intelligence_boost: 5, money_boost: 0, happiness_boost: -2, requires_age: 19, cost: 20, next: "middle_school", description: "سوادت در حد خواندن و نوشتن اولیه است." },
  middle_school: { name: "راهنمایی", intelligence_boost: 7, money_boost: 5, happiness_boost: 0, requires_age: 20, cost: 40, next: "high_school", description: "کمی از درس‌ها رو یاد گرفتی." },
  high_school: { name: "دیپلم", intelligence_boost: 10, money_boost: 10, happiness_boost: 5, requires_age: 21, cost: 70, next: "university", description: "مدرک دیپلم داری و می‌تونی دنبال کار یا دانشگاه بری." },
  university: { name: "دانشگاه", intelligence_boost: 15, money_boost: 20, happiness_boost: 10, requires_age: 24, cost: 150, next: "post_grad", description: "در یک رشته دانشگاهی تحصیل کردی." },
  post_grad: { name: "فوق لیسانس/دکترا", intelligence_boost: 20, money_boost: 30, happiness_boost: 15, requires_age: 27, cost: 250, next: null, description: "متخصص در یک زمینه خاص شدی." },
};

// --- Helper Functions ---
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function createPlayer(chatId, firstName) {
  return {
    chatId,
    name: firstName || "بازیکن",
    age: 18,
    money: 50,
    energy: 70,
    intelligence: 40,
    happiness: 50,
    health: 80,
    stage: "شروع جوانی",
    career: "unemployed",
    education: "none",
    alive: true,
    married: false,
    children: 0,
    has_car: false,
    has_house: false,
    relationships: {}, // Stores relationship levels with spouse, kids, etc.
    achievements: [], // List of achievements
    year_events: [], // To store events of the current year
  };
}

function getCareer(key) { return careers[key] || careers.unemployed; }
function getEducation(key) { return educationLevels[key] || educationLevels.none; }

function updatePlayerStats(player) {
  const career = getCareer(player.career);
  const education = getEducation(player.education);

  // Base stats update
  player.intelligence = clamp(40 + education.intelligence_boost + career.intelligence, 0, 100);
  player.money += career.money;
  player.energy = clamp(player.energy + career.energy, 0, 100);
  player.happiness = clamp(player.happiness + career.happiness + education.happiness_boost, 0, 100);
  player.money += education.money_boost; // Cost/benefit of education

  // Clamp stats
  player.health = clamp(player.health, 0, 100);
  player.money = clamp(player.money, -500, 99999); // Allow some debt

  // Apply special career effects (like risks)
  if (career.special_risk && Math.random() < career.risk_chance) {
    player.money += career.risk_penalty?.money || 0;
    player.happiness += career.risk_penalty?.happiness || 0;
    if (career.risk_penalty?.alive === false) player.alive = false;
    player.year_events.push(`\n⚠️ ریسک شغلی ${career.name}: ${career.description}`);
  }
}

function checkGameStatus(player) {
  if (!player.alive) return "بازی تمام شده.";

  if (player.energy <= 0) { player.alive = false; return "☠️ انرژی تو تموم شد. از فشار زندگی کم آوردی."; }
  if (player.health <= 0) { player.alive = false; return "💔 سلامتیت به صفر رسید. جسمت دیگه نتونست دووم بیاره."; }
  if (player.happiness <= 0) { player.alive = false; return "😔 خوشحالیت به صفر رسید. زندگی برات بی‌معنا شد."; }
  if (player.money < -200) { player.alive = false; return "🏦 ورشکست شدی! بدهی‌هات خیلی زیاد شد."; }

  if (player.age >= 60) { // Game ends at 60
    player.alive = false;
    let finalMsg = "🏁 زندگی شما به پایان رسید.\n\n";
    finalMsg += `ثروت نهایی: ${player.money} 💰\n`;
    finalMsg += `هوش: ${player.intelligence} 🧠\n`;
    finalMsg += `سلامتی: ${player.health} ❤️\n`;
    finalMsg += `خوشحالی: ${player.happiness} 😊\n`;
    finalMsg += `تعداد فرزندان: ${player.children} 👶\n`;

    if (player.money >= 15000 && player.happiness >= 70 && player.health >= 70) finalMsg += "🌟 شما یک زندگی بسیار موفق و پربار داشتید!";
    else if (player.money >= 7000) finalMsg += "👍 زندگی خوبی داشتی، پر از تجربه‌ها و موفقیت‌های قابل قبول.";
    else if (player.happiness >= 80) finalMsg += "🌈 شاید خیلی پولدار نشدی، ولی زندگی شاد و پرمحتوایی داشتی.";
    else finalMsg += "🙂 زندگی شما فراز و نشیب‌های زیادی داشت.";
    return finalMsg;
  }
  return null;
}

function getRandomEvent(player) {
  const events = [];
  const random = Math.random();

  // --- Education Events ---
  if (player.age >= getEducation(player.education).requires_age && getEducation(player.education).next) {
      events.push(`edu_${getEducation(player.education).next}`);
  }

  // --- Career Events ---
  // Try to find a new job if unemployed or if current job is below age limit
  const currentCareer = getCareer(player.career);
  if (player.age >= getCareer(player.career).min_age && player.age <= getCareer(player.career).max_age) {
     if (player.career === "unemployed" && player.age >= 19 && random < 0.4) events.push("event_find_job");
     // Chance to switch careers if job doesn't fit age or other factors
     if (player.career !== "unemployed" && player.age >= getCareer(player.career).max_age - 5 && random < 0.3) events.push("event_change_career");
  }

  // --- Life Events ---
  if (player.age >= 22 && random < 0.3) events.push("event_find_love");
  if (player.married && player.age >= 24 && random < 0.2) events.push("event_have_child");
  if (player.age >= 25 && random < 0.15) events.push("event_buy_car");
  if (player.age >= 28 && random < 0.1) events.push("event_buy_house");
  if (random < 0.1) events.push("event_random_illness");
  if (random < 0.05) events.push("event_lottery_win");
  if (random < 0.08) events.push("event_accident");
  if (player.money > 500 && random < 0.1) events.push("event_investment_opportunity");
  if (player.health < 50 && random < 0.2) events.push("event_health_scare");
  if (player.happiness < 30 && random < 0.15) events.push("event_find_new_hobby");
  
  // BitLife-like crazy events
  if (random < 0.03) events.push("event_alien_encounter"); // Very rare
  if (random < 0.04) events.push("event_find_treasure");
  if (random < 0.07) events.push("event_sudden_inheritance");
  if (player.career === "saggi" && random < 0.15) events.push("event_saggi_risk_text"); // Specific text for the saggi risk

  const uniqueEvents = [...new Set(events)];
  return uniqueEvents.length > 0 ? uniqueEvents[Math.floor(Math.random() * uniqueEvents.length)] : null;
}

function processEvent(player, eventKey) {
  let eventText = "";
  const currentAge = player.age;
  const random = Math.random();

  switch (eventKey) {
    // --- Education ---
    case "edu_primary_school": if (player.education === "none") { player.education = "primary_school"; eventText = "💡 فرصتی برای یادگیری پیدا کردی و ابتدایی رو با موفقیت تموم کردی!"; } break;
    case "edu_middle_school": if (player.education === "primary_school") { player.education = "middle_school"; eventText = "📚 یادگیری رو ادامه دادی و راهنمایی رو با نمرات خوب تموم کردی."; } break;
    case "edu_high_school": if (player.education === "middle_school") { player.education = "high_school"; eventText = "🎓 دیپلم گرفتی! حالا گزینه‌های بیشتری برای شغل و دانشگاه داری."; } break;
    case "edu_university": if (player.education === "high_school") { player.education = "university"; eventText = "🎓 وارد دانشگاه شدی! آینده شغلیت روشن‌تر شد."; } break;
    case "edu_post_grad": if (player.education === "university") { player.education = "post_grad"; eventText = "🏆 مدرک عالی گرفتی! در رشته خودت متخصص شدی."; } break;

    // --- Career ---
    case "event_find_job":
      if (player.career === "unemployed") {
        const availableCareers = Object.keys(careers).filter(c => {
          const career = getCareer(c);
          return player.age >= career.min_age && player.age <= career.max_age && 
                 (career.requires === null || (getEducation(player.education)?.name && getEducation(player.education).name.includes(career.requires.replace("_school", " ")).replace("university", "دانشگاه"))) ; // Simplified check
        });
        if (availableCareers.length > 0) {
          player.career = availableCareers[Math.floor(Math.random() * availableCareers.length)];
          eventText = `💼 شغلی پیدا کردی: ${getCareer(player.career).name}! ${getCareer(player.career).description}`;
        }
      }
      break;
    case "event_change_career": // Allow changing career
        const possibleCareers = Object.keys(careers).filter(c => {
            const career = getCareer(c);
            return player.age >= career.min_age && player.age <= career.max_age && 
                   (career.requires === null || getEducation(player.education)?.name?.includes(career.requires.replace("_school", " ")).replace("university", "دانشگاه"));
        });
        if (possibleCareers.length > 1) { // More than 1 career available
            const newCareerKey = possibleCareers[Math.floor(Math.random() * possibleCareers.length)];
            if (newCareerKey !== player.career) {
                player.career = newCareerKey;
                eventText = `✨ مسیر شغلی‌ات عوض شد. حالا ${getCareer(player.career).name} هستی. ${getCareer(player.career).description}`;
            }
        }
        break;
        
    // --- Life Events ---
    case "event_find_love":
      if (!player.married && player.age >= 22 && random < 0.6) {
        player.married = true;
        player.happiness += 15;
        player.relationships.spouse = { happiness: 50 }; // Initial relationship
        eventText = "❤️ با کسی آشنا شدی و زندگی مشترک رو شروع کردید! خوشحالی‌ات زیاد شد.";
      }
      break;
    case "event_have_child":
      if (player.married && player.children < 3 && random < 0.4) { // Max 3 kids for simplicity
        player.children++;
        player.happiness += 10;
        player.energy -= 10;
        player.relationships[`child_${player.children}`] = { happiness: 50 };
        eventText = `👶 صاحب فرزند ${player.children}ام شدی! مسئولیت‌ها بیشتر شد ولی خوشحالی هم بیشتر.`;
      }
      break;
    case "event_buy_car":
      if (!player.has_car && player.money >= 200 && random < 0.7) {
        player.has_car = true;
        player.money -= 200;
        player.happiness += 5;
        eventText = "🚗 یه ماشین خریدی! رفت و آمدت راحت‌تر شد و حس خوبی داری.";
      }
      break;
    case "event_buy_house":
      if (!player.has_house && player.money >= 500 && random < 0.5) {
        player.has_house = true;
        player.money -= 500;
        player.happiness += 15;
        eventText = "🏡 خونه خریدی! دیگه جای امن و شخصی خودت رو داری.";
      }
      break;
    case "event_random_illness":
      if (player.health > 30 && random < 0.6) {
        const severity = Math.floor(Math.random() * 30) + 10;
        player.health -= severity;
        player.happiness -= 10;
        player.energy -= 10;
        eventText = `🤒 مریض شدی! سلامتیت ${severity} تا کم شد و احساس ضعف می‌کنی.`;
      }
      break;
    case "event_lottery_win":
      if (random < 0.1) {
        const amount = Math.floor(Math.random() * 1000) + 500;
        player.money += amount;
        player.happiness += 20;
        eventText = `🍀 در لاتاری برنده شدی! ${amount} تا به حسابت اضافه شد!`;
      }
      break;
      
    case "event_accident":
      if (player.has_car && random < 0.3) {
        const damage = Math.floor(Math.random() * 40) + 20;
        player.health -= damage;
        player.money -= 100; // Repair costs
        player.happiness -= 15;
        eventText = `💥 تصادف کردی! سلامتیت ${damage} تا کم شد و باید ماشین رو تعمیر کنی.`;
      }
      break;
      
    case "event_investment_opportunity":
      if (player.money >= 100 && random < 0.5) {
         const investAmount = Math.floor(Math.random() * 100) + 50;
         const returnAmount = investAmount * (random < 0.3 ? 1.5 : (random < 0.7 ? 1.1 : 0.8)); // Variable return
         player.money -= investAmount;
         player.money += Math.floor(returnAmount);
         player.happiness += (returnAmount > investAmount ? 5 : -5);
         eventText = `📈 فرصت سرمایه‌گذاری پیش اومد. ${investAmount} تا رو سرمایه‌گذاری کردی و ${Math.floor(returnAmount)} تا برگشت.`;
      }
      break;
      
    case "event_health_scare":
      if (player.health < 50 && random < 0.7) {
        const treatmentCost = Math.floor(Math.random() * 50) + 20;
        player.money -= treatmentCost;
        player.health += 10; // Slight improvement
        player.happiness -= 10;
        eventText = `🩺 یه مشکل سلامتی جدی داشتی، ولی با ${treatmentCost} تا هزینه درمان، بهتر شدی. مراقب سلامتیت باش!`;
      }
      break;
      
    case "event_find_new_hobby":
      if (player.happiness < 30 && random < 0.5) {
         const hobbies = ["نقاشی", "موسیقی", "ورزش", "کتابخوانی", "باغبانی"];
         const hobby = hobbies[Math.floor(Math.random() * hobbies.length)];
         player.happiness += 15;
         player.energy -= 5;
         eventText = `🎨 یه سرگرمی جدید پیدا کردی: ${hobby}! حال و هوات عوض شد.`;
      }
      break;
      
    // --- "BitLife" Crazy Events ---
    case "event_alien_encounter": // Extremely rare
      eventText = "👽 ناگهان یک بشقاب پرنده ظاهر شد و چند فضایی تو رو دزدیدن! بعد از چند روز تو رو برگردوندن ولی حافظه‌ات پاک شده بود!";
      player.health = 50; player.happiness = 10; player.intelligence = 20; player.money = 0; // Reset stats
      break;
    case "event_find_treasure":
      if (random < 0.2) {
         const amount = Math.floor(Math.random() * 500) + 200;
         player.money += amount;
         player.happiness += 15;
         eventText = `🗺️ یه نقشه گنج پیدا کردی و کلی طلا پیدا کردی! ${amount} تا به دست آوردی!`;
      }
      break;
    case "event_sudden_inheritance":
      if (random < 0.1) {
         const amount = Math.floor(Math.random() * 2000) + 1000;
         player.money += amount;
         player.happiness += 25;
         eventText = `📜 ارثیه هنگفتی از یک فامیل دورافتاده بهت رسید! ${amount} تا پولدار شدی!`;
      }
      break;
    case "event_saggi_risk_text": // Just flavor text for saggi risk
        eventText = "⚠️ در کار خلاف، حسابی ریسک کردی و نزدیک بود گیر بیفتی!";
        break;
        
    default:
      break;
  }
  if (eventText) player.year_events.push(eventText);
}

function processYear(player) {
  player.year_events = []; // Clear previous year's events
  
  // Apply base job/education effects for the year
  updatePlayerStats(player);
  
  // Introduce random events
  const eventKey = getRandomEvent(player);
  if (eventKey) {
    processEvent(player, eventKey);
  }
  
  // End of year checks & adjustments
  const gameOverMessage = checkGameStatus(player);
  if (gameOverMessage) return gameOverMessage; // Game ended this year

  // Age, energy, happiness naturally change
  player.age += 1;
  player.energy = clamp(player.energy - 5 - (player.career === 'doctor' ? 5 : 0) - (player.children > 0 ? 5 : 0), 0, 100); // More drain for doctor/parents
  player.happiness = clamp(player.happiness - 2 - (player.career === 'unemployed' ? 5 : 0) - (player.married ? -2 : 0), 0, 100); // Unemployed lose more happiness

  // Check if still alive after end-of-year stat adjustments
  const stillAlive = checkGameStatus(player);
  if (stillAlive) {
     player.year_events.push(`\n📅 وارد ${player.age} سالگی شدی.`);
  }
  
  // Update player's career based on age limits if needed
  if (player.age > getCareer(player.career).max_age) {
      player.career = "unemployed";
      player.year_events.push("\n💀 شغل قبلی شما به دلیل بالا رفتن سن دیگر مناسب نیست. بیکار شدید.");
  }

  return stillAlive; // Return game over message if ended, null otherwise
}

// --- Keyboards ---
function mainMenuMarkup() {
  return { reply_markup: { inline_keyboard: [[{ text: "🌟 شروع بازی زندگی", callback_data: "start_game" }], [{ text: "❓ راهنما", callback_data: "help" }]] }};
}
function backToMenuMarkup() {
  return { reply_markup: { inline_keyboard: [[{ text: "🏠 بازگشت به منو", callback_data: "main_menu" }]] }};
}

function educationMenuMarkup(player) {
  const currentEduKey = player.education;
  const options = [];
  let nextEduKey = getEducation(currentEduKey)?.next;
  
  while(nextEduKey) {
      const edu = getEducation(nextEduKey);
      options.push({ text: `${edu.name} (هزینه: ${edu.cost} 💰)`, data: `edu_${nextEduKey}` });
      nextEduKey = edu.next;
  }
  return { inline_keyboard: [options, [{text: "❌ انصراف", data: "cancel_edu"}]] };
}

function careerMenuMarkup(player) {
  const options = [];
  const currentCareerKey = player.career;
  const currentEduLevel = player.education;
  const playerAge = player.age;

  for (const [key, career] of Object.entries(careers)) {
    if (key === currentCareerKey) continue;
    if (playerAge < career.min_age || playerAge > career.max_age) continue; // Age restriction

    let canTakeJob = false;
    const requiredEduKey = career.requires;
    if (!requiredEduKey) {
      canTakeJob = true;
    } else {
      // Check if player's education level meets the requirement
      let tempEduKey = currentEduLevel;
      while(tempEduKey) {
        if (tempEduKey === requiredEduKey) {
          canTakeJob = true;
          break;
        }
        tempEduKey = getEducation(tempEduKey)?.next; // Check higher education levels too
      }
    }

    if (canTakeJob) {
      options.push({ text: `${career.name} (${career.money} 💰)`, data: `career_${key}` });
    }
  }
  return { inline_keyboard: [options, [{text: "❌ انصراف", data: "cancel_career"}]] };
}

function lifeMenuMarkup(player) {
  const keyboard = [];
  // Education & Career options
  if (player.age < 60) {
      keyboard.push([{ text: "📚 تغییر تحصیلات", callback_data: "change_edu" }]);
      keyboard.push([{ text: "💼 تغییر شغل", callback_data: "change_career" }]);
  }
  // Life Actions
  if (player.age >= 22 && !player.married && player.happiness > 40) keyboard.push([{ text: "💍 ازدواج", callback_data: "act_marry" }]);
  if (!player.has_car && player.money >= 200 && player.age >= 25) keyboard.push([{ text: "🚗 خرید ماشین", callback_data: "act_buy_car" }]);
  if (!player.has_house && player.money >= 500 && player.age >= 28) keyboard.push([{ text: "🏡 خرید خانه", callback_data: "act_buy_house" }]);
  if (player.married && player.age >= 24 && player.children < 3) keyboard.push([{ text: "👶 بچه‌دار شدن", callback_data: "act_have_child" }]);
  
  // Status and Progression
  keyboard.push([{ text: "📊 وضعیت فعلی", callback_data: "show_stats" }]);
  if (player.age < 60) keyboard.push([{ text: "➡️ سال بعد", callback_data: "next_year" }]);
  keyboard.push([{ text: "🛑 پایان بازی", callback_data: "end_game" }]);

  return { reply_markup: { inline_keyboard: keyboard } };
}

function statsText(player) {
  let text = `👤 نام: ${player.name}\n`;
  text += `🎂 سن: ${player.age}\n`;
  text += `💰 پول: ${player.money} 💰\n`;
  text += `⚡ انرژی: ${player.energy} / 100\n`;
  text += `🧠 هوش: ${player.intelligence} / 100\n`;
  text += `😊 خوشحالی: ${player.happiness} / 100\n`;
  text += `❤️ سلامتی: ${player.health} / 100\n`;
  text += `🎓 تحصیلات: ${getEducation(player.education).name}\n`;
  text += `💼 شغل: ${getCareer(player.career).name}\n`;
  text += `📍 وضعیت: ${player.stage}\n`;
  if (player.married) text += "💍 متاهل\n";
  if (player.children > 0) text += `👶 فرزندان: ${player.children}\n`;
  if (player.has_car) text += "🚗 صاحب خودرو\n";
  if (player.has_house) text += "🏡 صاحب خانه\n";
  return text;
}

// --- Webhook Route ---
app.post(`/webhook/${SECRET_PATH}`, async (req, res) => {
  res.sendStatus(200);
  const update = req.body;

  try {
    // --- Message Handling ---
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const firstName = update.message.from?.first_name || "بازیکن";

      if (update.message.text === "/start") {
        players.delete(chatId);
        await telegram("sendMessage", {
          chat_id: chatId,
          text: `سلام ${firstName}! 👋\nبه بازی «زندگی پر فراز و نشیب» خوش اومدی!\nآماده‌ای که زندگی خودت رو بسازی؟`,
          ...mainMenuMarkup(),
        });
      }
    }

    // --- Callback Query Handling ---
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;
      const messageId = cq.message.message_id;
      const data = cq.data;
      const firstName = cq.from?.first_name || "بازیکن";

      await telegram("answerCallbackQuery", { callback_query_id: cq.id });

      let player = players.get(chatId);

      // --- Main Menu Actions ---
      if (data === "main_menu") {
        players.delete(chatId);
        await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `سلام ${firstName}! 👋\nبه منوی اصلی خوش اومدی.\nآماده‌ای زندگی رو بسازی؟`, ...mainMenuMarkup() });
        return;
      }
      if (data === "help") {
        await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "راهنما:\n" +
          "اینجا باید با تصمیم‌هات زندگی خودت رو شکل بدی. هر انتخاب مسیر رو عوض می‌کنه.\n" +
          "شغل، تحصیلات، اتفاقات و تصمیم‌های تو روی همه چیز اثر می‌ذاره.\n" +
          "هدف اینه که تا سن 60 سالگی، زندگی خوبی داشته باشی!", ...backToMenuMarkup() });
        return;
      }
      if (data === "start_game") {
        player = createPlayer(chatId, firstName);
        players.set(chatId, player);
        await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `🎮 بازی شروع شد!\n\nتو ${player.age} سالته و اول راهی.\nبیا اولین تصمیمت رو بگیر:\n\n${statsText(player)}`, ...lifeMenuMarkup(player) });
        return;
      }

      // --- Game in Progress Checks ---
      if (!player) {
        await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "⚠️ اول باید بازی رو از منوی اصلی شروع کنی.", ...mainMenuMarkup() });
        return;
      }

      // --- State Modifying Actions ---
      if (data === "show_stats") {
        await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `📊 وضعیت فعلی تو:\n\n${statsText(player)}`, ...lifeMenuMarkup(player) });
      }
      
      // --- Education ---
      else if (data === "change_edu") {
        await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "📚 کدوم مقطع تحصیلی رو می‌خوای ادامه بدی؟", ...educationMenuMarkup(player) });
      } else if (data.startsWith("edu_")) {
        const newEduKey = data.split('_')[1];
        const edu = getEducation(newEduKey);
        if (edu && player.education !== newEduKey && player.age >= edu.requires_age) {
           if (player.money >= edu.cost && player.energy >= 15) {
             player.education = newEduKey;
             player.money -= edu.cost;
             player.energy -= 15;
             player.stage = `در حال تحصیل (${edu.name})`;
             player.year_events.push(`\n📚 ${edu.name} را شروع کردی. ${edu.description}`);
             await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `✅ تحصیلاتت به ${edu.name} ارتقا پیدا کرد.\n\n${statsText(player)}`, ...lifeMenuMarkup(player) });
           } else {
              await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "❌ پول یا انرژی کافی برای این مقطع تحصیلی نداری.", ...lifeMenuMarkup(player) });
           }
        } else if (player.age < edu?.requires_age) {
           await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `❌ هنوز برای ${edu.name} زود است. باید حداقل ${edu.requires_age} ساله باشی.`, ...lifeMenuMarkup(player) });
        } else {
           await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "❌ امکان ارتقا وجود ندارد.", ...lifeMenuMarkup(player) });
        }
      } else if (data === "cancel_edu") {
          await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `وضعیت فعلی:\n${statsText(player)}`, ...lifeMenuMarkup(player) });
      }
      
      // --- Career ---
      else if (data === "change_career") {
          await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "💼 شغل جدیدی انتخاب کن:", ...careerMenuMarkup(player) });
      } else if (data.startsWith("career_")) {
          const newCareerKey = data.split('_')[1];
          const career = getCareer(newCareerKey);
          if (career && player.career !== newCareerKey && player.age >= career.min_age && player.age <= career.max_age) {
              const requiredEduKey = career.requires;
              let educationMet = false;
              if (!requiredEduKey) educationMet = true;
              else {
                  let tempEduKey = player.education;
                  while(tempEduKey) {
                    if (tempEduKey === requiredEduKey) { educationMet = true; break; }
                    tempEduKey = getEducation(tempEduKey)?.next;
                  }
              }

              if (educationMet) {
                  player.career = newCareerKey;
                  player.stage = `مشغول به کار (${career.name})`;
                  player.year_events.push(`\n✨ شغل جدید: ${career.name}. ${career.description}`);
                  updatePlayerStats(player); // Re-calculate stats with new career
                  await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `✅ شغل جدیدت ${career.name} است.\n\n${statsText(player)}`, ...lifeMenuMarkup(player) });
              } else {
                  await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `❌ برای این شغل به مدرک ${getEducation(requiredEduKey)?.name || 'مورد نیاز'} نیاز داری.`, ...lifeMenuMarkup(player) });
              }
          } else if (player.age < career.min_age || player.age > career.max_age) {
             await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `❌ این شغل برای سن شما مناسب نیست (باید بین ${career.min_age} تا ${career.max_age} سال باشی).`, ...lifeMenuMarkup(player) });
          } else {
              await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "❌ امکان تغییر شغل وجود ندارد.", ...lifeMenuMarkup(player) });
          }
      } else if (data === "cancel_career") {
          await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `وضعیت فعلی:\n${statsText(player)}`, ...lifeMenuMarkup(player) });
      }
      
      // --- One-time Life Actions ---
      else if (data === "act_marry") {
          if (!player.married && player.age >= 22 && player.happiness > 40 && random < 0.6) {
              player.married = true;
              player.happiness += 15;
              player.stage = "متاهل";
              player.relationships.spouse = { happiness: 50 };
              player.year_events.push("❤️ با کسی آشنا شدی و ازدواج کردید! زندگی مشترک شروع شد.");
              await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `❤️ ازدواج کردی!\n\n${statsText(player)}`, ...lifeMenuMarkup(player) });
          } else {
              await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "هنوز فرصت ازدواج مناسب نیست، پول یا خوشحالی کافی نداری، یا شانسش رو نداشتی.", ...lifeMenuMarkup(player) });
          }
      } else if (data === "act_buy_car") {
          if (!player.has_car && player.money >= 200 && player.age >= 25 && random < 0.8) {
              player.has_car = true;
              player.money -= 200;
              player.happiness += 5;
              player.year_events.push("🚗 یه ماشین خریدی! رفت و آمدت راحت‌تر شد.");
              await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `🚗 ماشین خریدی!\n\n${statsText(player)}`, ...lifeMenuMarkup(player) });
          } else {
              await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "پول، سن، یا شانس کافی برای خرید ماشین نداشتی.", ...lifeMenuMarkup(player) });
          }
      } else if (data === "act_buy_house") {
           if (!player.has_house && player.money >= 500 && player.age >= 28 && random < 0.6) {
              player.has_house = true;
              player.money -= 500;
              player.happiness += 15;
              player.year_events.push("🏡 خونه خریدی! دیگه جای امنی داری.");
              await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `🏡 خونه خریدی!\n\n${statsText(player)}`, ...lifeMenuMarkup(player) });
           } else {
               await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "پول، سن، یا شانس کافی برای خرید خانه نداشتی.", ...lifeMenuMarkup(player) });
           }
      } else if (data === "act_have_child") {
          if (player.married && player.children < 3 && player.age >= 24 && player.energy >= 40 && player.happiness >= 50 && random < 0.5) {
              player.children++;
              player.happiness += 10;
              player.energy -= 10;
              player.relationships[`child_${player.children}`] = { happiness: 50 };
              player.year_events.push(`👶 صاحب فرزند ${player.children}ام شدی!`);
              await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `👶 فرزند ${player.children} به خانواده اضافه شد!\n\n${statsText(player)}`, ...lifeMenuMarkup(player) });
          } else {
               await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: "شرایط سنی، انرژی، خوشحالی، یا شانس برای بچه‌دار شدن مناسب نبود.", ...lifeMenuMarkup(player) });
          }
      }
      
      // --- Year Progression ---
      else if (data === "next_year") {
        const gameOverMessage = processYear(player);
        
        let messageText = "";
        if (gameOverMessage) {
          messageText = gameOverMessage;
          players.delete(chatId); // Game over, clear player state
          await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `${messageText}\n\n${statsText(player)}`, ...backToMenuMarkup() });
        } else {
          if (player.year_events.length > 0) messageText += player.year_events.join("\n");
          messageText += `\n\n${statsText(player)}`;
          await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: messageText, ...lifeMenuMarkup(player) });
        }
      } else if (data === "end_game") {
        player.alive = false;
        const finalMessage = checkGameStatus(player);
        await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text: `🛑 شما بازی را زودتر از موعد به پایان رساندید.\n\n${finalMessage}\n\n${statsText(player)}`, ...backToMenuMarkup() });
        players.delete(chatId);
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
    if (update.callback_query) {
        await telegram("sendMessage", { chat_id: update.callback_query.message.chat.id, text: "خطایی در پردازش رخ داد. لطفاً دوباره امتحان کنید." });
    }
  }
});

app.get("/", (req, res) => { res.send("Life Game Bot is running!"); });

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
