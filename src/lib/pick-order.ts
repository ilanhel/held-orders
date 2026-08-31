/**
 * Physical warehouse picking order.
 *
 * The warehouse shelves are arranged in a fixed walking route; sorting order
 * lines by this route saves significant picking time. Each rule maps a
 * product-name pattern to its position (rank) along the route.
 *
 * Rules are evaluated top-to-bottom and the FIRST match wins, so specific
 * patterns (e.g. "תחתיות פרספקס") must appear before generic ones ("תחתיות").
 * The `rank` is the position in the warehouse route — NOT the evaluation
 * order. Products that match no rule sort last, alphabetically.
 */
interface PickOrderRule {
  pattern: RegExp
  rank: number
}

// Warehouse route (rank): 1 בזלת, 2 צפצפה, 3 טווינס, 4 מובייל, 5 בלוק הולנדי,
// 6 בלוק אורן, 7 פרינטרים (דיו/מיכלים/קנווס/נייר צילום), 8 רגל פרספקס,
// 9 רגל עץ, 10 באבל, 11 מיני בורד, 12 תחתיות סובלימציה, 13 תחתיות פרספקס,
// 14 מעמד עטים, 15 קוביית סובלימציה, 16 פאזלים, 17 מנגנון לשעון,
// 18 בלוק מטאל, 19 חומרי סובלימציה (דבק/נייר/פד עכבר/שלטים/שעונים),
// 20 סוללות, 21 נייר 170 גרם, 22 משרדי (גליל קופה/מדבקת דו"צ/פרגמנט/סיכות),
// 23 למינציה, 24 פרחי קישוט, 25 שקפים, 26 קאפה שחורה, 27 80 גרם A3,
// 28 טויקס, 29 מגנטים, 30 צלופן, 31 גליל צלופן, 32 סרט אריזה,
// 33 מדבקות הלד, 34 ספל טרמי, 35 האג מאג, 36 סילבר/קליר/גולדי,
// 37 מחזיקי מפתחות, 38 אקרילי, 39 אקרילי 3, 40 מסגרות ואלבומים (+שעון לבן),
// 41 פיוטרים, 42 כריות, 43 ציפות, 44 סל כביסה, 45 תיק ספר, 46 סינר לבן,
// 47 סינר קנבס, 48 בגדי גוף, 49 ספל לבן, 50 ספל צבעוני, 51 ספל פלא,
// 52 לוח קאפה מוקצף, 53 חולצות, 54 כריות פרווה, 55 מילוי כרית,
// 90 אריזות (שקיות/מעטפות), 91 סוף הרשימה (קפסולות/קוביה מוארת/ממוגנט/
// ברכה מעוצבת/מחירון/משלוח).
const RULES: PickOrderRule[] = [
  // --- Specific patterns first (must win over generic keywords below) ---
  { pattern: /תחתי.*פרספקס|פרספקס.*תחתי/, rank: 13 },
  { pattern: /גליל צלופן/, rank: 31 },
  { pattern: /סרט אריזה/, rank: 32 },
  { pattern: /מדבקות HELD/i, rank: 33 },
  { pattern: /טרמי/, rank: 34 }, // ספל/כוס טרמי
  { pattern: /האג מאג/, rank: 35 },
  { pattern: /מחזיק מפתחות/, rank: 37 }, // incl. מחזיק מפתחות פרספקס
  { pattern: /ספל פלא/, rank: 51 },
  { pattern: /פנים וידית בצבע/, rank: 50 }, // ספל צבעוני
  { pattern: /ספל לבן/, rank: 49 },
  { pattern: /פרווה/, rank: 54 }, // כריות/ציפות פרווה
  { pattern: /מילוי כרית/, rank: 55 },
  { pattern: /ציפה|ציפות/, rank: 43 }, // before generic כרית
  { pattern: /כרית/, rank: 42 },
  { pattern: /סינר.*קנבס|קנבס.*סינר/, rank: 47 },
  { pattern: /סינר/, rank: 46 },
  { pattern: /בגד גוף|בגדי גוף/, rank: 48 },
  { pattern: /חולצ/, rank: 53 },
  // פרינטרים: דיו, מיכלי ספיגה/עודפים, קנווס, ניירות צילום (לוסטר/מבריק/סאטן)
  { pattern: /(^|\s)דיו(\s|$)/, rank: 7 },
  { pattern: /מיכל (ספיגה|עודפים)/, rank: 7 },
  { pattern: /קנווס (כותנה|פוליאסטר)/, rank: 7 },
  { pattern: /נייר (לוסטר|מבריק|סאטן)/, rank: 7 },
  { pattern: /מנגנון/, rank: 17 }, // מנגנון לשעון — before שעון rules
  // חומרי סובלימציה — אחרי בלוק מטאל
  { pattern: /נייר סובלימציה|דבק ירוק|פד עכבר|שלט|שעון סובלימציה/, rank: 19 },
  { pattern: /סולל|ENEGIZER|ENERGIZER/i, rank: 20 },
  // משרדי — מתחת לנייר 170 גרם
  { pattern: /גליל קופה|מדבקת דו|נייר פרגמנט|סיכות/, rank: 22 },
  { pattern: /פרחי קישוט/, rank: 24 },
  { pattern: /בלוקירז|קאפה שחורה/, rank: 26 },
  { pattern: /טויקס/, rank: 28 }, // לפני מגנטים
  { pattern: /סילבר|קליר|גולדי/, rank: 36 }, // אחרי האג מאג
  { pattern: /שעון לבן/, rank: 40 }, // שעוני מסגרות — עם מסגרות ואלבומים
  { pattern: /קאפה מוקצף/, rank: 52 }, // אחרי ספל פלא
  // סוף הרשימה
  { pattern: /ארגז שקיות|שקיות ניילון|ארגז מעטפות/, rank: 90 }, // אריזות
  { pattern: /קפסולות|קוביה מוארת|ממוגנט|ברכה מעוצבת|מחירון|משלוח/, rank: 91 },

  // --- Route order ---
  { pattern: /בזלת/, rank: 1 },
  { pattern: /מטאל/, rank: 18 }, // before צפצפה (מטאל צפצפה)
  { pattern: /צפצפה/, rank: 2 },
  { pattern: /טווינס|^טוינס/, rank: 3 }, // מסגרת טוינס stays with frames
  { pattern: /מובייל/, rank: 4 },
  { pattern: /הולנדי/, rank: 5 },
  { pattern: /בלוק אורן/, rank: 6 },
  { pattern: /רגלי? פרספקס/, rank: 8 },
  { pattern: /רגלי? עץ/, rank: 9 },
  { pattern: /באבל|bubble/i, rank: 10 },
  { pattern: /מיני בורד|בורד מיני/, rank: 11 },
  { pattern: /תחתי/, rank: 12 },
  { pattern: /מעמד עטים/, rank: 14 },
  { pattern: /קוביית/, rank: 15 },
  { pattern: /פאזל/, rank: 16 },
  { pattern: /170 גרם/, rank: 21 },
  { pattern: /למינציה/, rank: 23 },
  { pattern: /שקפים/, rank: 25 },
  { pattern: /(^|[^\d])80 גרם/, rank: 27 }, // not 280 גרם
  { pattern: /^מגנט\s/, rank: 29 }, // not מגנטי/ממוגנט
  { pattern: /צלופן/, rank: 30 },
  { pattern: /פיוטר/, rank: 41 }, // before מסגרת (מסגרת פיוטר)
  { pattern: /אקריל.*\*3(?!\d)/, rank: 39 }, // אקרילי 3 (סדרת *3)
  { pattern: /אקריל|פרספקס/, rank: 38 },
  { pattern: /מסגרת|אלבום/, rank: 40 },
  { pattern: /כביסה/, rank: 44 }, // סל/שק כביסה
  { pattern: /תיק/, rank: 45 },
]

const UNMATCHED_RANK = 9999

/** Position of a product along the warehouse picking route. */
export function pickRank(productName: string): number {
  for (const rule of RULES) {
    if (rule.pattern.test(productName)) return rule.rank
  }
  return UNMATCHED_RANK
}

/**
 * Sort order lines by the warehouse picking route; unmatched products go
 * last. Ties (same shelf) sort by name. Returns a new array.
 */
export function sortForPicking<T extends { productName: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const diff = pickRank(a.productName) - pickRank(b.productName)
    if (diff !== 0) return diff
    return a.productName.localeCompare(b.productName, 'he', { numeric: true })
  })
}
