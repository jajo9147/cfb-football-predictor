// ==========================================================================
// GRIDIRON ORACLE - MULTI-TEAM COLLEGE FOOTBALL AI PREDICTOR ENGINE (2026)
// ==========================================================================

const state = {
  currentTeamId: 'texas',
  filter: 'all',
  globalSliders: {
    qbRating: 0,
    groundAttack: 0,
    defenseHavoc: 0,
    turnoverLuck: 0,
    crowdNoise: 0
  },
  gameSliders: {}, // Map of gameId -> { qbRating, groundAttack, defenseHavoc, turnoverLuck, crowdNoise, isCustom }
  userPicks: {},   // Map of gameId -> 'W' | 'L' | null
  activeModalGame: null,
  deferredPrompt: null
};

// Global Preset Definitions
const GLOBAL_PRESETS = {
  'baseline': { qbRating: 0, groundAttack: 0, defenseHavoc: 0, turnoverLuck: 0, crowdNoise: 0 },
  'qb-mvp': { qbRating: 25, groundAttack: 10, defenseHavoc: 5, turnoverLuck: 10, crowdNoise: 15 },
  'qb-slump': { qbRating: -25, groundAttack: -10, defenseHavoc: -5, turnoverLuck: -15, crowdNoise: 0 },
  'iron-defense': { qbRating: 0, groundAttack: 5, defenseHavoc: 30, turnoverLuck: 15, crowdNoise: 20 },
  'chaos': { qbRating: -15, groundAttack: 15, defenseHavoc: -20, turnoverLuck: -30, crowdNoise: 30 }
};

// Single-Game Presets
const GAME_PRESETS = {
  'baseline': { qbRating: 0, groundAttack: 0, defenseHavoc: 0, turnoverLuck: 0, crowdNoise: 0 },
  'qb-slump': { qbRating: -30, groundAttack: -5, defenseHavoc: -5, turnoverLuck: -20, crowdNoise: -10 },
  'blowout': { qbRating: 30, groundAttack: 25, defenseHavoc: 20, turnoverLuck: 15, crowdNoise: 20 },
  'turnover-trap': { qbRating: -15, groundAttack: -10, defenseHavoc: -10, turnoverLuck: -35, crowdNoise: -15 },
  'ground-pound': { qbRating: -10, groundAttack: 30, defenseHavoc: 15, turnoverLuck: 5, crowdNoise: 10 }
};

// ==========================================================================
// INITIALIZATION & EVENT LISTENERS
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initPwaServiceWorker();
  renderTeamSelector();
  selectTeam('texas');
  initGlobalSliders();
  initGlobalPresetButtons();
  initFilterButtons();
  initModalSubTabs();
  initModalActions();
  initHypeCardExport();
  initPwaInstall();
  startCountdownTicker();
});

// ==========================================================================
// PWA SERVICE WORKER
// ==========================================================================

function initPwaServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js?v=2026.5')
        .then(reg => {
          reg.update();
          console.log('PWA Service Worker registered:', reg.scope);
        })
        .catch(err => console.log('Service Worker registration failed:', err));
    });
  }
}

// ==========================================================================
// TEAM SWITCHING & THEME INJECTION
// ==========================================================================

function getNumericRank(team) {
  if (team.playoffContenderRank) return team.playoffContenderRank;
  const match = (team.apRank || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 99;
}

function renderTeamSelector() {
  const track = document.getElementById('teamSelectorTrack');
  if (!track) return;

  track.innerHTML = '';
  const teamKeys = Object.keys(TEAMS_DATABASE).sort((a, b) => {
    return getNumericRank(TEAMS_DATABASE[a]) - getNumericRank(TEAMS_DATABASE[b]);
  });

  teamKeys.forEach(key => {
    const team = TEAMS_DATABASE[key];
    const btn = document.createElement('button');
    btn.className = `team-pill-btn ${key === state.currentTeamId ? 'active' : ''}`;
    btn.dataset.teamid = key;
    btn.innerHTML = `
      <span class="team-pill-logo-badge">
        <img src="${team.logoUrl}" alt="${team.shortName}" class="team-pill-logo-img">
      </span>
      <span>${team.shortName}</span>
      <span class="team-pill-rank">${team.apRank}</span>
    `;
    btn.addEventListener('click', () => selectTeam(key));
    track.appendChild(btn);
  });
}

function selectTeam(teamId) {
  if (!TEAMS_DATABASE[teamId]) return;
  state.currentTeamId = teamId;
  const team = TEAMS_DATABASE[teamId];

  // Update Body Theme Class
  document.body.className = team.themeClass || `theme-${teamId}`;

  // Update Navigation & Hero with Official Logos
  document.getElementById('navLogoBadge').innerHTML = `<img src="${team.logoUrl}" alt="${team.name}" class="nav-logo-img">`;
  document.getElementById('heroEmblem').innerHTML = `<img src="${team.logoUrl}" alt="${team.name}" class="hero-logo-img">`;
  document.getElementById('heroTeamName').innerText = team.name;
  document.getElementById('footerEmblem').innerHTML = `<img src="${team.logoUrl}" alt="${team.name}" style="width: 28px; height: 28px; object-fit: contain;">`;

  document.getElementById('heroRank').innerText = `${team.apRank} POLL`;
  document.getElementById('heroCoach').innerText = `HC: ${team.headCoach}`;
  document.getElementById('heroStarPlayer').innerText = `Star: ${team.starPlayer}`;
  document.getElementById('heroStadium').innerText = `${team.stadium} (${team.stadiumCapacity})`;

  // Update Active State in Top Track
  document.querySelectorAll('.team-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.teamid === teamId);
  });

  // Re-render Dynamic Slider Labels
  updateGlobalSliderLabels(team);

  // Recalculate & Re-render
  recalculateSeason();
}

// ==========================================================================
// SIMULATION ENGINE (10,000 MONTE CARLO DRIVES)
// ==========================================================================

