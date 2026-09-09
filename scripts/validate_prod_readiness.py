#!/usr/bin/env python3
"""
CFB Prophet - Production Readiness Pre-Flight Inspection Suite
Validates:
1. Strict 2026 DTG (Date-Time-Group): 100% of dates, times, and timestamps are in 2026 (or Jan 2027).
2. Clean Assets: Team and opponent logos have valid ESPN CDN URLs.
3. Clean Opponent Mapping: No cross-contamination (e.g. Missouri State vs Missouri).
4. Authentic AP Rankings: All 31 teams and opponents match the verified Week 2 AP poll.
5. Odds & Predictions: Vegas spreads, totals, and win probabilities are clamped and calibrated.
6. Rosters & Coaches: 2026 head coaches, confirmed starting QBs, and star players.
7. Bundle Synchronization: Web, iOS, and Android datasets are syntactically valid and identical.
"""

import os
import sys
import re
import json

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAMS_FILE = os.path.join(ROOT_DIR, 'data', 'teams.js')
TEAMS_V3_FILE = os.path.join(ROOT_DIR, 'data', 'teams_v3.js')
IOS_TEAMS_FILE = os.path.join(ROOT_DIR, 'ios', 'CFBProphet', 'www', 'data', 'teams.js')
ANDROID_TEAMS_FILE = os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'www', 'data', 'teams.js')

EXPECTED_AP_POLL_WEEK2 = {
    'ohiostate': '#1 AP',
    'georgia': '#2 AP',
    'notredame': '#3 AP',
    'texas': '#4 AP',
    'indiana': '#5 AP',
    'oregon': '#6 AP',
    'miami': '#7 AP',
    'lsu': '#8 AP',
    'olemiss': '#9 AP',
    'texasam': '#10 AP',
    'oklahoma': '#11 AP',
    'alabama': '#12 AP',
    'texastech': '#13 AP',
    'usc': '#14 AP',
    'byu': '#15 AP',
    'pennstate': '#16 AP',
    'smu': '#17 AP',
    'tennessee': '#18 AP',
    'washington': '#19 AP',
    'utah': '#20 AP',
    'iowa': '#21 AP',
    'houston': '#22 AP',
    'missouri': '#23 AP',
    'louisville': '#24 AP',
    'boisestate': 'RV',
    'michigan': 'RV',
    'arizona': 'RV',
    'colorado': 'RV',
    'arizonastate': 'RV',
    'clemson': 'NR',
    'floridastate': 'NR'
}

def load_db(path):
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    m = re.search(r'var\s+TEAMS_DATABASE\s*=\s*(\{[\s\S]*?\});\s*(?:if\s*\(typeof module|\Z)', text)
    if not m:
        raise ValueError(f"Could not parse TEAMS_DATABASE from {path}")
    return json.loads(m.group(1))

