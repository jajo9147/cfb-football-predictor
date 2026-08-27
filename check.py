import re

with open("data/teams.js", "r") as f:
    text = f.read()

# Extract the TEAMS_DATABASE object content
match = re.search(r'var TEAMS_DATABASE = \{(.*?)^\};', text, re.MULTILINE | re.DOTALL)
if match:
    db_text = match.group(1)
    
    # find all team keys (e.g., `  ohiostate: {`)
    team_matches = list(re.finditer(r'^  ([a-z]+):\s*\{', db_text, re.MULTILINE))
    teams = {}
    for i in range(len(team_matches)):
        team_id = team_matches[i].group(1)
        start = team_matches[i].end()
        end = team_matches[i+1].start() if i + 1 < len(team_matches) else len(db_text)
        team_body = db_text[start:end]
        
        # parse games
        sched_match = re.search(r'schedule:\s*\[(.*?)\]', team_body, re.DOTALL)
        if sched_match:
            games_text = sched_match.group(1)
            games = re.findall(r'\{([^\}]+)\}', games_text)
            parsed_games = []
            for g in games:
                opp_match = re.search(r'opponentId:\s*[\'"]([^\'"]+)[\'"]', g)
                if not opp_match: continue
                opp = opp_match.group(1)
                
                ut_match = re.search(r'projScoreUt:\s*(\d+)', g)
                opps_match = re.search(r'projScoreOpp:\s*(\d+)', g)
                
                parsed_games.append({
                    'opp': opp,
                    'ut': int(ut_match.group(1)) if ut_match else 0,
                    'opp_score': int(opps_match.group(1)) if opps_match else 0
                })
            teams[team_id] = parsed_games

    asym = []
    for t1, sched in teams.items():
        for g1 in sched:
            t2 = g1['opp']
            if t2 in teams:
                g2 = next((g for g in teams[t2] if g['opp'] == t1), None)
                if g2:
                    if g1['ut'] != g2['opp_score'] or g1['opp_score'] != g2['ut']:
                        asym.append(f"{t1} vs {t2}: {t1} has {g1['ut']}-{g1['opp_score']}, {t2} has {g2['ut']}-{g2['opp_score']}")

    print("Teams parsed:", len(teams))
    print("Asymmetries found:", len(asym))
    if asym:
        for a in asym[:10]: print(a)
    
    # Check ASU
    print("ASU in DB?", "arizonastate" in teams)
    
