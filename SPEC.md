# SPEC.md — איפיון מדויק: מערכת הזמנות זכיינים–מחסן HELD

> מסמך זה הוא המקור המחייב. הקשר כללי וכללי עבודה — ב-`CLAUDE.md`.
> גרסה 1.0 · יוני 2026

---

## §1. תיאור כללי

מערכת ווב (PWA) להזמנת סחורה מזכייני HELD אל המחסן המרכזי.
שני ממשקים: **זכיין** (מובייל-first) ו**מחסן** (דסקטופ-first), על אותו backend.
התראות אוטומטיות בוואטסאפ. ייצוא Excel. ללא חיוב/תשלום. ללא חיבור ERP בשלב זה.

---

## §2. תפקידים והרשאות

| תפקיד (Role) | ערך enum | יכולות |
|---|---|---|
| זכיין | `FRANCHISEE` | צפייה בקטלוג ומחירים, יצירת/שליחת הזמנה, צפייה בהזמנות של הסניף שלו בלבד, שכפול הזמנה |
| מחסנאי | `WAREHOUSE` | צפייה בכל ההזמנות, שינוי סטטוס, עדכון חוסרים, הדפסת/ייצוא רשימות ליקוט |
| מנהל | `ADMIN` | כל יכולות המחסנאי + ניהול קטלוג, מחירים, הודעות, משתמשים, ייצוא דוחות |

חוקי גישה:
- `FRANCHISEE` לא רואה לעולם הזמנות של סניף אחר → בדיקה בשכבת ה-service, לא רק ב-UI.
- כל endpoint דורש session למעט `POST /api/auth/otp/*`.

---

## §3. מודל נתונים (Prisma)

```prisma
model Store {
  id        String   @id @default(cuid())
  name      String                    // "HELD עזריאלי ת"א"
  code      String   @unique          // "AZR-TLV"
  phone     String                    // וואטסאפ של הסניף
  active    Boolean  @default(true)
  users     User[]
  orders    Order[]
}

model User {
  id        String   @id @default(cuid())
  name      String
  phone     String   @unique          // מזהה כניסה (OTP)
  role      Role                      // FRANCHISEE | WAREHOUSE | ADMIN
  storeId   String?                   // חובה אם FRANCHISEE
  store     Store?   @relation(...)
  active    Boolean  @default(true)
}

model Category {
  id        String    @id @default(cuid())
  name      String    @unique         // "בלוקים מעץ"
  sortOrder Int                       // סדר תצוגה בקטלוג ובליקוט
  products  Product[]
}

model Product {
  id          String   @id @default(cuid())
  name        String                  // "בלוק עץ 20x20"
  barcode     String   @unique
  categoryId  String
  category    Category @relation(...)
  priceAgorot Int                     // 12900 = 129.00 ₪
  imagePath   String?                 // null = תמונת placeholder
  status      ProductStatus @default(ACTIVE)  // ACTIVE | OUT_OF_STOCK | HIDDEN
  createdAt   DateTime @default(now())
  priceHistory PriceChange[]
}

model PriceChange {
  id          String   @id @default(cuid())
  productId   String
  oldAgorot   Int
  newAgorot   Int
  changedById String
  createdAt   DateTime @default(now())
}

model Order {
  id          String   @id @default(cuid())
  number      Int      @unique @default(autoincrement())  // מספר הזמנה קריא
  storeId     String
  createdById String
  status      OrderStatus @default(DRAFT)
  // DRAFT | SUBMITTED | RECEIVED | PICKING | READY | SHIPPED | CANCELLED
  submittedAt DateTime?
  items       OrderItem[]
  history     OrderStatusHistory[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model OrderItem {
  id             String  @id @default(cuid())
  orderId        String
  productId      String
  qtyOrdered     Int                   // מה הזכיין ביקש
  qtySupplied    Int?                  // מה סופק בפועל (null עד הליקוט)
  priceAgorot    Int                   // נעילת מחיר ברגע השליחה
  productName    String                // snapshot — שם בזמן ההזמנה
  productBarcode String                // snapshot
  picked         Boolean @default(false)
  @@unique([orderId, productId])
}

model OrderStatusHistory {
  id        String      @id @default(cuid())
  orderId   String
  from      OrderStatus
  to        OrderStatus
  byUserId  String
  createdAt DateTime    @default(now())
}

model Announcement {
  id          String   @id @default(cuid())
  title       String
  body        String
  requiresAck Boolean  @default(false)
  expiresAt   DateTime?
  createdAt   DateTime @default(now())
  acks        AnnouncementAck[]      // userId + timestamp
}

model NotificationLog {
  id        String   @id @default(cuid())
  event     String                    // "ORDER_SUBMITTED", "SHORTAGE", ...
  channel   String                    // "whatsapp" | "console" | "mock"
  toPhone   String
  payload   Json
  success   Boolean
  createdAt DateTime @default(now())
}
```

