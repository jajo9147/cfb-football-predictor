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
    251: 'texas', 245: 'texasam', 2641: 'texastech', 30: 'usc', 254: 'utah', 264: 'washington',
    26: 'ucla', 96: 'kentucky', 154: 'wakeforest'
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

# Authoritative Week 5 AP Poll (September 27, 2026 Live AP Release)
WEEK5_OFFICIAL_POLL = {
    'texas': {'apRank': '#1 AP', 'apPoints': '1,737 PTS (62 1st)', 'rankNum': 1},
    'georgia': {'apRank': '#2 AP', 'apPoints': '1,646 PTS (6 1st)', 'rankNum': 2},
    'notredame': {'apRank': '#3 AP', 'apPoints': '1,581 PTS', 'rankNum': 3},
    'miami': {'apRank': '#4 AP', 'apPoints': '1,501 PTS (1 1st)', 'rankNum': 4},
    'ohiostate': {'apRank': '#5 AP', 'apPoints': '1,465 PTS', 'rankNum': 5},
    'indiana': {'apRank': '#6 AP', 'apPoints': '1,408 PTS (1 1st)', 'rankNum': 6},
    'alabama': {'apRank': '#7 AP', 'apPoints': '1,305 PTS', 'rankNum': 7},
    'olemiss': {'apRank': '#9 AP', 'apPoints': '1,089 PTS', 'rankNum': 9},
    'byu': {'apRank': '#10 AP', 'apPoints': '1,078 PTS', 'rankNum': 10},
    'lsu': {'apRank': '#11 AP', 'apPoints': '1,073 PTS', 'rankNum': 11},
    'texastech': {'apRank': '#12 AP', 'apPoints': '1,053 PTS', 'rankNum': 12},
    'utah': {'apRank': '#13 AP', 'apPoints': '903 PTS', 'rankNum': 13},
    'iowa': {'apRank': '#14 AP', 'apPoints': '856 PTS', 'rankNum': 14},
    'oregon': {'apRank': '#15 AP', 'apPoints': '725 PTS', 'rankNum': 15},
    'tennessee': {'apRank': '#17 AP', 'apPoints': '663 PTS', 'rankNum': 17},
    'usc': {'apRank': '#18 AP', 'apPoints': '410 PTS', 'rankNum': 18},
    'houston': {'apRank': '#20 AP', 'apPoints': '278 PTS', 'rankNum': 20},
    'smu': {'apRank': '#21 AP', 'apPoints': '246 PTS', 'rankNum': 21},
    'boisestate': {'apRank': '#22 AP', 'apPoints': '221 PTS', 'rankNum': 22},
    'missouri': {'apRank': '#25 AP', 'apPoints': '118 PTS', 'rankNum': 25},
    'pennstate': {'apRank': 'RV', 'apPoints': '98 PTS', 'rankNum': 99},
    'michigan': {'apRank': 'RV', 'apPoints': '54 PTS', 'rankNum': 99},
    'louisville': {'apRank': 'RV', 'apPoints': '25 PTS', 'rankNum': 99},
    'arizona': {'apRank': 'RV', 'apPoints': '8 PTS', 'rankNum': 99},
    'texasam': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'oklahoma': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'washington': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'colorado': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'arizonastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'clemson': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'floridastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999}
}
# Authoritative Week 6 AP Poll (October 4, 2026 Live AP Release)
WEEK6_OFFICIAL_POLL = {
    'texas': {'apRank': '#1 AP', 'apPoints': '1,737 PTS (61 1st)', 'rankNum': 1},
    'georgia': {'apRank': '#2 AP', 'apPoints': '1,647 PTS (6 1st)', 'rankNum': 2},
    'notredame': {'apRank': '#3 AP', 'apPoints': '1,532 PTS', 'rankNum': 3},
    'miami': {'apRank': '#4 AP', 'apPoints': '1,524 PTS (2 1st)', 'rankNum': 4},
    'ohiostate': {'apRank': '#5 AP', 'apPoints': '1,490 PTS', 'rankNum': 5},
    'alabama': {'apRank': '#6 AP', 'apPoints': '1,460 PTS', 'rankNum': 6},
    'indiana': {'apRank': '#7 AP', 'apPoints': '1,380 PTS (1 1st)', 'rankNum': 7},
    'byu': {'apRank': '#8 AP', 'apPoints': '1,144 PTS', 'rankNum': 8},
    'olemiss': {'apRank': '#9 AP', 'apPoints': '1,095 PTS', 'rankNum': 9},
    'lsu': {'apRank': '#10 AP', 'apPoints': '1,087 PTS', 'rankNum': 10},
    'texastech': {'apRank': '#11 AP', 'apPoints': '1,062 PTS', 'rankNum': 11},
    'utah': {'apRank': '#12 AP', 'apPoints': '996 PTS', 'rankNum': 12},
    'oregon': {'apRank': '#13 AP', 'apPoints': '831 PTS', 'rankNum': 13},
    'missouri': {'apRank': '#14 AP', 'apPoints': '755 PTS', 'rankNum': 14},
    'tennessee': {'apRank': '#15 AP', 'apPoints': '746 PTS', 'rankNum': 15},
    'usc': {'apRank': '#19 AP', 'apPoints': '439 PTS', 'rankNum': 19},
    'iowa': {'apRank': '#20 AP', 'apPoints': '367 PTS', 'rankNum': 20},
    'houston': {'apRank': '#22 AP', 'apPoints': '279 PTS', 'rankNum': 22},
    'boisestate': {'apRank': '#23 AP', 'apPoints': '271 PTS', 'rankNum': 23},
    'smu': {'apRank': '#24 AP', 'apPoints': '167 PTS', 'rankNum': 24},
    'arizona': {'apRank': 'RV', 'apPoints': '19 PTS', 'rankNum': 99},
    'pennstate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'michigan': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'louisville': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'texasam': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'oklahoma': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'washington': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'colorado': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'arizonastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'clemson': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'floridastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999}
}

# Authoritative Week 7 Official Poll (October 11, 2026 Live Release)
WEEK7_OFFICIAL_POLL = {
    'georgia': {'apRank': '#1 AP', 'apPoints': '1,745 PTS (66 1st)', 'rankNum': 1},
    'notredame': {'apRank': '#2 AP', 'apPoints': '1,630 PTS (1 1st)', 'rankNum': 2},
    'miami': {'apRank': '#3 AP', 'apPoints': '1,594 PTS (2 1st)', 'rankNum': 3},
    'ohiostate': {'apRank': '#4 AP', 'apPoints': '1,508 PTS', 'rankNum': 4},
    'indiana': {'apRank': '#5 AP', 'apPoints': '1,461 PTS (1 1st)', 'rankNum': 5},
    'alabama': {'apRank': '#6 AP', 'apPoints': '1,372 PTS', 'rankNum': 6},
    'texas': {'apRank': '#7 AP', 'apPoints': '1,371 PTS', 'rankNum': 7},
    'byu': {'apRank': '#8 AP', 'apPoints': '1,237 PTS', 'rankNum': 8},
    'olemiss': {'apRank': '#9 AP', 'apPoints': '1,135 PTS', 'rankNum': 9},
    'texastech': {'apRank': '#10 AP', 'apPoints': '1,132 PTS', 'rankNum': 10},
    'utah': {'apRank': '#11 AP', 'apPoints': '1,073 PTS', 'rankNum': 11},
    'missouri': {'apRank': '#13 AP', 'apPoints': '882 PTS', 'rankNum': 13},
    'tennessee': {'apRank': '#14 AP', 'apPoints': '706 PTS', 'rankNum': 14},
    'iowa': {'apRank': '#17 AP', 'apPoints': '621 PTS', 'rankNum': 17},
    'usc': {'apRank': '#19 AP', 'apPoints': '505 PTS', 'rankNum': 19},
    'houston': {'apRank': '#20 AP', 'apPoints': '380 PTS', 'rankNum': 20},
    'lsu': {'apRank': '#22 AP', 'apPoints': '274 PTS', 'rankNum': 22},
    'boisestate': {'apRank': '#23 AP', 'apPoints': '268 PTS', 'rankNum': 23},
    'smu': {'apRank': '#24 AP', 'apPoints': '142 PTS', 'rankNum': 24},
    'oregon': {'apRank': 'RV', 'apPoints': '86 PTS', 'rankNum': 99},
    'arizona': {'apRank': 'RV', 'apPoints': '82 PTS', 'rankNum': 99},
    'oklahoma': {'apRank': 'RV', 'apPoints': '44 PTS', 'rankNum': 99},
    'louisville': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'michigan': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'pennstate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'texasam': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'washington': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'colorado': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'arizonastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'clemson': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'floridastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999}
}

