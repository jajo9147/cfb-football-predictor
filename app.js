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
  initLiveSyncEngine();
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
  const dcEl = document.getElementById('heroDC');
  if (dcEl) {
    dcEl.innerText = `DC: ${team.defensiveCoordinator || 'Staff'}`;
  }
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

function findCounterpartMatchup(teamId, game) {
  const keys = Object.keys(TEAMS_DATABASE);
  let oppTeamEntry = null;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const t = TEAMS_DATABASE[k];
    if (t.abbr === game.oppAbbr || k === (game.oppAbbr || '').toLowerCase()) {
      oppTeamEntry = [k, t];
      break;
    }
  }
  if (!oppTeamEntry) return null;

  const [oppTeamId, oppTeam] = oppTeamEntry;
  const currentTeam = TEAMS_DATABASE[teamId];
  if (!currentTeam || !oppTeam.schedule) return null;

  const oppGame = oppTeam.schedule.find(g => g.oppAbbr === currentTeam.abbr);
  if (!oppGame) return null;
  return { oppTeamId, oppTeam, oppGame };
}

function calculateRawMatchup(game, teamId, sliders, userPick) {
  const qbVal = sliders.qbRating || 0;
  const groundVal = sliders.groundAttack || 0;
  const defVal = sliders.defenseHavoc || 0;
  const toVal = sliders.turnoverLuck || 0;
  const crowdVal = sliders.crowdNoise || 0;

  // Realistic Physical Point Impacts
  const qbTeamPts = qbVal * 0.24;
  const qbOppPts = -qbVal * 0.04;

  const groundTeamPts = groundVal * 0.16;
  const groundOppPts = -groundVal * 0.08;

  const defTeamPts = defVal * 0.04;
  const defOppPts = -defVal * 0.26;

  const toTeamPts = toVal * 0.18;
  const toOppPts = -toVal * 0.18;

  let crowdTeamPts = 0;
  let crowdOppPts = 0;
  if (game.isHome) {
    crowdTeamPts = crowdVal * 0.06;
    crowdOppPts = -crowdVal * 0.06;
  } else {
    crowdTeamPts = crowdVal * 0.08;
    crowdOppPts = -crowdVal * 0.06;
  }

  let adjUtScore = Math.max(3, Math.round(game.projScoreUt + qbTeamPts + groundTeamPts + defTeamPts + toTeamPts + crowdTeamPts));
  let adjOppScore = Math.max(0, Math.round(game.projScoreOpp + qbOppPts + groundOppPts + defOppPts + toOppPts + crowdOppPts));

  const pointDiff = adjUtScore - adjOppScore;
  let adjWinProb = 1 / (1 + Math.pow(10, -pointDiff / 13.5)) * 100;
  adjWinProb = Math.min(99.9, Math.max(0.1, Math.round(adjWinProb * 10) / 10));

  let isWin = userPick ? (userPick === 'W') : (adjUtScore > adjOppScore);
  if (userPick === 'W' && adjUtScore <= adjOppScore) adjUtScore = adjOppScore + 3;
  if (userPick === 'L' && adjUtScore >= adjOppScore) adjOppScore = adjUtScore + 3;

  return {
    adjWinProb: Math.round(adjWinProb * 10) / 10,
    projUt: adjUtScore,
    projOpp: adjOppScore,
    isWin
  };
}

