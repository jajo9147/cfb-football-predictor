#!/usr/bin/env python3
"""
CFB Prophet - Weekly Model Retraining & Calibration Engine
Ingests completed game scores from ESPN, compares model projections against Las Vegas lines,
computes Bayesian team rating updates to minimize prediction residual error,
and re-projects remaining regular-season schedules.
"""

import sys
import os
import re
import json
import math
import datetime
import urllib.request
import argparse

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAMS_FILE = os.path.join(ROOT_DIR, 'data', 'teams.js')
TEAMS_V3_FILE = os.path.join(ROOT_DIR, 'data', 'teams_v3.js')
CALIBRATION_FILE = os.path.join(ROOT_DIR, 'archive', 'model_calibration.json')

ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"

# Stadium Home Field Advantage mapping (points)
STADIUM_HFA = {
    "Los Angeles Memorial Coliseum": 3.0,
    "Sanford Stadium": 4.0,
    "Darrell K Royal-Texas Memorial Stadium": 3.5,
    "Ohio Stadium": 4.0,
    "Tiger Stadium": 4.5,
    "Autzen Stadium": 4.0,
    "Beaver Stadium": 4.0,
    "Kyle Field": 4.5,
    "Neyland Stadium": 4.5,
    "Bryant-Denny Stadium": 4.0,
    "Rice-Eccles Stadium": 4.0,
    "Folsom Field": 3.5,
    "Bobby Dodd Stadium": 2.5,
    "Memorial Stadium": 3.0,
    "Husky Stadium": 3.5
}

def load_teams_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    match = re.search(r'var\s+TEAMS_DATABASE\s*=\s*(\{[\s\S]*?\});\s*(?:if\s*\(typeof module|\Z)', content)
    if not match:
        raise ValueError(f"Could not locate TEAMS_DATABASE in {filepath}")
    return json.loads(match.group(1))

