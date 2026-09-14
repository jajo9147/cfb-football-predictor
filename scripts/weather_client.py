#!/usr/bin/env python3
"""
CFB Prophet - Stadium Weather Analytics Client (Open-Meteo Integration)
Maps college football stadiums to coordinates and queries Open-Meteo API
to calculate wind drag, temperature, and precipitation impact on passing EPA and O/U totals.
"""

import os
import re
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(ROOT_DIR, 'archive', 'weather_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Comprehensive College Football Stadium Registry (Lat, Lon, Elevation, Dome status)
STADIUM_REGISTRY = {
    # SEC
    "bryant-denny stadium": {"lat": 33.2075, "lon": -87.5504, "city": "Tuscaloosa, AL", "dome": False},
    "donald w. reynolds razorback stadium": {"lat": 36.0681, "lon": -94.1790, "city": "Fayetteville, AR", "dome": False},
    "jordan-hare stadium": {"lat": 32.6022, "lon": -85.4897, "city": "Auburn, AL", "dome": False},
    "ben hill griffin stadium": {"lat": 29.6499, "lon": -82.3486, "city": "Gainesville, FL", "dome": False},
    "sanford stadium": {"lat": 33.9498, "lon": -83.3734, "city": "Athens, GA", "dome": False},
    "sanford stadium (between the hedges)": {"lat": 33.9498, "lon": -83.3734, "city": "Athens, GA", "dome": False},
    "kroger field": {"lat": 38.0221, "lon": -84.5053, "city": "Lexington, KY", "dome": False},
    "tiger stadium (la)": {"lat": 30.4120, "lon": -91.1838, "city": "Baton Rouge, LA", "dome": False},
    "tiger stadium (death valley)": {"lat": 30.4120, "lon": -91.1838, "city": "Baton Rouge, LA", "dome": False},
    "tiger stadium": {"lat": 30.4120, "lon": -91.1838, "city": "Baton Rouge, LA", "dome": False},
    "davis wade stadium": {"lat": 33.4563, "lon": -88.7934, "city": "Starkville, MS", "dome": False},
    "vaught-hemingway stadium": {"lat": 34.3619, "lon": -89.5342, "city": "Oxford, MS", "dome": False},
    "faurot field": {"lat": 38.9358, "lon": -92.3332, "city": "Columbia, MO", "dome": False},
    "faurot field at memorial stadium": {"lat": 38.9358, "lon": -92.3332, "city": "Columbia, MO", "dome": False},
    "gaylord family oklahoma memorial stadium": {"lat": 35.2058, "lon": -97.4425, "city": "Norman, OK", "dome": False},
    "memorial stadium (norman, ok)": {"lat": 35.2058, "lon": -97.4425, "city": "Norman, OK", "dome": False},
    "williams-brice stadium": {"lat": 33.9731, "lon": -81.0192, "city": "Columbia, SC", "dome": False},
    "neyland stadium": {"lat": 35.9550, "lon": -83.9250, "city": "Knoxville, TN", "dome": False},
    "dkr texas memorial stadium": {"lat": 30.2837, "lon": -97.7325, "city": "Austin, TX", "dome": False},
    "dkr-texas memorial stadium": {"lat": 30.2837, "lon": -97.7325, "city": "Austin, TX", "dome": False},
    "kyle field": {"lat": 30.6102, "lon": -96.3407, "city": "College Station, TX", "dome": False},
    "kyle field (home of the 12th man)": {"lat": 30.6102, "lon": -96.3407, "city": "College Station, TX", "dome": False},
    "firstbank stadium": {"lat": 36.1441, "lon": -86.8090, "city": "Nashville, TN", "dome": False},

    # Big Ten
    "ohio stadium": {"lat": 40.0016, "lon": -83.0197, "city": "Columbus, OH", "dome": False},
    "ohio stadium (the horseshoe)": {"lat": 40.0016, "lon": -83.0197, "city": "Columbus, OH", "dome": False},
    "michigan stadium": {"lat": 42.2658, "lon": -83.7487, "city": "Ann Arbor, MI", "dome": False},
    "michigan stadium (the big house)": {"lat": 42.2658, "lon": -83.7487, "city": "Ann Arbor, MI", "dome": False},
    "beaver stadium": {"lat": 40.8122, "lon": -77.8561, "city": "University Park, PA", "dome": False},
    "autzen stadium": {"lat": 44.0583, "lon": -123.0685, "city": "Eugene, OR", "dome": False},
    "husky stadium": {"lat": 47.6504, "lon": -122.3016, "city": "Seattle, WA", "dome": False},
    "los angeles memorial coliseum": {"lat": 34.0141, "lon": -118.2879, "city": "Los Angeles, CA", "dome": False},
    "rose bowl": {"lat": 34.1613, "lon": -118.1676, "city": "Pasadena, CA", "dome": False},
    "kinnick stadium": {"lat": 41.6586, "lon": -91.5511, "city": "Iowa City, IA", "dome": False},
    "camp randall stadium": {"lat": 43.0700, "lon": -89.4127, "city": "Madison, WI", "dome": False},
    "memorial stadium (bloomington, in)": {"lat": 39.1809, "lon": -86.5256, "city": "Bloomington, IN", "dome": False},
    "memorial stadium (lincoln, ne)": {"lat": 40.8207, "lon": -96.7056, "city": "Lincoln, NE", "dome": False},
    "spartan stadium": {"lat": 42.7281, "lon": -84.4849, "city": "East Lansing, MI", "dome": False},
    "ross-ade stadium": {"lat": 40.4352, "lon": -86.9187, "city": "West Lafayette, IN", "dome": False},
    "huntington bank stadium": {"lat": 44.9765, "lon": -93.2246, "city": "Minneapolis, MN", "dome": False},
    "secu stadium": {"lat": 38.9903, "lon": -76.9474, "city": "College Park, MD", "dome": False},
    "shi stadium": {"lat": 40.5138, "lon": -74.4649, "city": "Piscataway, NJ", "dome": False},
    "ryan field": {"lat": 42.0654, "lon": -87.6925, "city": "Evanston, IL", "dome": False},
    "northwestern medicine field at martin stadium": {"lat": 42.0654, "lon": -87.6925, "city": "Evanston, IL", "dome": False},
    "gies memorial stadium": {"lat": 40.0993, "lon": -88.2360, "city": "Champaign, IL", "dome": False},

    # Big 12
    "lavell edwards stadium": {"lat": 40.2575, "lon": -111.6545, "city": "Provo, UT", "dome": False},
    "rice-eccles stadium": {"lat": 40.7599, "lon": -111.8488, "city": "Salt Lake City, UT", "dome": False},
    "folsom field": {"lat": 40.0095, "lon": -105.2669, "city": "Boulder, CO", "dome": False},
    "jones at&t stadium": {"lat": 33.5910, "lon": -101.8728, "city": "Lubbock, TX", "dome": False},
    "bill snyder family stadium": {"lat": 39.2020, "lon": -96.5938, "city": "Manhattan, KS", "dome": False},
    "jack trice stadium": {"lat": 42.0140, "lon": -93.6358, "city": "Ames, IA", "dome": False},
    "boone pickens stadium": {"lat": 36.1257, "lon": -97.0665, "city": "Stillwater, OK", "dome": False},
    "amon g. carter stadium": {"lat": 32.7097, "lon": -97.3681, "city": "Fort Worth, TX", "dome": False},
    "mclane stadium": {"lat": 31.5582, "lon": -97.1157, "city": "Waco, TX", "dome": False},
    "tdecu stadium": {"lat": 29.7218, "lon": -95.3492, "city": "Houston, TX", "dome": False},
    "david booth kansas memorial stadium": {"lat": 38.9629, "lon": -95.2464, "city": "Lawrence, KS", "dome": False},
    "arizona stadium": {"lat": 32.2288, "lon": -110.9489, "city": "Tucson, AZ", "dome": False},
    "mountain america stadium": {"lat": 33.4264, "lon": -111.9326, "city": "Tempe, AZ", "dome": False},
    "milan puskar stadium": {"lat": 39.6503, "lon": -79.9552, "city": "Morgantown, WV", "dome": False},
    "nippert stadium": {"lat": 39.1312, "lon": -84.5162, "city": "Cincinnati, OH", "dome": False},
    "acrisure bounce house": {"lat": 28.6079, "lon": -81.1979, "city": "Orlando, FL", "dome": False},

    # ACC & Notre Dame
    "notre dame stadium": {"lat": 41.6984, "lon": -86.2339, "city": "South Bend, IN", "dome": False},
    "doak campbell stadium": {"lat": 30.4382, "lon": -84.3044, "city": "Tallahassee, FL", "dome": False},
    "hard rock stadium": {"lat": 25.9580, "lon": -80.2389, "city": "Miami Gardens, FL", "dome": False},
    "memorial stadium (clemson, sc)": {"lat": 34.6788, "lon": -82.8432, "city": "Clemson, SC", "dome": False},
    "memorial stadium (death valley)": {"lat": 34.6788, "lon": -82.8432, "city": "Clemson, SC", "dome": False},
    "bobby dodd stadium": {"lat": 33.7724, "lon": -84.3928, "city": "Atlanta, GA", "dome": False},
    "l&n federal credit union stadium": {"lat": 38.2058, "lon": -85.7588, "city": "Louisville, KY", "dome": False},
    "l&n stadium": {"lat": 38.2058, "lon": -85.7588, "city": "Louisville, KY", "dome": False},
    "carter-finley stadium": {"lat": 35.7952, "lon": -78.7106, "city": "Raleigh, NC", "dome": False},
    "kenan stadium": {"lat": 35.9069, "lon": -79.0479, "city": "Chapel Hill, NC", "dome": False},
    "wallace wade stadium": {"lat": 35.9953, "lon": -78.9417, "city": "Durham, NC", "dome": False},
    "allegacy federal credit union stadium": {"lat": 36.1301, "lon": -80.2618, "city": "Winston-Salem, NC", "dome": False},
    "acrisure stadium": {"lat": 40.4468, "lon": -80.0158, "city": "Pittsburgh, PA", "dome": False},
    "gerald j. ford stadium": {"lat": 32.8378, "lon": -96.7838, "city": "Dallas, TX", "dome": False},
    "ford stadium": {"lat": 32.8378, "lon": -96.7838, "city": "Dallas, TX", "dome": False},
    "stanford stadium": {"lat": 37.4345, "lon": -122.1611, "city": "Stanford, CA", "dome": False},
    "california memorial stadium": {"lat": 37.8712, "lon": -122.2508, "city": "Berkeley, CA", "dome": False},
    "alumni stadium (chestnut hill, ma)": {"lat": 42.3351, "lon": -71.1665, "city": "Chestnut Hill, MA", "dome": False},
    "jma wireless dome": {"lat": 43.0362, "lon": -76.1363, "city": "Syracuse, NY", "dome": True},

    # Neutral & Domed Sites
    "mercedes-benz stadium": {"lat": 33.7554, "lon": -84.4010, "city": "Atlanta, GA", "dome": True},
    "caesars superdome": {"lat": 29.9511, "lon": -90.0812, "city": "New Orleans, LA", "dome": True},
    "at&t stadium": {"lat": 32.7473, "lon": -97.0945, "city": "Arlington, TX", "dome": True},
    "cotton bowl": {"lat": 32.7797, "lon": -96.7597, "city": "Dallas, TX", "dome": False},
    "nrg stadium": {"lat": 29.6847, "lon": -95.4107, "city": "Houston, TX", "dome": True},
    "allegiant stadium": {"lat": 36.0909, "lon": -115.1833, "city": "Las Vegas, NV", "dome": True},
    "lucas oil stadium": {"lat": 39.7601, "lon": -86.1639, "city": "Indianapolis, IN", "dome": True},
    "nissan stadium": {"lat": 36.1665, "lon": -86.7713, "city": "Nashville, TN", "dome": False},
    "lambeau field": {"lat": 44.5013, "lon": -88.0622, "city": "Green Bay, WI", "dome": False},
    "lincoln financial field": {"lat": 39.9008, "lon": -75.1675, "city": "Philadelphia, PA", "dome": False},
    "gillette stadium": {"lat": 42.0909, "lon": -71.2643, "city": "Foxborough, MA", "dome": False},
    "wembley stadium": {"lat": 51.5560, "lon": -0.2795, "city": "London, UK", "dome": False},
    "albertsons stadium": {"lat": 43.6028, "lon": -116.1959, "city": "Boise, ID", "dome": False},
    "canvas stadium": {"lat": 40.5701, "lon": -105.0886, "city": "Fort Collins, CO", "dome": False},
    "reser stadium": {"lat": 44.5595, "lon": -123.2814, "city": "Corvallis, OR", "dome": False},
    "martin stadium": {"lat": 46.7319, "lon": -117.1605, "city": "Pullman, WA", "dome": False}
}

# Fallback generic weather profiles by month (when game is too far in future for 7-day forecast)
SEASONAL_CLIMATE_DEFAULTS = {
    8: {"temp": 86.0, "wind": 6.5, "precip": 0.0, "desc": "Summer Warmth"},
    9: {"temp": 78.0, "wind": 7.5, "precip": 0.0, "desc": "Mild Fall"},
    10: {"temp": 65.0, "wind": 9.0, "precip": 0.0, "desc": "Crisp Autumn"},
    11: {"temp": 52.0, "wind": 11.0, "precip": 0.0, "desc": "Late Fall Breeze"},
    12: {"temp": 42.0, "wind": 12.5, "precip": 0.02, "desc": "Chilly Winter"},
    1: {"temp": 38.0, "wind": 13.0, "precip": 0.04, "desc": "Postseason Cold"}
}

def resolve_stadium(stadium_name):
    """Fuzzy resolution of stadium name against STADIUM_REGISTRY."""
    if not stadium_name:
        return None, None
    s = stadium_name.lower().strip()
    if s in STADIUM_REGISTRY:
        return s, STADIUM_REGISTRY[s]
    
    # Partial match
    for key, data in STADIUM_REGISTRY.items():
        if key in s or s in key:
            return key, data
    return None, None

def fetch_open_meteo_forecast(lat, lon):
    """Queries Open-Meteo 7-day hourly forecast with local caching."""
    cache_key = f"forecast_{round(lat, 4)}_{round(lon, 4)}"
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json")

    # Check cache freshness (refresh if older than 4 hours)
    if os.path.exists(cache_file):
        try:
            mtime = os.path.getmtime(cache_file)
            age_hours = (datetime.now().timestamp() - mtime) / 3600.0
            if age_hours < 4.0:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception:
            pass

    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&"
        f"hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m&"
        f"temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto"
    )

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'CFBProphet-Engine/1.0'})
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode('utf-8'))
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(data, f)
            return data
    except Exception as e:
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return None

