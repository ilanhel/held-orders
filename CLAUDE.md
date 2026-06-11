# CLAUDE.md — HELD: מערכת הזמנות זכיינים–מחסן

> קובץ זה הוא ההקשר הקבוע של הפרויקט. קרא אותו לפני כל משימה.
> האיפיון המלא והמחייב נמצא ב-`SPEC.md` — בכל סתירה, SPEC.md גובר.

## מה אנחנו בונים

מערכת הזמנות סחורה פנים-רשתית בין זכייני HELD למחסן המרכזי.
HELD היא רשת ישראלית (~25 סניפים) של מתנות אישיות ועיצוב רגשי לבית.

- **זכיין**: נכנס מקישור (מובייל/מחשב), מזמין מקטלוג ויזואלי עם תמונות גדולות, שם, ברקוד ומחיר — ושולח. מקבל סיכום בוואטסאפ.
- **מחסן**: מקבל רשימת ליקוט מסודרת לפי קטגוריות, מלקט, מעדכן חוסרים, משנה סטטוס. מנהל קטלוג, מחירים והודעות.
- **אוטומציה**: כל עדכון (סיכום הזמנה, חוסרים, מוצר חדש, משלוח) נשלח אוטומטית בוואטסאפ. אפס טלפונים.

## עקרונות מוצר — לא מתפשרים

1. **מבחן ההפעלה העצמית**: זכיין חדש חייב להצליח לבצע הזמנה ראשונה לבד, בלי הדרכה. כל מסך שדורש הסבר — נכשל.
2. **אפס חיכוך**: אין אפליקציה להורדה, אין סיסמאות. PWA + כניסת OTP.
3. **ויזואלי קודם כל**: תמונות מוצר גדולות, שמות באותיות גדולות. מזמינים עם העיניים.
4. **סלחנות לניתוקים**: החנויות בקניונים עם אינטרנט לא יציב. טיוטת הזמנה נשמרת אוטומטית אחרי כל שינוי. ניתוק/רענון = ממשיכים מאותה נקודה.
5. **עברית ו-RTL בכל מקום**: כל ה-UI בעברית, `dir="rtl"` ברמת המסמך. אין טקסט ממשק באנגלית.
6. **פשטות מנצחת חדשנות**: כשיש ספק בין שתי דרכים — בחר את הפשוטה יותר.

## סטאק טכנולוגי

| שכבה | בחירה |
|---|---|
| Frontend + Backend | Next.js 14+ (App Router), TypeScript strict |
| UI | Tailwind CSS (עם תמיכת RTL), mobile-first |
| DB | PostgreSQL + Prisma (בפיתוח: SQLite מותר) |
| Auth | OTP (וואטסאפ/SMS) → session cookie. ספק OTP מאחורי interface עם mock לפיתוח |
| התראות | `NotificationService` interface — דרייברים: WhatsApp Cloud API, console (dev), mock (tests) |
| Excel | exceljs |
| זיהוי תמונה (Phase B) | `ProductRecognitionService` interface — מימוש ראשון: Claude Vision API מול תמונות הקטלוג |
| בדיקות | Vitest (unit + integration), Playwright (E2E), supertest לראוטים |
| PWA | manifest + service worker בסיסי (cache לנכסים סטטיים בלבד, לא לנתונים) |

## מבנה פרויקט

```
src/
  app/                  # Next.js App Router
    (franchisee)/       # מסכי זכיין: קטלוג, סל, הזמנות שלי
    (warehouse)/        # מסכי מחסן: הזמנות נכנסות, ליקוט, קטלוג, מחירים, הודעות
    api/                # Route handlers — דקים, קוראים ל-services
  components/           # קומפוננטות UI משותפות
  services/             # לוגיקה עסקית: orders, catalog, notifications, exports, auth
  lib/                  # db client, utils, validation (zod)
  types/
prisma/
  schema.prisma
  seed.ts               # נתוני דמו — ראה SPEC.md §12
tests/
  unit/
  integration/
  e2e/
```

## קונבנציות קוד

- קוד, שמות משתנים, פונקציות, טבלאות ועמודות — **באנגלית**. טקסט UI — **בעברית** (קובץ `src/lib/he.ts` מרכזי, לא מחרוזות מפוזרות).
- TypeScript strict. אסור `any`. ולידציה של כל קלט API עם zod.
- כל לוגיקה עסקית ב-services — לא בקומפוננטות ולא ב-route handlers.
- כסף: אגורות כ-integer (לא float). `priceAgorot: 12900` = ‏129.00 ₪.
- תאריכים: UTC ב-DB, תצוגה ב-Asia/Jerusalem.
- סטטוסי הזמנה (enum, אל תמציא חדשים): `DRAFT → SUBMITTED → RECEIVED → PICKING → READY → SHIPPED` (+ `CANCELLED`).
- כל שינוי סטטוס נרשם ב-`OrderStatusHistory` ומפעיל התראה דרך `NotificationService` — לעולם לא לשלוח התראה ישירות מה-UI.

## פקודות

```bash
npm run dev          # פיתוח
npm run test         # Vitest — unit + integration
npm run test:e2e     # Playwright
npm run lint         # ESLint + tsc --noEmit
npm run db:migrate   # prisma migrate dev
npm run db:seed      # נתוני דמו
```

## הגדרת Done — לכל משימה

1. הקוד עובר `npm run lint` ו-`npm run test` בלי שגיאות.
2. לפיצ'ר חדש נכתבו בדיקות לפי תוכנית הבדיקות ב-SPEC.md §11 (לפחות: unit ל-service, integration ל-API, E2E לזרימה אם רלוונטי).
3. נבדק ויזואלית במובייל (375px) ובדסקטופ — RTL תקין, אין גלישת טקסט.
4. אין מחרוזות עברית בתוך קומפוננטות — הכל מ-`he.ts`.
5. עומד במבחן ההפעלה העצמית: אפשר להבין את המסך בלי הסבר.

## סדר עבודה

בונים לפי פאזות (SPEC.md §13). **כרגע: Phase A (MVP) בלבד.**
אל תתחיל פיצ'רים של Phase B/C (זיהוי תמונה, פוש, מלאי) — אבל השאר את ה-interfaces מוכנים להרחבה.

עבוד בצעדים קטנים: מיגרציה → service + בדיקות → API + בדיקות → UI → E2E. אחרי כל צעד — הרץ בדיקות.

## מה לא לעשות

- לא להוסיף ספריות UI כבדות (MUI, AntD) — Tailwind בלבד.
- לא לבנות מערכת חיוב/תשלומים — מחירים להצגה בלבד.
- לא להתחבר ל-ERP — רק ייצוא Excel (החיבור יגיע ב-Phase C).
- לא לשמור תמונות ב-DB — קבצים ב-storage, ב-DB רק path.
- לא להשתמש ב-localStorage לנתונים קריטיים — טיוטת הזמנה נשמרת בשרת.
- לא למחוק נתונים פיזית: מוצרים ומשתמשים מקבלים `hidden`/`inactive` (soft delete). הזמנות לעולם לא נמחקות.
