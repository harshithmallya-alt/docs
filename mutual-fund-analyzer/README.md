# Mutual Fund Portfolio Analyzer

A self-contained web app that turns your CAMS/KFintech mutual fund statement into
a clean dashboard, then gives you goal-based fund ideas driven by a daily market
read.

## What it does

1. **Upload & analyse your portfolio.** Drop in your latest CAMS/KFintech
   Consolidated Account Statement (CAS) — a password-protected PDF, a CSV export,
   or pasted text. The app parses your holdings and shows:
   - Headline stats: current value, overall gain/loss, number of schemes, equity
     exposure.
   - Four pie (donut) charts: allocation by **asset class**, **category**,
     **fund house (AMC)**, and **risk level**.
   - A sortable holdings table with weight and gain per scheme.

2. **Get fund recommendations for today.** Choose a goal — **Play it safe**,
   **Middle ground**, or **Aggressive growth** — and press **Analyse market &
   recommend**. The app produces a market snapshot (Nifty / Midcap / Smallcap
   direction, a volatility gauge, breadth, sector leaders) that resolves to a
   regime (Bullish / Neutral / Cautious), then recommends how to split fresh
   money across specific funds to move you toward a goal-appropriate target mix.

## Privacy

Everything runs **in your browser**. Your statement is parsed locally and never
uploaded anywhere.

## How to run it

It's a static site — no build step.

- **Locally:** open `index.html` in a browser. To enable reading
  password-protected PDFs, you need an internet connection (the PDF engine,
  pdf.js, loads from a CDN). CSV, paste, sample data, charts and recommendations
  all work fully offline.
- **Hosted:** serve this folder from any static host (GitHub Pages, Netlify,
  S3, `python -m http.server`, etc.).

## Input formats

- **PDF** — a CAMS or KFintech CAS mailback statement. Enter the PDF password
  when prompted (usually your PAN in capitals).
- **CSV** — header row with any of: `Scheme`, `Units`, `NAV`, `Value`, `Cost`,
  `Category`, `AMC`. Only `Scheme` plus a value (`Value`, or `Units`+`NAV`) is
  required. Use the in-app **Download CSV template** link.
- **Paste** — copy the text out of your statement PDF and paste it in.
- **Sample** — click **Load sample portfolio** to explore with demo data.

## Files

| File | Purpose |
|------|---------|
| `index.html`   | Page structure |
| `styles.css`   | Styling + validated data-viz colour palette (light/dark) |
| `funds.js`     | Scheme categorisation + curated fund universe |
| `parser.js`    | CAS PDF / CSV / text parsing |
| `charts.js`    | Dependency-free SVG donut charts |
| `recommend.js` | Market snapshot + recommendation engine |
| `sample.js`    | Demo portfolio |
| `app.js`       | UI controller |

## Important disclaimer

This tool is **for educational use only** and does **not** provide investment
advice. The market read is a transparent, deterministic daily **model** — not a
live exchange feed — so the page can work offline; use the **Market view**
control to explore other scenarios. Fund names and return figures are
illustrative and based on historical ranges. Past performance does not guarantee
future results. Mutual fund investments are subject to market risks; read all
scheme related documents carefully and consult a SEBI-registered investment
adviser before investing.
