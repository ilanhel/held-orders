import { describe, it, expect } from 'vitest'
import { pickRank, sortForPicking } from '@/lib/pick-order'

const item = (productName: string) => ({ productName })

describe('pickRank — warehouse route position', () => {
  it('maps products to their shelf rank along the route', () => {
    expect(pickRank('אבן בזלת גודל 10*15')).toBe(1)
    expect(pickRank('בלוק צפצפה משושה 15*15')).toBe(2)
    expect(pickRank('טוינס 15X21')).toBe(3)
    expect(pickRank('מובייל שלישייה 10X10')).toBe(4)
    expect(pickRank('בלוק הולנדי 20*30')).toBe(5)
    expect(pickRank('בלוק אורן דבק 10*10')).toBe(6)
    expect(pickRank('תמונה על רגל פרספקס 15X21')).toBe(8)
    expect(pickRank('תמונה על רגל עץ 13X18')).toBe(9)
    expect(pickRank('Bubble 15X21 3mm')).toBe(10)
    expect(pickRank('בורד מיני')).toBe(11)
    expect(pickRank('תחתיות במבוק 1 סמ עובי + מעמד תחתיות 10*10')).toBe(12)
    expect(pickRank('מעמד עטים')).toBe(14)
    expect(pickRank('קוביית סובלימציה')).toBe(15)
    expect(pickRank('פאזל לב')).toBe(16)
    expect(pickRank('מטאל 20X30')).toBe(18)
    expect(pickRank('חבילת נייר נטול עץ 170 גרם A3')).toBe(21)
    expect(pickRank('כיסים למינציה 100יח A4')).toBe(23)
    expect(pickRank('שקפים A4 100 יח')).toBe(25)
    expect(pickRank('80 גרם 500 דף A3')).toBe(27)
    expect(pickRank('מגנט 10*15')).toBe(29)
    expect(pickRank('שקיות צלופן 20X30')).toBe(30)
    expect(pickRank('גליל צלופן 70 סמ')).toBe(31)
    expect(pickRank('סרט אריזה רחב')).toBe(32)
    expect(pickRank('גליל מדבקות HELD')).toBe(33)
    expect(pickRank('כוס טרמי')).toBe(34)
    expect(pickRank('האג מאג - לבן')).toBe(35)
    expect(pickRank('פרספקס 6 ממ 20*20')).toBe(38)
    expect(pickRank('אלבום כיסים 120 10*15')).toBe(40)
    expect(pickRank('מסגרת לבנה 10X15')).toBe(40)
    expect(pickRank('שק כביסה')).toBe(44)
    expect(pickRank('תיק ספר 30*40 צבע קינמון')).toBe(45)
    expect(pickRank('סינר לבן  מבוגר סובלימציה')).toBe(46)
    expect(pickRank('סינר גדול קנבס')).toBe(47)
    expect(pickRank('בגד גוף תינוק מידות 3-6')).toBe(48)
    expect(pickRank('ספל לבן איכותי')).toBe(49)
    expect(pickRank('ספל לבן פנים וידית בצבע כחול')).toBe(50)
    expect(pickRank('ספל פלא')).toBe(51)
    expect(pickRank('חולצת סובלימציה ילדים מידה 10')).toBe(53)
    expect(pickRank('ציפה לב פרווה - צבעוני')).toBe(54)
    expect(pickRank('מילוי כרית')).toBe(55)
  })

  it('places the printer supplies after בלוק אורן', () => {
    expect(pickRank('דיו צהוב DX 100')).toBe(7)
    expect(pickRank('BLACK EPS D1000 דיו')).toBe(7)
    expect(pickRank('מיכל ספיגה DE100XD מיכל גדול')).toBe(7)
    expect(pickRank('מיכל עודפים RICOH')).toBe(7)
    expect(pickRank('קנווס פוליאסטר מט 280 גרם 61*30')).toBe(7)
    expect(pickRank('קנווס כותנה 340 61*18 VEGA')).toBe(7)
    expect(pickRank('נייר לוסטר 260 גרם 111.8*30')).toBe(7)
    expect(pickRank('נייר מבריק 235 גרם 127*65*4')).toBe(7)
    expect(pickRank('נייר סאטן 240 גרם 610*30')).toBe(7)
  })

  it('places the newly routed groups', () => {
    expect(pickRank('מנגנון לשעון')).toBe(17) // אחרי פאזל
    // חומרי סובלימציה — מתחת לבלוק מטאל
    expect(pickRank('דבק ירוק סובלימציה')).toBe(19)
    expect(pickRank('נייר סובלימציה A3')).toBe(19)
    expect(pickRank('חבילת נייר סובלימציה')).toBe(19)
    expect(pickRank('פד עכבר למחשב מלבן')).toBe(19)
    expect(pickRank('שלט לדלת אליפסה')).toBe(19)
    expect(pickRank('שעון סובלימציה לב')).toBe(19)
    expect(pickRank('ENEGIZER 2032')).toBe(20) // סוללות
    // משרדי — מתחת לנייר 170 גרם
    expect(pickRank('גליל קופה')).toBe(22)
    expect(pickRank('מדבקת דו"צ 3M')).toBe(22)
    expect(pickRank('נייר פרגמנט גודל 50*70 500 יח')).toBe(22)
    expect(pickRank('סיכות לאקדח')).toBe(22)
    expect(pickRank('מארז פרחי קישוט')).toBe(24) // אחרי למינציה
    expect(pickRank('בלוקירז קאפה שחורה 20X20 חבילה של 10')).toBe(26) // מתחת לשקפים
    expect(pickRank('טויקס 29*39')).toBe(28) // לפני מגנטים
    // סילבר/קליר/גולדי — אחרי האג מאג
    expect(pickRank('סילבר 15X21')).toBe(36)
    expect(pickRank('קליר 20X30')).toBe(36)
    expect(pickRank('גולדי מט 20X20')).toBe(36)
    // שעוני מסגרות — עם מסגרות ואלבומים
    expect(pickRank('שעון לבן עם 5 תמונות בגודל 10X15')).toBe(40)
    expect(pickRank('לוח קאפה מוקצף להדבקה 15 יח 100*70')).toBe(52) // אחרי ספל פלא
  })

  it('separates אקרילי 3 (*3 series) from generic acrylic', () => {
    expect(pickRank('בלוק אקריליק להדפסת UV 10*15*3')).toBe(39)
    expect(pickRank('בלוק אקריליק להדפסת UV 20*30*3')).toBe(39)
    expect(pickRank('בלוק אקריליק להדפסה ב-UV גודל 20X30')).toBe(38)
    expect(pickRank('בלוק אקריליק להדפסה בUV גודל 15*15')).toBe(38)
  })

  it('places packaging and end-of-list items last', () => {
    expect(pickRank('ארגז שקיות גדולות')).toBe(90)
    expect(pickRank('שקיות ניילון 20/30')).toBe(90)
    expect(pickRank('ארגז מעטפות')).toBe(90)
    expect(pickRank('מעמד קפסולות קפה 20*30')).toBe(91)
    expect(pickRank('קוביה מוארת')).toBe(91)
    expect(pickRank('ריבוע עץ בודד ממוגנט 9X9')).toBe(91)
    expect(pickRank('ברכה מעוצבת')).toBe(91)
    expect(pickRank('מחירון')).toBe(91)
    expect(pickRank('משלוח')).toBe(91)
  })

  it('specific patterns win over generic keywords', () => {
    // תחתיות פרספקס before generic תחתיות
    expect(pickRank('תחתית לספל פרספקס 9x9 ריבוע')).toBe(13)
    // מחזיק מפתחות פרספקס goes to keychains, not acrylic
    expect(pickRank('מחזיק מפתחות פרספקס לב רגיל')).toBe(37)
    // מסגרת פיוטר goes to pewter, not frames
    expect(pickRank('מסגרת פיוטר לרוחב זהב 10/15')).toBe(41)
    expect(pickRank('פיוטר עומד + שוכב 13/18')).toBe(41)
    // מסגרת אקריליק goes to acrylic, not frames
    expect(pickRank('מסגרת אקריליק מגנטית עם רגלית גודל 10*15')).toBe(38)
    expect(pickRank('מסגרת פרספקס 1015 עומד 6021015')).toBe(38)
    // ציפה לכרית goes to pillowcases, not pillows
    expect(pickRank('ציפה לכרית שינה 50X70')).toBe(43)
    expect(pickRank('כרית מלבנית')).toBe(42)
  })

  it('avoids substring traps', () => {
    // 280 גרם is not 80 גרם (it is printer canvas)
    expect(pickRank('קנווס פוליאסטר מט 280 גרם 111.8X18')).not.toBe(27)
    // אלבום מגנטי / מסגרת מגנטית / ריבוע ממוגנט are not מגנט
    expect(pickRank('אלבום מגנטי ל80 עמודים')).toBe(40)
    expect(pickRank('מסגרת מגנטית עם רגלית גודל 13*18')).toBe(40)
    expect(pickRank('ריבוע עץ בודד ממוגנט 9X9')).not.toBe(29)
    // מסגרת טוינס stays with frames, not the טוינס blocks shelf
    expect(pickRank('מסגרת טוינס אפור פס כסף 10/15')).toBe(40)
    // אלבום קנווס is an album, not printer canvas
    expect(pickRank("אלבום מגנטי קנווס 20 עמ' 430")).toBe(40)
    // אלבום פרגמנט is an album, not נייר פרגמנט
    expect(pickRank("אלבום עיצוב 36 עמ' פרגמנט")).toBe(40)
  })

  it('unmatched products rank last', () => {
    expect(pickRank('מוצר עתידי שאינו קיים')).toBe(9999)
  })
})

describe('sortForPicking', () => {
  it('sorts order lines by route rank, unmatched last, ties by name', () => {
    const sorted = sortForPicking([
      item('מחירון'),
      item('מוצר עתידי שאינו קיים'),
      item('ספל פלא'),
      item('אבן בזלת 15*15'),
      item('מסגרת לבנה 10X15'),
      item('אבן בזלת 10*15'),
      item('בלוק הולנדי 20*30'),
    ])
    expect(sorted.map((i) => i.productName)).toEqual([
      'אבן בזלת 10*15',
      'אבן בזלת 15*15',
      'בלוק הולנדי 20*30',
      'מסגרת לבנה 10X15',
      'ספל פלא',
      'מחירון',
      'מוצר עתידי שאינו קיים',
    ])
  })

  it('does not mutate the input array', () => {
    const items = [item('ספל פלא'), item('אבן בזלת 15*15')]
    const sorted = sortForPicking(items)
    expect(items[0].productName).toBe('ספל פלא')
    expect(sorted).not.toBe(items)
  })
})
