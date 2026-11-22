# Personal & Business Solutions — project brain

(Memoria del proyecto para Claude: qué es, cómo está hecho, las reglas del dueño y cómo probar. Léela antes de explorar.)

## The product
Spanish-first (also English) accounting SaaS for Hispanic small businesses and personal finances in the US.
Live: https://aethelaccountingplatform.com · repo folder `contabilityplatform` · Railway deploys `main`.
- Two modes per account: **business** (sales/POS, invoices, quotes, customers, vendors, expenses, receipts, bank, reports, accountant, team, assistant, taxes) and **personal** (bank, transactions, budgets, goals, subscriptions, assistant, taxes).
- Plans: business Básico / Pro / Negocio, personal Básico (free) / Pro; 7-day free trial, no card. Rules live in `contracts/planFeatures.ts` (single source); prices in `src/components/marketing/content.ts` must match `api/lib/plans.ts`.
- Tax prep is **free** for the client, **Alabama only**, documents encrypted in the DB (`TAX_FILES_KEY`).
- Public site: `/` (landing when signed out), `/producto`, `/como-funciona`, `/seguridad`, `/precios`, `/preguntas`, `/privacy`. Sign-in: `/login`, `/register`, `/forgot-password`, `/join`.
- Admin (role `admin`): `/admin`, `/admin/usuarios|suscripciones|bloqueados|ingresos`, `/admin/impuestos`, `/admin/soporte` (site support chat).

## Owner's standing rules (always)
- Talk to the owner, write step descriptions and commit messages **in Spanish**. Code comments stay in English.
- After verified work: commit and push to **both** `origin feat/funciones-planes` and `origin feat/funciones-planes:main` without asking; then wait for the Railway deploy (`railway deployment list --json`) and check `https://aethelaccountingplatform.com/api/health`.
- **Ask first** before touching production data. Never `drizzle-kit push`/recreate against production. `TAX_FILES_KEY` must never change. Never paste secrets.
- Design must look **modern and current** (soft shadows, rounded shapes, eased motion, modern cursors/icons). Nothing dated.
- Copy: no « » or similar marks; no government logos/seals (IRS, Alabama); bank/merchant logos are real modern PNGs in `public/brands/`; Excel/PDF logos via `src/components/FileLogo.tsx`.
- Public site and sign-in pages block zoom (`src/hooks/useNoZoom.ts`); the app allows zoom.

## Stack
React 19 + Vite + Tailwind 3 + shadcn (`src/components/ui`) · tRPC on Hono · drizzle + MySQL · esbuild server bundle (`dist/boot.js`) · vitest · eslint (react-hooks v7).
- `api/` tRPC routers (`api/router.ts` lists them), `api/lib/` server helpers, `api/middleware.ts` (`publicQuery`, `authedQuery`, `adminQuery`; team members limited by `memberCan` in `api/lib/team.ts`).
- `src/pages/` app + admin pages, `src/pages/site/` site pages, `src/components/marketing/` site sections (`SitePage`, `Landing` sections, `DashboardTour`, `DayWithApp`, `PhoneKit`), `src/components/layout/AppLayout.tsx` app shell/menu.
- `contracts/` shared rules (plans, tax rules), `db/schema.ts` (+ `*Schema.ts`) drizzle tables.

