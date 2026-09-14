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

try:
    import weather_client
except ImportError:
    weather_client = None

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

# Authoritative Week 2 Rankings (Used when ESPN API is still serving stale Preseason cache)
WEEK2_OFFICIAL_POLL = {
    'ohiostate': {'apRank': '#1 AP', 'apPoints': '1,684 PTS (46 1st)', 'rankNum': 1},
    'georgia': {'apRank': '#2 AP', 'apPoints': '1,532 PTS', 'rankNum': 2},
    'notredame': {'apRank': '#3 AP', 'apPoints': '1,512 PTS (4 1st)', 'rankNum': 3},
    'texas': {'apRank': '#4 AP', 'apPoints': '1,462 PTS (2 1st)', 'rankNum': 4},
    'indiana': {'apRank': '#5 AP', 'apPoints': '1,428 PTS (8 1st)', 'rankNum': 5},
    'oregon': {'apRank': '#6 AP', 'apPoints': '1,422 PTS (3 1st)', 'rankNum': 6},
    'miami': {'apRank': '#7 AP', 'apPoints': '1,405 PTS (1 1st)', 'rankNum': 7},
    'lsu': {'apRank': '#8 AP', 'apPoints': '1,315 PTS (5 1st)', 'rankNum': 8},
    'olemiss': {'apRank': '#9 AP', 'apPoints': '1,154 PTS', 'rankNum': 9},
    'texasam': {'apRank': '#10 AP', 'apPoints': '1,079 PTS', 'rankNum': 10},
    'oklahoma': {'apRank': '#11 AP', 'apPoints': '1,039 PTS', 'rankNum': 11},
    'alabama': {'apRank': '#12 AP', 'apPoints': '910 PTS', 'rankNum': 12},
    'texastech': {'apRank': '#13 AP', 'apPoints': '900 PTS', 'rankNum': 13},
    'usc': {'apRank': '#14 AP', 'apPoints': '861 PTS', 'rankNum': 14},
    'byu': {'apRank': '#15 AP', 'apPoints': '840 PTS', 'rankNum': 15},
    'pennstate': {'apRank': '#16 AP', 'apPoints': '621 PTS', 'rankNum': 16},
    'smu': {'apRank': '#17 AP', 'apPoints': '501 PTS', 'rankNum': 17},
    'tennessee': {'apRank': '#18 AP', 'apPoints': '491 PTS', 'rankNum': 18},
    'washington': {'apRank': '#19 AP', 'apPoints': '489 PTS', 'rankNum': 19},
    'utah': {'apRank': '#20 AP', 'apPoints': '381 PTS', 'rankNum': 20},
    'iowa': {'apRank': '#21 AP', 'apPoints': '369 PTS', 'rankNum': 21},
    'houston': {'apRank': '#22 AP', 'apPoints': '214 PTS', 'rankNum': 22},
    'missouri': {'apRank': '#23 AP', 'apPoints': '182 PTS', 'rankNum': 23},
    'louisville': {'apRank': '#24 AP', 'apPoints': '163 PTS', 'rankNum': 24},
    'boisestate': {'apRank': 'RV', 'apPoints': '86 PTS', 'rankNum': 99},
    'michigan': {'apRank': 'RV', 'apPoints': '69 PTS', 'rankNum': 99},
    'arizona': {'apRank': 'RV', 'apPoints': '33 PTS', 'rankNum': 99},
    'colorado': {'apRank': 'RV', 'apPoints': '3 PTS', 'rankNum': 99},
    'arizonastate': {'apRank': 'RV', 'apPoints': '2 PTS', 'rankNum': 99},
    'clemson': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'floridastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999}
}

# Authoritative Week 3 AP Poll (September 13, 2026 Live AP Release)
WEEK3_OFFICIAL_POLL = {
    'texas': {'apRank': '#1 AP', 'apPoints': '1,678 PTS (56 1st)', 'rankNum': 1},
    'georgia': {'apRank': '#2 AP', 'apPoints': '1,551 PTS (3 1st)', 'rankNum': 2},
    'notredame': {'apRank': '#3 AP', 'apPoints': '1,531 PTS (1 1st)', 'rankNum': 3},
    'indiana': {'apRank': '#4 AP', 'apPoints': '1,466 PTS (3 1st)', 'rankNum': 4},
    'miami': {'apRank': '#5 AP', 'apPoints': '1,452 PTS (4 1st)', 'rankNum': 5},
    'ohiostate': {'apRank': '#6 AP', 'apPoints': '1,407 PTS', 'rankNum': 6},
    'lsu': {'apRank': '#7 AP', 'apPoints': '1,334 PTS (1 1st)', 'rankNum': 7},
    'olemiss': {'apRank': '#8 AP', 'apPoints': '1,216 PTS', 'rankNum': 8},
    'texasam': {'apRank': '#9 AP', 'apPoints': '1,165 PTS', 'rankNum': 9},
    'alabama': {'apRank': '#10 AP', 'apPoints': '1,068 PTS', 'rankNum': 10},
    'byu': {'apRank': '#11 AP', 'apPoints': '966 PTS', 'rankNum': 11},
    'usc': {'apRank': '#12 AP', 'apPoints': '944 PTS', 'rankNum': 12},
    'texastech': {'apRank': '#13 AP', 'apPoints': '910 PTS', 'rankNum': 13},
    'pennstate': {'apRank': '#14 AP', 'apPoints': '692 PTS', 'rankNum': 14},
    'tennessee': {'apRank': '#15 AP', 'apPoints': '676 PTS', 'rankNum': 15},
    'smu': {'apRank': '#16 AP', 'apPoints': '636 PTS', 'rankNum': 16},
    'utah': {'apRank': '#17 AP', 'apPoints': '558 PTS', 'rankNum': 17},
    'iowa': {'apRank': '#18 AP', 'apPoints': '391 PTS', 'rankNum': 18},
    'michigan': {'apRank': '#19 AP', 'apPoints': '382 PTS', 'rankNum': 19},
    'missouri': {'apRank': '#20 AP', 'apPoints': '344 PTS', 'rankNum': 20},
    'oregon': {'apRank': '#21 AP', 'apPoints': '324 PTS', 'rankNum': 21},
    'houston': {'apRank': '#22 AP', 'apPoints': '292 PTS', 'rankNum': 22},
    'louisville': {'apRank': '#23 AP', 'apPoints': '244 PTS', 'rankNum': 23},
    'oklahoma': {'apRank': '#24 AP', 'apPoints': '222 PTS', 'rankNum': 24},
    'washington': {'apRank': 'RV', 'apPoints': '172 PTS', 'rankNum': 99},
    'boisestate': {'apRank': 'RV', 'apPoints': '57 PTS', 'rankNum': 99},
    'arizona': {'apRank': 'RV', 'apPoints': '5 PTS', 'rankNum': 99},
    'colorado': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'arizonastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'clemson': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'floridastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999}
}

