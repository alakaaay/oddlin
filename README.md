# Oddlin

AI fair-value scanner for Kalshi and Polymarket that publishes every signal, wins and losses. Capstone project, Zimran IT School, team 1.

## Run

- **macOS:** double-click `start.command`
- **Windows:** double-click `start.bat`
- **Terminal:** `node server.js` (add `--open` to open the browser)

The server listens on `127.0.0.1:3000`. If 3000 is busy it takes the next free port and prints the address. Needs Node.js 18 or newer; no `npm install`.

The first time on macOS, Gatekeeper may block `start.command`: right-click it, choose Open, then Open again.

## Stack

- **Server:** `server.js`, Node built-ins only (`http`, `fs`, `path`, `child_process`). Serves `public/`, nothing else.
- **Frontend:** static HTML, CSS and plain JavaScript in `public/`. No frameworks, bundlers or CDN libraries. Google Fonts only.
- **Design:** `design.html` holds the tokens (colors in light and dark, fonts, radii, spacing, shadows). `public/css/tokens.css` is a copy of its `:root` blocks: change a value in `design.html` first, then copy it over.

## Files

| Path | What |
| --- | --- |
| `server.js` | Static server for `public/` |
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

Landing → 18 questions with teasers → email → magic loader with one bottom-sheet question → feed summary → selling page → comparison → scratch promo (−50%, 10-minute timer) → three plans with billing timeline → Trade Audit upsell → beta-test reveal. No payment is taken anywhere.

## Tracking

Meta Pixel `1801702574890246`, base code in `public/index.html`.

- Standard events: `PageView`, `ViewContent` (quiz start), `Lead` (email), `InitiateCheckout` (paywall), `Purchase` (Start membership, no real charge), `AddToCart` (Trade Audit)
- Commerce events (`ViewContent`, `InitiateCheckout`, `Purchase`, `AddToCart`) carry `content_type: "product"` and `content_ids`: `oddlin_w1`, `oddlin_w4`, `oddlin_w12` for the plans, `trade_audit` for the upsell. `ViewContent` lists all three plans; checkout and purchase list the chosen one with `value`, `currency` and `contents`
- Custom: `QuizAnswer` (every answer), `ScratchReveal`, `PromoExpired`, `CrossSellDeclined`, `BetaReveal`
- Every event also goes to `window.dataLayer`.

`QuizAnswer` carries the step and what the user picked:

```json
{
  "event": "QuizAnswer",
  "step_number": 1,
  "step_id": "markets",
  "question": "Which markets do you trade most?",
  "answer": "sports,econ",
  "answer_label": "Sports, Economics & the Fed"
}
```

`step_number` is the screen's position in the funnel (0 is the landing). The loader's bottom-sheet question is logged under the loader's number with `step_id: "device"`. On the email step `answer` is `email_submitted`: the address itself is never sent.

## Legal pages

`/terms` and `/privacy-policy` are drafts, not reviewed by a lawyer. Fields highlighted on the page (`.todo`) must be filled before running paid traffic: operator's legal name, mailing address, contact emails, email provider, team country, governing law.

## Copy rules

Never write win, profit, guaranteed, high chance. Put the disclaimer next to any results number. Track-record and audit numbers are sample data and labelled as such.
