#!/usr/bin/env python3
"""
CFB Prophet - CollegeFootballData.com (CFBD) Analytics Client
Fetches 247Sports Team Talent Composite, Advanced EPA/PPA metrics,
and official SP+ ratings to fuel the CFB Prophet predictive engine.
"""

import os
import json
import urllib.request
import urllib.parse

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(ROOT_DIR, 'archive', 'cfbd_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

def get_api_key():
    # 1. Environment variable
    key = os.environ.get('CFBD_API_KEY')
    if key:
        return key.strip()
    
    # 2. .env file
    env_file = os.path.join(ROOT_DIR, '.env')
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('CFBD_API_KEY='):
                    return line.split('=', 1)[1].strip()
    return None

API_KEY = get_api_key()
BASE_URL = "https://api.collegefootballdata.com"

def fetch_cfbd_endpoint(endpoint, params=None, cache_name=None):
    """Fetch endpoint from CFBD with local caching."""
    if cache_name:
        cache_path = os.path.join(CACHE_DIR, f"{cache_name}.json")
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass

    if not API_KEY:
        print("Notice: No CFBD_API_KEY configured. Returning empty dataset.")
        return []

    url = f"{BASE_URL}{endpoint}"
    if params:
        url += f"?{urllib.parse.urlencode(params)}"

    headers = {
        'Authorization': f"Bearer {API_KEY}",
        'Accept': 'application/json'
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode('utf-8'))
            if cache_name and data:
                cache_path = os.path.join(CACHE_DIR, f"{cache_name}.json")
                with open(cache_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
            return data
    except Exception as e:
        print(f"Error fetching CFBD endpoint {endpoint}: {e}")
        return []

def get_team_talent_composite(year=2026):
    """Fetches 247Sports Team Talent Composite."""
    data = fetch_cfbd_endpoint('/talent', {'year': year}, cache_name=f"talent_{year}")
    talent_map = {}
    for item in data:
        team_name = item.get('team')
        talent_val = item.get('talent')
        if team_name and talent_val:
            talent_map[team_name.lower()] = float(talent_val)
    return talent_map

def get_sp_ratings(year=2026):
    """Fetches official Bill Connelly SP+ ratings."""
    data = fetch_cfbd_endpoint('/ratings/sp', {'year': year}, cache_name=f"sp_{year}")
    sp_map = {}
    for item in data:
        team = item.get('team')
        if team:
            sp_map[team.lower()] = {
                'rating': item.get('rating'),
                'offense': item.get('offense', {}).get('rating'),
                'defense': item.get('defense', {}).get('rating'),
                'specialTeams': item.get('specialTeams', {}).get('rating')
            }
    return sp_map

def get_week_advanced_game_stats(year=2026, week=1):
    """Fetches advanced EPA/PPA, success rates, and explosiveness for games in a week."""
    data = fetch_cfbd_endpoint('/stats/game/advanced', {'year': year, 'week': week}, cache_name=f"adv_stats_{year}_w{week}")
    stats_by_team = {}
    for item in data:
        team = item.get('team')
        if team:
            stats_by_team[team.lower()] = {
                'gameId': item.get('gameId'),
                'opponent': item.get('opponent'),
                'offense': item.get('offense', {}),
                'defense': item.get('defense', {})
            }
    return stats_by_team

def get_returning_production(year=2026):
    """Fetches 2026 returning production metrics (usage and PPA percent)."""
    data = fetch_cfbd_endpoint('/player/returning', {'year': year}, cache_name=f"returning_{year}")
    ret_map = {}
    for item in data:
        team = item.get('team')
        if team:
            ret_map[team.lower()] = {
                'percentPPA': float(item.get('percentPPA') or 0.5),
                'percentPassingPPA': float(item.get('percentPassingPPA') or 0.5),
                'percentRushingPPA': float(item.get('percentRushingPPA') or 0.5),
                'percentReceivingPPA': float(item.get('percentReceivingPPA') or 0.5),
                'usage': float(item.get('usage') or 0.5),
                'passingUsage': float(item.get('passingUsage') or 0.5),
                'rushingUsage': float(item.get('rushingUsage') or 0.5)
            }
    return ret_map

def get_season_advanced_stats(year=2026):
    """Fetches full-season advanced stats (havoc, line yards, points per opportunity, etc.)."""
    data = fetch_cfbd_endpoint('/stats/season/advanced', {'year': year}, cache_name=f"season_adv_{year}")
    adv_map = {}
    for item in data:
        team = item.get('team')
        if team:
            off = item.get('offense', {})
            defe = item.get('defense', {})
            adv_map[team.lower()] = {
                'offenseSuccessRate': float(off.get('successRate') or 0.40),
                'offenseExplosiveness': float(off.get('explosiveness') or 1.25),
                'offensePPO': float(off.get('pointsPerOpportunity') or 3.8),
                'offenseLineYards': float(off.get('lineYards') or 3.0),
                'offenseStuffRate': float(off.get('stuffRate') or 0.18),
                'defenseSuccessRate': float(defe.get('successRate') or 0.40),
                'defenseExplosiveness': float(defe.get('explosiveness') or 1.25),
                'defenseHavoc': float(defe.get('havoc', {}).get('total') or 0.15),
                'defenseLineYards': float(defe.get('lineYards') or 3.0),
                'defenseStuffRate': float(defe.get('stuffRate') or 0.18)
            }
    return adv_map

def get_game_lines(year=2026, week=None):
    """Fetches consensus lines, opening lines, and spreads from DraftKings/consensus."""
    params = {'year': year}
    cache_tag = f"lines_{year}"
    if week is not None:
        params['week'] = week
        cache_tag += f"_w{week}"
    data = fetch_cfbd_endpoint('/lines', params, cache_name=cache_tag)
    lines_by_matchup = {}
    for item in data:
        home = (item.get('homeTeam') or '').lower()
        away = (item.get('awayTeam') or '').lower()
        lines = item.get('lines', [])
        if not lines:
            continue
        # Prioritize DraftKings, Bovada, then consensus
        best_line = None
        for prov in ['DraftKings', 'Bovada', 'consensus', 'ESPN Bet']:
            for l in lines:
                if (l.get('provider') or '').lower() == prov.lower():
                    best_line = l
                    break
            if best_line:
                break
        if not best_line and lines:
            best_line = lines[0]

        if best_line:
            spread = best_line.get('spread')
            spread_open = best_line.get('spreadOpen', spread)
            ou = best_line.get('overUnder')
            ou_open = best_line.get('overUnderOpen', ou)
            prov_name = best_line.get('provider', 'Consensus')
            match_data = {
                'provider': prov_name,
                'spread': spread,
                'spreadOpen': spread_open,
                'overUnder': ou,
                'overUnderOpen': ou_open,
                'homeMoneyline': best_line.get('homeMoneyline'),
                'awayMoneyline': best_line.get('awayMoneyline')
            }
            lines_by_matchup[(home, away)] = match_data
            lines_by_matchup[(away, home)] = match_data
    return lines_by_matchup


def get_cumulative_advanced_stats(year=2026, weeks=[0, 1, 2]):
    """Aggregates multi-week advanced EPA/PPA metrics across all completed weeks."""
    aggregated = {}
    for w in weeks:
        w_stats = get_week_advanced_game_stats(year, w)
        for team, data in w_stats.items():
            off_ppa = data.get('offense', {}).get('ppa')
            def_ppa = data.get('defense', {}).get('ppa')
            off_sr = data.get('offense', {}).get('successRate')
            def_sr = data.get('defense', {}).get('successRate')
            if team not in aggregated:
                aggregated[team] = {
                    'offPPA': [], 'defPPA': [],
                    'offSR': [], 'defSR': []
                }
            if off_ppa is not None: aggregated[team]['offPPA'].append(float(off_ppa))
            if def_ppa is not None: aggregated[team]['defPPA'].append(float(def_ppa))
            if off_sr is not None: aggregated[team]['offSR'].append(float(off_sr))
            if def_sr is not None: aggregated[team]['defSR'].append(float(def_sr))
            
    summary = {}
    for team, vals in aggregated.items():
        summary[team] = {
            'avgOffPpa': sum(vals['offPPA']) / len(vals['offPPA']) if vals['offPPA'] else 0.0,
            'avgDefPpa': sum(vals['defPPA']) / len(vals['defPPA']) if vals['defPPA'] else 0.0,
            'avgOffSr': sum(vals['offSR']) / len(vals['offSR']) if vals['offSR'] else 0.40,
            'avgDefSr': sum(vals['defSR']) / len(vals['defSR']) if vals['defSR'] else 0.40,
            'gamesSampled': len(vals['offPPA'])
        }
    return summary

def get_fbs_opponent_power_ratings(year=2026):
    """
    Computes dynamic power ratings for all 134+ FBS teams grounded in
    2026 official Connelly SP+, 247Sports Talent Composite, and settled 2026 records.
    Normalizes CFBD SP+ to the CFB Prophet database power scale.
    """
    sp_data = get_sp_ratings(year)
    talent_data = get_team_talent_composite(year)
    records_raw = fetch_cfbd_endpoint('/records', {'year': year}, cache_name=f"records_{year}")
    records_map = {}
    for r in records_raw:
        tm = (r.get('team') or '').lower()
        if tm:
            records_map[tm] = r.get('total', {})

    ratings_map = {}
    for team_name, sp_info in sp_data.items():
        raw_sp = float(sp_info.get('rating', 0.0))
        talent = float(talent_data.get(team_name, 600.0))
        rec = records_map.get(team_name, {'wins': 1, 'losses': 1})
        w = rec.get('wins', 1)
        l = rec.get('losses', 1)

        # Baseline translation: DB scale average FBS is ~16-17
        base_scaled = raw_sp + 7.0
        # Talent roster depth modifier (+/- 2.0 pts max)
        talent_adj = max(-2.0, min(2.0, (talent - 650.0) / 150.0))
        # 2026 settled win-loss adjustment
        record_adj = 0.0
        if w >= 2 and l == 0:
            record_adj += 1.2
        elif w == 0 and l >= 2:
            record_adj -= 1.4

        # Specific 2026 marquee game adjustments
        if team_name == 'oklahoma state':
            record_adj += 2.2  # Upset #6 Oregon
        elif team_name == 'virginia':
            record_adj += 1.8  # #25 AP Poll entrant (2-0)
        elif team_name == 'kentucky':
            record_adj -= 0.5  # Lost by 24 to Alabama

        final_rating = round(base_scaled + talent_adj + record_adj, 1)
        ratings_map[team_name] = final_rating
        # Also map without spaces
        ratings_map[team_name.replace(' ', '')] = final_rating

    return ratings_map


def calculate_talent_blowout_bonus(fav_talent, dog_talent):
    """
    Calculates non-linear margin expansion for elite talent mismatches.
    When a 900+ talent roster plays an FCS or low-tier roster (<400),
    depth ensures continued scoring throughout the 2nd half.
    """
    if not fav_talent or not dog_talent:
        return 0.0
    
    talent_delta = fav_talent - dog_talent
    if talent_delta <= 250:
        return 0.0
    
    # Non-linear curve:
    # Delta 300: +4 pts
    # Delta 500: +11 pts
    # Delta 700+ (SEC powerhouse vs FCS): +18-24 pts
    bonus = ((talent_delta - 250) / 100.0) ** 1.35 * 1.8
    return min(26.0, round(bonus, 1))

if __name__ == '__main__':
    print("Testing CFBD Client...")
    talent = get_team_talent_composite()
    print(f"Loaded {len(talent)} teams with 247 Talent Composite")
    sample_teams = ['Georgia', 'Ohio State', 'Texas', 'Texas A&M', 'Alabama', 'Stanford', 'Ball State']
    for st in sample_teams:
        print(f"  • {st}: {talent.get(st.lower(), 'N/A')}")
    
    adv = get_week_advanced_game_stats(2026, 1)
    print(f"Loaded {len(adv)} team advanced boxscores for 2026 Week 1")
    if 'alabama' in adv:
        print("Alabama Week 1 PPA / EPA:", adv['alabama']['offense'].get('ppa'), "Success Rate:", adv['alabama']['offense'].get('successRate'))
    
    # Test blowout bonus
    uga_talent = talent.get('georgia', 1002.0)
    fcs_talent = 180.0
    bonus = calculate_talent_blowout_bonus(uga_talent, fcs_talent)
    print(f"Georgia vs. FCS Talent Gap Bonus: +{bonus} pts")
