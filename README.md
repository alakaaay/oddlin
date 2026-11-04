# Oddlin

An app that helps adults 35+ who sat out crypto and stock booms learn prediction markets, practice on live events with play money, and go live only when ready, with their own limits. Capstone project, Zimran IT School, team 1.

## Run

- **macOS:** double-click `start.command`
- **Windows:** double-click `start.bat`
- **Terminal:** `node server.js` (add `--open` to open the browser)

The server listens on `127.0.0.1:3000`. If 3000 is busy it takes the next free port and prints the address. Needs Node.js 18 or newer; no `npm install`.

The first time on macOS, Gatekeeper may block `start.command`: right-click it, choose Open, then Open again.

## Stack

- **Server:** `server.js`, Node built-ins only (`http`, `fs`, `path`, `child_process`). Serves `public/` and one endpoint, `POST /api/subscribe`.
- **Frontend:** static HTML, CSS and plain JavaScript in `public/`. No frameworks, bundlers or CDN libraries. Google Fonts only.
- **Design:** `design.html` holds the tokens (colors in light and dark, fonts, radii, spacing, shadows). `public/css/tokens.css` is a copy of its `:root` blocks: change a value in `design.html` first, then copy it over.

## Files

| Path | What |
| --- | --- |
| `server.js` | Static server for `public/` and `POST /api/subscribe` |
| `lib/subscribe.js` | Validates and stores an email signup |
| `api/subscribe.js` | The same endpoint as a Vercel function |
| `start.command`, `start.bat` | Launchers for macOS and Windows |
| `design.html` | Design tokens, open it in a browser to see them |
| `public/index.html` | Quiz markup and the Meta Pixel base code |
| `public/css/tokens.css` | Tokens as CSS variables |
| `public/css/app.css` | Quiz styles |
| `public/js/app.js` | Quiz steps, rendering, tracking |
| `public/terms/index.html` | Terms of Use, served at `/terms` |
| `public/privacy-policy/index.html` | Privacy Policy, served at `/privacy-policy` |
| `public/css/legal.css` | Styles for the legal pages |
| `public/assets/logo/` | Logo kit |

## Funnel

Landing (FOMO hook + plain-English ticket) → 11 steps: age, booms you sat out, “you're not late” fact, what holds you back, experience, ticket explainer, events, daily time, monthly limit, practice-first statement, email → loader → personal 28-day plan → scratch promo (−50%, 10-minute timer) → three plans with billing timeline → masterclass upsell ($19) → beta-test reveal. No payment is taken anywhere.

## Tracking

Meta Pixel `1801702574890246`, base code in `public/index.html`.

- Standard events: `PageView`, `ViewContent` (quiz start), `Lead` (email), `InitiateCheckout` (paywall), `Purchase` (Start membership, no real charge), `AddToCart` (Trade Audit)
- Commerce events (`ViewContent`, `InitiateCheckout`, `Purchase`, `AddToCart`) carry `content_type: "product"` and `content_ids`: `oddlin_w1`, `oddlin_w4`, `oddlin_w12` for the plans, `masterclass` for the upsell. `ViewContent` lists all three plans; checkout and purchase list the chosen one with `value`, `currency` and `contents`
- Custom: `QuizAnswer` (every answer), `ScratchReveal`, `PromoExpired`, `CrossSellDeclined`, `BetaReveal`
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

`step_number` is the screen's position in the funnel (0 is the landing). The monthly limit step is private: Meta gets `answer: "private"`, the amount stays in the email signup only. On the email step `answer` is `email_submitted`.

`Lead` uses Meta advanced matching: the browser hashes the lowercased email with SHA-256 and re-inits the pixel with `{ em: <hash> }` right before `Lead`, so Lead and later events carry `ud[em]`. The readable address never goes to Meta.

## Email signups

The email screen posts `{ email, answers, page }` to `/api/subscribe`. The funnel does not wait for the answer. Submitting the email counts as confirming 18+ and agreeing to the Terms and Privacy Policy; there is no checkbox.

Each signup is stored as one JSON line:

```json
{"email":"name@example.com","session_id":"s_0160dacc-...","created_at":"2026-11-03T16:52:56.654Z","answers":{"age":"45-54","fears":["lose"],"limit":"50","age_confirmed":true},"page":"/","user_agent":"..."}
```

- **Locally:** appended to `data/subscribers.jsonl`. The folder is in `.gitignore`, so emails never reach git.
- **On Vercel:** the disk is read-only, so set `SUBSCRIBE_WEBHOOK_URL` in Project Settings → Environment Variables. Every signup is POSTed there as JSON. Without it, `/api/subscribe` answers 503 and signups are lost.

The simplest webhook is a Google Sheet: Extensions → Apps Script, paste the code below, Deploy → New deployment → Web app, execute as Me, access Anyone, then copy the web app URL into `SUBSCRIBE_WEBHOOK_URL`.

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
    .appendRow([d.created_at, d.email, JSON.stringify(d.answers), d.page, d.user_agent]);
  return ContentService.createTextOutput('ok');
}
```

The same variable also works locally: `SUBSCRIBE_WEBHOOK_URL=https://... node server.js` writes to the file and the sheet.

## Legal pages

`/terms` and `/privacy-policy` are drafts, not reviewed by a lawyer. Requests (deletion, opt-out) go by replying to any Oddlin email.

## Copy rules

Never write win, profit, guaranteed, high chance, or promise earnings. Use FOMO as “don't miss understanding it”, never “don't miss the money”. Put the disclaimer next to any results number. Track-record and audit numbers are sample data and labelled as such.
