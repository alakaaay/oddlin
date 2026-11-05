# Oddlin

An app that helps adults 35+ who sat out crypto and stock booms learn prediction markets, practice on live events with play money, and go live only when ready, with their own limits. Capstone project, Zimran IT School, team 1.

## Run

- **macOS:** double-click `start.command`
- **Windows:** double-click `start.bat`
- **Terminal:** `node server.js` (add `--open` to open the browser)

The server listens on `127.0.0.1:3000` and opens the quiz at `/quiz` (the root redirects there, keeping UTM tags). If 3000 is busy it takes the next free port and prints the address. Needs Node.js 18 or newer; no `npm install`.

The first time on macOS, Gatekeeper may block `start.command`: right-click it, choose Open, then Open again.

## Stack

- **Server:** `server.js`, Node built-ins only (`http`, `fs`, `path`, `child_process`). Serves `public/` and two endpoints, `POST /api/event` and `POST /api/subscribe`, which write to Supabase.
- **Frontend:** static HTML, CSS and plain JavaScript in `public/`. No frameworks, bundlers or CDN libraries. Google Fonts only.
- **Design:** `design.html` holds the tokens (colors in light and dark, fonts, radii, spacing, shadows). `public/css/tokens.css` is a copy of its `:root` blocks: change a value in `design.html` first, then copy it over.

## Files

| Path | What |
| --- | --- |
| `server.js` | Static server for `public/`, `POST /api/event`, `POST /api/subscribe` |
| `public/funnel.json` | Funnel steps and questions: read by the quiz and loaded into the database |
| `lib/event.js`, `lib/subscribe.js` | Validate and store an event or an email |
| `lib/supabase.js` | Calls Postgres functions through Supabase REST |
| `api/event.js`, `api/subscribe.js` | The same endpoints as Vercel functions |
| `scripts/seed-funnel.js` | Loads `funnel.json` into `funnels` and `funnel_steps` |
| `db/schema.sql` | Database tables and views |
| `scripts/db.js` | Runs SQL against Supabase |
| `start.command`, `start.bat` | Launchers for macOS and Windows |
| `design.html` | Design tokens, open it in a browser to see them |
| `public/quiz/index.html` | Quiz markup and the Meta Pixel base code, served at `/quiz` |
| `public/app/` | App MVP at `/app`: `index.html`, `app.css`, and ES modules in `js/` (no build step). Entry `js/main.js`; one module per area: `state` (player state, sync, streak), `course` (lessons and quizzes), `visuals` (slide illustrations), `views` (tab screens), `router`, `player` (lesson and quiz player, retake popup), `chest`, `perks` (streak calendar, gifts, bonus), `progression` (ranks, badges), `board`, `avatar`, `share`, `settings`, `gate` (sign-in and sign-up), `sim` (simulator, AI review card), `coach` (AI Coach chat; the AI Tools tab at `#/ai` links to the scanner (`scanner` module, `#/scanner`) and the coach (`#/coach`); Arbitrage is Soon), `util` |
| `lib/markets.js`, `lib/kalshi-series.json` | Live Kalshi and Polymarket markets for the simulator; the Kalshi series list per category is built by `scripts/kalshi-series.js` |
| `lib/trades.js`, `db/trades.sql` | Simulator trades with demo money, settlement, demo-trader leaderboard |
| `lib/ai.js` | Gemini API call with JSON output |
| `lib/review.js`, `db/reviews.sql` | AI review of one contract, cached for a day |
| `lib/coach.js`, `db/coach.sql`, `lib/course-digest.json` | AI Coach; the course text is built by `scripts/course-digest.js` |
| `lib/billing.js`, `db/billing.sql` | Subscriptions, charge history, add-ons |
| `lib/scanner.js`, `db/scanner.sql` | AI Scanner signals and limits |
| `api/markets.js`, `api/trade.js`, `api/review.js`, `api/coach.js`, `api/billing.js`, `api/scanner.js` | The same endpoints as Vercel functions |
| `vercel.json` | Redirects `/` to `/quiz` on Vercel |
| `public/css/tokens.css` | Tokens as CSS variables |
| `public/css/app.css` | Quiz styles |
| `public/js/app.js` | Quiz steps, rendering, tracking |
| `public/terms/index.html` | Terms of Use, served at `/terms` |
| `public/privacy-policy/index.html` | Privacy Policy, served at `/privacy-policy` |
| `public/css/legal.css` | Styles for the legal pages |
| `public/assets/logo/` | Logo kit |

