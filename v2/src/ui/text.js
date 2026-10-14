/* כל הטקסטים והאייקונים של הממשק. מקוריים לגמרי. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});

  const SKIN = '#e9c3a0';
  const hat = '<ellipse cx="16" cy="10.5" rx="10" ry="2.3" fill="#111"/><path d="M10.5 10.5 Q10.5 3.5 16 3.5 Q21.5 3.5 21.5 10.5z" fill="#111"/>';
  const face = `<circle cx="16" cy="15.5" r="4.6" fill="${SKIN}"/>`;
  const ICONS = {
    bochurim: `<svg viewBox="0 0 32 32" class="ic"><path d="M7 32 Q7 22 16 21 Q25 22 25 32z" fill="#f2f0ea"/><rect x="14.6" y="21" width="2.8" height="11" fill="#d9d5cc"/>${face}${hat}</svg>`,
    avrechim: `<svg viewBox="0 0 32 32" class="ic"><path d="M6 32 Q6 21 16 20.5 Q26 21 26 32z" fill="#17171b"/><path d="M14 21 L16 27 L18 21z" fill="#f2f0ea"/>${face}<path d="M12 17 Q16 25 20 17 Q16 19.5 12 17z" fill="#2b2118"/>${hat}</svg>`,
    askan: `<svg viewBox="0 0 32 32" class="ic"><path d="M6 32 Q6 21 16 20.5 Q26 21 26 32z" fill="#3a3d45"/><path d="M15 21 L16 28 L17 21z" fill="#a52a35"/>${face}<rect x="20" y="11" width="3.4" height="7" rx="1" fill="#0d0d0d"/>${hat}</svg>`,
    shofar: '<svg viewBox="0 0 32 32" class="ic"><path d="M4 22 Q6 26 11 24 Q20 20 25 9 Q26.5 6 28.5 6.5 Q30 7.5 28.5 10 Q23 23 11 27.5 Q5 29.5 3 25z" fill="#d9b071" stroke="#8a6532" stroke-width="1.2"/><path d="M27 4 l2 -2 M29.5 7 l2.2 -1 M24.5 3.5 l1 -2.3" stroke="#ffd36b" stroke-width="1.6" stroke-linecap="round"/></svg>',
    patrol: `<svg viewBox="0 0 32 32" class="ic"><path d="M7 32 Q7 22 16 21 Q25 22 25 32z" fill="#86a9cf"/><path d="M9 32 Q9 23 16 22.5 Q23 23 23 32z" fill="#1f2d44"/>${face}<path d="M10 10.5 Q10 5 16 5 Q22 5 22 10.5z" fill="#172238"/><rect x="9" y="10" width="14" height="2.4" rx="1" fill="#0f1726"/><rect x="14.8" y="6.5" width="2.4" height="2" fill="#e2b93b"/></svg>`,
    horses: '<svg viewBox="0 0 32 32" class="ic"><path d="M9 29 L11 18 Q8 14 10 9 L13 4 L14.5 7 Q20 6 24 11 L27 16 Q27.5 18 25.5 18.5 L21 16.5 L19 20 L20 29z" fill="#7a5233"/><path d="M13 4.5 Q9 9 10.5 14 L12.5 12 Q11 8 14 6z" fill="#3a2416"/><circle cx="19.5" cy="10.5" r="1" fill="#111"/></svg>',
    cannon: '<svg viewBox="0 0 32 32" class="ic"><rect x="2" y="15" width="18" height="10" rx="1.5" fill="#eef0f2"/><rect x="2" y="21" width="18" height="2.4" fill="#2c4f86"/><rect x="20" y="17" width="8" height="8" rx="1.5" fill="#eef0f2"/><rect x="22" y="18.5" width="5" height="3" fill="#26313d"/><circle cx="7" cy="26" r="2.4" fill="#151515"/><circle cx="24" cy="26" r="2.4" fill="#151515"/><path d="M11 15 L13 11 Q19 3 29 5" stroke="#9fd3ff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
    siren: '<svg viewBox="0 0 32 32" class="ic"><path d="M9 24 Q9 13 16 13 Q23 13 23 24z" fill="#d63a3a"/><rect x="7" y="24" width="18" height="3.5" rx="1" fill="#555"/><path d="M16 4 v4 M6 9 l3 3 M26 9 l-3 3" stroke="#ff6b5b" stroke-width="2" stroke-linecap="round"/></svg>',
    news: '<svg viewBox="0 0 32 32" class="ic"><rect x="4" y="6" width="24" height="20" rx="2" fill="#f2efe6"/><rect x="7" y="9" width="18" height="3" fill="#b8322a"/><rect x="7" y="14" width="8" height="8" fill="#9aa"/><path d="M17 15 h8 M17 18 h8 M17 21 h6" stroke="#555" stroke-width="1.4"/></svg>',
    van: '<svg viewBox="0 0 32 32" class="ic"><rect x="3" y="11" width="26" height="13" rx="2" fill="#f1f2f4"/><rect x="3" y="18" width="26" height="2.6" fill="#1f3a6e"/><rect x="5" y="13" width="15" height="4" fill="#2a3440"/><circle cx="9" cy="25" r="2.6" fill="#151515"/><circle cx="23" cy="25" r="2.6" fill="#151515"/><rect x="12" y="8.5" width="4" height="2.5" fill="#3a73d6"/><rect x="16" y="8.5" width="4" height="2.5" fill="#d63a3a"/></svg>',
    car: '<svg viewBox="0 0 32 32" class="ic"><path d="M5 20 L8 13 Q9 11 11 11 H21 Q23 11 24 13 L27 20 V25 H5z" fill="#f2efe6"/><rect x="10" y="13" width="12" height="5" rx="1" fill="#26313d"/><circle cx="10" cy="25" r="2.6" fill="#151515"/><circle cx="22" cy="25" r="2.6" fill="#151515"/></svg>',
    sun: '<svg viewBox="0 0 32 32" class="ic"><circle cx="16" cy="18" r="7" fill="#ffc35a"/><path d="M2 24 H30" stroke="#d58a3a" stroke-width="2.4"/></svg>',
    flag: '<svg viewBox="0 0 32 32" class="ic"><path d="M8 4 V29" stroke="#ddd" stroke-width="2.2"/><path d="M9 5 H25 L21 10 L25 15 H9z" fill="#4cc46c"/></svg>'
  };

  const UNITS = {
    bochurim: { name: 'בחורי ישיבה', short: '5 אנשים · מהירים', explain: 'מגיעים ראשונים לכביש ופורסים שורה ארוכה. אבל שוטר אחד גורר בחור תוך שניות, ופרשים מפזרים אותם.' },
    avrechim: { name: 'אברכים', short: '4 אנשים · יושבים חזק', explain: 'כשהם יושבים, צריך שני שוטרים לכל אחד והפרשים לא מתקרבים. המכת"זית כן מרימה אותם.' },
    askan: { name: 'עסקן', short: 'מעכב שוטרים', explain: '"יש לי אישור!" עוצר חוליית שוטרים קרובה ל-9 שניות. מי שלידו מתאושש מהר וקשה יותר לגרור.' },
    shofar: { name: 'שופר', short: 'כולם מתעוררים', explain: 'מורל מלא לכל ההפגנה, מי שברח חוזר מיד, ושוטרים קרובים קופאים לרגע. פעם בדקה וחצי.' },
    patrol: { name: 'שוטרים', short: 'גוררים לניידת', explain: 'גוררים מפגינים לניידת העצורים, אחד-אחד.' },
    horses: { name: 'פרשים', short: 'מפזרים עומדים', explain: 'שועטים לחוליה עומדת ומפזרים אותה. מול יושבים — עוצרים, וזה מגיע לחדשות.' },
    cannon: { name: 'מכת"זית', short: 'מים על כולם', explain: 'מרימה גם יושבים ומבריחה אותם. המיכל מתרוקן מהר וצריך לחזור למלא.' }
  };

  const STATE = {
    moving: 'בדרך', blocking: 'חוסמים', sitting: 'יושבים', sittingDown: 'מתיישבים', standingUp: 'קמים', fleeing: 'בורחים!',
    waiting: 'ממתינים', sidewalk: 'על המדרכה', arresting: 'עוצרים', charging: 'שועטים', regroup: 'מתארגנים',
    stalled: 'מתווכחים', drive: 'נוסעת', spray: 'מתיזה', refill: 'ממלאת מים', ret: 'חוזרת למלא', idle: 'ממתינים', away: 'בעצירה'
  };

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const LINES = {
    driver: ['אני מאחר לשיעור!', 'יש לי במכונית גלידה שנמסה!', 'רק יצאתי לקנות חלב…', 'מישהו יודע מה קורה שם?', 'עוד שעה ככה?!',
      'אני צריך להגיע לבר מצווה!', 'תפתחו כבר!', 'יש לי פגישה עם רואה החשבון!', 'הדלק נגמר לי מלעמוד!', 'אני רק רציתי לעבור…', 'שלושה ימים אני פה!'],
    dragged: ['לא זזים!', 'בעדינות, בעדינות!', 'יש לי שיעור בשבע!', 'אני רק עברתי פה!', 'אני אחזור!', 'הכובע! הכובע!'],
    released: ['חזרתי!', 'שחררו — חוזר לצומת!', 'עוד פעם אני פה!'],
    permit: ['יש לי אישור מהמשרד!', 'רגע, אני מדבר עם מישהו חשוב!', 'יש לי אישור בכתב — רק צריך למצוא אותו', 'אני בקשר עם המפקד שלך!'],
    copStall: ['רגע, אני בודק…', 'מי זה על הקו?', 'אה… טוב, חכה רגע'],
    copGrab: ['נא לפנות את הכביש', 'אדוני, זה לא מקום לשבת', 'בוא איתי, בבקשה'],
    nearMiss: ['אוי!', '!!!', 'כמעט!'],
    horses: ['סוסים!', 'זהירות, סוסים!'],
    water: ['מים קרים!', 'הכובע נרטב!'],
    shofar: ['תקיעה!'],
    sit: ['יושבים!', 'לא קמים!']
  };

  const NEWS = {
    jam: [
      [0.5, 'פקק מתחיל להיווצר ב{place}'],
      [1, 'קילומטר של פקק: נהגים מדווחים על "עמידה במקום"'],
      [2, '2 ק"מ של פקק — אפליקציות הניווט ממליצות "לא לצאת מהבית"'],
      [3, 'נהג אוטובוס תקוע: "כבר הכרתי את כל הנוסעים בשמם"'],
      [4, '4 ק"מ של פקק — שוקלים להכריז על הצומת כחניון']
    ],
    headline: [
      [25, 'ההפגנה ב{place} עולה לאתרי החדשות'],
      [50, 'ניידות שידור בדרך לצומת'],
      [75, 'המהדורה המרכזית תיפתח מהצומת'],
      [90, 'כל הערוצים בשידור חי מ{place}']
    ],
    horseScandal: 'תיעוד: פרשים מול אנשים שיושבים בשקט — הסרטון מסתובב ברשת',
    askanArrest: 'העסקן נעצר. מהניידת, בטלפון: "זו שערורייה!"',
    vanDeparted: 'ניידת עם {n} עצורים יצאה לתחנה',
    cannonEmpty: 'המכת"זית התרוקנה וחוזרת למלא מים',
    shofar: 'תקיעת שופר בצומת — ההפגנה מתעוררת',
    policeArrive: 'תגבורת משטרה מגיעה לצומת',
    start: 'צפי: הפגנה ב{place} אחר הצהריים'
  };

  const END = {
    protest: {
      headlines: { title: 'ההפגנה בכותרות!', sub: 'פקק של {km} ק"מ ב{place}. כל הערוצים שידרו בשידור חי.' },
      sunset: { title: 'השמש שקעה — הכותרות הלכו לסיפור אחר', sub: 'הגעתם ל-{H} מתוך 100 במד הכותרות. כמעט.' },
      dispersed: { title: 'ההפגנה התפזרה', sub: 'אף מפגין לא נשאר ברחוב, והצומת חזר לזרום.' }
    }
  };

  function fmt(s, vars) { return s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined) ? vars[k] : m); }

  HM.ICONS = ICONS;
  HM.TXT = { UNITS, STATE, LINES, NEWS, END, pick, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
