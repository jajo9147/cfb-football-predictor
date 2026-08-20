#!/usr/bin/env python3
"""
Gridiron Oracle - Weekly Pre-Kickoff Simulation Snapshot Generator
Generates a timestamped JSON snapshot of all 22 teams, CCG matchups, and CFP seeds before kickoff.
"""

import json
import os
import datetime

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAMS_FILE = os.path.join(ROOT_DIR, 'data', 'teams.js')
ARCHIVE_DIR = os.path.join(ROOT_DIR, 'archive')

def main():
    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    
    with open(TEAMS_FILE, 'r') as f:
        content = f.read()
        
    start_idx = content.find('var TEAMS_DATABASE =') + len('var TEAMS_DATABASE =')
    end_idx = content.rfind('};

if (typeof module') + 1
    db = json.loads(content[start_idx:end_idx].strip())
    
    now = datetime.datetime.now(datetime.timezone.utc)
    week_str = now.strftime('%Y_week_%W_prekick')
    
    snapshot = {
        "season": 2026,
        "snapshotId": week_str,
        "name": f"Week {now.strftime('%W')} Pre-Kickoff Projections",
        "timestamp": now.isoformat(),
        "totalTeams": len(db),
        "teams": []
    }
    
    for team_id, data in db.items():
        snapshot["teams"].append({
            "id": team_id,
            "name": data.get("name"),
            "apRank": data.get("apRank"),
            "baseSpRating": data.get("baseSpRating", 22.0),
            "conference": data.get("conference"),
            "headCoach": data.get("headCoach"),
            "starterQb": data.get("confirmedStarterQb"),
            "totalGames": len(data.get("schedule", []))
        })
        
    out_file = os.path.join(ARCHIVE_DIR, f"{week_str}.json")
    with open(out_file, 'w') as f:
        json.dump(snapshot, f, indent=2)
        
    print(f"✅ Generated weekly snapshot: {out_file}")

if __name__ == '__main__':
    main()