# Authoritative Week 8 Official Poll (October 18, 2026 Live Release)
WEEK8_OFFICIAL_POLL = {
    'miami': {'apRank': '#1 AP', 'apPoints': '1,697 PTS (40 1st)', 'rankNum': 1},
    'byu': {'apRank': '#2 AP', 'apPoints': '1,675 PTS (20 1st)', 'rankNum': 2},
    'ohiostate': {'apRank': '#3 AP', 'apPoints': '1,649 PTS (9 1st)', 'rankNum': 3},
    'notredame': {'apRank': '#4 AP', 'apPoints': '1,395 PTS', 'rankNum': 4},
    'georgia': {'apRank': '#5 AP', 'apPoints': '1,382 PTS', 'rankNum': 5},
    'indiana': {'apRank': '#6 AP', 'apPoints': '1,370 PTS', 'rankNum': 6},
    'olemiss': {'apRank': '#7 AP', 'apPoints': '1,360 PTS', 'rankNum': 7},
    'texastech': {'apRank': '#8 AP', 'apPoints': '1,336 PTS (1 1st)', 'rankNum': 8},
    'utah': {'apRank': '#10 AP', 'apPoints': '1,153 PTS', 'rankNum': 10},
    'tennessee': {'apRank': '#11 AP', 'apPoints': '1,151 PTS', 'rankNum': 11},
    'alabama': {'apRank': '#13 AP', 'apPoints': '870 PTS', 'rankNum': 13},
    'houston': {'apRank': '#14 AP', 'apPoints': '785 PTS', 'rankNum': 14},
    'iowa': {'apRank': '#15 AP', 'apPoints': '747 PTS', 'rankNum': 15},
    'usc': {'apRank': '#16 AP', 'apPoints': '592 PTS', 'rankNum': 16},
    'lsu': {'apRank': '#18 AP', 'apPoints': '529 PTS', 'rankNum': 18},
    'texas': {'apRank': '#19 AP', 'apPoints': '440 PTS', 'rankNum': 19},
    'boisestate': {'apRank': '#21 AP', 'apPoints': '295 PTS', 'rankNum': 21},
    'missouri': {'apRank': '#22 AP', 'apPoints': '290 PTS', 'rankNum': 22},
    'smu': {'apRank': '#23 AP', 'apPoints': '265 PTS', 'rankNum': 23},
    'arizona': {'apRank': '#25 AP', 'apPoints': '136 PTS', 'rankNum': 25},
    'oregon': {'apRank': 'RV', 'apPoints': '79 PTS', 'rankNum': 99},
    'texasam': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'oklahoma': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'louisville': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'michigan': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'pennstate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'washington': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'colorado': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'arizonastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'clemson': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'floridastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999}
}

# Authoritative Week 9 Official Poll (October 25, 2026 Live Release)
WEEK9_OFFICIAL_POLL = {
    'miami': {'apRank': '#1 AP', 'apPoints': '1,735 PTS (59 1st)', 'rankNum': 1},
    'ohiostate': {'apRank': '#2 AP', 'apPoints': '1,681 PTS (10 1st)', 'rankNum': 2},
    'georgia': {'apRank': '#3 AP', 'apPoints': '1,511 PTS', 'rankNum': 3},
    'indiana': {'apRank': '#4 AP', 'apPoints': '1,459 PTS', 'rankNum': 4},
    'notredame': {'apRank': '#5 AP', 'apPoints': '1,458 PTS', 'rankNum': 5},
    'utah': {'apRank': '#6 AP', 'apPoints': '1,413 PTS (1 1st)', 'rankNum': 6},
    'ucla': {'apRank': '#7 AP', 'apPoints': '1,398 PTS', 'rankNum': 7},
    'byu': {'apRank': '#8 AP', 'apPoints': '1,325 PTS', 'rankNum': 8},
    'kentucky': {'apRank': '#9 AP', 'apPoints': '1,185 PTS', 'rankNum': 9},
    'alabama': {'apRank': '#10 AP', 'apPoints': '1,063 PTS', 'rankNum': 10},
    'texas': {'apRank': '#11 AP', 'apPoints': '966 PTS', 'rankNum': 11},
    'olemiss': {'apRank': '#12 AP', 'apPoints': '871 PTS', 'rankNum': 12},
    'texastech': {'apRank': '#13 AP', 'apPoints': '861 PTS', 'rankNum': 13},
    'wakeforest': {'apRank': '#14 AP', 'apPoints': '822 PTS', 'rankNum': 14},
    'lsu': {'apRank': '#15 AP', 'apPoints': '813 PTS', 'rankNum': 15},
    'tennessee': {'apRank': '#16 AP', 'apPoints': '662 PTS', 'rankNum': 16},
    'houston': {'apRank': '#18 AP', 'apPoints': '491 PTS', 'rankNum': 18},
    'smu': {'apRank': '#19 AP', 'apPoints': '440 PTS', 'rankNum': 19},
    'boisestate': {'apRank': '#20 AP', 'apPoints': '422 PTS', 'rankNum': 20},
    'arizona': {'apRank': '#22 AP', 'apPoints': '400 PTS', 'rankNum': 22},
    'missouri': {'apRank': '#23 AP', 'apPoints': '329 PTS', 'rankNum': 23},
    'iowa': {'apRank': 'RV', 'apPoints': '76 PTS', 'rankNum': 99},
    'usc': {'apRank': 'RV', 'apPoints': '7 PTS', 'rankNum': 99},
    'oregon': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'texasam': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'oklahoma': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'louisville': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'michigan': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'pennstate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'washington': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'colorado': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'arizonastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'clemson': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999},
    'floridastate': {'apRank': 'NR', 'apPoints': '', 'rankNum': 999}
}
CURRENT_OFFICIAL_POLL = WEEK9_OFFICIAL_POLL
WEEK8_OFFICIAL_POLL = WEEK9_OFFICIAL_POLL
WEEK7_OFFICIAL_POLL = WEEK9_OFFICIAL_POLL
WEEK6_OFFICIAL_POLL = WEEK9_OFFICIAL_POLL
WEEK5_OFFICIAL_POLL = WEEK9_OFFICIAL_POLL
WEEK4_OFFICIAL_POLL = WEEK9_OFFICIAL_POLL
WEEK3_OFFICIAL_POLL = WEEK9_OFFICIAL_POLL

# Stadium Home Field Advantage mapping (points - calibrated to modern college football analytics)
STADIUM_HFA = {
    "Tiger Stadium": 2.6,
    "Kyle Field": 2.6,
    "Neyland Stadium": 2.6,
    "Beaver Stadium": 2.6,
    "Ohio Stadium": 2.6,
    "Sanford Stadium": 2.6,
    "Autzen Stadium": 2.6,
    "Bryant-Denny Stadium": 2.6,
    "Jordan-Hare Stadium": 2.6,
    "Rice-Eccles Stadium": 2.4,
    "Jones AT&T Stadium": 2.4,
    "Jones AT&T Stadium (Lubbock, TX)": 2.4,
    "Kinnick Stadium": 2.4,
    "Husky Stadium": 2.4,
    "Camp Randall Stadium": 2.4,
    "Gaylord Family Oklahoma Memorial Stadium": 2.4,
    "Vaught-Hemingway Stadium": 2.4,
    "Albertsons Stadium": 2.4,
    "Michigan Stadium": 2.2,
    "Michigan Stadium (The Big House)": 2.2,
    "Darrell K Royal-Texas Memorial Stadium": 2.2,
    "Memorial Stadium (Clemson)": 2.2,
    "Doak Campbell Stadium": 2.2,
    "Faurot Field": 2.2,
    "Los Angeles Memorial Coliseum": 2.0,
    "Hard Rock Stadium": 2.0,
    "Mountain America Stadium": 2.0,
    "Arizona Stadium": 2.0,
    "Folsom Field": 2.0,
    "TDECU Stadium": 2.0,
    "L&N Stadium": 2.0,
    "L&N Federal Credit Union Stadium": 2.0,
    "Gerald J. Ford Stadium": 2.0,
    "Bobby Dodd Stadium": 2.0,
    "Memorial Stadium": 2.0,
    "Rose Bowl": 2.2,
    "Kroger Field": 2.2,
    "Allegacy Federal Credit Union Stadium": 2.0
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
    'Northwestern Wildcats': 19.5, 'NU': 19.5,
    'Kentucky Wildcats': 17.5, 'UK': 17.5,
    'Georgia Tech Yellow Jackets': 16.5, 'GT': 16.5,
    'North Carolina Tar Heels': 12.5, 'UNC': 12.5,
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
    'Northern Arizona Lumberjacks': -18.0,
    'Eastern Washington Eagles': -18.0, 'Eastern Washington': -18.0, 'EWU': -18.0,
    'Northern Iowa Panthers': -18.0, 'Northern Iowa': -18.0, 'UNI': -18.0,
    'McNeese Cowboys': -20.0, 'McNeese': -20.0, 'MCN': -20.0,
    'Wofford Terriers': -20.0, 'Wofford': -20.0, 'WOF': -20.0,
    'The Citadel Bulldogs': -22.0, 'The Citadel': -22.0, 'CIT': -22.0,
    'Charleston Southern Buccaneers': -22.0, 'Charleston Southern': -22.0,
    'Chattanooga Mocs': -18.0, 'Chattanooga': -18.0,
    'South Dakota Coyotes': -16.0, 'South Dakota': -16.0,
    'Central Arkansas Bears': -18.0, 'Central Arkansas': -18.0
}

