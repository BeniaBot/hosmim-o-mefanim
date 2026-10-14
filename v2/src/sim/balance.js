/* כל מספרי האיזון במקום אחד. שינוי כאן לא דורש לגעת בלוגיקה. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});

  HM.BAL = {
    dt: 1 / 30,               // צעד סימולציה קבוע

    // ----- מד הכותרות -----
    headline: {
      perKmSec: 0.19,         // כמה נקודות לשנייה לכל ק"מ פקק
      deadzoneKm: 0.08,       // פקק "רגיל" של רמזור לא נחשב
      decay: 0.35,            // ירידה לשנייה כשאין פקק
      maxRate: 2.0,            // תקרה לשנייה (שלא ייגמר בפתאומיות)
      horseOnSitters: 5,      // שערורייה: פרשים מול יושבים
      askanArrest: 2,         // עצרו את העסקן
      tramBlocked: 0.1,       // תוספת לשנייה כשרכבת קלה תקועה
      mapMul: { barilan: 1, kvish4: 0.78, gesher: 0.55 },  // כיוונון לכל מפה (מול שחקן-המחשב)
      lostSquadPenalty: 0     // (שמור לעתיד)
    },

    // ----- כסף -----
    money: {
      protest: { start: 320, perSec: 3.6, perHeadline: 0.035 },
      police:  { start: 250, perSec: 3.4, perHeadline: 0.08 }
    },

    // ----- תנועה -----
    traffic: {
      laneW: 3.5,
      carGapSpawn: 7,         // מרווח מינימלי בנקודת הכניסה
      idm: { a: 2.2, b: 3.5, s0: 2.2, T: 1.3, emergency: 9 },
      rerouteBlocked: 0.0035, // נהגים שמוותרים ומחפשים דרך עוקפת (לשנייה, כשהנתיב חסום)
      rerouteFree: 0.015,     // כשהתנועה זורמת — הפקק המדומה מתפרק מהר יותר
      jamCarLen: 7.5,         // מטרים לכל רכב בפקק
      jamStopT: 2.5,          // רכב שעומד יותר מזה — נספר בפקק
      nearMissDecel: 7.5,     // בלימה חזקה מזה מול אדם = "כמעט"
      lights: [               // מחזור רמזור: איזה ציר ירוק ולכמה זמן
        { g: 'x', t: 24 }, { g: 'xy', t: 3 }, { g: null, t: 2 },
        { g: 'z', t: 14 }, { g: 'zy', t: 3 }, { g: null, t: 2 }
      ],
      types: [
        { id: 'sedan', len: 4.6, w: 1.85, p: 0.42 },
        { id: 'hatch', len: 3.9, w: 1.75, p: 0.24 },
        { id: 'van',   len: 5.2, w: 2.0,  p: 0.14 },
        { id: 'taxi',  len: 4.7, w: 1.85, p: 0.10 },
        { id: 'bus',   len: 12,  w: 2.55, p: 0.10, accel: 1.2 }
      ]
    },

    // ----- אנשים -----
    people: {
      radius: 0.32,
      sepDist: 0.75,
      lineSpacing: 1.6,
      sitTime: 1.4,           // זמן להתיישב / לקום
      fleeTime: 3.6,
      fleeDist: 15,
      fleeSpeedMul: 1.5
    },

    // ----- יחידות המפגינים -----
    protest: {
      bochurim: { name: 'בחורי ישיבה', members: 5, speed: 3.3, cost: 110,
                  grab: { stand: 2.6, sit: 5.5 }, copsSit: 1, morale: 85 },
      avrechim: { name: 'אברכים', members: 4, speed: 2.25, cost: 150,
                  grab: { stand: 3.4, sit: 8.5 }, copsSit: 2, morale: 95 },
      askan:    { name: 'עסקן', members: 1, speed: 2.7, cost: 220, max: 2,
                  grab: { stand: 4.0, sit: 4.0 }, copsSit: 1, morale: 100 },
      permit:   { cooldown: 28, range: 10, stall: 9 },
      aura:     { range: 9, morale: 2.0, grabMul: 1.35 },
      shofar:   { cooldown: 90, firstAt: 40, morale: 45, stun: 3, stunRange: 14 },
      morale: {
        regen: 0.6, dragged: 7, horses: 32, water: 34, nearMiss: 8, askanArrested: 12,
        lowWarn: 25
      }
    },

    // ----- יחידות המשטרה -----
    police: {
      patrol:  { name: 'שוטרים', members: 4, speed: 3.1, cost: 230, dragSpeed: 1.25, max: 5 },
      horses:  { name: 'פרשים', members: 3, speed: 6.5, cost: 330, max: 1,
                 scatterR: 6.5, cooldown: 7, sitStop: 3.6 },
      cannon:  { name: 'מכת"זית', cost: 560, max: 1, speed: 5, range: 17, halfAngle: 0.38,
                 tank: 18, refill: 12, wetToFlee: 1.1 },
      van:     { cap: 10, release: 45, away: 50 },
      arrivalDelay: 7,        // מרגע ההזמנה עד שהכוח יוצא מהבסיס
      autoEngage: 12,         // שוטרים במנוחה עוצרים מפגינים על הכביש בטווח הזה
      megaphone: { cooldown: 40, firstAt: 20, range: 16, morale: 22, fleeBelow: 40 },
      humanStart: ['patrol', 'patrol'] // הכוח הפותח כשהשחקן משטרה
    },

    // ----- סיום -----
    end: {
      emptyStreetT: 30,       // אין אף מפגין ברחוב כל הזמן הזה = ההפגנה התפזרה
      starsProtest: [180, 90],// זמן שנותר עד השקיעה ל-3 / 2 כוכבים
      starsPolice: [50, 75]   // שיא המד ל-3 / 2 כוכבים
    },

    // ----- המפגינים הממוחשבים (בדיקות, ובהמשך יריב) -----
    protestAI: {
      // turnout = כמה חוליות ההפגנה יכולה להזמין בסך הכול (מעבר לפותחות)
      // wave = כמה חוליות יוצאות יחד בגל
      normal: { think: 0.7, incomeMul: 0.75, turnout: 16, wave: 2, react: 0.75 },
      easy:   { think: 1.3, incomeMul: 0.45, turnout: 10, wave: 2, react: 0.4 },
      hard:   { think: 0.5, incomeMul: 0.9, turnout: 22, wave: 2, react: 0.95 },
      bot:    { think: 0.8, incomeMul: 1.0, turnout: 999, wave: 1, react: 1.0 }   // שחקן-בדיקה
    },

    // ----- המשטרה הממוחשבת (כשהשחקן מפגין) -----
    policeAI: {
      normal: { think: 0.5, patrolAt: 40, horsesAt: 85, cannonAt: 150, incomeMul: 1.3, maxPatrols: 4 },
      easy:   { think: 1.2, patrolAt: 60, horsesAt: 180, cannonAt: 300, incomeMul: 0.7, maxPatrols: 2 },
      // שחקן-משטרה ממוחשב בלי מגבלות זמן — משמש לכיוונון מצב המשטרה
      human:  { think: 0.6, patrolAt: 0, horsesAt: 0, cannonAt: 0, incomeMul: 1.0, maxPatrols: 5 },
      hard:   { think: 0.35, patrolAt: 28, horsesAt: 60, cannonAt: 110, incomeMul: 2.0, maxPatrols: 5 }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