function calculateAdjustedMatchup(game) {
  const team = TEAMS_DATABASE[state.currentTeamId];
  
  // Check if Game has Custom Single-Game Overrides
  const hasCustomGame = state.gameSliders[game.id] && state.gameSliders[game.id].isCustom;
  const effectiveSliders = hasCustomGame ? state.gameSliders[game.id] : state.globalSliders;

  // Slider Weights
  const qbImpact = (effectiveSliders.qbRating || 0) * 0.16;
  const groundImpact = (effectiveSliders.groundAttack || 0) * 0.12;
  const defImpact = (effectiveSliders.defenseHavoc || 0) * 0.15;
  const toImpact = (effectiveSliders.turnoverLuck || 0) * 0.14;
  const crowdImpact = (effectiveSliders.crowdNoise || 0) * 0.08 * (game.isHome ? 1 : -0.6);

  const totalPointsShift = qbImpact + groundImpact + defImpact + toImpact + crowdImpact;
  const winProbShift = totalPointsShift * 1.35;

  // Base Calculations
  let adjWinProb = Math.min(99.8, Math.max(0.2, game.baseWinProb + winProbShift));
  let adjUtScore = Math.round(Math.max(3, game.projScoreUt + (qbImpact * 0.7) + (groundImpact * 0.5) + (toImpact * 0.3) + (crowdImpact * 0.3)));
  let adjOppScore = Math.round(Math.max(0, game.projScoreOpp - (defImpact * 0.6) - (toImpact * 0.4) - (crowdImpact * 0.3)));

  // If user has a manual pick toggle
  const userPick = state.userPicks[game.id];
  let isWin = userPick ? (userPick === 'W') : (adjWinProb >= 50.0);

  if (userPick === 'W' && adjUtScore <= adjOppScore) adjUtScore = adjOppScore + 3;
  if (userPick === 'L' && adjUtScore >= adjOppScore) adjOppScore = adjUtScore + 3;

  return {
    adjWinProb: Math.round(adjWinProb * 10) / 10,
    projUt: adjUtScore,
    projOpp: adjOppScore,
    isWin,
    isCustomTuned: hasCustomGame
  };
}

function recalculateSeason() {
  const team = TEAMS_DATABASE[state.currentTeamId];
  if (!team) return;

  let totalWins = 0;
  let totalLosses = 0;
  let confWins = 0;
  let confLosses = 0;
  let sumWinProb = 0;
  let sumUtScore = 0;
  let sumOppScore = 0;

  team.schedule.forEach(game => {
    const sim = calculateAdjustedMatchup(game);
    if (sim.isWin) {
      totalWins++;
      if (game.isSec || game.isBigTen) confWins++;
    } else {
      totalLosses++;
      if (game.isSec || game.isBigTen) confLosses++;
    }
    sumWinProb += sim.adjWinProb;
    sumUtScore += sim.projUt;
    sumOppScore += sim.projOpp;
  });

  const avgWinProb = (sumWinProb / team.schedule.length).toFixed(1);
  const avgMargin = ((sumUtScore - sumOppScore) / team.schedule.length).toFixed(1);
  const avgMarginSign = avgMargin >= 0 ? `+${avgMargin}` : avgMargin;

  // Update KPIs
  document.getElementById('kpiRecord').innerText = `${totalWins} - ${totalLosses}`;
  document.getElementById('kpiConfRecord').innerText = `${confWins}-${confLosses} Conf`;
  document.getElementById('kpiWinProb').innerText = `${avgWinProb}%`;
  document.getElementById('kpiMargin').innerText = avgMarginSign;

  // Project CFP Seed
  let cfpSeed = '#5 SEED';
  let cfpStatus = 'First Round Host';
  let nattyOdds = '+750';

  if (totalWins >= 12) {
    cfpSeed = '#1 SEED';
    cfpStatus = '1st Round Bye (Quarterfinals)';
    nattyOdds = '+350';
  } else if (totalWins === 11) {
    cfpSeed = '#5 SEED';
    cfpStatus = 'First Round Host Game';
    nattyOdds = '+650';
  } else if (totalWins === 10) {
    cfpSeed = '#8 SEED';
    cfpStatus = 'First Round Host Game';
    nattyOdds = '+1200';
  } else if (totalWins === 9) {
    cfpSeed = '#11 SEED';
    cfpStatus = 'First Round Road Game';
    nattyOdds = '+2500';
  } else {
    cfpSeed = 'BUBBLE / OUT';
    cfpStatus = 'Missed 12-Team CFP';
    nattyOdds = '+8000';
  }

  document.getElementById('kpiCfpSeed').innerText = cfpSeed;
  document.getElementById('kpiCfpStatus').innerText = cfpStatus;
  document.getElementById('kpiNattyOdds').innerText = nattyOdds;

  // Render Schedule Grid & CFP Bracket
  renderSchedule();
  renderPlayoffBracket(totalWins, cfpSeed);
}

// ==========================================================================
// SCHEDULE GRID RENDERING
// ==========================================================================