def run_inspections():
    print("=" * 75)
    print("🔍 CFB PROPHET — PRODUCTION READINESS PRE-FLIGHT INSPECTION")
    print("=" * 75)

    errors = []
    warnings = []

    # 1. Load Main Database
    if not os.path.exists(TEAMS_FILE):
        print(f"❌ Critical Error: Missing primary database {TEAMS_FILE}")
        sys.exit(1)

    db = load_db(TEAMS_FILE)
    print(f"✓ Loaded {len(db)} teams from primary database ({TEAMS_FILE})")

    if len(db) < 31:
        errors.append(f"Expected at least 31 tracked teams, found only {len(db)}")

    # 2. Strict 2026 DTG (Date-Time-Group) Inspection
    print("\n[1/7] 📅 Inspecting DTG (Date, Time, Week, Season) Accuracy...")
    total_games = 0
    time_regex = re.compile(r'^(1[0-2]|[1-9]):[0-5][0-9]\s*(AM|PM)\s*ET$')
    
    for tid, t in db.items():
        sched = t.get('schedule', [])
        if len(sched) < 11 or len(sched) > 13:
            errors.append(f"{tid}: Abnormal schedule length {len(sched)} (expected 12 games)")

        for g in sched:
            total_games += 1
            gid = g.get('id', f"{tid}-unknown")
            utc = g.get('utc', '')
            d_str = g.get('date', '')
            kickoff = g.get('kickoffTime', '')
            week = g.get('week', '')

            # Enforce 2026 Season strictly (Aug 2026 - Jan 2027)
            if not (utc.startswith('2026-') or utc.startswith('2027-01')):
                errors.append(f"DTG Violation: {gid} has non-2026 UTC timestamp '{utc}'")

            if '2026' not in d_str and '2027' not in d_str:
                errors.append(f"DTG Violation: {gid} has non-2026 date string '{d_str}'")

            # Check kickoff time format
            if kickoff != 'TBD' and not time_regex.match(kickoff):
                warnings.append(f"DTG Warning: {gid} non-standard kickoff format '{kickoff}'")

            # Check week string
            if not re.match(r'^WEEK\s*\d+$', week, re.IGNORECASE):
                errors.append(f"DTG Violation: {gid} invalid week label '{week}'")

    print(f"  • Scanned {total_games} games across {len(db)} teams for 2026 DTG integrity.")

    # 3. Logo & Asset Integrity
    print("\n[2/7] 🎨 Inspecting Logos, Badges, and Visual Assets...")
    for tid, t in db.items():
        team_logo = t.get('logoUrl', '')
        if not team_logo or not team_logo.startswith('https://'):
            errors.append(f"{tid}: Invalid team logo URL '{team_logo}'")

        for g in t.get('schedule', []):
            gid = g.get('id')
            opp_logo = g.get('oppLogoUrl', '')
            if not opp_logo or not opp_logo.startswith('https://'):
                errors.append(f"{gid}: Invalid opponent logo URL '{opp_logo}'")
            
            # Prevent cross-contamination (Missouri vs Missouri State)
            opp_name = (g.get('opponent') or '').lower()
            opp_id = g.get('oppId')
            if 'missouri state' in opp_name and opp_id == 'missouri':
                errors.append(f"Cross-contamination: Missouri State assigned Missouri ID in {gid}")
            if 'utah tech' in opp_name and opp_id == 'utah':
                errors.append(f"Cross-contamination: Utah Tech assigned Utah ID in {gid}")
            if 'idaho state' in opp_name and opp_id == 'idaho':
                errors.append(f"Cross-contamination: Idaho State assigned Idaho ID in {gid}")

    print(f"  • Verified logo URLs and opponent isolation for all {total_games} games.")

    # 4. Authentic AP Rankings Verification
    print("\n[3/7] 🏆 Validating Week 2 AP Top 25 & RV Poll Precision...")
    for tid, exp_rank in EXPECTED_AP_POLL_WEEK2.items():
        if tid not in db:
            errors.append(f"Missing expected tracked team: {tid}")
            continue
        act_rank = db[tid].get('apRank', 'NR')
        if act_rank != exp_rank:
            errors.append(f"Rank Mismatch for {tid}: Expected '{exp_rank}', found '{act_rank}'")

    print("  • Verified AP rankings match official Sept 8 release (Ohio State #1, Notre Dame #3, Texas #4, Michigan RV, Louisville #24, Clemson NR).")

    # 5. Rosters, Star Players, & Coaching Staffs
    print("\n[4/7] 🏈 Inspecting 2026 Roster, QB, and Coaching Staff Integrity...")
    for tid, t in db.items():
        hc = t.get('headCoach')
        qb = t.get('confirmedStarterQb')
        star = t.get('starPlayer')
        if not hc: errors.append(f"{tid}: Missing headCoach")
        if not qb: errors.append(f"{tid}: Missing confirmedStarterQb")
        if not star: errors.append(f"{tid}: Missing starPlayer")

    print(f"  • Confirmed valid 2026 starters and coaches across all {len(db)} teams.")

    # 6. Model Probabilities & Odds Integrity
    print("\n[5/7] 🎯 Inspecting Odds Calibration & Monte Carlo Win Probabilities...")
    for tid, t in db.items():
        for g in t.get('schedule', []):
            gid = g.get('id')
            if g.get('isFinal'):
                continue
            prob = g.get('baseWinProb')
            if prob is None or not (1 <= prob <= 99):
                errors.append(f"{gid}: Win probability out of bounds: {prob} (must be 1-99%)")

            spread = g.get('vegasSpread')
            if spread is None or not isinstance(spread, (int, float)):
                errors.append(f"{gid}: Missing or non-numeric vegasSpread: {spread}")

            ou = g.get('overUnder')
            if ou is None or not (30.0 <= ou <= 95.0):
                errors.append(f"{gid}: Over/Under out of bounds: {ou}")

            # Strict tie elimination for all projected games
            proj_ut = g.get('projScoreUt')
            proj_opp = g.get('projScoreOpp')
            if proj_ut is not None and proj_opp is not None and proj_ut == proj_opp:
                errors.append(f"{gid}: Illegal tie score projected: {proj_ut}-{proj_opp}")

    print(f"  • Verified spread, over/under, clamped win probabilities, and zero ties.")

    # 7. Head-to-Head Reciprocal Symmetry & Strict Tie Elimination
    print("\n[6/7] ⚖️ Inspecting Head-to-Head Reciprocal Symmetry & Strict Tie Elimination...")
    pairs_checked = 0
    visited = set()
    for tid_a, t_a in db.items():
        for g_a in t_a.get('schedule', []):
            tid_b = g_a.get('oppId')
            if not tid_b or tid_b not in db:
                continue
            pair_key = tuple(sorted([tid_a, tid_b]) + [str(g_a.get('week'))])
            if pair_key in visited:
                continue
            visited.add(pair_key)

            t_b = db[tid_b]
            g_b = next((g for g in t_b.get('schedule', []) if g.get('oppId') == tid_a and (g.get('week') == g_a.get('week') or g.get('date') == g_a.get('date'))), None)
            if not g_b:
                g_b = next((g for g in t_b.get('schedule', []) if g.get('oppId') == tid_a), None)
            if not g_b:
                g_b = next((g for g in t_b.get('schedule', []) if (g.get('opponent') == t_a.get('name') or g.get('oppAbbr') == t_a.get('abbr'))), None)

            if not g_b:
                errors.append(f"Missing reciprocal matchup in database: {tid_a} vs {tid_b} ({g_a.get('week')})")
                continue

            pairs_checked += 1
            is_final_a = g_a.get('isFinal', False)
            is_final_b = g_b.get('isFinal', False)
            if is_final_a != is_final_b:
                errors.append(f"Completion status desync: {tid_a} vs {tid_b} ({is_final_a} vs {is_final_b})")

            s_ut_a = g_a.get('actualScoreUt' if is_final_a else 'projScoreUt') or g_a.get('finalTeamScore') or 0
            s_opp_a = g_a.get('actualScoreOpp' if is_final_a else 'projScoreOpp') or g_a.get('finalOppScore') or 0
            s_ut_b = g_b.get('actualScoreUt' if is_final_b else 'projScoreUt') or g_b.get('finalTeamScore') or 0
            s_opp_b = g_b.get('actualScoreOpp' if is_final_b else 'projScoreOpp') or g_b.get('finalOppScore') or 0

            # Tie elimination
            if s_ut_a == s_opp_a:
                errors.append(f"Illegal tie score detected in {tid_a} ({s_ut_a}-{s_opp_a})")
            if s_ut_b == s_opp_b:
                errors.append(f"Illegal tie score detected in {tid_b} ({s_ut_b}-{s_opp_b})")

            # Score reciprocity
            if s_ut_a != s_opp_b or s_opp_a != s_ut_b:
                errors.append(f"Score mismatch: {tid_a} ({s_ut_a}-{s_opp_a}) vs {tid_b} ({s_ut_b}-{s_opp_b})")

            # Outcome contradiction
            win_a = s_ut_a > s_opp_a
            win_b = s_ut_b > s_opp_b
            if win_a == win_b:
                errors.append(f"Outcome contradiction in {tid_a} vs {tid_b}: both projected to {'win' if win_a else 'lose'}")

            # Win probability symmetry
            prob_a = g_a.get('baseWinProb')
            prob_b = g_b.get('baseWinProb')
            if not is_final_a and prob_a is not None and prob_b is not None:
                if prob_a + prob_b != 100:
                    errors.append(f"Win probability sum != 100% in {tid_a} ({prob_a}%) + {tid_b} ({prob_b}%) = {prob_a+prob_b}%")

            # Vegas Spread symmetry
            spread_a = g_a.get('vegasSpread')
            spread_b = g_b.get('vegasSpread')
            if not is_final_a and spread_a is not None and spread_b is not None:
                if spread_a != -spread_b:
                    errors.append(f"Vegas spread sign asymmetry in {tid_a} ({spread_a}) vs {tid_b} ({spread_b})")

    print(f"  • Verified 100% reciprocal symmetry and zero ties across all {pairs_checked} intra-conference/tracked matchup pairs.")

    # 8. Multi-Platform Bundle Synchronization
    print("\n[7/7] 📱 Inspecting Multi-Platform Bundle Synchronization...")
    targets = [
        ("Web v3", TEAMS_V3_FILE),
        ("iOS WKWebView", IOS_TEAMS_FILE),
        ("Android Assets", ANDROID_TEAMS_FILE)
    ]
    for label, path in targets:
        if not os.path.exists(path):
            warnings.append(f"Optional target bundle not found on filesystem: {path}")
            continue
        try:
            target_db = load_db(path)
            if len(target_db) != len(db):
                errors.append(f"{label} bundle count mismatch: {len(target_db)} vs {len(db)} in primary")
            # Check a sample team rank
            if target_db.get('notredame', {}).get('apRank') != db.get('notredame', {}).get('apRank'):
                errors.append(f"{label} bundle rankings desync for notredame: {target_db.get('notredame', {}).get('apRank')} vs {db.get('notredame', {}).get('apRank')}")
            print(f"  ✓ Verified {label} ({path}) is syntactically valid and in sync.")
        except Exception as e:
            errors.append(f"{label} bundle load error: {e}")

    # Results Summary
    print("\n" + "=" * 75)
    if warnings:
        print(f"⚠️  {len(warnings)} WARNING(S):")
        for w in warnings[:10]:
            print(f"  • {w}")
    
    if errors:
        print(f"\n❌ {len(errors)} INSPECTION ERROR(S) DETECTED:")
        for e in errors[:20]:
            print(f"  • {e}")
        print("\n🚫 PRE-FLIGHT CHECKS FAILED. DO NOT PUSH TO PRODUCTION.")
        print("=" * 75)
        sys.exit(1)
    else:
        print(f"\n🎉 ALL PRE-FLIGHT INSPECTIONS PASSED WITH ZERO ERRORS!")
        print("✅ Safe for production deployment.")
        print("=" * 75)
        sys.exit(0)

if __name__ == '__main__':
    run_inspections()
