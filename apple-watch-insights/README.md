# Apple Watch Heart Insights

A single-file web app that turns your **Apple Health export** into deeper
heart-rate analysis and training-zone breakdowns that aren't directly surfaced
in the Health or Watch apps.

Everything runs **locally in your browser** — your health file is never
uploaded, stored, or sent anywhere.

## What it shows

- **Summary** — average / min / max heart rate, resting HR (with trend), HRV
  (SDNN, with trend), walking heart rate, VO₂max (cardio fitness), and your
  observed date range.
- **Heart-rate zones** — estimated time and share spent in each of the 5
  training zones, with a bar chart and per-zone explanations.
- **Insights** — plain-language takeaways on resting-HR trend, intensity
  balance (e.g. the 80/20 rule), recovery (HRV), your HR range, and cardio
  fitness.
- **Trends** — resting heart rate over time, HRV over time, and a full
  heart-rate distribution histogram colored by zone.

## How to use

1. **Open the app.** Double-click `index.html` (or serve the folder) — it works
   in any modern browser. Tap **Load demo data** to explore it instantly.
2. **Export your data from Apple Health:**
   - Open the **Health** app on iPhone → tap your **profile photo** (top right).
   - Scroll down → **Export All Health Data** → **Export**.
   - AirDrop / share the `export.zip` to your computer and **unzip** it.
3. **Load `export.xml`** — drag the `apple_health_export/export.xml` file onto
   the app (or click **Choose file**). Large exports are parsed in a streaming
   fashion with a progress bar.
4. **Personalize zones** — set your **age** (or enter a measured **Max HR**) and
   pick a zone method:
   - **Heart-rate reserve (Karvonen)** — uses your resting HR from the data for
     personalized zones (default, recommended).
   - **% of max HR** — straight percentage of max heart rate.

## Notes on the numbers

- **Zones** use the standard 5-zone model (50–60 / 60–70 / 70–80 / 80–90 /
  90–100% of either heart-rate reserve or max HR).
- **Time-in-zone** is estimated from the spacing between heart-rate samples,
  with gaps **capped at 5 minutes** so sleep/idle stretches don't distort the
  totals. Only readings at or above Zone 1 count as "training time," so normal
  resting/daytime HR is intentionally excluded.
- **Resting HR / HRV trends** compare the median of your first few days against
  your last few days in the export.
- **VO₂max** banding (low → high) is a generic reference, not a clinical grade.

> Not medical advice. This is a personal-insights tool — consult a clinician for
> any health decisions.

## Privacy & tech

- Pure client-side: one `index.html`, no backend, no accounts, no tracking.
- Parsing runs in your tab using a chunked streaming reader, so multi-hundred-MB
  exports work without loading the whole file into a DOM.
- Charts use [Chart.js](https://www.chartjs.org/) from a CDN; if it can't load,
  all numbers and tables still render.
