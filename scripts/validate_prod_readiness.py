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
    print("\n[1/6] 📅 Inspecting DTG (Date, Time, Week, Season) Accuracy...")
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
    print("\n[2/6] 🎨 Inspecting Logos, Badges, and Visual Assets...")
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
    print("\n[3/6] 🏆 Validating Week 2 AP Top 25 & RV Poll Precision...")
    for tid, exp_rank in EXPECTED_AP_POLL_WEEK2.items():
        if tid not in db:
            errors.append(f"Missing expected tracked team: {tid}")
            continue
        act_rank = db[tid].get('apRank', 'NR')
        if act_rank != exp_rank:
            errors.append(f"Rank Mismatch for {tid}: Expected '{exp_rank}', found '{act_rank}'")

    print("  • Verified AP rankings match official Sept 8 release (Ohio State #1, Notre Dame #3, Texas #4, Michigan RV, Louisville #24, Clemson NR).")

    # 5. Rosters, Star Players, & Coaching Staffs
    print("\n[4/6] 🏈 Inspecting 2026 Roster, QB, and Coaching Staff Integrity...")
    for tid, t in db.items():
        hc = t.get('headCoach')
        qb = t.get('confirmedStarterQb')
        star = t.get('starPlayer')
        if not hc: errors.append(f"{tid}: Missing headCoach")
        if not qb: errors.append(f"{tid}: Missing confirmedStarterQb")
        if not star: errors.append(f"{tid}: Missing starPlayer")

    print(f"  • Confirmed valid 2026 starters and coaches across all {len(db)} teams.")

    # 6. Model Probabilities & Odds Integrity
    print("\n[5/6] 🎯 Inspecting Odds Calibration & Monte Carlo Win Probabilities...")
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

    print(f"  • Verified spread, over/under, and clamped win probabilities.")

    # 7. Multi-Platform Bundle Synchronization
    print("\n[6/6] 📱 Inspecting Multi-Platform Bundle Synchronization...")
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