# Baseline SP+ Ratings before Week 1 (Calibrated to AP Top 25 Consensus, Head-to-Head, and 247Sports Roster Talent)
BASELINE_SP_RATINGS = {
    'texas': 37.5,       # #1 AP (2-0, beat Ohio State in Columbus, 985 talent)
    'georgia': 36.5,     # #2 AP (2-0, 1003 talent)
    'ohiostate': 35.8,   # #6 AP (1-1, lost to Texas by 1 at home, 964 talent)
    'notredame': 35.0,   # #3 AP (2-0, 953 talent)
    'miami': 33.5,       # #5 AP (2-0, 885 talent)
    'lsu': 33.0,         # #7 AP (2-0, crushed Clemson 51-10, 932 talent)
    'indiana': 32.5,     # #4 AP (2-0, 735 talent)
    'texasam': 31.8,     # #9 AP (2-0, blew out ASU 48-20, 933 talent)
    'alabama': 31.2,     # #10 AP (2-0, beat Kentucky 38-14, 973 talent)
    'oregon': 30.5,      # #21 AP (1-1, upset by OK State, 984 talent)
    'pennstate': 27.8,   # #14 AP (2-0)
    'michigan': 27.5,    # #19 AP (2-0, beat #11 Oklahoma)
    'olemiss': 27.2,     # #8 AP (2-0, beat Louisville)
    'tennessee': 26.8,   # #15 AP (2-0)
    'usc': 26.5,         # #12 AP (3-0)
    'oklahoma': 25.5,    # #24 AP (1-1, lost to Michigan)
    'texastech': 25.0,   # #13 AP (2-0, Big 12, 767 talent, beat ACU/ORST)
    'missouri': 24.5,    # #20 AP (2-0)
    'byu': 23.5,         # #11 AP (2-0, beat Arizona)
    'washington': 22.8,  # RV (2-0)
    'iowa': 22.0,        # #18 AP (2-0)
    'smu': 20.8,         # #16 AP (2-0)
    'louisville': 19.8,  # #23 AP (1-1, lost to Ole Miss, beat Villanova)
    'clemson': 18.8,     # NR (1-1, lost 51-10 to LSU)
    'utah': 18.0,        # #17 AP (2-0)
    'floridastate': 16.8,# NR (1-1)
    'arizona': 15.5,     # RV (1-1, lost to BYU)
    'houston': 15.0,     # #22 AP (2-0)
    'boisestate': 14.0,  # RV (1-1, lost to Oregon)
    'arizonastate': 11.2,# NR (1-1, lost 48-20 to A&M)
    'colorado': 9.2      # NR (1-1)
}

# Stadium Home Field Advantage mapping (points)
STADIUM_HFA = {
    "Tiger Stadium": 3.2,
    "Kyle Field": 3.2,
    "Neyland Stadium": 3.2,
    "Beaver Stadium": 3.0,
    "Ohio Stadium": 3.0,
    "Sanford Stadium": 3.0,
    "Autzen Stadium": 3.0,
    "Bryant-Denny Stadium": 3.0,
    "Rice-Eccles Stadium": 2.8,
    "Jones AT&T Stadium": 2.8,
    "Jones AT&T Stadium (Lubbock, TX)": 2.8,
    "Michigan Stadium": 2.5,
    "Michigan Stadium (The Big House)": 2.5,
    "Darrell K Royal-Texas Memorial Stadium": 2.5,
    "Folsom Field": 2.5,
    "Doak Campbell Stadium": 2.5,
    "Bobby Dodd Stadium": 2.2,
    "Memorial Stadium": 2.5,
    "Husky Stadium": 2.8,
    "Los Angeles Memorial Coliseum": 2.5,
    "Kinnick Stadium": 2.8,
    "Mountain America Stadium": 2.5,
    "Hard Rock Stadium": 2.5,
    "Jordan-Hare Stadium": 3.0,
    "Camp Randall Stadium": 2.8,
    "Arizona Stadium": 2.2,
    "TDECU Stadium": 2.2,
    "L&N Stadium": 2.2,
    "L&N Federal Credit Union Stadium": 2.2,
    "Faurot Field": 2.5,
    "Albertsons Stadium": 2.8,
    "Gerald J. Ford Stadium": 2.2,
    "Gaylord Family Oklahoma Memorial Stadium": 2.8,
    "Vaught-Hemingway Stadium": 2.8,
    "Memorial Stadium (Clemson)": 2.8
}