## Funnel

Landing (FOMO hook + plain-English ticket) → 8 steps: age, booms you sat out, “you're early” timeline, what holds you back, experience, odds explainer, events, email → magic page (three progress bars, each pauses for a popup question: practice-first statement, daily time, monthly limit) → personal 28-day plan → “You now vs With Oddlin” (built from the fears they picked; the chart is confidence, not money) → “With Oddlin, you will have” → scratch promo (−50%, 10-minute timer) → three plans with billing timeline and auto-renew notice → beta-test reveal. No payment is taken anywhere.

## Tracking

Meta Pixel `1801702574890246`, base code in `public/quiz/index.html`.

- Standard events: `PageView`, `ViewContent` (quiz start), `Lead` (email), `InitiateCheckout` (paywall), `Purchase` (Start my plan, no real charge)
- Commerce events (`ViewContent`, `InitiateCheckout`, `Purchase`) carry `content_type: "product"` and `content_ids`: `oddlin_w1`, `oddlin_w4`, `oddlin_w12`. `ViewContent` lists all three plans; checkout and purchase list the chosen one with `value`, `currency` and `contents`. `InitiateCheckout` fires once per visit
- `Purchase` goes to Meta with `value: 0`, since nothing is charged, so Ads Manager shows no fake revenue. The price the user would have paid is in `plan_price`, and the database stores it as the event's `value`
- Custom: `QuizAnswer` (every answer), `ScratchReveal` (promo code `EARLY50-` + today's date, e.g. `EARLY50-NOV04`), `PromoExpired`, `BetaReveal`
- Every event also goes to `window.dataLayer`.
- Every event we send carries `session_id`, a random id like `s_0160dacc-7b1f-44d8-a5c0-dd4956820778` created in `<head>` and kept in `sessionStorage` (same id after a reload, new id in a new tab). The email signup stores the same id, so a lead's email can be joined to their pixel events. Meta's automatic `SubscribedButtonClick` events don't have it.

`QuizAnswer` carries the step and what the user picked:

```json
{
  "event": "QuizAnswer",
  "step_number": 1,
  "step_id": "age",
  "question": "How old are you?",
  "answer": "45-54",
  "answer_label": "45 to 54"
}
```

`step_number` is the screen's position in the funnel (0 is the landing). The monthly limit step is private: Meta gets `answer: "private"`; the real answer is stored only in our database (`events`). On the email step `answer` is `email_submitted`.

`Lead` uses Meta advanced matching: the browser hashes the lowercased email with SHA-256 and re-inits the pixel with `{ em: <hash> }` right before `Lead`, so Lead and later events carry `ud[em]`. The readable address never goes to Meta.

## Data flow

1. The quiz loads `/funnel.json` (slug `john-35plus`, version 4) and shows its steps. Steps of type `popup` are asked over the magic page, not as screens. Version 1 had the masterclass upsell; version 2 asked time, limit and the practice statement before the email; version 3 had no compare and benefits screens.
2. Every pixel event, plus a `ScreenView` on each screen (database only), is POSTed to `/api/event` with the session id, funnel slug and version, step key, answer codes, value and visit metadata (UTM tags, device).
3. The email goes to `/api/subscribe`. Submitting it counts as confirming 18+ and agreeing to the Terms and Privacy Policy; there is no checkbox.
4. The server calls `log_event` / `save_lead` in Postgres (`db/functions.sql`) through Supabase REST with the secret key. Each call creates the session row on first use, so events and leads always have a session.

The private `limit` answer is stored in our database but sent to Meta as `private`.

**Changing the funnel:** edit `public/funnel.json`, bump `version` if the steps or questions changed, then run `node scripts/seed-funnel.js`. Sessions keep pointing at the version they saw.

**Env vars** (`.env.local` locally, Project Settings on Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` for the API; `POSTGRES_URL_NON_POOLING` for the scripts.

## App accounts

The quiz paywall (`Start my plan`) calls `POST /api/purchase`, which creates a row in `users` (status `pending`) for the email left in the quiz, with the quiz answers as the profile (events → topics, time → minutes, experience → level) and `onboarded = true`. Only emails with a quiz lead are accepted. No payment is taken.

The first screen of `/app` always asks **I'm new here** or **I already have an account**. The quiz email is prefilled on the email step when the quiz ran on the same device.
- **New here**: a light funnel in the app: name → topics → minutes a day → level → plan (same three plans; 50% off the first payment with a 10-minute timer that starts on the plan screen, then full prices; auto-renew disclosure; no payment taken in the beta) → email → code → password → lesson 1. Server action `signup` creates the account through `signup_app_user`; an email that already has an active account goes to the password step instead.

Sign-in to `/app` (`POST /api/auth`, one endpoint with an `action`, logic in `lib/auth.js`, SQL in `db/auth.sql`):
- **pending** user: email → 6-digit code by email (10 min, 5 tries, 60 s between sends) → new password → status `active` → lesson 1 opens right away. The in-app onboarding (name, topics, minutes a day, level) runs only for an account without quiz answers.
- **active** user: email → password (5 wrong tries lock the account for 15 min). After a wrong password a "Forgot password?" link appears: email code → new password → signed in; every other session is signed out.
- Emails are sent only for these two cases (first sign-in, forgotten password). The quiz signup and purchase send nothing.
- Unknown email: "No plan for this email" with a link to the quiz.
- Stored as hashes only: codes and tokens as HMAC-SHA256 (`AUTH_SECRET`, falls back to a hash of the Supabase secret key), passwords as scrypt. The session token (30 days) lives in the browser's localStorage. Log out is in Settings.
- The SQL functions are revoked from `anon` and `authenticated`, so the public Supabase key can't call them.
- **Progress lives in the database** (`user_progress`: one JSON document per user plus XP): lessons, quizzes, stars, XP, coins, streak and freezes, calendar, badges, chests, gifts, bonus timer, avatar, theme, trades, coach chat. The app saves locally at once and to the server 1.2 s after the last change (`progress_save`); on sign-in the server copy wins (`progress_load`), and a new account takes what the device has. Last write wins between devices. The client sends the whole document, so XP is not tamper-proof yet.
- **Ranks**: 10 ranks by XP, each step bigger than the last: Rookie 0, Learner 100, Apprentice 250, Analyst 475, Strategist 800, Forecaster 1,250, Expert 1,850, Master 2,650, Grandmaster 3,700, Oracle 5,100. `RANKS` in `public/app/app.js` and `RANK_XP` in `lib/auth.js` must match. A ranks screen opens from the profile and the leaderboard.
- **Leaderboard** shows only players of your rank (`leaderboard` action, top 30 by XP in your XP band). Practice players fill the league up to 10 rows until enough real players join.

## Simulator, AI review and AI Coach

- **Markets** (`GET /api/markets?platform=kalshi|polymarket&cat=…&q=…`): public read-only APIs, no keys. Top by 24h volume, sports and crypto left out, prices 2–98¢ only. Kalshi has no sort or category filter, so `lib/kalshi-series.json` lists 20 series per category (rebuild: `node scripts/kalshi-series.js`). Cached 2 minutes.
- **Trades** (`POST /api/trade`): demo dollars, $1,000 to start, separate from coins. The server locks the live ask on open and the live bid on sell. There is no cron: open trades settle when their owner lists them and the market has resolved. The demo-trader leaderboard ranks closed P&L (top 50 plus your own place) and opens any trader's history.
- **AI review** (`POST /api/review`): opening a contract shows an AI odds range, expected value per contract (with the AI's odds and with the player's), reasons for YES and for NO, and what to watch. One model call per market per UTC day, stored in `ai_reviews` and shared by all players.
- **AI Coach** (`POST /api/coach`): answers only about the course (`lib/course-digest.json`) and the player's own trades and progress, which the server reads itself. Anything else gets "I don't know". 10 questions per player per day (`coach_usage`), 20 with Coach Plus, shown under the chat input. Rebuild the course text after editing lessons: `node scripts/course-digest.js`.
- **Billing** (`POST /api/billing`, `lib/billing.js`, `db/billing.sql`): `subscriptions` and `charges`. The quiz purchase and the app sign-up start the main plan with its first charge (50% off while the promo timer runs). Add-ons are bought in the app: Coach Plus ($10 every 4 weeks, +10 coach questions a day), Scanner Pro and Scanner Max. Profile → Subscriptions & billing lists every subscription (cancel keeps access to the end of the period, resume undoes it) and the full charge history. No cron: renewals due since the last look are billed when the screen loads. Beta: no payment provider, no money is taken; prices in `lib/billing.js` must match the paywalls.
- **AI Scanner** (`POST /api/scanner`, `lib/scanner.js`, `db/scanner.sql`, screen `#/scanner`): a daily edition of 10 ranked picks per platform, **the same for everyone** (impersonal, published once a day, no user data in the prompt). The first request of the UTC day publishes it in two Gemini calls over ~30 liquid live markets: a research call grounded with Google Search (plain text, `GEMINI_SEARCH_MODEL`, default `gemini-3.5-flash-lite`; JSON output turns search off, so it can't be one call), then the structured picks built from those notes (`scanner_editions`, no cron, ~10 s). Everyone after reads the stored edition. Players open picks in rank order: 1 a day free, 5 with Scanner Pro ($20 every 4 weeks), 10 with Scanner Max ($30); buying one tier ends the other. The screen lists every pick the user opened in the last 30 days, grouped by day; a row opens the pick on its own sheet. A scanning card (radar and steps) takes the place of the button while a pick opens. Each pick: price vs AI odds bars, the gap in cents, three reasons, one risk, publish time and price. "Trade it with demo money" opens the simulator ticket with the AI's odds.
- AI review and AI Coach never tell anyone to buy or sell. The AI Scanner suggests a side for demo-money practice, labeled as an AI estimate that can be wrong. Env: `GEMINI_API_KEY` (server only), optional `GEMINI_MODEL` (default `gemini-3.1-flash-lite`).

## Email

`lib/mail.js` sends the sign-in and password-reset codes, nothing else. There is no public send endpoint.

- Env: `GMAIL_USER` + `GMAIL_APP_PASSWORD` (Gmail SMTP, `lib/smtp.js`, any recipient within Gmail's daily limit; used first when set), or `RESEND_API_KEY` with optional `MAIL_FROM`. All server only.
- Without a verified domain Resend only sends from `onboarding@resend.dev` to your own Resend account email. Real recipients need a verified domain and an unsubscribe link in non-transactional emails.
- Test: `node scripts/send-test-email.js you@example.com` sends one sign-in code email (the code signs nobody in).

## Database

Supabase Postgres, schema in `db/schema.sql` and write functions in `db/functions.sql` (both applied 2026-11-04): `funnels`, `funnel_steps`, `sessions`, `events`, `leads`, plus views `session_progress` (furthest step per session) and `session_answers` (answers with labels). RLS is on with no policies, and `log_event` / `save_lead` can only be executed by the service role: only the server's secret key can read or write.

Run SQL without psql or npm:

```bash
node scripts/db.js db/schema.sql
node scripts/db.js -c "select * from session_progress limit 10"
```

`scripts/db.js` speaks the Postgres protocol with Node built-ins, reads `POSTGRES_URL_NON_POOLING` from `.env.local`, and verifies TLS against `db/supabase-ca.crt` (Supabase Root 2021 CA, public, valid until 2031).

## Legal pages

`/terms` and `/privacy-policy` are drafts, not reviewed by a lawyer. Requests (deletion, opt-out) go by replying to any Oddlin email.

## Copy rules

Never write win, profit, guaranteed, high chance, or promise earnings. Use FOMO as “don't miss understanding it”, never “don't miss the money”. Put the disclaimer next to any results number. Track-record and audit numbers are sample data and labelled as such.