כללים מחייבים:
- **נעילת מחיר**: ברגע מעבר `DRAFT → SUBMITTED` נכתבים ל-`OrderItem` המחיר, השם והברקוד הנוכחיים (snapshot). שינוי מחיר/שם עתידי לא משנה הזמנות קיימות.
- **טיוטה אחת פעילה**: לכל חנות מותרת `DRAFT` אחת לכל היותר. כניסה חוזרת פותחת את הטיוטה הקיימת.
- **soft delete בלבד**: מוצר לא נמחק — עובר ל-`HIDDEN`. הזמנות לא נמחקות לעולם.

---

## §4. מכונת מצבים — הזמנה

```
DRAFT → SUBMITTED → RECEIVED → PICKING → READY → SHIPPED
  └→ (זכיין מוחק טיוטה: מחיקה פיזית של DRAFT בלבד)
SUBMITTED/RECEIVED → CANCELLED  (מחסן בלבד, בצירוף סיבה)
```

| מעבר | מי מורשה | תופעת לוואי (התראה) |
|---|---|---|
| DRAFT → SUBMITTED | זכיין | וואטסאפ לזכיין (סיכום) + למחסן (הזמנה חדשה) |
| SUBMITTED → RECEIVED | מחסן | — |
| RECEIVED → PICKING | מחסן | — |
| עדכון `qtySupplied < qtyOrdered` | מחסן | וואטסאפ לזכיין: פירוט חוסרים |
| PICKING → READY | מחסן | — |
| READY → SHIPPED | מחסן | וואטסאפ לזכיין: ההזמנה בדרך + פירוט סופי |
| → CANCELLED | מחסן | וואטסאפ לזכיין + סיבה |

מעבר לא חוקי (למשל `SHIPPED → PICKING`) → שגיאה 409. חובה לאכוף ב-service.

---

## §5. API

כל ה-routes תחת `/api`. קלט נבדק עם zod. שגיאות: `{ error: { code, message } }`.

