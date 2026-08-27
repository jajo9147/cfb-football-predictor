import re
import math

with open("data/teams.js", "r") as f:
    text = f.read()

# 1. Extract TEAMS_DATABASE as text blocks
team_blocks = list(re.finditer(r'\n  "?([a-zA-Z]+)"?:\s*\{(.*?)\n  \}(?:,|\n)', text, re.DOTALL))
print("Found teams:", len(team_blocks))

teams_info = {}
# Build lookup for abbreviation / name -> team_id
for match in team_blocks:
    tid = match.group(1)
    body = match.group(2)
    name_m = re.search(r'name:\s*["\']([^"\']+)["\']', body)
    abbr_m = re.search(r'abbr:\s*["\']([^"\']+)["\']', body)
    teams_info[tid] = {
        'name': name_m.group(1) if name_m else "",
        'abbr': abbr_m.group(1) if abbr_m else "",
        'body': body
    }

def get_team_id(name, abbr):
    for tid, info in teams_info.items():
        if info['name'] == name or info['abbr'] == abbr:
            return tid
    return None

teams_data = {}
for match in team_blocks:
    team_id = match.group(1)
    team_body = match.group(2)
    sched_match = re.search(r'schedule:\s*\[(.*?)\]\s*(?:\n|\})', team_body, re.DOTALL)
    if not sched_match: continue
    
    games = list(re.finditer(r'\{([^\}]+)\}', sched_match.group(1), re.DOTALL))
    games_list = []
    for g in games:
        g_text = g.group(1)
        
        opp_name_m = re.search(r'opponent:\s*["\']([^"\']+)["\']', g_text)
        opp_abbr_m = re.search(r'oppAbbr:\s*["\']([^"\']+)["\']', g_text)
        
        opp_name = opp_name_m.group(1) if opp_name_m else ""
        opp_abbr = opp_abbr_m.group(1) if opp_abbr_m else ""
        opp = get_team_id(opp_name, opp_abbr)
        
        ut_m = re.search(r'projScoreUt:\s*(\d+)', g_text)
        opps_m = re.search(r'projScoreOpp:\s*(\d+)', g_text)
        prob_m = re.search(r'baseWinProb:\s*([0-9.]+)', g_text)
        
        if opp:
            games_list.append({
                'opp': opp,
                'ut': int(ut_m.group(1)) if ut_m else 0,
                'opps': int(opps_m.group(1)) if opps_m else 0,
                'prob': float(prob_m.group(1)) if prob_m else 50.0,
                'full_match': g.group(0),
                'inner_text': g_text
            })
    teams_data[team_id] = games_list

# Apply modifications
modifications = []

# SYMMETRY ENFORCEMENT
for t1, games in teams_data.items():
    for g1 in games:
        t2 = g1['opp']
        if t1 < t2 and t2 in teams_data:
            g2 = next((g for g in teams_data[t2] if g['opp'] == t1), None)
            if g2:
                # SYMMETRY: Force g2 to mirror g1 exactly
                new_g2 = g2['inner_text']
                new_g2 = re.sub(r'projScoreUt:\s*\d+', f'projScoreUt: {g1["opps"]}', new_g2)
                new_g2 = re.sub(r'projScoreOpp:\s*\d+', f'projScoreOpp: {g1["ut"]}', new_g2)
                new_prob = round(100.0 - g1['prob'], 1)
                new_g2 = re.sub(r'baseWinProb:\s*[0-9.]+', f'baseWinProb: {new_prob}', new_g2)
                
                # update the in-memory object so we can use it for calibration
                g2['ut'] = g1["opps"]
                g2['opps'] = g1["ut"]
                g2['prob'] = new_prob
                
                if new_g2 != g2['inner_text']:
                    g2['inner_text'] = new_g2
                    modifications.append((g2['full_match'], '{' + new_g2 + '}'))

print("Symmetry Modifications:", len(modifications))

# RECORD CALIBRATION
# Expected wins = sum(prob) / 100
# Deterministic wins = count(ut > opps)
calibration_mods = 0
for tid, games in teams_data.items():
    expected_wins = sum(g['prob'] / 100.0 for g in games)
    det_wins = sum(1 for g in games if g['ut'] > g['opps'])
    diff = int(round(expected_wins)) - det_wins
    
    # Needs adjustment
    if diff != 0:
        # Sort games by closeness to flip
        def get_flip_score(g):
            if diff > 0:
                # We need more wins. Look at games we lost (ut <= opps)
                if g['ut'] > g['opps']: return -999 # already won
                # Highest probability to win among losses
                return g['prob']
            else:
                # We need fewer wins. Look at games we won (ut > opps)
                if g['ut'] <= g['opps']: return 999 # already lost
                # Lowest probability to win among wins
                return g['prob']

        sorted_games = sorted(games, key=get_flip_score, reverse=(diff>0))
        
        flips = 0
        for g in sorted_games:
            if flips == abs(diff): break
            
            # Flip this game!
            if diff > 0 and g['ut'] <= g['opps']:
                # turn loss into win
                new_ut = g['opps'] + 3
                new_opps = g['opps']
                flips += 1
            elif diff < 0 and g['ut'] > g['opps']:
                # turn win into loss
                new_ut = g['ut'] - 3
                new_opps = g['ut']
                flips += 1
            else:
                continue
                
            # modify inner_text
            new_g = g['inner_text']
            new_g = re.sub(r'projScoreUt:\s*\d+', f'projScoreUt: {new_ut}', new_g)
            new_g = re.sub(r'projScoreOpp:\s*\d+', f'projScoreOpp: {new_opps}', new_g)
            modifications.append((g['full_match'], '{' + new_g + '}'))
            calibration_mods += 1

print("Calibration Modifications:", calibration_mods)

# Sort modifications by length descending to avoid double replacing substrings
modifications.sort(key=lambda x: len(x[0]), reverse=True)
for old, new in modifications:
    text = text.replace(old, new)

with open("data/teams.js", "w") as f:
    f.write(text)
print("Saved teams.js")