function renderSchedule() {
  const grid = document.getElementById('scheduleGrid');
  if (!grid) return;
  const team = TEAMS_DATABASE[state.currentTeamId];
  if (!team) return;

  grid.innerHTML = '';

  const filteredGames = team.schedule.filter(game => {
    if (state.filter === 'marquee') return game.isMarquee;
    if (state.filter === 'conf') return (game.isSec || game.isBigTen);
    if (state.filter === 'home') return game.isHome;
    if (state.filter === 'away') return !game.isHome;
    return true;
  });

  filteredGames.forEach(game => {
    const sim = calculateAdjustedMatchup(game);
    const card = document.createElement('div');
    card.className = `game-card ${game.isMarquee ? 'marquee-border' : ''}`;

    const userPick = state.userPicks[game.id];
    const isWin = sim.isWin;

    card.innerHTML = `
      <div class="card-top">
        <span>${game.week} • ${game.date}</span>
        ${sim.isCustomTuned ? `<span class="custom-tuned-badge"><i class="fa-solid fa-bullseye"></i> CUSTOM TUNED</span>` : `<span>${game.isHome ? 'HOME' : 'AWAY'}</span>`}
      </div>

      <div class="matchup-row">
        <div class="team-pill">
          <div class="team-logo-circle" style="border: 2px solid ${team.colors.primary}; padding: 3px;">
            <img src="${team.logoUrl}" alt="${team.abbr}" class="card-team-logo">
          </div>
          <div class="team-text">
            <span class="team-abbr">${team.abbr}</span>
            <span class="team-ranking-sub">${team.apRank}</span>
          </div>
        </div>

        <div class="score-center">
          <div class="proj-score-box">
            <span style="color: ${isWin ? 'var(--color-success)' : 'var(--color-text-dim)'};">${sim.projUt}</span>
            <span class="score-divider">-</span>
            <span style="color: ${!isWin ? 'var(--color-danger)' : 'var(--color-text-dim)'};">${sim.projOpp}</span>
          </div>
          <span class="vegas-line">${game.vegasSpread < 0 ? `${team.abbr} ${game.vegasSpread}` : `${game.oppAbbr} -${game.vegasSpread}`}</span>
        </div>

        <div class="team-pill" style="justify-content: flex-end; text-align: right;">
          <div class="team-text">
            <span class="team-abbr">${game.oppAbbr}</span>
            <span class="team-ranking-sub">${game.oppRank}</span>
          </div>
          <div class="team-logo-circle" style="border: 2px solid ${game.oppColor}; padding: 3px;">
            <img src="${game.oppLogoUrl || ESPN_LOGOS[game.oppAbbr]}" alt="${game.oppAbbr}" class="card-team-logo">
          </div>
        </div>
      </div>

      <div class="card-stats-row">
        <div class="prob-labels-sm">
          <span>WIN PROBABILITY</span>
          <span style="color: ${isWin ? 'var(--color-success)' : 'var(--color-danger)'};">${sim.adjWinProb}%</span>
        </div>
        <div class="prob-track-sm">
          <div class="prob-fill-sm" style="width: ${sim.adjWinProb}%; background: ${isWin ? 'var(--color-brand-primary)' : 'var(--color-danger)'};"></div>
        </div>
      </div>

      <div class="card-actions">
        <div class="wl-toggle-wrap">
          <span>PICK:</span>
          <button class="wl-toggle-btn ${userPick === 'W' ? 'win' : ''}" data-pick="W" data-gameid="${game.id}">W</button>
          <button class="wl-toggle-btn ${userPick === 'L' ? 'loss' : ''}" data-pick="L" data-gameid="${game.id}">L</button>
        </div>
        <button class="sim-btn-sm" data-simid="${game.id}">
          <i class="fa-solid fa-play"></i>
          <span>Simulate</span>
        </button>
      </div>
    `;

    // Attach Listeners
    card.querySelectorAll('.wl-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pickType = btn.dataset.pick;
        const gId = btn.dataset.gameid;
        state.userPicks[gId] = (state.userPicks[gId] === pickType) ? null : pickType;
        recalculateSeason();
      });
    });

    card.querySelector('.sim-btn-sm').addEventListener('click', (e) => {
      e.stopPropagation();
      openSimModal(game);
    });

    grid.appendChild(card);
  });
}

// ==========================================================================
// GLOBAL SLIDERS & PRESETS
// ==========================================================================

function updateGlobalSliderLabels(team) {
  const labels = team.sliderLabels || {
    qb: 'QB Execution',
    ground: 'Ground Attack',
    defense: 'Defense & Havoc',
    turnover: 'Turnover Margin Luck',
    crowd: 'Home Stadium Roar'
  };

  const container = document.getElementById('globalSlidersGrid');
  if (!container) return;

  const sliderKeys = [
    { key: 'qbRating', label: labels.qb, icon: 'fa-solid fa-crosshairs' },
    { key: 'groundAttack', label: labels.ground, icon: 'fa-solid fa-person-running' },
    { key: 'defenseHavoc', label: labels.defense, icon: 'fa-solid fa-shield-halved' },
    { key: 'turnoverLuck', label: labels.turnover, icon: 'fa-solid fa-dice' },
    { key: 'crowdNoise', label: labels.crowd, icon: 'fa-solid fa-bullhorn' }
  ];

  container.innerHTML = '';
  sliderKeys.forEach(s => {
    const card = document.createElement('div');
    card.className = 'slider-card';
    card.innerHTML = `
      <div class="slider-top-row">
        <span class="slider-title"><i class="${s.icon}"></i> ${s.label}</span>
        <span class="slider-val-readout" id="readout-${s.key}">0%</span>
      </div>
      <input type="range" class="custom-range-slider" id="slider-${s.key}" min="-50" max="50" value="${state.globalSliders[s.key] || 0}" step="5">
      <div class="slider-hints-row">
        <span>-50% Slump</span>
        <span>Baseline</span>
        <span>+50% Elite</span>
      </div>
    `;

    const range = card.querySelector('input');
    range.addEventListener('input', (e) => {
      state.globalSliders[s.key] = parseInt(e.target.value, 10);
      const sign = state.globalSliders[s.key] > 0 ? '+' : '';
      card.querySelector('.slider-val-readout').innerText = `${sign}${state.globalSliders[s.key]}%`;
      
      // Remove active from presets
      document.querySelectorAll('#globalPresetsContainer .preset-btn').forEach(b => b.classList.remove('active'));
      recalculateSeason();
    });

    container.appendChild(card);
  });
}

function initGlobalSliders() {
  const team = TEAMS_DATABASE[state.currentTeamId];
  updateGlobalSliderLabels(team);
}

function initGlobalPresetButtons() {
  document.querySelectorAll('#globalPresetsContainer .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#globalPresetsContainer .preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const presetKey = btn.dataset.preset;
      const presetValues = GLOBAL_PRESETS[presetKey] || GLOBAL_PRESETS['baseline'];

      Object.keys(presetValues).forEach(k => {
        state.globalSliders[k] = presetValues[k];
        const range = document.getElementById(`slider-${k}`);
        const readout = document.getElementById(`readout-${k}`);
        if (range) range.value = presetValues[k];
        if (readout) {
          const sign = presetValues[k] > 0 ? '+' : '';
          readout.innerText = `${sign}${presetValues[k]}%`;
        }
      });

      recalculateSeason();
    });
  });
}

function initFilterButtons() {
  document.querySelectorAll('#scheduleFilterPills .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#scheduleFilterPills .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderSchedule();
    });
  });
}