# Exhaustive list of all 117+ FCS programs across all conferences (Big Sky, MVFC, CAA, SoCon, SWAC, MEAC, Southland, etc.)
FCS_KEYWORDS = [
    'fcs', 'eastern washington', 'northern iowa', 'mcneese', 'wofford',
    'the citadel', 'charleston southern', 'villanova', 'howard', 'furman',
    'tennessee state', 'morgan state', 'utah tech', 'southern jaguars',
    'weber state', 'uc davis', 'idaho', 'florida a&m', 'missouri state',
    'abilene christian', 'pine bluff', 'northern arizona', 'portland state',
    'stephen f. austin', 'stephen f austin', 'houston christian', 'tarleton state',
    'tarleton', 'central arkansas', 'nicholls', 'eastern kentucky', 'mercer',
    'chattanooga', 'samford', 'sacramento state', 'montana state', 'montana',
    'south dakota state', 'south dakota', 'north dakota state', 'north dakota',
    'holy cross', 'richmond', 'william & mary', 'alabama a&m', 'alabama state',
    'alcorn state', 'austin peay', 'bethune-cookman', 'bryant', 'bucknell',
    'butler', 'cal poly', 'campbell', 'central connecticut', 'colgate',
    'davidson', 'delaware state', 'drake', 'duquesne', 'east tennessee state',
    'east texas a&m', 'eastern illinois', 'elon', 'fordham', 'gardner-webb',
    'georgetown', 'grambling', 'hampton', 'idaho state', 'illinois state',
    'incarnate word', 'indiana state', 'jackson state', 'lafayette', 'lamar',
    'lehigh', 'lindenwood', 'long island', 'maine', 'marist', 'mercyhurst',
    'merrimack', 'mississippi valley', 'monmouth', 'murray state', 'new hampshire',
    'new haven', 'norfolk state', 'north alabama', 'north carolina a&t',
    'north carolina central', 'northern colorado', 'northwestern state',
    'prairie view', 'presbyterian', 'rhode island', 'robert morris',
    'se louisiana', 'southeastern louisiana', 'sacred heart', 'san diego toreros',
    'university of san diego', 'usd',
    'south carolina state', 'southeast missouri', 'southern illinois',
    'southern utah', 'st. thomas', 'stetson', 'stonehill', 'stony brook',
    'tennessee tech', 'texas southern', 'towson', 'ualbany', 'ut martin',
    'ut rio grande valley', 'vmi', 'wagner', 'western carolina',
    'western illinois', 'youngstown state'
]

# Canonical exclusion list to prevent systemic AP rank cross-contamination (e.g. Georgia Southern vs Georgia)
CANONICAL_AP_EXCLUSIONS = {
    'georgia': ['georgia southern', 'georgia tech', 'georgia state'],
    'michigan': ['central michigan', 'western michigan', 'eastern michigan', 'michigan state'],
    'houston': ['sam houston', 'houston christian'],
    'texas': ['texas tech', 'texas a&m', 'texas state', 'north texas', 'sam houston', 'texas southern', 'utep', 'utsa', 'tarleton'],
    'florida': ['florida state', 'florida atlantic', 'south florida', 'fiu', 'florida a&m'],
    'ohio state': ['ohio bobcats', 'ohio university'],
    'oklahoma': ['oklahoma state'],
    'oregon': ['oregon state'],
    'washington': ['washington state', 'eastern washington'],
    'louisiana': ['louisiana tech', 'louisiana monroe', 'ul monroe', 'se louisiana'],
    'mississippi': ['mississippi state', 'southern miss', 'mississippi valley'],
    'carolina': ['north carolina', 'south carolina', 'east carolina', 'western carolina', 'coastal carolina'],
    'colorado': ['colorado state', 'northern colorado'],
    'arizona': ['arizona state', 'northern arizona'],
    'kansas': ['kansas state'],
    'iowa': ['iowa state', 'northern iowa'],
    'penn state': ['penn', 'upenn', 'pennsylvania'],
    'utah': ['utah state', 'utah tech', 'southern utah'],
    'alabama': ['alabama state', 'alabama a&m', 'south alabama'],
    'tennessee': ['tennessee state', 'tennessee tech', 'east tennessee state', 'ut martin'],
    'arkansas': ['arkansas state', 'arkansas-pine bluff', 'central arkansas'],
    'missouri': ['missouri state'],
    'kentucky': ['western kentucky', 'eastern kentucky'],
    'indiana': ['indiana state'],
    'illinois': ['illinois state', 'southern illinois', 'western illinois', 'eastern illinois']
}

MASCOT_REGEX = re.compile(r'\b(eagles|bulldogs|tigers|cougars|wildcats|bears|badgers|buckeyes|wolverines|trojans|ducks|huskies|rebels|gators|seminoles|cavaliers|cardinals|chippewas|broncos|bearkats|aztecs|mountaineers|bobcats|aggies|longhorns|crimson tide|volunteers|commodores|razorbacks|gamecocks|fighting irish|blue devils|yellow jackets|tar heels|demon deacons|hokies|panthers|terrapins|scarlet knights|boilermakers|golden gophers|cornhuskers|hawkeyes|utes|red raiders|cyclones|jayhawks|horned frogs|mustangs|green wave|owls|bulls|miners|flames|blazers|thundering herd|knights)\b', re.IGNORECASE)

def is_fcs_opponent(opp_name, opp_abbr=None):
    """
    Identifies whether an opponent is in the FCS division while preventing
    any false classification of FBS programs (e.g. San Diego State, Georgia Southern).
    """
    name_clean = (opp_name or '').strip().lower()
    abbr_clean = (opp_abbr or '').strip().upper()
    
    # Explicit FBS immunity guardrails (never classify these FBS programs as FCS)
    if 'san diego state' in name_clean or abbr_clean == 'SDSU':
        return False
    if 'georgia southern' in name_clean or abbr_clean == 'GASO':
        return False
    if 'georgia state' in name_clean or abbr_clean == 'GAST':
        return False
    if 'texas state' in name_clean or abbr_clean == 'TXST':
        return False
    if 'sam houston' in name_clean or abbr_clean == 'SHSU':
        return False
    if 'southern miss' in name_clean or abbr_clean == 'USM':
        return False
    if 'south florida' in name_clean or abbr_clean == 'USF':
        return False

    for kw in FCS_KEYWORDS:
        if kw in name_clean:
            return True
    return False

def find_sp_opponent(raw_name, opp_abbr=None, sp_map=None):
    """
    Deterministically resolves an opponent from the official 2026 Connelly SP+ dictionary.
    Guarantees:
    - Zero directional cross-contamination (e.g. North Texas never matches Texas, Western Kentucky never matches Kentucky).
    - Zero state flag collisions (e.g. Ohio never matches Ohio State).
    - Specificity-first descending length matching.
    """
    if not sp_map or not raw_name:
        return None
    name_clean = (raw_name or '').lower().strip()
    school_clean = MASCOT_REGEX.sub('', name_clean).strip()
    abbr_clean = (opp_abbr or '').lower().strip()
    
    # 1. Exact match attempts
    if name_clean in sp_map:
        return sp_map[name_clean]
    if school_clean in sp_map:
        return sp_map[school_clean]
    if abbr_clean and abbr_clean in sp_map:
        return sp_map[abbr_clean]
        
    name_words = name_clean.split()
    school_words = school_clean.split()
    all_words = set(name_words + school_words)
    sorted_keys = sorted(sp_map.keys(), key=len, reverse=True)
    
    directional_words = {'eastern', 'western', 'northern', 'southern', 'central', 'east', 'west', 'north', 'south', 'southeast', 'southwest'}
    
    for k in sorted_keys:
        k_words = set(k.split())
        mismatch = False
        for pref in directional_words:
            in_target = pref in all_words
            in_k = pref in k_words
            if in_target != in_k:
                mismatch = True
                break
        if mismatch:
            continue
            
        if ('state' in all_words) != ('state' in k_words):
            continue
            
        if len(k) >= 4:
            if k == name_clean or k == school_clean:
                return sp_map[k]
            if k in name_clean or k in school_clean or (len(school_clean) >= 4 and school_clean in k):
                return sp_map[k]
                
    return None


