import re

with open("data/teams.js", "r") as f:
    text = f.read()

# Build team info mapping (id -> {name, abbr})
team_blocks = list(re.finditer(r'\n  "?([a-zA-Z]+)"?:\s*\{(.*?)\n  \}(?:,|\n)', text, re.DOTALL))
teams_info = {}
for match in team_blocks:
    tid = match.group(1)
    body = match.group(2)
    name_m = re.search(r'name:\s*["\']([^"\']+)["\']', body)
    abbr_m = re.search(r'abbr:\s*["\']([^"\']+)["\']', body)
    teams_info[tid] = {
        'name': name_m.group(1) if name_m else "",
        'abbr': abbr_m.group(1) if abbr_m else ""
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
    
    # Extract games using a robust regex that handles nested scoutReports
    # Each game starts with: { "id": "..." and ends before the next { "id" or ]
    sched_match = re.search(r'schedule:\s*\[(.*?)\]\s*(?:,\n|\n\s*\})', team_body, re.DOTALL)
    if not sched_match: continue
    
    sched_text = sched_match.group(1)
    # Split by '{ \n "id":' or similar 
    # Better: find all game boundaries
    games = list(re.finditer(r'\{\s*"id":\s*"(.*?)".*?(?=\n\s*(?:\{|\],|$))', sched_text, re.DOTALL))
    
    games_list = []
    for g in games:
        g_text = g.group(0)
        
        opp_name_m = re.search(r'opponent:\s*["\']([^"\']+)["\']', g_text)
        opp_abbr_m = re.search(r'oppAbbr:\s*["\']([^"\']+)["\']', g_text)
        if not opp_name_m: continue
        
        opp = get_team_id(opp_name_m.group(1), opp_abbr_m.group(1) if opp_abbr_m else "")
        
        ut_m = re.search(r'"projScoreUt":\s*(\d+)', g_text)
        opps_m = re.search(r'"projScoreOpp":\s*(\d+)', g_text)
        prob_m = re.search(r'"baseWinProb":\s*([0-9.]+)', g_text)
        
        if opp:
            games_list.append({
                'opp': opp,
                'ut': int(ut_m.group(1)) if ut_m else 0,
                'opps': int(opps_m.group(1)) if opps_m else 0,
                'prob': float(prob_m.group(1)) if prob_m else 50.0,
                'full_match': g_text
            })
    teams_data[team_id] = games_list

print("Parsed games for", len(teams_data), "teams")

modifications = []

# SYMMETRY ENFORCEMENT
for t1, games in teams_data.items():
    for g1 in games:
        t2 = g1['opp']
        # Use t1 as source of truth if it comes first alphabetically
        if t1 < t2 and t2 in teams_data:
            g2 = next((g for g in teams_data[t2] if g['opp'] == t1), None)
            if g2:
                new_g2 = g2['full_match']
                new_g2 = re.sub(r'"projScoreUt":\s*\d+', f'"projScoreUt": {g1["opps"]}', new_g2)
                new_g2 = re.sub(r'"projScoreOpp":\s*\d+', f'"projScoreOpp": {g1["ut"]}', new_g2)
                new_prob = round(100.0 - g1['prob'], 1)
                new_g2 = re.sub(r'"baseWinProb":\s*[0-9.]+', f'"baseWinProb": {new_prob}', new_g2)
                
                # Update in-memory for the next step (Calibration)
                g2['ut'] = g1["opps"]
                g2['opps'] = g1["ut"]
                g2['prob'] = new_prob
                
                if new_g2 != g2['full_match']:
                    modifications.append((g2['full_match'], new_g2))
                    g2['full_match'] = new_g2  # update for cascading replacements

print("Symmetry modifications:", len(modifications))

# CALIBRATION
calibration_mods = 0
for tid, games in teams_data.items():
    expected_wins = sum(g['prob'] / 100.0 for g in games)
    det_wins = sum(1 for g in games if g['ut'] > g['opps'])
    diff = int(round(expected_wins)) - det_wins
    
    if diff != 0:
        def get_flip_score(g):
            if diff > 0:
                if g['ut'] > g['opps']: return -999 # already a win
                return g['prob']
            else:
                if g['ut'] <= g['opps']: return 999 # already a loss
                return g['prob']

        sorted_games = sorted(games, key=get_flip_score, reverse=(diff>0))
        
        flips = 0
        for g in sorted_games:
            if flips == abs(diff): break
            
            # Flip this game
            if diff > 0 and g['ut'] <= g['opps']:
                new_ut = g['opps'] + 3
                new_opps = g['opps']
                flips += 1
            elif diff < 0 and g['ut'] > g['opps']:
                new_ut = g['ut'] - 3
                new_opps = g['ut']
                flips += 1
            else:
                continue
                
            new_g = g['full_match']
            new_g = re.sub(r'"projScoreUt":\s*\d+', f'"projScoreUt": {new_ut}', new_g)
            new_g = re.sub(r'"projScoreOpp":\s*\d+', f'"projScoreOpp": {new_opps}', new_g)
            modifications.append((g['full_match'], new_g))
            g['full_match'] = new_g
            calibration_mods += 1
            
            # Since we just flipped a game, we MUST ALSO update the mirror game for symmetry!
            # Otherwise we break the symmetry we just created.
            opp_tid = g['opp']
            if opp_tid in teams_data:
                g_mirror = next((mg for mg in teams_data[opp_tid] if mg['opp'] == tid), None)
                if g_mirror:
                    new_g_mirror = g_mirror['full_match']
                    new_g_mirror = re.sub(r'"projScoreUt":\s*\d+', f'"projScoreUt": {new_opps}', new_g_mirror)
                    new_g_mirror = re.sub(r'"projScoreOpp":\s*\d+', f'"projScoreOpp": {new_ut}', new_g_mirror)
                    modifications.append((g_mirror['full_match'], new_g_mirror))
                    g_mirror['full_match'] = new_g_mirror
                    g_mirror['ut'] = new_opps
                    g_mirror['opps'] = new_ut
                    
print("Calibration modifications:", calibration_mods)

modifications.sort(key=lambda x: len(x[0]), reverse=True)
for old, new in modifications:
    text = text.replace(old, new)

with open("data/teams.js", "w") as f:
    f.write(text)
print("Saved data/teams.js")