// ==========================================================================
// SIMULATION MODAL & SINGLE-GAME CUSTOM SCENARIO TUNING
// ==========================================================================

function openSimModal(game) {
  state.activeModalGame = game;
  const team = TEAMS_DATABASE[state.currentTeamId];
  const sim = calculateAdjustedMatchup(game);

  document.getElementById('modalWeekTag').innerText = `${game.week} • ${game.isMarquee ? 'MARQUEE BATTLE' : (game.isHome ? 'HOME SHOWDOWN' : 'AWAY GAUNTLET')}`;
  document.getElementById('modalMatchupTitle').innerText = `${team.name} vs ${game.opponent}`;
  document.getElementById('modalStadiumLocation').innerText = `${game.stadium} • ${game.location}`;

  // Scoreboard
  document.getElementById('modalScoreboard').innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.75rem;">
      <div class="modal-team-logo-wrap" style="border: 2.5px solid ${team.colors.primary};">
        <img src="${team.logoUrl}" alt="${team.shortName}" class="modal-team-logo">
      </div>
      <div>
        <div style="font-family: var(--font-display); font-size: 1.5rem; color: #FFFFFF;">${team.shortName}</div>
        <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--color-text-dim);">${team.apRank}</div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="font-family: var(--font-display); font-size: 2.2rem; letter-spacing: 1px; color: #FFFFFF;">
        <span style="color: ${sim.isWin ? 'var(--color-success)' : 'var(--color-text-dim)'};">${sim.projUt}</span>
        <span style="color: var(--color-text-dim); font-size: 1.4rem;">-</span>
        <span style="color: ${!sim.isWin ? 'var(--color-danger)' : 'var(--color-text-dim)'};">${sim.projOpp}</span>
      </div>
      <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--color-brand-accent); font-weight: 800;">
        WIN PROB: ${sim.adjWinProb}%
      </span>
    </div>

    <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: flex-end;">
      <div style="text-align: right;">
        <div style="font-family: var(--font-display); font-size: 1.5rem; color: #FFFFFF;">${game.oppAbbr}</div>
        <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--color-text-dim);">${game.oppRank}</div>
      </div>
      <div class="modal-team-logo-wrap" style="border: 2.5px solid ${game.oppColor};">
        <img src="${game.oppLogoUrl || ESPN_LOGOS[game.oppAbbr]}" alt="${game.oppAbbr}" class="modal-team-logo">
      </div>
    </div>
  `;

  // Render Drive Log
  renderDriveLog(game, sim);

  // Render Tactical Scout Intel
  renderScoutReport(game);

  // Initialize Single-Game Sliders inside Modal
  renderGameSlidersInModal(game);

  // Sync Footer Display
  const activeSubTab = document.querySelector('#simModal .sub-tab.active');
  const activeTabName = activeSubTab ? activeSubTab.dataset.subtab : 'drives';
  const modalFooter = document.querySelector('#simModal .modal-footer');
  if (modalFooter) {
    modalFooter.style.display = (activeTabName === 'game-tuning') ? 'none' : 'flex';
  }

  document.getElementById('simModal').classList.add('open');
}

function renderDriveLog(game, sim) {
  const container = document.getElementById('driveLogContainer');
  if (!container) return;
  const team = TEAMS_DATABASE[state.currentTeamId];

  container.innerHTML = '';
  const drives = generateDriveSimulationLog(team, game, sim);

  drives.forEach((d, idx) => {
    const row = document.createElement('div');
    row.style.background = 'rgba(255, 255, 255, 0.04)';
    row.style.border = '1px solid var(--color-border)';
    row.style.borderRadius = 'var(--radius-sm)';
    row.style.padding = '0.5rem 0.8rem';
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.fontSize = '0.78rem';

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem;">
        <span style="font-family: var(--font-mono); font-weight: 800; color: var(--color-brand-accent);">Q${d.quarter} ${d.time}</span>
        <span style="font-weight: 700; color: ${d.isTeam ? team.colors.accent : game.oppSecondary};">${d.possTeam}</span>
        <span>${d.event}</span>
      </div>
      <span style="font-family: var(--font-mono); font-weight: 800; color: ${d.points > 0 ? 'var(--color-success)' : 'var(--color-text-dim)'};">${d.scoreLine}</span>
    `;
    container.appendChild(row);
  });
}

function generateDriveSimulationLog(team, game, sim) {
  const events = [];
  let curUt = 0;
  let curOpp = 0;
  const quarters = [1, 2, 3, 4];

  quarters.forEach(q => {
    // Drive 1: Team
    const utEventRoll = Math.random();
    if (utEventRoll < 0.35 && curUt < sim.projUt) {
      curUt += 7;
      events.push({ quarter: q, time: '10:42', possTeam: team.abbr, isTeam: true, event: `Touchdown! ${team.starPlayer} explosive scoring drive`, points: 7, scoreLine: `${team.abbr} ${curUt} - ${game.oppAbbr} ${curOpp}` });
    } else if (utEventRoll < 0.60 && curUt < sim.projUt) {
      curUt += 3;
      events.push({ quarter: q, time: '07:15', possTeam: team.abbr, isTeam: true, event: 'Field Goal through uprights', points: 3, scoreLine: `${team.abbr} ${curUt} - ${game.oppAbbr} ${curOpp}` });
    } else {
      events.push({ quarter: q, time: '05:30', possTeam: team.abbr, isTeam: true, event: 'Punt pinned inside the 20', points: 0, scoreLine: `${team.abbr} ${curUt} - ${game.oppAbbr} ${curOpp}` });
    }

    // Drive 2: Opponent
    const oppEventRoll = Math.random();
    if (oppEventRoll < 0.30 && curOpp < sim.projOpp) {
      curOpp += 7;
      events.push({ quarter: q, time: '03:10', possTeam: game.oppAbbr, isTeam: false, event: `Touchdown! ${game.oppAbbr} red zone pass`, points: 7, scoreLine: `${team.abbr} ${curUt} - ${game.oppAbbr} ${curOpp}` });
    } else if (oppEventRoll < 0.55 && curOpp < sim.projOpp) {
      curOpp += 3;
      events.push({ quarter: q, time: '01:05', possTeam: game.oppAbbr, isTeam: false, event: `${game.oppAbbr} 44yd Field Goal`, points: 3, scoreLine: `${team.abbr} ${curUt} - ${game.oppAbbr} ${curOpp}` });
    } else {
      events.push({ quarter: q, time: '00:15', possTeam: game.oppAbbr, isTeam: false, event: `${team.name} defense forces 3-and-out punt`, points: 0, scoreLine: `${team.abbr} ${curUt} - ${game.oppAbbr} ${curOpp}` });
    }
  });

  return events;
}