def get_stadium_weather(stadium_name, game_date_str=None, kickoff_str=None):
    """
    Returns authentic weather projection for a given stadium and game time.
    Calculates temperature, wind speed, gusts, precipitation, and conditions.
    """
    _, stadium_data = resolve_stadium(stadium_name)

    # If dome, return fixed controlled conditions
    if stadium_data and stadium_data.get("dome"):
        return {
            "temp": 72.0,
            "windSpeed": 0.0,
            "windGust": 0.0,
            "precipProb": 0,
            "precipInches": 0.0,
            "condition": "Dome",
            "isDome": True,
            "city": stadium_data.get("city", ""),
            "desc": "🏟️ Dome / 72°F Controlled"
        }

    # Default coordinates fallback (continental US center)
    lat = stadium_data.get("lat", 39.8283) if stadium_data else 39.8283
    lon = stadium_data.get("lon", -98.5795) if stadium_data else -98.5795
    city = stadium_data.get("city", "") if stadium_data else ""

    # Parse game date if provided
    month = 9
    if game_date_str:
        try:
            if "-" in game_date_str:
                month = int(game_date_str.split("-")[1])
            else:
                m_match = re.search(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)', game_date_str, re.I)
                if m_match:
                    month_names = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
                    month = month_names.index(m_match.group(1).lower()) + 1
        except Exception:
            month = 9

    # Fetch live Open-Meteo forecast
    forecast_data = fetch_open_meteo_forecast(lat, lon)
    if forecast_data and 'hourly' in forecast_data:
        hourly = forecast_data['hourly']
        times = hourly.get('time', [])
        temps = hourly.get('temperature_2m', [])
        winds = hourly.get('wind_speed_10m', [])
        gusts = hourly.get('wind_gusts_10m', [])
        precips = hourly.get('precipitation', [])
        probs = hourly.get('precipitation_probability', [])

        target_idx = None
        if game_date_str:
            date_match = re.search(r'2026-(\d{2})-(\d{2})', game_date_str)
            if date_match:
                date_prefix = f"2026-{date_match.group(1)}-{date_match.group(2)}"
                for i, t in enumerate(times):
                    if t.startswith(date_prefix):
                        if "T15:00" in t or "T16:00" in t:
                            target_idx = i
                            break
                if target_idx is None:
                    for i, t in enumerate(times):
                        if t.startswith(date_prefix):
                            target_idx = i
                            break

        if target_idx is None and len(temps) > 0:
            target_idx = min(len(temps) - 1, 72)

        if target_idx is not None and target_idx < len(temps):
            temp = round(float(temps[target_idx] or 72.0), 1)
            wind = round(float(winds[target_idx] or 6.0), 1)
            gust = round(float(gusts[target_idx] or wind * 1.3), 1) if gusts else round(wind * 1.3, 1)
            precip = round(float(precips[target_idx] or 0.0), 2) if precips else 0.0
            prob = int(probs[target_idx] or 0) if probs else 0

            if precip > 0.15:
                condition = "Heavy Rain" if temp > 34 else "Snow"
                icon = "🌧️" if temp > 34 else "❄️"
            elif precip > 0.03 or prob > 60:
                condition = "Light Rain"
                icon = "🌦️"
            elif wind >= 18.0:
                condition = "High Wind"
                icon = "💨"
            elif temp >= 88.0:
                condition = "Clear / Hot"
                icon = "☀️"
            elif temp <= 40.0:
                condition = "Cold / Crisp"
                icon = "🥶"
            else:
                condition = "Clear / Optimal"
                icon = "☀️"

            wind_alert = " (Under Alert)" if wind >= 15.0 else ""
            desc = f"{icon} {int(round(temp))}°F • {int(round(wind))} mph wind{wind_alert}"

            return {
                "temp": temp,
                "windSpeed": wind,
                "windGust": gust,
                "precipProb": prob,
                "precipInches": precip,
                "condition": condition,
                "isDome": False,
                "city": city,
                "desc": desc
            }

    # Seasonal baseline climate fallback
    climate = SEASONAL_CLIMATE_DEFAULTS.get(month, SEASONAL_CLIMATE_DEFAULTS[9])
    temp = climate["temp"]
    wind = climate["wind"]
    wind_alert = " (Under Alert)" if wind >= 15.0 else ""
    return {
        "temp": temp,
        "windSpeed": wind,
        "windGust": round(wind * 1.3, 1),
        "precipProb": 10,
        "precipInches": climate["precip"],
        "condition": climate["desc"],
        "isDome": False,
        "city": city,
        "desc": f"☀️ {int(round(temp))}°F • {int(round(wind))} mph wind{wind_alert}"
    }

