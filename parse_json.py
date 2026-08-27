import json
import re

with open("data/teams.js", "r") as f:
    text = f.read()

db_match = re.search(r'var TEAMS_DATABASE = (\{.*\});?\s*if\s*\(typeof', text, re.DOTALL)
if db_match:
    json_str = db_match.group(1)
    # Javascript keys and strings might be valid JSON if they use double quotes.
    # In teams.js they do!
    try:
        data = json.loads(json_str)
        print("Successfully parsed JSON! Teams:", len(data.keys()))
    except Exception as e:
        print("JSON parse error:", e)
        # Maybe trailing commas? Let's fix trailing commas
        json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
        try:
            data = json.loads(json_str)
            print("Successfully parsed JSON after fixing trailing commas! Teams:", len(data.keys()))
        except Exception as e:
            print("Still error:", e)
else:
    print("Could not extract DB")
