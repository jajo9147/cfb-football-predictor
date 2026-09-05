#!/usr/bin/env python3
"""
CFB Prophet - Rebuild 2026 Official Schedules from ESPN Data
Authoritatively syncs all 31 tracked teams with real 2026 ESPN schedules,
corrects AP rankings, eliminates opponent ID cross-contamination (e.g. Missouri State vs Missouri),
sets verified kickoff times and realistic TBD placeholders for future unannounced games.
"""

import os
import re
import json
import math
import datetime

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAMS_FILE = os.path.join(ROOT_DIR, 'data', 'teams.js')
TEAMS_V3_FILE = os.path.join(ROOT_DIR, 'data', 'teams_v3.js')
ESPN_DATA_FILE = os.path.join(ROOT_DIR, 'all_espn_2026_schedules.json')

ESPN_ID_TO_TEAM_ID = {
    333: 'alabama', 12: 'arizona', 9: 'arizonastate', 68: 'boisestate', 252: 'byu',
    228: 'clemson', 38: 'colorado', 52: 'floridastate', 61: 'georgia', 248: 'houston',
    84: 'indiana', 2294: 'iowa', 97: 'louisville', 99: 'lsu', 2390: 'miami',
    130: 'michigan', 142: 'missouri', 87: 'notredame', 194: 'ohiostate', 201: 'oklahoma',
    145: 'olemiss', 2483: 'oregon', 213: 'pennstate', 2567: 'smu', 2633: 'tennessee',
    251: 'texas', 245: 'texasam', 2641: 'texastech', 30: 'usc', 254: 'utah', 264: 'washington'
}

FCS_NAMES = {
    'morgan state', 'missouri state', 'utah tech', 'the citadel', 'idaho', 'northern arizona',
    'delaware state', 'arkansas-pine bluff', 'uapb', 'tennessee state', 'furman', 'bryant',
    'maine', 'towson', 'alcorn state', 'norfolk state', 'austin peay', 'nicholls', 'idaho state',
    'houston christian', 'murray state', 'eastern kentucky', 'charleston southern', 'se louisiana',
    'northwestern state', 'hampton', 'south dakota state', 'lamar', 'mercyhurst', 'portland state',
    'mississippi valley state', 'sacramento state', 'chattanooga', 'rhode island', 'fordham',
    'north alabama', 'youngstown state', 'southeast missouri state', 'duquesne', 'tarleton state',
    'lafayette', 'new hampshire', 'vmi', 'ut rio grande valley', 'south dakota'
}

RIVALRIES = [
    (re.compile(r'texas.*texas a&m|texas a&m.*texas', re.I), "LONE STAR SHOWDOWN"),
    (re.compile(r'michigan.*ohio state|ohio state.*michigan', re.I), "THE GAME"),
    (re.compile(r'oklahoma.*texas|texas.*oklahoma', re.I), "RED RIVER RIVALRY"),
    (re.compile(r'alabama.*auburn|auburn.*alabama', re.I), "IRON BOWL"),
    (re.compile(r'byu.*utah|utah.*byu', re.I), "HOLY WAR"),
    (re.compile(r'arizona.*arizona state|arizona state.*arizona', re.I), "TERRITORIAL CUP"),
    (re.compile(r'washington.*oregon|oregon.*washington', re.I), "PACIFIC NORTHWEST CLASH"),
    (re.compile(r'usc.*ucla|ucla.*usc', re.I), "BATTLE FOR THE VICTORY BELL"),
    (re.compile(r'usc.*notre dame|notre dame.*usc', re.I), "JEWELED SHILLELAGH"),
    (re.compile(r'florida state.*miami|miami.*florida state', re.I), "FLORIDA RIVALRY SHOWDOWN"),
    (re.compile(r'georgia.*florida|florida.*georgia', re.I), "WORLD'S LARGEST OUTDOOR COCKTAIL PARTY"),
    (re.compile(r'notre dame.*michigan|michigan.*notre dame', re.I), "MIDWEST BLUEBLOOD CLASH"),
    (re.compile(r'tennessee.*alabama|alabama.*tennessee', re.I), "THIRD SATURDAY IN OCTOBER"),
    (re.compile(r'clemson.*south carolina|south carolina.*clemson', re.I), "PALMETTO BOWL"),
    (re.compile(r'colorado.*colorado state|colorado state.*colorado', re.I), "ROCKY MOUNTAIN SHOWDOWN"),
    (re.compile(r'ole miss.*mississippi state|mississippi state.*ole miss', re.I), "EGG BOWL")
]