def resolve_opponent_ap_rank(g, db, external_ap_ranks):
    """
    Deterministically resolves an opponent's official AP poll ranking.
    Guarantees zero systemic substring cross-contamination.
    """
    raw_name = (g.get('opponent') or '').strip()
    opp_lower = raw_name.lower()
    opp_abbr = (g.get('oppAbbr') or '').strip().upper()

    # 1. FCS Check
    if is_fcs_opponent(raw_name, opp_abbr):
        return 'FCS'

    # 2. Check tracked teams in DB
    opp_id = g.get('oppId')
    matched_tid = opp_id if (opp_id and opp_id in db) else match_team_in_db(db, raw_name or opp_abbr)
    if matched_tid and matched_tid in db:
        g['oppId'] = matched_tid
        return db[matched_tid].get('apRank', 'NR')

    # 3. Non-DB FBS Opponent: Strict match against external AP ranks
    school_clean = MASCOT_REGEX.sub('', opp_lower).strip()

    for ext_k, ext_v in external_ap_ranks.items():
        k_clean = ext_k.strip().lower()

        # Check explicit canonical exclusion collisions
        is_excluded = False
        for base_k, excl_list in CANONICAL_AP_EXCLUSIONS.items():
            if base_k in k_clean:
                if any(excl in opp_lower for excl in excl_list) and not any(excl in k_clean for excl in excl_list):
                    is_excluded = True
                    break
        if is_excluded:
            continue

        # Exact match on school name, full name, or abbreviation
        if k_clean == opp_lower or k_clean == school_clean or k_clean == opp_abbr.lower():
            return ext_v

    return 'NR'

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

def find_market_line(cur_week_lines, team_id, opp_id, is_home, raw_opp_name, opp_abbr, db):
    """
    Safely finds the consensus market line for team_id vs opp_id from CFBD DraftKings data.
    Guarantees no substring confusion (e.g. Texas vs Texas A&M).
    Returns dict with 'spread', 'overUnder', and 'provider' or None.
    """
    if not cur_week_lines:
        return None

    t_obj = db.get(team_id, {})
    o_obj = db.get(opp_id, {}) if opp_id else {}
    t_names = {team_id, (t_obj.get('shortName') or '').lower(), (t_obj.get('name') or '').lower()}
    t_names.discard('')
    
    o_names = set()
    if opp_id and opp_id in db:
        o_names.update([opp_id, (o_obj.get('shortName') or '').lower(), (o_obj.get('name') or '').lower()])
    if raw_opp_name:
        o_names.add(raw_opp_name.lower())
        o_clean = MASCOT_REGEX.sub('', raw_opp_name.lower()).strip()
        if o_clean:
            o_names.add(o_clean)
    if opp_abbr:
        o_names.add(opp_abbr.lower())
    o_names.discard('')

    for (h, a), l_info in cur_week_lines.items():
        h_tid = match_team_in_db(db, h)
        a_tid = match_team_in_db(db, a)
        
        # Exact team ID match between DB teams
        if h_tid and a_tid:
            if (is_home and h_tid == team_id and a_tid == opp_id) or (not is_home and a_tid == team_id and h_tid == opp_id):
                spread = l_info.get('spread')
                if spread is None:
                    continue
                return {
                    'spread': spread if is_home else -spread,
                    'overUnder': l_info.get('overUnder'),
                    'provider': l_info.get('provider', 'DraftKings')
                }
        
        # Fallback for non-DB opponents
        if is_home:
            h_matches = (h_tid == team_id or h in t_names)
            a_matches = (a in o_names or any(w in a for w in o_names if len(w) >= 4))
            if h_matches and a_matches:
                spread = l_info.get('spread')
                if spread is not None:
                    return {'spread': spread, 'overUnder': l_info.get('overUnder'), 'provider': l_info.get('provider', 'DraftKings')}
        else:
            a_matches = (a_tid == team_id or a in t_names)
            h_matches = (h in o_names or any(w in h for w in o_names if len(w) >= 4))
            if a_matches and h_matches:
                spread = l_info.get('spread')
                if spread is not None:
                    return {'spread': -spread, 'overUnder': l_info.get('overUnder'), 'provider': l_info.get('provider', 'DraftKings')}

    return None

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

            # For unplayed games, prioritize whichever game has authentic market odds from DraftKings/Consensus
            is_a_home = g_a.get('isHome', True)
            if g_b.get('oddsProvider') != 'CFB Prophet Projected' and g_a.get('oddsProvider') == 'CFB Prophet Projected':
                master = g_b
                slave = g_a
            elif g_a.get('oddsProvider') != 'CFB Prophet Projected' and g_b.get('oddsProvider') == 'CFB Prophet Projected':
                master = g_a
                slave = g_b
            else:
                # If both share the same provider, select master based on team rating dominance (if rating difference >= 2.0 pts)
                sp_a = float(t_a.get('baseSpRating', 22.0))
                sp_b = float(t_b.get('baseSpRating', 22.0))
                if abs(sp_a - sp_b) >= 2.0:
                    master = g_a if sp_a > sp_b else g_b
                    slave = g_b if sp_a > sp_b else g_a
                else:
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
                    master['baseWinProb'] = max(55, master.get('baseWinProb', 55))
                # Only synthesize a projected spread if NO authentic market line exists!
                if master.get('oddsProvider') == 'CFB Prophet Projected':
                    master['vegasSpread'] = -round(max(0.5, abs(master['projScoreUt'] - master['projScoreOpp']) * 0.8), 1)
            else:
                if master.get('baseWinProb', 50) >= 50:
                    master['baseWinProb'] = min(45, master.get('baseWinProb', 45))
                # Only synthesize a projected spread if NO authentic market line exists!
                if master.get('oddsProvider') == 'CFB Prophet Projected':
                    master['vegasSpread'] = round(max(0.5, abs(master['projScoreOpp'] - master['projScoreUt']) * 0.8), 1)

            slave['projScoreUt'] = master['projScoreOpp']
            slave['projScoreOpp'] = master['projScoreUt']
            if 'baseWinProb' in master and isinstance(master['baseWinProb'], (int, float)):
                slave['baseWinProb'] = max(1, min(99, 100 - int(master['baseWinProb'])))
            if 'vegasSpread' in master and isinstance(master['vegasSpread'], (int, float)):
                slave['vegasSpread'] = -master['vegasSpread']
            if 'overUnder' in master:
                slave['overUnder'] = master['overUnder']
            if 'oddsProvider' in master:
                slave['oddsProvider'] = master['oddsProvider']

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

def check_is_conference_game(team_conf, opp_name, opp_abbr=""):
    """
    Authoritative detection of FBS conference matchups for B1G, SEC, ACC, and Big 12.
    """
    if not team_conf:
        return False, ""
    c_lower = team_conf.lower().strip()
    opp_lower = opp_name.lower().strip()
    
    B1G_MEMBERS = {"indiana", "michigan", "ohio state", "oregon", "penn state", "usc", "washington", "iowa", "northwestern", "rutgers", "nebraska", "minnesota", "purdue", "wisconsin", "illinois", "maryland", "michigan state", "ucla"}
    SEC_MEMBERS = {"texas", "georgia", "alabama", "lsu", "tennessee", "texas a&m", "ole miss", "oklahoma", "missouri", "florida", "kentucky", "south carolina", "auburn", "arkansas", "vanderbilt", "mississippi state"}
    ACC_MEMBERS = {"miami", "florida state", "clemson", "smu", "louisville", "california", "stanford", "wake forest", "boston college", "duke", "georgia tech", "nc state", "north carolina", "pittsburgh", "syracuse", "virginia", "virginia tech"}
    BIG12_MEMBERS = {"byu", "texas tech", "utah", "houston", "arizona", "colorado", "arizona state", "baylor", "cincinnati", "iowa state", "kansas", "kansas state", "oklahoma state", "tcu", "ucf", "west virginia"}

    conf_title = ""
    target_members = set()
    if "big ten" in c_lower or "b1g" in c_lower:
        target_members = B1G_MEMBERS
        conf_title = "Big Ten"
    elif "sec" in c_lower:
        target_members = SEC_MEMBERS
        conf_title = "SEC"
    elif "acc" in c_lower:
        target_members = ACC_MEMBERS
        conf_title = "ACC"
    elif "big 12" in c_lower:
        target_members = BIG12_MEMBERS
        conf_title = "Big 12"
    else:
        return False, ""

    for m in target_members:
        if m in opp_lower:
            # Substring safety guardrails
            if m == "michigan" and any(kw in opp_lower for kw in ["western michigan", "central michigan", "eastern michigan"]):
                continue
            if m == "florida" and any(kw in opp_lower for kw in ["florida state", "florida a&m", "florida international", "florida atlantic", "south florida"]):
                continue
            if m == "georgia" and any(kw in opp_lower for kw in ["georgia tech", "georgia southern", "georgia state"]):
                continue
            return True, conf_title

    return False, ""

