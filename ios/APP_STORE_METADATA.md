# CFB Prophet — Apple App Store Listing & Metadata Package

This document contains everything needed to publish **CFB Prophet** to the **Apple App Store** via [App Store Connect](https://appstoreconnect.apple.com).

---

## 📋 1. App Information

- **App Name**: `CFB Prophet`
- **Subtitle**: `College Football AI Simulator` *(30 chars max)*
- **Bundle ID**: `com.cfbprophet.app` *(or your custom Apple Developer ID prefix)*
- **SKU**: `cfb-prophet-ios-01`
- **Primary Language**: `English (U.S.)`
- **Primary Category**: `Sports`
- **Secondary Category**: `Entertainment`
- **Age Rating**: `4+` (No age-restricted content, gambling, or violence)
- **Copyright**: `© 2026 CFB Prophet`

---

## 🏷️ 2. App Store Keywords & Search Tags
*(100 characters max, comma-separated, no spaces after commas)*
```
college football,cfb,playoff simulator,12 team bracket,cfp,bowl games,football ai,ncaa,bracket vault
```

---

## 📝 3. Promotional Text & App Store Description

### Promotional Text *(170 characters max)*:
> Simulate 10,000 college football drives, project 12-team CFP playoff brackets, and compete against Prophet AI's golden baseline in weekly leaderboard picks.

### Full App Store Description:
```
Welcome to CFB Prophet — the ultimate College Football AI Predictor and 12-Team CFP Playoff Simulator for the 2026 season.

Powered by a drive-by-drive Monte Carlo simulation engine, CFB Prophet lets you simulate every matchup, test custom offensive and defensive sliders, and forecast conference championships and the 12-team College Football Playoff tournament field with unprecedented accuracy.

🏈 KEY FEATURES:

• 10,000+ MONTE CARLO SIMULATIONS
Simulate full games drive-by-drive factoring in tempo, turnover luck, red-zone efficiency, home-field advantage, and special teams variance.

• 12-TEAM CFP TOURNAMENT BRACKET GENERATOR
Automatically project the 4 first-round byes (#1 to #4 conference champions), on-campus first-round clashes (#5-#12), New Year's Six bowl matchups, and the National Championship Game.

• PROPHET AI'S PICKS & GLOBAL LEADERBOARD
Compete against Prophet AI's official 10,000-simulation golden standard benchmark. Submit your season picks or weekly forecasts and see your percentile rank and grading score.

• 1-CLICK WEEKLY STANDINGS FILTER
Filter matchups, results, and accuracy scores seamlessly from Week 0 through Rivalry Week 14, Conference Championships (CCG), and the CFP Playoff.

• ALL 30 FBS TEAMS GAME MATRIX
Explore full 12-game 2026 schedules, projected win-loss records, and BYE-week analysis for top powerhouses nationwide.

• INSTANT DEVICE SYNC & HD BRACKET EXPORTS
Sync predictions instantly between your iPhone, iPad, and desktop with offline client-side QR codes. Export 1200x675 HD tournament graphics with 1-click sharing to iMessage, WhatsApp, and social feeds.

Take control of the 2026 college football season with CFB Prophet!
```

---

## 🔗 4. URLs & Legal

- **Support URL**: `https://jajo9147.github.io/cfb-football-predictor/`
- **Marketing URL**: `https://jajo9147.github.io/cfb-football-predictor/`
- **Privacy Policy URL**: `https://jajo9147.github.io/cfb-football-predictor/`

---

## 🚀 5. How to Build & Submit to the App Store

### Step 1: Open in Xcode
Double click to open the project in Xcode:
```bash
open ios/CFBProphet.xcodeproj
```

### Step 2: Configure Your Apple Developer Team
1. In Xcode, select the root project `CFBProphet` in the left sidebar.
2. Go to **Signing & Capabilities**.
3. Under **Team**, select your Apple Developer Account.
4. Set your unique Bundle Identifier (e.g. `com.yourname.cfbprophet`).

### Step 3: Test on Simulator or Device
1. Select any iPhone Simulator (e.g. iPhone 16 Pro) or your connected physical iPhone in the top toolbar.
2. Press **`Cmd + R`** to build and run.

### Step 4: Archive and Upload to App Store Connect
1. In Xcode's top menu, select **Product** -> **Destination** -> **Any iOS Device (arm64)**.
2. Select **Product** -> **Archive**.
3. Once the archive completes in the Organizer window, click **Distribute App** -> **App Store Connect** -> **Upload**.
4. Log into [App Store Connect](https://appstoreconnect.apple.com), create a new iOS App with your Bundle ID, paste the metadata from this file, and submit for Review!
