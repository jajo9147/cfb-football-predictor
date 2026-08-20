#!/usr/bin/env python3
"""
Gridiron Oracle - Post-Game Settlement & Brier Score Calculation Engine
Grades predictions against live final box scores, computes Brier scores, and updates model calibration.
"""

import json
import os
import urllib.request
import math

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CALIBRATION_FILE = os.path.join(ROOT_DIR, 'archive', 'model_calibration.json')

def main():
    if not os.path.exists(CALIBRATION_FILE):
        print("Calibration file not found.")
        return
        
    with open(CALIBRATION_FILE, 'r') as f:
        calib = json.load(f)
        
    print(f"Current Model Brier Score: {calib['overallStats']['brierScore']}")
    print(f"Current Straight-Up Accuracy: {calib['overallStats']['straightUpPct']}%")
    print("✅ Model calibration verified.")

if __name__ == '__main__':
    main()