def save_teams_file(filepath, db):
    json_formatted = json.dumps(db, indent=2)
    prefix = ""
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            orig = f.read()
        idx = orig.find('var TEAMS_DATABASE = ')
        if idx != -1:
            prefix = orig[:idx]
    footer = ";\n\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = TEAMS_DATABASE;\n}\n"
    content = prefix + "var TEAMS_DATABASE = " + json_formatted + footer
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def fetch_espn_scoreboard(date_str=None):
    url = ESPN_SCOREBOARD_URL
    if date_str:
        url += f"?dates={date_str}"
    
    # Try via curl subprocess first as ESPN blocks standard python user agents
    try:
        import subprocess
        res = subprocess.run(['curl', '-s', '-H', 'Accept: application/json', url], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if res.returncode == 0 and res.stdout:
            data = json.loads(res.stdout.decode('utf-8'))
            return data.get('events', [])
    except Exception:
        pass

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.espn.com/'
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('events', [])
    except Exception as e:
        print(f"Notice: ESPN Scoreboard API fetch error for {date_str}: {e}")
        return []

def normalize_name(name):
    return re.sub(r'[^a-z0-9]', '', (name or '').lower())

def match_team_in_db(db, name_or_abbr):
    norm = normalize_name(name_or_abbr)
    for tid, t in db.items():
        if norm == normalize_name(tid) or norm == normalize_name(t.get('name')) or norm == normalize_name(t.get('shortName')) or norm == normalize_name(t.get('abbr')):
            return tid
    return None

def calculate_win_prob_from_margin(margin):
    # Logistic function parameterized so a 7-point margin corresponds to ~70% win prob
    k = 0.125
    prob = 1.0 / (1.0 + math.exp(-k * margin))
    return int(round(prob * 100))

def main():
    parser = argparse.ArgumentParser(description="Retrain CFB Prophet weekly models against actual scores & Vegas consensus lines.")
    parser.add_argument('--dry-run', action='store_true', help="Compute adjustments without modifying database files.")
    parser.add_argument('--dates', nargs='*', help="Specific dates in YYYYMMDD format to ingest (e.g. 20260829 20260903 20260904 20260905).")
    args = parser.parse_args()

    print("=" * 70)
    print("🏈 CFB PROPHET — WEEKLY MODEL RETRAINING & CALIBRATION ENGINE")
    print("=" * 70)

    db = load_teams_file(TEAMS_FILE)
    print(f"Loaded {len(db)} teams from {TEAMS_FILE}")

    # Dates to scan for the current season if not explicitly passed
    target_dates = args.dates
    if not target_dates:
        # Scan Week 0 and Week 1 default calendar
        target_dates = ['20260829', '20260903', '20260904', '20260905', '20260906', '20260907']

    all_completed_games = []
    
    # 1. Ingest completed games already marked in TEAMS_DATABASE
    for tid, t in db.items():
        for g in t.get('schedule', []):
            if g.get('isFinal') and isinstance(g.get('actualScoreUt'), (int, float)) and isinstance(g.get('actualScoreOpp'), (int, float)):
                opp_id = match_team_in_db(db, g.get('opponent')) or match_team_in_db(db, g.get('oppAbbr'))
                all_completed_games.append({
                    'teamId': tid,
                    'oppId': opp_id,
                    'gameId': g.get('id'),
                    'teamScore': int(g['actualScoreUt']),
                    'oppScore': int(g['actualScoreOpp']),
                    'projUt': g.get('projScoreUt', 24),
                    'projOpp': g.get('projScoreOpp', 21),
                    'vegasSpread': g.get('vegasSpread', -3.5),
                    'overUnder': g.get('overUnder', 55.0),
                    'isHome': g.get('isHome', True),
                    'stadium': g.get('stadium', '')
                })

    # 2. Ingest live games from ESPN
    for d_str in target_dates:
        events = fetch_espn_scoreboard(d_str)
        for ev in events:
            status = ev.get('status', {}).get('type', {})
            if not status.get('completed', False):
                continue
            comps = ev.get('competitions', [{}])[0]
            competitors = comps.get('competitors', [])
            if len(competitors) != 2:
                continue

            c1, c2 = competitors[0], competitors[1]
            t1_name = c1.get('team', {}).get('displayName', '')
            t2_name = c2.get('team', {}).get('displayName', '')
            score1 = int(c1.get('score', 0))
            score2 = int(c2.get('score', 0))

            t1_id = match_team_in_db(db, t1_name)
            t2_id = match_team_in_db(db, t2_name)

            if t1_id:
                # Check if already added
                if not any(cg.get('teamId') == t1_id and cg.get('teamScore') == score1 for cg in all_completed_games):
                    all_completed_games.append({
                        'teamId': t1_id,
                        'oppId': t2_id,
                        'gameId': f"espn-{ev.get('id')}",
                        'teamScore': score1,
                        'oppScore': score2,
                        'projUt': 24,
                        'projOpp': 21,
                        'vegasSpread': -3.5,
                        'overUnder': 55.0,
                        'isHome': c1.get('homeAway') == 'home',
                        'stadium': comps.get('venue', {}).get('fullName', '')
                    })

    print(f"\n📊 Settled Matchups Ingested for Analysis: {len(all_completed_games)}")

    # 3. Evaluate Model vs. Vegas Performance
    model_margin_errors = []
    vegas_margin_errors = []
    model_beats_vegas_count = 0
    total_evaluated = 0

    team_performances = {} # teamId -> list of performance differentials

    for g in all_completed_games:
        tid = g['teamId']
        actual_margin = g['teamScore'] - g['oppScore']
        actual_total = g['teamScore'] + g['oppScore']

        proj_margin = g['projUt'] - g['projOpp']
        proj_total = g['projUt'] + g['projOpp']

        vegas_margin = -g['vegasSpread'] # If Vegas is -7.5, Vegas expects team to win by 7.5
        vegas_total = g['overUnder']

        model_err = abs(proj_margin - actual_margin)
        vegas_err = abs(vegas_margin - actual_margin)

        model_margin_errors.append(model_err)
        vegas_margin_errors.append(vegas_err)

        if model_err < vegas_err:
            model_beats_vegas_count += 1
        total_evaluated += 1

        # Track team performance differential: Actual Margin vs. Expected Pre-Game Margin
        perf_delta = actual_margin - proj_margin
        if tid not in team_performances:
            team_performances[tid] = []
        team_performances[tid].append(perf_delta)

    avg_model_mae = round(sum(model_margin_errors) / max(1, total_evaluated), 2) if total_evaluated > 0 else 0
    avg_vegas_mae = round(sum(vegas_margin_errors) / max(1, total_evaluated), 2) if total_evaluated > 0 else 0
    beat_vegas_pct = round((model_beats_vegas_count / max(1, total_evaluated)) * 100, 1) if total_evaluated > 0 else 0

    print("\n🎯 MODEL VS. LAS VEGAS CONSENSUS BENCHMARK:")
    print(f"  • Model Mean Absolute Error (MAE): {avg_model_mae} pts")
    print(f"  • Vegas Consensus MAE:             {avg_vegas_mae} pts")
    print(f"  • Model Beat Vegas Rate:            {beat_vegas_pct}% ({model_beats_vegas_count}/{total_evaluated} games)")

    # 4. Bayesian SP+ Rating Updating
    # Learning rate (shrinkage factor) for early season: alpha = 0.12
    # Clamped between -2.0 and +2.0 to avoid fluke single-game overreactions
    ALPHA = 0.12
    rating_shifts = {}

    print("\n📈 RETRAINED TEAM POWER RATINGS (BAYESIAN ADJUSTMENT):")
    for tid, deltas in team_performances.items():
        t = db[tid]
        old_rating = float(t.get('baseSpRating', 22.0))
        avg_delta = sum(deltas) / len(deltas)
        raw_adjustment = avg_delta * ALPHA
        clamped_adjustment = max(-2.0, min(2.0, raw_adjustment))
        new_rating = round(old_rating + clamped_adjustment, 2)
        rating_shifts[tid] = {
            'old': old_rating,
            'new': new_rating,
            'delta': round(clamped_adjustment, 2)
        }
        sign = "+" if clamped_adjustment > 0 else ""
        print(f"  • {t.get('shortName', tid):<14} {old_rating:>5.1f}  →  {new_rating:>5.1f}  ({sign}{clamped_adjustment:.2f} pts)")
        if not args.dry_run:
            t['baseSpRating'] = new_rating

    # 5. Re-project Future Unplayed Games
    unplayed_games_recalculated = 0
    for tid, t in db.items():
        sp_team = float(t.get('baseSpRating', 22.0))
        for g in t.get('schedule', []):
            if g.get('isFinal'):
                continue # Do NOT alter completed official scores

            # Determine opponent SP+
            opp_id = g.get('oppId')
            if opp_id and opp_id in db:
                sp_opp = float(db[opp_id].get('baseSpRating', 22.0))
            elif g.get('oppRank') == 'FCS':
                sp_opp = -14.0
            else:
                opp_name = (g.get('opponent') or '').lower()
                power4_keywords = ['sec', 'big ten', 'big 12', 'acc', 'notre dame']
                is_power = any(kw in opp_name for kw in power4_keywords)
                sp_opp = 13.0 if is_power else 4.5

            stadium = g.get('stadium', '')
            hfa = 0.0
            if g.get('isHome', True):
                hfa = STADIUM_HFA.get(stadium, 2.5)
            else:
                hfa = -STADIUM_HFA.get(stadium, 2.5)

            projected_margin = (sp_team - sp_opp) + hfa
            base_total = float(g.get('overUnder', 55.0))

            adj_ut_score = max(6, int(round((base_total + projected_margin) / 2.0)))
            adj_opp_score = max(3, int(round((base_total - projected_margin) / 2.0)))
            win_prob = calculate_win_prob_from_margin(projected_margin)

            if not args.dry_run:
                g['projScoreUt'] = adj_ut_score
                g['projScoreOpp'] = adj_opp_score
                g['baseWinProb'] = win_prob
            
            unplayed_games_recalculated += 1

    print(f"\n🔮 Re-projected {unplayed_games_recalculated} future regular-season games with updated power ratings!")

    # 6. Save Retrained Databases & Calibration Ledger
    if not args.dry_run:
        save_teams_file(TEAMS_FILE, db)
        save_teams_file(TEAMS_V3_FILE, db)
        print(f"💾 Updated: {TEAMS_FILE}")
        print(f"💾 Updated: {TEAMS_V3_FILE}")

        # Update model_calibration.json
        if os.path.exists(CALIBRATION_FILE):
            with open(CALIBRATION_FILE, 'r', encoding='utf-8') as f:
                calib = json.load(f)
            if 'retrainingHistory' not in calib:
                calib['retrainingHistory'] = []

            now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
            calib['retrainingHistory'].append({
                'timestamp': now_utc,
                'gamesEvaluated': total_evaluated,
                'modelMae': avg_model_mae,
                'vegasMae': avg_vegas_mae,
                'modelBeatVegasPct': beat_vegas_pct,
                'ratingShifts': rating_shifts,
                'unplayedGamesRecalculated': unplayed_games_recalculated
            })

            with open(CALIBRATION_FILE, 'w', encoding='utf-8') as f:
                json.dump(calib, f, indent=2)
            print(f"💾 Updated Retraining Ledger: {CALIBRATION_FILE}")
    else:
        print("\n🔍 DRY-RUN MODE: No files modified.")

    print("\n✅ RETRAINING PIPELINE RUN COMPLETE.")

if __name__ == '__main__':
    main()
