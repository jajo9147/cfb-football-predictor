import re

with open("data/teams.js", "r") as f:
    text = f.read()

team_blocks = list(re.finditer(r'\n  "?([a-zA-Z]+)"?:\s*\{(.*?)\n  \}(?:,|\n)', text, re.DOTALL))

teams_info = {}
for match in team_blocks:
    tid = match.group(1)
    body = match.group(2)
    name_m = re.search(r'name:\s*["\']([^"\']+)["\']', body)
    abbr_m = re.search(r'abbr:\s*["\']([^"\']+)["\']', body)
    teams_info[tid] = {
        'name': name_m.group(1) if name_m else "",
        'abbr': abbr_m.group(1) if abbr_m else "",
    }

print("Teams info keys:", list(teams_info.keys()))

for match in team_blocks:
    team_id = match.group(1)
    if team_id != "texas": continue
    
    team_body = match.group(2)
    sched_match = re.search(r'schedule:\s*\[(.*?)\]\s*(?:\n|\})', team_body, re.DOTALL)
    games = list(re.finditer(r'\{([^\}]+)\}', sched_match.group(1), re.DOTALL))
    
    for g in games:
        g_text = g.group(1)
        opp_name_m = re.search(r'opponent:\s*["\']([^"\']+)["\']', g_text)
        opp_abbr_m = re.search(r'oppAbbr:\s*["\']([^"\']+)["\']', g_text)
        opp_name = opp_name_m.group(1) if opp_name_m else ""
        opp_abbr = opp_abbr_m.group(1) if opp_abbr_m else ""
        print(f"Texas plays: name={opp_name}, abbr={opp_abbr}")
        
        # Resolve
        resolved = None
        for tid, info in teams_info.items():
            if info['name'] == opp_name or info['abbr'] == opp_abbr:
                resolved = tid
                break
        print(f"  -> Resolved to: {resolved}")