def get_rivalry_name(team_name, opp_name):
    combined = f"{team_name} {opp_name}"
    for pattern, name in RIVALRIES:
        if pattern.search(combined):
            return name
    return None

def format_iso_to_ny(iso_str, time_valid=True):
    dt = datetime.datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
    # EDT is UTC-4 (until Nov 1), EST is UTC-5
    edt = datetime.timezone(datetime.timedelta(hours=-4))
    est = datetime.timezone(datetime.timedelta(hours=-5))
    tz = edt if dt.month < 11 else est
    local_dt = dt.astimezone(tz)
    
    date_str = local_dt.strftime('%b %-d, %Y')
    if time_valid:
        hour = local_dt.hour
        minute = local_dt.minute
        ampm = 'AM' if hour < 12 else 'PM'
        hour12 = hour % 12
        if hour12 == 0: hour12 = 12
        time_str = f"{hour12}:{minute:02d} {ampm} ET"
    else:
        time_str = "TBD"
    return date_str, time_str

def calculate_win_prob_from_margin(margin):
    k = 0.125
    prob = 1.0 / (1.0 + math.exp(-k * margin))
    val = int(round(prob * 100))
    return max(1, min(99, val))

def load_teams(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()
    m = re.search(r'var\s+TEAMS_DATABASE\s*=\s*(\{[\s\S]*?\});\s*(?:if\s*\(typeof module|\Z)', text)
    if not m:
        raise ValueError("Could not parse TEAMS_DATABASE")
    idx = text.find('var TEAMS_DATABASE = ')
    prefix = text[:idx] if idx != -1 else ""
    return json.loads(m.group(1)), prefix

def save_teams(filepath, db, prefix):
    json_str = json.dumps(db, indent=2)
    footer = ";\n\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = TEAMS_DATABASE;\n}\n"
    content = prefix + "var TEAMS_DATABASE = " + json_str + footer
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def main():
    print("Rebuilding 2026 CFB Prophet Schedules from ESPN Official API...")
    with open(ESPN_DATA_FILE, 'r', encoding='utf-8') as f:
        espn_schedules = json.load(f)

    db, prefix = load_teams(TEAMS_FILE)

    # Invert ESPN ID map
    team_to_eid = {}
    for eid, tid in ESPN_ID_TO_TEAM_ID.items():
        team_to_eid[tid] = eid

    total_games_built = 0

    for tid, t in db.items():
        eid = team_to_eid.get(tid)
        espn_events = espn_schedules.get(tid, [])
        if not espn_events:
            print(f"Warning: No ESPN events for {tid}")
            continue

        existing_games = {g.get('id'): g for g in t.get('schedule', [])}
        new_schedule = []

        team_abbr = t.get('abbr', tid[:3]).lower()
        team_name = t.get('name', tid)
        team_sp = float(t.get('baseSpRating', 22.0))

        for idx, ev in enumerate(espn_events, 1):
            comps = ev.get('competitions', [{}])[0]
            competitors = comps.get('competitors', [])
            if len(competitors) < 2:
                continue

            our_comp = None
            opp_comp = None
            for c in competitors:
                cid = int(c.get('team', {}).get('id', 0))
                if cid == eid:
                    our_comp = c
                else:
                    opp_comp = c

            if not our_comp or not opp_comp:
                # Fallback based on homeAway
                for c in competitors:
                    if our_comp is None and c.get('team', {}).get('abbreviation') == t.get('abbr'):
                        our_comp = c
                    else:
                        opp_comp = c

            opp_team = opp_comp.get('team', {})
            opp_espn_id = int(opp_team.get('id', 0))
            opp_display_name = opp_team.get('displayName', 'Opponent')
            opp_abbr = opp_team.get('abbreviation') or opp_team.get('shortDisplayName') or opp_display_name[:4].upper()

            matched_opp_id = ESPN_ID_TO_TEAM_ID.get(opp_espn_id)

            # Check if FCS
            is_fcs = any(fcs in opp_display_name.lower() for fcs in FCS_NAMES)

            # Determine Opponent Rank & Badging
            curated_rank = opp_comp.get('curatedRank', {}).get('current', 99)
            if matched_opp_id and matched_opp_id in db:
                opp_rank = db[matched_opp_id].get('apRank', 'NR')
                opp_badge = db[matched_opp_id].get('badgeText', opp_abbr)
                opp_color = db[matched_opp_id].get('colors', {}).get('primary', '#334155')
                opp_secondary = db[matched_opp_id].get('colors', {}).get('secondary', '#FFFFFF')
                is_tracked = True
            else:
                matched_opp_id = None # Do NOT cross-contaminate!
                is_tracked = False
                if is_fcs:
                    opp_rank = "FCS"
                    opp_badge = opp_abbr
                elif curated_rank <= 25:
                    opp_rank = f"#{curated_rank} AP"
                    opp_badge = f"#{curated_rank} AP"
                else:
                    opp_rank = "NR"
                    opp_badge = opp_abbr
                opp_color = f"#{opp_team.get('color')}" if opp_team.get('color') else "#1E293B"
                opp_secondary = f"#{opp_team.get('alternateColor')}" if opp_team.get('alternateColor') else "#FFFFFF"

            opp_logo_url = f"https://a.espncdn.com/i/teamlogos/ncaa/500/{opp_espn_id}.png"

            # Venue & Location
            venue = comps.get('venue', {})
            stadium = venue.get('fullName', t.get('stadium', 'Stadium'))
            city = venue.get('address', {}).get('city', '')
            state = venue.get('address', {}).get('state', '')
            location = f"{city}, {state}" if city and state else city or state or t.get('stadiumCity', '')

            # Home / Away
            is_home = (our_comp.get('homeAway') == 'home')

            # Week & Dates
            utc_timestamp = ev.get('date')
            status_obj = comps.get('status', {}).get('type', {})
            status_detail = status_obj.get('detail', '')
            time_valid = comps.get('timeValid', False) and ('TBD' not in status_detail)

            date_str, kickoff_time = format_iso_to_ny(utc_timestamp, time_valid)

            # Determine Week Label
            ev_week_num = ev.get('week', {}).get('number', idx)
            # If game is in late August (Aug 29), it's Week 0
            if '2026-08' in utc_timestamp:
                week_label = "WEEK 0"
                game_id = f"{team_abbr}-w0"
            else:
                week_label = f"WEEK {ev_week_num}"
                game_id = f"{team_abbr}-w{ev_week_num}"

            # Broadcast
            broadcasts = comps.get('broadcasts', [])
            tv = 'TBD'
            if broadcasts:
                tv = broadcasts[0].get('media', {}).get('shortName') or broadcasts[0].get('names', [''])[0] or 'TBD'

            # Rivalry & Marquee
            rivalry_name = get_rivalry_name(team_name, opp_display_name)
            is_marquee = bool(rivalry_name) or (matched_opp_id is not None and ('#' in t.get('apRank', '') or '#' in opp_rank))

            # Check if this game is completed
            is_final = status_obj.get('completed', False)
            final_team_score = None
            final_opp_score = None
            final_win = None

            # Preserve completed game data if it already exists
            old_game = existing_games.get(game_id)
            if not old_game:
                # Search by date
                for g in existing_games.values():
                    if g.get('isFinal') and (g.get('date') == date_str or g.get('utc') == utc_timestamp):
                        old_game = g
                        break

            if old_game and old_game.get('isFinal'):
                is_final = True
                final_team_score = old_game.get('finalTeamScore', old_game.get('projScoreUt', 0))
                final_opp_score = old_game.get('finalOppScore', old_game.get('projScoreOpp', 0))
                final_win = (final_team_score > final_opp_score)
            elif is_final:
                try:
                    final_team_score = int(float(our_comp.get('score', {}).get('value', 0)))
                    final_opp_score = int(float(opp_comp.get('score', {}).get('value', 0)))
                    final_win = (final_team_score > final_opp_score)
                except Exception:
                    pass

            # Model calculations for unplayed games
            if matched_opp_id and matched_opp_id in db:
                opp_sp = float(db[matched_opp_id].get('baseSpRating', 22.0))
            elif is_fcs:
                opp_sp = -14.0
            else:
                # Power 4 conference vs Group of 5
                power4_keywords = ['sec', 'big ten', 'big 12', 'acc', 'notre dame']
                is_power = any(kw in opp_display_name.lower() for kw in power4_keywords)
                opp_sp = 13.0 if is_power else 4.5

            hfa = 3.0 if is_home else -3.0
            proj_margin = (team_sp - opp_sp) + hfa
            vegas_spread = -round(proj_margin * 2) / 2.0
            over_under = 52.5

            proj_ut = max(7, int(round((over_under + proj_margin) / 2.0)))
            proj_opp = max(3, int(round((over_under - proj_margin) / 2.0)))
            base_win_prob = calculate_win_prob_from_margin(proj_margin)

            # Scout report
            if is_fcs:
                scout_summary = f"Non-conference matchup in {location} against FCS challenger {opp_display_name}."
                x_factor = f"Executing clean offensive tempo and establishing physical line of scrimmage early."
                key_matchup = f"{t.get('shortName', team_name)} offensive line vs {opp_display_name} defensive front."
            elif matched_opp_id:
                scout_summary = f"High-stakes clash against {opp_rank} {opp_display_name}."
                x_factor = f"Turnover margin, third-down conversion rate, and red-zone execution."
                key_matchup = f"{t.get('shortName', team_name)} quarterback play vs {opp_display_name} secondary."
            else:
                scout_summary = f"Regular season non-conference test against {opp_display_name}."
                x_factor = f"Explosive play generation and stopping the run on early downs."
                key_matchup = f"{t.get('shortName', team_name)} front seven vs {opp_display_name} rushing attack."

            game_obj = {
                "id": game_id,
                "week": week_label,
                "date": date_str,
                "kickoffTime": kickoff_time,
                "utc": utc_timestamp,
                "tv": tv,
                "opponent": opp_display_name,
                "oppAbbr": opp_abbr,
                "oppRank": opp_rank,
                "oppBadge": opp_badge,
                "oppColor": opp_color,
                "oppSecondary": opp_secondary,
                "oppLogoUrl": opp_logo_url,
                "isHome": is_home,
                "stadium": stadium,
                "location": location,
                "isMarquee": is_marquee,
                "isConf": (matched_opp_id in db and db[matched_opp_id].get('conference') == t.get('conference')),
                "vegasSpread": vegas_spread,
                "overUnder": over_under,
                "baseWinProb": base_win_prob,
                "projScoreUt": proj_ut,
                "projScoreOpp": proj_opp,
                "scoutReport": {
                    "xFactor": x_factor,
                    "keyMatchup": key_matchup,
                    "summary": scout_summary
                },
                "oppId": matched_opp_id,
                "is_tracked": is_tracked
            }

            if rivalry_name:
                game_obj["rivalryName"] = rivalry_name

            if is_final:
                game_obj["isFinal"] = True
                game_obj["finalTeamScore"] = final_team_score
                game_obj["finalOppScore"] = final_opp_score
                game_obj["finalWin"] = final_win
                game_obj["projScoreUt"] = final_team_score
                game_obj["projScoreOpp"] = final_opp_score

            new_schedule.append(game_obj)
            total_games_built += 1

        if tid == 'boisestate' and len(new_schedule) == 11:
            flex_game = {
                "id": "bsu-w13",
                "week": "WEEK 13",
                "date": "Nov 28, 2026",
                "kickoffTime": "TBD",
                "utc": "2026-11-28T20:00:00Z",
                "tv": "FOX/FS1",
                "opponent": "Pac-12 Flex Opponent",
                "oppAbbr": "P12",
                "oppRank": "NR",
                "oppBadge": "PAC-12",
                "oppColor": "#004B87",
                "oppSecondary": "#FFFFFF",
                "oppLogoUrl": "https://a.espncdn.com/i/teamlogos/ncaa/500/2751.png",
                "isHome": False,
                "stadium": "TBD",
                "location": "TBD",
                "isMarquee": True,
                "isConf": True,
                "vegasSpread": -7.5,
                "overUnder": 54.5,
                "baseWinProb": 71,
                "projScoreUt": 31,
                "projScoreOpp": 23,
                "scoutReport": {
                    "xFactor": "Pac-12 regular season finale seeding and championship game qualification.",
                    "keyMatchup": "Boise State rushing attack vs Pac-12 opponent defensive front.",
                    "summary": "Pac-12 regular season flex finale on Thanksgiving weekend."
                },
                "oppId": None,
                "is_tracked": False
            }
            new_schedule.append(flex_game)
            total_games_built += 1

        t['schedule'] = new_schedule
        print(f"✓ {tid:15}: Rebuilt {len(new_schedule)} games.")

    # Save to data/teams.js and data/teams_v3.js
    save_teams(TEAMS_FILE, db, prefix)
    save_teams(TEAMS_V3_FILE, db, prefix)
    print(f"\n🎉 Successfully rebuilt {total_games_built} games across all {len(db)} teams!")
    print(f"Saved: {TEAMS_FILE}")
    print(f"Saved: {TEAMS_V3_FILE}")

if __name__ == '__main__':
    main()
