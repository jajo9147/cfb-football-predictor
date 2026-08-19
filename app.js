// ==========================================================================
// GRIDIRON ORACLE - MULTI-TEAM COLLEGE FOOTBALL AI PREDICTOR ENGINE (2026)
// ==========================================================================

const state = {
  currentTeamId: null, // resolved dynamically on DOMContentLoaded
  filter: 'all',
  teamSliders: {}, // Map of teamId -> { qbRating, groundAttack, defenseHavoc, turnoverLuck, crowdNoise }
  teamActivePresets: {}, // Map of teamId -> presetKey ('baseline', 'qb-mvp', etc.)
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

function getTeamSliders(teamId) {
  if (!teamId) return { ...GLOBAL_PRESETS['baseline'] };
  if (!state.teamSliders[teamId]) {
    state.teamSliders[teamId] = { ...GLOBAL_PRESETS['baseline'] };
  }
  return state.teamSliders[teamId];
}

function isSlidersCustom(s) {
  if (!s) return false;
  return (s.qbRating || 0) !== 0 || (s.groundAttack || 0) !== 0 || (s.defenseHavoc || 0) !== 0 || (s.turnoverLuck || 0) !== 0 || (s.crowdNoise || 0) !== 0;
}

function getOpponentTeamId(game) {
  if (!game || !game.oppAbbr) return null;
  const oppAbbr = game.oppAbbr.toUpperCase();
  for (const [id, team] of Object.entries(TEAMS_DATABASE)) {
    if (team.abbr.toUpperCase() === oppAbbr || id.toUpperCase() === oppAbbr) {
      return id;
    }
  }
  return null;
}

// ==========================================================================
// INITIALIZATION & EVENT LISTENERS
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initPwaServiceWorker();
  renderTeamSelector();

  // Default to the #1 AP ranked team dynamically
  const defaultTeamId = getTopRankedTeamId();
  selectTeam(defaultTeamId);

  initGlobalSliders();
  initGlobalPresetButtons();
  initFilterButtons();
  initModalSubTabs();
  initModalActions();
  initHypeCardExport();
  initPwaInstall();
  startCountdownTicker();
  initLiveSyncEngine();
  initMonteCarloEngine();
});

// Returns the team ID of the #1 AP ranked team from TEAMS_DATABASE
function getTopRankedTeamId() {
  let topId = null;
  let topRank = Infinity;
  for (const [id, team] of Object.entries(TEAMS_DATABASE)) {
    const rank = parseInt((team.apRank || '').replace(/[^0-9]/g, ''), 10);
    if (!isNaN(rank) && rank < topRank) {
      topRank = rank;
      topId = id;
    }
  }
  return topId || Object.keys(TEAMS_DATABASE)[0];
}

// ==========================================================================
// PWA SERVICE WORKER
// ==========================================================================

function initPwaServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js?v=2026.58')
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
    const isActive = btn.dataset.teamid === teamId;
    btn.classList.toggle('active', isActive);
    if (isActive && btn.scrollIntoView) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  // Re-render Dynamic Slider Labels & sync slider values to THIS team's sliders
  updateGlobalSliderLabels(team);
  syncSliderInputsToActiveTeam();

  // Recalculate & Re-render
  recalculateSeason();
}

// ==========================================================================
// SIMULATION ENGINE (TWO-WAY ZERO-SUM REALISTIC COLLISION ENGINE)
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