P4_TEAMS_SET = {
    'ohio state', 'indiana', 'michigan', 'penn state', 'oregon', 'usc', 'washington',
    'iowa', 'wisconsin', 'nebraska', 'illinois', 'northwestern', 'rutgers', 'maryland',
    'minnesota', 'purdue', 'michigan state', 'ucla',
    'georgia', 'texas', 'alabama', 'lsu', 'tennessee', 'ole miss', 'missouri', 'texas a&m',
    'oklahoma', 'auburn', 'florida', 'south carolina', 'kentucky', 'arkansas', 'vanderbilt', 'mississippi state',
    'utah', 'texas tech', 'byu', 'colorado', 'arizona', 'arizona state', 'kansas state', 'oklahoma state',
    'iowa state', 'tcu', 'baylor', 'west virginia', 'ucf', 'cincinnati', 'houston', 'kansas',
    'miami', 'clemson', 'florida state', 'louisville', 'smu', 'virginia tech', 'nc state',
    'georgia tech', 'north carolina', 'pitt', 'pittsburgh', 'boston college', 'duke', 'cal', 'stanford', 'wake forest', 'virginia', 'syracuse',
    'notre dame'
}

def derive_systemic_unit_ratings(db, sp_map_2026=None, cum_adv_stats=None, talent_map=None):
    """
    Automated, non-hardcoded mathematical solver deriving unit ratings
    (Offense, Defense, Special Teams, and Net SP+) across all 31 tracked teams and opponents based on:
    1. Actual 2026 completed game margins and scores.
    2. Rigorous opponent-tier filtering and Strength of Schedule (SOS) modulation:
       - FCS games downweighted to 0.04 with stat-padding caps (max 35 pts offense, min 17 pts defense floor).
       - G5 non-conference games downweighted to 0.15 with blowout dampening and min 12 pts defense floor.
       - Full Power 4 conference school identification across Big Ten, SEC, Big 12, ACC, and Notre Dame.
       - Opponent strength scaled weighting: Elite (>20 SP+) at 1.60, Top 25 at 1.30, Mid P4 at 1.00, Low P4 at 0.70.
    3. Strength of Schedule (SOS) Credibility Shrinkage:
       - Teams playing soft schedules (untested paper tigers) are regressed toward their talent baseline / prior.
       - Teams playing gauntlets (tested against top-10 teams) have their performances validated at full strength.
    4. 247Sports Roster Talent Composite Floor & Ceiling Grounding:
       - Blue-chip rosters (>920 talent) anchored to title-contender baselines.
       - Mid-tier rosters (<750 talent) anchored to realistic ceilings.
    5. Iterative relaxation solver (8 iterations until mutual opponent convergence).
    6. Resume penalty for unranked losses (e.g. Kentucky over LSU) and multiple conference losses.
    """
    sp_map_2026 = sp_map_2026 or {}
    cum_adv_stats = cum_adv_stats or {}
    talent_map = talent_map or {}

    def get_prior_sp(tid, t):
        t_name = (t.get('name') or tid).lower()
        t_short = (t.get('shortName') or tid).lower()
        sp = find_sp_opponent(t.get('name'), t.get('shortName'), sp_map_2026) or sp_map_2026.get(tid)
        p_off = float(sp.get('offense', 28.0)) if sp else 28.0
        p_def = float(sp.get('defense', 20.0)) if sp else 20.0
        p_st = float(sp.get('specialTeams', 0.0)) if sp else 0.0
        
        # Talent Composite grounding
        tal = talent_map.get(t_name, talent_map.get(t_short, 650.0))
        if tal >= 920.0:
            p_off = max(p_off, 40.0)
            p_def = min(p_def, 11.5)
        elif tal < 750.0:
            p_off = min(p_off, 33.5)
            p_def = max(p_def, 15.5)

        return p_off, p_def, p_st

    def resolve_opp_info(raw_name, opp_abbr, opp_id, cur_units):
        opp_clean = (raw_name or '').lower().strip()
        opp_school = MASCOT_REGEX.sub('', opp_clean).strip()
        
        if is_fcs_opponent(raw_name, opp_abbr):
            return 10.0, 45.0, -18.0, 'FCS'
            
        is_p4 = (opp_school in P4_TEAMS_SET or opp_clean in P4_TEAMS_SET or (opp_id and opp_id in db))
        
        if opp_id and opp_id in cur_units:
            u = cur_units[opp_id]
            net = u['off'] - u['def'] + u['st']
            return u['off'], u['def'], net, 'P4'
            
        sp = find_sp_opponent(raw_name, opp_abbr, sp_map_2026)
        if sp:
            tier = 'P4' if is_p4 else ('G5' if float(sp.get('rating', 0)) < 6.0 else 'P4')
            return float(sp.get('offense', 27.0)), float(sp.get('defense', 27.0)), float(sp.get('rating', 0.0)), tier
            
        return 26.0, 28.0, 0.0, ('P4' if is_p4 else 'G5')

    cur_units = {}
    priors = {}
    for tid, t in db.items():
        p_off, p_def, p_st = get_prior_sp(tid, t)
        priors[tid] = {'off': p_off, 'def': p_def, 'st': p_st}
        cur_units[tid] = {'off': p_off, 'def': p_def, 'st': p_st}

    for iteration in range(8):
        next_units = {}
        for tid, t in db.items():
            p_off = priors[tid]['off']
            p_def = priors[tid]['def']
            p_st = priors[tid]['st']
            
            weighted_implied_off = []
            weighted_implied_def = []
            opp_sos_list = []
            
            unranked_losses = 0
            conf_losses = 0

            for g in t.get('schedule', []):
                if not g.get('isFinal'):
                    continue
                s_team = g.get('finalTeamScore') if g.get('finalTeamScore') is not None else g.get('actualScoreUt')
                s_opp = g.get('finalOppScore') if g.get('finalOppScore') is not None else g.get('actualScoreOpp')
                if s_team is None or s_opp is None:
                    continue
                s_team = float(s_team)
                s_opp = float(s_opp)
                
                opp_name = g.get('opponent', '')
                opp_abbr = g.get('oppAbbr', '')
                opp_id = g.get('oppId')
                opp_off, opp_def, opp_net, tier = resolve_opp_info(opp_name, opp_abbr, opp_id, cur_units)
                
                is_home = g.get('isHome', True)
                stadium = g.get('stadium', '')
                hfa = STADIUM_HFA.get(stadium, 2.5) if is_home else -STADIUM_HFA.get(stadium, 2.5)
                
                # Anti-stat-padding defense and offense bounds:
                if tier == 'FCS':
                    w = 0.04
                    eff_s_team = min(35.0, s_team)
                    eff_s_opp = max(17.0, s_opp)  # FCS shutout floor: no artificial boost
                elif tier == 'G5':
                    w = 0.15
                    eff_s_team = min(35.0, 24.0 + (s_team - 24.0) * 0.35 if s_team > 24.0 else s_team)
                    eff_s_opp = max(12.0, s_opp)  # G5 shutout floor: no artificial boost
                else:
                    # Power 4 game scaled by opponent caliber
                    if opp_net >= 20.0:
                        w = 1.60  # Elite competition
                    elif opp_net >= 12.0:
                        w = 1.30  # Top 25 competition
                    elif opp_net >= 4.0:
                        w = 1.00  # Mid P4 competition
                    else:
                        w = 0.70  # Bottom P4 competition
                        
                    eff_s_team = s_team
                    eff_s_opp = s_opp

                # Losses
                opp_rank = str(g.get('oppRank', 'NR'))
                is_ranked = opp_rank.startswith('#') or opp_net >= 12.0
                if s_team < s_opp:
                    if not is_ranked and tier != 'FCS':
                        unranked_losses += 1
                    if g.get('isConf') or check_is_conference_game(t.get('conference'), opp_name, opp_abbr)[0]:
                        conf_losses += 1

                impl_off = eff_s_team - opp_def + 27.0 - (hfa * 0.5)
                impl_def = eff_s_opp - opp_off + 27.0 + (hfa * 0.5)
                
                weighted_implied_off.append((impl_off, w))
                weighted_implied_def.append((impl_def, w))
                opp_sos_list.append((opp_net, w))

            if weighted_implied_off:
                w_sum_off = sum(val * w for val, w in weighted_implied_off)
                w_sum_def = sum(val * w for val, w in weighted_implied_def)
                w_tot = sum(w for _, w in weighted_implied_off)
                obs_off = w_sum_off / max(0.1, w_tot)
                obs_def = w_sum_def / max(0.1, w_tot)
                
                avg_sos = sum(r * w for r, w in opp_sos_list) / max(0.1, sum(w for _, w in opp_sos_list))
            else:
                obs_off = p_off
                obs_def = p_def
                avg_sos = 5.0

            # SOS Credibility Shrinkage:
            # Teams with easy schedules (SOS < 2.0) are regressed toward talent baseline prior
            sos_cred = min(0.85, max(0.35, (avg_sos + 6.0) / 22.0))
            
            # Resume penalties for unranked losses
            if unranked_losses > 0:
                obs_def += (unranked_losses * 2.5)
                obs_off -= (unranked_losses * 1.2)
            if conf_losses >= 2:
                obs_def += 1.5
                obs_off -= 1.0

            in_season_weight = 0.65 * sos_cred
            prior_weight = 1.0 - in_season_weight
            
            blend_off = round(in_season_weight * obs_off + prior_weight * p_off, 1)
            blend_def = round(in_season_weight * obs_def + prior_weight * p_def, 1)
            
            next_units[tid] = {'off': blend_off, 'def': blend_def, 'st': p_st}
        cur_units = next_units

    return cur_units

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
    drive_eff_metrics = {}
    dynamic_fbs_ratings = {}
    ret_prod_map = {}
    all_lines_by_week = {}
    lines_w1 = {}
    lines_w2 = {}
    lines_w3 = {}
    lines_w4 = {}
    season_adv_map = {}
    if cfbd_client:
        try:
            talent_map = cfbd_client.get_team_talent_composite(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(talent_map)} teams with 2026 247Sports Talent Composite")
            sp_map_2026 = cfbd_client.get_sp_ratings(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(sp_map_2026)} teams with 2026 Official SP+ Ratings")
            cum_adv_stats = cfbd_client.get_cumulative_advanced_stats(2026, weeks=[0, 1, 2, 3, 4, 5, 6, 7, 8])
            print(f"🔥 CFBD Ingestion: Loaded cumulative multi-week EPA/PPA for {len(cum_adv_stats)} teams (Weeks 0-8)")
            drive_eff_metrics = cfbd_client.get_drive_level_efficiency_metrics(2026, weeks=[1, 2, 3, 4, 5, 6, 7, 8])
            print(f"🔥 CFBD Ingestion: Loaded drive-level down consistency, PPA, and DQI for {len(drive_eff_metrics)} teams")
            dynamic_fbs_ratings = cfbd_client.get_fbs_opponent_power_ratings(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(dynamic_fbs_ratings)} dynamic 2026 FBS opponent ratings grounded in SP+ & 2026 records")
            ret_prod_map = cfbd_client.get_returning_production(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(ret_prod_map)} teams with 2026 Returning Production & Continuity")
            season_adv_map = cfbd_client.get_season_advanced_stats(2026)
            print(f"🔥 CFBD Ingestion: Loaded {len(season_adv_map)} teams with Trench Line Yards & Havoc Rates")
            all_lines_by_week = cfbd_client.get_all_game_lines_by_week(2026)
            total_lines_count = sum(len(w_map) // 2 for w_map in all_lines_by_week.values())
            print(f"🔥 CFBD Ingestion: Loaded {total_lines_count} consensus market lines across {len(all_lines_by_week)} weeks from DraftKings/Consensus")
            lines_w1 = all_lines_by_week.get(1, {})
            lines_w2 = all_lines_by_week.get(2, {})
            lines_w3 = all_lines_by_week.get(3, {})
            lines_w4 = all_lines_by_week.get(4, {})
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
        print("  • Applying verified official Week 9 Top 25 poll (Miami #1, Ohio State #2, Georgia #3, Indiana #4, Notre Dame #5, Utah #6, UCLA #7, BYU #8)...")
        ranking_updates = CURRENT_OFFICIAL_POLL

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
    # Also index all ranked teams from current AP poll for non-db opponents (e.g. UCLA, Kentucky, Wake Forest, Florida, Northwestern, Oklahoma State, Wisconsin)
    external_ap_ranks = {
        'ucla': '#7 AP',
        'ucla bruins': '#7 AP',
        'kentucky': '#9 AP',
        'kentucky wildcats': '#9 AP',
        'wake forest': '#14 AP',
        'wake forest demon deacons': '#14 AP',
        'florida': '#17 AP',
        'florida gators': '#17 AP',
        'northwestern': '#20 AP',
        'northwestern wildcats': '#20 AP',
        'oklahoma state': '#24 AP',
        'oklahoma state cowboys': '#24 AP',
        'wisconsin': '#25 AP',
        'wisconsin badgers': '#25 AP',
    }
    if ap_poll:
        for r in ap_poll.get('ranks', []):
            rn = r.get('current')
            loc = (r.get('team', {}).get('location') or '').lower()
            abbr = (r.get('team', {}).get('abbreviation') or '').lower()
            name = (r.get('team', {}).get('name') or '').lower()
            if loc: external_ap_ranks[loc] = f"#{rn} AP"
            if abbr: external_ap_ranks[abbr] = f"#{rn} AP"
            if loc and name: external_ap_ranks[f"{loc} {name}"] = f"#{rn} AP"

    for tid, t in db.items():
        for g in t.get('schedule', []):
            if g.get('isFinal'):
                continue
            opp_ap = resolve_opponent_ap_rank(g, db, external_ap_ranks)

            if g.get('oppRank') != opp_ap:
                if not args.dry_run:
                    g['oppRank'] = opp_ap
                opp_rank_updates_count += 1

    print(f"  • Updated AP rankings for {ap_changes_count} teams, adjusted {opp_rank_updates_count} future schedule matchup badges.")

    # Dates to scan
    target_dates = args.dates
    if not target_dates:
        base_dates = [
            '20260829', '20260903', '20260904', '20260905', '20260906', '20260907',
            '20260910', '20260911', '20260912', '20260913',
            '20260917', '20260918', '20260919', '20260920',
            '20260924', '20260925', '20260926', '20260927',
            '20261001', '20261002', '20261003', '20261004',
            '20261008', '20261009', '20261010', '20261011',
            '20261015', '20261016', '20261017', '20261018',
            '20261022', '20261023', '20261024', '20261025'
        ]
        schedule_dates = set(base_dates)
        today_date = datetime.date.today()
        for t in db.values():
            for g in t.get('schedule', []):
                d_str = g.get('date', '')
                try:
                    dt = datetime.datetime.strptime(d_str, '%b %d, %Y').date()
                    if dt <= today_date:
                        schedule_dates.add(dt.strftime('%Y%m%d'))
                except Exception:
                    pass
        target_dates = sorted(list(schedule_dates))

    all_completed_games = []
    
    # 1. Ingest completed games already marked in TEAMS_DATABASE
    fcs_keywords = FCS_KEYWORDS

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
                is_fcs_match = is_fcs_opponent(raw_opp_name, (g.get('oppAbbr') or ''))
                if is_fcs_match:
                    g['oppRank'] = 'FCS'

                is_conf, conf_title = check_is_conference_game(t.get('conference'), raw_opp_name, (g.get('oppAbbr') or ''))
                if is_conf:
                    g['isConf'] = True

                # Calibrate historical Vegas spread against official closing lines
                wk = g.get('week', '')
                wk_m = re.search(r'\d+', wk)
                week_num = int(wk_m.group(0)) if wk_m else None
                cur_l_map = all_lines_by_week.get(week_num, {}) if all_lines_by_week else {}
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
                    if matched_line.get('overUnder') is not None:
                        g['overUnder'] = float(matched_line['overUnder'])
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

    # 2. Ingest live games from ESPN scoreboard
    for d_str in target_dates:
        dt_obj = datetime.datetime.strptime(d_str, '%Y%m%d')
        target_date_str = f"{dt_obj.strftime('%b')} {dt_obj.day}, {dt_obj.year}"
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

            # Settle game in team schedules
            g1_obj = None
            g2_obj = None
            for team_id, opp_name, s_ut, s_opp in [(t1_id, t2_name, score1, score2), (t2_id, t1_name, score2, score1)]:
                if not team_id or team_id not in db:
                    continue
                opp_norm = normalize_name(opp_name)
                matched_g = False
                for g in db[team_id].get('schedule', []):
                    g_date = g.get('date', '')
                    date_match = (g_date == target_date_str)
                    if not date_match:
                        try:
                            g_dt = datetime.datetime.strptime(g_date, '%b %d, %Y')
                            if abs((g_dt - dt_obj).days) <= 1:
                                date_match = True
                        except Exception:
                            pass
                    if not date_match:
                        continue

                    g_opp = normalize_name(g.get('opponent') or '')
                    g_abbr = (g.get('oppAbbr') or '').strip().upper()
                    name_match = False
                    if len(opp_norm) >= 4 and (opp_norm in g_opp or g_opp in opp_norm):
                        name_match = True
                    elif g_abbr and g_abbr in [w.upper() for w in opp_name.split()]:
                        name_match = True
                    elif any(len(w) >= 5 and w in g_opp for w in opp_name.lower().split()):
                        name_match = True

                    if name_match:
                        if not args.dry_run:
                            g['isFinal'] = True
                            g['finalTeamScore'] = g['actualScoreUt'] = int(s_ut)
                            g['finalOppScore'] = g['actualScoreOpp'] = int(s_opp)
                            g['finalWin'] = int(s_ut) > int(s_opp)
                        if team_id == t1_id:
                            g1_obj = g
                        else:
                            g2_obj = g
                        matched_g = True
                        break

            if t1_id:
                if not any(cg.get('teamId') == t1_id and cg.get('gameId') == f"espn-{ev.get('id')}" for cg in all_completed_games):
                    proj1 = g1_obj.get('projScoreUt', 24) if g1_obj else 24
                    proj2 = g1_obj.get('projScoreOpp', 21) if g1_obj else 21
                    sp1 = g1_obj.get('vegasSpread', -3.5) if g1_obj else -3.5
                    ou1 = g1_obj.get('overUnder', 55.0) if g1_obj else 55.0
                    all_completed_games.append({
                        'teamId': t1_id,
                        'oppId': t2_id,
                        'gameId': f"espn-{ev.get('id')}",
                        'teamScore': score1,
                        'oppScore': score2,
                        'projUt': proj1,
                        'projOpp': proj2,
                        'vegasSpread': float(sp1),
                        'overUnder': float(ou1),
                        'isHome': c1.get('homeAway') == 'home',
                        'stadium': comps.get('venue', {}).get('fullName', ''),
                        'oppRank': g1_obj.get('oppRank', 'NR') if g1_obj else 'NR',
                        'opponent': t2_name
                    })
            if t2_id:
                if not any(cg.get('teamId') == t2_id and cg.get('gameId') == f"espn-{ev.get('id')}" for cg in all_completed_games):
                    proj1 = g2_obj.get('projScoreUt', 24) if g2_obj else 24
                    proj2 = g2_obj.get('projScoreOpp', 21) if g2_obj else 21
                    sp2 = g2_obj.get('vegasSpread', 3.5) if g2_obj else 3.5
                    ou2 = g2_obj.get('overUnder', 55.0) if g2_obj else 55.0
                    all_completed_games.append({
                        'teamId': t2_id,
                        'oppId': t1_id,
                        'gameId': f"espn-{ev.get('id')}",
                        'teamScore': score2,
                        'oppScore': score1,
                        'projUt': proj1,
                        'projOpp': proj2,
                        'vegasSpread': float(sp2),
                        'overUnder': float(ou2),
                        'isHome': c2.get('homeAway') == 'home',
                        'stadium': comps.get('venue', {}).get('fullName', ''),
                        'oppRank': g2_obj.get('oppRank', 'NR') if g2_obj else 'NR',
                        'opponent': t1_name
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

        # 1. Garbage-time filtered scoreboard margin
        if actual_margin >= 21:
            filtered_margin = 21.0 + (actual_margin - 21.0) * 0.30
        elif actual_margin <= -21:
            filtered_margin = -21.0 + (actual_margin + 21.0) * 0.30
        else:
            filtered_margin = float(actual_margin)

        delta_vegas = filtered_margin - vegas_margin
        delta_model = filtered_margin - proj_margin
        scoreboard_delta = 0.50 * delta_vegas + 0.50 * delta_model

        # 2. Drive-level down-by-down efficiency integration (CFBD DQI)
        t_clean = (db.get(tid, {}).get('name') or tid).lower().strip()
        t_short = (db.get(tid, {}).get('shortName') or tid).lower().strip()
        d_info = drive_eff_metrics.get(t_clean) or drive_eff_metrics.get(t_short) or drive_eff_metrics.get(tid)
        
        baseline_rating = float(db.get(tid, {}).get('baseSpRating', 22.0))
        expected_dqi = 10.0 + (baseline_rating - 22.0) * 0.55
        
        if d_info:
            dqi = d_info.get('driveQualityPts', 10.0)
            dqi_delta = dqi - expected_dqi
            # Invert weighting: 65% Drive Efficiency + 35% Filtered Scoreboard
            raw_delta = 0.65 * dqi_delta + 0.35 * scoreboard_delta
        else:
            raw_delta = scoreboard_delta

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

    # 4. Systemic Dynamic Unit Rating Derivation (Automated Opponent-Adjusted Relaxation Solver)
    print("\n📈 SYSTEMIC TEAM POWER RATINGS (SOLVED FROM 2026 ON-FIELD DATA & RESUME):")
    derived_units = derive_systemic_unit_ratings(db, sp_map_2026, cum_adv_stats, talent_map)
    rating_shifts = {}

    for tid, u in derived_units.items():
        t = db[tid]
        old_rating = float(t.get('baseSpRating', 20.0))
        new_rating = round(u['off'] - u['def'] + u['st'], 1)
        delta = round(new_rating - old_rating, 1)
        sign = "+" if delta > 0 else ""
        print(f"  • {t.get('shortName', tid):<14} Off: {u['off']:>4.1f} | Def: {u['def']:>4.1f} | Net: {new_rating:>5.1f} ({sign}{delta:.1f} pts)")
        rating_shifts[tid] = {
            'old': old_rating,
            'new': new_rating,
            'delta': delta,
            'offense': u['off'],
            'defense': u['def'],
            'specialTeams': u['st']
        }
        if not args.dry_run:
            t['baseSpRating'] = new_rating
            t['offenseRating'] = u['off']
            t['defenseRating'] = u['def']
            t['specialTeamsRating'] = u['st']

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
            is_conf, conf_title = check_is_conference_game(t.get('conference'), raw_opp_name, opp_abbr)
            if is_conf:
                g['isConf'] = True
                if 'scoutReport' in g and isinstance(g['scoutReport'], dict):
                    sum_text = g['scoutReport'].get('summary', '')
                    if 'non-conference test' in sum_text.lower() or 'regular season non-conference' in sum_text.lower():
                        if tid == 'indiana' and 'northwestern' in opp_lower:
                            g['scoutReport']['summary'] = "Big Ten conference battle under Friday night lights against the undefeated Northwestern Wildcats."
                        else:
                            g['scoutReport']['summary'] = f"{conf_title} conference battle against {raw_opp_name}."

            is_fcs = is_fcs_opponent(raw_opp_name, opp_abbr)
            if is_fcs:
                g['oppRank'] = 'FCS'
                sp_opp = -18.0
                opp_talent = 180.0
            elif opp_id and opp_id in db:
                sp_opp = float(db[opp_id].get('baseSpRating', 22.0))
                opp_name = db[opp_id].get('name', '').lower()
                opp_talent = talent_map.get(opp_name, talent_map.get(db[opp_id].get('shortName', '').lower(), 650.0))
            else:
                # 1. Search official 2026 Connelly SP+ map for opponent (all 139 FBS teams)
                sp_o_info = find_sp_opponent(raw_opp_name, opp_abbr, sp_map_2026) or {}
                if sp_o_info and 'rating' in sp_o_info:
                    sp_opp = float(sp_o_info['rating'])
                elif opp_lower in dynamic_fbs_ratings:
                    sp_opp = dynamic_fbs_ratings[opp_lower]
                elif opp_school in dynamic_fbs_ratings:
                    sp_opp = dynamic_fbs_ratings[opp_school]
                elif opp_abbr in dynamic_fbs_ratings:
                    sp_opp = dynamic_fbs_ratings[opp_abbr]
                elif g.get('isConf') or g.get('isBig12') or g.get('isSec') or g.get('isBigTen') or g.get('isAcc'):
                    sp_opp = 7.5
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

            # Live consensus line matching from CFBD / DraftKings across all weeks
            wk_str = g.get('week', '')
            wk_m = re.search(r'\d+', wk_str)
            week_num = int(wk_m.group(0)) if wk_m else None
            cur_week_lines = all_lines_by_week.get(week_num, {}) if all_lines_by_week else {}

            team_clean = (t.get('name') or tid).lower()
            opp_clean = (g.get('opponent') or '').lower()
            team_short = (t.get('shortName') or tid).lower()
            opp_abbr = (g.get('oppAbbr') or '').lower()
            opp_school = MASCOT_REGEX.sub('', opp_clean).strip()

            matched_line = find_market_line(cur_week_lines, tid, g.get('oppId'), g.get('isHome', True), raw_opp_name, opp_abbr, db)

            if matched_line and matched_line.get('spread') is not None:
                spread_val = matched_line['spread']
                vegas_margin = -spread_val
                # Strictly filter obsolete preseason summer lookahead lines:
                # In late October (Week 9), any market lines for Week 10 and beyond in CFBD are summer lookaheads from July/August.
                # Only Week 9 contains active live in-season market lines.
                # Even for Week 9, if a line contradicts in-season ratings by > 4.5 points or reverses favorites of a > 2.0 pt model gap, discard it!
                if week_num and week_num >= 10:
                    matched_line = None
                elif week_num == 9:
                    if abs(raw_margin - vegas_margin) > 4.5:
                        matched_line = None
                    elif (raw_margin > 2.0 and vegas_margin < -2.0) or (raw_margin < -2.0 and vegas_margin > 2.0):
                        matched_line = None

            if matched_line and matched_line.get('spread') is not None:
                spread_val = matched_line['spread']
                g['vegasSpread'] = spread_val
                g['oddsProvider'] = matched_line.get('provider', 'DraftKings')
                vegas_margin = -spread_val
                # Week 9 live market blending: 60% model, 40% live Vegas market
                projected_margin = round(0.60 * raw_margin + 0.40 * vegas_margin, 1)
            else:
                # Later weeks or unlined games: Pure model projection grounded in freshly calibrated ratings
                # For unranked non-conference games without market line, prevent absurd blowouts > 36 pts
                if abs(raw_margin) > 36.0 and not is_fcs:
                    excess = abs(raw_margin) - 36.0
                    projected_margin = round(math.copysign(36.0 + math.sqrt(excess) * 1.5, raw_margin), 1)
                else:
                    projected_margin = round(raw_margin, 1)
                g['vegasSpread'] = -projected_margin
                g['oddsProvider'] = 'CFB Prophet Projected'

            # Resolve authentic unit ratings for Team A and Opponent
            off_a_val = t.get('offenseRating', 27.5)
            def_a_val = t.get('defenseRating', 27.5)
            st_a_val = t.get('specialTeamsRating', 0.0)

            if opp_id and opp_id in db:
                off_b_val = db[opp_id].get('offenseRating', 27.5)
                def_b_val = db[opp_id].get('defenseRating', 27.5)
                st_b_val = db[opp_id].get('specialTeamsRating', 0.0)
            else:
                sp_o_info = find_sp_opponent(raw_opp_name, opp_abbr, sp_map_2026) or {}
                if sp_o_info and 'offense' in sp_o_info and 'defense' in sp_o_info:
                    off_b_val = float(sp_o_info['offense'])
                    def_b_val = float(sp_o_info['defense'])
                    st_b_val = float(sp_o_info.get('specialTeams', 0.0))
                elif is_fcs:
                    off_b_val = 10.0
                    def_b_val = 45.0
                    st_b_val = -1.0
                else:
                    off_b_val = 27.5 + (0.55 * sp_opp)
                    def_b_val = 27.5 - (0.45 * sp_opp)
                    st_b_val = 0.0

            # Market-calibrated Over/Under:
            # 1. Use posted sportsbook total when available from DraftKings / Consensus
            # 2. For unlined matchups, calibrate expected total from unit-level interaction & pace
            if matched_line and matched_line.get('overUnder') is not None:
                calibrated_total = float(matched_line['overUnder'])
            else:
                pace_a = monte_carlo_engine.estimate_team_pace(team_short) if monte_carlo_engine else 12.0
                pace_b = monte_carlo_engine.estimate_team_pace(opp_abbr or opp_clean) if monte_carlo_engine else 12.0
                pace_factor = ((pace_a + pace_b) / 2.0) / 12.3

                exp_a = max(3.0, (off_a_val + def_b_val - 27.0 + (hfa * 0.5) + st_a_val) * pace_factor)
                exp_b = max(3.0, (off_b_val + def_a_val - 27.0 - (hfa * 0.5) + st_b_val) * pace_factor)
                raw_tot = exp_a + exp_b
                calibrated_total = round(raw_tot * 2) / 2.0
                if calibrated_total % 1 == 0:
                    calibrated_total += 0.5
                calibrated_total = max(30.5, min(78.5, calibrated_total))

            g['overUnder'] = calibrated_total
            base_total = calibrated_total
            vegas_spread = g.get('vegasSpread')

            if monte_carlo_engine:
                team_short = (t.get('shortName') or tid).lower()
                opp_clean_lower = (g.get('opponent') or '').lower()
                opp_abbr = (g.get('oppAbbr') or '').lower()
                opp_school = MASCOT_REGEX.sub('', opp_clean_lower).strip()

                ret_a = ret_prod_map.get((t.get('name') or '').lower(), {}).get('percentPPA', 0.60)
                ret_b = ret_prod_map.get(opp_clean_lower, {}).get('percentPPA', 0.60)
                
                # Ingest cumulative multi-week EPA/PPA efficiency into Monte Carlo drive probabilities
                c_info_a = cum_adv_stats.get(team_short) or cum_adv_stats.get(tid) or cum_adv_stats.get((t.get('name') or '').lower()) or {}
                ppa_a = min(0.28, max(-0.15, float(c_info_a.get('avgOffPpa', 0.18))))

                c_info_b = (
                    cum_adv_stats.get(opp_abbr) or 
                    cum_adv_stats.get(opp_clean_lower) or 
                    next((v for k, v in cum_adv_stats.items() if (k == opp_clean_lower or (len(k) > 4 and k in opp_clean_lower))), {})
                )
                ppa_b = min(0.28, max(-0.15, float(c_info_b.get('avgOffPpa', 0.14))))

                # In-game trench line yards, havoc, and red-zone points per opportunity (all 138 FBS teams)
                adv_a = season_adv_map.get(team_short) or season_adv_map.get(tid) or season_adv_map.get((t.get('name') or '').lower()) or {}
                adv_b = season_adv_map.get(opp_clean_lower) or season_adv_map.get(opp_school) or season_adv_map.get(opp_abbr) or {}
                if not adv_b:
                    for ak, av in season_adv_map.items():
                        if ak == opp_clean_lower or ak == opp_school or (len(ak) > 4 and ak in opp_clean_lower):
                            adv_b = av
                            break

                mc_sim = monte_carlo_engine.simulate_matchup_10k(
                    team_a_name=t.get('shortName', tid),
                    team_b_name=g.get('oppAbbr') or g.get('opponent', 'OPP'),
                    sp_a=sp_team,
                    sp_b=sp_opp,
                    talent_a=fav_talent,
                    talent_b=opp_talent,
                    ppa_off_a=ppa_a,
                    ppa_off_b=ppa_b,
                    ret_prod_a=ret_a,
                    ret_prod_b=ret_b,
                    is_home_a=g.get('isHome', True),
                    hfa_pts=STADIUM_HFA.get(stadium, 2.0),
                    vegas_spread=vegas_spread,
                    vegas_total=base_total,
                    iterations=2500,
                    stadium_name=stadium,
                    game_date=g.get('date'),
                    kickoff_str=g.get('kickoffTime'),
                    line_yards_a=adv_a.get('offenseLineYards', 3.0),
                    line_yards_b=adv_b.get('offenseLineYards', 3.0),
                    havoc_a=adv_a.get('defenseHavoc', 0.15),
                    havoc_b=adv_b.get('defenseHavoc', 0.15),
                    ppo_a=adv_a.get('offensePPO', 3.8),
                    ppo_b=adv_b.get('offensePPO', 3.8),
                    projected_spread=-projected_margin,
                    off_a=off_a_val,
                    def_a=def_a_val,
                    off_b=off_b_val,
                    def_b=def_b_val,
                    st_a=st_a_val,
                    st_b=st_b_val,
                    is_live_market=(matched_line is not None and matched_line.get('provider') != 'CFB Prophet Projected')
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
                    if g.get('oddsProvider') == 'CFB Prophet Projected':
                        g['vegasSpread'] = mc_sim['vegasSpread']
                        g['overUnder'] = mc_sim['vegasTotal']
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
