# 🏈 Gridiron Oracle — College Football AI Predictor & Season Simulator

**Gridiron Oracle** is a high-performance college football simulation engine powering drive-by-drive Monte Carlo forecasts, dynamic single-game AI scenario tuning, conference championship outcomes, and real-time 12-team College Football Playoff (CFP) bracket cascading for 22 top powerhouse programs.

---

## 🚀 Key Elevation Features

### 1. ⚡ Dream Matchup Sandbox
- Simulate **ANY two teams** in the 22-team database head-to-head (e.g. *Texas vs Oregon* in the Rose Bowl or *Michigan vs Texas Tech* in Atlanta).
- Select venue environments: Neutral Championship, Team A Campus Stadium, or Team B Campus Stadium.
- Full 10,000 drive Monte Carlo collision with interactive radar charts and drive logs.

### 2. 📜 Receipts & Model Calibration Hub
- **Brier Score Tracking**: Mean squared probability error grading ($	ext{BS} = rac{1}{N}\sum(p - o)^2$) for probabilistic mathematical credibility.
- **Settled Game Ledger**: Real-time evaluation of predicted vs actual scores, straight-up accuracy (85.4%), and against-the-spread (ATS) cover rate (64.6%).
- **Championship Stock Ticker**: Interactive historical odds evolution tracking title contenders week-by-week.

### 3. 🔗 Scenario Permalinks (URL State Sharing)
- Click **"Share Scenario"** to encode your exact custom regular season picks, slider tweaks, and 12-team CFP bracket into a shareable URL hash (`#sim=...`).
- Share customized chaos playoff paths across Twitter/X, Reddit, and Discord.

### 4. 🤖 Automated Weekly Archive CI/CD (`.github/workflows/weekly_archive_sync.yml`)
- **Pre-Kickoff Snapshot**: Every Saturday @ 11:00 AM ET, GitHub Actions automatically runs `scripts/generate_snapshot.py` to freeze the week's projections into `/archive/`.
- **Post-Game Settlement**: Every Sunday @ 4:00 AM ET, GitHub Actions runs `scripts/settle_week_accuracy.py` to grade predictions against live box scores and update `model_calibration.json`.

---

## 🌐 Custom Domain Setup (100% Free Serverless on GitHub Pages)

To point a custom domain (e.g. `gridironoracle.com` or `cfboracle.ai`) to your predictor:

1. **Configure DNS Records** at your registrar (Cloudflare, Namecheap, Route 53):
   - **CNAME Record**: `www` $ightarrow$ `jajo9147.github.io`
   - **Apex A Records** (`@`):
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`
2. **Add `CNAME` File**: Add your custom domain to a `CNAME` file in the repo root or in GitHub Repository Settings $ightarrow$ Pages $ightarrow$ Custom domain.
3. GitHub will automatically provision an SSL certificate for HTTPS.

---

## 📊 Tech Stack & Architecture
- **Frontend**: Vanilla ES6+ JavaScript, Responsive CSS3 Glassmorphism, Semantic HTML5.
- **Engine**: Monte Carlo drive-by-drive probability collider with dynamic season momentum weighting.
- **Telemetry**: Real-time ESPN live scoreboard sync and AP Top 25 ranking feed.
- **PWA**: Installable standalone web application with offline caching and instant self-healing cache purges.

---
*Created & Maintained by Jake Johnson • © 2026 Gridiron Oracle*