function calculateCombinedMatchup(game, teamId, teamSliders, oppTeamId, oppSliders, userPick) {
  const tQb = teamSliders ? (teamSliders.qbRating || 0) : 0;
  const tGround = teamSliders ? (teamSliders.groundAttack || 0) : 0;
  const tDef = teamSliders ? (teamSliders.defenseHavoc || 0) : 0;
  const tTo = teamSliders ? (teamSliders.turnoverLuck || 0) : 0;
  const tCrowd = teamSliders ? (teamSliders.crowdNoise || 0) : 0;

  const oQb = oppSliders ? (oppSliders.qbRating || 0) : 0;
  const oGround = oppSliders ? (oppSliders.groundAttack || 0) : 0;
  const oDef = oppSliders ? (oppSliders.defenseHavoc || 0) : 0;
  const oTo = oppSliders ? (oppSliders.turnoverLuck || 0) : 0;
  const oCrowd = oppSliders ? (oppSliders.crowdNoise || 0) : 0;

  // Points contributed by team's custom form
  const teamOffPts = (tQb * 0.24) + (tGround * 0.16) + (tDef * 0.04) + (tTo * 0.18) + (game.isHome ? tCrowd * 0.06 : tCrowd * 0.08);
  const teamDefPts = (-tQb * 0.04) - (tGround * 0.08) - (tDef * 0.26) - (tTo * 0.18) - (game.isHome ? tCrowd * 0.06 : tCrowd * 0.06);

  // Points contributed by opponent's custom form
  const oppOffPts = (oQb * 0.24) + (oGround * 0.16) + (oDef * 0.04) + (oTo * 0.18) + (!game.isHome ? oCrowd * 0.06 : oCrowd * 0.08);
  const oppDefPts = (-oQb * 0.04) - (oGround * 0.08) - (oDef * 0.26) - (oTo * 0.18) - (!game.isHome ? oCrowd * 0.06 : oCrowd * 0.06);

  let adjUtScore = Math.max(3, Math.round(game.projScoreUt + teamOffPts + oppDefPts));
  let adjOppScore = Math.max(0, Math.round(game.projScoreOpp + teamDefPts + oppOffPts));

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

  const directSliders = state.gameSliders[game.id];
  const directPick = state.userPicks[game.id];

  // 1. Direct forced pick on this specific game
  if (directPick) {
    const teamEffSliders = (directSliders && directSliders.isCustom) ? directSliders : getTeamSliders(teamId);
    const oppId = getOpponentTeamId(game);
    const oppEffSliders = oppId ? getTeamSliders(oppId) : GLOBAL_PRESETS['baseline'];
    const raw = calculateCombinedMatchup(game, teamId, teamEffSliders, oppId, oppEffSliders, directPick);
    return {
      ...raw,
      isCustomTuned: true,
      syncedFrom: null
    };
  }

  // 2. Direct custom sliders on this specific game
  if (directSliders && directSliders.isCustom) {
    const oppId = getOpponentTeamId(game);
    const oppEffSliders = oppId ? getTeamSliders(oppId) : GLOBAL_PRESETS['baseline'];
    const raw = calculateCombinedMatchup(game, teamId, directSliders, oppId, oppEffSliders, null);
    return {
      ...raw,
      isCustomTuned: true,
      syncedFrom: null
    };
  }

  // 3. Counterpart game on opponent's schedule if opponent has custom picks or single-game tuning
  const counterpart = findCounterpartMatchup(teamId, game);
  if (counterpart) {
    const oppSingleSliders = state.gameSliders[counterpart.oppGame.id];
    const oppPick = state.userPicks[counterpart.oppGame.id];

    if (oppPick || (oppSingleSliders && oppSingleSliders.isCustom)) {
      const oppEffSliders = (oppSingleSliders && oppSingleSliders.isCustom) ? oppSingleSliders : getTeamSliders(counterpart.oppTeamId);
      const teamEffSliders = getTeamSliders(teamId);
      const oppRaw = calculateCombinedMatchup(counterpart.oppGame, counterpart.oppTeamId, oppEffSliders, teamId, teamEffSliders, oppPick);

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

  // 4. Combined Team Sliders vs Opponent Sliders (Zero-Sum Realistic Tradeoff!)
  const teamSliders = getTeamSliders(teamId);
  const oppId = getOpponentTeamId(game);
  const oppSliders = oppId ? getTeamSliders(oppId) : GLOBAL_PRESETS['baseline'];

  const raw = calculateCombinedMatchup(game, teamId, teamSliders, oppId, oppSliders, null);
  const teamIsCustom = isSlidersCustom(teamSliders);
  const oppIsCustom = isSlidersCustom(oppSliders);

  let syncedName = null;
  if (oppIsCustom && oppId && oppId !== teamId) {
    syncedName = TEAMS_DATABASE[oppId]?.shortName || null;
  }

  return {
    ...raw,
    isCustomTuned: teamIsCustom || oppIsCustom,
    syncedFrom: syncedName
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

  // Real-time 12-team CFP Seeding for active team
  const cfp = generate12TeamCfpField();
  const currentSeedIdx = cfp.seeds.findIndex(s => s?.id === state.currentTeamId);
  const currentSeedNum = currentSeedIdx !== -1 ? currentSeedIdx + 1 : 0;

  let cfpSeed = 'BUBBLE / OUT';
  let cfpStatus = 'Missed 12-Team CFP';
  let nattyOdds = '+8000';

  if (currentSeedNum >= 1 && currentSeedNum <= 4) {
    cfpSeed = `#${currentSeedNum} SEED`;
    cfpStatus = '1st Round Bye (Quarterfinals)';
    nattyOdds = (currentSeedNum === 1) ? '+350' : '+450';
  } else if (currentSeedNum >= 5 && currentSeedNum <= 8) {
    cfpSeed = `#${currentSeedNum} SEED`;
    cfpStatus = `Hosts 1st Round (${team.stadiumCity || 'On Campus'})`;
    nattyOdds = (currentSeedNum === 5) ? '+650' : '+950';
  } else if (currentSeedNum >= 9 && currentSeedNum <= 12) {
    cfpSeed = `#${currentSeedNum} SEED`;
    cfpStatus = 'First Round Road Game';
    nattyOdds = '+2200';
  }

  document.getElementById('kpiCfpSeed').innerText = cfpSeed;
  document.getElementById('kpiCfpStatus').innerText = cfpStatus;
  document.getElementById('kpiNattyOdds').innerText = nattyOdds;

  const mcQuick = runMonteCarloSeasonSim(state.currentTeamId, 1000);
  const mcTopOutcomeEl = document.getElementById('kpiMonteCarloTopOutcome');
  if (mcTopOutcomeEl) {
    mcTopOutcomeEl.innerText = `${mcQuick.mostLikelyRecord} (${mcQuick.mostLikelyPct})`;
  }
  const nattyOddsSubEl = document.getElementById('kpiNattyOddsSub');
  if (nattyOddsSubEl) {
    nattyOddsSubEl.innerText = `${mcQuick.nattyOdds} Championship Sim`;
  }

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
            <img src="${game.oppLogoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[game.oppAbbr] : '') || ''}" alt="${game.oppAbbr}" class="card-team-logo">
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
        <div class="wl-toggle-wrap" onclick="event.stopPropagation();">
          <span>PICK:</span>
          <button class="wl-toggle-btn ${effectivePick === 'W' ? 'win' : ''}" data-pick="W" data-gameid="${game.id}" onclick="event.stopPropagation();">W</button>
          <button class="wl-toggle-btn ${effectivePick === 'L' ? 'loss' : ''}" data-pick="L" data-gameid="${game.id}" onclick="event.stopPropagation();">L</button>
        </div>
        <button class="sim-btn-sm" data-simid="${game.id}" onclick="event.stopPropagation(); window.openSimModalByGameId('${game.id}');">
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

    const simBtn = card.querySelector('.sim-btn-sm');
    if (simBtn) {
      simBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSimModal(game);
      });
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('.wl-toggle-btn') || e.target.closest('.wl-toggle-wrap')) return;
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

  const currentSliders = getTeamSliders(state.currentTeamId);

  container.innerHTML = '';
  sliderKeys.forEach(s => {
    const card = document.createElement('div');
    card.className = 'slider-card';
    const val = currentSliders[s.key] || 0;
    const sign = val > 0 ? '+' : '';

    card.innerHTML = `
      <div class="slider-top-row">
        <span class="slider-title"><i class="${s.icon}"></i> ${s.label}</span>
        <span class="slider-val-readout" id="readout-${s.key}">${sign}${val}%</span>
      </div>
      <input type="range" class="custom-range-slider" id="slider-${s.key}" min="-50" max="50" value="${val}" step="5">
      <div class="slider-hints-row">
        <span>-50% Slump</span>
        <span>Baseline</span>
        <span>+50% Elite</span>
      </div>
    `;

    const range = card.querySelector('input');
    range.addEventListener('input', (e) => {
      const teamSliders = getTeamSliders(state.currentTeamId);
      teamSliders[s.key] = parseInt(e.target.value, 10);
      const signStr = teamSliders[s.key] > 0 ? '+' : '';
      card.querySelector('.slider-val-readout').innerText = `${signStr}${teamSliders[s.key]}%`;
      
      // Remove active from presets since custom sliders are in use
      state.teamActivePresets[state.currentTeamId] = 'custom';
      document.querySelectorAll('#globalPresetsContainer .preset-btn:not(.reset-all-btn)').forEach(b => b.classList.remove('active'));
      recalculateSeason();
    });

    container.appendChild(card);
  });
}

function syncSliderInputsToActiveTeam() {
  const currentSliders = getTeamSliders(state.currentTeamId);
  const activePreset = state.teamActivePresets[state.currentTeamId] || (isSlidersCustom(currentSliders) ? 'custom' : 'baseline');

  Object.keys(currentSliders).forEach(k => {
    const range = document.getElementById(`slider-${k}`);
    const readout = document.getElementById(`readout-${k}`);
    const val = currentSliders[k] || 0;
    if (range) range.value = val;
    if (readout) {
      const sign = val > 0 ? '+' : '';
      readout.innerText = `${sign}${val}%`;
    }
  });

  const container = document.getElementById('globalPresetsContainer');
  if (container) {
    container.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
      const isMatching = btn.dataset.preset === activePreset;
      btn.classList.toggle('active', isMatching);
    });
  }
}