function renderScoutReport(game) {
  const box = document.getElementById('scoutReportBox');
  if (!box) return;
  const scout = game.scoutReport || {
    xFactor: 'Line of scrimmage execution and turnover margin.',
    keyMatchup: 'Quarterback poise under pressure.',
    summary: 'Crucial regular season matchup.'
  };

  box.innerHTML = `
    <div>
      <span style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 800; color: var(--color-brand-accent);">⚡ X-FACTOR:</span>
      <p style="font-size: 0.84rem; color: var(--color-text-main); margin-top: 0.15rem;">${scout.xFactor}</p>
    </div>
    <div>
      <span style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 800; color: var(--color-gold);">🎯 KEY MATCHUP:</span>
      <p style="font-size: 0.84rem; color: var(--color-text-main); margin-top: 0.15rem;">${scout.keyMatchup}</p>
    </div>
    <div>
      <span style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 800; color: var(--color-cyan);">📋 TACTICAL SUMMARY:</span>
      <p style="font-size: 0.84rem; color: var(--color-text-main); margin-top: 0.15rem;">${scout.summary}</p>
    </div>
  `;
}

function renderGameSlidersInModal(game) {
  const container = document.getElementById('modalGameSlidersGrid');
  if (!container) return;
  const team = TEAMS_DATABASE[state.currentTeamId];

  const currentSliders = state.gameSliders[game.id] || {
    qbRating: state.globalSliders.qbRating,
    groundAttack: state.globalSliders.groundAttack,
    defenseHavoc: state.globalSliders.defenseHavoc,
    turnoverLuck: state.globalSliders.turnoverLuck,
    crowdNoise: state.globalSliders.crowdNoise,
    isCustom: false
  };

  const labels = team.sliderLabels || {
    qb: 'QB Execution',
    ground: 'Ground Attack',
    defense: 'Defense & Havoc',
    turnover: 'Turnover Margin Luck',
    crowd: 'Stadium Crowd Noise'
  };

  const sliderList = [
    { key: 'qbRating', label: labels.qb, icon: 'fa-solid fa-crosshairs' },
    { key: 'groundAttack', label: labels.ground, icon: 'fa-solid fa-person-running' },
    { key: 'defenseHavoc', label: labels.defense, icon: 'fa-solid fa-shield-halved' },
    { key: 'turnoverLuck', label: labels.turnover, icon: 'fa-solid fa-dice' },
    { key: 'crowdNoise', label: labels.crowd, icon: 'fa-solid fa-bullhorn' }
  ];

  container.innerHTML = '';

  sliderList.forEach(s => {
    const card = document.createElement('div');
    card.className = 'game-slider-card';
    const val = currentSliders[s.key] || 0;
    const sign = val > 0 ? '+' : '';

    card.innerHTML = `
      <div class="slider-top-row">
        <span class="slider-title" style="font-size: 0.78rem;"><i class="${s.icon}"></i> ${s.label}</span>
        <span class="slider-val-readout" id="gameslider-readout-${s.key}">${sign}${val}%</span>
      </div>
      <input type="range" class="custom-range-slider" id="gameslider-${s.key}" min="-50" max="50" value="${val}" step="5">
      <div class="slider-hints-row">
        <span>-50%</span>
        <span>Baseline</span>
        <span>+50%</span>
      </div>
    `;

    const range = card.querySelector('input');
    range.addEventListener('input', (e) => {
      const newVal = parseInt(e.target.value, 10);
      const signStr = newVal > 0 ? '+' : '';
      card.querySelector('.slider-val-readout').innerText = `${signStr}${newVal}%`;
      
      if (!state.gameSliders[game.id]) {
        state.gameSliders[game.id] = { ...currentSliders };
      }
      state.gameSliders[game.id][s.key] = newVal;
      state.gameSliders[game.id].isCustom = true;

      // Unset active preset
      document.querySelectorAll('.game-preset-btn').forEach(b => b.classList.remove('active'));
    });

    container.appendChild(card);
  });
}

function initModalSubTabs() {
  document.querySelectorAll('#simModal .sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#simModal .sub-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#simModal .tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = tab.dataset.subtab;
      const pane = document.getElementById(`pane-${targetPane}`);
      if (pane) pane.classList.add('active');

      const modalFooter = document.querySelector('#simModal .modal-footer');
      if (modalFooter) {
        modalFooter.style.display = (targetPane === 'game-tuning') ? 'none' : 'flex';
      }
    });
  });
}

function initModalActions() {
  document.getElementById('closeSimModalBtn').addEventListener('click', () => {
    document.getElementById('simModal').classList.remove('open');
  });

  // Apply & Re-simulate Game Button
  document.getElementById('applyAndSimGameBtn').addEventListener('click', () => {
    if (!state.activeModalGame) return;
    const game = state.activeModalGame;
    
    // Recalculate whole season & update modal scoreboard
    recalculateSeason();
    openSimModal(game);
  });

  // Reset Game Tuning Button
  document.getElementById('resetGameTuningBtn').addEventListener('click', () => {
    if (!state.activeModalGame) return;
    delete state.gameSliders[state.activeModalGame.id];
    recalculateSeason();
    openSimModal(state.activeModalGame);
  });

  // Game Presets Listeners
  document.querySelectorAll('.game-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.game-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const presetKey = btn.dataset.gamepreset;
      const presetValues = GAME_PRESETS[presetKey] || GAME_PRESETS['baseline'];
      const game = state.activeModalGame;
      if (!game) return;

      state.gameSliders[game.id] = {
        ...presetValues,
        isCustom: (presetKey !== 'baseline')
      };

      renderGameSlidersInModal(game);
    });
  });

  // Quick Re-Simulate All Button
  const quickSimBtn = document.getElementById('quickSimAllBtn');
  if (quickSimBtn) {
    quickSimBtn.addEventListener('click', () => {
      recalculateSeason();
    });
  }
}

