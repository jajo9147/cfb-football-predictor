import re
import json

with open('data/teams.js', 'r') as f:
    content = f.read()

# Try to parse TEAMS_DATABASE by finding its JSON-like structure
db_match = re.search(r'var TEAMS_DATABASE = (\{.*?\});\n\nif', content, re.DOTALL)
if not db_match:
    # Try a less strict match
    db_match = re.search(r'var TEAMS_DATABASE = (\{.*?\});\s*(?:if|var|let)', content, re.DOTALL)

if db_match:
    db_str = db_match.group(1)
    
    # Python json.loads can't parse JS if keys aren't quoted or there are trailing commas.
    # We'll use a more robust JS parser via node... oh wait, node is not available.
    
    # Let's extract the schedules using regex
    teams = re.findall(r'\n  "([a-z]+)": \{(.*?)\n  \},?\n', content, re.DOTALL)
    
    schedules = {}
    for team_id, team_body in teams:
        schedule_match = re.search(r'schedule: \[(.*?)\]\s*\}', team_body, re.DOTALL)
        if schedule_match:
            games_str = schedule_match.group(1)
            games = re.findall(r'\{(.*?)\}', games_str, re.DOTALL)
            parsed_games = []
            for g in games:
                opp_id_match = re.search(r'opponentId:\s*"([^"]+)"', g)
                if not opp_id_match:
                    continue
                opp_id = opp_id_match.group(1)
                
                win_prob_match = re.search(r'baseWinProb:\s*([0-9.]+)', g)
                win_prob = float(win_prob_match.group(1)) if win_prob_match else 50.0
                
                proj_ut_match = re.search(r'projScoreUt:\s*([0-9]+)', g)
                proj_ut = int(proj_ut_match.group(1)) if proj_ut_match else 0
                
                proj_opp_match = re.search(r'projScoreOpp:\s*([0-9]+)', g)
                proj_opp = int(proj_opp_match.group(1)) if proj_opp_match else 0
                
                parsed_games.append({
                    'opp': opp_id,
                    'prob': win_prob,
                    'score_ut': proj_ut,
                    'score_opp': proj_opp
                })
            schedules[team_id] = parsed_games

    # Check symmetry
    asymmetries = []
    for t1, sched in schedules.items():
        for g1 in sched:
            t2 = g1['opp']
            if t2 in schedules:
                # Find t1 in t2's schedule
                g2 = next((g for g in schedules[t2] if g['opp'] == t1), None)
                if g2:
                    # check symmetry
                    prob_sum = g1['prob'] + g2['prob']
                    score_match = (g1['score_ut'] == g2['score_opp']) and (g1['score_opp'] == g2['score_ut'])
                    
                    if abs(prob_sum - 100.0) > 0.1 or not score_match:
                        asymmetries.append(f"{t1} vs {t2}: {t1} has {g1['prob']}% ({g1['score_ut']}-{g1['score_opp']}), {t2} has {g2['prob']}% ({g2['score_ut']}-{g2['score_opp']})")

    if not asymmetries:
        print("All matchups are perfectly symmetrical!")
    else:
        print(f"Found {len(asymmetries)} asymmetrical matchups. First 10:")
        for a in asymmetries[:10]:
            print(a)
else:
    print("Could not find TEAMS_DATABASE")