function initGlobalSliders() {
  const team = TEAMS_DATABASE[state.currentTeamId];
  updateGlobalSliderLabels(team);
  syncSliderInputsToActiveTeam();
}

function initGlobalPresetButtons() {
  const container = document.getElementById('globalPresetsContainer');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const resetBtn = e.target.closest('#resetAllAiBtn');
    if (resetBtn) {
      e.preventDefault();
      window.resetAllToBaseline();
      return;
    }

    const presetBtn = e.target.closest('.preset-btn[data-preset]');
    if (presetBtn) {
      e.preventDefault();
      const presetKey = presetBtn.dataset.preset;
      window.applyGlobalPreset(presetKey);
    }
  });
}

window.applyGlobalPreset = function(presetKey) {
  const presetValues = GLOBAL_PRESETS[presetKey] || GLOBAL_PRESETS['baseline'];
  if (!state.currentTeamId) {
    state.currentTeamId = getTopRankedTeamId() || 'texas';
  }

  // Assign preset specifically to active team
  state.teamSliders[state.currentTeamId] = { ...presetValues };
  state.teamActivePresets[state.currentTeamId] = presetKey;

  syncSliderInputsToActiveTeam();
  recalculateSeason();

  const team = TEAMS_DATABASE[state.currentTeamId];
  const presetNames = {
    'baseline': 'Season Baseline',
    'qb-mvp': 'QB Heisman Mode',
    'qb-slump': 'QB Slump',
    'iron-defense': 'Iron Curtain D',
    'chaos': 'CFB Chaos'
  };
  const name = presetNames[presetKey] || presetKey;
  showToast(`⚡ Applied "${name}" to ${team ? team.shortName : 'team'}!`);
};

window.resetAllToBaseline = function() {
  state.teamSliders = {};
  state.teamActivePresets = {};
  state.gameSliders = {};
  state.userPicks = {};

  syncSliderInputsToActiveTeam();
  recalculateSeason();

  showToast('⚡ Reset all 15 teams & custom AI overrides to authentic 2026 baselines!');
};

function resetAllToBaseline() {
  window.resetAllToBaseline();
}

function showToast(message) {
  let toast = document.getElementById('gridironToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'gridironToast';
    toast.className = 'gridiron-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-success); margin-right: 6px;"></i> ${message}`;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

window.applyScheduleFilter = function(filterKey) {
  state.filter = filterKey;
  const container = document.getElementById('scheduleFilterPills');
  if (container) {
    container.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === filterKey);
    });
  }
  renderSchedule();
};

function initFilterButtons() {
  const container = document.getElementById('scheduleFilterPills');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    e.preventDefault();
    window.applyScheduleFilter(btn.dataset.filter);
  });
}

// ==========================================================================
// SIMULATION MODAL & SINGLE-GAME CUSTOM SCENARIO TUNING
// ==========================================================================

function openSimModal(game) {
  if (!game) return;
  state.activeModalGame = game;
  const team = TEAMS_DATABASE[state.currentTeamId];
  if (!team) return;
  const sim = calculateAdjustedMatchup(game);

  const weekTagEl = document.getElementById('modalWeekTag');
  if (weekTagEl) {
    weekTagEl.innerText = `${game.week} • ${game.isMarquee ? 'MARQUEE BATTLE' : (game.isHome ? 'HOME SHOWDOWN' : 'AWAY GAUNTLET')}`;
  }

  const titleEl = document.getElementById('modalMatchupTitle');
  if (titleEl) {
    titleEl.innerText = `${team.name} vs ${game.opponent}`;
  }

  const stadiumEl = document.getElementById('modalStadiumLocation');
  if (stadiumEl) {
    stadiumEl.innerText = `${game.stadium || 'Campus Stadium'} • ${game.location || ''}`;
  }

  // Scoreboard
  const scoreboardEl = document.getElementById('modalScoreboard');
  if (scoreboardEl) {
    scoreboardEl.innerHTML = `
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
          <img src="${game.oppLogoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[game.oppAbbr] : '') || ''}" alt="${game.oppAbbr}" class="modal-team-logo">
        </div>
      </div>
    `;
  }

  // Render Drive Log
  renderDriveLog(game, sim);

  // Render Tactical Scout Intel
  renderScoutReport(game);

  // Initialize Single-Game Sliders inside Modal
  renderGameSlidersInModal(game);

  // Render Radar Chart
  drawRadarChart(game, sim);

  // Sync Footer Display
  const activeSubTab = document.querySelector('#simModal .sub-tab.active');
  const activeTabName = activeSubTab ? activeSubTab.dataset.subtab : 'drives';
  const modalFooter = document.querySelector('#simModal .modal-footer');
  if (modalFooter) {
    modalFooter.style.display = (activeTabName === 'game-tuning') ? 'none' : 'flex';
  }

  const modalEl = document.getElementById('simModal');
  if (modalEl) {
    modalEl.classList.add('open');
  }
}

window.openSimModal = openSimModal;

window.openSimModalByGameId = function(gameId) {
  const team = TEAMS_DATABASE[state.currentTeamId];
  if (!team || !team.schedule) return;
  const game = team.schedule.find(g => g.id === gameId);
  if (game) {
    openSimModal(game);
  }
};

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