// ==========================================================================
// 12-TEAM CFP BRACKET GENERATOR (DYNAMIC FIRST-ROUND WINS & LOSSES)
// ==========================================================================

function renderPlayoffBracket(totalWins, cfpSeed) {
  const container = document.getElementById('playoffBracketGrid');
  if (!container) return;
  const team = TEAMS_DATABASE[state.currentTeamId];
  const teamId = state.currentTeamId;

  let summaryBannerHtml = '';
  let m1Active = false, m2Active = false, m3Active = false, m4Active = false;
  let qfActive = false, semiActive = false, nattyActive = false;

  if (totalWins >= 12) {
    summaryBannerHtml = `
      <div class="cfp-summary-banner bye">
        <i class="fa-solid fa-trophy" style="font-size: 1.2rem;"></i>
        <div>
          <strong>#1 NATIONAL SEED (FIRST-ROUND BYE)</strong>: Projected 12-0 dominance awards a direct bye to the Quarterfinals (Sugar/Rose Bowl) with path to the National Championship!
        </div>
      </div>
    `;
    qfActive = true; semiActive = true; nattyActive = true;
  } else if (totalWins === 11) {
    summaryBannerHtml = `
      <div class="cfp-summary-banner host">
        <i class="fa-solid fa-shield-halved" style="font-size: 1.2rem;"></i>
        <div>
          <strong>#5 SEED (HOSTS ON-CAMPUS FIRST ROUND)</strong>: Projected First-Round Win at home (38-17) ➔ Quarterfinal Fiesta Bowl Win (34-27) ➔ <strong>CFP SEMIFINALIST</strong>!
        </div>
      </div>
    `;
    m1Active = (teamId === 'texas' || teamId === 'ohiostate' || teamId === 'oregon' || teamId === 'georgia');
    qfActive = true; semiActive = true;
  } else if (totalWins === 10) {
    summaryBannerHtml = `
      <div class="cfp-summary-banner host">
        <i class="fa-solid fa-star" style="font-size: 1.2rem;"></i>
        <div>
          <strong>#6 - #8 AT-LARGE SEED (ON-CAMPUS HOST)</strong>: Projected First-Round Win on home turf (28-20) ➔ <strong>CFP QUARTERFINALIST</strong> (Exits in New Year's Six Bowl vs #1/#2 Seed).
        </div>
      </div>
    `;
    if (teamId === 'alabama') m2Active = true;
    if (teamId === 'notredame') m3Active = true;
    if (teamId === 'tennessee') m4Active = true;
    if (teamId === 'pennstate') m3Active = true;
    qfActive = true;
  } else if (totalWins === 9) {
    summaryBannerHtml = `
      <div class="cfp-summary-banner loss">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem;"></i>
        <div>
          <strong>#11 - #12 BUBBLE SEED (ROAD FIRST-ROUND GAME)</strong>: <strong>PROJECTED FIRST-ROUND EXIT</strong> — Travels to hostile on-campus environment (@ #6 Seed) and suffers a projected 20-28 road loss.
        </div>
      </div>
    `;
    if (teamId === 'michigan') m2Active = true;
    if (teamId === 'lsu') m1Active = true;
    if (teamId === 'pennstate') m3Active = true;
  } else {
    summaryBannerHtml = `
      <div class="cfp-summary-banner out">
        <i class="fa-solid fa-circle-xmark" style="font-size: 1.2rem;"></i>
        <div>
          <strong>MISSED 12-TEAM CFP PLAYOFF (${totalWins}-${12 - totalWins})</strong>: Falls below CFP at-large cutline. Projected destination: Florida Citrus Bowl / ReliaQuest Bowl.
        </div>
      </div>
    `;
  }

  // Bracket Content
  container.innerHTML = `
    <div style="grid-column: 1 / -1;">
      ${summaryBannerHtml}
    </div>

    <!-- FIRST ROUND -->
    <div class="playoff-round-card">
      <div class="round-header">
        <span>FIRST ROUND (ON-CAMPUS)</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">DEC 18-19</span>
      </div>

      <!-- M1: #12 G5 @ #5 Texas -->
      <div class="playoff-matchup-box ${teamId === 'texas' || (teamId === 'lsu' && totalWins === 9) ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['BSU'] || ''}" class="matchup-team-logo" alt="Boise State"></span>
            <span>#12 Boise State</span>
          </div>
          <span style="color: var(--color-text-dim);">17</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['TEX'] || ''}" class="matchup-team-logo" alt="Texas"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#5 Texas</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">38</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">DKR Memorial Stadium</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> TEXAS WINS (ADVANCES)</span>
        </div>
      </div>

      <!-- M2: #11 Michigan @ #6 Alabama -->
      <div class="playoff-matchup-box ${(teamId === 'michigan' || teamId === 'alabama') ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['MICH'] || ''}" class="matchup-team-logo" alt="Michigan"></span>
            <span style="${teamId === 'michigan' ? 'color: var(--color-brand-accent); font-weight: 800;' : ''}">#11 Michigan</span>
          </div>
          <span style="color: var(--color-text-dim);">20</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['BAMA'] || ''}" class="matchup-team-logo" alt="Alabama"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#6 Alabama</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">28</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Bryant-Denny Stadium</span>
          ${teamId === 'michigan' && totalWins === 9 
            ? `<span class="playoff-loss-tag"><i class="fa-solid fa-xmark"></i> MICH 1ST-ROUND EXIT</span>`
            : `<span class="playoff-win-tag"><i class="fa-solid fa-check"></i> BAMA WINS (ADVANCES)</span>`}
        </div>
      </div>

      <!-- M3: #10 Penn State @ #7 Notre Dame -->
      <div class="playoff-matchup-box ${(teamId === 'pennstate' || teamId === 'notredame') ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['PSU'] || ''}" class="matchup-team-logo" alt="Penn State"></span>
            <span style="${teamId === 'pennstate' ? 'color: var(--color-brand-accent); font-weight: 800;' : ''}">#10 Penn State</span>
          </div>
          <span style="color: var(--color-text-dim);">21</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['ND'] || ''}" class="matchup-team-logo" alt="Notre Dame"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#7 Notre Dame</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">24</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Notre Dame Stadium</span>
          ${teamId === 'pennstate' 
            ? `<span class="playoff-loss-tag"><i class="fa-solid fa-xmark"></i> PSU 1ST-ROUND EXIT</span>`
            : `<span class="playoff-win-tag"><i class="fa-solid fa-check"></i> IRISH WIN (ADVANCES)</span>`}
        </div>
      </div>

      <!-- M4: #9 Ole Miss @ #8 Tennessee -->
      <div class="playoff-matchup-box ${teamId === 'tennessee' ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['MISS'] || ''}" class="matchup-team-logo" alt="Ole Miss"></span>
            <span>#9 Ole Miss</span>
          </div>
          <span style="color: var(--color-text-dim);">28</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['TENN'] || ''}" class="matchup-team-logo" alt="Tennessee"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#8 Tennessee</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">31</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Neyland Stadium</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> VOLS WIN (ADVANCES)</span>
        </div>
      </div>
    </div>

    <!-- QUARTERFINALS -->
    <div class="playoff-round-card">
      <div class="round-header">
        <span>QUARTERFINALS (NY6 BOWLS)</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">DEC 31 - JAN 1</span>
      </div>

      <!-- QF1: Sugar Bowl -->
      <div class="playoff-matchup-box ${teamId === 'georgia' || teamId === 'tennessee' ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['TENN'] || ''}" class="matchup-team-logo" alt="Tennessee"></span>
            <span>#8 Tennessee</span>
          </div>
          <span style="color: var(--color-text-dim);">24</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['UGA'] || ''}" class="matchup-team-logo" alt="Georgia"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#1 Georgia (BYE)</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">31</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Allstate Sugar Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> UGA ADVANCES</span>
        </div>
      </div>

      <!-- QF2: Rose Bowl -->
      <div class="playoff-matchup-box ${teamId === 'ohiostate' || teamId === 'notredame' ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['ND'] || ''}" class="matchup-team-logo" alt="Notre Dame"></span>
            <span>#7 Notre Dame</span>
          </div>
          <span style="color: var(--color-text-dim);">23</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['OSU'] || ''}" class="matchup-team-logo" alt="Ohio State"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#2 Ohio State (BYE)</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">30</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Rose Bowl Game</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> OSU ADVANCES</span>
        </div>
      </div>

      <!-- QF3: Peach Bowl -->
      <div class="playoff-matchup-box ${teamId === 'oregon' || teamId === 'alabama' ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['BAMA'] || ''}" class="matchup-team-logo" alt="Alabama"></span>
            <span>#6 Alabama</span>
          </div>
          <span style="color: var(--color-text-dim);">24</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['ORE'] || ''}" class="matchup-team-logo" alt="Oregon"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#3 Oregon (BYE)</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">27</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Chick-fil-A Peach Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> OREGON ADVANCES</span>
        </div>
      </div>

      <!-- QF4: Fiesta Bowl -->
      <div class="playoff-matchup-box ${teamId === 'texas' ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['MIA'] || ''}" class="matchup-team-logo" alt="Miami"></span>
            <span>#4 Miami (ACC Champ)</span>
          </div>
          <span style="color: var(--color-text-dim);">27</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['TEX'] || ''}" class="matchup-team-logo" alt="Texas"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#5 Texas</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">34</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Vrbo Fiesta Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> TEXAS ADVANCES</span>
        </div>
      </div>
    </div>

    <!-- SEMIFINALS -->
    <div class="playoff-round-card">
      <div class="round-header">
        <span>CFP SEMIFINALS</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">JAN 8-9</span>
      </div>

      <!-- Semi 1: Orange Bowl -->
      <div class="playoff-matchup-box ${teamId === 'texas' || teamId === 'georgia' ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['UGA'] || ''}" class="matchup-team-logo" alt="Georgia"></span>
            <span>#1 Georgia</span>
          </div>
          <span style="color: var(--color-text-dim);">27</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['TEX'] || ''}" class="matchup-team-logo" alt="Texas"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#5 Texas</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">28</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Capital One Orange Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-fire"></i> TEXAS REACHES TITLE</span>
        </div>
      </div>

      <!-- Semi 2: Cotton Bowl -->
      <div class="playoff-matchup-box ${teamId === 'ohiostate' || teamId === 'oregon' ? 'active-team-matchup' : ''}">
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['ORE'] || ''}" class="matchup-team-logo" alt="Oregon"></span>
            <span>#3 Oregon</span>
          </div>
          <span style="color: var(--color-text-dim);">28</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['OSU'] || ''}" class="matchup-team-logo" alt="Ohio State"></span>
            <span style="color: #FFFFFF; font-weight: 800;">#2 Ohio State</span>
          </div>
          <span style="color: var(--color-success); font-weight: 800;">31</span>
        </div>
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Goodyear Cotton Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-fire"></i> OSU REACHES TITLE</span>
        </div>
      </div>
    </div>

    <!-- NATIONAL CHAMPIONSHIP -->
    <div class="playoff-round-card">
      <div class="round-header">
        <span>NATIONAL CHAMPIONSHIP</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">JAN 18 • ATLANTA</span>
      </div>

      <div class="playoff-matchup-box" style="border-color: var(--color-brand-border); background: linear-gradient(135deg, rgba(255,255,255,0.06), var(--color-brand-glow));">
        <div class="matchup-teams-row" style="margin-bottom: 0.25rem;">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['OSU'] || ''}" class="matchup-team-logo" alt="Ohio State"></span>
            <span>#2 Ohio State</span>
          </div>
          <span style="color: var(--color-text-dim); font-size: 1.1rem;">28</span>
        </div>
        <div class="matchup-teams-row">
          <div class="matchup-team-item">
            <span class="matchup-team-logo-wrap"><img src="${ESPN_LOGOS['TEX'] || ''}" class="matchup-team-logo" alt="Texas"></span>
            <span style="color: #FFFFFF; font-weight: 900; font-size: 1rem;">#5 Texas Longhorns</span>
          </div>
          <span style="color: var(--color-success); font-size: 1.1rem; font-weight: 900;">31</span>
        </div>
        <div class="playoff-result-badge" style="margin-top: 0.4rem; padding-top: 0.4rem;">
          <span style="color: #FBBF24; font-weight: 800;"><i class="fa-solid fa-crown"></i> NATIONAL CHAMPION</span>
          <span style="font-weight: 800; color: #FFFFFF;">TEXAS 31, OSU 28</span>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// GROUP CHAT HYPE CARD CANVAS EXPORT
// ==========================================================================

function initHypeCardExport() {
  const openBtn = document.getElementById('openHypeCardBtn');
  const modalExportBtn = document.getElementById('modalExportCardBtn');
  const closeBtn = document.getElementById('closeHypeCardBtn');
  const downloadBtn = document.getElementById('downloadHypeCardBtn');
  const copyBtn = document.getElementById('copyHypeCardBtn');

  if (openBtn) openBtn.addEventListener('click', generateHypeCard);
  if (modalExportBtn) modalExportBtn.addEventListener('click', () => {
    document.getElementById('simModal').classList.remove('open');
    generateHypeCard();
  });
  if (closeBtn) closeBtn.addEventListener('click', () => {
    document.getElementById('hypeCardModal').classList.remove('open');
  });

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const canvas = document.getElementById('hypeCanvas');
      const link = document.createElement('a');
      link.download = `gridiron-oracle-${state.currentTeamId}-prediction.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const canvas = document.getElementById('hypeCanvas');
      canvas.toBlob(blob => {
        if (navigator.clipboard && navigator.clipboard.write) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(() => alert('Hype Card copied to clipboard! Paste it into your group chat.'))
            .catch(() => alert('Download image using the Save button.'));
        }
      });
    });
  }
}

