import json
import re
import math

with open("data/teams.js", "r") as f:
    text = f.read()

# Extract aliases and db
aliases_match = re.search(r'var TEAM_SEARCH_ALIASES = (\{.*?^\});\nif', text, re.MULTILINE | re.DOTALL)
db_match = re.search(r'var TEAMS_DATABASE = (\{.*\});?\n*$', text, re.DOTALL)

aliases_str = aliases_match.group(1)
aliases = json.loads(aliases_str)

db_str = db_match.group(1)
# Handle trailing commas
db_str = re.sub(r',\s*}', '}', db_str)
db_str = re.sub(r',\s*\]', ']', db_str)
data = json.loads(db_str)

# 1. ADD ASU
if "arizonastate" not in data:
    data["arizonastate"] = {
        "id": "arizonastate",
        "name": "Arizona State Sun Devils",
        "shortName": "Arizona State",
        "abbr": "ASU",
        "conference": "Big 12",
        "apRank": "NR",
        "headCoach": "Kenny Dillingham",
        "mascot": "Sun Devils",
        "stadium": "Mountain America Stadium",
        "stadiumCity": "Tempe, AZ",
        "baseSpRating": 5.0,
        "logoUrl": "https://a.espncdn.com/i/teamlogos/ncaa/500/9.png",
        "colors": {
            "primary": "#8C1D40",
            "secondary": "#FFC627",
            "accent": "#000000",
            "glow": "rgba(255, 198, 39, 0.5)",
            "border": "rgba(140, 29, 64, 0.45)"
        },
        "sliderLabels": {
            "qb": "Sam Leavitt Execution",
            "ground": "Cam Skattebo Ground Attack",
            "defense": "Brian Ward Defense",
            "turnover": "Turnover Margin Luck",
            "crowd": "Tempe Crowd Noise"
        },
        "schedule": []
    }

if "arizonastate" not in aliases:
    aliases["arizonastate"] = ["arizona state", "asu", "sun devils", "devils", "tempe", "kenny dillingham", "sparky", "arizona st"]

# Ensure LSU and CU have good aliases
if "lsu" not in aliases:
    aliases["lsu"] = ["lsu", "louisiana state", "louisiana state university", "lsu tigers", "tigers", "bayou bengals", "geaux tigers", "baton rouge", "death valley", "brian kelly", "mike the tiger"]
if "colorado" not in aliases:
    aliases["colorado"] = ["colorado", "cu", "u of c", "uofc", "u-of-c", "university of colorado", "univ of colorado", "colorado buffaloes", "buffs", "buffaloes", "coach prime", "deion", "deion sanders", "boulder", "folsom", "juju lewis"]

# Build ID lookups
def get_team_id(name, abbr):
    for tid, info in data.items():
        if info.get('name') == name or info.get('abbr') == abbr:
            return tid
    return None

# Link opponents to real IDs
for tid, team in data.items():
    for g in team.get('schedule', []):
        opp_id = get_team_id(g.get('opponent'), g.get('oppAbbr'))
        if opp_id:
            g['_opp_id'] = opp_id

# 2. SYMMETRY ENFORCEMENT
symmetry_count = 0
for t1, team1 in data.items():
    for g1 in team1.get('schedule', []):
        t2 = g1.get('_opp_id')
        if not t2: continue
        
        # If t1 is alphabetically first, we use t1 as source of truth to overwrite t2
        if t1 < t2:
            team2 = data[t2]
            g2 = next((g for g in team2.get('schedule', []) if g.get('_opp_id') == t1), None)
            if g2:
                old_g2_ut = g2.get('projScoreUt', 0)
                old_g2_opp = g2.get('projScoreOpp', 0)
                old_g2_prob = g2.get('baseWinProb', 50)
                
                new_g2_ut = g1.get('projScoreOpp', 0)
                new_g2_opp = g1.get('projScoreUt', 0)
                new_g2_prob = round(100.0 - g1.get('baseWinProb', 50), 1)
                
                if old_g2_ut != new_g2_ut or old_g2_opp != new_g2_opp or abs(old_g2_prob - new_g2_prob) > 0.1:
                    g2['projScoreUt'] = new_g2_ut
                    g2['projScoreOpp'] = new_g2_opp
                    g2['baseWinProb'] = new_g2_prob
                    symmetry_count += 1

print(f"Enforced symmetry on {symmetry_count} overlapping games.")

# 3. RECORD CALIBRATION
calibration_count = 0
for tid, team in data.items():
    games = [g for g in team.get('schedule', []) if '_opp_id' in g or 'baseWinProb' in g]
    if not games: continue
    
    expected_wins = sum(g.get('baseWinProb', 50) / 100.0 for g in games)
    det_wins = sum(1 for g in games if g.get('projScoreUt', 0) > g.get('projScoreOpp', 0))
    diff = int(round(expected_wins)) - det_wins
    
    if diff != 0:
        def get_flip_score(g):
            if diff > 0:
                if g.get('projScoreUt', 0) > g.get('projScoreOpp', 0): return -999
                return g.get('baseWinProb', 50)
            else:
                if g.get('projScoreUt', 0) <= g.get('projScoreOpp', 0): return 999
                return g.get('baseWinProb', 50)

        sorted_games = sorted(games, key=get_flip_score, reverse=(diff>0))
        
        flips = 0
        for g in sorted_games:
            if flips == abs(diff): break
            
            ut = g.get('projScoreUt', 0)
            opps = g.get('projScoreOpp', 0)
            
            if diff > 0 and ut <= opps:
                g['projScoreUt'] = opps + 3
                g['projScoreOpp'] = opps
                flips += 1
            elif diff < 0 and ut > opps:
                g['projScoreUt'] = ut - 3
                g['projScoreOpp'] = ut
                flips += 1
            else:
                continue
                
            calibration_count += 1
            
            # Keep symmetry!
            t2 = g.get('_opp_id')
            if t2 and t2 in data:
                g2 = next((xg for xg in data[t2].get('schedule', []) if xg.get('_opp_id') == tid), None)
                if g2:
                    g2['projScoreUt'] = g['projScoreOpp']
                    g2['projScoreOpp'] = g['projScoreUt']
                    g2['baseWinProb'] = round(100.0 - g.get('baseWinProb', 50), 1)

print(f"Calibrated {calibration_count} games to match Monte Carlo modes.")

# Remove _opp_id
for tid, team in data.items():
    for g in team.get('schedule', []):
        if '_opp_id' in g:
            del g['_opp_id']

# Reconstruct file
new_aliases_str = json.dumps(aliases, indent=2)
new_db_str = json.dumps(data, indent=2)

new_text = text[:aliases_match.start(1)] + new_aliases_str + text[aliases_match.end(1):db_match.start(1)] + new_db_str + text[db_match.end(1):]

with open("data/teams.js", "w") as f:
    f.write(new_text)
print("Processing complete. Written to data/teams.js")