## Patterns to follow
- **Words**: every UI string in `src/i18n/copy/*.ts` as `{ es, en }` (type = `typeof es`), read with `useCopy(dict)`; server messages via `msg(lang, key)` in `api/lib/i18n.ts`; language comes in the `x-lang` header.
- **New tables**: created on first use with `CREATE TABLE IF NOT EXISTS … ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` inside an `ensure…Tables(db)` promise, queried with raw `db.execute(sql…)`. Raw rows: use `rowsOf()`; times come back as `"YYYY-MM-DD HH:MM:SS"` text in UTC, convert with `utcDate()` (`api/lib/support.ts`) before sending to the browser. When an account is deleted (`api/admin-router.ts` deleteUser) its rows must go: add the table to `USER_TABLES` (`api/lib/userDataCleanup.ts`) or a `deleteUser…Data` call.
- **Claude**: model `claude-opus-5-5`, `output_config: { effort: "low" }` for chat answers. In-app assistant: `api/assistant-router.ts` + tools in `api/lib/assistantTools.ts` (Alabama/Central day boundaries via `salesWindow`). Site support chat: `api/support-router.ts` + `api/lib/support.ts` (knowledge = the /preguntas FAQ with real prices).
- **Email**: `api/lib/mailer.ts` (`sendMail` never throws, `brandedHtml`, `mailP`, `mailNote`…), Gmail SMTP via `SMTP_USER`/`SMTP_PASS`; email images must be PNG (Gmail drops SVG).
- **React lint**: hooks before any early return; no synchronous `setState` inside effects (do it in callbacks/timers); `react-refresh/only-export-components`; class names with `cn` from `@/lib/utils`.
- **Motion**: `useInView`, `useReducedMotion` (`src/hooks/useInView.ts`), `useMedia`; keyframes in `src/index.css`, each with a `prefers-reduced-motion` fallback.
- **Bank connection**: `src/components/PlaidLinkOverlay.tsx` (portal on `<body>`, bottom sheet on phones): intro → Plaid's own window (language follows `x-lang`) → live import (`bank.exchangePublicToken` returns `itemId` + accounts, then `banks.syncItem`, last 30 days) → Listo with each account, its bank logo (`BankLogo`) and balance.
- Tax pages are behind an email-code gate (`api/lib/taxGate.ts`, header `x-tax-unlock`).

## Checks before pushing
- `npx tsc -p tsconfig.app.json --noEmit` (baseline ~52 old errors; must not go up) · `npx tsc -p tsconfig.server.json --noEmit` (baseline 28).
- `npx eslint <changed files>` (Admin.tsx and SubscriptionGate.tsx carry old warnings).
- `npx vitest run` (549 tests) · `npm run build`.
- Full local suite: `bash C:/Users/josma/pbs-dev/verify-all.sh` (lint, types, unit, build, ~30 end-to-end suites on throwaway databases).

## Local test kit — `C:\Users\josma\pbs-dev` (outside the repo, never production)
- `mysqltest/start-db.mjs` → throwaway MySQL 8 (prints its URL, usually `mysql://root@127.0.0.1:1912/pbs`). Fresh DB: `DATABASE_URL=… npx drizzle-kit push --force` from the repo, then `node mysqltest/restore-subs.mjs pbs`.
- Fakes: `mysqltest/fake-claude.mjs` (:4999; no-tools requests = support chat), `fake-plaid.mjs` (:4998), `fake-smtp.mjs 2599` (writes `mails/<n>.eml`).
- Local server (after `npm run build`): `TZ=UTC NODE_ENV=production PORT=3457 DATABASE_URL=mysql://root@127.0.0.1:1912/pbs TAX_FILES_KEY=<any 32-byte base64> JWT_SECRET=<long string> APP_URL=http://127.0.0.1:3457 ANTHROPIC_API_KEY=fake-key ANTHROPIC_BASE_URL=http://127.0.0.1:4999 PLAID_BASE_URL=http://127.0.0.1:4998 PLAID_CLIENT_ID=x PLAID_SECRET=x SMTP_HOST=127.0.0.1 SMTP_PORT=2599 SMTP_USER=app@demo.local SMTP_PASS=x node dist/boot.js`
- E2E suites: `mysqltest/*-e2e.ts` (bundled by verify-all). Browser checks: `browser/cdp-*.mjs` drive headless Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`) over CDP and save screenshots; `browser/sheet2.mjs` makes contact sheets.
- Plaid Link in the browser: `browser/cdp-connect2-body.mjs` swaps Plaid's script (Fetch interception of `cdn.plaid.com`) for a stub that answers with a fake-Plaid public token (`POST :4998/sandbox/public_token/create {institution_id}`).
- Gotchas: screenshot `clip` is in page coordinates (add `scrollX/scrollY`); the server reads the auth **cookie before** `x-auth-token`, so test `fetch` calls use `credentials: "omit"`; make a test admin with `UPDATE users SET role='admin'` on the local DB only.

## Open items (ask the owner when relevant)
- Privacy Policy contact email; correcting production card expenses booked to 1150 (needs permission); defaulting the site to Spanish regardless of browser language; the commercial video (needs a Spanish voice: online neural voice vs owner's own recording).
- Owner should rotate the Gmail app password, test "Olvidé mi contraseña", and back up `TAX_FILES_KEY`.
