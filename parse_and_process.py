import json
import re

with open("data/teams.js", "r") as f:
    text = f.read()

db_match = re.search(r'var TEAMS_DATABASE = (\{.*\});?\s*if\s*\(typeof', text, re.DOTALL)
aliases_match = re.search(r'var TEAM_SEARCH_ALIASES = (\{.*\});?\s*if\s*\(typeof', text, re.DOTALL)

data = json.loads(db_match.group(1))
aliases = json.loads(aliases_match.group(1))

# Check who plays ASU
asu_games = []
for tid, team in data.items():
    for g in team.get('schedule', []):
        if 'arizona state' in g.get('opponent', '').lower() or g.get('oppAbbr', '').lower() == 'asu':
            asu_games.append(f"{tid} plays ASU: {g['opponent']}")
            
print("ASU Games found in other schedules:", asu_games)
