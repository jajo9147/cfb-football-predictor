import re

with open("data/teams.js", "r") as f:
    text = f.read()

# First, extract the schedule block for each team
team_blocks = list(re.finditer(r'\n  "([a-z]+)": \{(.*?)\n  \}(?:,|\n)', text, re.DOTALL))
print("Found teams:", len(team_blocks))

if len(team_blocks) == 0:
    # Try alternate regex without quotes
    team_blocks = list(re.finditer(r'\n  ([a-z]+):\s*\{(.*?)\n  \}(?:,|\n)', text, re.DOTALL))
    print("Found teams without quotes:", len(team_blocks))

# We will build a dictionary of team -> { opp_id: { ut: X, opp: Y, prob: Z, game_match: string, span: (start, end) } }
teams_data = {}
for match in team_blocks:
    team_id = match.group(1)
    team_body = match.group(2)
    sched_match = re.search(r'schedule:\s*\[(.*?)\]', team_body, re.DOTALL)
    if not sched_match: continue
    
    games = list(re.finditer(r'\{([^\}]+)\}', sched_match.group(1), re.DOTALL))
    games_list = []
    for g in games:
        g_text = g.group(1)
        
        opp_m = re.search(r'opponentId:\s*["\']([^"\']+)["\']', g_text)
        if not opp_m: continue
        opp = opp_m.group(1)
        
        ut_m = re.search(r'projScoreUt:\s*(\d+)', g_text)
        opps_m = re.search(r'projScoreOpp:\s*(\d+)', g_text)
        prob_m = re.search(r'baseWinProb:\s*([0-9.]+)', g_text)
        
        games_list.append({
            'opp': opp,
            'ut': int(ut_m.group(1)) if ut_m else 0,
            'opps': int(opps_m.group(1)) if opps_m else 0,
            'prob': float(prob_m.group(1)) if prob_m else 50.0,
            'full_match': g.group(0),
            'start': sched_match.start(1) + g.start(0) + match.start(2),  # Relative to text? No, it's easier to just do string replacements
            'inner_text': g_text
        })
    teams_data[team_id] = games_list

# We want to synchronize. 
# We'll keep the alphabetically first team as the source of truth, unless we want to do something else.
modifications = [] # list of (old_str, new_str)
for t1, games in teams_data.items():
    for g1 in games:
        t2 = g1['opp']
        if t1 < t2 and t2 in teams_data:
            # t1 is source of truth
            g2 = next((g for g in teams_data[t2] if g['opp'] == t1), None)
            if g2:
                # modify g2's inner text
                new_g2 = g2['inner_text']
                
                # replace ut
                new_g2 = re.sub(r'projScoreUt:\s*\d+', f'projScoreUt: {g1["opps"]}', new_g2)
                # replace opps
                new_g2 = re.sub(r'projScoreOpp:\s*\d+', f'projScoreOpp: {g1["ut"]}', new_g2)
                # replace prob
                new_prob = round(100.0 - g1['prob'], 1)
                new_g2 = re.sub(r'baseWinProb:\s*[0-9.]+', f'baseWinProb: {new_prob}', new_g2)
                
                if new_g2 != g2['inner_text']:
                    old_full = g2['full_match']
                    new_full = '{' + new_g2 + '}'
                    modifications.append((old_full, new_full))

print("Modifications to make:", len(modifications))
for old, new in modifications:
    text = text.replace(old, new)

with open("data/teams.js", "w") as f:
    f.write(text)
print("Saved teams.js")
