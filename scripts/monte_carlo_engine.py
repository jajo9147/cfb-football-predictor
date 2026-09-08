#!/usr/bin/env python3
"""
CFB Prophet - Advanced Monte Carlo Drive-by-Drive Simulation Engine
Simulates 10,000 possession-by-possession football games using real 2026 CFBD EPA/PPA,
247Sports Team Talent Composite, tempo/pace metrics, and venue home-field advantage.
Calculates authentic Cover Probability (ATS) and Over/Under hit rates against Vegas lines.
"""

import os
import sys
import math
import random
import json

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import cfbd_client
except ImportError:
    cfbd_client = None

# Baseline drive outcome rates in FBS college football
BASE_TD_RATE = 0.225
BASE_FG_RATE = 0.135
BASE_TO_RATE = 0.095

def estimate_team_pace(team_name, conf=''):
    """Estimate offensive drives per game based on offensive tempo."""
    fast_pace_teams = ['tennessee', 'ole miss', 'texas tech', 'tcu', 'usf', 'north texas', 'oklahoma state']
    slow_pace_teams = ['iowa', 'michigan', 'wisconsin', 'minnesota', 'air force', 'navy', 'army']
    
    t = team_name.lower()
    if any(fp in t for fp in fast_pace_teams):
        return 14.2
    if any(sp in t for sp in slow_pace_teams):
        return 10.8
    return 12.3

