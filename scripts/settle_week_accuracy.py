#!/usr/bin/env python3
"""
CFB Prophet - Post-Game Settlement & Brier Score Calculation Engine
Grades predictions against live final box scores, computes Brier scores, and updates model calibration.
"""

import json
import os
import urllib.request
import math
import datetime

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CALIBRATION_FILE = os.path.join(ROOT_DIR, 'archive', 'model_calibration.json')
ARCHIVE_DIR = os.path.join(ROOT_DIR, 'archive')

ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"

def fetch_espn_scores():
    try:
        import subprocess
        res = subprocess.run(['curl', '-s', '-H', 'Accept: application/json', ESPN_SCOREBOARD_URL], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if res.returncode == 0 and res.stdout:
            data = json.loads(res.stdout.decode('utf-8'))
            return data.get('events', [])
    except Exception:
        pass

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://www.espn.com/'
        }
        req = urllib.request.Request(ESPN_SCOREBOARD_URL, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('events', [])
    except Exception as e:
        print(f"Notice: ESPN Scoreboard API fetch: {e}")
        return []

def main():
    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    
    if not os.path.exists(CALIBRATION_FILE):
        print("Calibration file not found.")
        return
        
    with open(CALIBRATION_FILE, 'r', encoding='utf-8') as f:
        calib = json.load(f)

    # Load all finalized games dynamically from data/teams.js
    teams_file = os.path.join(ROOT_DIR, 'data', 'teams.js')
    settled_games = []
    if os.path.exists(teams_file):
        with open(teams_file, 'r', encoding='utf-8') as f:
            text = f.read()
        import re
        m = re.search(r'(?:var|const)\s+TEAMS_DATABASE\s*=\s*(\{[\s\S]*?\});\s*(?:if\s*\(typeof module|\Z)', text)
        if m:
            db = json.loads(m.group(1))
            seen_pairs = set()
            for tid, t in db.items():
                for g in t.get('schedule', []):
                    if not g.get('isFinal'):
                        continue
                    s_ut = g.get('actualScoreUt', g.get('finalTeamScore'))
                    s_opp = g.get('actualScoreOpp', g.get('finalOppScore'))
                    if s_ut is None or s_opp is None:
                        continue
                    
                    opp_id = g.get('oppId')
                    pair_key = tuple(sorted([tid, opp_id])) if opp_id else (tid, g.get('opponent'), g.get('date'))
                    if pair_key in seen_pairs:
                        continue
                    seen_pairs.add(pair_key)

                    prob = float(g.get('baseWinProb', 50)) / 100.0
                    is_win = int(s_ut) > int(s_opp)
                    spread = float(g.get('vegasSpread', -3.5))
                    margin = int(s_ut) - int(s_opp)
                    ats_cover = (margin > spread)

                    settled_games.append({
                        'week': g.get('week'),
                        'matchup': f"{t.get('name')} vs {g.get('opponent')}",
                        'pred': f"{t.get('shortName')} ({int(prob*100)}%)",
                        'prob': prob,
                        'actual': f"{s_ut} - {s_opp}",
                        'spread': spread,
                        'ats': 'Covered' if ats_cover else 'Loss',
                        'isWin': is_win,
                        'scoreFav': max(int(s_ut), int(s_opp)),
                        'scoreDog': min(int(s_ut), int(s_opp))
                    })

    # Compute Brier Score & Accuracy Metrics
    n = len(settled_games)
    total_brier = 0.0
    total_log_loss = 0.0
    straight_up_wins = 0
    ats_wins = 0

    bins = [
        {"binRange": "50% - 60%", "min": 0.50, "max": 0.60, "predSum": 0.0, "actualWins": 0, "sampleSize": 0},
        {"binRange": "60% - 70%", "min": 0.60, "max": 0.70, "predSum": 0.0, "actualWins": 0, "sampleSize": 0},
        {"binRange": "70% - 80%", "min": 0.70, "max": 0.80, "predSum": 0.0, "actualWins": 0, "sampleSize": 0},
        {"binRange": "80% - 90%", "min": 0.80, "max": 0.90, "predSum": 0.0, "actualWins": 0, "sampleSize": 0},
        {"binRange": "90% - 99%", "min": 0.90, "max": 1.00, "predSum": 0.0, "actualWins": 0, "sampleSize": 0}
    ]

    for g in settled_games:
        p = g["prob"]
        y = 1.0 if g["isWin"] else 0.0
        
        brier = (p - y) ** 2
        total_brier += brier
        g["brier"] = f"{brier:.3f}"
        
        # Log Loss clamped between 0.01 and 0.99
        p_clamped = max(0.01, min(0.99, p))
        ll = -(y * math.log(p_clamped) + (1.0 - y) * math.log(1.0 - p_clamped))
        total_log_loss += ll
        
        if g["isWin"]:
            straight_up_wins += 1
        if "Covered" in g.get("ats", "") or g.get("ats") == "Settled":
            ats_wins += 1

        for b in bins:
            if b["min"] <= p < b["max"] or (b["max"] == 1.00 and p >= b["min"]):
                b["predSum"] += p
                b["sampleSize"] += 1
                if g["isWin"]:
                    b["actualWins"] += 1
                break

    avg_brier = round(total_brier / max(1, n), 3)
    avg_log_loss = round(total_log_loss / max(1, n), 3)
    straight_up_pct = round((straight_up_wins / max(1, n)) * 100, 1)
    ats_pct = round((ats_wins / max(1, n)) * 100, 1)

    calib_bins_out = []
    for b in bins:
        count = max(1, b["sampleSize"])
        pred_avg = round((b["predSum"] / count) * 100, 1) if b["sampleSize"] > 0 else (b["min"] + 0.05) * 100
        actual_freq = round((b["actualWins"] / count) * 100, 1) if b["sampleSize"] > 0 else pred_avg
        calib_bins_out.append({
            "binRange": b["binRange"],
            "predictedProbAvg": pred_avg,
            "actualWinFreq": actual_freq,
            "sampleSize": b["sampleSize"]
        })

    now = datetime.datetime.now(datetime.timezone.utc)
    calib["updatedAt"] = now.isoformat()
    calib["overallStats"] = {
        "totalGames": n,
        "straightUpWins": straight_up_wins,
        "straightUpLosses": n - straight_up_wins,
        "straightUpPct": straight_up_pct,
        "atsWins": ats_wins,
        "atsLosses": n - ats_wins,
        "atsPct": ats_pct,
        "brierScore": avg_brier,
        "brierGrade": "Elite (< 0.100)" if avg_brier < 0.100 else ("Good (< 0.150)" if avg_brier < 0.150 else "Calibrating"),
        "logLoss": avg_log_loss
    }
    calib["calibrationBins"] = calib_bins_out
    calib["settledLedger"] = settled_games

    with open(CALIBRATION_FILE, 'w', encoding='utf-8') as f:
        json.dump(calib, f, indent=2)

    print(f"✅ Settle Complete! Total Games: {n}")
    print(f"📊 Brier Score: {avg_brier} ({calib['overallStats']['brierGrade']})")
    print(f"🎯 Straight-Up Accuracy: {straight_up_pct}% ({straight_up_wins}-{n-straight_up_wins})")
    print(f"💰 ATS Cover Accuracy: {ats_pct}% ({ats_wins}-{n-ats_wins})")
    print(f"💾 Updated: {CALIBRATION_FILE}")

if __name__ == '__main__':
    main()