### Auth
| Method | Path | תיאור |
|---|---|---|
| POST | `/auth/otp/request` | `{ phone }` → שולח קוד 6 ספרות (תוקף 5 דק', מקס' 3 בקשות ל-10 דק') |
| POST | `/auth/otp/verify` | `{ phone, code }` → session cookie. 5 כשלונות → נעילה 15 דק' |
| POST | `/auth/logout` | מחיקת session |

### קטלוג (זכיין + מחסן)
| Method | Path | תיאור |
|---|---|---|
| GET | `/catalog` | קטגוריות + מוצרים `ACTIVE`/`OUT_OF_STOCK` (ללא `HIDDEN`), ממוין לפי `sortOrder` |
| GET | `/catalog/search?q=` | חיפוש בשם + ברקוד, תוצאות תוך כדי הקלדה |
| GET | `/catalog/barcode/:barcode` | מוצר לפי ברקוד מדויק (לסריקה) |

### הזמנות — זכיין
| Method | Path | תיאור |
|---|---|---|
| GET | `/orders/draft` | הטיוטה הפעילה של החנות (יוצר אם אין) |
| PUT | `/orders/draft/items` | `{ productId, qty }` — qty=0 מסיר. **שמירה אוטומטית: כל קריאה מעדכנת מיד** |
| POST | `/orders/draft/submit` | טיוטה → SUBMITTED. דוחה טיוטה ריקה (400) |
| POST | `/orders/:id/duplicate` | משכפל הזמנה ישנה לטיוטה חדשה (במחירים עדכניים, מדלג על HIDDEN) |
| GET | `/orders?store=me` | היסטוריית הזמנות החנות + סטטוסים |

### הזמנות — מחסן
| Method | Path | תיאור |
|---|---|---|
| GET | `/orders?status=&from=&to=` | כל ההזמנות, מסוננות |
| GET | `/orders/:id` | פירוט מלא, פריטים מקובצים לפי קטגוריה לפי `sortOrder` |
| POST | `/orders/:id/status` | `{ to, reason? }` — אכיפת מכונת המצבים |
| PUT | `/orders/:id/items/:itemId` | `{ qtySupplied, picked }` |
| POST | `/orders/:id/notify-shortages` | שולח לזכיין ריכוז חוסרים (פעם אחת לכל סבב עדכון) |
| GET | `/orders/picking-list?ids=1,2,3` | רשימת ליקוט מרוכזת: סכימת כמויות לכל מוצר על פני כמה הזמנות |

### ניהול קטלוג — ADMIN
| Method | Path | תיאור |
|---|---|---|
| POST | `/products` | יצירת מוצר. ברקוד כפול → 409 |
| PUT | `/products/:id` | עדכון שם/קטגוריה/סטטוס |
| PUT | `/products/:id/price` | `{ newAgorot }` → רושם `PriceChange`. מוצר חדש (נוצר ב-24 שעות) לא שולח התראת מחיר |
| POST | `/products/:id/image` | העלאת תמונה (jpeg/png/webp, עד 10MB) → resize ל-1200px + thumbnail 400px |
| POST | `/products/import` | קובץ Excel: שורות `name,barcode,category,price`. דו"ח: נוספו/עודכנו/שגויות |
| PUT | `/products/bulk-price` | `{ categoryId?, percentChange }` — עדכון גורף |
| POST | `/announcements` | הודעת מטה → באנר + וואטסאפ לכל הזכיינים הפעילים |

### ייצוא
| Method | Path | תיאור |
|---|---|---|
| GET | `/export/order/:id.xlsx` | פורמט §8 |
| GET | `/export/orders.xlsx?from=&to=&groupBy=store\|product` | ריכוז תקופתי |
| GET | `/export/catalog.xlsx` | קטלוג מלא |

### Phase B בלבד (להגדיר interface, לא לממש)
| Method | Path | תיאור |
|---|---|---|
| POST | `/recognize` | תמונה → `{ matches: [{productId, confidence}] }` עד 3 תוצאות |

---

## §6. מסכי זכיין

### 6.1 כניסה
- שדה טלפון → "שלח לי קוד" → שדה קוד → בפנים. Session נשמר 90 יום.
- אין שום שדה אחר. החנות נגזרת מהמשתמש.

### 6.2 קטלוג (המסך הראשי)
- **באנר הודעות מטה** בראש המסך (אם יש הודעה בתוקף): רקע בולט, כפתור "הבנתי" אם `requiresAck`.
- **סרגל קטגוריות דביק** (sticky) — גלילה אופקית במובייל.
- **קיצורי מקלדת/הקלדה**: הקלדת אות בודדת מחוץ לשדה חיפוש מקפיצה לקטגוריה הראשונה שמתחילה באות. שדה חיפוש מסנן live (debounce 200ms) בשם וברקוד.
- **כרטיס מוצר**: תמונה (גדולה, lazy-load), שם בפונט גדול, ברקוד, מחיר, stepper ‎+/−‎ + שדה כמות. שינוי כמות = עדכון טיוטה מיידי בשרת + חיווי "נשמר ✓".
- **מוצר OUT_OF_STOCK**: מוצג באפור, תווית "חסר זמנית", ה-stepper מנוטרל.
- **"ההזמנה הקבועה שלי"**: כפתור בראש המסך — משכפל את ההזמנה האחרונה שנשלחה לטיוטה.
- **סל צף**: מונה פריטים + סכום, נצמד לתחתית במובייל.

### 6.3 סיכום ושליחה
- רשימה לפי קטגוריות: thumbnail, שם, ברקוד, כמות (ניתנת לעריכה), מחיר, סה"כ שורה. שורת סה"כ הזמנה.
- כפתור "שלח הזמנה" → מסך הצלחה עם מספר הזמנה + "סיכום נשלח אליך בוואטסאפ".

### 6.4 ההזמנות שלי
- רשימת הזמנות עם סטטוס בעברית וצבע: נשלחה / התקבלה / בליקוט / מוכנה / בדרך אליך / בוטלה.
- פתיחת הזמנה: פירוט מלא + חוסרים מודגשים (qtySupplied < qtyOrdered באדום).
- כפתור "הזמן שוב" על כל הזמנה.

### 6.5 התנהגות offline
- כל שינוי כמות נשלח מיד; אם הבקשה נכשלת — retry אוטומטי (עד 5 ניסיונות, backoff), חיווי "ממתין לחיבור...".
- רענון דף תמיד טוען את הטיוטה מהשרת. אין אובדן עבודה.

## §7. מסכי מחסן

### 7.1 הזמנות נכנסות (דף הבית)
- טבלה: מס' הזמנה, סניף, תאריך, מס' פריטים, סטטוס. ברירת מחדל: פתוחות בלבד. ספירת "חדשות" בולטות.

### 7.2 מסך הזמנה / ליקוט
- פריטים מקובצים לפי קטגוריה (לפי `sortOrder` — סדר הליכה במחסן). לכל פריט: שם, ברקוד, כמות, checkbox "לוקט", שדה "סופק בפועל".
- כפתורים: "קבל הזמנה", "התחל ליקוט", "שלח עדכון חוסרים" (פעיל רק אם יש פריט עם qtySupplied < qtyOrdered), "מוכנה למשלוח", "נשלחה".
- "הדפס רשימת ליקוט" / הורדת PDF / Excel.

### 7.3 ליקוט מרוכז
- בחירת כמה הזמנות → רשימה אחת: מוצר, ברקוד, סה"כ כמות, פירוק לפי סניף.

### 7.4 ניהול קטלוג
- טבלת מוצרים עם חיפוש וסינון לפי קטגוריה/סטטוס. עריכה inline של מחיר.
- טופס מוצר חדש + העלאת תמונה (גרירה או צילום). שמירת מוצר חדש פעיל → התראת "מוצר חדש" לכל הזכיינים.
- כפתורי סטטוס מהירים: "סמן חסר" / "החזר למלאי" / "הסתר".
- ייבוא Excel + מסך תוצאות (נוספו / עודכנו / שורות שגויות עם סיבה).

### 7.5 הודעות מטה
- יצירת הודעה: כותרת, תוכן, תאריך תפוגה, "דורשת אישור קריאה". טבלת "מי אישר".

---

## §8. פורמט ייצוא Excel (הזמנה בודדת)

גיליון "הזמנה", RTL, שורת כותרת מודגשת:

| עמודה | מקור |
|---|---|
| ברקוד | `productBarcode` (snapshot) |
| שם מוצר | `productName` (snapshot) |
| קטגוריה | category.name |
| כמות שהוזמנה | qtyOrdered |
| כמות שסופקה | qtySupplied (ריק אם טרם לוקט) |
| מחיר יחידה (₪) | priceAgorot / 100 |
| סה"כ שורה (₪) | qtySupplied? ?? qtyOrdered × מחיר |

מתחת: שורת סה"כ. כותרת עליונה: מס' הזמנה, סניף, תאריך שליחה, סטטוס.
מבנה העמודות מוגדר ב-`src/services/exports/formats.ts` — **מקום אחד** לשינוי עתידי מול הנה"ח.

---

## §9. התראות (NotificationService)

```ts
interface NotificationService {
  send(event: NotificationEvent, to: string, data: Record<string, unknown>): Promise<void>;
}
// דרייברים: WhatsAppDriver (prod) | ConsoleDriver (dev) | MockDriver (tests)
```

| Event | נמען | תבנית (עברית) |
|---|---|---|
| `ORDER_SUBMITTED_FRANCHISEE` | זכיין | "הזמנה #{n} נקלטה ✓ {כמות} פריטים, סה"כ {סכום} ₪" + פירוט |
| `ORDER_SUBMITTED_WAREHOUSE` | מחסן | "הזמנה חדשה #{n} מ{סניף} — {כמות} פריטים" |
| `ORDER_SHORTAGES` | זכיין | "עדכון להזמנה #{n}: הפריטים הבאים חסרים/חלקיים: ..." |
| `ORDER_SHIPPED` | זכיין | "הזמנה #{n} בדרך אליך 🚚" + פירוט סופי |
| `ORDER_CANCELLED` | זכיין | "הזמנה #{n} בוטלה. סיבה: {reason}" |
| `NEW_PRODUCT` | כל הזכיינים | "חדש בקטלוג ✨ {שם} — {מחיר} ₪" + תמונה |
| `ANNOUNCEMENT` | כל הזכיינים | כותרת + תוכן |

כללים: כל שליחה נרשמת ב-`NotificationLog`. כישלון שליחה לא מפיל את הפעולה העסקית (fire-and-forget + לוג). אין שליחה כפולה של אותו event לאותה הזמנה.

---

## §10. דרישות לא-פונקציונליות

| תחום | דרישה מדידה |
|---|---|
| RTL | `<html dir="rtl" lang="he">`; כל הרכיבים נבדקים ב-RTL |
| ביצועים | קטלוג של 300 מוצרים: FCP < 2s ב-4G; תמונות lazy + thumbnails |
| עמידות רשת | ניתוק באמצע עריכת טיוטה ורענון — אפס אובדן פריטים שנשמרו |
| אבטחה | rate-limit על OTP; הזכיין לא ניגש לנתוני חנות אחרת (נאכף בבדיקות) |
| נגישות | מגע מינימלי 44px; ניגודיות AA; עובד עד זום 200% |
| דפדפנים | Chrome/Safari אחרונים, מובייל + דסקטופ |

---

## §11. תוכנית בדיקות (מחייבת)

### 11.1 Unit (Vitest) — `tests/unit/`

**OrderService**
- [ ] יצירת טיוטה כשאין קיימת; קבלת אותה טיוטה בקריאה חוזרת (אין כפולות).
- [ ] עדכון פריט: qty חדש, qty=0 מסיר, qty שלילי → שגיאה.
- [ ] submit: נועל מחיר/שם/ברקוד כ-snapshot; טיוטה ריקה → שגיאה; טיוטה של חנות אחרת → שגיאה.
- [ ] שינוי מחיר מוצר אחרי submit לא משנה את ההזמנה.
- [ ] duplicate: יוצר טיוטה במחירים עדכניים; מדלג על מוצרי HIDDEN; ממזג לטיוטה קיימת אם יש.
- [ ] מכונת מצבים: כל המעברים החוקיים עוברים; כל מעבר לא חוקי → 409; FRANCHISEE לא יכול לשנות סטטוס מחסן.
- [ ] כל מעבר סטטוס יוצר רשומת OrderStatusHistory.

**CatalogService**
- [ ] search מוצא לפי תחילת שם, חלק משם, וברקוד מלא.
- [ ] catalog לא מחזיר HIDDEN; מחזיר OUT_OF_STOCK עם דגל.
- [ ] ברקוד כפול ביצירה → שגיאה ייעודית.
- [ ] bulk-price: +10% מעגל לאגורה; רושם PriceChange לכל מוצר.
- [ ] ייבוא Excel: שורה תקינה נוספת; ברקוד קיים מעדכן; שורה בלי שם/מחיר נדחית עם סיבה; הדו"ח מסכם נכון.

**NotificationService (MockDriver)**
- [ ] submit מפעיל בדיוק 2 התראות (זכיין + מחסן) עם הנתונים הנכונים.
- [ ] notify-shortages שולח רק פריטים חסרים; קריאה שנייה ללא שינוי — לא שולחת שוב.
- [ ] מוצר חדש ACTIVE → התראה לכל זכיין פעיל בלבד (לא ללא-פעילים).
- [ ] כישלון דרייבר לא זורק שגיאה לפעולה העסקית; נרשם NotificationLog עם success=false.

**ExportService**
- [ ] Excel הזמנה: כל העמודות לפי §8, נתוני snapshot (לא מחיר עדכני), שורת סה"כ נכונה.
- [ ] סה"כ שורה משתמש ב-qtySupplied אם קיים, אחרת qtyOrdered.

### 11.2 Integration (Vitest + supertest) — `tests/integration/`

**Auth**
- [ ] OTP נכון → session; קוד שגוי → 401; קוד פג תוקף (>5 דק') → 401.
- [ ] 5 verify כושלים → נעילה 15 דק' (429).
- [ ] 4 בקשות OTP ב-10 דק' → 429.

**הרשאות (קריטי)**
- [ ] FRANCHISEE מבקש `/orders/:id` של חנות אחרת → 403.
- [ ] FRANCHISEE קורא ל-`POST /products` → 403.
- [ ] WAREHOUSE קורא ל-`PUT /products/:id/price` → 403 (ADMIN בלבד).
- [ ] בקשה ללא session לכל endpoint מוגן → 401.

**זרימת הזמנה מלאה ב-API**
- [ ] draft → הוספת 3 פריטים → submit → סטטוס SUBMITTED + 2 רשומות NotificationLog.
- [ ] מחסן: status RECEIVED → PICKING → עדכון qtySupplied חלקי → notify-shortages → לוג התראה → READY → SHIPPED → לוג התראה.
- [ ] ניסיון SHIPPED→PICKING → 409.

**ולידציה**
- [ ] PUT items עם qty לא-מספרי / productId לא קיים / מוצר HIDDEN → 400.
- [ ] העלאת תמונה לא-תמונה (pdf) → 400; מעל 10MB → 413.

### 11.3 E2E (Playwright) — `tests/e2e/`

מריצים מול DB עם seed (§12), viewport מובייל (375px) לזכיין ודסקטופ למחסן.

- [ ] **הזמנה מקצה לקצה**: זכיין נכנס ב-OTP (mock) → מוסיף 2 מוצרים מ-2 קטגוריות → רואה סל מתעדכן → שולח → רואה מספר הזמנה. מחסן נכנס → רואה הזמנה חדשה → מקבל → מלקט → מסמן חוסר בפריט → שולח עדכון → READY → SHIPPED. זכיין רואה סטטוס "בדרך אליך" + חוסר מודגש.
- [ ] **שמירה אוטומטית**: זכיין מוסיף פריט → רענון דף → הפריט עדיין בסל.
- [ ] **חיפוש וקיצורים**: הקלדת "בל" מסננת לבלוקים; הקלדת אות מחוץ לחיפוש קופצת לקטגוריה.
- [ ] **הזמנה קבועה**: אחרי הזמנה ראשונה, "ההזמנה הקבועה שלי" ממלא את הסל זהה.
- [ ] **מוצר חסר**: ADMIN מסמן מוצר OUT_OF_STOCK → אצל הזכיין מופיע אפור ולא ניתן להוספה.
- [ ] **הודעת מטה**: ADMIN מפרסם הודעה requiresAck → באנר אצל הזכיין → "הבנתי" → נרשם ack.
- [ ] **ייצוא**: הורדת Excel של הזמנה ואימות תוכן (פריטים + סה"כ).
- [ ] **RTL ויזואלי**: צילומי מסך snapshot של קטלוג + ליקוט, ביקורת ידנית ראשונה ואז השוואה אוטומטית.

### 11.4 כיסוי
- Services: ≥ 90% branches. Routes: ≥ 80%. בדיקות הן Definition of Done — פיצ'ר בלי בדיקות לא נחשב גמור.

---

## §12. נתוני Seed (פיתוח + E2E)

- חנויות: "HELD עזריאלי ת"א" (AZR-TLV), "HELD גרנד קניון חיפה" (GRD-HFA).
- משתמשים: זכיין לכל חנות, מחסנאי אחד, אדמין אחד. טלפונות פיקטיביים `0550000001..4`, OTP קבוע `123456` בסביבת dev/test בלבד.
- קטגוריות (לפי sortOrder): בלוקים מעץ, קנבסים, הגדלות זכוכית, הגדלות אקריליק, הגדלות אלומיניום, מסגרות, ספלים, כריות, חולצות, חומרי אריזה.
- ~30 מוצרים עם שמות עבריים אמיתיים, ברקודים ייחודיים, מחירים 19–399 ₪, תמונות placeholder.
- מוצר אחד OUT_OF_STOCK ואחד HIDDEN (לבדיקות).
- הזמנה אחת SHIPPED היסטורית לחנות הראשונה (לבדיקת "הזמן שוב").

---

## §13. פאזות

**Phase A — MVP (לבנות עכשיו):** הכל במסמך זה למעט המסומן Phase B/C.
סדר מומלץ: schema+seed → auth OTP → catalog API+UI → draft/submit → מסכי מחסן+סטטוסים → חוסרים → התראות (Console driver) → ייצוא Excel → הודעות מטה → WhatsApp driver.

**Phase B:** זיהוי מוצר בתמונה (`/recognize` + UI מצלמה), סריקת ברקוד במצלמה, Web Push, אישורי קריאה מתקדמים, ניהול מלאי כמותי.

**Phase C:** חיבור ERP, דוחות והמלצות חכמות, רב-לשוני/רב-מטבעי לזכיינות בינלאומית.

---

## §14. הנחיות פתוחות

1. ימי הזמנה קבועים / חלון הזמנות — לא נאכף ב-MVP (כל יום מותר). הכן דגל `orderingWindow` ב-config.
2. מינימום הזמנה — לא נאכף ב-MVP.
3. פורמט Excel הסופי ייתכן שישתנה מול הנה"ח — לכן מרוכז ב-`formats.ts`.
4. ספק WhatsApp בפועל (Meta Cloud API ישירות או Twilio) — החלטה בזמן ה-deploy; הקוד עובד מול ה-interface בלבד.