NON_DB_OPPONENT_RATINGS = {
    'Florida Gators': 25.0, 'FLA': 25.0,
    'South Carolina Gamecocks': 22.2, 'SC': 22.2,
    'Auburn Tigers': 20.9, 'AUB': 20.9,
    'Vanderbilt Commodores': 18.5, 'VANDY': 18.5,
    'Nebraska Cornhuskers': 18.4, 'NEB': 18.4,
    'Virginia Cavaliers': 18.4, 'UVA': 18.4,
    'Kansas State Wildcats': 17.9, 'KSU': 17.9,
    'Illinois Fighting Illini': 17.8, 'ILL': 17.8,
    'Virginia Tech Hokies': 17.6, 'VT': 17.6,
    'TCU Horned Frogs': 16.9, 'TCU': 16.9,
    'Oklahoma State Cowboys': 16.3, 'OKST': 16.3,
    'Pittsburgh Panthers': 14.6, 'PITT': 14.6,
    'UCLA Bruins': 14.4, 'UCLA': 14.4,
    'Mississippi State Bulldogs': 14.0, 'MSST': 14.0,
    'Duke Blue Devils': 13.9, 'DUKE': 13.9,
    'Maryland Terrapins': 13.9, 'MD': 13.9,
    'Minnesota Golden Gophers': 13.7, 'MINN': 13.7,
    'NC State Wolfpack': 13.4, 'NCST': 13.4,
    'Arkansas Razorbacks': 13.2, 'ARK': 13.2,
    'Kentucky Wildcats': 12.6, 'UK': 12.6,
    'North Carolina Tar Heels': 12.5, 'UNC': 12.5,
    'Northwestern Wildcats': 12.4, 'NU': 12.4,
    'Georgia Tech Yellow Jackets': 12.2, 'GT': 12.2,
    'Wake Forest Demon Deacons': 11.8, 'WAKE': 11.8,
    'Wisconsin Badgers': 11.6, 'WISC': 11.6,
    'Baylor Bears': 11.3, 'BAY': 11.3,
    'Cincinnati Bearcats': 11.1, 'CIN': 11.1,
    'UNLV Rebels': 10.9, 'UNLV': 10.9,
    'California Golden Bears': 10.7, 'CAL': 10.7,
    'Michigan State Spartans': 10.6, 'MSU': 10.6,
    'Kansas Jayhawks': 10.5, 'KU': 10.5,
    'San José State Spartans': 10.0, 'SJSU': 10.0,
    'UCF Knights': 8.8, 'UCF': 8.8,
    'Rutgers Scarlet Knights': 8.7, 'RUTG': 8.7,
    'Memphis Tigers': 7.4, 'MEM': 7.4,
    'West Virginia Mountaineers': 7.3, 'WVU': 7.3,
    'UTSA Roadrunners': 7.1, 'UTSA': 7.1,
    'Iowa State Cyclones': 6.7, 'ISU': 6.7,
    'Syracuse Orange': 5.7, 'SYR': 5.7,
    'Fresno State Bulldogs': 5.3, 'FRES': 5.3,
    'Stanford Cardinal': 5.1, 'STAN': 5.1,
    'Purdue Boilermakers': 5.1, 'PUR': 5.1,
    'Boston College Eagles': 4.6, 'BC': 4.6,
    'Texas State Bobcats': 3.3, 'TXST': 3.3,
    'Tulane Green Wave': 2.8, 'TUL': 2.8,
    'Washington State Cougars': 1.2, 'WSU': 1.2,
    'Western Michigan Broncos': 0.5, 'WMU': 0.5,
    'Oregon State Beavers': -0.1, 'ORST': -0.1,
    'Marshall Thundering Herd': -1.6, 'MARSH': -1.6,
    'Temple Owls': -2.2, 'TEM': -2.2,
    'Louisiana Tech Bulldogs': -2.8, 'LT': -2.8,
    'Utah State Aggies': -3.0, 'USU': -3.0,
    'Louisiana Ragin\' Cajuns': -4.0, 'ULL': -4.0,
    'Rice Owls': -8.7, 'RICE': -8.7,
    'UTEP Miners': -12.7, 'UTEP': -12.7,
    'Ball State Cardinals': -18.7, 'BALL': -18.7,
    'Charlotte 49ers': -19.0, 'CHAR': -19.0,
    # FCS Opponents standard baselines (-16.0 to -22.0)
    'Villanova Wildcats': -16.0, 'Villanova': -16.0,
    'Howard Bison': -18.0, 'Howard': -18.0,
    'Florida A&M Rattlers': -18.0, 'FAMU': -18.0,
    'UC Davis Aggies': -16.0, 'UCD': -16.0,
    'Southern Jaguars': -20.0, 'Southern': -20.0,
    'Weber State Wildcats': -18.0, 'Weber State': -18.0,
    'Abilene Christian Wildcats': -18.0, 'ACU': -18.0,
    'Furman Paladins': -18.0, 'Furman': -18.0,
    'Tennessee State Tigers': -22.0, 'TSU': -22.0,
    'Utah Tech Trailblazers': -22.0, 'Utah Tech': -22.0,
    'Morgan State Bears': -22.0, 'Morgan State': -22.0,
    'Idaho Vandals': -16.0, 'Idaho': -16.0,
    'Missouri State Bears': -16.0, 'Missouri State': -16.0,
    'Portland State Vikings': -20.0,
    'Stephen F. Austin Lumberjacks': -18.0,
    'Houston Christian Huskies': -22.0,
    'Arkansas-Pine Bluff Golden Lions': -22.0,
    'Northern Arizona Lumberjacks': -18.0
}

def load_teams_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    match = re.search(r'(?:const|var|let)\s+TEAMS_DATABASE\s*=\s*(\{[\s\S]*?\});\s*(?:if\s*\(typeof module|\Z)', content)
    if not match:
        raise ValueError(f"Could not locate TEAMS_DATABASE in {filepath}")
    return json.loads(match.group(1))

