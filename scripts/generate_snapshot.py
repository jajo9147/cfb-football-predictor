#!/usr/bin/env python3
"""
Gridiron Oracle - Weekly Pre-Kickoff Simulation Snapshot Generator
Generates a timestamped JSON snapshot of all 26 teams (Complete AP Top 25 & G5 contender), CCG matchups, and CFP seeds before kickoff.
"""

import json
import os
import datetime
import re

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAMS_FILE = os.path.join(ROOT_DIR, 'data', 'teams.js')
ARCHIVE_DIR = os.path.join(ROOT_DIR, 'archive')
CALIBRATION_FILE = os.path.join(ARCHIVE_DIR, 'model_calibration.json')

def load_teams_database():
    with open(TEAMS_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    match = re.search(r'var\s+TEAMS_DATABASE\s*=\s*(\{[\s\S]*?\});\s*(?:if\s*\(typeof module|\Z)', content)
    if not match:
        raise ValueError("Could not locate TEAMS_DATABASE in teams.js")
    
    json_str = match.group(1)
    return json.loads(json_str)

def main():
    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    db = load_teams_database()
    
    now = datetime.datetime.now(datetime.timezone.utc)
    week_str = now.strftime('%Y_week_%W_prekick')
    
    snapshot = {
        "season": 2026,
        "snapshotId": week_str,
        "name": f"Week {now.strftime('%W')} Pre-Kickoff Projections",
        "timestamp": now.isoformat(),
        "totalTeams": len(db),
        "teams": [],
        "marqueeMatchups": []
    }
    
    for team_id, data in db.items():
        team_entry = {
            "id": team_id,
            "name": data.get("name"),
            "shortName": data.get("shortName"),
            "apRank": data.get("apRank"),
            "baseSpRating": data.get("baseSpRating", 22.0),
            "conference": data.get("conference"),
            "headCoach": data.get("headCoach"),
            "starterQb": data.get("confirmedStarterQb"),
            "totalGames": len(data.get("schedule", [])),
            "schedule": []
        }
        for g in data.get("schedule", []):
            team_entry["schedule"].append({
                "id": g.get("id"),
                "week": g.get("week"),
                "date": g.get("date"),
                "opponent": g.get("opponent"),
                "oppAbbr": g.get("oppAbbr"),
                "oppRank": g.get("oppRank"),
                "isHome": g.get("isHome", True),
                "stadium": g.get("stadium"),
                "baseWinProb": g.get("baseWinProb", 50),
                "projScoreUt": g.get("projScoreUt", 24),
                "projScoreOpp": g.get("projScoreOpp", 21)
            })
            if g.get("isMarquee"):
                snapshot["marqueeMatchups"].append({
                    "teamId": team_id,
                    "teamName": data.get("name"),
                    "oppName": g.get("opponent"),
                    "week": g.get("week"),
                    "winProb": g.get("baseWinProb", 50),
                    "projScore": f"{g.get('projScoreUt', 24)}-{g.get('projScoreOpp', 21)}"
                })
        snapshot["teams"].append(team_entry)
        
    out_file = os.path.join(ARCHIVE_DIR, f"{week_str}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, indent=2)
        
    print(f"✅ Generated weekly pre-kickoff snapshot: {out_file}")

    # Register in model_calibration.json snapshots
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, 'r', encoding='utf-8') as f:
            calib = json.load(f)
        
        if "snapshots" not in calib:
            calib["snapshots"] = []
            
        if not any(s.get("id") == week_str for s in calib["snapshots"]):
            calib["snapshots"].append({
                "id": week_str,
                "name": f"Week {now.strftime('%W')} Pre-Kickoff Snapshot",
                "date": now.strftime("%b %d, %Y"),
                "file": f"archive/{week_str}.json"
            })
            with open(CALIBRATION_FILE, 'w', encoding='utf-8') as f:
                json.dump(calib, f, indent=2)
            print(f"✅ Registered snapshot in model_calibration.json")

if __name__ == '__main__':
    main()