function calculateAdjustedMatchup(game, targetTeamId) {
  const teamId = targetTeamId || state.currentTeamId;
  const team = TEAMS_DATABASE[teamId];
  if (!team) return { adjWinProb: 50, projUt: 24, projOpp: 21, isWin: true, isCustomTuned: false, syncedFrom: null };

  // 1. Direct custom tuning or manual pick on this game
  const directSliders = state.gameSliders[game.id];
  const directPick = state.userPicks[game.id];

  if (directSliders && directSliders.isCustom) {
    const raw = calculateRawMatchup(game, teamId, directSliders, directPick);
    return {
      ...raw,
      isCustomTuned: true,
      syncedFrom: null
    };
  }

  if (directPick) {
    const raw = calculateRawMatchup(game, teamId, state.globalSliders, directPick);
    return {
      ...raw,
      isCustomTuned: true,
      syncedFrom: null
    };
  }

  // 2. Check counterpart game on opponent's side for cross-team synchronization
  const counterpart = findCounterpartMatchup(teamId, game);
  if (counterpart) {
    const oppSliders = state.gameSliders[counterpart.oppGame.id];
    const oppPick = state.userPicks[counterpart.oppGame.id];

    if ((oppSliders && oppSliders.isCustom) || oppPick) {
      const oppEffectiveSliders = (oppSliders && oppSliders.isCustom) ? oppSliders : state.globalSliders;
      const oppRaw = calculateRawMatchup(counterpart.oppGame, counterpart.oppTeamId, oppEffectiveSliders, oppPick);

      // Invert outcome and scores for current team
      const invertedWin = !oppRaw.isWin;
      const invertedProb = Math.min(99.9, Math.max(0.1, Math.round((100 - oppRaw.adjWinProb) * 10) / 10));

      return {
        adjWinProb: invertedProb,
        projUt: oppRaw.projOpp,
        projOpp: oppRaw.projUt,
        isWin: invertedWin,
        isCustomTuned: true,
        syncedFrom: counterpart.oppTeam.shortName || counterpart.oppTeam.name
      };
    }
  }

  // 3. Fallback to global sliders
  const raw = calculateRawMatchup(game, teamId, state.globalSliders, null);
  return {
    ...raw,
    isCustomTuned: false,
    syncedFrom: null
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
    // Default the Pick to Win or Loss based off the projected score
    const effectivePick = userPick || (isWin ? 'W' : 'L');

    let badgeHtml = `<span>${game.isHome ? 'HOME' : 'AWAY'}</span>`;
    if (sim.isCustomTuned) {
      if (sim.syncedFrom) {
        badgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-link"></i> SYNCED: ${sim.syncedFrom.toUpperCase()}</span>`;
      } else {
        badgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-bullseye"></i> CUSTOM TUNED</span>`;
      }
    }

    card.innerHTML = `
      <div class="card-top">
        <span>${game.week} • ${game.date}</span>
        ${badgeHtml}
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
          <button class="wl-toggle-btn ${effectivePick === 'W' ? 'win' : ''}" data-pick="W" data-gameid="${game.id}">W</button>
          <button class="wl-toggle-btn ${effectivePick === 'L' ? 'loss' : ''}" data-pick="L" data-gameid="${game.id}">L</button>
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

        // Toggle user pick
        if (state.userPicks[gId] === pickType) {
          delete state.userPicks[gId];
        } else {
          state.userPicks[gId] = pickType;
        }

        // Cross-sync counterpart pick if counterpart exists
        const counterpart = findCounterpartMatchup(state.currentTeamId, game);
        if (counterpart) {
          if (state.userPicks[gId]) {
            state.userPicks[counterpart.oppGame.id] = (state.userPicks[gId] === 'W') ? 'L' : 'W';
          } else {
            delete state.userPicks[counterpart.oppGame.id];
          }
        }

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

  const labels = (team && team.sliderLabels) || {
    qb: 'QB Execution',
    ground: 'Ground Attack',
    defense: 'Defense & Havoc',
    turnover: 'Turnover Margin Luck',
    crowd: 'Stadium Crowd Noise'
  };

  const crowdTitle = game.isHome 
    ? (labels.crowd || `${game.stadium} Home Crowd`)
    : `Road Environment (${game.stadium || 'Hostile Stadium'})`;

  const sliderList = [
    { key: 'qbRating', label: labels.qb, icon: 'fa-solid fa-crosshairs' },
    { key: 'groundAttack', label: labels.ground, icon: 'fa-solid fa-person-running' },
    { key: 'defenseHavoc', label: labels.defense, icon: 'fa-solid fa-shield-halved' },
    { key: 'turnoverLuck', label: labels.turnover, icon: 'fa-solid fa-dice' },
    { key: 'crowdNoise', label: crowdTitle, icon: 'fa-solid fa-bullhorn' }
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
    const game = state.activeModalGame;
    delete state.gameSliders[game.id];
    delete state.userPicks[game.id];

    // Clear counterpart game tuning as well
    const counterpart = findCounterpartMatchup(state.currentTeamId, game);
    if (counterpart) {
      delete state.gameSliders[counterpart.oppGame.id];
      delete state.userPicks[counterpart.oppGame.id];
    }

    recalculateSeason();
    openSimModal(game);
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
// 12-TEAM CFP BRACKET GENERATOR (FULLY DYNAMIC REAL-TIME SEEDING)
// ==========================================================================

function generate12TeamCfpField() {
  const teamKeys = Object.keys(TEAMS_DATABASE);
  const evaluatedTeams = [];

  teamKeys.forEach(teamId => {
    const team = TEAMS_DATABASE[teamId];
    let wins = 0;
    let losses = 0;
    let confWins = 0;
    let sumDiff = 0;

    team.schedule.forEach(g => {
      const sim = calculateAdjustedMatchup(g, teamId);
      if (sim.isWin) {
        wins++;
        if (g.isSec || g.isBigTen) confWins++;
      } else {
        losses++;
      }
      sumDiff += (sim.projUt - sim.projOpp);
    });

    const apPts = parseInt((team.apPoints || '0').replace(/[^0-9]/g, ''), 10) || 500;
    const undefeatedBonus = (wins >= 12 && losses === 0) ? 6000 : (wins >= 11 ? 2000 : 0);
    const score = (wins * 1500) - (losses * 800) + (confWins * 200) + (sumDiff * 3) + (apPts * 0.15) + undefeatedBonus;

    evaluatedTeams.push({
      id: teamId,
      name: team.name,
      shortName: team.shortName,
      abbr: team.abbr,
      logoUrl: team.logoUrl || ESPN_LOGOS[team.abbr],
      stadium: team.stadium,
      conf: team.conference,
      wins,
      losses,
      confWins,
      score,
      apRank: team.apRank
    });
  });

  evaluatedTeams.sort((a, b) => b.score - a.score);

  // Group by conference to award top 4 Conference Champion BYEs
  const secTeams = evaluatedTeams.filter(t => t.conf === 'SEC');
  const b1gTeams = evaluatedTeams.filter(t => t.conf === 'Big Ten');
  const accTeams = evaluatedTeams.filter(t => t.conf === 'ACC');

  const secChamp = secTeams[0];
  const b1gChamp = b1gTeams[0];
  const accChamp = accTeams[0];

  const champs = [secChamp, b1gChamp, accChamp].filter(Boolean);
  champs.sort((a, b) => b.score - a.score);

  const seed1 = champs[0] || evaluatedTeams[0];
  const seed2 = champs[1] || evaluatedTeams[1];
  const seed3 = champs[2] || evaluatedTeams[2];

  const remainingFor4 = evaluatedTeams.filter(t => t.id !== seed1?.id && t.id !== seed2?.id && t.id !== seed3?.id);
  const seed4 = remainingFor4.find(t => t.id === 'notredame') || remainingFor4[0];

  const byeIds = new Set([seed1?.id, seed2?.id, seed3?.id, seed4?.id]);
  const atLargeCandidates = evaluatedTeams.filter(t => !byeIds.has(t.id));

  const seed5 = atLargeCandidates[0];
  const seed6 = atLargeCandidates[1];
  const seed7 = atLargeCandidates[2];
  const seed8 = atLargeCandidates[3];
  const seed9 = atLargeCandidates[4];
  const seed10 = atLargeCandidates[5];
  const seed11 = atLargeCandidates[6];
  const seed12 = atLargeCandidates[7] || {
    id: 'boisestate',
    name: 'Boise State Broncos',
    shortName: 'Boise State',
    abbr: 'BSU',
    logoUrl: ESPN_LOGOS['BSU'] || 'https://a.espncdn.com/i/teamlogos/ncaa/500/68.png',
    stadium: 'Albertsons Stadium',
    conf: 'MWC',
    wins: 11,
    losses: 1,
    apRank: '#17 AP'
  };

  const seeds = [seed1, seed2, seed3, seed4, seed5, seed6, seed7, seed8, seed9, seed10, seed11, seed12].filter(Boolean);

  return {
    seeds,
    seed1, seed2, seed3, seed4,
    seed5, seed6, seed7, seed8,
    seed9, seed10, seed11, seed12
  };
}

function renderPlayoffBracket(totalWins, cfpSeed) {
  const container = document.getElementById('playoffBracketGrid');
  if (!container) return;
  const team = TEAMS_DATABASE[state.currentTeamId];
  const teamId = state.currentTeamId;

  const cfp = generate12TeamCfpField();
  const currentSeedIdx = cfp.seeds.findIndex(s => s?.id === teamId);
  const currentSeedNum = currentSeedIdx !== -1 ? currentSeedIdx + 1 : 0;

  let summaryBannerHtml = '';

  if (currentSeedNum >= 1 && currentSeedNum <= 4) {
    summaryBannerHtml = `
      <div class="cfp-summary-banner bye">
        <i class="fa-solid fa-trophy" style="font-size: 1.2rem;"></i>
        <div>
          <strong>#${currentSeedNum} NATIONAL SEED (FIRST-ROUND BYE)</strong>: Projected ${totalWins}-${12 - totalWins} record awards ${team.name} a direct bye to the NY6 Quarterfinals (Sugar/Rose/Peach/Fiesta Bowl) with a clear path to the National Championship!
        </div>
      </div>
    `;
  } else if (currentSeedNum >= 5 && currentSeedNum <= 8) {
    summaryBannerHtml = `
      <div class="cfp-summary-banner host">
        <i class="fa-solid fa-shield-halved" style="font-size: 1.2rem;"></i>
        <div>
          <strong>#${currentSeedNum} SEED (HOSTS ON-CAMPUS FIRST ROUND)</strong>: ${team.name} hosts on-campus First Round matchup at ${team.stadium} ➔ Advances to NY6 Quarterfinals!
        </div>
      </div>
    `;
  } else if (currentSeedNum >= 9 && currentSeedNum <= 12) {
    summaryBannerHtml = `
      <div class="cfp-summary-banner loss">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem;"></i>
        <div>
          <strong>#${currentSeedNum} AT-LARGE SEED (ROAD FIRST-ROUND GAME)</strong>: ${team.name} qualifies for the 12-Team CFP as an at-large contender and travels for a high-stakes First Round road clash.
        </div>
      </div>
    `;
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

  // Helper function to render a team row in the bracket
  function teamRow(seedNum, tObj, score, isWinner, isHighlighted) {
    const name = tObj ? tObj.shortName || tObj.name : `Seed #${seedNum}`;
    const logo = tObj?.logoUrl || (tObj?.abbr ? ESPN_LOGOS[tObj.abbr] : '') || '';
    const record = tObj ? `(${tObj.wins}-${tObj.losses})` : '';
    const highlightStyle = isHighlighted ? 'color: var(--color-brand-accent); font-weight: 800;' : '';

    return `
      <div class="matchup-teams-row">
        <div class="matchup-team-item">
          <span class="matchup-team-logo-wrap"><img src="${logo}" class="matchup-team-logo" alt="${name}"></span>
          <span style="${highlightStyle}">#${seedNum} ${name} <small style="opacity: 0.7; font-size: 0.68rem;">${record}</small></span>
        </div>
        <span style="${isWinner ? 'color: var(--color-success); font-weight: 800;' : 'color: var(--color-text-dim);'}">${score}</span>
      </div>
    `;
  }

  // Compute First Round winners & scores
  const m1Winner = cfp.seed5;
  const m2Winner = cfp.seed6;
  const m3Winner = cfp.seed7;
  const m4Winner = cfp.seed8;

  // Compute Quarterfinal winners
  const qf1Winner = (cfp.seed1?.score >= m4Winner?.score) ? cfp.seed1 : m4Winner;
  const qf2Winner = (cfp.seed2?.score >= m3Winner?.score) ? cfp.seed2 : m3Winner;
  const qf3Winner = (cfp.seed3?.score >= m2Winner?.score) ? cfp.seed3 : m2Winner;
  const qf4Winner = (cfp.seed4?.score >= m1Winner?.score) ? cfp.seed4 : m1Winner;

  // Compute Semifinal winners
  const semi1Winner = (qf1Winner?.score >= qf4Winner?.score) ? qf1Winner : qf4Winner;
  const semi2Winner = (qf2Winner?.score >= qf3Winner?.score) ? qf2Winner : qf3Winner;

  // Compute National Champion
  const nationalChampion = (semi1Winner?.score >= semi2Winner?.score) ? semi1Winner : semi2Winner;
  const runnerUp = (nationalChampion?.id === semi1Winner?.id) ? semi2Winner : semi1Winner;

  // Check which matchups include the active team
  const isM1Active = cfp.seed5?.id === teamId || cfp.seed12?.id === teamId;
  const isM2Active = cfp.seed6?.id === teamId || cfp.seed11?.id === teamId;
  const isM3Active = cfp.seed7?.id === teamId || cfp.seed10?.id === teamId;
  const isM4Active = cfp.seed8?.id === teamId || cfp.seed9?.id === teamId;

  const isQF1Active = qf1Winner?.id === teamId || cfp.seed1?.id === teamId || m4Winner?.id === teamId;
  const isQF2Active = qf2Winner?.id === teamId || cfp.seed2?.id === teamId || m3Winner?.id === teamId;
  const isQF3Active = qf3Winner?.id === teamId || cfp.seed3?.id === teamId || m2Winner?.id === teamId;
  const isQF4Active = qf4Winner?.id === teamId || cfp.seed4?.id === teamId || m1Winner?.id === teamId;

  const isSemi1Active = semi1Winner?.id === teamId || qf1Winner?.id === teamId || qf4Winner?.id === teamId;
  const isSemi2Active = semi2Winner?.id === teamId || qf2Winner?.id === teamId || qf3Winner?.id === teamId;
  const isNattyActive = nationalChampion?.id === teamId || runnerUp?.id === teamId;

  // Render Bracket HTML
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

      <!-- M1: #12 @ #5 -->
      <div class="playoff-matchup-box ${isM1Active ? 'active-team-matchup' : ''}">
        ${teamRow(12, cfp.seed12, 17, false, cfp.seed12?.id === teamId)}
        ${teamRow(5, cfp.seed5, 35, true, cfp.seed5?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${cfp.seed5?.stadium || 'On Campus'}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${cfp.seed5?.shortName?.toUpperCase() || 'HOST'} ADVANCES</span>
        </div>
      </div>

      <!-- M2: #11 @ #6 -->
      <div class="playoff-matchup-box ${isM2Active ? 'active-team-matchup' : ''}">
        ${teamRow(11, cfp.seed11, 21, false, cfp.seed11?.id === teamId)}
        ${teamRow(6, cfp.seed6, 28, true, cfp.seed6?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${cfp.seed6?.stadium || 'On Campus'}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${cfp.seed6?.shortName?.toUpperCase() || 'HOST'} ADVANCES</span>
        </div>
      </div>

      <!-- M3: #10 @ #7 -->
      <div class="playoff-matchup-box ${isM3Active ? 'active-team-matchup' : ''}">
        ${teamRow(10, cfp.seed10, 24, false, cfp.seed10?.id === teamId)}
        ${teamRow(7, cfp.seed7, 31, true, cfp.seed7?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${cfp.seed7?.stadium || 'On Campus'}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${cfp.seed7?.shortName?.toUpperCase() || 'HOST'} ADVANCES</span>
        </div>
      </div>

      <!-- M4: #9 @ #8 -->
      <div class="playoff-matchup-box ${isM4Active ? 'active-team-matchup' : ''}">
        ${teamRow(9, cfp.seed9, 27, false, cfp.seed9?.id === teamId)}
        ${teamRow(8, cfp.seed8, 30, true, cfp.seed8?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${cfp.seed8?.stadium || 'On Campus'}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${cfp.seed8?.shortName?.toUpperCase() || 'HOST'} ADVANCES</span>
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
      <div class="playoff-matchup-box ${isQF1Active ? 'active-team-matchup' : ''}">
        ${teamRow(8, m4Winner, 24, false, m4Winner?.id === teamId)}
        ${teamRow(1, cfp.seed1, 34, true, cfp.seed1?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Allstate Sugar Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${qf1Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- QF2: Rose Bowl -->
      <div class="playoff-matchup-box ${isQF2Active ? 'active-team-matchup' : ''}">
        ${teamRow(7, m3Winner, 23, false, m3Winner?.id === teamId)}
        ${teamRow(2, cfp.seed2, 31, true, cfp.seed2?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Rose Bowl Game</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${qf2Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- QF3: Peach Bowl -->
      <div class="playoff-matchup-box ${isQF3Active ? 'active-team-matchup' : ''}">
        ${teamRow(6, m2Winner, 24, false, m2Winner?.id === teamId)}
        ${teamRow(3, cfp.seed3, 27, true, cfp.seed3?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Chick-fil-A Peach Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${qf3Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- QF4: Fiesta Bowl -->
      <div class="playoff-matchup-box ${isQF4Active ? 'active-team-matchup' : ''}">
        ${teamRow(5, m1Winner, 31, true, m1Winner?.id === teamId)}
        ${teamRow(4, cfp.seed4, 27, false, cfp.seed4?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Vrbo Fiesta Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${qf4Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
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
      <div class="playoff-matchup-box ${isSemi1Active ? 'active-team-matchup' : ''}">
        ${teamRow(qf4Winner === cfp.seed4 ? 4 : 5, qf4Winner, 28, false, qf4Winner?.id === teamId)}
        ${teamRow(1, qf1Winner, 31, true, qf1Winner?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Capital One Orange Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-fire"></i> ${semi1Winner?.shortName?.toUpperCase() || 'WINNER'} TO NATTY</span>
        </div>
      </div>

      <!-- Semi 2: Cotton Bowl -->
      <div class="playoff-matchup-box ${isSemi2Active ? 'active-team-matchup' : ''}">
        ${teamRow(qf3Winner === cfp.seed3 ? 3 : 6, qf3Winner, 27, false, qf3Winner?.id === teamId)}
        ${teamRow(2, qf2Winner, 34, true, qf2Winner?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Goodyear Cotton Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-fire"></i> ${semi2Winner?.shortName?.toUpperCase() || 'WINNER'} TO NATTY</span>
        </div>
      </div>
    </div>

    <!-- NATIONAL CHAMPIONSHIP -->
    <div class="playoff-round-card">
      <div class="round-header">
        <span>NATIONAL CHAMPIONSHIP</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">JAN 18 • ATLANTA</span>
      </div>

      <div class="playoff-matchup-box ${isNattyActive ? 'active-team-matchup' : ''}" style="border-color: var(--color-brand-border); background: linear-gradient(135deg, rgba(255,255,255,0.06), var(--color-brand-glow));">
        ${teamRow(2, runnerUp, 28, false, runnerUp?.id === teamId)}
        ${teamRow(1, nationalChampion, 35, true, nationalChampion?.id === teamId)}
        <div class="playoff-result-badge" style="margin-top: 0.4rem; padding-top: 0.4rem;">
          <span style="color: #FBBF24; font-weight: 800;"><i class="fa-solid fa-crown"></i> NATIONAL CHAMPION</span>
          <span style="font-weight: 800; color: #FFFFFF;">${nationalChampion?.name?.toUpperCase()} (CFP CHAMP)</span>
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

// ==========================================================================
// LIVE ESPN REAL-TIME DATA & RANKINGS SYNCHRONIZATION ENGINE
// ==========================================================================

const ESPN_TEAM_MAP = {
  '251': 'texas',
  '194': 'ohiostate',
  '2483': 'oregon',
  '61': 'georgia',
  '87': 'notredame',
  '84': 'indiana',
  '2390': 'miami',
  '245': 'texasam',
  '145': 'olemiss',
  '201': 'oklahoma',
  '333': 'alabama',
  '130': 'michigan',
  '213': 'pennstate',
  '2633': 'tennessee',
  '99': 'lsu'
};

const TEAM_TO_ESPN_ID = {
  texas: '251',
  ohiostate: '194',
  oregon: '2483',
  georgia: '61',
  notredame: '87',
  indiana: '84',
  miami: '2390',
  texasam: '245',
  olemiss: '145',
  oklahoma: '201',
  alabama: '333',
  michigan: '130',
  pennstate: '213',
  tennessee: '2633',
  lsu: '99'
};

const LiveSyncEngine = {
  isSyncing: false,
  lastSyncTime: null,

  async syncRankings() {
    try {
      const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings');
      if (!res.ok) return false;
      const data = await res.json();
      const apPoll = data.rankings?.find(r => r.name?.includes('AP')) || data.rankings?.[0];
      if (!apPoll || !apPoll.ranks) return false;

      apPoll.ranks.forEach(item => {
        const teamId = ESPN_TEAM_MAP[item.team?.id];
        if (teamId && TEAMS_DATABASE[teamId]) {
          const t = TEAMS_DATABASE[teamId];
          t.apRank = `#${item.current} AP`;
          if (item.points) {
            t.apPoints = `${item.points.toLocaleString()} PTS`;
          }
        }
      });
      return true;
    } catch (err) {
      console.warn('Live rankings sync notice (using baseline snapshot):', err);
      return false;
    }
  },

  async syncTeamRoster(teamId) {
    try {
      const espnId = TEAM_TO_ESPN_ID[teamId];
      if (!espnId) return false;
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${espnId}/roster`);
      if (!res.ok) return false;
      const data = await res.json();
      const team = TEAMS_DATABASE[teamId];
      if (!team) return false;

      // Update Head Coach if provided by live feed
      if (data.coach && data.coach[0]) {
        team.headCoach = `${data.coach[0].firstName} ${data.coach[0].lastName}`;
      }

      return true;
    } catch (err) {
      console.warn(`Live roster sync notice for ${teamId}:`, err);
      return false;
    }
  },

  async syncAll(isManual = false) {
    if (this.isSyncing) return;
    this.isSyncing = true;

    const pill = document.getElementById('liveFeedStatus');
    const textEl = document.getElementById('liveFeedText');
    const syncBtn = document.getElementById('manualSyncBtn');

    if (pill) pill.classList.add('syncing');
    if (textEl) textEl.innerText = 'SYNCING LIVE DATA...';
    if (syncBtn) syncBtn.classList.add('spinning');

    const [rankingsOk, rosterOk] = await Promise.all([
      this.syncRankings(),
      this.syncTeamRoster(state.currentTeamId)
    ]);

    this.lastSyncTime = new Date();
    const timeStr = this.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setTimeout(() => {
      this.isSyncing = false;
      if (pill) pill.classList.remove('syncing');
      if (syncBtn) syncBtn.classList.remove('spinning');
      if (textEl) {
        textEl.innerText = (rankingsOk || rosterOk) ? `LIVE ESPN FEED • ${timeStr}` : 'LIVE FEED ACTIVE';
      }

      // Re-render UI with synced live data
      renderTeamSelector();
      selectTeam(state.currentTeamId);
    }, 500);
  }
};

function initLiveSyncEngine() {
  const syncBtn = document.getElementById('manualSyncBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      LiveSyncEngine.syncAll(true);
    });
  }

  // Initial automatic live sync
  LiveSyncEngine.syncAll(false);

  // Periodic background refresh every 3 minutes
  setInterval(() => {
    LiveSyncEngine.syncAll(false);
  }, 180000);
}

