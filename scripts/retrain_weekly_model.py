#!/usr/bin/env python3
"""
CFB Prophet - Weekly Model Retraining & Calibration Engine (Enhanced)
Ingests completed game scores & boxscores from ESPN, advanced EPA/PPA metrics
and 247Sports Talent Composite from CollegeFootballData (CFBD),
computes Bayesian team rating updates to minimize prediction residual error,
and re-projects remaining regular-season schedules with non-linear blowout calibration.
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

# Import CFBD Client & Monte Carlo Engine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import cfbd_client
except ImportError:
    cfbd_client = None

try:
    import monte_carlo_engine
except ImportError:
    monte_carlo_engine = None

ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
ESPN_RANKINGS_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings"

ESPN_ID_TO_TEAM_ID = {
    333: 'alabama', 12: 'arizona', 9: 'arizonastate', 68: 'boisestate', 252: 'byu',
    228: 'clemson', 38: 'colorado', 52: 'floridastate', 61: 'georgia', 248: 'houston',
    84: 'indiana', 2294: 'iowa', 97: 'louisville', 99: 'lsu', 2390: 'miami',
    130: 'michigan', 142: 'missouri', 87: 'notredame', 194: 'ohiostate', 201: 'oklahoma',
    145: 'olemiss', 2483: 'oregon', 213: 'pennstate', 2567: 'smu', 2633: 'tennessee',
    251: 'texas', 245: 'texasam', 2641: 'texastech', 30: 'usc', 254: 'utah', 264: 'washington'
}

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

def fetch_espn_ap_rankings():
    url = ESPN_RANKINGS_URL
    try:
        import subprocess
        res = subprocess.run(['curl', '-s', '-H', 'Accept: application/json', url], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if res.returncode == 0 and res.stdout:
            data = json.loads(res.stdout.decode('utf-8'))
            ap_poll = next((rk for rk in data.get('rankings', []) if 'AP' in rk.get('name', '')), None)
            return ap_poll
    except Exception as e:
        print(f"Notice: ESPN Rankings API fetch warning: {e}")
    return None

def normalize_name(name):
    return re.sub(r'[^a-z0-9]', '', (name or '').lower())

def match_team_in_db(db, name_or_abbr):
    norm = normalize_name(name_or_abbr)
    for tid, t in db.items():
        if norm == normalize_name(tid) or norm == normalize_name(t.get('name')) or norm == normalize_name(t.get('shortName')) or norm == normalize_name(t.get('abbr')):
            return tid
    return None

def calculate_win_prob_from_margin(margin):
    k = 0.125
    prob = 1.0 / (1.0 + math.exp(-k * margin))
    return int(round(prob * 100))

def main():
    parser = argparse.ArgumentParser(description="Retrain CFB Prophet weekly models against actual scores & Vegas consensus lines.")
    parser.add_argument('--dry-run', action='store_true', help="Compute adjustments without modifying database files.")
    parser.add_argument('--dates', nargs='*', help="Specific dates in YYYYMMDD format to ingest.")
    args = parser.parse_args()

    print("=" * 70)
    print("🏈 CFB PROPHET — ENHANCED WEEKLY MODEL RETRAINING ENGINE")
    print("=" * 70)

    db = load_teams_file(TEAMS_FILE)
    print(f"Loaded {len(db)} teams from {TEAMS_FILE}")

    # Load CFBD Analytics Feeds (Strictly 2026 Official Season Data)
    talent_map = {}
    sp_map_2026 = {}
    adv_stats_w1 = {}
    if cfbd_client:
        try:
            talent_map = cfbd_client.get_team_talent_composite(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(talent_map)} teams with 2026 247Sports Talent Composite")
            sp_map_2026 = cfbd_client.get_sp_ratings(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(sp_map_2026)} teams with 2026 Official SP+ Ratings")
            adv_stats_w1 = cfbd_client.get_week_advanced_game_stats(2026, 1)
            print(f"🔥 CFBD Ingestion: Loaded {len(adv_stats_w1)} advanced EPA/PPA boxscores for 2026 Week 1")
        except Exception as e:
            print(f"Notice: CFBD loading warning: {e}")

    # 0. Ingest Live AP Top 25 Poll & Others Receiving Votes
    print("\n🏆 INGESTING OFFICIAL AP TOP 25 POLL...")
    ap_poll = fetch_espn_ap_rankings()
    ranking_updates = {}
    if ap_poll:
        ranks = ap_poll.get('ranks', [])
        others = ap_poll.get('others', [])
        print(f"  • Retrieved AP Poll with {len(ranks)} ranked teams & {len(others)} others receiving votes")

        for r in ranks:
            eid = int(r.get('team', {}).get('id', 0))
            tid = ESPN_ID_TO_TEAM_ID.get(eid)
            cur = r.get('current')
            pts = int(r.get('points', 0))
            first = r.get('firstPlaceVotes', 0)
            pts_str = f"{pts:,} PTS"
            if first > 0:
                pts_str += f" ({first} 1st)"
            if tid and tid in db:
                ranking_updates[tid] = {
                    'apRank': f"#{cur} AP",
                    'apPoints': pts_str,
                    'rankNum': cur
                }

        for o in others:
            eid = int(o.get('team', {}).get('id', 0))
            tid = ESPN_ID_TO_TEAM_ID.get(eid)
            pts = int(o.get('points', 0))
            if tid and tid in db and tid not in ranking_updates:
                ranking_updates[tid] = {
                    'apRank': 'RV',
                    'apPoints': f"{pts:,} PTS",
                    'rankNum': 99
                }

        # Apply rankings to teams in DB
        ap_changes_count = 0
        for tid, t in db.items():
            old_rank = t.get('apRank', 'NR')
            if tid in ranking_updates:
                new_rank = ranking_updates[tid]['apRank']
                new_pts = ranking_updates[tid]['apPoints']
            else:
                new_rank = 'NR'
                new_pts = ''

            if old_rank != new_rank:
                ap_changes_count += 1
                print(f"  • {t.get('shortName', tid):<14} AP Rank: {old_rank} → {new_rank} ({new_pts})")

            if not args.dry_run:
                t['apRank'] = new_rank
                t['apPoints'] = new_pts

        # Update opponent rankings in schedules for unplayed games
        opp_rank_updates_count = 0
        for tid, t in db.items():
            for g in t.get('schedule', []):
                if g.get('isFinal'):
                    continue
                opp_id = g.get('oppId')
                matched_tid = opp_id if (opp_id and opp_id in db) else match_team_in_db(db, g.get('opponent') or g.get('oppAbbr'))
                if matched_tid and matched_tid in db:
                    opp_ap = db[matched_tid].get('apRank', 'NR')
                    if g.get('oppRank') != opp_ap:
                        if not args.dry_run:
                            g['oppRank'] = opp_ap
                        opp_rank_updates_count += 1

        print(f"  • Updated AP rankings for {ap_changes_count} teams, adjusted {opp_rank_updates_count} future schedule matchup badges.")
    else:
        print("  • Notice: AP Poll data could not be fetched from ESPN. Retaining existing rankings.")

    # Dates to scan
    target_dates = args.dates
    if not target_dates:
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

    team_performances = {}

    for g in all_completed_games:
        tid = g['teamId']
        actual_margin = g['teamScore'] - g['oppScore']
        actual_total = g['teamScore'] + g['oppScore']

        proj_margin = g['projUt'] - g['projOpp']
        proj_total = g['projUt'] + g['projOpp']

        vegas_margin = -g['vegasSpread']
        vegas_total = g['overUnder']

        model_err = abs(proj_margin - actual_margin)
        vegas_err = abs(vegas_margin - actual_margin)

        model_margin_errors.append(model_err)
        vegas_margin_errors.append(vegas_err)

        if model_err < vegas_err:
            model_beats_vegas_count += 1
        total_evaluated += 1

        # Composite performance delta: Incorporates score margin plus EPA efficiency
        perf_delta = actual_margin - proj_margin
        
        # Check EPA bonus from CFBD
        team_short = db[tid].get('shortName', '').lower()
        if team_short in adv_stats_w1:
            team_ppa = adv_stats_w1[team_short].get('offense', {}).get('ppa', 0.0)
            if team_ppa and team_ppa > 0.25:
                perf_delta += (team_ppa - 0.25) * 15.0 # Reward hyper-efficient offenses

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
    ALPHA = 0.12
    rating_shifts = {}

    print("\n📈 RETRAINED TEAM POWER RATINGS (BAYESIAN ADJUSTMENT + EPA):")
    for tid, deltas in team_performances.items():
        t = db[tid]
        old_rating = float(t.get('baseSpRating', 22.0))
        avg_delta = sum(deltas) / len(deltas)
        raw_adjustment = avg_delta * ALPHA
        clamped_adjustment = max(-2.5, min(2.5, raw_adjustment))
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

    # 5. Re-project Future Unplayed Games (With Talent Blowout Multiplier & Market Anchoring)
    unplayed_games_recalculated = 0
    blowout_games_calibrated = 0

    for tid, t in db.items():
        sp_team = float(t.get('baseSpRating', 22.0))
        team_name = t.get('name', '').lower()
        fav_talent = talent_map.get(team_name, talent_map.get(t.get('shortName', '').lower(), 750.0))

        for g in t.get('schedule', []):
            if g.get('isFinal'):
                continue

            # Determine opponent SP+ & talent
            opp_id = g.get('oppId')
            opp_talent = 420.0
            if opp_id and opp_id in db:
                sp_opp = float(db[opp_id].get('baseSpRating', 22.0))
                opp_name = db[opp_id].get('name', '').lower()
                opp_talent = talent_map.get(opp_name, talent_map.get(db[opp_id].get('shortName', '').lower(), 650.0))
            elif g.get('oppRank') == 'FCS':
                sp_opp = -14.0
                opp_talent = 180.0
            else:
                opp_name = (g.get('opponent') or '').lower()
                power4_keywords = ['sec', 'big ten', 'big 12', 'acc', 'notre dame']
                is_power = any(kw in opp_name for kw in power4_keywords)
                sp_opp = 13.0 if is_power else 4.5
                opp_talent = 620.0 if is_power else 380.0

            stadium = g.get('stadium', '')
            hfa = 0.0
            if g.get('isHome', True):
                hfa = STADIUM_HFA.get(stadium, 2.5)
            else:
                hfa = -STADIUM_HFA.get(stadium, 2.5)

            # Talent Gap Blowout Bonus
            talent_bonus = 0.0
            if cfbd_client:
                if sp_team >= sp_opp:
                    talent_bonus = cfbd_client.calculate_talent_blowout_bonus(fav_talent, opp_talent)
                else:
                    talent_bonus = -cfbd_client.calculate_talent_blowout_bonus(opp_talent, fav_talent)

            raw_margin = (sp_team - sp_opp) + hfa + talent_bonus

            # Consensus Market Anchoring: If Vegas spread exists, blend 60% model + 40% Vegas line
            vegas_spread = g.get('vegasSpread')
            if isinstance(vegas_spread, (int, float)):
                vegas_margin = -vegas_spread
                projected_margin = round(0.60 * raw_margin + 0.40 * vegas_margin, 1)
            else:
                projected_margin = round(raw_margin, 1)

            base_total = float(g.get('overUnder', 55.0))

            if monte_carlo_engine:
                mc_sim = monte_carlo_engine.simulate_matchup_10k(
                    team_a_name=t.get('shortName', tid),
                    team_b_name=g.get('oppAbbr') or g.get('opponent', 'OPP'),
                    sp_a=sp_team,
                    sp_b=sp_opp,
                    talent_a=fav_talent,
                    talent_b=opp_talent,
                    is_home_a=g.get('isHome', True),
                    hfa_pts=STADIUM_HFA.get(stadium, 2.5),
                    vegas_spread=vegas_spread,
                    vegas_total=base_total,
                    iterations=2500
                )
                adj_ut_score = mc_sim['projScoreA']
                adj_opp_score = mc_sim['projScoreB']
                win_prob = int(round(mc_sim['winProbA']))
                if abs(adj_ut_score - adj_opp_score) >= 28:
                    blowout_games_calibrated += 1

                if not args.dry_run:
                    g['projScoreUt'] = adj_ut_score
                    g['projScoreOpp'] = adj_opp_score
                    g['baseWinProb'] = win_prob
                    g['mcCoverProb'] = mc_sim['coverProbA']
                    g['mcOverProb'] = mc_sim['overProb']
                    g['mcRecommendedAts'] = mc_sim['recommendedAts']
                    g['mcRecommendedOu'] = mc_sim['recommendedOu']
                    g['mcScoreDistUt'] = mc_sim['scoreDistributionA']
                    g['mcScoreDistOpp'] = mc_sim['scoreDistributionB']
            else:
                # Non-linear scoring distribution for blowouts fallback
                if projected_margin >= 28.0:
                    blowout_games_calibrated += 1
                    adj_opp_score = max(0, min(14, int(round(12.0 - (projected_margin - 28.0) * 0.25))))
                    adj_ut_score = int(round(adj_opp_score + projected_margin))
                elif projected_margin <= -28.0:
                    blowout_games_calibrated += 1
                    adj_ut_score = max(0, min(14, int(round(12.0 - (abs(projected_margin) - 28.0) * 0.25))))
                    adj_opp_score = int(round(adj_ut_score + abs(projected_margin)))
                else:
                    adj_ut_score = max(6, int(round((base_total + projected_margin) / 2.0)))
                    adj_opp_score = max(3, int(round((base_total - projected_margin) / 2.0)))

                win_prob = calculate_win_prob_from_margin(projected_margin)

                if not args.dry_run:
                    g['projScoreUt'] = adj_ut_score
                    g['projScoreOpp'] = adj_opp_score
                    g['baseWinProb'] = win_prob
            
            unplayed_games_recalculated += 1

    print(f"\n🔮 Re-projected {unplayed_games_recalculated} future regular-season games with updated power ratings!")
    print(f"🚀 Applied Non-Linear Blowout Calibration to {blowout_games_calibrated} mismatch games!")

    # 6. Save Retrained Databases & Calibration Ledger
    if not args.dry_run:
        save_teams_file(TEAMS_FILE, db)
        save_teams_file(TEAMS_V3_FILE, db)
        print(f"💾 Updated: {TEAMS_FILE}")
        print(f"💾 Updated: {TEAMS_V3_FILE}")

        ios_teams = os.path.join(ROOT_DIR, 'ios', 'CFBProphet', 'www', 'data', 'teams.js')
        ios_teams_v3 = os.path.join(ROOT_DIR, 'ios', 'CFBProphet', 'www', 'data', 'teams_v3.js')
        if os.path.exists(os.path.dirname(ios_teams)):
            save_teams_file(ios_teams, db)
            save_teams_file(ios_teams_v3, db)
            print(f"💾 Updated iOS bundle: {ios_teams}")

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
                'unplayedGamesRecalculated': unplayed_games_recalculated,
                'blowoutGamesCalibrated': blowout_games_calibrated
            })

            with open(CALIBRATION_FILE, 'w', encoding='utf-8') as f:
                json.dump(calib, f, indent=2)
            print(f"💾 Updated Retraining Ledger: {CALIBRATION_FILE}")
    else:
        print("\n🔍 DRY-RUN MODE: No files modified.")

    print("\n✅ RETRAINING PIPELINE RUN COMPLETE.")

if __name__ == '__main__':
    main()
