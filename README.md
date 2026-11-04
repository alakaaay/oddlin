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
