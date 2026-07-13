# פריסה לפרודקשן — HELD Orders (Phase A)

צ'ק-ליסט לעלייה לאוויר. הקוד מוכן; השלבים הבאים הם תצורה ותפעול.

## 1. מסד נתונים — PostgreSQL (בוצע ✅)

המעבר ל-PostgreSQL כבר הושלם:

- [prisma/schema.prisma](prisma/schema.prisma) מוגדר ל-`provider = "postgresql"` עם
  `url = env("DATABASE_URL")` (pooled, ריצה) ו-`directUrl = env("DIRECT_URL")` (ישיר, למיגרציות).
- מסד הנתונים הענני (Neon) כבר עבר `prisma migrate deploy` והוזרע בנתוני דמו.
- בדיקות מקומיות (unit/integration/E2E) רצות מול PostgreSQL מוטמע (`embedded-postgres`) —
  ראה [tests/setup.ts](tests/setup.ts) ו-[tests/e2e/with-db.ts](tests/e2e/with-db.ts).

להזרעה/מיגרציה ידנית מול מסד חדש:
```bash
npx prisma migrate deploy   # מחיל את המיגרציות הקיימות
npm run db:seed             # נתוני דמו (אופציונלי — בפרודקשן אמיתי הזן נתונים אמיתיים)
```

## 2. משתני סביבה

ראה [.env.example](.env.example). חובה בפרודקשן:

| משתנה | ערך |
|---|---|
| `SESSION_SECRET` | מחרוזת אקראית חזקה — `openssl rand -base64 48`. **האפליקציה לא תעלה בלעדיו** |
| `DATABASE_URL` | connection string של PostgreSQL |
| `NOTIFICATION_DRIVER` | `whatsapp` |
| `WHATSAPP_PHONE_NUMBER_ID` | מ-Meta Business |
| `WHATSAPP_BEARER_TOKEN` | טוקן קבוע / מתחדש |
| `ERP_INTAKE_PHONE` | מספר הוואטסאפ של מחשב הקליטה ל-ERP (לשליחת קובץ הליקוט) |
| `NODE_ENV` | `production` |

`E2E_FIXED_OTP` — לא להגדיר בפרודקשן (גם אם יוגדר, הוא מתעלם כש-`NODE_ENV=production`).

## 3. בנייה והרצה

```bash
npm ci
npx prisma generate
npm run build
npm run start
```

## 4. אבטחה (מצב נוכחי)

- ✅ הרשאות תקינות בכל הראוטים, חסימת IDOR, ולידציית zod, Prisma מונע SQLi.
- ✅ Security headers ב-[next.config.js](next.config.js): CSP, HSTS (בפרודקשן), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- ✅ Cookies: `httpOnly`, `secure` בפרודקשן, `sameSite=lax`.
- ✅ `SESSION_SECRET` ללא fallback בפרודקשן; OTP קבוע חסום בפרודקשן.

**לתקן לפני סקייל (מרובה מופעים):**
- אחסון OTP ו-rate-limiting נמצא כרגע בזיכרון התהליך → לעבור ל-Redis.
- לשקול CSRF token ייעודי (כרגע `sameSite=lax` מספק הגנה בסיסית).

## 5. PWA / Service Worker

- ה-SW נרשם **רק בפרודקשן ומעל HTTPS**. ודא תעודת SSL תקפה.
- ה-SW מטמן נכסים סטטיים בלבד; לא מטמן `/api/` ולא ניווטים — אין נתונים מיושנים.

## 6. אחסון תמונות

לפי `CLAUDE.md` — תמונות מוצר נשמרות כקבצים ב-storage, ב-DB רק `path`.
הגדר את ספק האחסון (object storage / volume) וודא שהנתיבים נגישים מהאפליקציה.

## 7. אימות לפני פתיחה לזכיינים

```bash
npm run lint
npm run test
npm run test:e2e
```

- בדיקת "הפעלה עצמית" עם זכיין אמיתי במובייל.
- אימות פורמט קובץ ה-Excel מול הנהלת החשבונות.
- בדיקת end-to-end של התראת WhatsApp מול מספר אמיתי.