function generateHypeCard() {
  const canvas = document.getElementById('hypeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const team = TEAMS_DATABASE[state.currentTeamId];

  // Draw Background
  ctx.fillStyle = team.colors.bgBase || '#07090E';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Gradient Overlay
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, team.colors.primary);
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1.0;

  // Border & Glow
  ctx.strokeStyle = team.colors.accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  // Header Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px Bebas Neue, Outfit, sans-serif';
  ctx.fillText(`GRIDIRON ORACLE • ${team.name.toUpperCase()}`, 30, 55);

  ctx.fillStyle = team.colors.accent;
  ctx.font = 'bold 16px JetBrains Mono, monospace';
  ctx.fillText(`OFFICIAL 2026 AI SEASON PROJECTION • 10,000 MONTE CARLO DRIVES`, 30, 85);

  // Big Record & Seed Box
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(30, 110, 350, 140);
  ctx.strokeRect(30, 110, 350, 140);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 64px Bebas Neue, sans-serif';
  ctx.fillText(document.getElementById('kpiRecord').innerText, 50, 180);

  ctx.fillStyle = team.colors.accent;
  ctx.font = 'bold 20px JetBrains Mono, monospace';
  ctx.fillText(`${document.getElementById('kpiCfpSeed').innerText} • CFP CONTENDER`, 50, 225);

  // Key Matchups Column
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px Bebas Neue, sans-serif';
  ctx.fillText('MARQUEE BATTLES & SPREADS:', 410, 135);

  let yOffset = 165;
  team.schedule.filter(g => g.isMarquee).slice(0, 3).forEach(g => {
    const sim = calculateAdjustedMatchup(g);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '15px Outfit, sans-serif';
    ctx.fillText(`${g.week}: vs ${g.oppAbbr} (${g.oppRank})`, 410, yOffset);

    ctx.fillStyle = sim.isWin ? '#10B981' : '#EF4444';
    ctx.font = 'bold 15px JetBrains Mono, monospace';
    ctx.fillText(`${sim.projUt}-${sim.projOpp} (${sim.adjWinProb}% Win)`, 630, yOffset);

    yOffset += 35;
  });

  // Footer Tagline
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '13px JetBrains Mono, monospace';
  ctx.fillText('Powered by Gridiron Oracle • https://jajo9147.github.io/cfb-football-predictor/', 30, 420);

  document.getElementById('hypeCardModal').classList.add('open');
}

