import re
with open("data/teams.js", "r") as f:
    text = f.read()

def print_game(team_id, opp_id):
    team_blocks = list(re.finditer(r'\n  "([a-z]+)": \{(.*?)\n  \}(?:,|\n)', text, re.DOTALL))
    for m in team_blocks:
        if m.group(1) == team_id:
            sched_match = re.search(r'schedule:\s*\[(.*?)\]', m.group(2), re.DOTALL)
            games = list(re.finditer(r'\{([^\}]+)\}', sched_match.group(1), re.DOTALL))
            for g in games:
                if f'opponentId: "{opp_id}"' in g.group(1):
                    print(f"--- {team_id} vs {opp_id} ---")
                    print(g.group(1).strip())

print_game("texas", "texasam")
print_game("texasam", "texas")