def calculate_weather_impact(weather_dict):
    """
    Computes mathematical drag on game totals, passing EPA, and field goals.
    """
    if not weather_dict or weather_dict.get("isDome"):
        return {
            "totalPointsDrag": 0.0,
            "passEffMultiplier": 1.0,
            "fgSuccessMultiplier": 1.0,
            "turnoverMultiplier": 1.0,
            "underAlert": False,
            "summary": "Controlled Conditions"
        }

    wind = float(weather_dict.get("windSpeed", 6.0))
    temp = float(weather_dict.get("temp", 72.0))
    precip = float(weather_dict.get("precipInches", 0.0))

    pts_drag = 0.0
    pass_mult = 1.0
    fg_mult = 1.0
    to_mult = 1.0
    under_alert = False

    # 1. Wind drag
    if wind >= 20.0:
        pts_drag += 4.2
        pass_mult *= 0.82
        fg_mult *= 0.75
        under_alert = True
    elif wind >= 15.0:
        pts_drag += 2.4
        pass_mult *= 0.90
        fg_mult *= 0.85
        under_alert = True
    elif wind >= 11.0:
        pts_drag += 0.8
        pass_mult *= 0.96
        fg_mult *= 0.94

    # 2. Rain / Snow drag
    if precip >= 0.15:
        pts_drag += 2.5
        pass_mult *= 0.88
        to_mult *= 1.35
    elif precip >= 0.04:
        pts_drag += 1.0
        pass_mult *= 0.94
        to_mult *= 1.15

    # 3. Freezing temperature drag
    if temp <= 30.0:
        pts_drag += 1.8
        fg_mult *= 0.88
    elif temp <= 40.0:
        pts_drag += 0.6

    pts_drag = round(pts_drag, 1)

    return {
        "totalPointsDrag": pts_drag,
        "passEffMultiplier": round(pass_mult, 3),
        "fgSuccessMultiplier": round(fg_mult, 3),
        "turnoverMultiplier": round(to_mult, 3),
        "underAlert": under_alert,
        "summary": f"-{pts_drag} pts weather drag" if pts_drag > 0 else "Neutral weather"
    }

if __name__ == '__main__':
    print("Testing CFB Prophet Stadium Weather Engine...")
    test_stadiums = [
        "DKR Texas Memorial Stadium",
        "Ohio Stadium",
        "Mercedes-Benz Stadium",
        "Husky Stadium",
        "Beaver Stadium",
        "Camp Randall Stadium"
    ]
    for st in test_stadiums:
        w = get_stadium_weather(st, game_date_str="2026-09-19")
        impact = calculate_weather_impact(w)
        print(f"\n🏟️ {st} ({w.get('city')}):")
        print(f"   Weather: {w.get('desc')} | Cond: {w.get('condition')}")
        print(f"   Impact: Total Drag: -{impact['totalPointsDrag']} pts | Pass Eff: {impact['passEffMultiplier']}x | Under Alert: {impact['underAlert']}")