function drawRadarChart(game, sim) {
  const canvas = document.getElementById('radarChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const team = TEAMS_DATABASE[state.currentTeamId];
  if (!team) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const centerX = w / 2;
  const centerY = h / 2 - 10;
  const radius = Math.min(centerX, centerY) - 25;

  const metrics = [
    { label: 'OFFENSE', teamVal: Math.min(99, Math.max(50, 75 + (sim.projUt - 28) * 2)), oppVal: Math.min(99, Math.max(50, 75 + (sim.projOpp - 24) * 2)) },
    { label: 'DEFENSE', teamVal: Math.min(99, Math.max(50, 80 - (sim.projOpp - 20) * 2)), oppVal: Math.min(99, Math.max(50, 80 - (sim.projUt - 24) * 2)) },
    { label: 'QB PLAY', teamVal: Math.min(99, Math.max(50, 82 + (getTeamSliders(state.currentTeamId).qbRating || 0) * 0.4)), oppVal: Math.min(99, Math.max(50, 76 + (game.oppRank.includes('#') ? 10 : 0))) },
    { label: 'GROUND', teamVal: Math.min(99, Math.max(50, 80 + (getTeamSliders(state.currentTeamId).groundAttack || 0) * 0.4)), oppVal: 74 },
    { label: 'STADIUM', teamVal: game.isHome ? 92 : 55, oppVal: game.isHome ? 50 : 90 }
  ];

  const totalAxes = metrics.length;
  const angleStep = (Math.PI * 2) / totalAxes;

  // Background Web Grids
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  ctx.lineWidth = 1;
  gridLevels.forEach(level => {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < totalAxes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + Math.cos(angle) * (radius * level);
      const y = centerY + Math.sin(angle) * (radius * level);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  });

  // Spokes
  for (let i = 0; i < totalAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Axis Label
    const labelX = centerX + Math.cos(angle) * (radius + 18);
    const labelY = centerY + Math.sin(angle) * (radius + 18);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(metrics[i].label, labelX, labelY);
  }

  // Draw Team Polygon
  ctx.beginPath();
  metrics.forEach((m, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (m.teamVal / 100) * radius;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = `${team.colors.primary}55`;
  ctx.fill();
  ctx.strokeStyle = team.colors.accent || team.colors.primary;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw Opponent Polygon
  ctx.beginPath();
  metrics.forEach((m, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (m.oppVal / 100) * radius;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = `${game.oppColor}44`;
  ctx.fill();
  ctx.strokeStyle = game.oppColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Legend at bottom
  const legendY = h - 12;
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px Outfit, sans-serif';
  
  // Team legend
  ctx.fillStyle = team.colors.accent || team.colors.primary;
  ctx.fillRect(centerX - 90, legendY - 8, 10, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(team.shortName, centerX - 75, legendY);

  // Opponent legend
  ctx.fillStyle = game.oppColor;
  ctx.fillRect(centerX + 25, legendY - 8, 10, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(game.oppAbbr, centerX + 40, legendY);
}

function renderGameSlidersInModal(game) {
  const container = document.getElementById('modalGameSlidersGrid');
  if (!container) return;
  const team = TEAMS_DATABASE[state.currentTeamId];
  if (!team) return;
  const teamSliders = getTeamSliders(state.currentTeamId);
  const currentSliders = state.gameSliders[game.id] || {
    qbRating: teamSliders.qbRating || 0,
    groundAttack: teamSliders.groundAttack || 0,
    defenseHavoc: teamSliders.defenseHavoc || 0,
    turnoverLuck: teamSliders.turnoverLuck || 0,
    crowdNoise: teamSliders.crowdNoise || 0,
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

window.switchModalSubTab = function(subtab) {
  const tabsContainer = document.querySelector('#simModal .modal-sub-tabs');
  if (tabsContainer) {
    tabsContainer.querySelectorAll('.sub-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.subtab === subtab);
    });
  }

  document.querySelectorAll('#simModal .tab-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById(`pane-${subtab}`);
  if (pane) {
    pane.classList.add('active');
    pane.scrollTop = 0;
  }

  if (subtab === 'radar' && state.activeModalGame) {
    const sim = calculateAdjustedMatchup(state.activeModalGame);
    drawRadarChart(state.activeModalGame, sim);
  }

  const modalDialog = document.querySelector('#simModal .modal-dialog');
  if (modalDialog) {
    modalDialog.scrollTop = 0;
  }

  const modalFooter = document.querySelector('#simModal .modal-footer');
  if (modalFooter) {
    modalFooter.style.display = (subtab === 'game-tuning') ? 'none' : 'flex';
  }
};

function initModalSubTabs() {
  const tabsContainer = document.querySelector('#simModal .modal-sub-tabs');
  if (!tabsContainer) return;

  tabsContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.sub-tab');
    if (!tab) return;
    e.preventDefault();
    window.switchModalSubTab(tab.dataset.subtab);
  });
}

window.applyAndSimulateModalGame = function() {
  if (!state.activeModalGame) return;
  const game = state.activeModalGame;
  recalculateSeason();
  openSimModal(game);
  showToast(`⚡ Re-simulated ${game.opponent} matchup (10,000 drives)!`);
};

window.resetCurrentGameTuning = function() {
  if (!state.activeModalGame) return;
  const game = state.activeModalGame;
  delete state.gameSliders[game.id];
  delete state.userPicks[game.id];

  const counterpart = findCounterpartMatchup(state.currentTeamId, game);
  if (counterpart) {
    delete state.gameSliders[counterpart.oppGame.id];
    delete state.userPicks[counterpart.oppGame.id];
  }

  recalculateSeason();
  openSimModal(game);
  window.switchModalSubTab('game-tuning');
  showToast(`⚡ Reset ${game.opponent} matchup to team baseline!`);
};

window.applyGameScenarioPreset = function(presetKey) {
  const presetValues = GAME_PRESETS[presetKey] || GAME_PRESETS['baseline'];
  const game = state.activeModalGame;
  if (!game) return;

  state.gameSliders[game.id] = {
    ...presetValues,
    isCustom: (presetKey !== 'baseline')
  };

  recalculateSeason();
  openSimModal(game);
  window.switchModalSubTab('game-tuning');

  const presetLabels = {
    'baseline': 'Season Baseline',
    'qb-slump': 'QB Slump',
    'blowout': 'Offensive Blowout',
    'turnover-trap': 'Turnover Trap',
    'ground-pound': 'Ground & Pound'
  };
  const label = presetLabels[presetKey] || presetKey;
  showToast(`⚡ Applied "${label}" to ${game.opponent} matchup!`);
};

window.closeSimModal = function() {
  const modal = document.getElementById('simModal');
  if (modal) modal.classList.remove('open');
};

function initModalActions() {
  const closeBtn = document.getElementById('closeSimModalBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', window.closeSimModal);
  }

  const simModal = document.getElementById('simModal');
  if (simModal) {
    simModal.addEventListener('click', (e) => {
      if (e.target === simModal) {
        window.closeSimModal();
      }
    });
  }

  const applyBtn = document.getElementById('applyAndSimGameBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', window.applyAndSimulateModalGame);
  }

  const resetGameBtn = document.getElementById('resetGameTuningBtn');
  if (resetGameBtn) {
    resetGameBtn.addEventListener('click', window.resetCurrentGameTuning);
  }

  const gamePresetsContainer = document.querySelector('.game-preset-buttons');
  if (gamePresetsContainer) {
    gamePresetsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.game-preset-btn');
      if (!btn) return;
      e.preventDefault();
      window.applyGameScenarioPreset(btn.dataset.gamepreset);
    });
  }

  const quickSimBtn = document.getElementById('quickSimAllBtn');
  if (quickSimBtn) {
    quickSimBtn.addEventListener('click', () => {
      recalculateSeason();
      showToast('⚡ Re-simulated all matchups & CFP seeding!');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeSimModal();
    }
  });
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

    const apMatch = (team.apPoints || '').match(/^([0-9,]+)/);
    const apPts = apMatch ? parseInt(apMatch[1].replace(/,/g, ''), 10) : 500;
    const undefeatedBonus = (wins >= 12 && losses === 0) ? 6000 : (wins >= 11 ? 2000 : 0);
    const score = (wins * 1500) - (losses * 800) + (confWins * 200) + (sumDiff * 3) + (apPts * 0.15) + undefeatedBonus;

    evaluatedTeams.push({
      id: teamId,
      name: team.name,
      shortName: team.shortName,
      abbr: team.abbr,
      logoUrl: team.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[team.abbr] : '') || '',
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

  // 1. Four Highest-Ranked Conference Champions (Seeds 1, 2, 3, 4 ONLY - FIRST ROUND BYES)
  const secTeams = evaluatedTeams.filter(t => t.conf === 'SEC');
  const b1gTeams = evaluatedTeams.filter(t => t.conf === 'Big Ten');
  const accTeams = evaluatedTeams.filter(t => t.conf === 'ACC');

  const secChamp = secTeams[0];
  const b1gChamp = b1gTeams[0];
  const accChamp = accTeams[0];

  // 4th Champion: Group of 5 / Big 12 Champion (Boise State / Texas Tech)
  const g5Champ = {
    id: 'boisestate',
    name: 'Boise State Broncos',
    shortName: 'Boise State',
    abbr: 'BSU',
    logoUrl: (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS['BSU'] : '') || 'https://a.espncdn.com/i/teamlogos/ncaa/500/68.png',
    stadium: 'Albertsons Stadium',
    conf: 'MWC (G5 Champ)',
    wins: 11,
    losses: 1,
    score: 13500,
    apRank: '#12 AP'
  };

  const confChamps = [secChamp, b1gChamp, accChamp, g5Champ].filter(Boolean);
  confChamps.sort((a, b) => b.score - a.score);

  const seed1 = confChamps[0];
  const seed2 = confChamps[1];
  const seed3 = confChamps[2];
  const seed4 = confChamps[3];

  // 2. Eight At-Large Contenders (Seeds 5 through 12 - NEVER get a BYE)
  const champIds = new Set([seed1?.id, seed2?.id, seed3?.id, seed4?.id]);
  const atLargeCandidates = evaluatedTeams.filter(t => !champIds.has(t.id));

  const seed5 = atLargeCandidates[0];
  const seed6 = atLargeCandidates[1];
  const seed7 = atLargeCandidates[2];
  const seed8 = atLargeCandidates[3];
  const seed9 = atLargeCandidates[4];
  const seed10 = atLargeCandidates[5];
  const seed11 = atLargeCandidates[6];
  const seed12 = atLargeCandidates[7] || {
    id: 'smu',
    name: 'SMU Mustangs',
    shortName: 'SMU',
    abbr: 'SMU',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2567.png',
    stadium: 'Gerald J. Ford Stadium',
    conf: 'ACC',
    wins: 10,
    losses: 2,
    score: 11000,
    apRank: '#18 AP'
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
    const logo = tObj?.logoUrl || (tObj?.abbr && typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[tObj.abbr] : '') || '';
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

  // Dynamic Playoff Game Simulation Engine
  function simulatePlayoffMatchup(teamA, teamB, isHomeA = false) {
    if (!teamA && !teamB) return { winner: null, loser: null, scoreA: 0, scoreB: 0, isAWinner: true };
    if (!teamA) return { winner: teamB, loser: null, scoreA: 17, scoreB: 28, isAWinner: false };
    if (!teamB) return { winner: teamA, loser: null, scoreA: 28, scoreB: 17, isAWinner: true };

    const dbA = TEAMS_DATABASE[teamA.id] || teamA;
    const dbB = TEAMS_DATABASE[teamB.id] || teamB;

    let spA = dbA.baseSpRating || 24.0;
    let spB = dbB.baseSpRating || 24.0;

    // Gauntlet & Strength of Schedule Adjustments
    if (dbA.conference === 'SEC') spA += 2.2;
    if (dbB.conference === 'SEC') spB += 2.2;
    if (dbA.conference === 'Big Ten') {
      if (teamA.id === 'pennstate') spA -= 1.8;
      else spA += 1.5;
    }
    if (dbB.conference === 'Big Ten') {
      if (teamB.id === 'pennstate') spB -= 1.8;
      else spB += 1.5;
    }

    // Active User Tuning adjustments
    if (teamA.id === state.currentTeamId) {
      const qb = state.globalSliders.qbRating || 0;
      const def = state.globalSliders.defenseHavoc || 0;
      const gnd = state.globalSliders.groundAttack || 0;
      const to = state.globalSliders.turnoverLuck || 0;
      spA += (qb * 0.16 + def * 0.16 + gnd * 0.12 + to * 0.10);
    }
    if (teamB.id === state.currentTeamId) {
      const qb = state.globalSliders.qbRating || 0;
      const def = state.globalSliders.defenseHavoc || 0;
      const gnd = state.globalSliders.groundAttack || 0;
      const to = state.globalSliders.turnoverLuck || 0;
      spB += (qb * 0.16 + def * 0.16 + gnd * 0.12 + to * 0.10);
    }

    // Home Field Advantage for on-campus First Round (Seeds 5-8)
    if (isHomeA) spA += 2.5;

    const diff = spA - spB;
    let scoreA = Math.max(10, Math.round(27 + diff * 0.7));
    let scoreB = Math.max(10, Math.round(27 - diff * 0.7));

    if (scoreA === scoreB) {
      if (diff >= 0) scoreA += 3;
      else scoreB += 3;
    }

    const isAWinner = scoreA > scoreB;
    return {
      winner: isAWinner ? teamA : teamB,
      loser: isAWinner ? teamB : teamA,
      scoreA,
      scoreB,
      isAWinner
    };
  }

  // 1. Simulate First Round
  const simM1 = simulatePlayoffMatchup(cfp.seed5, cfp.seed12, true);
  const simM2 = simulatePlayoffMatchup(cfp.seed6, cfp.seed11, true);
  const simM3 = simulatePlayoffMatchup(cfp.seed7, cfp.seed10, true);
  const simM4 = simulatePlayoffMatchup(cfp.seed8, cfp.seed9, true);

  const m1Winner = simM1.winner;
  const m2Winner = simM2.winner;
  const m3Winner = simM3.winner;
  const m4Winner = simM4.winner;

  // 2. Simulate Quarterfinals (Neutral NY6 Bowls)
  const simQF1 = simulatePlayoffMatchup(cfp.seed1, m4Winner, false);
  const simQF2 = simulatePlayoffMatchup(cfp.seed2, m3Winner, false);
  const simQF3 = simulatePlayoffMatchup(cfp.seed3, m2Winner, false);
  const simQF4 = simulatePlayoffMatchup(cfp.seed4, m1Winner, false);

  const qf1Winner = simQF1.winner;
  const qf2Winner = simQF2.winner;
  const qf3Winner = simQF3.winner;
  const qf4Winner = simQF4.winner;

  // 3. Simulate Semifinals
  const simSemi1 = simulatePlayoffMatchup(qf1Winner, qf4Winner, false);
  const simSemi2 = simulatePlayoffMatchup(qf2Winner, qf3Winner, false);

  const semi1Winner = simSemi1.winner;
  const semi2Winner = simSemi2.winner;

  // 4. Simulate National Championship
  const simNatty = simulatePlayoffMatchup(semi1Winner, semi2Winner, false);
  const nationalChampion = simNatty.winner;
  const runnerUp = simNatty.loser;

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
        ${teamRow(12, cfp.seed12, simM1.scoreB, !simM1.isAWinner, cfp.seed12?.id === teamId)}
        ${teamRow(5, cfp.seed5, simM1.scoreA, simM1.isAWinner, cfp.seed5?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${cfp.seed5?.stadium || 'On Campus'}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${m1Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- M2: #11 @ #6 -->
      <div class="playoff-matchup-box ${isM2Active ? 'active-team-matchup' : ''}">
        ${teamRow(11, cfp.seed11, simM2.scoreB, !simM2.isAWinner, cfp.seed11?.id === teamId)}
        ${teamRow(6, cfp.seed6, simM2.scoreA, simM2.isAWinner, cfp.seed6?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${cfp.seed6?.stadium || 'On Campus'}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${m2Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- M3: #10 @ #7 -->
      <div class="playoff-matchup-box ${isM3Active ? 'active-team-matchup' : ''}">
        ${teamRow(10, cfp.seed10, simM3.scoreB, !simM3.isAWinner, cfp.seed10?.id === teamId)}
        ${teamRow(7, cfp.seed7, simM3.scoreA, simM3.isAWinner, cfp.seed7?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${cfp.seed7?.stadium || 'On Campus'}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${m3Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- M4: #9 @ #8 -->
      <div class="playoff-matchup-box ${isM4Active ? 'active-team-matchup' : ''}">
        ${teamRow(9, cfp.seed9, simM4.scoreB, !simM4.isAWinner, cfp.seed9?.id === teamId)}
        ${teamRow(8, cfp.seed8, simM4.scoreA, simM4.isAWinner, cfp.seed8?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${cfp.seed8?.stadium || 'On Campus'}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${m4Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
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
        ${teamRow(m4Winner?.id === cfp.seed8?.id ? 8 : 9, m4Winner, simQF1.scoreB, !simQF1.isAWinner, m4Winner?.id === teamId)}
        ${teamRow(1, cfp.seed1, simQF1.scoreA, simQF1.isAWinner, cfp.seed1?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Allstate Sugar Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${qf1Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- QF2: Rose Bowl -->
      <div class="playoff-matchup-box ${isQF2Active ? 'active-team-matchup' : ''}">
        ${teamRow(m3Winner?.id === cfp.seed7?.id ? 7 : 10, m3Winner, simQF2.scoreB, !simQF2.isAWinner, m3Winner?.id === teamId)}
        ${teamRow(2, cfp.seed2, simQF2.scoreA, simQF2.isAWinner, cfp.seed2?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Rose Bowl Game</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${qf2Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- QF3: Peach Bowl -->
      <div class="playoff-matchup-box ${isQF3Active ? 'active-team-matchup' : ''}">
        ${teamRow(m2Winner?.id === cfp.seed6?.id ? 6 : 11, m2Winner, simQF3.scoreB, !simQF3.isAWinner, m2Winner?.id === teamId)}
        ${teamRow(3, cfp.seed3, simQF3.scoreA, simQF3.isAWinner, cfp.seed3?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Chick-fil-A Peach Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${qf3Winner?.shortName?.toUpperCase() || 'WINNER'} ADVANCES</span>
        </div>
      </div>

      <!-- QF4: Fiesta Bowl -->
      <div class="playoff-matchup-box ${isQF4Active ? 'active-team-matchup' : ''}">
        ${teamRow(m1Winner?.id === cfp.seed5?.id ? 5 : 12, m1Winner, simQF4.scoreA, simQF4.isAWinner, m1Winner?.id === teamId)}
        ${teamRow(4, cfp.seed4, simQF4.scoreB, !simQF4.isAWinner, cfp.seed4?.id === teamId)}
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
        ${teamRow(qf4Winner?.id === cfp.seed4?.id ? 4 : 5, qf4Winner, simSemi1.scoreB, !simSemi1.isAWinner, qf4Winner?.id === teamId)}
        ${teamRow(1, qf1Winner, simSemi1.scoreA, simSemi1.isAWinner, qf1Winner?.id === teamId)}
        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Capital One Orange Bowl</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-fire"></i> ${semi1Winner?.shortName?.toUpperCase() || 'WINNER'} TO NATTY</span>
        </div>
      </div>

      <!-- Semi 2: Cotton Bowl -->
      <div class="playoff-matchup-box ${isSemi2Active ? 'active-team-matchup' : ''}">
        ${teamRow(qf3Winner?.id === cfp.seed3?.id ? 3 : 6, qf3Winner, simSemi2.scoreB, !simSemi2.isAWinner, qf3Winner?.id === teamId)}
        ${teamRow(2, qf2Winner, simSemi2.scoreA, simSemi2.isAWinner, qf2Winner?.id === teamId)}
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
        ${teamRow(runnerUp?.id === semi1Winner?.id ? 1 : 2, runnerUp, simNatty.scoreB, false, runnerUp?.id === teamId)}
        ${teamRow(nationalChampion?.id === semi1Winner?.id ? 1 : 2, nationalChampion, simNatty.scoreA, true, nationalChampion?.id === teamId)}
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
  const promptBtnText = document.getElementById('pwaPromptBtnText');
  const drawer = document.getElementById('pwaInstallDrawer');

  // Helper to detect current browser/platform
  function detectBrowser() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isChrome = /Chrome|CriOS/.test(ua) && !/Edg/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS/.test(ua);

    if (isAndroid) return 'android';
    if (isIOS && isChrome) return 'chrome';
    if (isIOS) return 'safari';
    if (isChrome) return 'chrome';
    if (isSafari) return 'safari';
    return 'desktop';
  }

  function switchTab(tabName) {
    document.querySelectorAll('.pwa-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.pwa-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `pwaPanel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    });
  }

  // Bind tab click events
  document.querySelectorAll('.pwa-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(btn.dataset.tab);
    });
  });

  // Check if app is already running in standalone PWA mode
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if (isStandalone && openPwaBtn) {
    openPwaBtn.style.display = 'none';
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    if (openPwaBtn) openPwaBtn.style.display = 'inline-flex';
    if (promptBtnText) promptBtnText.innerText = '⚡ 1-Tap Direct Install';
  });

  // Top bar "Install App" button
  if (openPwaBtn) {
    openPwaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // If native browser prompt is available (Android, Chrome, Edge), trigger directly in 1-tap!
      if (state.deferredPrompt) {
        state.deferredPrompt.prompt();
        state.deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            if (openPwaBtn) openPwaBtn.style.display = 'none';
          }
          state.deferredPrompt = null;
        });
        return;
      }

      // If on iOS / Chrome without deferred prompt, open the multi-browser drawer with matched default tab
      if (drawer) {
        const detected = detectBrowser();
        switchTab(detected);

        // Sync active team logo into drawer
        const pwaLogo = document.getElementById('pwaDrawerLogo');
        const team = TEAMS_DATABASE[state.currentTeamId];
        if (pwaLogo && team) pwaLogo.src = team.logoUrl;

        if (promptBtnText) {
          promptBtnText.innerText = state.deferredPrompt ? '⚡ 1-Tap Direct Install' : 'Got It • Close';
        }

        drawer.classList.add('open');
      }
    });
  }

  if (closePwaBtn && drawer) {
    closePwaBtn.addEventListener('click', () => {
      drawer.classList.remove('open');
    });
  }

  if (drawer) {
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) {
        drawer.classList.remove('open');
      }
    });
  }

  // Inside the drawer: Action button
  if (nativeBtn && drawer) {
    nativeBtn.addEventListener('click', () => {
      if (state.deferredPrompt) {
        state.deferredPrompt.prompt();
        state.deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            if (openPwaBtn) openPwaBtn.style.display = 'none';
          }
          state.deferredPrompt = null;
          drawer.classList.remove('open');
        });
      } else {
        // Smoothly close guide
        drawer.classList.remove('open');
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

      // Update Head Coach from live ESPN feed
      if (data.coach && data.coach[0]) {
        team.headCoach = `${data.coach[0].firstName} ${data.coach[0].lastName}`;
      }

      // Extract Quarterbacks & Running Backs from live depth chart
      const qbs = [];
      const rbs = [];
      if (data.athletes) {
        data.athletes.forEach(group => {
          if (group.items) {
            group.items.forEach(player => {
              const pos = player.position?.abbreviation;
              const name = player.displayName || player.fullName;
              const exp = player.experience?.displayValue || '';
              if (pos === 'QB') qbs.push({ name, exp });
              if (pos === 'RB') rbs.push({ name, exp });
            });
          }
        });
      }

      // Update slider labels and stars dynamically from live depth chart
      // BUT: if team has a confirmedStarterQb, always protect it from ESPN overwrite
      if (qbs.length > 0) {
        if (team.confirmedStarterQb) {
          // Manually verified starter — lock in QB slider and star player (unless WR/RB)
          if (!team.starPlayer || (!team.starPlayer.includes('WR') && !team.starPlayer.includes('RB'))) {
            team.starPlayer = `${team.confirmedStarterQb} (QB)`;
          }
          team.sliderLabels.qb = `${team.confirmedStarterQb} QB Execution`;
        } else {
          const topQb = qbs.find(q => q.exp.includes('Senior') || q.exp.includes('Junior')) || qbs[0];
          if (topQb && !team.starPlayer.includes('WR') && !team.starPlayer.includes('RB')) {
            team.starPlayer = `${topQb.name} (QB)`;
          }
          if (topQb) {
            team.sliderLabels.qb = `${topQb.name} QB Execution`;
          }
        }
      }

      if (rbs.length > 0) {
        if (!team.sliderLabels.ground || team.sliderLabels.ground === 'Ground Attack') {
          const topRb = rbs.find(r => r.exp.includes('Senior') || r.exp.includes('Junior')) || rbs[0];
          if (topRb) {
            team.sliderLabels.ground = `${topRb.name} Ground Attack`;
          }
        }
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

// ==========================================================================
// 10,000 MONTE CARLO SEASON SIMULATION ENGINE
// ==========================================================================

function runMonteCarloSeasonSim(teamId, iterations = 10000) {
  const team = TEAMS_DATABASE[teamId];
  if (!team) return { iterations: 10000, avgWins: '0.0', winDistribution: {}, mostLikelyRecord: '0-0', mostLikelyPct: '0%', cfpOdds: '0%', nattyOdds: '0%' };

  const schedule = team.schedule;
  const gameProbs = schedule.map(g => {
    const sim = calculateAdjustedMatchup(g, teamId);
    return sim.adjWinProb / 100.0;
  });

  const winDistribution = { 12: 0, 11: 0, 10: 0, 9: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
  let totalWinsSum = 0;
  let playoffAppearances = 0;
  let nationalTitles = 0;

  for (let i = 0; i < iterations; i++) {
    let simWins = 0;
    for (let j = 0; j < gameProbs.length; j++) {
      if (Math.random() < gameProbs[j]) {
        simWins++;
      }
    }
    winDistribution[simWins]++;
    totalWinsSum += simWins;

    if (simWins >= 10) playoffAppearances++;
    else if (simWins === 9 && Math.random() < 0.35) playoffAppearances++;

    if (simWins >= 12 && Math.random() < 0.38) nationalTitles++;
    else if (simWins === 11 && Math.random() < 0.18) nationalTitles++;
    else if (simWins === 10 && Math.random() < 0.05) nationalTitles++;
  }

  const distPct = {};
  let maxPct = 0;
  let mostLikely = '11-1';
  let mostLikelyPct = '0.0%';

  for (let w = 12; w >= 7; w--) {
    const pct = (winDistribution[w] / iterations) * 100;
    const label = `${w}-${12 - w}`;
    distPct[label] = {
      pct: pct.toFixed(1),
      count: winDistribution[w]
    };
    if (pct > maxPct) {
      maxPct = pct;
      mostLikely = label;
      mostLikelyPct = `${pct.toFixed(1)}%`;
    }
  }

  let under7Sum = 0;
  for (let w = 6; w >= 0; w--) {
    under7Sum += winDistribution[w];
  }
  distPct['<=6-6'] = {
    pct: ((under7Sum / iterations) * 100).toFixed(1),
    count: under7Sum
  };

  return {
    iterations,
    avgWins: (totalWinsSum / iterations).toFixed(1),
    winDistribution: distPct,
    mostLikelyRecord: mostLikely,
    mostLikelyPct,
    cfpOdds: `${((playoffAppearances / iterations) * 100).toFixed(1)}%`,
    nattyOdds: `${((nationalTitles / iterations) * 100).toFixed(1)}%`
  };
}

function openMonteCarloModal() {
  const modal = document.getElementById('monteCarloModal');
  if (!modal) return;

  const team = TEAMS_DATABASE[state.currentTeamId];
  if (!team) return;

  modal.classList.add('open');

  const statusText = document.getElementById('mcStatusText');
  const progressPct = document.getElementById('mcProgressPct');
  const progressFill = document.getElementById('mcProgressFill');

  if (statusText) statusText.innerHTML = `<i class="fa-solid fa-dice-d20 fa-spin" style="color: var(--color-brand-accent);"></i> SIMULATING 10,000 SEASONS...`;
  if (progressPct) progressPct.innerText = '0%';
  if (progressFill) progressFill.style.width = '0%';

  document.getElementById('mcModalTitle').innerText = `10,000 MONTE CARLO SIMULATION: ${team.name.toUpperCase()}`;

  let step = 0;
  const animInterval = setInterval(() => {
    step += 25;
    if (progressPct) progressPct.innerText = `${Math.min(100, step)}%`;
    if (progressFill) progressFill.style.width = `${Math.min(100, step)}%`;

    if (step >= 100) {
      clearInterval(animInterval);
      if (statusText) statusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-success);"></i> 10,000 MONTE CARLO SEASONS SIMULATED`;

      const mc = runMonteCarloSeasonSim(state.currentTeamId, 10000);

      document.getElementById('mcAvgWins').innerText = mc.avgWins;
      document.getElementById('mcMostLikelyRecord').innerText = `Most Likely: ${mc.mostLikelyRecord} (${mc.mostLikelyPct})`;
      document.getElementById('mcCfpOdds').innerText = mc.cfpOdds;
      document.getElementById('mcNattyOdds').innerText = mc.nattyOdds;

      const barsContainer = document.getElementById('mcBarsList');
      if (barsContainer) {
        let barsHtml = '';
        Object.keys(mc.winDistribution).forEach(recordKey => {
          const item = mc.winDistribution[recordKey];
          const pctVal = parseFloat(item.pct);
          const isHighlight = recordKey === mc.mostLikelyRecord;
          barsHtml += `
            <div class="mc-bar-row">
              <span class="mc-bar-label" style="${isHighlight ? 'color: var(--color-brand-accent);' : ''}">${recordKey}</span>
              <div class="mc-bar-track">
                <div class="mc-bar-fill" style="width: ${Math.min(100, pctVal * 2.2)}%; ${isHighlight ? 'background: linear-gradient(90deg, #F59E0B, #EF4444);' : ''}"></div>
              </div>
              <span class="mc-bar-val" style="${isHighlight ? 'color: #F59E0B;' : ''}">${item.pct}%</span>
            </div>
          `;
        });
        barsContainer.innerHTML = barsHtml;
      }

      recalculateSeason();
    }
  }, 75);
}

function initMonteCarloEngine() {
  const quickSimBtn = document.getElementById('quickSimAllBtn');
  if (quickSimBtn) {
    quickSimBtn.addEventListener('click', () => {
      openMonteCarloModal();
    });
  }

  const mcKpiCard = document.getElementById('monteCarloKpiCard');
  if (mcKpiCard) {
    mcKpiCard.addEventListener('click', () => {
      openMonteCarloModal();
    });
  }

  const rerunBtn = document.getElementById('mcRerunBtn');
  if (rerunBtn) {
    rerunBtn.addEventListener('click', () => {
      openMonteCarloModal();
    });
  }

  const closeBtn = document.getElementById('closeMonteCarloModalBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('monteCarloModal').classList.remove('open');
    });
  }

  const applyCloseBtn = document.getElementById('mcApplyCloseBtn');
  if (applyCloseBtn) {
    applyCloseBtn.addEventListener('click', () => {
      document.getElementById('monteCarloModal').classList.remove('open');
    });
  }

  const mcModal = document.getElementById('monteCarloModal');
  if (mcModal) {
    mcModal.addEventListener('click', (e) => {
      if (e.target === mcModal) {
        mcModal.classList.remove('open');
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const mcModal = document.getElementById('monteCarloModal');
      if (mcModal && mcModal.classList.contains('open')) {
        mcModal.classList.remove('open');
      }
    }
  });
}