def simulate_matchup_10k(
    team_a_name,
    team_b_name,
    sp_a,
    sp_b,
    talent_a=750.0,
    talent_b=650.0,
    ppa_off_a=0.15,
    ppa_off_b=0.10,
    ret_prod_a=0.60,
    ret_prod_b=0.60,
    is_home_a=True,
    hfa_pts=2.5,
    vegas_spread=None,
    vegas_total=52.5,
    iterations=10000
):
    """
    Simulates 10,000 full drive-by-drive games between Team A and Team B.
    Returns full score distributions, median margin, cover probability, and O/U odds.
    Incorporates 2026 CFBD SP+, 247Sports Talent, EPA/PPA, and Returning Production.
    """
    hfa = hfa_pts if is_home_a else -hfa_pts

    # 1. Calculate tempo (total drives per game)
    pace_a = estimate_team_pace(team_a_name)
    pace_b = estimate_team_pace(team_b_name)
    avg_drives = (pace_a + pace_b) / 2.0

    # 2. Talent delta and blowout bonus
    talent_delta = talent_a - talent_b
    talent_bonus = 0.0
    if cfbd_client:
        if talent_delta > 0:
            talent_bonus = cfbd_client.calculate_talent_blowout_bonus(talent_a, talent_b)
        else:
            talent_bonus = -cfbd_client.calculate_talent_blowout_bonus(talent_b, talent_a)

    # 2.5 Returning Production & Roster Continuity Differential
    ret_delta = (float(ret_prod_a or 0.60) - float(ret_prod_b or 0.60)) * 3.0

    # 3. SP+ rating differential (points per game scale)
    sp_diff = (sp_a - sp_b) + hfa + (talent_bonus * 0.5) + ret_delta


    # 4. Modulate per-drive scoring probabilities
    # A 7-point SP+ advantage translates to ~+0.05 TD probability per drive
    p_td_a = max(0.08, min(0.65, BASE_TD_RATE + (sp_diff * 0.0075) + ((ppa_off_a - 0.15) * 0.25)))
    p_fg_a = max(0.05, min(0.22, BASE_FG_RATE + (sp_diff * 0.0015)))
    
    p_td_b = max(0.04, min(0.55, BASE_TD_RATE - (sp_diff * 0.0075) + ((ppa_off_b - 0.15) * 0.25)))
    p_fg_b = max(0.04, min(0.20, BASE_FG_RATE - (sp_diff * 0.0015)))

    # Ensure total probability doesn't exceed 0.85 (leave room for punts/turnovers)
    if p_td_a + p_fg_a > 0.82:
        scale_a = 0.82 / (p_td_a + p_fg_a)
        p_td_a *= scale_a
        p_fg_a *= scale_a

    if p_td_b + p_fg_b > 0.80:
        scale_b = 0.80 / (p_td_b + p_fg_b)
        p_td_b *= scale_b
        p_fg_b *= scale_b

    # Tracking metrics
    team_a_scores = []
    team_b_scores = []
    margins = []
    totals = []
    covers = 0
    pushes = 0
    overs = 0
    under_totals = 0

    # Benchmark spread for Team A (e.g. -24.5 means Team A needs to win by 25+)
    spread_a = vegas_spread if vegas_spread is not None else -round(sp_diff * 2) / 2.0
    line_target = -spread_a # Margin needed by Team A to cover

    for _ in range(iterations):
        # Vary drives slightly per game (normal distribution std dev 1.0)
        drives = int(round(random.gauss(avg_drives, 1.1)))
        drives = max(9, min(16, drives))

        score_a = 0
        score_b = 0

        for d in range(drives):
            # 4th Quarter Blowout Logic (last 3 drives if margin >= 24)
            in_garbage_time = (d >= drives - 3) and abs(score_a - score_b) >= 24
            
            cur_p_td_a = p_td_a
            cur_p_td_b = p_td_b

            if in_garbage_time:
                if score_a > score_b:
                    # Team A leading big: if talent advantage is high, 2nd string still scores
                    cur_p_td_a = p_td_a * (0.80 if talent_delta > 350 else 0.55)
                    cur_p_td_b = p_td_b * 0.40 # Team B offense demoralized
                else:
                    cur_p_td_b = p_td_b * (0.80 if talent_delta < -350 else 0.55)
                    cur_p_td_a = p_td_a * 0.40

            # Team A drive
            r_a = random.random()
            if r_a < cur_p_td_a:
                # 96% XP made, 4% 2-pt/missed XP
                score_a += 7 if random.random() < 0.96 else 6
            elif r_a < cur_p_td_a + p_fg_a:
                score_a += 3

            # Team B drive
            r_b = random.random()
            if r_b < cur_p_td_b:
                score_b += 7 if random.random() < 0.96 else 6
            elif r_b < cur_p_td_b + p_fg_b:
                score_b += 3

        # Overtime if tied
        if score_a == score_b:
            ot_winner = random.choice([('a', 6), ('b', 6), ('a', 3), ('b', 3), ('a', 2), ('b', 2)])
            if ot_winner[0] == 'a':
                score_a += ot_winner[1]
            else:
                score_b += ot_winner[1]

        margin = score_a - score_b
        total = score_a + score_b

        team_a_scores.append(score_a)
        team_b_scores.append(score_b)
        margins.append(margin)
        totals.append(total)

        # ATS grading against line_target
        if margin > line_target:
            covers += 1
        elif margin == line_target:
            pushes += 1

        # Total grading
        if total > vegas_total:
            overs += 1
        elif total < vegas_total:
            under_totals += 1

    # Statistical summaries
    team_a_scores.sort()
    team_b_scores.sort()
    margins.sort()
    totals.sort()

    mean_a = round(sum(team_a_scores) / iterations, 1)
    mean_b = round(sum(team_b_scores) / iterations, 1)
    median_margin = margins[iterations // 2]
    median_total = totals[iterations // 2]

    cover_pct = round((covers / iterations) * 100.0, 1)
    push_pct = round((pushes / iterations) * 100.0, 1)
    dog_cover_pct = round(100.0 - cover_pct - push_pct, 1)

    over_pct = round((overs / iterations) * 100.0, 1)
    under_pct = round((under_totals / iterations) * 100.0, 1)

    # Win probability (clamped 1.0% to 99.0% to reflect authentic sports uncertainty)
    a_wins = sum(1 for m in margins if m > 0)
    win_prob_a = max(1.0, min(99.0, round((a_wins / iterations) * 100.0, 1)))


    # Determine recommended side
    if cover_pct >= 53.5:
        recommended_ats = f"{team_a_name} {spread_a:+0.1f}"
        ats_confidence = cover_pct
    elif dog_cover_pct >= 53.5:
        dog_spread = -spread_a
        recommended_ats = f"{team_b_name} {dog_spread:+0.1f}"
        ats_confidence = dog_cover_pct
    else:
        recommended_ats = "PASS (Fair Market Line)"
        ats_confidence = max(cover_pct, dog_cover_pct)

    # Determine Over/Under pick
    if over_pct >= 54.0:
        recommended_ou = f"OVER {vegas_total}"
        ou_confidence = over_pct
    elif under_pct >= 54.0:
        recommended_ou = f"UNDER {vegas_total}"
        ou_confidence = under_pct
    else:
        recommended_ou = "PASS (Fair Total)"
        ou_confidence = max(over_pct, under_pct)

    return {
        'teamA': team_a_name,
        'teamB': team_b_name,
        'iterations': iterations,
        'projScoreA': int(round(mean_a)),
        'projScoreB': int(round(mean_b)),
        'meanScoreA': mean_a,
        'meanScoreB': mean_b,
        'medianMargin': median_margin,
        'medianTotal': median_total,
        'winProbA': win_prob_a,
        'vegasSpread': spread_a,
        'coverProbA': cover_pct,
        'coverProbB': dog_cover_pct,
        'pushProb': push_pct,
        'recommendedAts': recommended_ats,
        'atsConfidence': ats_confidence,
        'vegasTotal': vegas_total,
        'overProb': over_pct,
        'underProb': under_pct,
        'recommendedOu': recommended_ou,
        'ouConfidence': ou_confidence,
        'scoreDistributionA': {
            'p10': team_a_scores[int(iterations * 0.10)],
            'p25': team_a_scores[int(iterations * 0.25)],
            'p50': team_a_scores[int(iterations * 0.50)],
            'p75': team_a_scores[int(iterations * 0.75)],
            'p90': team_a_scores[int(iterations * 0.90)],
        },
        'scoreDistributionB': {
            'p10': team_b_scores[int(iterations * 0.10)],
            'p25': team_b_scores[int(iterations * 0.25)],
            'p50': team_b_scores[int(iterations * 0.50)],
            'p75': team_b_scores[int(iterations * 0.75)],
            'p90': team_b_scores[int(iterations * 0.90)],
        }
    }

if __name__ == '__main__':
    print("Testing 10,000 Monte Carlo Drive-by-Drive Physics Engine...")
    import time
    t0 = time.time()
    
    # Test Georgia vs Tennessee State
    sim = simulate_matchup_10k(
        team_a_name="Georgia",
        team_b_name="Tennessee State",
        sp_a=34.5,
        sp_b=-14.0,
        talent_a=1003.67,
        talent_b=180.0,
        ppa_off_a=0.32,
        ppa_off_b=-0.05,
        is_home_a=True,
        hfa_pts=4.0,
        vegas_spread=-49.5,
        vegas_total=56.5,
        iterations=10000
    )
    
    elapsed = (time.time() - t0) * 1000
    print(f"Simulated in {elapsed:.1f} ms!")
    print(f"Projected Score: {sim['teamA']} {sim['projScoreA']} – {sim['projScoreB']} {sim['teamB']}")
    print(f"Spread: {sim['vegasSpread']} | Cover Probability: {sim['coverProbA']}% | Dog Cover: {sim['coverProbB']}%")
    print(f"Recommended ATS Pick: {sim['recommendedAts']} ({sim['atsConfidence']}% confidence)")
    print(f"O/U: {sim['vegasTotal']} | Over Prob: {sim['overProb']}% | Under Prob: {sim['underProb']}%")
    print(f"Recommended Total Pick: {sim['recommendedOu']} ({sim['ouConfidence']}% confidence)")
    print("Score Distribution Team A (Georgia):", sim['scoreDistributionA'])
    print("Score Distribution Team B (Tennessee State):", sim['scoreDistributionB'])