def save_teams_file(filepath, db):
    json_formatted = json.dumps(db, indent=2)
    prefix = ""
    var_decl = "const TEAMS_DATABASE = "
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            orig = f.read()
        m = re.search(r'(const|var|let)\s+TEAMS_DATABASE\s*=\s*', orig)
        if m:
            prefix = orig[:m.start()]
            var_decl = m.group(0)
    footer = ";\n\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = TEAMS_DATABASE;\n}\n"
    content = prefix + var_decl + json_formatted + footer
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
            if ap_poll:
                headline = (ap_poll.get('headline') or '').lower()
                date_str = (ap_poll.get('date') or '')
                if 'preseason' in headline or '2026-08' in date_str:
                    print("  ⚠️ ESPN API is still serving stale Preseason cache (Aug 17). Switching to verified Week 2 Poll.")
                    return None
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

def enforce_head_to_head_symmetry(db):
    """
    Guarantees 100% mathematical score and outcome symmetry across all head-to-head games in TEAMS_DATABASE.
    Prevents contradictions (e.g. Team A losing to Team B while Team B loses to Team A) and eliminates tie games.
    """
    visited = set()
    reconciled = 0
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
            # Match strictly by oppId and matching week or date
            g_b = next((g for g in t_b.get('schedule', []) if g.get('oppId') == tid_a and (g.get('week') == g_a.get('week') or g.get('date') == g_a.get('date'))), None)
            if not g_b:
                g_b = next((g for g in t_b.get('schedule', []) if g.get('oppId') == tid_a), None)
            if not g_b:
                g_b = next((g for g in t_b.get('schedule', []) if (g.get('opponent') == t_a.get('name') or g.get('oppAbbr') == t_a.get('abbr'))), None)
            if not g_b:
                continue

            if g_a.get('isFinal') or g_b.get('isFinal'):
                s_a = g_a.get('finalTeamScore') if g_a.get('finalTeamScore') is not None else g_a.get('actualScoreUt', 0)
                s_b = g_a.get('finalOppScore') if g_a.get('finalOppScore') is not None else g_a.get('actualScoreOpp', 0)
                win_a = s_a > s_b
                g_a['isFinal'] = g_b['isFinal'] = True
                g_a['finalTeamScore'] = g_a['actualScoreUt'] = s_a
                g_a['finalOppScore'] = g_a['actualScoreOpp'] = s_b
                g_a['finalWin'] = win_a
                g_b['finalTeamScore'] = g_b['actualScoreUt'] = s_b
                g_b['finalOppScore'] = g_b['actualScoreOpp'] = s_a
                g_b['finalWin'] = not win_a
                reconciled += 1
                continue

            # For unplayed games, pick home game as master (or team A if neutral)
            is_a_home = g_a.get('isHome', True)
            master = g_a if is_a_home else g_b
            slave = g_b if is_a_home else g_a

            # Eliminate ties strictly
            m_ut = master.get('projScoreUt') or 24
            m_opp = master.get('projScoreOpp') or 21
            if m_ut == m_opp:
                if master.get('baseWinProb', 50) >= 50:
                    m_ut += 3
                else:
                    m_opp += 3
                master['projScoreUt'] = m_ut
                master['projScoreOpp'] = m_opp

            # Harmonize master win probability and spread to align with score margin
            m_win = master['projScoreUt'] > master['projScoreOpp']
            if m_win:
                if master.get('baseWinProb', 50) <= 50:
                    master['baseWinProb'] = 55
                if master.get('vegasSpread', 0) >= 0:
                    master['vegasSpread'] = -round(max(0.5, abs(master['projScoreUt'] - master['projScoreOpp']) * 0.8), 1)
            else:
                if master.get('baseWinProb', 50) >= 50:
                    master['baseWinProb'] = 45
                if master.get('vegasSpread', 0) <= 0:
                    master['vegasSpread'] = round(max(0.5, abs(master['projScoreOpp'] - master['projScoreUt']) * 0.8), 1)

            slave['projScoreUt'] = master['projScoreOpp']
            slave['projScoreOpp'] = master['projScoreUt']
            if 'baseWinProb' in master and isinstance(master['baseWinProb'], (int, float)):
                slave['baseWinProb'] = max(1, min(99, 100 - int(master['baseWinProb'])))
            if 'vegasSpread' in master and isinstance(master['vegasSpread'], (int, float)):
                slave['vegasSpread'] = -master['vegasSpread']

            # Symmetrize Monte Carlo metrics if present
            if 'mcCoverProb' in master and isinstance(master['mcCoverProb'], (int, float)):
                slave['mcCoverProb'] = round(100.0 - float(master['mcCoverProb']), 1)
            if 'mcOverProb' in master and isinstance(master['mcOverProb'], (int, float)):
                slave['mcOverProb'] = float(master['mcOverProb'])
            if 'mcScoreDistUt' in master:
                slave['mcScoreDistOpp'] = master['mcScoreDistUt']
            if 'mcScoreDistOpp' in master:
                slave['mcScoreDistUt'] = master['mcScoreDistOpp']
            if 'mcRecommendedOu' in master:
                slave['mcRecommendedOu'] = master['mcRecommendedOu']

            # Symmetrize weather metrics if present
            if 'weather' in master:
                slave['weather'] = master['weather']
            if 'weatherImpact' in master:
                slave['weatherImpact'] = master['weatherImpact']

            # Symmetrize preseason fields if present
            if 'preseasonProjUt' in master and 'preseasonProjOpp' in master:
                slave['preseasonProjUt'] = master['preseasonProjOpp']
                slave['preseasonProjOpp'] = master['preseasonProjUt']
            if 'preseasonWinProb' in master and isinstance(master['preseasonWinProb'], (int, float)):
                slave['preseasonWinProb'] = max(1, min(99, 100 - int(master['preseasonWinProb'])))
            if 'preseasonSpread' in master and isinstance(master['preseasonSpread'], (int, float)):
                slave['preseasonSpread'] = -master['preseasonSpread']

            reconciled += 1

    print(f"✓ Enforced 100% head-to-head score and outcome symmetry across {reconciled} matchup pairs.")

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
    cum_adv_stats = {}
    dynamic_fbs_ratings = {}
    ret_prod_map = {}
    lines_w1 = {}
    lines_w2 = {}
    lines_w3 = {}
    if cfbd_client:
        try:
            talent_map = cfbd_client.get_team_talent_composite(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(talent_map)} teams with 2026 247Sports Talent Composite")
            sp_map_2026 = cfbd_client.get_sp_ratings(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(sp_map_2026)} teams with 2026 Official SP+ Ratings")
            cum_adv_stats = cfbd_client.get_cumulative_advanced_stats(2026, weeks=[0, 1, 2])
            print(f"🔥 CFBD Ingestion: Loaded cumulative multi-week EPA/PPA for {len(cum_adv_stats)} teams (Weeks 0, 1, 2)")
            dynamic_fbs_ratings = cfbd_client.get_fbs_opponent_power_ratings(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(dynamic_fbs_ratings)} dynamic 2026 FBS opponent ratings grounded in SP+ & 2026 records")
            ret_prod_map = cfbd_client.get_returning_production(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(ret_prod_map)} teams with 2026 Returning Production & Continuity")
            season_adv_map = cfbd_client.get_season_advanced_stats(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(season_adv_map)} teams with Trench Line Yards & Havoc Rates")
            lines_w1 = cfbd_client.get_game_lines(2026, week=1)
            lines_w2 = cfbd_client.get_game_lines(2026, week=2)
            lines_w3 = cfbd_client.get_game_lines(2026, week=3)
            print(f"🔥 CFBD Ingestion: Loaded {len(lines_w1)} lines for Week 1, {len(lines_w2)} lines for Week 2, {len(lines_w3)} lines for Week 3")
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
    else:
        print("  • Applying verified official Week 3 Top 25 poll (Texas #1, Georgia #2, Notre Dame #3, Indiana #4, Miami #5, Ohio State #6)...")
        ranking_updates = WEEK3_OFFICIAL_POLL

    # Apply rankings to teams in DB
    ap_changes_count = 0
    # Derive sequential contender ranks (1..31) based on official poll hierarchy
    def get_team_rank_metric(tid, t_obj):
        info = ranking_updates.get(tid, {})
        r_str = info.get('apRank', t_obj.get('apRank', 'NR'))
        m_r = re.search(r'\d+', r_str)
        if r_str.startswith('#') and m_r:
            return int(m_r.group(0))
        if 'RV' in r_str:
            pts_m = re.search(r'\d+', (info.get('apPoints', t_obj.get('apPoints', ''))).replace(',', ''))
            pts = int(pts_m.group(0)) if pts_m else 0
            return 100.0 - (pts / 10000.0)
        return 1000.0 - (t_obj.get('baseSpRating', 0.0) / 100.0)

    sorted_by_rank = sorted(db.keys(), key=lambda k: get_team_rank_metric(k, db[k]))
    rank_order_map = {k: idx + 1 for idx, k in enumerate(sorted_by_rank)}

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
            t['playoffContenderRank'] = rank_order_map.get(tid, 99)

    # Update opponent rankings in schedules for unplayed games
    opp_rank_updates_count = 0
    # Also index all ranked teams from current AP poll for non-db opponents (e.g. #25 Virginia)
    external_ap_ranks = {}
    if ap_poll:
        for r in ap_poll.get('ranks', []):
            rn = r.get('current')
            loc = (r.get('team', {}).get('location') or '').lower()
            name = (r.get('team', {}).get('name') or '').lower()
            if loc: external_ap_ranks[loc] = f"#{rn} AP"
            if name: external_ap_ranks[name] = f"#{rn} AP"

    for tid, t in db.items():
        for g in t.get('schedule', []):
            if g.get('isFinal'):
                continue
            opp_id = g.get('oppId')
            matched_tid = opp_id if (opp_id and opp_id in db) else match_team_in_db(db, g.get('opponent') or g.get('oppAbbr'))
            if matched_tid and matched_tid in db:
                opp_ap = db[matched_tid].get('apRank', 'NR')
            else:
                opp_name_clean = (g.get('opponent') or '').lower()
                opp_ap = external_ap_ranks.get(opp_name_clean, g.get('oppRank', 'NR'))

            if g.get('oppRank') != opp_ap:
                if not args.dry_run:
                    g['oppRank'] = opp_ap
                opp_rank_updates_count += 1

    print(f"  • Updated AP rankings for {ap_changes_count} teams, adjusted {opp_rank_updates_count} future schedule matchup badges.")

    # Dates to scan
    target_dates = args.dates
    if not target_dates:
        target_dates = [
            '20260829', '20260903', '20260904', '20260905', '20260906', '20260907',
            '20260910', '20260911', '20260912', '20260913'
        ]

    all_completed_games = []
    
    # 1. Ingest completed games already marked in TEAMS_DATABASE
    fcs_keywords = [
        'fcs', 'villanova', 'howard', 'furman', 'tennessee state', 'morgan state',
        'utah tech', 'southern jaguars', 'weber state', 'uc davis', 'idaho',
        'florida a&m', 'missouri state', 'abilene christian', 'pine bluff',
        'northern arizona', 'portland state', 'stephen f austin', 'houston christian',
        'tarleton', 'central arkansas', 'nicholls', 'eastern kentucky', 'mercer',
        'chattanooga', 'samford', 'sacramento state', 'montana state', 'montana',
        'south dakota', 'north dakota', 'holy cross', 'richmond', 'william & mary'
    ]

    for tid, t in db.items():
        t_name = (t.get('name') or tid).lower()
        t_short = (t.get('shortName') or tid).lower()
        for g in t.get('schedule', []):
            score_ut = g.get('actualScoreUt') if g.get('actualScoreUt') is not None else g.get('finalTeamScore')
            score_opp = g.get('actualScoreOpp') if g.get('actualScoreOpp') is not None else g.get('finalOppScore')
            is_completed = (g.get('isFinal') or score_ut is not None) and (score_ut is not None and score_opp is not None)
            if is_completed:
                raw_opp_name = (g.get('opponent') or '').strip()
                opp_lower = raw_opp_name.lower()
                is_fcs_match = any(kw in opp_lower for kw in fcs_keywords) or g.get('oppRank') == 'FCS'
                if is_fcs_match:
                    g['oppRank'] = 'FCS'

                # Calibrate historical Vegas spread against official closing lines
                wk = g.get('week')
                cur_l_map = lines_w1 if wk == 'WEEK 1' else (lines_w2 if wk == 'WEEK 2' else {})
                matched_line = (
                    cur_l_map.get((t_name, opp_lower)) or
                    cur_l_map.get((t_short, (g.get('oppAbbr') or '').lower())) or
                    cur_l_map.get((t_name, (g.get('oppAbbr') or '').lower())) or
                    cur_l_map.get((t_short, opp_lower))
                )
                if not matched_line:
                    for (h, a), l_info in cur_l_map.items():
                        if (t_short in h or h in t_name) and (opp_lower in a or any(w in a for w in opp_lower.split() if len(w) > 4)):
                            matched_line = l_info
                            break
                        elif (opp_lower in h or any(w in h for w in opp_lower.split() if len(w) > 4)) and (t_short in a or a in t_name):
                            matched_line = l_info
                            break

                if matched_line and matched_line.get('spread') is not None:
                    spread_val = matched_line['spread'] if g.get('isHome', True) else -matched_line['spread']
                    g['vegasSpread'] = spread_val
                    g['overUnder'] = matched_line.get('overUnder') or g.get('overUnder', 52.5)
                    g['oddsProvider'] = matched_line.get('provider', 'Consensus')

                if not args.dry_run:
                    g['isFinal'] = True
                    g['finalTeamScore'] = g['actualScoreUt'] = int(score_ut)
                    g['finalOppScore'] = g['actualScoreOpp'] = int(score_opp)
                    g['finalWin'] = int(score_ut) > int(score_opp)

                opp_id = match_team_in_db(db, g.get('opponent')) or match_team_in_db(db, g.get('oppAbbr'))
                spread = g.get('vegasSpread')
                if spread is None:
                    spread = -3.5
                all_completed_games.append({
                    'teamId': tid,
                    'oppId': opp_id,
                    'gameId': g.get('id'),
                    'teamScore': int(score_ut),
                    'oppScore': int(score_opp),
                    'projUt': g.get('projScoreUt', 24),
                    'projOpp': g.get('projScoreOpp', 21),
                    'vegasSpread': float(spread),
                    'overUnder': float(g.get('overUnder', 52.5)),
                    'isHome': g.get('isHome', True),
                    'stadium': g.get('stadium', ''),
                    'oppRank': g.get('oppRank', 'NR'),
                    'opponent': g.get('opponent', '')
                })

    # 2. Ingest live games from ESPN if not already in TEAMS_DATABASE
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
                if not any(cg.get('teamId') == t1_id for cg in all_completed_games):
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
                        'stadium': comps.get('venue', {}).get('fullName', ''),
                        'oppRank': 'NR',
                        'opponent': t2_name
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

        # Composite performance delta: Incorporates score margin vs. expectation
        delta_vegas = actual_margin - vegas_margin
        delta_model = actual_margin - proj_margin
        # Balanced composite delta (vs market and vs model prior)
        raw_delta = 0.50 * delta_vegas + 0.50 * delta_model

        opp_name = (g.get('opponent') or '').lower()
        opp_rank = g.get('oppRank', 'NR')
        
        is_fcs = opp_rank == 'FCS' or any(kw in opp_name for kw in fcs_keywords)
        is_ranked = str(opp_rank).startswith('#')
        is_g5 = any(kw in opp_name for kw in [
            'texas state', 'western kentucky', 'north texas', 'western michigan',
            'ball state', 'temple', 'louisiana tech', 'charlotte', 'fresno state',
            'san josé state', 'san jose state', 'louisiana ragin', 'louisiana', 'utah state',
            'memphis', 'utep', 'marshall', 'rice', 'rice owls', 'tulane', 'utsa',
            'georgia southern', 'new mexico state', 'east carolina', 'northern illinois'
        ])

        if is_fcs:
            w = 0.05  # FCS cupcake game: Minimal informational value for FBS conference play
            eff_delta = max(-2.0, min(1.5, raw_delta))
        elif is_g5:
            w = 0.40  # G5 game: Moderate value, heavily dampen blowouts above +10
            if raw_delta > 10.0:
                eff_delta = 10.0 + math.sqrt(raw_delta - 10.0) * 1.0
            elif raw_delta < -12.0:
                eff_delta = -12.0
            else:
                eff_delta = raw_delta
        elif is_ranked:
            w = 1.40  # Top 25 Marquee matchup: Strongest signal
            eff_delta = max(-16.0, min(18.0, raw_delta))
        else:
            w = 1.00  # Power 4 unranked matchup: Standard signal
            eff_delta = max(-14.0, min(15.0, raw_delta))

        if tid not in team_performances:
            team_performances[tid] = []
        team_performances[tid].append((eff_delta, w))

    avg_model_mae = round(sum(model_margin_errors) / max(1, total_evaluated), 2) if total_evaluated > 0 else 0
    avg_vegas_mae = round(sum(vegas_margin_errors) / max(1, total_evaluated), 2) if total_evaluated > 0 else 0
    beat_vegas_pct = round((model_beats_vegas_count / max(1, total_evaluated)) * 100, 1) if total_evaluated > 0 else 0

    print("\n🎯 MODEL VS. LAS VEGAS CONSENSUS BENCHMARK:")
    print(f"  • Model Mean Absolute Error (MAE): {avg_model_mae} pts")
    print(f"  • Vegas Consensus MAE:             {avg_vegas_mae} pts")
    print(f"  • Model Beat Vegas Rate:            {beat_vegas_pct}% ({model_beats_vegas_count}/{total_evaluated} games)")

    # 4. Bayesian SP+ Rating Updating (Opponent-Strength Weighted)
    ALPHA = 0.14
    rating_shifts = {}

    print("\n📈 RETRAINED TEAM POWER RATINGS (OPPONENT-WEIGHTED BAYESIAN + CUMULATIVE EPA):")
    for tid, delta_pairs in team_performances.items():
        t = db[tid]
        baseline = BASELINE_SP_RATINGS.get(tid, float(t.get('seasonBaselineSpRating') or t.get('baseSpRating', 22.0)))
        t['seasonBaselineSpRating'] = baseline
        
        weighted_sum = sum(d * w for d, w in delta_pairs)
        weight_total = sum(w for d, w in delta_pairs)
        avg_delta = weighted_sum / max(0.1, weight_total)
        raw_adjustment = avg_delta * ALPHA

        # Add EPA efficiency penalty or reward from cumulative 2026 season stats
        team_short = db[tid].get('shortName', '').lower()
        epa_shift = 0.0
        c_info = cum_adv_stats.get(team_short) or cum_adv_stats.get(tid) or cum_adv_stats.get((db[tid].get('name') or '').lower())
        if c_info:
            ppa = c_info.get('avgOffPpa', 0.20)
            if ppa > 0.45:
                epa_shift += 0.50  # High-octane offense reward
            elif ppa < 0.10:
                epa_shift -= 0.60  # Sluggish offense penalty
            if ppa < 0.00:
                epa_shift -= 0.75  # Severely broken offense penalty (e.g. Clemson)

        # Cap weekly rating volatility so a single non-conference game doesn't swing ratings by 6 points
        clamped_adjustment = max(-2.5, min(2.5, raw_adjustment + epa_shift))
        new_rating = round(baseline + clamped_adjustment, 2)
        rating_shifts[tid] = {
            'old': baseline,
            'new': new_rating,
            'delta': round(clamped_adjustment, 2)
        }
        sign = "+" if clamped_adjustment > 0 else ""
        print(f"  • {t.get('shortName', tid):<14} {baseline:>5.1f}  →  {new_rating:>5.1f}  ({sign}{clamped_adjustment:.2f} pts)")
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
            raw_opp_name = (g.get('opponent') or '').strip()
            opp_lower = raw_opp_name.lower()
            opp_abbr = (g.get('oppAbbr') or '').strip().lower()

            is_fcs = g.get('oppRank') == 'FCS' or any(kw in opp_lower for kw in fcs_keywords)
            if is_fcs:
                g['oppRank'] = 'FCS'
                sp_opp = -16.0
                opp_talent = 180.0
            elif opp_id and opp_id in db:
                sp_opp = float(db[opp_id].get('baseSpRating', 22.0))
                opp_name = db[opp_id].get('name', '').lower()
                opp_talent = talent_map.get(opp_name, talent_map.get(db[opp_id].get('shortName', '').lower(), 650.0))
            else:
                # 1. Search dynamic_fbs_ratings (longest keys first)
                found_dynamic = None
                if opp_lower in dynamic_fbs_ratings:
                    found_dynamic = dynamic_fbs_ratings[opp_lower]
                elif opp_abbr in dynamic_fbs_ratings:
                    found_dynamic = dynamic_fbs_ratings[opp_abbr]
                else:
                    for k in sorted(dynamic_fbs_ratings.keys(), key=len, reverse=True):
                        if len(k) >= 4 and (k == opp_lower or k in opp_lower or (len(opp_lower) >= 4 and opp_lower in k)):
                            found_dynamic = dynamic_fbs_ratings[k]
                            break

                if found_dynamic is not None:
                    sp_opp = found_dynamic
                elif raw_opp_name in NON_DB_OPPONENT_RATINGS:
                    sp_opp = NON_DB_OPPONENT_RATINGS[raw_opp_name]
                elif opp_abbr.upper() in NON_DB_OPPONENT_RATINGS:
                    sp_opp = NON_DB_OPPONENT_RATINGS[opp_abbr.upper()]
                else:
                    found_rating = None
                    for k in sorted(NON_DB_OPPONENT_RATINGS.keys(), key=len, reverse=True):
                        if k.lower() in opp_lower or (len(opp_lower) >= 4 and opp_lower in k.lower()):
                            found_rating = NON_DB_OPPONENT_RATINGS[k]
                            break
                    if found_rating is not None:
                        sp_opp = found_rating
                    elif g.get('isConf') or g.get('isBig12') or g.get('isSec') or g.get('isBigTen') or g.get('isAcc'):
                        sp_opp = 12.5
                    elif any(kw in opp_lower for kw in ['sec', 'big ten', 'big 12', 'acc', 'notre dame']):
                        sp_opp = 12.0
                    else:
                        sp_opp = 2.0

                opp_talent = talent_map.get(opp_lower, 650.0 if sp_opp >= 15.0 else 380.0)

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

            # Live consensus line matching from CFBD / DraftKings for Week 3
            matched_line = None
            if g.get('week') == 'WEEK 3' and lines_w3:
                team_clean = (t.get('name') or tid).lower()
                opp_clean = (g.get('opponent') or '').lower()
                team_short = (t.get('shortName') or tid).lower()
                opp_abbr = (g.get('oppAbbr') or '').lower()
                matched_line = (
                    lines_w3.get((team_clean, opp_clean)) or
                    lines_w3.get((team_short, opp_abbr)) or
                    lines_w3.get((team_clean, opp_abbr)) or
                    lines_w3.get((team_short, opp_clean))
                )
                if not matched_line:
                    for (h, a), l_info in lines_w3.items():
                        if (team_short in h or h in team_clean) and (opp_abbr in a or any(w in a for w in opp_clean.split() if len(w) > 4)):
                            matched_line = l_info
                            break
                        elif (opp_abbr in h or any(w in h for w in opp_clean.split() if len(w) > 4)) and (team_short in a or a in team_clean):
                            matched_line = l_info
                            break

            if matched_line and matched_line.get('spread') is not None:
                spread_val = matched_line['spread'] if g.get('isHome', True) else -matched_line['spread']
                g['vegasSpread'] = spread_val
                g['overUnder'] = matched_line.get('overUnder') or g.get('overUnder', 52.5)
                g['oddsProvider'] = matched_line.get('provider', 'DraftKings')
                vegas_margin = -spread_val
                # Blend model prediction with live Vegas consensus market (60% model, 40% Vegas)
                projected_margin = round(0.60 * raw_margin + 0.40 * vegas_margin, 1)
            else:
                # Later weeks: Pure model projection grounded in freshly calibrated ratings
                projected_margin = round(raw_margin, 1)
                g['vegasSpread'] = -projected_margin
                g['oddsProvider'] = 'CFB Prophet Projected'

            base_total = float(g.get('overUnder', 52.5))
            vegas_spread = g.get('vegasSpread')

            if monte_carlo_engine:
                ret_a = ret_prod_map.get((t.get('name') or '').lower(), {}).get('percentPPA', 0.60)
                ret_b = ret_prod_map.get((g.get('opponent') or '').lower(), {}).get('percentPPA', 0.60)
                mc_sim = monte_carlo_engine.simulate_matchup_10k(
                    team_a_name=t.get('shortName', tid),
                    team_b_name=g.get('oppAbbr') or g.get('opponent', 'OPP'),
                    sp_a=sp_team,
                    sp_b=sp_opp,
                    talent_a=fav_talent,
                    talent_b=opp_talent,
                    ret_prod_a=ret_a,
                    ret_prod_b=ret_b,
                    is_home_a=g.get('isHome', True),
                    hfa_pts=STADIUM_HFA.get(stadium, 2.5),
                    vegas_spread=vegas_spread,
                    vegas_total=base_total,
                    iterations=2500,
                    stadium_name=stadium,
                    game_date=g.get('date'),
                    kickoff_str=g.get('kickoffTime')
                )
                adj_ut_score = mc_sim['projScoreA']
                adj_opp_score = mc_sim['projScoreB']
                win_prob = max(1, min(99, int(round(mc_sim['winProbA']))))

                # Strictly break ties
                if adj_ut_score == adj_opp_score:
                    if win_prob >= 50:
                        adj_ut_score += 3
                    else:
                        adj_opp_score += 3

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
                    if mc_sim.get('weather'):
                        g['weather'] = mc_sim['weather']
                    if mc_sim.get('weatherImpact'):
                        g['weatherImpact'] = mc_sim['weatherImpact']
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

                # Strictly break ties
                if adj_ut_score == adj_opp_score:
                    if win_prob >= 50:
                        adj_ut_score += 3
                    else:
                        adj_opp_score += 3

                if not args.dry_run:
                    g['projScoreUt'] = adj_ut_score
                    g['projScoreOpp'] = adj_opp_score
                    g['baseWinProb'] = win_prob
            
            unplayed_games_recalculated += 1

    print(f"\n🔮 Re-projected {unplayed_games_recalculated} future regular-season games with updated power ratings!")
    print(f"🚀 Applied Non-Linear Blowout Calibration to {blowout_games_calibrated} mismatch games!")

    # 5.5 Enforce 100% Head-to-Head Reciprocal Symmetry & Eliminate Ties
    enforce_head_to_head_symmetry(db)

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

        android_teams = os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'www', 'data', 'teams.js')
        android_teams_v3 = os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'www', 'data', 'teams_v3.js')
        if os.path.exists(os.path.dirname(android_teams)):
            save_teams_file(android_teams, db)
            save_teams_file(android_teams_v3, db)
            print(f"💾 Updated Android bundle: {android_teams}")

        # Bump cache buster across web, iOS, and Android index.html files
        index_paths = [
            os.path.join(ROOT_DIR, 'index.html'),
            os.path.join(ROOT_DIR, 'ios', 'CFBProphet', 'www', 'index.html'),
            os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'www', 'index.html')
        ]
        main_index = index_paths[0]
        if os.path.exists(main_index):
            with open(main_index, 'r', encoding='utf-8') as f:
                content = f.read()
            m = re.search(r'data/teams\.js\?v=(\d+)', content)
            if m:
                old_v = int(m.group(1))
                new_v = old_v + 1
                for p in index_paths:
                    if os.path.exists(p):
                        with open(p, 'r', encoding='utf-8') as f:
                            c = f.read()
                        c = re.sub(r'\?v=\d+', f'?v={new_v}', c)
                        with open(p, 'w', encoding='utf-8') as f:
                            f.write(c)
                        print(f"🚀 Cache buster auto-bumped to v={new_v}: {p}")

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