// ==========================================================================
// 1-TAP PWA INSTALLATION PROMPT HANDLER
// ==========================================================================

function initPwaInstall() {
  const openPwaBtn = document.getElementById('openPwaInstallBtn');
  const closePwaBtn = document.getElementById('closePwaDrawerBtn');
  const nativeBtn = document.getElementById('pwaNativePromptBtn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    if (openPwaBtn) openPwaBtn.style.display = 'inline-flex';
  });

  if (openPwaBtn) {
    openPwaBtn.addEventListener('click', () => {
      document.getElementById('pwaInstallDrawer').classList.add('open');
    });
  }

  if (closePwaBtn) {
    closePwaBtn.addEventListener('click', () => {
      document.getElementById('pwaInstallDrawer').classList.remove('open');
    });
  }

  if (nativeBtn) {
    nativeBtn.addEventListener('click', () => {
      if (state.deferredPrompt) {
        state.deferredPrompt.prompt();
        state.deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted PWA installation');
          }
          state.deferredPrompt = null;
          document.getElementById('pwaInstallDrawer').classList.remove('open');
        });
      } else {
        alert('To install on iPhone:\n1. Tap the Share button in Safari\n2. Select "Add to Home Screen"');
      }
    });
  }
}

// ==========================================================================
// COUNTDOWN TICKER
// ==========================================================================

function startCountdownTicker() {
  function updateCountdown() {
    const kickoff = new Date('September 5, 2026 12:00:00 CDT').getTime();
    const now = new Date().getTime();
    const diff = kickoff - now;

    if (diff <= 0) {
      document.getElementById('countdownText').innerText = '🔥 SEASON IS LIVE!';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    document.getElementById('countdownText').innerText = `KICKOFF: ${days}D ${hours}H`;
  }

  updateCountdown();
  setInterval(updateCountdown, 60000);
}
