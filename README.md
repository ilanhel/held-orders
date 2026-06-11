# HELD Orders System — Phase A (MVP)

מערכת הזמנות זכיינים-מחסן עבור HELD.

## מקומות עיקריים

- `SPEC.md` — המפרט המלא (מחייב)
- `CLAUDE.md` — הוראות כללית
- `src/` — קוד TypeScript
- `prisma/` — Prisma schema + seed
- `tests/` — Vitest + Playwright E2E

## התחלה מהירה

```bash
npm install
npm run db:migrate     # Create/migrate SQLite
npm run db:seed        # Populate test data
npm run dev            # Start dev server (http://localhost:3000)
```

## פקודות שימושיות

```bash
npm run lint           # ESLint check
npm run test           # Vitest (unit + integration)
npm run test:ui        # Vitest UI dashboard
npm run build          # Next.js production build
npm start              # Start production server
npm run db:studio      # Prisma Studio (DB GUI)
```

## סטיילים מחובר

- **Tailwind CSS** — Utility-first, RTL support
- **TypeScript Strict** — Type-safe
- **Prisma ORM** — SQLite (dev) | PostgreSQL (prod)
- **Vitest** — Fast unit + integration tests
- **Playwright** — E2E tests
- **ESLint + Next.js** — Code quality

## סדר בנייה (Phase A)

1. ✅ Schema + Seed
2. 🔲 Auth OTP
3. 🔲 Catalog API + UI
4. 🔲 Draft/Submit Orders
5. 🔲 Warehouse UI
6. 🔲 Shortages & Notifications
7. 🔲 Excel Export
8. 🔲 Announcements
9. 🔲 WhatsApp Driver

---

ראה `SPEC.md` לפרטים מלאים ודרישות.
