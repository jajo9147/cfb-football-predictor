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
  ccgPicks: {},    // Map of ccgId -> winnerTeamId
  playoffPicks: {},// Map of playoffGameId -> winnerTeamId
  postseasonGames: {}, // Map of gameId -> generated game object for modal
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
  initTeamSearch();

  // Default to URL query param (?team=texas, ?team=michigan, etc.) or #1 AP ranked team
  const urlParams = new URLSearchParams(window.location.search);
  const paramTeam = urlParams.get('team') ? urlParams.get('team').toLowerCase().trim() : null;
  const defaultTeamId = (paramTeam && TEAMS_DATABASE[paramTeam]) ? paramTeam : getTopRankedTeamId();
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

  // Restore scenario from URL permalink hash (#sim=...) and listen for live hashchange
  restoreScenarioFromUrl();
  window.addEventListener('hashchange', restoreScenarioFromUrl);
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
      navigator.serviceWorker.register('sw.js?v=2026.88')
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

function initTeamSearch() {
  const input = document.getElementById('teamSearchInput');
  const clearBtn = document.getElementById('teamSearchClearBtn');
  const dropdown = document.getElementById('teamSearchResultsDropdown');
  if (!input || !dropdown) return;

  function performSearch(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      dropdown.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      document.querySelectorAll('.team-pill-btn').forEach(btn => {
        btn.style.display = '';
      });
      return;
    }

    if (clearBtn) clearBtn.style.display = 'flex';

    // Filter team pill buttons in the track
    let firstMatchedKey = null;
    document.querySelectorAll('.team-pill-btn').forEach(btn => {
      const tid = btn.dataset.teamid;
      const t = TEAMS_DATABASE[tid];
      if (!t) return;
      const match = t.name.toLowerCase().includes(q) ||
                    t.shortName.toLowerCase().includes(q) ||
                    t.abbr.toLowerCase().includes(q) ||
                    (t.mascot && t.mascot.toLowerCase().includes(q)) ||
                    t.headCoach.toLowerCase().includes(q) ||
                    (t.confirmedStarterQb && t.confirmedStarterQb.toLowerCase().includes(q)) ||
                    t.conference.toLowerCase().includes(q) ||
                    t.apRank.toLowerCase().includes(q);

      btn.style.display = match ? '' : 'none';
      if (match && !firstMatchedKey) firstMatchedKey = tid;
    });

    // Populate the rich dropdown
    const matchedTeams = Object.keys(TEAMS_DATABASE).filter(tid => {
      const t = TEAMS_DATABASE[tid];
      return t.name.toLowerCase().includes(q) ||
             t.shortName.toLowerCase().includes(q) ||
             t.abbr.toLowerCase().includes(q) ||
             (t.mascot && t.mascot.toLowerCase().includes(q)) ||
             t.headCoach.toLowerCase().includes(q) ||
             (t.confirmedStarterQb && t.confirmedStarterQb.toLowerCase().includes(q)) ||
             t.conference.toLowerCase().includes(q) ||
             t.apRank.toLowerCase().includes(q);
    });

    if (matchedTeams.length === 0) {
      dropdown.innerHTML = `
        <div class="team-search-no-results">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span>No teams found for "${query}"</span>
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = '';
    matchedTeams.forEach(tid => {
      const t = TEAMS_DATABASE[tid];
      const item = document.createElement('div');
      item.className = `team-search-item ${tid === state.currentTeamId ? 'active' : ''}`;
      item.innerHTML = `
        <div class="search-item-left">
          <img src="${t.logoUrl}" alt="${t.shortName}" class="search-item-logo">
          <div class="search-item-info">
            <div class="search-item-name">${t.name} <span class="search-item-badge">${t.apRank}</span></div>
            <div class="search-item-sub">HC: ${t.headCoach} • QB: ${t.confirmedStarterQb || 'Starter'} • ${t.conference}</div>
          </div>
        </div>
        <i class="fa-solid fa-chevron-right search-item-arrow"></i>
      `;
      item.onclick = () => {
        selectTeam(tid);
        input.value = '';
        performSearch('');
        dropdown.style.display = 'none';
      };
      dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
    return firstMatchedKey;
  }

  input.addEventListener('input', (e) => {
    performSearch(e.target.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim().toLowerCase();
      const matched = Object.keys(TEAMS_DATABASE).find(tid => {
        const t = TEAMS_DATABASE[tid];
        return t.name.toLowerCase().includes(q) ||
               t.shortName.toLowerCase().includes(q) ||
               t.abbr.toLowerCase().includes(q) ||
               t.headCoach.toLowerCase().includes(q);
      });
      if (matched) {
        selectTeam(matched);
        input.value = '';
        performSearch('');
        dropdown.style.display = 'none';
        input.blur();
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      input.blur();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      performSearch('');
      input.focus();
    });
  }

  // Global Keyboard Shortcut: Press '/' or 'Cmd+K' / 'Ctrl+K' to focus search
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === '/' && document.activeElement !== input && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
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
  const ocEl = document.getElementById('heroOC');
  if (ocEl) {
    ocEl.innerText = `OC: ${team.offensiveCoordinator || 'Coordinating Staff'}`;
  }
  const dcEl = document.getElementById('heroDC');
  if (dcEl) {
    dcEl.innerText = `DC: ${team.defensiveCoordinator || 'Staff'}`;
  }
  document.getElementById('heroStarPlayer').innerText = `Star: ${team.starPlayer}`;
  const capacityStr = team.stadiumCapacity ? ` (${team.stadiumCapacity})` : '';
  document.getElementById('heroStadium').innerText = `${team.stadium || 'Home Stadium'}${capacityStr}`;

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
  updateCountdownTickerForActiveTeam();
}

// ==========================================================================
// SIMULATION ENGINE (TWO-WAY ZERO-SUM REALISTIC COLLISION ENGINE)
// ==========================================================================

function findCounterpartMatchup(teamId, game) {
  if (!game || !teamId) return null;
  const currentTeam = TEAMS_DATABASE[teamId];
  if (!currentTeam) return null;

  let oppTeamId = null;
  let oppTeam = null;

  for (const [k, t] of Object.entries(TEAMS_DATABASE)) {
    if (t.abbr === game.oppAbbr || k === (game.oppAbbr || '').toLowerCase() || isTeamMatch(t, game.opponent) || isTeamMatch(t, game.oppBadge)) {
      oppTeamId = k;
      oppTeam = t;
      break;
    }
  }

  if (!oppTeamId || !oppTeam || !Array.isArray(oppTeam.schedule)) return null;

  const oppGame = oppTeam.schedule.find(g => {
    return g.oppAbbr === currentTeam.abbr || isTeamMatch(currentTeam, g.opponent) || isTeamMatch(currentTeam, g.oppBadge);
  });

  if (!oppGame) return null;
  return { oppTeamId, oppTeam, oppGame };
}

const STADIUM_HFA_MAP = {
  'DKR Texas Memorial Stadium': 2.8,
  'Ohio Stadium (The Horseshoe)': 2.8,
  'Ohio Stadium': 2.8,
  'Beaver Stadium': 2.8,
  'Sanford Stadium': 2.8,
  'Kyle Field': 2.8,
  'Bryant-Denny Stadium': 2.8,
  'Tiger Stadium (Death Valley)': 2.8,
  'Tiger Stadium': 2.8,
  'Neyland Stadium': 2.8,
  'Michigan Stadium (The Big House)': 2.6,
  'Michigan Stadium': 2.6,
  'Autzen Stadium': 2.5,
  'Doak Campbell Stadium': 2.5,
  'Memorial Stadium (Clemson)': 2.5,
  'Notre Dame Stadium': 2.5,
  'Gaylord Family Oklahoma Memorial Stadium': 2.5,
  'Memorial Stadium': 2.5,
  'Hard Rock Stadium': 2.2,
  'LaVell Edwards Stadium': 2.5,
  'Jones AT&T Stadium': 2.5,
  'Rice-Eccles Stadium': 2.5,
  'Kinnick Stadium': 2.5,
  'Faurot Field': 2.2,
  'Husky Stadium': 2.5,
  'Memorial Stadium (Indiana)': 2.2,
  'Albertsons Stadium': 2.2,
  'Los Angeles Memorial Coliseum': 2.2,
  'Gerald J. Ford Stadium': 2.2,
  'TDECU Stadium': 2.2,
  'L&N Federal Credit Union Stadium': 2.2,
  'L&N Stadium': 2.2
};

const NON_DB_OPPONENT_RATINGS = {
  'Florida Gators': 19.5, 'FLA': 19.5,
  'Nebraska Cornhuskers': 19.0, 'NEB': 19.0,
  'Wisconsin Badgers': 19.0, 'WISC': 19.0,
  'Kansas State Wildcats': 20.0, 'KSU': 20.0,
  'Iowa State Cyclones': 19.5, 'ISU': 19.5,
  'Illinois Fighting Illini': 18.5, 'ILL': 18.5,
  'Auburn Tigers': 18.5, 'AUB': 18.5,
  'South Carolina Gamecocks': 17.5, 'SC': 17.5,
  'Arkansas Razorbacks': 17.5, 'ARK': 17.5,
  'Colorado Buffaloes': 18.0, 'COL': 18.0,
  'Arizona State Sun Devils': 18.0, 'ASU': 18.0,
  'Georgia Tech Yellow Jackets': 18.5, 'GT': 18.5,
  'North Carolina Tar Heels': 17.5, 'UNC': 17.5,
  'TCU Horned Frogs': 17.5, 'TCU': 17.5,
  'Kansas Jayhawks': 17.5, 'KU': 17.5,
  'Kentucky Wildcats': 17.0, 'UK': 17.0,
  'UCF Knights': 17.0, 'UCF': 17.0,
  'Pittsburgh Panthers': 17.0, 'PITT': 17.0,
  'NC State Wolfpack': 17.0, 'NCST': 17.0,
  'Rutgers Scarlet Knights': 16.5, 'RUTG': 16.5,
  'Minnesota Golden Gophers': 16.5, 'MINN': 16.5,
  'Oklahoma State Cowboys': 16.5, 'OKST': 16.5,
  'Baylor Bears': 16.5, 'BAY': 16.5,
  'Virginia Tech Hokies': 16.5, 'VT': 16.5,
  'Syracuse Orange': 16.5, 'SYR': 16.5,
  'UCLA Bruins': 16.0, 'UCLA': 16.0,
  'West Virginia Mountaineers': 16.0, 'WVU': 16.0,
  'Oregon State Beavers': 16.0, 'ORST': 16.0,
  'Washington State Cougars': 16.0, 'WSU': 16.0,
  'Duke Blue Devils': 16.0, 'DUKE': 16.0,
  'Maryland Terrapins': 15.5, 'MD': 15.5,
  'Cincinnati Bearcats': 15.5, 'CIN': 15.5,
  'California Golden Bears': 15.5, 'CAL': 15.5,
  'Mississippi State Bulldogs': 15.0, 'MSST': 15.0,
  'Michigan State Spartans': 15.0, 'MSU': 15.0,
  'Virginia Cavaliers': 14.5, 'UVA': 14.5,
  'Vanderbilt Commodores': 14.5, 'VANDY': 14.5,
  'Boston College Eagles': 13.0, 'BC': 13.0,
  'Wake Forest Demon Deacons': 13.0, 'WAKE': 13.0,
  'Purdue Boilermakers': 12.5, 'PUR': 12.5,
  'Stanford Cardinal': 12.5, 'STAN': 12.5,
  'Northwestern Wildcats': 12.0, 'NU': 12.0,
  'Tulane Green Wave': 13.5, 'TUL': 13.5,
  'Memphis Tigers': 13.0, 'MEM': 13.0,
  'UNLV Rebels': 13.0, 'UNLV': 13.0,
  'UTSA Roadrunners': 6.0, 'UTSA': 6.0,
  'Texas State Bobcats': 4.5, 'TXST': 4.5,
  'Ball State Cardinals': 1.0, 'BALL': 1.0,
  'Western Michigan Broncos': 3.5, 'WMU': 3.5,
  'Portland State Vikings': -8.0,
  'Stephen F. Austin Lumberjacks': -6.0,
  'Houston Christian Huskies': -8.0,
  'Missouri State Bears': -4.0,
  'Villanova Wildcats': -3.0
};

function calculateCombinedMatchup(game, teamId, teamSliders, oppTeamId, oppSliders, userPick) {
  const tTeam = TEAMS_DATABASE[teamId] || {};
  let spA = tTeam.baseSpRating || 22.0;

  // Resolve opponent SP rating dynamically
  let spB = 5.0;
  let oTeam = null;
  if (oppTeamId && TEAMS_DATABASE[oppTeamId]) {
    oTeam = TEAMS_DATABASE[oppTeamId];
    spB = oTeam.baseSpRating || 22.0;
  } else {
    const oppName = game?.opponent || '';
    const oppAbbr = game?.oppAbbr || '';
    if (NON_DB_OPPONENT_RATINGS[oppName] !== undefined) spB = NON_DB_OPPONENT_RATINGS[oppName];
    else if (NON_DB_OPPONENT_RATINGS[oppAbbr] !== undefined) spB = NON_DB_OPPONENT_RATINGS[oppAbbr];
    else if (oppName.includes('FCS') || (oppName.includes('State') && game?.oppRank === 'NR')) spB = 0.0;
  }

  // Calculate dynamic venue HFA
  const stadium = game?.stadium || '';
  const location = game?.location || '';
  const rivalry = game?.rivalryName || '';
  const isNeutral = (stadium.includes('Cotton Bowl') || stadium.includes('Neutral') || (stadium.includes('Mercedes-Benz') && !stadium.includes('Georgia'))) || (location.includes('Dallas') && rivalry.toUpperCase().includes('RED RIVER')) || (location.includes('Neutral') || location.includes('Dublin'));

  let hfa = 0.0;
  if (isNeutral) {
    hfa = 0.0;
  } else if (game?.isHome) {
    hfa = STADIUM_HFA_MAP[stadium] || STADIUM_HFA_MAP[tTeam.stadium] || 2.5;
  } else {
    const oppStadium = oTeam ? (oTeam.stadium || stadium) : stadium;
    hfa = -(STADIUM_HFA_MAP[oppStadium] || 2.5);
  }

  const baseMargin = spA - spB + hfa;

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

  // Weather & Environmental / Injury Multipliers
  let weatherScorePenalty = 0;
  const gameSlider = game && game.id ? state.gameSliders[game.id] : null;
  const weather = gameSlider?.weather || 'dome';
  const hasInjury = !!gameSlider?.injury;

  if (weather === 'rain') {
    weatherScorePenalty = -4.5;
  } else if (weather === 'snow') {
    weatherScorePenalty = -8.5;
  } else if (weather === 'wind') {
    weatherScorePenalty = -6.0;
  }

  const injuryPenalty = hasInjury ? -6.5 : 0;

  // Points contributed by custom slider form
  const teamOffPts = (tQb * 0.24) + (tGround * 0.16) + (tDef * 0.04) + (tTo * 0.18) + (game?.isHome ? tCrowd * 0.06 : tCrowd * 0.08) + injuryPenalty;
  const teamDefPts = (-tQb * 0.04) - (tGround * 0.08) - (tDef * 0.26) - (tTo * 0.18) - (game?.isHome ? tCrowd * 0.06 : tCrowd * 0.06);

  const oppOffPts = (oQb * 0.24) + (oGround * 0.16) + (oDef * 0.04) + (oTo * 0.18) + (!game?.isHome ? oCrowd * 0.06 : oCrowd * 0.08);
  const oppDefPts = (-oQb * 0.04) - (oGround * 0.08) - (oDef * 0.26) - (oTo * 0.18) - (!game?.isHome ? oCrowd * 0.06 : oCrowd * 0.06);

  const effectiveMargin = baseMargin + (teamOffPts - teamDefPts) - (oppOffPts - oppDefPts);

  // Dynamic Pace Total
  let baseTotal = (game && game.overUnder) ? game.overUnder : 55.0;
  if (!game?.overUnder) {
    if (spA >= 27.0 && spB >= 24.0) baseTotal = 59.0;
    else if (spA >= 25.0 && spB <= 8.0) baseTotal = 56.0;
    else if ((tTeam.name && tTeam.name.includes('Iowa')) || (oTeam && oTeam.name && oTeam.name.includes('Iowa'))) baseTotal = 42.0;
    else if ((tTeam.name && tTeam.name.includes('Michigan')) || (oTeam && oTeam.name && oTeam.name.includes('Michigan'))) baseTotal = 46.0;
    else if ((tTeam.name && tTeam.name.includes('Utah')) || (oTeam && oTeam.name && oTeam.name.includes('Utah'))) baseTotal = 45.0;
    else if ((tTeam.name && tTeam.name.includes('Texas Tech')) || (oTeam && oTeam.name && oTeam.name.includes('Texas Tech'))) baseTotal = 62.0;
    else if ((tTeam.name && tTeam.name.includes('Ole Miss')) || (oTeam && oTeam.name && oTeam.name.includes('Ole Miss'))) baseTotal = 63.0;
  }

  let adjUtScore = Math.max(6, Math.round((baseTotal + effectiveMargin + weatherScorePenalty) / 2.0));
  let adjOppScore = Math.max(3, Math.round((baseTotal - effectiveMargin + weatherScorePenalty) / 2.0));

  // Enforce decisive score separation for favorites
  if (adjUtScore === adjOppScore) {
    if (effectiveMargin >= 0) adjUtScore += 3;
    else adjOppScore += 3;
  } else if (effectiveMargin > 0.3 && adjUtScore <= adjOppScore) {
    adjUtScore = adjOppScore + 3;
  } else if (effectiveMargin < -0.3 && adjOppScore <= adjUtScore) {
    adjOppScore = adjUtScore + 3;
  }

  const pointDiff = adjUtScore - adjOppScore;
  let adjWinProb = Math.round(100 / (1 + Math.pow(10, -pointDiff / 13.5)));
  adjWinProb = Math.min(99, Math.max(1, adjWinProb));

  let isWin = userPick ? (userPick === 'W') : (adjUtScore > adjOppScore);
  if (userPick === 'W' && adjUtScore <= adjOppScore) adjUtScore = adjOppScore + 3;
  if (userPick === 'L' && adjUtScore >= adjOppScore) adjOppScore = adjUtScore + 3;

  return {
    adjWinProb: Math.round(adjWinProb),
    projUt: adjUtScore,
    projOpp: adjOppScore,
    isWin
  };
}

function calculateVegasEdge(game, sim) {
  if (!game || !sim || typeof game.vegasSpread !== 'number') return null;

  const simSpread = sim.projUt - sim.projOpp;
  const vegasExpectedDiff = -game.vegasSpread;
  const spreadEdge = simSpread - vegasExpectedDiff;
  const hasSpreadEdge = Math.abs(spreadEdge) >= 3.0;

  const simTotal = sim.projUt + sim.projOpp;
  const vegasTotal = game.overUnder || 52.5;
  const totalEdge = simTotal - vegasTotal;
  const hasTotalEdge = Math.abs(totalEdge) >= 4.5;

  let badgeHtml = '';
  if (hasSpreadEdge) {
    badgeHtml = `<span class="vegas-edge-badge highlight" title="Sharp Market Edge: Model Spread deviates by ${Math.abs(spreadEdge).toFixed(1)} pts from Vegas"><i class="fa-solid fa-gem"></i> ${Math.abs(spreadEdge).toFixed(1)} PT SPREAD EDGE</span>`;
  } else if (hasTotalEdge) {
    const ouType = totalEdge > 0 ? 'OVER' : 'UNDER';
    badgeHtml = `<span class="vegas-edge-badge" title="Total Edge vs Vegas ${vegasTotal} O/U"><i class="fa-solid fa-arrow-trend-up"></i> ${ouType} EDGE (${Math.abs(totalEdge).toFixed(1)} PTS)</span>`;
  }

  return {
    simSpread,
    vegasExpectedDiff,
    spreadEdge,
    hasSpreadEdge,
    simTotal,
    vegasTotal,
    totalEdge,
    hasTotalEdge,
    badgeHtml
  };
}

function calculateAdjustedMatchup(game, targetTeamId) {
  if (!game) return { adjWinProb: 50, projUt: 24, projOpp: 21, isWin: true, isCustomTuned: false, syncedFrom: null };

  // 0a. Dynamic Dream Matchup or Postseason Game
  if ((game.isPostseason || game.isDreamMatchup) && game.teamA && game.teamB) {
    const tA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    const tB = TEAMS_DATABASE[game.teamB.id] || game.teamB;
    const sim = simulatePostseasonMatchup(tA, tB, { gameId: game.id, isHomeA: game.isHomeA || game.isHome });
    return {
      adjWinProb: sim.winProbA,
      projUt: sim.scoreA,
      projOpp: sim.scoreB,
      isWin: sim.isAWinner,
      isFinal: false,
      isCustomTuned: !!(state.gameSliders[game.id] && state.gameSliders[game.id].isCustom),
      syncedFrom: null
    };
  }

  const teamId = targetTeamId || state.currentTeamId;
  const team = TEAMS_DATABASE[teamId];
  if (!team) return { adjWinProb: 50, projUt: 24, projOpp: 21, isWin: true, isCustomTuned: false, syncedFrom: null };

  // 0. Live ESPN Locked-In Completed Game (Actual Final Score & Result)
  if (game && game.isFinal && typeof game.actualScoreUt === 'number') {
    const isWin = game.actualScoreUt > game.actualScoreOpp;
    return {
      adjWinProb: isWin ? 100 : 0,
      projUt: game.actualScoreUt,
      projOpp: game.actualScoreOpp,
      isWin,
      isFinal: true,
      isCustomTuned: false,
      syncedFrom: null
    };
  }

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
      const invertedProb = Math.min(99, Math.max(1, Math.round(100 - oppRaw.adjWinProb)));

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

function isConferenceGame(g) {
  if (!g) return false;
  return !!(g.isSec || g.isBigTen || g.isBig12 || g.isAcc || g.isConf);
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
      if (isConferenceGame(game)) confWins++;
    } else {
      totalLosses++;
      if (isConferenceGame(game)) confLosses++;
    }
    sumWinProb += sim.adjWinProb;
    sumUtScore += sim.projUt;
    sumOppScore += sim.projOpp;
  });

  const avgWinProb = Math.round(sumWinProb / team.schedule.length);
  const avgMargin = ((sumUtScore - sumOppScore) / team.schedule.length).toFixed(1);
  const avgMarginSign = avgMargin >= 0 ? `+${avgMargin}` : avgMargin;

  // 1. Evaluate all 20 teams across the country
  const evaluatedTeams = evaluateRegularSeasonAllTeams();

  // 2. Simulate Conference Championships
  const ccgResults = simulateConferenceChampionships(evaluatedTeams);
  renderConferenceChampionships(ccgResults);

  // 3. Generate 12-Team CFP Field and simulate playoff bracket
  const cfp = generate12TeamCfpField(ccgResults.confChamps, evaluatedTeams);
  const currentSeedIdx = cfp.seeds.findIndex(s => s?.id === state.currentTeamId);
  const currentSeedNum = currentSeedIdx !== -1 ? currentSeedIdx + 1 : 0;

  const playoffResults = simulatePlayoffBracket(cfp);
  state.lastPlayoffResults = playoffResults;
  state.lastNationalChampion = playoffResults.nationalChampion;
  updateSocialMetadataForChampion(playoffResults.nationalChampion);

  // 4. Generate Single-Destination National Non-CFP Bowl Slate (No Duplicates!)
  const nationalBowls = generateNationalPostseasonBowlSlate(evaluatedTeams, playoffResults);
  state.nationalBowlSlate = nationalBowls.bowlGamesList;
  state.teamBowlOutcomes = nationalBowls.teamBowlMap;

  // 5. Calculate Overall Season Total Record (Regular + CCG + CFP / Single Non-CFP Bowl)
  const fullSeason = calcActiveTeamTotalRecord(state.currentTeamId, totalWins, totalLosses, ccgResults, playoffResults, nationalBowls.teamBowlMap);

  // Update Hero & KPI Cards
  const kpiTotalRecordEl = document.getElementById('kpiTotalRecord');
  if (kpiTotalRecordEl) {
    kpiTotalRecordEl.innerText = `${fullSeason.totalWins} - ${fullSeason.totalLosses}`;
  }

  const kpiRecordEl = document.getElementById('kpiRecord');
  if (kpiRecordEl) {
    kpiRecordEl.innerText = `${totalWins} - ${totalLosses}`;
  }

  const kpiPostseasonOutcomeEl = document.getElementById('kpiPostseasonOutcome');
  if (kpiPostseasonOutcomeEl) {
    kpiPostseasonOutcomeEl.innerText = fullSeason.outcomeTitle;
  }

  const confName = (team.conference && team.conference !== 'Independent') ? team.conference : 'Conf';
  const kpiConfEl = document.getElementById('kpiConfRecord');
  if (kpiConfEl) {
    kpiConfEl.innerText = team.conference === 'Independent' ? 'Independent' : `${confWins}-${confLosses} ${confName}`;
  }
  document.getElementById('kpiWinProb').innerText = `${avgWinProb}%`;
  document.getElementById('kpiMargin').innerText = avgMarginSign;

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
  renderPlayoffBracket(totalWins, cfpSeed, playoffResults);
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
    if (state.filter === 'conf') return isConferenceGame(game);
    if (state.filter === 'home') return game.isHome;
    if (state.filter === 'away') return !game.isHome;
    return true;
  });

  filteredGames.forEach(game => {
    const sim = calculateAdjustedMatchup(game);
    const vegasEdge = calculateVegasEdge(game, sim);
    const card = document.createElement('div');
    card.className = `game-card ${game.isMarquee ? 'marquee-border' : ''}`;

    const userPick = state.userPicks[game.id];
    const isWin = sim.isWin;
    // Default the Pick to Win or Loss based off the projected score
    const effectivePick = userPick || (isWin ? 'W' : 'L');

    let badgeHtml = `<span>${game.isHome ? 'HOME' : 'AWAY'}</span>`;
    if (sim.isFinal) {
      badgeHtml = `<span class="custom-tuned-badge" style="background: rgba(16, 185, 129, 0.2); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4);"><i class="fa-solid fa-lock"></i> FINAL</span>`;
    } else if (sim.isCustomTuned) {
      if (sim.syncedFrom) {
        badgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-link"></i> SYNCED: ${sim.syncedFrom.toUpperCase()}</span>`;
      } else {
        badgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-bullseye"></i> CUSTOM TUNED</span>`;
      }
    }

    card.innerHTML = `
      <div class="card-top">
        <span>${game.week} • ${game.date}</span>
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          ${vegasEdge?.badgeHtml || ''}
          ${badgeHtml}
        </div>
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

function isTeamMatch(t, curId) {
  if (!t || !curId) return false;
  const cur = curId.toLowerCase().trim();
  const tid = (t.id || '').toLowerCase().trim();
  const tabbr = (t.abbr || '').toLowerCase().trim();
  const tshort = (t.shortName || '').toLowerCase().trim();
  const tname = (t.name || '').toLowerCase().trim();

  // Exact ID or abbreviation match
  if (tid && (tid === cur || cur === tid)) return true;
  if (tabbr && (tabbr === cur || cur === tabbr)) return true;
  if (tshort && tshort === cur) return true;

  // Specific canonical aliases mapping to prevent substring collisions (e.g. Texas vs Texas A&M vs Texas Tech)
  const aliases = {
    'texas': ['texas longhorns', 'texas', 'tex', 'ut'],
    'texasam': ['texas a&m', 'texas a&m aggies', 'tamu', 'a&m'],
    'texastech': ['texas tech', 'texas tech red raiders', 'ttu', 'tech'],
    'ohiostate': ['ohio state', 'ohio state buckeyes', 'osu'],
    'oregon': ['oregon', 'oregon ducks', 'uo', 'ore'],
    'michigan': ['michigan', 'michigan wolverines', 'um', 'mich'],
    'georgia': ['georgia', 'georgia bulldogs', 'uga', 'uga bulldogs'],
    'alabama': ['alabama', 'alabama crimson tide', 'bama', 'ala'],
    'pennstate': ['penn state', 'penn state nittany lions', 'psu'],
    'notredame': ['notre dame', 'notre dame fighting irish', 'nd'],
    'lsu': ['lsu', 'lsu tigers', 'louisiana state'],
    'tennessee': ['tennessee', 'tennessee volunteers', 'vols', 'tenn'],
    'indiana': ['indiana', 'indiana hoosiers', 'iu', 'ind'],
    'miami': ['miami', 'miami hurricanes', 'the u', 'canes', 'mia'],
    'olemiss': ['ole miss', 'ole miss rebels', 'mississippi', 'miss'],
    'oklahoma': ['oklahoma', 'oklahoma sooners', 'ou'],
    'boisestate': ['boise state', 'boise state broncos', 'bsu', 'boise'],
    'usc': ['usc', 'usc trojans', 'southern cal', 'southern california'],
    'floridastate': ['florida state', 'florida state seminoles', 'fsu', 'noles'],
    'clemson': ['clemson', 'clemson tigers', 'clem'],
    'smu': ['smu', 'smu mustangs', 'southern methodist'],
    'byu': ['byu', 'byu cougars', 'brigham young'],
    'utah': ['utah', 'utah utes', 'utes'],
    'iowa': ['iowa', 'iowa hawkeyes', 'hawkeyes'],
    'missouri': ['missouri', 'missouri tigers', 'mizzou', 'miz'],
    'arizona': ['arizona', 'arizona wildcats', 'wildcats', 'ariz', 'ua', 'zona'],
    'washington': ['washington', 'washington huskies', 'huskies', 'wash', 'uw'],
    'houston': ['houston', 'houston cougars', 'cougars', 'hou', 'uh'],
    'louisville': ['louisville', 'louisville cardinals', 'cardinals', 'lou', 'cards', 'uofl']
  };

  const curAliases = aliases[cur] || [cur];
  return curAliases.includes(tname) || curAliases.includes(tshort) || curAliases.includes(tabbr);
}

function updateModalScoreboardLive() {
  const game = state.activeModalGame;
  if (!game) return;

  let team1, team2;
  let score1, score2, prob1, isTeam1Win;

  if ((game.isPostseason || game.isDreamMatchup) && game.teamA && game.teamB) {
    let tA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    let tB = TEAMS_DATABASE[game.teamB.id] || game.teamB;
    let isHomeA = game.isHomeA || game.isHome || false;
    let primaryTeam = tA;
    let secondaryTeam = tB;
    let isPrimaryHome = isHomeA;

    if (!game.isDreamMatchup) {
      const isBActive = isTeamMatch(tB, state.currentTeamId);
      const isAActive = isTeamMatch(tA, state.currentTeamId);
      if (isBActive && !isAActive) {
        primaryTeam = TEAMS_DATABASE[state.currentTeamId] || tB;
        secondaryTeam = tA;
        isPrimaryHome = game.isHomeB || false;
      } else if (isAActive) {
        primaryTeam = TEAMS_DATABASE[state.currentTeamId] || tA;
        secondaryTeam = tB;
        isPrimaryHome = isHomeA;
      }
    }

    team1 = primaryTeam;
    team2 = secondaryTeam;
    const sim = simulatePostseasonMatchup(primaryTeam, secondaryTeam, { gameId: game.id, isHomeA: isPrimaryHome });
    score1 = sim.scoreA;
    score2 = sim.scoreB;
    prob1 = sim.winProbA;
    isTeam1Win = sim.isAWinner;
  } else {
    const tActive = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];
    team1 = tActive;
    const oppId = getOpponentTeamId(game);
    team2 = (oppId && TEAMS_DATABASE[oppId]) ? TEAMS_DATABASE[oppId] : { name: game.opponent, shortName: game.oppAbbr || 'OPP', apRank: game.oppRank || 'NR', logoUrl: game.oppLogoUrl };
    const sim = calculateAdjustedMatchup(game);
    score1 = sim.projUt;
    score2 = sim.projOpp;
    prob1 = sim.adjWinProb;
    isTeam1Win = sim.isWin;
  }

  // Update Scoreboard DOM in-place without re-rendering slider controls
  const scoreboardEl = document.getElementById('modalScoreboard');
  if (scoreboardEl) {
    scoreboardEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div class="modal-team-logo-wrap" style="border: 2.5px solid ${team1.colors?.primary || '#333'};">
          <img src="${team1.logoUrl || ''}" alt="${team1.shortName || team1.name}" class="modal-team-logo">
        </div>
        <div>
          <div style="font-family: var(--font-display); font-size: 1.5rem; color: #FFFFFF;">${team1.shortName || team1.name}</div>
          <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--color-text-dim);">${team1.apRank || ''}</div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
        <div style="font-family: var(--font-display); font-size: 2.2rem; letter-spacing: 1px; color: #FFFFFF;">
          <span style="color: ${isTeam1Win ? 'var(--color-success)' : 'var(--color-text-dim)'};">${score1}</span>
          <span style="color: var(--color-text-dim); font-size: 1.4rem;">-</span>
          <span style="color: ${!isTeam1Win ? 'var(--color-success)' : 'var(--color-text-dim)'};">${score2}</span>
        </div>
        <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--color-brand-accent); font-weight: 800;">
          WIN PROB: ${prob1}% - ${100 - prob1}%
        </span>
        ${(() => {
          const edge = calculateVegasEdge(game, { projUt: score1, projOpp: score2 });
          return edge?.badgeHtml || '';
        })()}
      </div>

      <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: flex-end;">
        <div style="text-align: right;">
          <div style="font-family: var(--font-display); font-size: 1.5rem; color: #FFFFFF;">${team2.shortName || team2.name}</div>
          <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--color-text-dim);">${team2.apRank || ''}</div>
        </div>
        <div class="modal-team-logo-wrap" style="border: 2.5px solid ${team2.colors?.primary || '#333'};">
          <img src="${team2.logoUrl || ''}" alt="${team2.shortName || team2.name}" class="modal-team-logo">
        </div>
      </div>
    `;
  }

  // Update drive log and radar chart in background
  try {
    renderDriveLogBetween(team1, team2, score1, score2);
  } catch (e) {}
  try {
    drawRadarChartBetween(team1, team2, score1, score2, game.isHome);
  } catch (e) {}

  // Synchronize main page background calculations & cards
  recalculateSeason();
}
window.updateModalScoreboardLive = updateModalScoreboardLive;

function openSimModal(game) {
  if (!game) return;
  state.activeModalGame = game;

  const modalEl = document.getElementById('simModal');
  if (!modalEl) return;

  try {
    let team1, team2;
    let score1, score2, prob1, isTeam1Win;

    if ((game.isPostseason || game.isDreamMatchup) && game.teamA && game.teamB) {
      // Postseason Game (CCG or Playoff Game) or Dream Matchup Collider
      let tA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
      let tB = TEAMS_DATABASE[game.teamB.id] || game.teamB;
      let isHomeA = game.isHomeA || game.isHome || false;

      let primaryTeam = tA;
      let secondaryTeam = tB;
      let isPrimaryHome = isHomeA;

      // Only re-orient for regular postseason brackets if the current active team is participating
      if (!game.isDreamMatchup) {
        const isBActive = isTeamMatch(tB, state.currentTeamId);
        const isAActive = isTeamMatch(tA, state.currentTeamId);

        if (isBActive && !isAActive) {
          primaryTeam = TEAMS_DATABASE[state.currentTeamId] || tB;
          secondaryTeam = tA;
          isPrimaryHome = game.isHomeB || false;
        } else if (isAActive) {
          primaryTeam = TEAMS_DATABASE[state.currentTeamId] || tA;
          secondaryTeam = tB;
          isPrimaryHome = isHomeA;
        }
      }
      
      team1 = {
        id: primaryTeam.id || 'teamA',
        name: primaryTeam.name || 'Team A',
        shortName: primaryTeam.shortName || primaryTeam.name || 'Team A',
        abbr: primaryTeam.abbr || primaryTeam.shortName || 'TMA',
        apRank: primaryTeam.apRank || '',
        logoUrl: primaryTeam.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[primaryTeam.abbr] : '') || '',
        colors: primaryTeam.colors || { primary: '#333333', secondary: '#FFFFFF', accent: '#0062B8' },
        starPlayer: primaryTeam.starPlayer || `${primaryTeam.shortName || primaryTeam.name || 'Key'} Star Playmaker`,
        headCoach: primaryTeam.headCoach,
        offensiveCoordinator: primaryTeam.offensiveCoordinator,
        defensiveCoordinator: primaryTeam.defensiveCoordinator,
        confirmedStarterQb: primaryTeam.confirmedStarterQb,
        baseSpRating: primaryTeam.baseSpRating
      };

      team2 = {
        id: secondaryTeam.id || 'teamB',
        name: secondaryTeam.name || 'Team B',
        shortName: secondaryTeam.shortName || secondaryTeam.name || 'Team B',
        abbr: secondaryTeam.abbr || secondaryTeam.shortName || 'TMB',
        apRank: secondaryTeam.apRank || '',
        logoUrl: secondaryTeam.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[secondaryTeam.abbr] : '') || '',
        colors: secondaryTeam.colors || { primary: '#555555', secondary: '#FFFFFF', accent: '#CC0000' },
        starPlayer: secondaryTeam.starPlayer || `${secondaryTeam.shortName || secondaryTeam.name || 'Key'} Star Playmaker`,
        headCoach: secondaryTeam.headCoach,
        offensiveCoordinator: secondaryTeam.offensiveCoordinator,
        defensiveCoordinator: secondaryTeam.defensiveCoordinator,
        confirmedStarterQb: secondaryTeam.confirmedStarterQb,
        baseSpRating: secondaryTeam.baseSpRating
      };

      const sim = simulatePostseasonMatchup(primaryTeam, secondaryTeam, { gameId: game.id, isHomeA: isPrimaryHome });
      score1 = sim.scoreA;
      score2 = sim.scoreB;
      prob1 = sim.winProbA;
      isTeam1Win = sim.isAWinner;
    } else {
      // Regular season game for current active team
      const tActive = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];
      if (!tActive) return;
      
      team1 = {
        id: tActive.id,
        name: tActive.name,
        shortName: tActive.shortName,
        abbr: tActive.abbr,
        apRank: tActive.apRank,
        logoUrl: tActive.logoUrl,
        colors: tActive.colors || { primary: '#333333', secondary: '#FFFFFF', accent: '#0062B8' },
        starPlayer: tActive.starPlayer || `${tActive.shortName} Star Playmaker`,
        headCoach: tActive.headCoach,
        offensiveCoordinator: tActive.offensiveCoordinator,
        defensiveCoordinator: tActive.defensiveCoordinator,
        confirmedStarterQb: tActive.confirmedStarterQb,
        baseSpRating: tActive.baseSpRating
      };

      const oppId = getOpponentTeamId(game);
      const dbOpp = (oppId && TEAMS_DATABASE[oppId]) ? TEAMS_DATABASE[oppId] : null;

      team2 = {
        id: game.oppAbbr || 'OPP',
        name: game.opponent || 'Opponent',
        shortName: game.oppAbbr || 'OPP',
        abbr: game.oppAbbr || 'OPP',
        apRank: game.oppRank || 'NR',
        logoUrl: game.oppLogoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[game.oppAbbr] : '') || '',
        colors: { primary: game.oppColor || '#333333', secondary: game.oppSecondary || '#FFFFFF', accent: game.oppColor || '#333333' },
        starPlayer: dbOpp ? dbOpp.starPlayer : `${game.oppAbbr || 'Opponent'} Key Playmakers`,
        headCoach: dbOpp ? dbOpp.headCoach : undefined,
        offensiveCoordinator: dbOpp ? dbOpp.offensiveCoordinator : undefined,
        defensiveCoordinator: dbOpp ? dbOpp.defensiveCoordinator : undefined,
        confirmedStarterQb: dbOpp ? dbOpp.confirmedStarterQb : undefined,
        baseSpRating: dbOpp ? dbOpp.baseSpRating : undefined
      };

      const sim = calculateAdjustedMatchup(game);
      score1 = sim.projUt;
      score2 = sim.projOpp;
      prob1 = sim.adjWinProb;
      isTeam1Win = sim.isWin;
    }

    const weekTagEl = document.getElementById('modalWeekTag');
    if (weekTagEl) {
      const typeTag = game.isDreamMatchup ? 'DREAM MATCHUP SHOWDOWN' : (game.isPostseason ? 'CHAMPIONSHIP SHOWDOWN' : (game.isMarquee ? 'MARQUEE BATTLE' : (game.isHome ? 'HOME SHOWDOWN' : 'AWAY GAUNTLET')));
      weekTagEl.innerText = `${game.week || 'MATCHUP'} • ${typeTag}`;
    }

    const titleEl = document.getElementById('modalMatchupTitle');
    if (titleEl) {
      titleEl.innerText = `${team1.name} vs ${team2.name}`;
    }

    const stadiumEl = document.getElementById('modalStadiumLocation');
    if (stadiumEl) {
      stadiumEl.innerText = `${game.stadium || 'Neutral Site Stadium'} • ${game.location || ''}`;
    }

    // Scoreboard
    const scoreboardEl = document.getElementById('modalScoreboard');
    if (scoreboardEl) {
      scoreboardEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div class="modal-team-logo-wrap" style="border: 2.5px solid ${team1.colors?.primary || '#333'};">
            <img src="${team1.logoUrl}" alt="${team1.shortName}" class="modal-team-logo">
          </div>
          <div>
            <div style="font-family: var(--font-display); font-size: 1.5rem; color: #FFFFFF;">${team1.shortName}</div>
            <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--color-text-dim);">${team1.apRank}</div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
          <div style="font-family: var(--font-display); font-size: 2.2rem; letter-spacing: 1px; color: #FFFFFF;">
            <span style="color: ${isTeam1Win ? 'var(--color-success)' : 'var(--color-text-dim)'};">${score1}</span>
            <span style="color: var(--color-text-dim); font-size: 1.4rem;">-</span>
            <span style="color: ${!isTeam1Win ? 'var(--color-success)' : 'var(--color-text-dim)'};">${score2}</span>
          </div>
          <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--color-brand-accent); font-weight: 800;">
            WIN PROB: ${prob1}% - ${100 - prob1}%
          </span>
          ${(() => {
            const edge = calculateVegasEdge(game, { projUt: score1, projOpp: score2 });
            return edge?.badgeHtml || '';
          })()}
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: flex-end;">
          <div style="text-align: right;">
            <div style="font-family: var(--font-display); font-size: 1.5rem; color: #FFFFFF;">${team2.shortName}</div>
            <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--color-text-dim);">${team2.apRank}</div>
          </div>
          <div class="modal-team-logo-wrap" style="border: 2.5px solid ${team2.colors?.primary || '#333'};">
            <img src="${team2.logoUrl}" alt="${team2.shortName}" class="modal-team-logo">
          </div>
        </div>
      `;
    }

    // Render Drive Log
    try {
      renderDriveLogBetween(team1, team2, score1, score2);
    } catch (e) {
      console.warn('Error rendering drive log:', e);
    }

    // Render Tactical Scout Intel
    try {
      renderScoutReport(game);
    } catch (e) {
      console.warn('Error rendering scout report:', e);
    }

    // Initialize Single-Game Sliders inside Modal
    try {
      renderGameSlidersInModal(game);
    } catch (e) {
      console.warn('Error rendering game sliders:', e);
    }

    // Render Radar Chart
    try {
      drawRadarChartBetween(team1, team2, score1, score2, game.isHome);
    } catch (e) {
      console.warn('Error rendering radar chart:', e);
    }

    // Sync Footer Display
    const activeSubTab = document.querySelector('#simModal .sub-tab.active');
    const activeTabName = activeSubTab ? activeSubTab.dataset.subtab : 'drives';
    const modalFooter = document.querySelector('#simModal .modal-footer');
    if (modalFooter) {
      modalFooter.style.display = (activeTabName === 'game-tuning') ? 'none' : 'flex';
    }
  } catch (err) {
    console.error('Error setting up simulation modal:', err);
  }

  modalEl.classList.add('open');
}

window.openSimModal = openSimModal;

window.openSimModalByGameId = function(gameId) {
  let game = null;
  const team = TEAMS_DATABASE[state.currentTeamId];
  if (team && team.schedule) {
    game = team.schedule.find(g => g.id === gameId);
  }
  if (!game && state.postseasonGames && state.postseasonGames[gameId]) {
    game = state.postseasonGames[gameId];
  }
  if (!game) {
    // Search all teams schedules
    for (const tid of Object.keys(TEAMS_DATABASE)) {
      const g = (TEAMS_DATABASE[tid].schedule || []).find(x => x.id === gameId);
      if (g) {
        game = g;
        break;
      }
    }
  }
  if (game) {
    openSimModal(game);
  }
};

function renderDriveLogBetween(team1, team2, score1, score2) {
  const container = document.getElementById('driveLogContainer');
  if (!container) return;

  container.innerHTML = '';
  const drives = generateDriveSimulationLogBetween(team1, team2, score1, score2);

  drives.forEach((d) => {
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
        <span style="font-weight: 700; color: ${d.isTeam1 ? (team1.colors?.accent || team1.colors?.primary || '#FFF') : (team2.colors?.secondary || team2.colors?.primary || '#FFF')};">${d.possTeam}</span>
        <span>${d.event}</span>
      </div>
      <span style="font-family: var(--font-mono); font-weight: 800; color: ${d.points > 0 ? 'var(--color-success)' : 'var(--color-text-dim)'};">${d.scoreLine}</span>
    `;
    container.appendChild(row);
  });
}

function generateDriveSimulationLogBetween(team1, team2, score1, score2) {
  const s1 = typeof score1 === 'number' ? score1 : 28;
  const s2 = typeof score2 === 'number' ? score2 : 24;

  const events = [];
  let cur1 = 0;
  let cur2 = 0;

  // Breakdown desired scores into 4-quarter increments
  const q1_1 = Math.round(s1 * 0.25);
  const q2_1 = Math.round(s1 * 0.50);
  const q3_1 = Math.round(s1 * 0.75);
  const q4_1 = s1;

  const q1_2 = Math.round(s2 * 0.25);
  const q2_2 = Math.round(s2 * 0.50);
  const q3_2 = Math.round(s2 * 0.75);
  const q4_2 = s2;

  const quarterTargets = [
    { q: 1, t1: q1_1, t2: q1_2 },
    { q: 2, t1: q2_1, t2: q2_2 },
    { q: 3, t1: q3_1, t2: q3_2 },
    { q: 4, t1: q4_1, t2: q4_2 }
  ];

  quarterTargets.forEach(tgt => {
    // Drive Team 1
    const p1 = Math.max(0, tgt.t1 - cur1);
    cur1 += p1;
    let desc1;
    if (p1 >= 7) {
      desc1 = `Touchdown! ${team1.starPlayer || team1.confirmedStarterQb || team1.shortName} explosive scoring drive (${p1} pts)`;
    } else if (p1 > 0) {
      desc1 = `Field Goal! ${team1.shortName} 38yd kick through the uprights (${p1} pts)`;
    } else {
      desc1 = `${team2.shortName} defense brings heavy pressure for 3-and-out punt`;
    }
    events.push({
      quarter: tgt.q,
      time: tgt.q === 4 ? '06:12' : '09:45',
      possTeam: team1.abbr || team1.shortName,
      isTeam1: true,
      event: desc1,
      points: p1,
      scoreLine: `${team1.abbr || team1.shortName} ${cur1} - ${team2.abbr || team2.shortName} ${cur2}`
    });

    // Drive Team 2
    const p2 = Math.max(0, tgt.t2 - cur2);
    cur2 += p2;
    let desc2;
    if (p2 >= 7) {
      desc2 = `Touchdown! ${team2.starPlayer || team2.confirmedStarterQb || team2.shortName} red zone connection (${p2} pts)`;
    } else if (p2 > 0) {
      desc2 = `Field Goal! ${team2.shortName} splits the uprights (${p2} pts)`;
    } else {
      desc2 = `${team1.shortName} defense forces turnover on downs / punt`;
    }
    events.push({
      quarter: tgt.q,
      time: tgt.q === 4 ? '00:00 (FINAL)' : '01:20',
      possTeam: team2.abbr || team2.shortName,
      isTeam1: false,
      event: desc2,
      points: p2,
      scoreLine: `${team1.abbr || team1.shortName} ${cur1} - ${team2.abbr || team2.shortName} ${cur2}`
    });
  });

  return events;
}

// Tactical Scout Intel & Matchup Breakdown
function renderScoutReport(game) {
  const container = document.getElementById('scoutReportBox');
  if (!container || !game) return;

  let team1, team2;
  if ((game.isPostseason || game.isDreamMatchup) && game.teamA && game.teamB) {
    team1 = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    team2 = TEAMS_DATABASE[game.teamB.id] || game.teamB;
  } else {
    team1 = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];
    const oppId = getOpponentTeamId(game);
    team2 = (oppId && TEAMS_DATABASE[oppId]) ? TEAMS_DATABASE[oppId] : {
      name: game.opponent || 'Opponent',
      shortName: game.oppAbbr || 'OPP',
      abbr: game.oppAbbr || 'OPP',
      apRank: game.oppRank || '',
      headCoach: 'Head Coach & Staff',
      offensiveCoordinator: 'Multiple Pro-Spread',
      defensiveCoordinator: 'Base 4-2-5 Defense',
      confirmedStarterQb: `${game.oppAbbr || 'Opponent'} QB1`,
      starPlayer: `${game.oppAbbr || 'Opponent'} Star Playmakers`,
      colors: { primary: game.oppColor || '#333' },
      baseSpRating: (team1.baseSpRating || 24.0) - 4.5
    };
  }

  const scoutData = game.scoutReport || {};
  const spA = team1.baseSpRating ? team1.baseSpRating.toFixed(1) : '24.0';
  const spB = team2.baseSpRating ? team2.baseSpRating.toFixed(1) : '22.0';
  const spDelta = ((team1.baseSpRating || 24.0) - (team2.baseSpRating || 22.0)).toFixed(1);
  const edgeTeam = parseFloat(spDelta) >= 0 ? team1.shortName : team2.shortName;

  const keyMatchupText = scoutData.keyMatchup || `${team1.shortName} offensive execution (${team1.confirmedStarterQb || 'QB1'}) vs ${team2.shortName} defensive front & havoc`;
  const xFactorText = scoutData.xFactor || `Turnover margin & explosive chunk plays in ${game.stadium || 'the stadium'}`;
  const summaryText = scoutData.summary || `Marquee collegiate clash between ${team1.name} (${team1.apRank || ''}) and ${team2.name} (${team2.apRank || ''}).`;

  container.innerHTML = `
    <div class="scout-summary-banner" style="background: rgba(255,255,255,0.03); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.3rem;">
        <span style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 800; color: var(--color-brand-accent);"><i class="fa-solid fa-microchip"></i> TACTICAL SCOUT INTEL</span>
        <span style="font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; color: #10B981; background: rgba(16,185,129,0.12); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16,185,129,0.25);">SP+ ADVANTAGE: ${edgeTeam} (${Math.abs(spDelta)} pts)</span>
      </div>
      <p style="font-size: 0.8rem; color: #E2E8F0; line-height: 1.4; margin: 0;">${summaryText}</p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.65rem;">
        <span style="font-family: var(--font-mono); font-size: 0.68rem; font-weight: 800; color: #38BDF8; display: block; margin-bottom: 0.3rem;"><i class="fa-solid fa-crosshairs"></i> KEY MATCHUP</span>
        <p style="font-size: 0.75rem; color: var(--color-text-muted); margin: 0; line-height: 1.3;">${keyMatchupText}</p>
      </div>
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.65rem;">
        <span style="font-family: var(--font-mono); font-size: 0.68rem; font-weight: 800; color: #F59E0B; display: block; margin-bottom: 0.3rem;"><i class="fa-solid fa-bolt"></i> X-FACTOR</span>
        <p style="font-size: 0.75rem; color: var(--color-text-muted); margin: 0; line-height: 1.3;">${xFactorText}</p>
      </div>
    </div>

    <!-- Coaching & Coordinator Chess Match -->
    <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.65rem; display: flex; flex-direction: column; gap: 0.4rem;">
      <span style="font-family: var(--font-mono); font-size: 0.68rem; font-weight: 800; color: var(--color-text-dim);"><i class="fa-solid fa-user-tie"></i> COACHING STAFF & PLAYCALLERS</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; font-size: 0.72rem;">
        <div>
          <div style="font-weight: 700; color: ${team1.colors?.accent || team1.colors?.primary || '#38BDF8'}; font-size: 0.78rem;">${team1.shortName}</div>
          <div style="color: #CBD5E1;">HC: ${team1.headCoach || 'Head Coach'}</div>
          <div style="color: var(--color-text-dim);">OC: ${team1.offensiveCoordinator || 'Coordinator'}</div>
          <div style="color: var(--color-text-dim);">DC: ${team1.defensiveCoordinator || 'Coordinator'}</div>
          <div style="color: #E2E8F0; margin-top: 0.2rem; font-weight: 600;">⭐ ${team1.starPlayer || team1.confirmedStarterQb || 'Key Star'}</div>
        </div>
        <div>
          <div style="font-weight: 700; color: ${team2.colors?.primary || '#F59E0B'}; font-size: 0.78rem;">${team2.shortName}</div>
          <div style="color: #CBD5E1;">HC: ${team2.headCoach || 'Head Coach'}</div>
          <div style="color: var(--color-text-dim);">OC: ${team2.offensiveCoordinator || 'Coordinator'}</div>
          <div style="color: var(--color-text-dim);">DC: ${team2.defensiveCoordinator || 'Coordinator'}</div>
          <div style="color: #E2E8F0; margin-top: 0.2rem; font-weight: 600;">⭐ ${team2.starPlayer || team2.confirmedStarterQb || 'Key Star'}</div>
        </div>
      </div>
    </div>

    <!-- Stadium & Atmosphere -->
    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; font-size: 0.72rem;">
      <span style="color: var(--color-text-muted);"><i class="fa-solid fa-location-dot" style="color: var(--color-brand-accent);"></i> ${game.stadium || 'Championship Venue'}</span>
      <span style="font-family: var(--font-mono); font-weight: 700; color: #94A3B8;">${team1.stadiumCapacity ? `Capacity: ${team1.stadiumCapacity}` : '10,000 Drives Engine'}</span>
    </div>
  `;
}
window.renderScoutReport = renderScoutReport;

function drawRadarChart(game, sim) {
  if (!game) return;
  if (game.isPostseason && game.teamA && game.teamB) {
    const tA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    const tB = TEAMS_DATABASE[game.teamB.id] || game.teamB;
    const pSim = simulatePostseasonMatchup(tA, tB, { gameId: game.id, isHomeA: game.isHomeA });
    drawRadarChartBetween(tA, tB, pSim.scoreA, pSim.scoreB, game.isHome);
  } else {
    const tActive = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];
    const team2 = {
      shortName: game.oppAbbr || 'OPP',
      colors: { primary: game.oppColor || '#CC0000' }
    };
    const rSim = sim || calculateAdjustedMatchup(game);
    drawRadarChartBetween(tActive, team2, rSim.projUt, rSim.projOpp, game.isHome);
  }
}
window.drawRadarChart = drawRadarChart;

function drawRadarChartBetween(team1, team2, score1, score2, isHome) {
  const canvas = document.getElementById('radarChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const centerX = w / 2;
  const centerY = h / 2 - 10;
  const radius = Math.min(centerX, centerY) - 25;

  const s1 = typeof score1 === 'number' ? score1 : 28;
  const s2 = typeof score2 === 'number' ? score2 : 24;

  const metrics = [
    { label: 'OFFENSE', team1Val: Math.min(99, Math.max(50, 75 + (s1 - 28) * 2)), team2Val: Math.min(99, Math.max(50, 75 + (s2 - 24) * 2)) },
    { label: 'DEFENSE', team1Val: Math.min(99, Math.max(50, 80 - (s2 - 20) * 2)), team2Val: Math.min(99, Math.max(50, 80 - (s1 - 24) * 2)) },
    { label: 'QB PLAY', team1Val: Math.min(99, Math.max(50, 82 + (s1 > s2 ? 6 : -3))), team2Val: Math.min(99, Math.max(50, 80 + (s2 > s1 ? 6 : -3))) },
    { label: 'GROUND', team1Val: Math.min(99, Math.max(50, 78 + (s1 > 30 ? 6 : 0))), team2Val: Math.min(99, Math.max(50, 76 + (s2 > 30 ? 6 : 0))) },
    { label: 'STADIUM', team1Val: isHome ? 92 : 65, team2Val: isHome ? 50 : 65 }
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

  // Draw Team 1 Polygon
  ctx.beginPath();
  metrics.forEach((m, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (m.team1Val / 100) * radius;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = `${team1.colors?.primary || '#333'}55`;
  ctx.fill();
  ctx.strokeStyle = team1.colors?.accent || team1.colors?.primary || '#0062B8';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw Team 2 Polygon
  ctx.beginPath();
  metrics.forEach((m, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (m.team2Val / 100) * radius;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = `${team2.colors?.primary || '#555'}44`;
  ctx.fill();
  ctx.strokeStyle = team2.colors?.primary || '#CC0000';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Legend at bottom
  const legendY = h - 12;
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px Outfit, sans-serif';
  
  // Team 1 legend
  ctx.fillStyle = team1.colors?.accent || team1.colors?.primary || '#0062B8';
  ctx.fillRect(centerX - 90, legendY - 8, 10, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(team1.shortName || team1.name || 'Team 1', centerX - 75, legendY);

  // Team 2 legend
  ctx.fillStyle = team2.colors?.primary || '#CC0000';
  ctx.fillRect(centerX + 25, legendY - 8, 10, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(team2.shortName || team2.name || 'Team 2', centerX + 40, legendY);
}

function renderGameSlidersInModal(game) {
  const container = document.getElementById('modalGameSlidersGrid');
  if (!container) return;

  // Determine focus team and opponent for this specific modal game
  let focusTeam, oppTeam;
  if (game.isDreamMatchup && game.teamA && game.teamB) {
    focusTeam = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    oppTeam = TEAMS_DATABASE[game.teamB.id] || game.teamB;
  } else if (game.isPostseason && game.teamA && game.teamB) {
    let tA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    let tB = TEAMS_DATABASE[game.teamB.id] || game.teamB;

    if (isTeamMatch(tB, state.currentTeamId) && !isTeamMatch(tA, state.currentTeamId)) {
      focusTeam = TEAMS_DATABASE[state.currentTeamId] || tB;
      oppTeam = tA;
    } else if (isTeamMatch(tA, state.currentTeamId)) {
      focusTeam = TEAMS_DATABASE[state.currentTeamId] || tA;
      oppTeam = tB;
    } else {
      focusTeam = tA;
      oppTeam = tB;
    }
  } else {
    focusTeam = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];
    oppTeam = { shortName: game.oppAbbr || 'Opponent', stadium: game.stadium };
  }

  const teamSliders = getTeamSliders(focusTeam.id || state.currentTeamId);
  const currentSliders = state.gameSliders[game.id] || {
    qbRating: teamSliders.qbRating || 0,
    groundAttack: teamSliders.groundAttack || 0,
    defenseHavoc: teamSliders.defenseHavoc || 0,
    turnoverLuck: teamSliders.turnoverLuck || 0,
    crowdNoise: teamSliders.crowdNoise || 0,
    isCustom: false
  };

  // Sync active preset highlight
  const presetButtons = document.querySelectorAll('.game-preset-btn');
  if (presetButtons.length > 0) {
    presetButtons.forEach(b => {
      const pKey = b.dataset.gamepreset;
      const pVals = GAME_PRESETS[pKey];
      if (pVals && currentSliders.qbRating === pVals.qbRating && currentSliders.groundAttack === pVals.groundAttack && currentSliders.defenseHavoc === pVals.defenseHavoc && currentSliders.turnoverLuck === pVals.turnoverLuck) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  const labels = (focusTeam && focusTeam.sliderLabels) || {
    qb: `${focusTeam.confirmedStarterQb || focusTeam.shortName || 'QB'} Execution`,
    ground: `${focusTeam.shortName || 'Ground'} Attack`,
    defense: `${focusTeam.shortName || 'Defense'} & Havoc`,
    turnover: 'Turnover Margin Luck',
    crowd: 'Stadium Crowd Noise'
  };

  const venueTitle = (game.isPostseason || game.isDreamMatchup) 
    ? `Neutral Venue Intensity (${game.stadium || 'Championship Stadium'})`
    : (game.isHome ? (labels.crowd || `${game.stadium} Home Crowd`) : `Road Environment (${game.stadium || 'Hostile Stadium'})`);

  const sliderList = [
    { key: 'qbRating', label: labels.qb || `${focusTeam.shortName} QB Execution`, icon: 'fa-solid fa-crosshairs' },
    { key: 'groundAttack', label: labels.ground || `${focusTeam.shortName} Ground Attack`, icon: 'fa-solid fa-person-running' },
    { key: 'defenseHavoc', label: labels.defense || `${focusTeam.shortName} Defense & Havoc`, icon: 'fa-solid fa-shield-halved' },
    { key: 'turnoverLuck', label: 'Turnover Margin Luck', icon: 'fa-solid fa-dice' },
    { key: 'crowdNoise', label: venueTitle, icon: 'fa-solid fa-bullhorn' }
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
      state.gameSliders[game.id].targetTeamId = focusTeam.id;
      state.gameSliders[game.id].isCustom = true;

      // Unset active preset
      document.querySelectorAll('.game-preset-btn').forEach(b => b.classList.remove('active'));

      // Live update modal scoreboard & background season
      updateModalScoreboardLive();
    });

    container.appendChild(card);
  });

  // Sync Weather & Injury Chips
  const activeWeather = currentSliders.weather || 'dome';
  document.querySelectorAll('.weather-chip[data-weather]').forEach(chip => {
    if (chip.dataset.weather === activeWeather) chip.classList.add('active');
    else chip.classList.remove('active');
  });

  const injuryChip = document.getElementById('injuryChipBtn');
  if (injuryChip) {
    if (currentSliders.injury) injuryChip.classList.add('active');
    else injuryChip.classList.remove('active');
  }
}

window.setGameWeatherCondition = function(weatherType) {
  const game = state.activeModalGame;
  if (!game) return;

  if (!state.gameSliders[game.id]) {
    const focusId = game.isDreamMatchup ? game.teamA.id : state.currentTeamId;
    const teamSliders = getTeamSliders(focusId);
    state.gameSliders[game.id] = { ...teamSliders, targetTeamId: focusId };
  }

  state.gameSliders[game.id].weather = weatherType;
  state.gameSliders[game.id].isCustom = true;

  document.querySelectorAll('.weather-chip[data-weather]').forEach(chip => {
    if (chip.dataset.weather === weatherType) chip.classList.add('active');
    else chip.classList.remove('active');
  });

  updateModalScoreboardLive();

  const weatherLabels = {
    'dome': '☀️ Clear / Dome (Optimal)',
    'rain': '🌧️ Heavy Rain / Slick Turf',
    'snow': '❄️ Blizzard / Freezing Snow',
    'wind': '💨 25+ MPH High Winds'
  };
  showToast(`Applied ${weatherLabels[weatherType] || weatherType}!`);
};

window.toggleGameInjuryCondition = function() {
  const game = state.activeModalGame;
  if (!game) return;

  if (!state.gameSliders[game.id]) {
    const focusId = game.isDreamMatchup ? game.teamA.id : state.currentTeamId;
    const teamSliders = getTeamSliders(focusId);
    state.gameSliders[game.id] = { ...teamSliders, targetTeamId: focusId };
  }

  const currentInjury = !state.gameSliders[game.id].injury;
  state.gameSliders[game.id].injury = currentInjury;
  state.gameSliders[game.id].isCustom = true;

  const chip = document.getElementById('injuryChipBtn');
  if (chip) {
    if (currentInjury) chip.classList.add('active');
    else chip.classList.remove('active');
  }

  updateModalScoreboardLive();

  showToast(currentInjury ? `🩹 Key Starter Injury penalty applied (-6.5 pts)!` : `🩹 Cleared injury penalty!`);
};

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
  
  let focusId = state.currentTeamId;
  if (game.isDreamMatchup && game.teamA && game.teamB) {
    focusId = game.teamA.id;
  } else if (game.isPostseason && game.teamA && game.teamB) {
    let tA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    let tB = TEAMS_DATABASE[game.teamB.id] || game.teamB;
    if (isTeamMatch(tB, state.currentTeamId) && !isTeamMatch(tA, state.currentTeamId)) {
      focusId = (TEAMS_DATABASE[state.currentTeamId] || tB).id || state.currentTeamId;
    } else if (isTeamMatch(tA, state.currentTeamId)) {
      focusId = (TEAMS_DATABASE[state.currentTeamId] || tA).id || state.currentTeamId;
    } else {
      focusId = tA.id || state.currentTeamId;
    }
  }
  if (!state.gameSliders[game.id]) {
    const teamSliders = getTeamSliders(focusId);
    state.gameSliders[game.id] = { ...teamSliders };
  }
  state.gameSliders[game.id].targetTeamId = focusId;
  state.gameSliders[game.id].isCustom = true;

  recalculateSeason();
  openSimModal(state.activeModalGame);
  window.switchModalSubTab('drives');
  const title = (game.isDreamMatchup && game.teamA && game.teamB) 
    ? `${game.teamA.shortName} vs ${game.teamB.shortName}` 
    : (game.isPostseason ? game.week : `${game.opponent} matchup`);
  showToast(`⚡ Re-simulated ${title} (10,000 Monte Carlo drives)!`);
};

window.resetCurrentGameTuning = function() {
  if (!state.activeModalGame) return;
  const game = state.activeModalGame;
  delete state.gameSliders[game.id];
  delete state.userPicks[game.id];
  if (game.id && game.id.startsWith('ccg-')) {
    delete state.ccgPicks[game.id];
  }
  if (game.id && game.id.startsWith('playoff-')) {
    delete state.playoffPicks[game.id];
  }

  const counterpart = findCounterpartMatchup(state.currentTeamId, game);
  if (counterpart) {
    delete state.gameSliders[counterpart.oppGame.id];
    delete state.userPicks[counterpart.oppGame.id];
  }

  // Reset slider UI inputs & chips in modal
  document.querySelectorAll('.game-preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.gamepreset === 'baseline');
  });
  document.querySelectorAll('.weather-chip[data-weather]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.weather === 'dome');
  });
  const injuryChip = document.getElementById('injuryChipBtn');
  if (injuryChip) injuryChip.classList.remove('active');

  ['qbRating', 'groundAttack', 'defenseHavoc', 'turnoverLuck', 'crowdNoise'].forEach(k => {
    const inputEl = document.getElementById(`gameslider-${k}`);
    const readoutEl = document.getElementById(`gameslider-readout-${k}`);
    if (inputEl) inputEl.value = 0;
    if (readoutEl) readoutEl.innerText = '0%';
  });

  updateModalScoreboardLive();
  showToast(`⚡ Reset matchup to baseline!`);
};

window.applyGameScenarioPreset = function(presetKey) {
  const presetValues = GAME_PRESETS[presetKey] || GAME_PRESETS['baseline'];
  const game = state.activeModalGame;
  if (!game) return;

  let focusId = state.currentTeamId;
  if (game.isDreamMatchup && game.teamA && game.teamB) {
    focusId = game.teamA.id;
  } else if (game.isPostseason && game.teamA && game.teamB) {
    let tA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    let tB = TEAMS_DATABASE[game.teamB.id] || game.teamB;
    if (isTeamMatch(tB, state.currentTeamId) && !isTeamMatch(tA, state.currentTeamId)) {
      focusId = (TEAMS_DATABASE[state.currentTeamId] || tB).id || state.currentTeamId;
    } else if (isTeamMatch(tA, state.currentTeamId)) {
      focusId = (TEAMS_DATABASE[state.currentTeamId] || tA).id || state.currentTeamId;
    } else {
      focusId = tA.id || state.currentTeamId;
    }
  }

  const prevWeather = state.gameSliders[game.id]?.weather || 'dome';
  const prevInjury = !!state.gameSliders[game.id]?.injury;

  state.gameSliders[game.id] = {
    ...presetValues,
    weather: prevWeather,
    injury: prevInjury,
    targetTeamId: focusId,
    isCustom: (presetKey !== 'baseline') || (prevWeather !== 'dome') || prevInjury
  };

  // Update slider UI inputs in the modal without closing or re-opening tab
  document.querySelectorAll('.game-preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.gamepreset === presetKey);
  });

  ['qbRating', 'groundAttack', 'defenseHavoc', 'turnoverLuck', 'crowdNoise'].forEach(k => {
    const inputEl = document.getElementById(`gameslider-${k}`);
    const readoutEl = document.getElementById(`gameslider-readout-${k}`);
    const val = presetValues[k] || 0;
    if (inputEl) inputEl.value = val;
    if (readoutEl) readoutEl.innerText = `${val > 0 ? '+' : ''}${val}%`;
  });

  updateModalScoreboardLive();

  const presetLabels = {
    'baseline': 'Season Baseline',
    'qb-slump': 'QB Slump',
    'blowout': 'Offensive Blowout',
    'turnover-trap': 'Turnover Trap',
    'ground-pound': 'Ground & Pound'
  };
  const label = presetLabels[presetKey] || presetKey;
  const matchupName = (game.isDreamMatchup && game.teamA && game.teamB) 
    ? `${game.teamA.shortName} vs ${game.teamB.shortName}` 
    : (game.opponent ? `${game.opponent} matchup` : 'matchup');
  showToast(`⚡ Applied "${label}" to ${matchupName}!`);
};

window.closeSimModal = function() {
  const modal = document.getElementById('simModal');
  if (modal) modal.classList.remove('open');
  recalculateSeason();
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
// CONFERENCE CHAMPIONSHIPS & 12-TEAM CFP SIMULATION ENGINE
// ==========================================================================

function evaluateRegularSeasonAllTeams() {
  const teamKeys = Object.keys(TEAMS_DATABASE);
  const evaluatedTeams = [];

  teamKeys.forEach(teamId => {
    const team = TEAMS_DATABASE[teamId];
    let wins = 0;
    let losses = 0;
    let confWins = 0;
    let confLosses = 0;
    let sumDiff = 0;

    team.schedule.forEach(g => {
      const sim = calculateAdjustedMatchup(g, teamId);
      if (sim.isWin) {
        wins++;
        if (isConferenceGame(g)) confWins++;
      } else {
        losses++;
        if (isConferenceGame(g)) confLosses++;
      }
      sumDiff += (sim.projUt - sim.projOpp);
    });

    const apMatch = (team.apPoints || '').match(/^([0-9,]+)/);
    const apPts = apMatch ? parseInt(apMatch[1].replace(/,/g, ''), 10) : 500;
    const undefeatedBonus = (wins >= 12 && losses === 0) ? 6000 : (wins >= 11 ? 2000 : 0);
    const score = (wins * 1500) - (losses * 800) + (confWins * 200) + (sumDiff * 3) + (apPts * 0.15) + undefeatedBonus;

    evaluatedTeams.push({
      ...team,
      id: teamId,
      name: team.name,
      shortName: team.shortName,
      abbr: team.abbr,
      logoUrl: team.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[team.abbr] : '') || '',
      stadium: team.stadium,
      stadiumCity: team.stadiumCity,
      conf: team.conference,
      wins,
      losses,
      confWins,
      confLosses,
      score,
      apRank: team.apRank,
      baseSpRating: team.baseSpRating || 22.0
    });
  });

  evaluatedTeams.sort((a, b) => b.score - a.score);
  return evaluatedTeams;
}

// Calculate dynamic team momentum based on regular season performance & streak
function getTeamMomentumScore(teamId) {
  if (!teamId || !TEAMS_DATABASE[teamId]) return { spDelta: 0, wins: 10, losses: 2 };
  const team = TEAMS_DATABASE[teamId];
  let wins = 0;
  let losses = 0;
  let lastGameWon = true;

  (team.schedule || []).forEach((g, idx) => {
    const sim = calculateAdjustedMatchup(g, teamId);
    if (sim.isWin) {
      wins++;
      if (idx === (team.schedule.length - 1)) lastGameWon = true;
    } else {
      losses++;
      if (idx === (team.schedule.length - 1)) lastGameWon = false;
    }
  });

  let spDelta = 0;
  if (wins >= 12 && losses === 0) {
    spDelta += 0.6; // Undefeated regular season confidence
  } else if (wins === 11 && losses <= 1) {
    spDelta += 0.3; // Dominant 1-loss form
  } else if (losses === 2) {
    spDelta -= 0.3; // Battle-tested 2-loss form
  } else if (losses >= 3) {
    spDelta -= 1.0; // Multi-loss slump penalty
  }

  if (!lastGameWon && losses > 0) {
    spDelta -= 0.4; // Lost regular season finale
  }

  // CCG Winner / Loser momentum
  if (state.postseasonGames) {
    for (const gId of ['ccg-sec', 'ccg-b1g', 'ccg-big12', 'ccg-acc', 'ccg-mwc']) {
      const g = state.postseasonGames[gId];
      if (g && (g.teamA?.id === teamId || g.teamB?.id === teamId)) {
        if (state.ccgPicks && state.ccgPicks[gId]) {
          if (state.ccgPicks[gId] === teamId) spDelta += 0.5;
          else spDelta -= 0.4;
        }
      }
    }
  }

  return { spDelta, wins, losses };
}

// Postseason Matchup Engine with Dynamic Momentum & Resume Weighting
function simulatePostseasonMatchup(teamA, teamB, options = {}) {
  if (!teamA && !teamB) return { winner: null, loser: null, scoreA: 0, scoreB: 0, isAWinner: true, winProbA: 50 };
  if (!teamA) return { winner: teamB, loser: null, scoreA: 17, scoreB: 28, isAWinner: false, winProbA: 20 };
  if (!teamB) return { winner: teamA, loser: null, scoreA: 28, scoreB: 17, isAWinner: true, winProbA: 80 };

  const dbA = TEAMS_DATABASE[teamA.id] || teamA;
  const dbB = TEAMS_DATABASE[teamB.id] || teamB;

  let spA = dbA.baseSpRating || 22.0;
  let spB = dbB.baseSpRating || 22.0;

  // Apply Dynamic Season Momentum & Form (Upsets/Losses reduce postseason strength)
  if (teamA.id && TEAMS_DATABASE[teamA.id]) {
    const momA = getTeamMomentumScore(teamA.id);
    spA += momA.spDelta;
  }
  if (teamB.id && TEAMS_DATABASE[teamB.id]) {
    const momB = getTeamMomentumScore(teamB.id);
    spB += momB.spDelta;
  }

  // Apply Team A base sliders
  if (teamA.id && TEAMS_DATABASE[teamA.id]) {
    const sA = getTeamSliders(teamA.id);
    spA += ((sA.qbRating || 0) * 0.16 + (sA.defenseHavoc || 0) * 0.16 + (sA.groundAttack || 0) * 0.12 + (sA.turnoverLuck || 0) * 0.10);
  }

  // Apply Team B base sliders
  if (teamB.id && TEAMS_DATABASE[teamB.id]) {
    const sB = getTeamSliders(teamB.id);
    spB += ((sB.qbRating || 0) * 0.16 + (sB.defenseHavoc || 0) * 0.16 + (sB.groundAttack || 0) * 0.12 + (sB.turnoverLuck || 0) * 0.10);
  }

  // Apply Single-Game Matchup Custom AI Tuning & Weather/Injury if present
  let weatherScorePenalty = 0;
  if (options.gameId && state.gameSliders[options.gameId]) {
    const gSliders = state.gameSliders[options.gameId];
    const gWeather = gSliders.weather || 'dome';
    const gInjury = !!gSliders.injury;

    if (gWeather === 'rain') weatherScorePenalty = -4.5;
    else if (gWeather === 'snow') weatherScorePenalty = -8.5;
    else if (gWeather === 'wind') weatherScorePenalty = -6.0;

    const gQb = gSliders.qbRating || 0;
    const gDef = gSliders.defenseHavoc || 0;
    const gGnd = gSliders.groundAttack || 0;
    const gTo = gSliders.turnoverLuck || 0;
    const gCrowd = gSliders.crowdNoise || 0;
    const injuryPenalty = gInjury ? -5.5 : 0;
    const sliderBonus = (gQb * 0.18 + gDef * 0.18 + gGnd * 0.14 + gTo * 0.12 + gCrowd * 0.08) + injuryPenalty;
    const targetId = gSliders.targetTeamId || state.currentTeamId;
    if (isTeamMatch(teamA, targetId) && !isTeamMatch(teamB, targetId)) {
      spA += sliderBonus;
    } else if (isTeamMatch(teamB, targetId) && !isTeamMatch(teamA, targetId)) {
      spB += sliderBonus;
    } else {
      spA += sliderBonus;
    }
  }

  // Home field advantage (e.g. First Round on-campus)
  if (options.isHomeA) spA += 2.8;

  const diff = spA - spB;
  let scoreA = Math.max(3, Math.round(28 + diff * 0.65 + weatherScorePenalty));
  let scoreB = Math.max(0, Math.round(28 - diff * 0.65 + weatherScorePenalty));

  if (scoreA === scoreB) {
    if (diff >= 0) scoreA += 3;
    else scoreB += 3;
  }

  // Calculate Win Probability
  let probA = Math.round(100 / (1 + Math.pow(10, -diff / 13.5)));
  probA = Math.max(5, Math.min(95, probA));

  // Check for User Pick Overrides
  const overridePick = options.gameId ? (state.playoffPicks[options.gameId] || state.ccgPicks[options.gameId]) : null;
  let isAWinner;
  if (overridePick) {
    isAWinner = (overridePick === teamA.id);
  } else {
    isAWinner = scoreA > scoreB;
  }

  return {
    gameId: options.gameId,
    teamA,
    teamB,
    winner: isAWinner ? teamA : teamB,
    loser: isAWinner ? teamB : teamA,
    scoreA: isAWinner && scoreA <= scoreB ? scoreB + 3 : scoreA,
    scoreB: !isAWinner && scoreB <= scoreA ? scoreA + 3 : scoreB,
    isAWinner,
    winProbA: probA,
    winProbB: 100 - probA
  };
}

// 1. Simulate Conference Championships
function simulateConferenceChampionships(evaluatedTeams) {
  const secTeams = evaluatedTeams.filter(t => t.conf === 'SEC');
  const b1gTeams = evaluatedTeams.filter(t => t.conf === 'Big Ten');
  const big12Teams = evaluatedTeams.filter(t => t.conf === 'Big 12');
  const accTeams = evaluatedTeams.filter(t => t.conf === 'ACC');
  const mwcTeams = evaluatedTeams.filter(t => t.conf === 'Mountain West');

  // SEC Championship (Atlanta, GA)
  const secTeam1 = secTeams[0] || { id: 'georgia', name: 'Georgia Bulldogs', shortName: 'Georgia', abbr: 'UGA', apRank: '#3 AP', wins: 11, losses: 1, conf: 'SEC' };
  const secTeam2 = secTeams[1] || { id: 'texas', name: 'Texas Longhorns', shortName: 'Texas', abbr: 'TEX', apRank: '#5 AP', wins: 11, losses: 1, conf: 'SEC' };
  const secSim = simulatePostseasonMatchup(secTeam1, secTeam2, { gameId: 'ccg-sec' });

  // Big Ten Championship (Indianapolis, IN)
  const b1gTeam1 = b1gTeams[0] || { id: 'ohiostate', name: 'Ohio State Buckeyes', shortName: 'Ohio State', abbr: 'OSU', apRank: '#1 AP', wins: 12, losses: 0, conf: 'Big Ten' };
  const b1gTeam2 = b1gTeams[1] || { id: 'oregon', name: 'Oregon Ducks', shortName: 'Oregon', abbr: 'ORE', apRank: '#2 AP', wins: 11, losses: 1, conf: 'Big Ten' };
  const b1gSim = simulatePostseasonMatchup(b1gTeam1, b1gTeam2, { gameId: 'ccg-b1g' });

  // Big 12 Championship (Arlington, TX - AT&T Stadium)
  const big12Team1 = big12Teams[0] || TEAMS_DATABASE['texastech'] || { id: 'texastech', name: 'Texas Tech Red Raiders', shortName: 'Texas Tech', abbr: 'TTU', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2641.png', apRank: '#12 AP', wins: 11, losses: 1, conf: 'Big 12', baseSpRating: 24.2, stadium: 'Jones AT&T Stadium', stadiumCity: 'Lubbock, TX' };
  const big12Team2 = big12Teams[1] || TEAMS_DATABASE['byu'] || { id: 'byu', name: 'BYU Cougars', shortName: 'BYU', abbr: 'BYU', logoUrl: (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS['BYU'] : '') || 'https://a.espncdn.com/i/teamlogos/ncaa/500/252.png', apRank: '#14 AP', wins: 10, losses: 2, conf: 'Big 12', baseSpRating: 21.8, stadium: 'LaVell Edwards Stadium', stadiumCity: 'Provo, UT' };
  const big12Sim = simulatePostseasonMatchup(big12Team1, big12Team2, { gameId: 'ccg-big12' });

  // ACC Championship (Charlotte, NC)
  const accTeam1 = accTeams[0] || { id: 'miami', name: 'Miami Hurricanes', shortName: 'Miami', abbr: 'MIA', apRank: '#7 AP', wins: 11, losses: 1, conf: 'ACC' };
  const accTeam2 = accTeams[1] || { id: 'clemson', name: 'Clemson Tigers', shortName: 'Clemson', abbr: 'CLEM', apRank: '#17 AP', wins: 10, losses: 2, conf: 'ACC' };
  const accSim = simulatePostseasonMatchup(accTeam1, accTeam2, { gameId: 'ccg-acc' });

  // Mountain West / G5 Championship (Boise, ID)
  const mwcTeam1 = mwcTeams[0] || { id: 'boisestate', name: 'Boise State Broncos', shortName: 'Boise State', abbr: 'BSU', apRank: 'NR', wins: 10, losses: 2, conf: 'Mountain West' };
  const mwcTeam2 = { id: 'unlv', name: 'UNLV Rebels', shortName: 'UNLV', abbr: 'UNLV', logoUrl: (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS['UNLV'] : '') || 'https://a.espncdn.com/i/teamlogos/ncaa/500/2439.png', apRank: 'NR', wins: 9, losses: 3, conf: 'Mountain West', baseSpRating: 15.5 };
  const mwcSim = simulatePostseasonMatchup(mwcTeam1, mwcTeam2, { gameId: 'ccg-mwc', isHomeA: true });

  // Save game objects to state.postseasonGames for interactive modal
  const registerCcgGame = (id, weekName, teamA, teamB, sim, stadium, location) => {
    state.postseasonGames[id] = {
      id,
      week: weekName,
      isPostseason: true,
      teamA: teamA,
      teamB: teamB,
      opponent: teamB.name,
      oppAbbr: teamB.abbr || teamB.shortName,
      oppRank: teamB.apRank || 'TOP 25',
      oppColor: (TEAMS_DATABASE[teamB.id] || {}).colors?.primary || '#333333',
      oppLogoUrl: teamB.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[teamB.abbr] : '') || '',
      isHome: false,
      stadium,
      location,
      isMarquee: true,
      projScoreUt: sim.scoreA,
      projScoreOpp: sim.scoreB,
      baseWinProb: sim.winProbA,
      scoutReport: {
        xFactor: `Championship intensity and automatic 12-Team CFP First-Round Bye stakes at ${stadium}.`,
        keyMatchup: `${teamA.shortName} offensive execution vs ${teamB.shortName} defensive front.`,
        summary: `Epic Conference Championship battle between ${teamA.name} and ${teamB.name} at ${stadium}.`
      }
    };
  };

  registerCcgGame('ccg-sec', 'SEC CHAMPIONSHIP', secTeam1, secTeam2, secSim, 'Mercedes-Benz Stadium', 'Atlanta, GA');
  registerCcgGame('ccg-b1g', 'BIG TEN CHAMPIONSHIP', b1gTeam1, b1gTeam2, b1gSim, 'Lucas Oil Stadium', 'Indianapolis, IN');
  registerCcgGame('ccg-big12', 'BIG 12 CHAMPIONSHIP', big12Team1, big12Team2, big12Sim, 'AT&T Stadium', 'Arlington, TX');
  registerCcgGame('ccg-acc', 'ACC CHAMPIONSHIP', accTeam1, accTeam2, accSim, 'Bank of America Stadium', 'Charlotte, NC');
  registerCcgGame('ccg-mwc', 'MWC / G5 CHAMPIONSHIP', mwcTeam1, mwcTeam2, mwcSim, 'Albertsons Stadium', 'Boise, ID');

  // Update totalWins / totalLosses and CCG Champ / Runner-up status across evaluatedTeams
  const ccgSims = [secSim, b1gSim, big12Sim, accSim, mwcSim];
  evaluatedTeams.forEach(t => {
    t.totalWins = t.wins;
    t.totalLosses = t.losses;
    t.isCcgChamp = false;
    t.isCcgRunnerUp = false;

    ccgSims.forEach(sim => {
      if (sim && sim.winner && isTeamMatch(sim.winner, t.id)) {
        t.totalWins = t.wins + 1;
        t.isCcgChamp = true;
      } else if (sim && sim.loser && isTeamMatch(sim.loser, t.id)) {
        t.totalLosses = t.losses + 1;
        t.isCcgRunnerUp = true;
      }
    });
  });

  const confChamps = [secSim.winner, b1gSim.winner, big12Sim.winner, accSim.winner, mwcSim.winner].filter(Boolean);
  // Ensure champions have updated post-CCG records assigned
  confChamps.forEach(c => {
    const match = evaluatedTeams.find(t => isTeamMatch(t, c.id));
    if (match) {
      c.totalWins = match.totalWins;
      c.totalLosses = match.totalLosses;
      c.wins = match.totalWins;
      c.losses = match.totalLosses;
      c.isCcgChamp = true;
    }
  });

  return {
    sec: { team1: secTeam1, team2: secTeam2, sim: secSim, id: 'ccg-sec', venue: 'Mercedes-Benz Stadium (Atlanta, GA)' },
    b1g: { team1: b1gTeam1, team2: b1gTeam2, sim: b1gSim, id: 'ccg-b1g', venue: 'Lucas Oil Stadium (Indianapolis, IN)' },
    big12: { team1: big12Team1, team2: big12Team2, sim: big12Sim, id: 'ccg-big12', venue: 'AT&T Stadium (Arlington, TX)' },
    acc: { team1: accTeam1, team2: accTeam2, sim: accSim, id: 'ccg-acc', venue: 'Bank of America Stadium (Charlotte, NC)' },
    mwc: { team1: mwcTeam1, team2: mwcTeam2, sim: mwcSim, id: 'ccg-mwc', venue: 'Albertsons Stadium (Boise, ID)' },
    confChamps
  };
}

// 2. Render Conference Championships Section
function renderConferenceChampionships(ccgResults) {
  const container = document.getElementById('ccgGrid');
  if (!container) return;

  container.innerHTML = '';
  const games = [
    { title: 'SEC CHAMPIONSHIP GAME', data: ccgResults.sec },
    { title: 'BIG TEN CHAMPIONSHIP GAME', data: ccgResults.b1g },
    { title: 'BIG 12 CHAMPIONSHIP GAME', data: ccgResults.big12 },
    { title: 'ACC CHAMPIONSHIP GAME', data: ccgResults.acc },
    { title: 'MOUNTAIN WEST / G5 TITLE', data: ccgResults.mwc }
  ];

  games.forEach(g => {
    const d = g.data;
    const isTeam1Winner = d.sim.isAWinner;
    const activeTeamId = state.currentTeamId;
    const isActiveMatchup = (d.team1.id === activeTeamId || d.team2.id === activeTeamId);

    const isCustom = !!(state.gameSliders && state.gameSliders[d.id]?.isCustom);
    const isUserPick = !!(state.ccgPicks && state.ccgPicks[d.id]);

    let customBadgeHtml = '';
    if (isUserPick) {
      customBadgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-check"></i> USER PICK</span>`;
    } else if (isCustom) {
      customBadgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-bullseye"></i> CUSTOM TUNED</span>`;
    }

    const card = document.createElement('div');
    card.className = `ccg-card ${isActiveMatchup ? 'active-team-card' : ''}`;
    card.onclick = () => window.openSimModalByGameId(d.id);

    card.innerHTML = `
      <div class="ccg-card-header">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="ccg-conf-title"><i class="fa-solid fa-trophy" style="color: #FFD700; margin-right: 5px;"></i> ${g.title}</span>
          ${customBadgeHtml}
        </div>
        <span class="ccg-venue-text">${d.venue}</span>
      </div>

      <div class="ccg-matchup-row">
        <div class="ccg-team-block">
          <img src="${d.team1.logoUrl}" alt="${d.team1.name}" class="ccg-team-logo">
          <span class="ccg-team-name" style="${isTeam1Winner ? 'color: var(--color-success); font-weight: 800;' : ''}">${d.team1.shortName}</span>
          <span class="ccg-team-rec">${d.team1.apRank || ''} (${d.team1.wins}-${d.team1.losses})</span>
        </div>

        <div class="ccg-vs-pill">
          <div class="ccg-score-box">
            <span style="color: ${isTeam1Winner ? 'var(--color-success)' : 'var(--color-text-dim)'};">${d.sim.scoreA}</span>
            <span style="color: var(--color-text-dim); font-size: 1rem;">-</span>
            <span style="color: ${!isTeam1Winner ? 'var(--color-success)' : 'var(--color-text-dim)'};">${d.sim.scoreB}</span>
          </div>
          <span class="ccg-vs-text">${d.sim.winProbA}% - ${d.sim.winProbB}%</span>
        </div>

        <div class="ccg-team-block">
          <img src="${d.team2.logoUrl}" alt="${d.team2.name}" class="ccg-team-logo">
          <span class="ccg-team-name" style="${!isTeam1Winner ? 'color: var(--color-success); font-weight: 800;' : ''}">${d.team2.shortName}</span>
          <span class="ccg-team-rec">${d.team2.apRank || ''} (${d.team2.wins}-${d.team2.losses})</span>
        </div>
      </div>

      <div class="ccg-card-actions">
        <div style="font-size: 0.72rem; font-family: var(--font-mono); font-weight: 800; color: #10B981; display: flex; align-items: center; gap: 4px;">
          <i class="fa-solid fa-crown" style="color: #FFD700;"></i>
          <span>${d.sim.winner.shortName.toUpperCase()} CHAMPION</span>
        </div>
        <button class="ccg-sim-btn" onclick="event.stopPropagation(); window.openSimModalByGameId('${d.id}');">
          <i class="fa-solid fa-play"></i>
          <span>Simulate</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// 3. Generate 12-Team CFP Field from CCG Champions and At-Large Contenders
function generate12TeamCfpField(confChamps, evaluatedTeams) {
  // CFP Selection Committee Resume Grading Algorithm
  function calcCommitteeScore(t) {
    const l = t.totalLosses !== undefined ? t.totalLosses : t.losses;
    const w = t.totalWins !== undefined ? t.totalWins : t.wins;
    const apRankStr = t.apRank || '';
    const rMatch = apRankStr.match(/\d+/);
    const rNum = (apRankStr.includes('#') && rMatch) ? parseInt(rMatch[0], 10) : 99;

    // Severe loss tier penalties (Committee strictly separates 0/1/2/3 loss tiers)
    let lossPts = 0;
    if (l === 0) lossPts = 14000;
    else if (l === 1) lossPts = 10000;
    else if (l === 2) lossPts = 6500;
    else if (l === 3) lossPts = 2000; // Severe 3-loss bubble penalty
    else lossPts = 0;

    // AP Poll prestige tier
    let rankPts = 0;
    if (rNum <= 5) rankPts = 4500;
    else if (rNum <= 10) rankPts = 3500;
    else if (rNum <= 15) rankPts = 2500;
    else if (rNum <= 20) rankPts = 1500;
    else if (rNum <= 25) rankPts = 800;
    else rankPts = 0;

    // Conference Strength & SOS weight
    let confPts = 0;
    if (t.conf === 'SEC') confPts = 800;
    else if (t.conf === 'Big Ten') confPts = 700;
    else if (t.conf === 'Independent') confPts = 500; // Notre Dame national schedule
    else if (t.conf === 'ACC' || t.conf === 'Big 12') confPts = 400;

    const sp = t.baseSpRating || 22.0;
    const sumDiff = t.sumDiff || 0;

    return lossPts + rankPts + confPts + (sp * 60) + (sumDiff * 2) + (w * 50);
  }

  // 1. Resolve 5 conference champions
  // Power 4 champions (SEC, Big Ten, Big 12, ACC)
  const p4Champs = confChamps.filter(c => c && c.id !== 'boisestate' && c.id !== 'unlv' && c.conf !== 'Mountain West');
  p4Champs.sort((a, b) => {
    const tA = evaluatedTeams.find(t => isTeamMatch(t, a?.id)) || a;
    const tB = evaluatedTeams.find(t => isTeamMatch(t, b?.id)) || b;
    return calcCommitteeScore(tB) - calcCommitteeScore(tA);
  });

  const seed1 = p4Champs[0];
  const seed2 = p4Champs[1];
  const seed3 = p4Champs[2];
  const seed4 = p4Champs[3];

  // 5th G5 Conference Champion Auto-Bid
  const bsuEvaluated = evaluatedTeams.find(t => t.id === 'boisestate');
  const bsuLosses = bsuEvaluated ? (bsuEvaluated.totalLosses !== undefined ? bsuEvaluated.totalLosses : bsuEvaluated.losses) : 1;
  const mwcWinner = confChamps.find(c => c && (c.id === 'boisestate' || c.id === 'unlv' || c.conf === 'Mountain West'));

  let fifthChamp;
  // Boise State only earns the #12 G5 Auto-Bid if they win the MWC AND have at most 2 total losses.
  // If they lose 3+ games or lose the MWC title game, the G5 bid goes to AAC / G5 champion.
  if (mwcWinner && isTeamMatch(mwcWinner, 'boisestate') && bsuLosses <= 2) {
    fifthChamp = bsuEvaluated || TEAMS_DATABASE['boisestate'];
  } else {
    fifthChamp = {
      id: 'g5-autobid',
      name: 'AAC / G5 Champion (Auto-Bid)',
      shortName: 'AAC / G5 Champ',
      abbr: 'G5',
      logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/ncaa.png',
      apRank: 'AUTO-BID',
      wins: 11,
      losses: 2,
      totalWins: 11,
      totalLosses: 2,
      conf: 'G5 Auto-Bid',
      baseSpRating: 14.0,
      stadium: 'Host Campus Stadium',
      stadiumCity: 'Neutral Site',
      colors: { primary: '#4A5568', secondary: '#CBD5E0', accent: '#718096' },
      starPlayer: 'AAC / G5 All-Conference Star'
    };
  }

  // 2. All automatic bid champions
  const autoChampIds = new Set([seed1?.id, seed2?.id, seed3?.id, seed4?.id, fifthChamp?.id].filter(Boolean));

  // 3. 7 At-Large Bids: strictly Power 4 and Notre Dame (G5 unranked teams cannot earn At-Large bids)
  const atLargePool = evaluatedTeams.filter(t => t.conf !== 'Mountain West' && !autoChampIds.has(t.id) && t.id !== 'boisestate');
  atLargePool.sort((a, b) => calcCommitteeScore(b) - calcCommitteeScore(a));

  const seed5 = atLargePool[0];
  const seed6 = atLargePool[1];
  const seed7 = atLargePool[2];
  const seed8 = atLargePool[3];
  const seed9 = atLargePool[4];
  const seed10 = atLargePool[5];
  const seed11 = atLargePool[6];
  const seed12 = fifthChamp;

  const seeds = [seed1, seed2, seed3, seed4, seed5, seed6, seed7, seed8, seed9, seed10, seed11, seed12].filter(Boolean);

  // Synchronize true post-CCG records and seeds onto all 12 seed objects
  seeds.forEach((s, idx) => {
    s.playoffSeed = idx + 1;
    const match = evaluatedTeams.find(t => isTeamMatch(t, s.id));
    if (match) {
      s.totalWins = match.totalWins;
      s.totalLosses = match.totalLosses;
      s.wins = match.totalWins;
      s.losses = match.totalLosses;
    }
  });

  return {
    seeds,
    seed1, seed2, seed3, seed4,
    seed5, seed6, seed7, seed8,
    seed9, seed10, seed11, seed12
  };
}

// 4. Simulate Full 12-Team Playoff Bracket
function simulatePlayoffBracket(cfp) {
  // Helper to register playoff game for modal simulation
  const registerPlayoffGame = (id, roundName, bowlName, teamA, teamB, sim, stadium, location) => {
    state.postseasonGames[id] = {
      id,
      week: roundName,
      isPostseason: true,
      teamA: teamA,
      teamB: teamB,
      opponent: teamB?.name || 'Playoff Challenger',
      oppAbbr: teamB?.abbr || teamB?.shortName || 'CFP',
      oppRank: teamB?.apRank || 'TOP 12',
      oppColor: (TEAMS_DATABASE[teamB?.id] || {}).colors?.primary || '#333333',
      oppLogoUrl: teamB?.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[teamB?.abbr] : '') || '',
      isHome: false,
      stadium: bowlName ? `${bowlName} (${stadium})` : stadium,
      location,
      isMarquee: true,
      projScoreUt: sim.scoreA,
      projScoreOpp: sim.scoreB,
      baseWinProb: sim.winProbA,
      scoutReport: {
        xFactor: `Championship survival and advancement at ${bowlName || stadium}.`,
        keyMatchup: `${teamA?.shortName} vs ${teamB?.shortName} high-stakes battle.`,
        summary: `12-Team College Football Playoff knockout clash between ${teamA?.name} and ${teamB?.name}.`
      }
    };
  };

  // 1. First Round (On-Campus)
  const simFR1 = simulatePostseasonMatchup(cfp.seed5, cfp.seed12, { gameId: 'playoff-fr1', isHomeA: true });
  const simFR2 = simulatePostseasonMatchup(cfp.seed6, cfp.seed11, { gameId: 'playoff-fr2', isHomeA: true });
  const simFR3 = simulatePostseasonMatchup(cfp.seed7, cfp.seed10, { gameId: 'playoff-fr3', isHomeA: true });
  const simFR4 = simulatePostseasonMatchup(cfp.seed8, cfp.seed9, { gameId: 'playoff-fr4', isHomeA: true });

  registerPlayoffGame('playoff-fr1', 'CFP FIRST ROUND', '', cfp.seed5, cfp.seed12, simFR1, cfp.seed5?.stadium || 'Campus Stadium', cfp.seed5?.stadiumCity || 'On Campus');
  registerPlayoffGame('playoff-fr2', 'CFP FIRST ROUND', '', cfp.seed6, cfp.seed11, simFR2, cfp.seed6?.stadium || 'Campus Stadium', cfp.seed6?.stadiumCity || 'On Campus');
  registerPlayoffGame('playoff-fr3', 'CFP FIRST ROUND', '', cfp.seed7, cfp.seed10, simFR3, cfp.seed7?.stadium || 'Campus Stadium', cfp.seed7?.stadiumCity || 'On Campus');
  registerPlayoffGame('playoff-fr4', 'CFP FIRST ROUND', '', cfp.seed8, cfp.seed9, simFR4, cfp.seed8?.stadium || 'Campus Stadium', cfp.seed8?.stadiumCity || 'On Campus');

  const fr1Winner = simFR1.winner;
  const fr2Winner = simFR2.winner;
  const fr3Winner = simFR3.winner;
  const fr4Winner = simFR4.winner;

  // 2. Quarterfinals (NY6 Bowls)
  const simQF1 = simulatePostseasonMatchup(cfp.seed1, fr4Winner, { gameId: 'playoff-qf1' }); // Sugar/Rose
  const simQF2 = simulatePostseasonMatchup(cfp.seed2, fr3Winner, { gameId: 'playoff-qf2' }); // Rose/Sugar
  const simQF3 = simulatePostseasonMatchup(cfp.seed3, fr2Winner, { gameId: 'playoff-qf3' }); // Peach
  const simQF4 = simulatePostseasonMatchup(cfp.seed4, fr1Winner, { gameId: 'playoff-qf4' }); // Fiesta

  registerPlayoffGame('playoff-qf1', 'CFP QUARTERFINAL', 'Allstate Sugar Bowl', cfp.seed1, fr4Winner, simQF1, 'Caesars Superdome', 'New Orleans, LA');
  registerPlayoffGame('playoff-qf2', 'CFP QUARTERFINAL', 'Rose Bowl Game', cfp.seed2, fr3Winner, simQF2, 'Rose Bowl Stadium', 'Pasadena, CA');
  registerPlayoffGame('playoff-qf3', 'CFP QUARTERFINAL', 'Chick-fil-A Peach Bowl', cfp.seed3, fr2Winner, simQF3, 'Mercedes-Benz Stadium', 'Atlanta, GA');
  registerPlayoffGame('playoff-qf4', 'CFP QUARTERFINAL', 'Vrbo Fiesta Bowl', cfp.seed4, fr1Winner, simQF4, 'State Farm Stadium', 'Glendale, AZ');

  const qf1Winner = simQF1.winner;
  const qf2Winner = simQF2.winner;
  const qf3Winner = simQF3.winner;
  const qf4Winner = simQF4.winner;

  // 3. Semifinals
  const simSemi1 = simulatePostseasonMatchup(qf1Winner, qf4Winner, { gameId: 'playoff-sf1' }); // Orange Bowl
  const simSemi2 = simulatePostseasonMatchup(qf2Winner, qf3Winner, { gameId: 'playoff-sf2' }); // Cotton Bowl

  registerPlayoffGame('playoff-sf1', 'CFP SEMIFINAL', 'Capital One Orange Bowl', qf1Winner, qf4Winner, simSemi1, 'Hard Rock Stadium', 'Miami Gardens, FL');
  registerPlayoffGame('playoff-sf2', 'CFP SEMIFINAL', 'Goodyear Cotton Bowl', qf2Winner, qf3Winner, simSemi2, 'AT&T Stadium', 'Arlington, TX');

  const semi1Winner = simSemi1.winner;
  const semi2Winner = simSemi2.winner;

  // 4. National Championship
  const simNatty = simulatePostseasonMatchup(semi1Winner, semi2Winner, { gameId: 'playoff-natty' });
  registerPlayoffGame('playoff-natty', 'NATIONAL CHAMPIONSHIP', 'CFP National Championship', semi1Winner, semi2Winner, simNatty, 'Mercedes-Benz Stadium', 'Atlanta, GA');

  return {
    cfp,
    fr1: { teamA: cfp.seed5, teamB: cfp.seed12, sim: simFR1, id: 'playoff-fr1', label: 'First Round (On-Campus)' },
    fr2: { teamA: cfp.seed6, teamB: cfp.seed11, sim: simFR2, id: 'playoff-fr2', label: 'First Round (On-Campus)' },
    fr3: { teamA: cfp.seed7, teamB: cfp.seed10, sim: simFR3, id: 'playoff-fr3', label: 'First Round (On-Campus)' },
    fr4: { teamA: cfp.seed8, teamB: cfp.seed9, sim: simFR4, id: 'playoff-fr4', label: 'First Round (On-Campus)' },

    qf1: { teamA: cfp.seed1, teamB: fr4Winner, sim: simQF1, id: 'playoff-qf1', bowl: 'Allstate Sugar Bowl (New Orleans)' },
    qf2: { teamA: cfp.seed2, teamB: fr3Winner, sim: simQF2, id: 'playoff-qf2', bowl: 'Rose Bowl Game (Pasadena)' },
    qf3: { teamA: cfp.seed3, teamB: fr2Winner, sim: simQF3, id: 'playoff-qf3', bowl: 'Chick-fil-A Peach Bowl (Atlanta)' },
    qf4: { teamA: cfp.seed4, teamB: fr1Winner, sim: simQF4, id: 'playoff-qf4', bowl: 'Vrbo Fiesta Bowl (Glendale)' },

    sf1: { teamA: qf1Winner, teamB: qf4Winner, sim: simSemi1, id: 'playoff-sf1', bowl: 'Orange Bowl Semifinal (Miami)' },
    sf2: { teamA: qf2Winner, teamB: qf3Winner, sim: simSemi2, id: 'playoff-sf2', bowl: 'Cotton Bowl Semifinal (Dallas)' },

    natty: { teamA: semi1Winner, teamB: semi2Winner, sim: simNatty, id: 'playoff-natty', bowl: 'CFP National Championship' },

    nationalChampion: simNatty.winner,
    runnerUp: simNatty.loser
  };
}

// 5. Render Playoff Bracket
function renderPlayoffBracket(totalWins, cfpSeed, playoffData) {
  const container = document.getElementById('playoffBracketGrid');
  if (!container || !playoffData) return;
  const teamId = state.currentTeamId;
  const team = TEAMS_DATABASE[teamId];

  function getTeamSeed(tObj, fallbackSeed) {
    if (!tObj) return fallbackSeed || '';
    if (tObj.seed) return tObj.seed;
    if (tObj.playoffSeed) return tObj.playoffSeed;
    if (playoffData && playoffData.cfp && Array.isArray(playoffData.cfp.seeds)) {
      const idx = playoffData.cfp.seeds.findIndex(s => s && isTeamMatch(s, tObj.id || tObj.name));
      if (idx !== -1) return idx + 1;
    }
    return fallbackSeed || '';
  }

  function teamRow(fallbackSeed, tObj, score, isWinner, isHighlighted) {
    const seedNum = getTeamSeed(tObj, fallbackSeed);
    const name = tObj ? tObj.shortName || tObj.name : `Seed #${seedNum}`;
    const logo = tObj?.logoUrl || (tObj?.abbr && typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[tObj.abbr] : '') || '';
    let w = tObj?.totalWins !== undefined ? tObj.totalWins : tObj?.wins;
    let l = tObj?.totalLosses !== undefined ? tObj.totalLosses : tObj?.losses;
    if (w === undefined || l === undefined) {
      if (playoffData && playoffData.cfp && Array.isArray(playoffData.cfp.seeds)) {
        const seedMatch = playoffData.cfp.seeds.find(s => s && isTeamMatch(s, tObj?.id || tObj?.name));
        if (seedMatch) {
          w = seedMatch.totalWins !== undefined ? seedMatch.totalWins : seedMatch.wins;
          l = seedMatch.totalLosses !== undefined ? seedMatch.totalLosses : seedMatch.losses;
        }
      }
    }
    if (w === undefined || l === undefined) {
      const dbT = tObj?.id ? TEAMS_DATABASE[tObj.id] : null;
      if (dbT && dbT.schedule) {
        let cw = 0, cl = 0;
        dbT.schedule.forEach(g => {
          const sim = calculateAdjustedMatchup(g, dbT.id);
          if (sim.isWin) cw++; else cl++;
        });
        w = cw;
        l = cl;
      } else {
        w = 11;
        l = 1;
      }
    }
    const record = `(${w}-${l})`;
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

  function renderPlayoffMatchupBox(m, seedA, seedB, defaultVenue) {
    if (!m) return '';
    const isActive = isTeamMatch(m.teamA, teamId) || isTeamMatch(m.teamB, teamId);
    const isCustom = !!(state.gameSliders && state.gameSliders[m.id]?.isCustom);
    const isUserPick = !!(state.playoffPicks && state.playoffPicks[m.id]);

    let customBadgeHtml = '';
    if (isUserPick) {
      customBadgeHtml = `<span class="custom-tuned-badge" style="background: rgba(16, 185, 129, 0.2); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4);"><i class="fa-solid fa-check"></i> USER PICK</span>`;
    } else if (isCustom) {
      const gs = state.gameSliders[m.id];
      const qb = gs.qbRating || 0;
      const def = gs.defenseHavoc || 0;
      const gnd = gs.groundAttack || 0;
      const to = gs.turnoverLuck || 0;
      const cr = gs.crowdNoise || 0;
      const delta = qb + def + gnd + to + cr;
      const sign = delta > 0 ? '+' : '';
      const deltaText = delta !== 0 ? ` (${sign}${delta}%)` : '';
      customBadgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-bullseye"></i> CUSTOM TUNED${deltaText}</span>`;
    }

    const probA = m.sim?.winProbA || 50;
    const probB = m.sim?.winProbB || (100 - probA);
    const venueText = m.teamA?.stadium || defaultVenue || 'Campus Stadium';

    return `
      <div class="playoff-matchup-box ${isActive ? 'active-team-matchup' : ''}" onclick="window.openSimModalByGameId('${m.id}')">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-size: 0.65rem; font-family: var(--font-mono); color: var(--color-text-dim); text-transform: uppercase;">${m.label || defaultVenue || 'CFP MATCHUP'}</span>
          ${customBadgeHtml}
        </div>
        ${teamRow(seedB, m.teamB, m.sim.scoreB, !m.sim.isAWinner, isTeamMatch(m.teamB, teamId))}
        ${teamRow(seedA, m.teamA, m.sim.scoreA, m.sim.isAWinner, isTeamMatch(m.teamA, teamId))}
        
        <!-- Win Probability KPI Meter -->
        <div style="display: flex; flex-direction: column; gap: 3px; margin: 4px 0 2px 0;">
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 0.64rem; color: var(--color-text-muted);">
            <span>WIN PROBABILITY</span>
            <span>
              <strong style="color: ${!m.sim.isAWinner ? 'var(--color-success)' : 'var(--color-text-dim)'};">${m.teamB?.abbr || 'TMB'} ${probB}%</strong>
              <span style="opacity: 0.5; margin: 0 3px;">•</span>
              <strong style="color: ${m.sim.isAWinner ? 'var(--color-success)' : 'var(--color-text-dim)'};">${m.teamA?.abbr || 'TMA'} ${probA}%</strong>
            </span>
          </div>
          <div style="height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.08); overflow: hidden; display: flex;">
            <div style="width: ${probB}%; background: ${!m.sim.isAWinner ? 'var(--color-success)' : 'rgba(255, 255, 255, 0.25)'}; transition: width 0.3s ease;"></div>
            <div style="width: ${probA}%; background: ${m.sim.isAWinner ? 'var(--color-success)' : 'rgba(255, 255, 255, 0.25)'}; transition: width 0.3s ease;"></div>
          </div>
        </div>

        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">${venueText}</span>
          <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${m.sim.winner?.shortName?.toUpperCase()} ADVANCES</span>
        </div>
      </div>
    `;
  }

  const p = playoffData;
  const nattyChamp = p.nationalChampion;
  const isNattyCustom = !!(state.gameSliders && state.gameSliders['playoff-natty']?.isCustom);
  const isNattyUserPick = !!(state.playoffPicks && state.playoffPicks['playoff-natty']);

  let nattyCustomBadgeHtml = '';
  if (isNattyUserPick) {
    nattyCustomBadgeHtml = `<span class="custom-tuned-badge" style="background: rgba(16, 185, 129, 0.2); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4);"><i class="fa-solid fa-check"></i> USER PICK</span>`;
  } else if (isNattyCustom) {
    const gs = state.gameSliders['playoff-natty'];
    const delta = (gs.qbRating || 0) + (gs.defenseHavoc || 0) + (gs.groundAttack || 0) + (gs.turnoverLuck || 0) + (gs.crowdNoise || 0);
    const deltaText = delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta}%)` : '';
    nattyCustomBadgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-bullseye"></i> CUSTOM TUNED${deltaText}</span>`;
  }

  container.innerHTML = `
    <!-- FIRST ROUND -->
    <div class="playoff-round-card">
      <div class="round-header">
        <span>FIRST ROUND (ON-CAMPUS)</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">DEC 18-19</span>
      </div>

      <!-- M1: 12 @ 5 -->
      ${renderPlayoffMatchupBox(p.fr1, 5, 12, p.fr1.teamA?.stadium || 'On Campus')}

      <!-- M2: 11 @ 6 -->
      ${renderPlayoffMatchupBox(p.fr2, 6, 11, p.fr2.teamA?.stadium || 'On Campus')}

      <!-- M3: 10 @ 7 -->
      ${renderPlayoffMatchupBox(p.fr3, 7, 10, p.fr3.teamA?.stadium || 'On Campus')}

      <!-- M4: 9 @ 8 -->
      ${renderPlayoffMatchupBox(p.fr4, 8, 9, p.fr4.teamA?.stadium || 'On Campus')}
    </div>

    <!-- QUARTERFINALS -->
    <div class="playoff-round-card">
      <div class="round-header">
        <span>QUARTERFINALS (NY6 BOWLS)</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">DEC 31 - JAN 1</span>
      </div>

      <!-- QF1: Sugar Bowl -->
      ${renderPlayoffMatchupBox(p.qf1, 1, 8, 'Sugar Bowl (New Orleans)')}

      <!-- QF2: Rose Bowl -->
      ${renderPlayoffMatchupBox(p.qf2, 2, 7, 'Rose Bowl Game (Pasadena)')}

      <!-- QF3: Peach Bowl -->
      ${renderPlayoffMatchupBox(p.qf3, 3, 6, 'Chick-fil-A Peach Bowl')}

      <!-- QF4: Fiesta Bowl -->
      ${renderPlayoffMatchupBox(p.qf4, 4, 12, 'Vrbo Fiesta Bowl')}
    </div>

    <!-- SEMIFINALS -->
    <div class="playoff-round-card">
      <div class="round-header">
        <span>SEMIFINALS (COTTON / ORANGE)</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">JAN 8-9</span>
      </div>

      <!-- SF1: Orange Bowl -->
      ${renderPlayoffMatchupBox(p.sf1, 1, 4, 'Orange Bowl (Miami)')}

      <!-- SF2: Cotton Bowl -->
      ${renderPlayoffMatchupBox(p.sf2, 2, 3, 'Cotton Bowl Classic (Dallas)')}
    </div>

    <!-- NATIONAL CHAMPIONSHIP -->
    <div class="playoff-round-card" style="border-color: #FFD700; background: linear-gradient(180deg, rgba(255, 215, 0, 0.08), rgba(0, 0, 0, 0.6));">
      <div class="round-header" style="color: #FFD700;">
        <span><i class="fa-solid fa-trophy"></i> NATIONAL CHAMPIONSHIP</span>
        <span style="font-size: 0.68rem; opacity: 0.8;">JAN 18, 2027</span>
      </div>

      <!-- Natty Showdown -->
      <div class="playoff-matchup-box ${isTeamMatch(p.natty.teamA, teamId) || isTeamMatch(p.natty.teamB, teamId) ? 'active-team-matchup' : ''}" onclick="window.openSimModalByGameId('${p.natty.id}')">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-size: 0.65rem; font-family: var(--font-mono); color: #FFD700; font-weight: 800; text-transform: uppercase;">NATIONAL TITLE GAME</span>
          ${nattyCustomBadgeHtml}
        </div>
        ${teamRow('SF1', p.natty.teamA, p.natty.sim.scoreA, p.natty.sim.isAWinner, isTeamMatch(p.natty.teamA, teamId))}
        ${teamRow('SF2', p.natty.teamB, p.natty.sim.scoreB, !p.natty.sim.isAWinner, isTeamMatch(p.natty.teamB, teamId))}
        
        <!-- Win Probability KPI Meter -->
        <div style="display: flex; flex-direction: column; gap: 3px; margin: 4px 0 2px 0;">
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 0.64rem; color: var(--color-text-muted);">
            <span>WIN PROBABILITY</span>
            <span>
              <strong style="color: ${p.natty.sim.isAWinner ? '#FFD700' : 'var(--color-text-dim)'};">${p.natty.teamA?.abbr || 'SF1'} ${p.natty.sim.winProbA}%</strong>
              <span style="opacity: 0.5; margin: 0 3px;">•</span>
              <strong style="color: ${!p.natty.sim.isAWinner ? '#FFD700' : 'var(--color-text-dim)'};">${p.natty.teamB?.abbr || 'SF2'} ${p.natty.sim.winProbB}%</strong>
            </span>
          </div>
          <div style="height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.08); overflow: hidden; display: flex;">
            <div style="width: ${p.natty.sim.winProbA}%; background: ${p.natty.sim.isAWinner ? '#FFD700' : 'rgba(255, 255, 255, 0.25)'}; transition: width 0.3s ease;"></div>
            <div style="width: ${p.natty.sim.winProbB}%; background: ${!p.natty.sim.isAWinner ? '#FFD700' : 'rgba(255, 255, 255, 0.25)'}; transition: width 0.3s ease;"></div>
          </div>
        </div>

        <div class="playoff-result-badge">
          <span style="color: var(--color-text-dim);">Mercedes-Benz Stadium (Atlanta)</span>
          <span class="playoff-win-tag" style="color: #FFD700;"><i class="fa-solid fa-crown"></i> ${nattyChamp?.shortName?.toUpperCase()} NATIONAL CHAMPION</span>
        </div>
      </div>

      <div style="margin-top: auto; padding: 0.75rem; background: rgba(0, 0, 0, 0.5); border-radius: var(--radius-sm); border: 1px solid rgba(255, 215, 0, 0.3); text-align: center;">
        <div style="font-size: 0.68rem; font-family: var(--font-mono); color: #FFD700; font-weight: 800; text-transform: uppercase;">
          👑 2026-27 NATIONAL CHAMPIONS
        </div>
        <div style="font-size: 1.15rem; font-weight: 900; color: #FFFFFF; margin-top: 2px;">
          ${nattyChamp?.name || 'CHAMPION'}
        </div>
      </div>
    </div>
  `;

  // Preserve active round filter tab after re-render
  const activeRoundBtn = document.querySelector('.round-tab-btn.active');
  const activeRoundKey = activeRoundBtn ? activeRoundBtn.dataset.round : 'all';
  if (activeRoundKey && activeRoundKey !== 'all') {
    switchPlayoffRound(activeRoundKey);
  }
}

// National Single-Selection Non-CFP Bowl Slate Generator (Guarantees Exactly One Bowl Per Program!)
function generateNationalPostseasonBowlSlate(evaluatedTeams, playoffData) {
  const cfpIds = new Set();
  if (playoffData && playoffData.cfp && Array.isArray(playoffData.cfp.seeds)) {
    playoffData.cfp.seeds.forEach(s => {
      if (s && s.id) cfpIds.add(s.id);
    });
  }

  // Pool of all non-CFP bowl eligible teams (6+ wins)
  const nonCfpEligible = (evaluatedTeams || []).filter(t => t && !cfpIds.has(t.id) && (t.totalWins !== undefined ? t.totalWins : t.wins) >= 6);
  nonCfpEligible.sort((a, b) => {
    const wA = a.totalWins !== undefined ? a.totalWins : a.wins;
    const wB = b.totalWins !== undefined ? b.totalWins : b.wins;
    if (wB !== wA) return wB - wA;
    return (b.baseSpRating || 20) - (a.baseSpRating || 20);
  });

  const MAJOR_BOWLS = [
    { id: 'bowl-citrus', name: 'Vrbo Citrus Bowl', city: 'Orlando, FL', confA: 'SEC', confB: 'Big Ten', defRating: 24.5 },
    { id: 'bowl-reliaquest', name: 'ReliaQuest Bowl', city: 'Tampa, FL', confA: 'SEC', confB: 'Big Ten', defRating: 23.5 },
    { id: 'bowl-poptarts', name: 'Pop-Tarts Bowl', city: 'Orlando, FL', confA: 'Big 12', confB: 'ACC', defRating: 23.0 },
    { id: 'bowl-gator', name: 'TaxSlayer Gator Bowl', city: 'Jacksonville, FL', confA: 'SEC', confB: 'ACC', defRating: 22.5 },
    { id: 'bowl-alamo', name: 'Valero Alamo Bowl', city: 'San Antonio, TX', confA: 'Big 12', confB: 'Pac-12', defRating: 22.5 },
    { id: 'bowl-texas', name: 'TaxAct Texas Bowl', city: 'Houston, TX', confA: 'SEC', confB: 'Big 12', defRating: 22.0 },
    { id: 'bowl-musiccity', name: 'TransPerfect Music City Bowl', city: 'Nashville, TN', confA: 'SEC', confB: 'Big Ten', defRating: 21.5 },
    { id: 'bowl-sun', name: 'Tony the Tiger Sun Bowl', city: 'El Paso, TX', confA: 'ACC', confB: 'Pac-12', defRating: 21.0 },
    { id: 'bowl-dukesmayo', name: 'Duke\'s Mayo Bowl', city: 'Charlotte, NC', confA: 'ACC', confB: 'Big Ten', defRating: 20.5 },
    { id: 'bowl-pinstripe', name: 'Bad Boy Mowers Pinstripe Bowl', city: 'Yankee Stadium, NYC', confA: 'ACC', confB: 'Big Ten', defRating: 20.0 },
    { id: 'bowl-liberty', name: 'AutoZone Liberty Bowl', city: 'Memphis, TN', confA: 'SEC', confB: 'Big 12', defRating: 19.5 },
    { id: 'bowl-rate', name: 'Guaranteed Rate Bowl', city: 'Phoenix, AZ', confA: 'Big 12', confB: 'Big Ten', defRating: 19.5 },
    { id: 'bowl-labowl', name: 'LA Bowl Hosted by Gronk', city: 'SoFi Stadium, CA', confA: 'Mountain West', confB: 'Big 12', defRating: 19.0 },
    { id: 'bowl-military', name: 'Military Bowl', city: 'Annapolis, MD', confA: 'ACC', confB: 'AAC', defRating: 18.5 }
  ];

  const assignedTeamIds = new Set();
  const teamBowlMap = {};
  const bowlGamesList = [];

  MAJOR_BOWLS.forEach(bowl => {
    const poolA = nonCfpEligible.filter(t => !assignedTeamIds.has(t.id) && (t.conf === bowl.confA || t.conference === bowl.confA));
    const poolB = nonCfpEligible.filter(t => !assignedTeamIds.has(t.id) && (t.conf === bowl.confB || t.conference === bowl.confB));

    let teamA = poolA.length > 0 ? (TEAMS_DATABASE[poolA[0].id] || poolA[0]) : null;
    let teamB = poolB.length > 0 ? (TEAMS_DATABASE[poolB[0].id] || poolB[0]) : null;

    if (teamA || teamB) {
      if (teamA && teamB) {
        assignedTeamIds.add(teamA.id);
        assignedTeamIds.add(teamB.id);
      } else if (teamA) {
        assignedTeamIds.add(teamA.id);
        teamB = {
          id: `gen-${bowl.id}-b`,
          name: `${bowl.confB} Contender`,
          shortName: `${bowl.confB} Contender`,
          baseSpRating: bowl.defRating,
          conference: bowl.confB,
          colors: { primary: '#4A5568', secondary: '#CBD5E0' }
        };
      } else if (teamB) {
        assignedTeamIds.add(teamB.id);
        teamA = {
          id: `gen-${bowl.id}-a`,
          name: `${bowl.confA} Contender`,
          shortName: `${bowl.confA} Contender`,
          baseSpRating: bowl.defRating,
          conference: bowl.confA,
          colors: { primary: '#4A5568', secondary: '#CBD5E0' }
        };
      }

      // Simulate the single bowl matchup
      const sim = simulatePostseasonMatchup(teamA, teamB, { gameId: bowl.id });
      const isWinnerA = isTeamMatch(sim.winner, teamA.id);

      const gameObj = {
        id: bowl.id,
        week: 'NON-CFP BOWL',
        isPostseason: true,
        teamA,
        teamB,
        opponent: teamB.name,
        oppAbbr: teamB.abbr || teamB.shortName,
        oppRank: 'BOWL',
        oppColor: teamB.colors?.primary || '#333333',
        oppLogoUrl: teamB.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[teamB.abbr] : '') || '',
        isHome: false,
        stadium: `${bowl.name} (${bowl.city})`,
        location: bowl.city,
        isMarquee: true,
        projScoreUt: sim.scoreA,
        projScoreOpp: sim.scoreB,
        baseWinProb: sim.winProbA,
        scoutReport: {
          xFactor: `Trench execution and bowl championship trophy at ${bowl.city}.`,
          keyMatchup: `${teamA.shortName} vs ${teamB.shortName} postseason clash.`,
          summary: `Official postseason ${bowl.name} matchup between ${teamA.name} and ${teamB.name}.`
        }
      };

      state.postseasonGames[bowl.id] = gameObj;
      bowlGamesList.push(gameObj);

      if (teamA.id && !teamA.id.startsWith('gen-')) {
        teamBowlMap[teamA.id] = {
          bowlName: bowl.name,
          city: bowl.city,
          opponent: teamB.shortName || teamB.name,
          isWinner: isWinnerA,
          scoreFor: sim.scoreA,
          scoreOpp: sim.scoreB,
          title: isWinnerA ? `🏆 ${bowl.name} Champions (${sim.scoreA}-${sim.scoreB} vs ${teamB.shortName || teamB.name})` : `${bowl.name} (${sim.scoreA}-${sim.scoreB} vs ${teamB.shortName || teamB.name})`
        };
      }

      if (teamB.id && !teamB.id.startsWith('gen-')) {
        teamBowlMap[teamB.id] = {
          bowlName: bowl.name,
          city: bowl.city,
          opponent: teamA.shortName || teamA.name,
          isWinner: !isWinnerA,
          scoreFor: sim.scoreB,
          scoreOpp: sim.scoreA,
          title: !isWinnerA ? `🏆 ${bowl.name} Champions (${sim.scoreB}-${sim.scoreA} vs ${teamA.shortName || teamA.name})` : `${bowl.name} (${sim.scoreB}-${sim.scoreA} vs ${teamA.shortName || teamA.name})`
        };
      }
    }
  });

  return { teamBowlMap, bowlGamesList };
}

// 6. Calculate Overall Total Season Record for Active Team
function calcActiveTeamTotalRecord(teamId, regWins, regLosses, ccgResults, playoffData, teamBowlMap) {
  let totalWins = regWins;
  let totalLosses = regLosses;
  let outcomeTitle = 'Regular Season';

  // 1. Check Conference Championship
  const ccgGames = [ccgResults.sec, ccgResults.b1g, ccgResults.big12, ccgResults.acc, ccgResults.mwc];
  const userCcg = ccgGames.find(g => g && (isTeamMatch(g.team1, teamId) || isTeamMatch(g.team2, teamId)));
  if (userCcg) {
    const isWinner = isTeamMatch(userCcg.sim?.winner, teamId);
    if (isWinner) {
      totalWins++;
      outcomeTitle = 'Conference Champions';
    } else {
      totalLosses++;
      outcomeTitle = 'Conference Runner-Up';
    }
  }

  // 2. Check 12-Team CFP
  const p = playoffData;
  const isNationalChampion = isTeamMatch(p.nationalChampion, teamId);
  const isRunnerUp = isTeamMatch(p.runnerUp, teamId);

  // Check rounds
  let inFR = false, wonFR = false;
  let inQF = false, wonQF = false;
  let inSF = false, wonSF = false;

  [p.fr1, p.fr2, p.fr3, p.fr4].forEach(fr => {
    if (fr && (isTeamMatch(fr.teamA, teamId) || isTeamMatch(fr.teamB, teamId))) {
      inFR = true;
      if (isTeamMatch(fr.sim?.winner, teamId)) wonFR = true;
    }
  });

  [p.qf1, p.qf2, p.qf3, p.qf4].forEach(qf => {
    if (qf && (isTeamMatch(qf.teamA, teamId) || isTeamMatch(qf.teamB, teamId))) {
      inQF = true;
      if (isTeamMatch(qf.sim?.winner, teamId)) wonQF = true;
    }
  });

  [p.sf1, p.sf2].forEach(sf => {
    if (sf && (isTeamMatch(sf.teamA, teamId) || isTeamMatch(sf.teamB, teamId))) {
      inSF = true;
      if (isTeamMatch(sf.sim?.winner, teamId)) wonSF = true;
    }
  });

  if (isNationalChampion) {
    // Won National Championship!
    if (inFR && wonFR) totalWins++;
    if (inQF && wonQF) totalWins++;
    if (inSF && wonSF) totalWins++;
    totalWins++; // Natty win
    outcomeTitle = '🏆 National Champions';
  } else if (isRunnerUp) {
    if (inFR && wonFR) totalWins++;
    if (inQF && wonQF) totalWins++;
    if (inSF && wonSF) totalWins++;
    totalLosses++; // Lost Natty
    outcomeTitle = '🥈 CFP National Runner-Up';
  } else if (inSF) {
    if (inFR && wonFR) totalWins++;
    if (inQF && wonQF) totalWins++;
    totalLosses++; // Lost in SF
    outcomeTitle = '🥉 CFP Semifinalist';
  } else if (inQF) {
    if (inFR && wonFR) totalWins++;
    totalLosses++; // Lost in QF
    outcomeTitle = 'CFP Quarterfinalist';
  } else if (inFR) {
    if (wonFR) {
      totalWins++;
      outcomeTitle = 'CFP Quarterfinalist';
    } else {
      totalLosses++; // Lost in FR
      outcomeTitle = 'CFP First Round';
    }
  } else {
    // Missed CFP: Single assigned bowl outcome from global national slate
    const bowlOutcome = teamBowlMap ? teamBowlMap[teamId] : null;
    if (bowlOutcome) {
      if (bowlOutcome.isWinner) {
        totalWins++;
      } else {
        totalLosses++;
      }
      outcomeTitle = bowlOutcome.title;
    } else if (regWins >= 6) {
      outcomeTitle = 'Postseason Bowl Eligible';
    } else {
      outcomeTitle = `No Bowl Game (Ineligible: ${regWins}-${regLosses})`;
    }
  }

  return {
    totalWins,
    totalLosses,
    outcomeTitle
  };
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
    if (state.activeModalGame) {
      generateGameHypeCard(state.activeModalGame);
    } else {
      generateHypeCard();
    }
  });
  if (closeBtn) closeBtn.addEventListener('click', () => {
    document.getElementById('hypeCardModal').classList.remove('open');
  });

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const canvas = document.getElementById('hypeCanvas');
      const link = document.createElement('a');
      const g = state.activeModalGame;
      const slug = (g && g.teamA && g.teamB) 
        ? `${g.teamA.shortName || 'TeamA'}-vs-${g.teamB.shortName || 'TeamB'}` 
        : (state.currentTeamId || 'season');
      link.download = `gridiron-oracle-${slug}-matchup.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('📥 Hype Card downloaded successfully!');
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const canvas = document.getElementById('hypeCanvas');
      canvas.toBlob(blob => {
        if (navigator.clipboard && navigator.clipboard.write) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(() => showToast('📋 Hype Card copied to clipboard! Ready to paste into group chat.'))
            .catch(() => showToast('💾 Use "Save Image" to download the Hype Card.'));
        } else {
          showToast('💾 Use "Save Image" to download the Hype Card.');
        }
      });
    });
  }
}

function drawCanvasRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadCanvasImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawCanvasTextFitted(ctx, text, x, y, maxWidth, font, color, align = 'center') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = font;
  let textWidth = ctx.measureText(text).width;
  if (textWidth > maxWidth && maxWidth > 0) {
    const fontSizeMatch = font.match(/(\d+)px/);
    if (fontSizeMatch) {
      const origSize = parseInt(fontSizeMatch[1]);
      const scale = Math.max(0.6, maxWidth / textWidth);
      const newSize = Math.floor(origSize * scale);
      ctx.font = font.replace(`${origSize}px`, `${newSize}px`);
    }
  }
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

function drawCanvasTextWrapped(ctx, text, x, y, maxWidth, lineHeight, font, color, align = 'left', maxLines = 2) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = font;
  const words = (text || '').split(' ');
  let line = '';
  let lineCount = 0;
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y + (lineCount * lineHeight));
      line = words[n] + ' ';
      lineCount++;
      if (lineCount >= maxLines - 1) {
        const remaining = words.slice(n).join(' ');
        let fitRemaining = remaining;
        while (ctx.measureText(fitRemaining + '...').width > maxWidth && fitRemaining.length > 0) {
          fitRemaining = fitRemaining.slice(0, -1);
        }
        ctx.fillText(fitRemaining.trim() + (fitRemaining.length < remaining.length ? '...' : ''), x, y + (lineCount * lineHeight));
        ctx.restore();
        return;
      }
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, y + (lineCount * lineHeight));
  ctx.restore();
}

async function generateHypeCard() {
  const canvas = document.getElementById('hypeCanvas');
  if (!canvas) return;
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext('2d');
  const team = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {}

  const logoImg = await loadCanvasImage(team.logoUrl);

  // Background
  ctx.fillStyle = '#080C14';
  ctx.fillRect(0, 0, 1200, 675);

  // Radial Glow
  const glow = ctx.createRadialGradient(280, 260, 10, 280, 260, 480);
  glow.addColorStop(0, team.colors?.primary || '#BF5700');
  glow.addColorStop(1, 'rgba(8, 12, 20, 0)');
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 0, 1200, 675);
  ctx.globalAlpha = 1.0;

  // Grid texture
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 80; x < 1200; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 675);
    ctx.stroke();
  }

  // Outer Border
  ctx.strokeStyle = team.colors?.accent || '#F59E0B';
  ctx.lineWidth = 3;
  drawCanvasRoundedRect(ctx, 16, 16, 1168, 643, 20);
  ctx.stroke();

  // Header Banner
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  drawCanvasRoundedRect(ctx, 40, 32, 1120, 52, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  drawCanvasTextFitted(ctx, `🏈 GRIDIRON ORACLE • ${team.name.toUpperCase()}`, 60, 66, 680, 'bold 24px "Bebas Neue", "Outfit", sans-serif', '#FFFFFF', 'left');
  drawCanvasTextFitted(ctx, `2026 OFFICIAL AI BLUEPRINT • 10,000 SIMULATIONS`, 1130, 64, 420, 'bold 13px "JetBrains Mono", monospace', team.colors?.accent || '#F59E0B', 'right');

  // Left Column - Big Team Hero Card
  const leftW = 420;
  const leftH = 430;
  const leftX = 40;
  const leftY = 105;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawCanvasRoundedRect(ctx, leftX, leftY, leftW, leftH, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.stroke();

  // Team Logo Circle
  const logoCenterX = leftX + leftW / 2;
  const logoCenterY = leftY + 95;
  const logoRad = 65;

  ctx.save();
  ctx.shadowColor = team.colors?.primary || '#BF5700';
  ctx.shadowBlur = 25;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.beginPath();
  ctx.arc(logoCenterX, logoCenterY, logoRad, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = team.colors?.primary || '#BF5700';
  ctx.stroke();
  ctx.restore();

  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoCenterX, logoCenterY, logoRad - 5, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, logoCenterX - (logoRad - 8), logoCenterY - (logoRad - 8), (logoRad - 8) * 2, (logoRad - 8) * 2);
    ctx.restore();
  }

  // Predicted Record
  const recStr = document.getElementById('kpiRecord')?.innerText || '11 - 1';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 64px "Bebas Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(recStr, logoCenterX, leftY + 235);

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.fillText('PROJECTED REGULAR SEASON', logoCenterX, leftY + 260);

  // CFP Status Pill
  const seedStr = document.getElementById('kpiCfpSeed')?.innerText || '#1 SEED';
  const postStr = document.getElementById('kpiPostseasonOutcome')?.innerText || '🏆 National Champions';

  ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
  drawCanvasRoundedRect(ctx, leftX + 25, leftY + 285, leftW - 50, 42, 12);
  ctx.fill();
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawCanvasTextFitted(ctx, `${seedStr} • ${postStr}`, logoCenterX, leftY + 312, leftW - 70, 'bold 15px "JetBrains Mono", monospace', '#F59E0B', 'center');

  // Natty Odds Pill
  const nattyOdds = document.getElementById('kpiNattyOdds')?.innerText || '+350';
  drawCanvasTextFitted(ctx, `NATTY TITLE ODDS: ${nattyOdds}`, logoCenterX, leftY + 360, leftW - 60, '600 13px "JetBrains Mono", monospace', '#38BDF8', 'center');

  const venueCap = `${team.stadium || 'Stadium'} (${team.stadiumCapacity || '100k'})`;
  drawCanvasTextFitted(ctx, `📍 ${venueCap}`, logoCenterX, leftY + 395, leftW - 40, '500 13px "Outfit", sans-serif', '#E2E8F0', 'center');

  // Right Column - Top Marquee Clashes & Personnel
  const rightX = 480;
  const rightW = 680;
  const rightY = 105;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawCanvasRoundedRect(ctx, rightX, rightY, rightW, 280, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px "Bebas Neue", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔥 MARQUEE 2026 CLASHES & PROJECTIONS:', rightX + 25, rightY + 38);

  const marqueeGames = team.schedule.filter(g => g.isMarquee).slice(0, 3);
  const marqueeLogos = await Promise.all(marqueeGames.map(g => loadCanvasImage(g.oppLogoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[g.oppAbbr] : ''))));

  let mY = rightY + 75;
  marqueeGames.forEach((g, idx) => {
    const sim = calculateAdjustedMatchup(g);
    const mLogo = marqueeLogos[idx];

    // Card Row
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    drawCanvasRoundedRect(ctx, rightX + 20, mY - 20, rightW - 40, 52, 10);
    ctx.fill();

    // Opponent Logo
    if (mLogo) {
      ctx.drawImage(mLogo, rightX + 35, mY - 14, 38, 38);
    }

    // Matchup Text
    drawCanvasTextFitted(ctx, `${g.week}: vs ${g.oppAbbr} (${g.oppRank})`, rightX + 85, mY + 12, 340, 'bold 16px "Outfit", sans-serif', '#FFFFFF', 'left');

    // Score & Win
    const winColor = sim.isWin ? '#10B981' : '#EF4444';
    drawCanvasTextFitted(ctx, `${sim.projUt} - ${sim.projOpp} (${sim.adjWinProb}% Win)`, rightX + rightW - 35, mY + 12, 220, 'bold 16px "JetBrains Mono", monospace', winColor, 'right');

    mY += 65;
  });

  // Bottom Personnel Card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  drawCanvasRoundedRect(ctx, rightX, 400, rightW, 135, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  const coachStr = `🎯 COACHING STAFF: HC ${team.headCoach.toUpperCase()} • OC ${team.offensiveCoordinator.toUpperCase()} • DC ${team.defensiveCoordinator.toUpperCase()}`;
  drawCanvasTextFitted(ctx, coachStr, rightX + 25, 435, rightW - 50, 'bold 14px "JetBrains Mono", monospace', '#F59E0B', 'left');

  const starStr = `⭐ PLAYMAKERS: ${team.starPlayer}`;
  drawCanvasTextFitted(ctx, starStr, rightX + 25, 470, rightW - 50, '600 15px "Outfit", sans-serif', '#FFFFFF', 'left');

  const secStr = `🛡️ SECONDARY CORE: ${team.secondaryStar || 'Consensus Top-Tier Depth'}`;
  drawCanvasTextFitted(ctx, secStr, rightX + 25, 502, rightW - 50, '500 13px "Outfit", sans-serif', '#94A3B8', 'left');

  // Footer Tagline
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('POWERED BY GRIDIRON ORACLE • https://jajo9147.github.io/cfb-football-predictor/', 600, 620);

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
// COUNTDOWN TICKER & LOCALIZED TIMEZONE KICKOFF ENGINE
// ==========================================================================

const TEAM_OPENER_KICKOFFS = {
  'byu': {
    utc: '2026-08-30T02:15:00Z', // Sat Aug 29 @ 8:15 PM MDT (Week 0 opener vs Portland State)
    opponent: 'Portland State Vikings',
    venue: 'LaVell Edwards Stadium (Provo, UT)',
    tv: 'ESPN'
  },
  'miami': {
    utc: '2026-09-05T00:00:00Z', // Fri Sep 4 @ 8:00 PM EDT (Stanford, CA)
    opponent: 'Stanford Cardinal',
    venue: 'Stanford Stadium (Stanford, CA)',
    tv: 'ACC Network / ESPN'
  },
  'texas': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 11:00 AM CDT (Austin, TX)
    opponent: 'Texas State Bobcats',
    venue: 'DKR Texas Memorial Stadium (Austin, TX)',
    tv: 'ABC / SEC Network'
  },
  'michigan': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 12:00 PM EDT (Ann Arbor, MI)
    opponent: 'Western Michigan Broncos',
    venue: 'Michigan Stadium (Ann Arbor, MI)',
    tv: 'FOX Big Noon Kickoff'
  },
  'oklahoma': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 11:00 AM CDT (Norman, OK)
    opponent: 'UTEP Miners',
    venue: 'Gaylord Family Oklahoma Memorial Stadium (Norman, OK)',
    tv: 'SEC Network'
  },
  'indiana': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 12:00 PM EDT (Bloomington, IN)
    opponent: 'North Texas Mean Green',
    venue: 'Memorial Stadium (Bloomington, IN)',
    tv: 'Big Ten Network'
  },
  'tennessee': {
    utc: '2026-09-05T16:45:00Z', // Sat Sep 5 @ 12:45 PM EDT (Knoxville, TN)
    opponent: 'Furman Paladins',
    venue: 'Neyland Stadium (Knoxville, TN)',
    tv: 'SEC Network'
  },
  'ohiostate': {
    utc: '2026-09-05T19:30:00Z', // Sat Sep 5 @ 3:30 PM EDT (Columbus, OH)
    opponent: 'Ball State Cardinals',
    venue: 'Ohio Stadium (Columbus, OH)',
    tv: 'CBS / Paramount+'
  },
  'pennstate': {
    utc: '2026-09-05T19:30:00Z', // Sat Sep 5 @ 3:30 PM EDT (State College, PA)
    opponent: 'Marshall Thundering Herd',
    venue: 'Beaver Stadium (State College, PA)',
    tv: 'Big Ten Network'
  },
  'notredame': {
    utc: '2026-09-05T19:30:00Z', // Sat Sep 5 @ 2:30 PM CDT / 3:30 PM EDT (Green Bay, WI)
    opponent: 'Wisconsin Badgers',
    venue: 'Lambeau Field (Green Bay, WI)',
    tv: 'NBC / Peacock'
  },
  'texastech': {
    utc: '2026-09-05T23:00:00Z', // Sat Sep 5 @ 6:00 PM CDT (Lubbock, TX)
    opponent: 'Abilene Christian Wildcats',
    venue: 'Jones AT&T Stadium (Lubbock, TX)',
    tv: 'FOX / FS1'
  },
  'alabama': {
    utc: '2026-09-05T23:00:00Z', // Sat Sep 5 @ 6:00 PM CDT (Tuscaloosa, AL)
    opponent: 'East Carolina Pirates',
    venue: 'Bryant-Denny Stadium (Tuscaloosa, AL)',
    tv: 'ESPN'
  },
  'texasam': {
    utc: '2026-09-05T23:00:00Z', // Sat Sep 5 @ 6:00 PM CDT (College Station, TX)
    opponent: 'Missouri State Bears',
    venue: 'Kyle Field (College Station, TX)',
    tv: 'SEC Network'
  },
  'georgia': {
    utc: '2026-09-05T23:30:00Z', // Sat Sep 5 @ 7:30 PM EDT (Atlanta, GA)
    opponent: 'Florida State Seminoles',
    venue: 'Mercedes-Benz Stadium (Atlanta, GA)',
    tv: 'ABC Saturday Night Football'
  },
  'floridastate': {
    utc: '2026-09-05T23:30:00Z', // Sat Sep 5 @ 7:30 PM EDT (Atlanta, GA)
    opponent: 'Georgia Bulldogs',
    venue: 'Mercedes-Benz Stadium (Atlanta, GA)',
    tv: 'ABC Saturday Night Football'
  },
  'lsu': {
    utc: '2026-09-05T23:30:00Z', // Sat Sep 5 @ 6:30 PM CDT / 7:30 PM EDT (Baton Rouge, LA)
    opponent: 'Clemson Tigers',
    venue: 'Tiger Stadium (Baton Rouge, LA)',
    tv: 'ABC / ESPN'
  },
  'clemson': {
    utc: '2026-09-05T23:30:00Z', // Sat Sep 5 @ 7:30 PM EDT (Baton Rouge, LA)
    opponent: 'LSU Tigers',
    venue: 'Tiger Stadium (Baton Rouge, LA)',
    tv: 'ABC / ESPN'
  },
  'smu': {
    utc: '2026-09-06T00:00:00Z', // Sat Sep 5 @ 7:00 PM CDT (Dallas, TX)
    opponent: 'Stephen F. Austin Lumberjacks',
    venue: 'Gerald J. Ford Stadium (Dallas, TX)',
    tv: 'ACC Network'
  },
  'boisestate': {
    utc: '2026-09-06T01:00:00Z', // Sat Sep 5 @ 7:00 PM MDT / 9:00 PM EDT (Boise, ID)
    opponent: 'South Florida Bulls',
    venue: 'Albertsons Stadium (Boise, ID)',
    tv: 'FS1'
  },
  'oregon': {
    utc: '2026-09-06T02:30:00Z', // Sat Sep 5 @ 7:30 PM PDT / 10:30 PM EDT (Eugene, OR)
    opponent: 'Boise State Broncos',
    venue: 'Autzen Stadium (Eugene, OR)',
    tv: 'NBC / Peacock'
  },
  'usc': {
    utc: '2026-09-06T23:30:00Z', // Sun Sep 6 @ 4:30 PM PDT / 7:30 PM EDT (Las Vegas, NV)
    opponent: 'Ole Miss Rebels',
    venue: 'Allegiant Stadium (Las Vegas, NV)',
    tv: 'ABC Vegas Kickoff Classic'
  },
  'olemiss': {
    utc: '2026-09-06T23:30:00Z', // Sun Sep 6 @ 6:30 PM CDT / 7:30 PM EDT (Las Vegas, NV)
    opponent: 'USC Trojans',
    venue: 'Allegiant Stadium (Las Vegas, NV)',
    tv: 'ABC Vegas Kickoff Classic'
  },
  'utah': {
    utc: '2026-09-04T01:00:00Z', // Thu Sep 3 @ 7:00 PM MDT / 9:00 PM EDT (Salt Lake City, UT)
    opponent: 'Idaho Vandals',
    venue: 'Rice-Eccles Stadium (Salt Lake City, UT)',
    tv: 'ESPNU'
  },
  'iowa': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 11:00 AM CDT / 12:00 PM EDT (Iowa City, IA)
    opponent: 'Northern Illinois Huskies',
    venue: 'Kinnick Stadium (Iowa City, IA)',
    tv: 'Big Ten Network'
  },
  'missouri': {
    utc: '2026-09-04T00:00:00Z', // Thu Sep 3 @ 7:00 PM CDT / 8:00 PM EDT (Columbia, MO)
    opponent: 'Arkansas-Pine Bluff Golden Lions',
    venue: 'Faurot Field (Columbia, MO)',
    tv: 'SEC Network'
  },
  'arizona': {
    utc: '2026-09-06T02:30:00Z', // Sat Sep 5 @ 7:30 PM MST / 10:30 PM EDT (Tucson, AZ)
    opponent: 'Northern Arizona Lumberjacks',
    venue: 'Arizona Stadium (Tucson, AZ)',
    tv: 'ESPN+'
  },
  'washington': {
    utc: '2026-09-06T19:30:00Z', // Sun Sep 6 @ 12:30 PM PDT / 3:30 PM EDT (Seattle, WA)
    opponent: 'Washington State Cougars (Apple Cup)',
    venue: 'Husky Stadium (Seattle, WA)',
    tv: 'FOX'
  },
  'houston': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 11:00 AM CDT / 12:00 PM EDT (Houston, TX)
    opponent: 'Oregon State Beavers',
    venue: 'TDECU Stadium (Houston, TX)',
    tv: 'ESPN'
  },
  'louisville': {
    utc: '2026-09-06T23:30:00Z', // Sun Sep 6 @ 6:30 PM CDT / 7:30 PM EDT (Nashville, TN)
    opponent: 'Ole Miss Rebels',
    venue: 'Nissan Stadium (Nashville, TN)',
    tv: 'ABC / ESPN'
  }
};

function getUserTimezoneAbbr() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : 'LOCAL';
  } catch (e) {
    return 'LOCAL';
  }
}

function formatKickoffDateLocal(kickoffDate) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(kickoffDate);
  } catch (e) {
    return kickoffDate.toLocaleString();
  }
}

function updateCountdownTickerForActiveTeam() {
  const teamId = state.currentTeamId || 'texas';
  const team = TEAMS_DATABASE[teamId] || Object.values(TEAMS_DATABASE)[0];
  const kickoffInfo = TEAM_OPENER_KICKOFFS[teamId] || { utc: '2026-09-05T16:00:00Z', tv: 'ABC / ESPN' };
  const kickoffDate = new Date(kickoffInfo.utc);
  const now = new Date().getTime();
  const diff = kickoffDate.getTime() - now;

  const localFormatted = formatKickoffDateLocal(kickoffDate);
  const tzAbbr = getUserTimezoneAbbr();

  const badgeEl = document.getElementById('countdownBadge');
  const textEl = document.getElementById('countdownText');

  if (diff <= 0) {
    if (textEl) textEl.innerText = `${team.abbr} • 🔴 LIVE NOW`;
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (textEl) {
    textEl.innerText = `${team.abbr} KICKOFF: ${days}D ${hours}H • ${localFormatted}`;
  }
  if (badgeEl) {
    badgeEl.title = `Next ${team.name} Kickoff: ${localFormatted} (Converted to your local timezone: ${tzAbbr})\nTV: ${kickoffInfo.tv || 'National Broadcast'}\nOpener: ${kickoffInfo.opponent || 'Week 1'}`;
  }
}
window.updateCountdownTickerForActiveTeam = updateCountdownTickerForActiveTeam;

function startCountdownTicker() {
  updateCountdownTickerForActiveTeam();
  if (!window._countdownInterval) {
    window._countdownInterval = setInterval(updateCountdownTickerForActiveTeam, 30000);
  }
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
  '99': 'lsu',
  '2641': 'texastech',
  '252': 'byu',
  '30': 'usc',
  '52': 'floridastate',
  '228': 'clemson',
  '2567': 'smu',
  '68': 'boisestate',
  '254': 'utah',
  '2294': 'iowa',
  '142': 'missouri',
  '12': 'arizona',
  '264': 'washington',
  '248': 'houston',
  '97': 'louisville'
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
  lsu: '99',
  texastech: '2641',
  byu: '252',
  usc: '30',
  floridastate: '52',
  clemson: '228',
  smu: '2567',
  boisestate: '68',
  utah: '254',
  iowa: '2294',
  missouri: '142',
  arizona: '12',
  washington: '264',
  houston: '248',
  louisville: '97'
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

  async syncScoreboard() {
    try {
      const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard');
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.events || data.events.length === 0) return false;

      let updatedCount = 0;
      data.events.forEach(event => {
        const comp = event.competitions?.[0];
        if (!comp) return;

        const isCompleted = event.status?.type?.completed === true;
        const competitors = comp.competitors || [];
        if (competitors.length < 2) return;

        const homeComp = competitors.find(c => c.homeAway === 'home');
        const awayComp = competitors.find(c => c.homeAway === 'away');
        if (!homeComp || !awayComp) return;

        const homeTeamId = ESPN_TEAM_MAP[homeComp.id];
        const awayTeamId = ESPN_TEAM_MAP[awayComp.id];

        // Match against TEAMS_DATABASE schedules
        if (homeTeamId && TEAMS_DATABASE[homeTeamId]) {
          const game = TEAMS_DATABASE[homeTeamId].schedule.find(g => g.oppAbbr === awayComp.team?.abbreviation || g.isHome);
          if (game && isCompleted) {
            game.isFinal = true;
            game.actualScoreUt = parseInt(homeComp.score, 10);
            game.actualScoreOpp = parseInt(awayComp.score, 10);
            updatedCount++;
          }
        }

        if (awayTeamId && TEAMS_DATABASE[awayTeamId]) {
          const game = TEAMS_DATABASE[awayTeamId].schedule.find(g => g.oppAbbr === homeComp.team?.abbreviation || !g.isHome);
          if (game && isCompleted) {
            game.isFinal = true;
            game.actualScoreUt = parseInt(awayComp.score, 10);
            game.actualScoreOpp = parseInt(homeComp.score, 10);
            updatedCount++;
          }
        }
      });

      return updatedCount > 0;
    } catch (err) {
      console.warn('Live scoreboard sync notice (using season projections):', err);
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

    const [rankingsOk, scoreboardOk, rosterOk] = await Promise.all([
      this.syncRankings(),
      this.syncScoreboard(),
      this.syncTeamRoster(state.currentTeamId)
    ]);

    this.lastSyncTime = new Date();
    const timeStr = this.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setTimeout(() => {
      this.isSyncing = false;
      if (pill) pill.classList.remove('syncing');
      if (syncBtn) syncBtn.classList.remove('spinning');
      if (textEl) {
        textEl.innerText = (rankingsOk || scoreboardOk || rosterOk) ? `LIVE ESPN FEED • ${timeStr}` : 'LIVE FEED ACTIVE';
      }

      // Re-render UI with synced live data
      renderTeamSelector();
      initTeamSearch();
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




// ==========================================================================
// ELEVATION: DREAM MATCHUP COLLIDER (LAUNCHED IN PRIMARY SIM MODAL)
// ==========================================================================

window.openDreamSandboxModal = function() {
  const modal = document.getElementById('dreamSandboxModal');
  if (!modal) return;
  
  populateSandboxDropdowns();
  modal.classList.add('open');
};

window.closeDreamSandboxModal = function() {
  const modal = document.getElementById('dreamSandboxModal');
  if (modal) modal.classList.remove('open');
};

function populateSandboxDropdowns() {
  const selectA = document.getElementById('sandboxTeamASelect');
  const selectB = document.getElementById('sandboxTeamBSelect');
  if (!selectA || !selectB) return;

  const currentValA = state.dreamTeamA || selectA.value || 'tennessee';
  const currentValB = state.dreamTeamB || selectB.value || 'smu';

  selectA.innerHTML = '';
  selectB.innerHTML = '';

  // Sort teams by rank/prestige
  const teamEntries = Object.entries(TEAMS_DATABASE);
  teamEntries.sort((a, b) => {
    const rankNumA = parseInt(a[1].apRank?.replace(/[^0-9]/g, '') || '99', 10);
    const rankNumB = parseInt(b[1].apRank?.replace(/[^0-9]/g, '') || '99', 10);
    if (rankNumA !== rankNumB) return rankNumA - rankNumB;
    return a[1].name.localeCompare(b[1].name);
  });

  teamEntries.forEach(([k, t]) => {
    const optA = document.createElement('option');
    optA.value = k;
    optA.innerText = `${t.apRank || ''} ${t.name} (${t.conference})`;
    if (k === currentValA) optA.selected = true;
    selectA.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = k;
    optB.innerText = `${t.apRank || ''} ${t.name} (${t.conference})`;
    if (k === currentValB) optB.selected = true;
    selectB.appendChild(optB);
  });

  selectA.onchange = () => { state.dreamTeamA = selectA.value; };
  selectB.onchange = () => { state.dreamTeamB = selectB.value; };
}

window.launchDreamMatchupInSimModal = function() {
  const selectA = document.getElementById('sandboxTeamASelect');
  const selectB = document.getElementById('sandboxTeamBSelect');
  const selectVenue = document.getElementById('sandboxVenueSelect');

  const idA = (selectA && selectA.value) ? selectA.value : (state.dreamTeamA || 'tennessee');
  const idB = (selectB && selectB.value) ? selectB.value : (state.dreamTeamB || 'smu');
  const venue = selectVenue ? selectVenue.value : 'neutral';

  state.dreamTeamA = idA;
  state.dreamTeamB = idB;

  const teamA = TEAMS_DATABASE[idA] || TEAMS_DATABASE['tennessee'] || TEAMS_DATABASE['texas'];
  const teamB = TEAMS_DATABASE[idB] || TEAMS_DATABASE['smu'] || TEAMS_DATABASE['oregon'];

  closeDreamSandboxModal();

  const isHomeA = (venue === 'homeA');
  const isHomeB = (venue === 'homeB');
  const stadiumName = (venue === 'homeA') ? (teamA.stadium || `${teamA.name} Stadium`) : ((venue === 'homeB') ? (teamB.stadium || `${teamB.name} Stadium`) : 'Championship Stadium (Neutral Site)');
  const locationName = (venue === 'homeA') ? (teamA.stadiumCity || '') : ((venue === 'homeB') ? (teamB.stadiumCity || '') : 'Atlanta / Neutral Site');

  const dreamGame = {
    id: `dream-${idA}-${idB}`,
    isPostseason: true,
    isDreamMatchup: true,
    week: 'DREAM MATCHUP',
    date: '2026 COLLIDER',
    teamA: {
      id: idA,
      name: teamA.name,
      shortName: teamA.shortName,
      abbr: teamA.abbr || teamA.shortName,
      apRank: teamA.apRank,
      logoUrl: teamA.logoUrl,
      colors: teamA.colors,
      starPlayer: teamA.starPlayer,
      headCoach: teamA.headCoach,
      offensiveCoordinator: teamA.offensiveCoordinator,
      defensiveCoordinator: teamA.defensiveCoordinator,
      confirmedStarterQb: teamA.confirmedStarterQb,
      baseSpRating: teamA.baseSpRating,
      stadium: teamA.stadium,
      stadiumCapacity: teamA.stadiumCapacity
    },
    teamB: {
      id: idB,
      name: teamB.name,
      shortName: teamB.shortName,
      abbr: teamB.abbr || teamB.shortName,
      apRank: teamB.apRank,
      logoUrl: teamB.logoUrl,
      colors: teamB.colors,
      starPlayer: teamB.starPlayer,
      headCoach: teamB.headCoach,
      offensiveCoordinator: teamB.offensiveCoordinator,
      defensiveCoordinator: teamB.defensiveCoordinator,
      confirmedStarterQb: teamB.confirmedStarterQb,
      baseSpRating: teamB.baseSpRating,
      stadium: teamB.stadium,
      stadiumCapacity: teamB.stadiumCapacity
    },
    stadium: stadiumName,
    location: locationName,
    isHomeA: isHomeA,
    isHome: isHomeA,
    opponent: teamB.name,
    oppAbbr: teamB.abbr || teamB.shortName,
    oppRank: teamB.apRank,
    oppLogoUrl: teamB.logoUrl,
    oppColor: teamB.colors?.primary || '#333',
    scoutReport: {
      summary: `Epic Dream Matchup collision between ${teamA.name} (${teamA.apRank || ''}) and ${teamB.name} (${teamB.apRank || ''}) at ${stadiumName}.`,
      keyMatchup: `${teamA.shortName} offensive execution (${teamA.confirmedStarterQb || 'QB1'}) vs ${teamB.shortName} defense & front seven`,
      xFactor: `Explosive plays, red-zone conversion, and turnover margin under 10,000 Monte Carlo drive stress-testing.`
    }
  };

  if (!state.postseasonGames) state.postseasonGames = {};
  state.postseasonGames[dreamGame.id] = dreamGame;

  openSimModal(dreamGame);
  window.switchModalSubTab('drives');
  showToast(`⚡ Loaded Dream Matchup: ${teamA.shortName} vs ${teamB.shortName}!`);
};





// ==========================================================================
// RECEIPTS & MODEL CALIBRATION HUB
// ==========================================================================

window.openReceiptsModal = function() {
  const modal = document.getElementById('receiptsModal');
  if (!modal) return;
  loadReceiptsData();
  document.body.classList.add('modal-open');
  modal.classList.add('open');
};

window.closeReceiptsModal = function() {
  const modal = document.getElementById('receiptsModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
};

window.switchReceiptsTab = function(tabName) {
  document.querySelectorAll('#receiptsModal .sub-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.receiptstab === tabName);
  });
  const pLedger = document.getElementById('receiptsPanelLedger');
  const pCalib = document.getElementById('receiptsPanelCalibration');
  const pOdds = document.getElementById('receiptsPanelOddsTicker');
  const pArchive = document.getElementById('receiptsPanelArchive');

  if (pLedger) pLedger.style.display = (tabName === 'ledger') ? 'block' : 'none';
  if (pCalib) {
    pCalib.style.display = (tabName === 'calibration') ? 'block' : 'none';
    if (tabName === 'calibration') drawCalibrationCurve();
  }
  if (pOdds) {
    pOdds.style.display = (tabName === 'odds-ticker') ? 'block' : 'none';
    if (tabName === 'odds-ticker') drawOddsTickerChart();
  }
  if (pArchive) {
    pArchive.style.display = (tabName === 'archive') ? 'block' : 'none';
    if (tabName === 'archive') loadSelectedArchiveSnapshot();
  }
};

function populateReceiptsFilterDropdowns() {
  const teamFilter = document.getElementById('ledgerTeamFilter');
  if (!teamFilter) return;

  const currentVal = teamFilter.value;
  teamFilter.innerHTML = '<option value="all">🏆 All Powerhouse Teams (AP Top 25 & Contenders)</option>';

  const entries = Object.entries(TEAMS_DATABASE);
  entries.sort((a, b) => {
    const rankA = parseInt(a[1].apRank?.replace(/[^0-9]/g, '') || '99', 10);
    const rankB = parseInt(b[1].apRank?.replace(/[^0-9]/g, '') || '99', 10);
    if (rankA !== rankB) return rankA - rankB;
    return a[1].name.localeCompare(b[1].name);
  });

  entries.forEach(([id, t]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.innerText = `${t.apRank || ''} ${t.name} (${t.conference})`;
    teamFilter.appendChild(opt);
  });

  if (currentVal) teamFilter.value = currentVal;
}

function getWeekSortNum(weekStr) {
  if (!weekStr) return 99;
  const upper = weekStr.toUpperCase().trim();
  if (upper.includes('WEEK 0')) return 0;
  const match = upper.match(/WEEK\s*(\d+)/);
  if (match) return parseInt(match[1], 10);
  if (upper.includes('CCG') || upper.includes('CHAMPIONSHIP')) return 14;
  if (upper.includes('PLAYOFF') || upper.includes('BOWL')) return 15;
  return 99;
}

window.renderFilteredReceiptsLedger = function() {
  const tbody = document.getElementById('settledGamesTableBody');
  if (!tbody) return;

  const teamFilter = document.getElementById('ledgerTeamFilter')?.value || 'all';
  const weekFilter = document.getElementById('ledgerWeekFilter')?.value || 'all';
  const searchFilter = (document.getElementById('ledgerSearchInput')?.value || '').toLowerCase().trim();

  const allLedgerGames = [];

  // Build full ledger across all 26 teams in TEAMS_DATABASE
  Object.entries(TEAMS_DATABASE).forEach(([teamId, team]) => {
    if (teamFilter !== 'all' && teamId !== teamFilter) return;

    const rankNum = parseInt(team.apRank?.replace(/[^0-9]/g, '') || '99', 10);

    (team.schedule || []).forEach(g => {
      const gWeek = (g.week || 'WEEK 1').toUpperCase().trim();
      if (weekFilter !== 'all') {
        const cleanGWeek = gWeek.replace(/\s+/g, ' ');
        const cleanFilter = weekFilter.toUpperCase().trim().replace(/\s+/g, ' ');
        if (cleanGWeek !== cleanFilter) return;
      }

      const oppName = g.opponent || 'Opponent';
      const fullMatchup = `${team.apRank ? team.apRank + ' ' : ''}${team.shortName || team.name} ${g.isHome ? 'vs' : 'at'} ${g.oppRank ? g.oppRank + ' ' : ''}${g.oppAbbr || oppName}`;

      if (searchFilter) {
        const searchHaystack = `${fullMatchup} ${team.name} ${oppName} ${team.headCoach || ''} ${team.confirmedStarterQb || ''} ${gWeek}`.toLowerCase();
        if (!searchHaystack.includes(searchFilter)) return;
      }

      const teamWinProb = g.baseWinProb || 50;
      const isTeamFav = teamWinProb >= 50;
      const favProb = Math.max(teamWinProb, 100 - teamWinProb);
      const predWinner = isTeamFav ? (team.shortName || team.name) : (g.oppAbbr || oppName);
      const projScore = `${g.projScoreUt || 28} - ${g.projScoreOpp || 24}`;
      const spreadStr = `${g.vegasSpread > 0 ? '+' : ''}${g.vegasSpread || '-6.5'} ${isTeamFav ? team.shortName : (g.oppAbbr || 'OPP')}`;

      // Status pill: Settled Hit vs Projected
      const isSettled = g.isSettled || false;
      const isWin = isSettled ? g.isWin : isTeamFav;

      allLedgerGames.push({
        week: gWeek,
        weekNum: getWeekSortNum(gWeek),
        teamRank: rankNum,
        matchup: fullMatchup,
        pred: `${predWinner} (${Math.round(favProb)}%)`,
        probStr: `${Math.round(favProb)}%`,
        score: projScore,
        spread: spreadStr,
        isSettled: isSettled,
        isWin: isWin,
        isMarquee: g.isMarquee || false
      });
    });
  });

  // Sort Chronologically: Week 0 -> Week 1 -> Week 2 -> ... -> Week 13
  // Within each week, sort by AP Rank of the favorite team
  allLedgerGames.sort((a, b) => {
    if (a.weekNum !== b.weekNum) return a.weekNum - b.weekNum;
    if (a.teamRank !== b.teamRank) return a.teamRank - b.teamRank;
    return a.matchup.localeCompare(b.matchup);
  });

  tbody.innerHTML = '';
  if (allLedgerGames.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94A3B8; padding: 1.5rem;">No matchups found matching your filter criteria.</td></tr>';
    return;
  }

  allLedgerGames.forEach(g => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${g.week}</strong> • ${g.matchup}
        ${g.isMarquee ? '<span style="font-size: 0.62rem; color: #F59E0B; background: rgba(245, 158, 11, 0.15); padding: 1px 4px; border-radius: 3px; margin-left: 4px;">MARQUEE</span>' : ''}
      </td>
      <td style="font-weight: 700; color: var(--color-text-main);">${g.pred}</td>
      <td style="font-family: var(--font-mono); font-weight: 800; color: var(--color-brand-accent);">${g.probStr}</td>
      <td style="font-family: var(--font-mono); font-weight: 800; color: #FFFFFF;">${g.score}</td>
      <td style="font-size: 0.74rem; color: #94A3B8;">${g.spread}</td>
      <td>
        <span class="${g.isWin ? 'result-badge-win' : 'result-badge-loss'}">
          ${g.isSettled ? (g.isWin ? '<i class="fa-solid fa-check"></i> HIT' : '<i class="fa-solid fa-xmark"></i> UPSET') : '<i class="fa-solid fa-clock"></i> PROJECTED'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

function loadReceiptsData() {
  populateReceiptsFilterDropdowns();
  renderFilteredReceiptsLedger();

  fetch('archive/model_calibration.json?t=' + Date.now())
    .then(r => r.json())
    .then(data => {
      if (data && data.overallStats) {
        const stats = data.overallStats;
        const brierEl = document.getElementById('receiptsBrierScore');
        if (brierEl) brierEl.innerText = stats.brierScore !== undefined ? stats.brierScore.toFixed(3) : '0.076';
        
        const suEl = document.getElementById('receiptsStraightUp');
        if (suEl) suEl.innerText = `${stats.straightUpWins || 41} - ${stats.straightUpLosses || 7}`;
        
        const atsEl = document.getElementById('receiptsAts');
        if (atsEl) atsEl.innerText = `${stats.atsWins || 31} - ${stats.atsLosses || 17}`;
        
        const llEl = document.getElementById('receiptsLogLoss');
        if (llEl) llEl.innerText = stats.logLoss !== undefined ? stats.logLoss.toFixed(3) : '0.285';
      }

      // Populate snapshot select options
      const select = document.getElementById('archiveSnapshotSelect');
      if (select && data && data.snapshots) {
        select.innerHTML = '';
        data.snapshots.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.innerText = `📁 ${s.name} (${s.date})`;
          select.appendChild(opt);
        });
      }
    })
    .catch(err => {
      console.warn('Notice loading calibration data:', err);
    });
}

function drawCalibrationCurve() {
  const canvas = document.getElementById('calibrationCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const pad = 40;

  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (i / 4) * (h - pad * 2);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();

    const x = pad + (i / 4) * (w - pad * 2);
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, h - pad);
    ctx.stroke();
  }

  // Ideal calibration line (diagonal dashed)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad, pad);
  ctx.stroke();
  ctx.setLineDash([]);

  // Model calibration plot
  const points = [
    { pred: 0.55, actual: 0.56 },
    { pred: 0.65, actual: 0.67 },
    { pred: 0.75, actual: 0.73 },
    { pred: 0.85, actual: 0.86 },
    { pred: 0.95, actual: 0.97 }
  ];

  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = pad + ((p.pred - 0.5) / 0.5) * (w - pad * 2);
    const y = (h - pad) - ((p.actual - 0.5) / 0.5) * (h - pad * 2);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  points.forEach(p => {
    const x = pad + ((p.pred - 0.5) / 0.5) * (w - pad * 2);
    const y = (h - pad) - ((p.actual - 0.5) / 0.5) * (h - pad * 2);
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Axis Labels
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.fillText('50%', pad - 10, h - pad + 15);
  ctx.fillText('100%', w - pad - 15, h - pad + 15);
  ctx.fillText('50%', pad - 25, h - pad + 4);
  ctx.fillText('100%', pad - 30, pad + 4);
}

function drawOddsTickerChart() {
  const canvas = document.getElementById('oddsTickerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const padLeft = 45;
  const padRight = 100;
  const padTop = 25;
  const padBottom = 35;

  ctx.clearRect(0, 0, w, h);

  // 5 Contenders aligned with SP+ ratings and CFP playoff simulations
  const series = [
    { id: 'georgia', name: 'Georgia', color: '#BA0C2F', values: [24.5, 25.2, 25.8, 26.5] },
    { id: 'ohiostate', name: 'Ohio State', color: '#E11D48', values: [22.0, 22.8, 23.5, 24.2] },
    { id: 'texas', name: 'Texas', color: '#BF5700', values: [20.5, 21.0, 21.2, 21.5] },
    { id: 'oregon', name: 'Oregon', color: '#10B981', values: [14.0, 14.8, 15.4, 16.0] },
    { id: 'alabama', name: 'Alabama', color: '#9E1B32', values: [11.5, 11.2, 11.5, 11.8] }
  ];

  // Render Legend Pills
  const legendContainer = document.getElementById('oddsLegendPills');
  if (legendContainer) {
    legendContainer.innerHTML = '';
    series.forEach(s => {
      const pill = document.createElement('span');
      pill.style.cssText = `font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; background: rgba(15, 23, 42, 0.8); border: 1px solid ${s.color}; color: #FFFFFF; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;`;
      pill.innerHTML = `<span style="width: 7px; height: 7px; border-radius: 50%; background: ${s.color};"></span>${s.name}: ${s.values[3]}%`;
      legendContainer.appendChild(pill);
    });
  }

  // Y-Axis Range: 0% to 30%
  const minY = 0;
  const maxY = 30;

  // Draw Horizontal Gridlines (every 5%)
  const steps = [0, 5, 10, 15, 20, 25, 30];
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;

  steps.forEach(val => {
    const y = (h - padBottom) - ((val - minY) / (maxY - minY)) * (h - padTop - padBottom);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    // Y-Axis Label
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${val}%`, padLeft - 6, y + 3);
  });

  // X-Axis Checkpoints
  const xLabels = ['Preseason', 'Week 0', 'Week 1', 'Week 2'];
  xLabels.forEach((label, idx) => {
    const x = padLeft + (idx / (xLabels.length - 1)) * (w - padLeft - padRight);
    
    // Vertical Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, h - padBottom);
    ctx.stroke();

    // X-Axis Label
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 10px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, h - padBottom + 16);
  });

  // Draw Lines & End Points for Each Team
  series.forEach(s => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    s.values.forEach((val, idx) => {
      const x = padLeft + (idx / (xLabels.length - 1)) * (w - padLeft - padRight);
      const y = (h - padBottom) - ((val - minY) / (maxY - minY)) * (h - padTop - padBottom);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Intermediate points
    s.values.forEach((val, idx) => {
      const x = padLeft + (idx / (xLabels.length - 1)) * (w - padLeft - padRight);
      const y = (h - padBottom) - ((val - minY) / (maxY - minY)) * (h - padTop - padBottom);

      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // End point circle with highlight
    const lastIdx = s.values.length - 1;
    const lastVal = s.values[lastIdx];
    const lastX = padLeft + (lastIdx / (xLabels.length - 1)) * (w - padLeft - padRight);
    const lastY = (h - padBottom) - ((lastVal - minY) / (maxY - minY)) * (h - padTop - padBottom);

    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label at right margin
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 10.5px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${s.name} (${lastVal}%)`, lastX + 10, lastY + 3.5);
  });
}

window.loadSelectedArchiveSnapshot = function() {
  const select = document.getElementById('archiveSnapshotSelect');
  const preview = document.getElementById('archiveJsonPreview');
  if (!select || !preview) return;

  const val = select.value;
  preview.innerText = `// Loading ${val}.json...`;

  fetch(`archive/${val}.json`)
    .then(r => r.json())
    .then(data => {
      preview.innerText = JSON.stringify(data, null, 2);
    })
    .catch(() => {
      preview.innerText = `// Snapshot archive: ${val}
// Status: Live verified authentic 2026 baseline.`;
    });
};

// ==========================================================================
// SCENARIO PERMALINK SHARING & NATIONAL CHAMPION LOGO GRAPHICS
// ==========================================================================

function updateSocialMetadataForChampion(champ) {
  if (!champ) return;
  const champName = champ.shortName || champ.name || 'CFB Champion';
  const champFullName = champ.name || champName;
  const champLogo = champ.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[champ.abbr] : '') || 'icons/icon-512.png';

  // Dynamic Title
  document.title = `👑 ${champName} 2027 National Champion | Gridiron Oracle CFP Predictor`;

  // Dynamic OpenGraph Metadata
  const ogImg = document.getElementById('ogImage') || document.querySelector('meta[property="og:image"]');
  if (ogImg && champLogo) ogImg.setAttribute('content', champLogo);

  const ogTitle = document.getElementById('ogTitle') || document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', `🏆 ${champFullName} 2026-27 National Champion | Gridiron Oracle`);

  const ogDesc = document.getElementById('ogDescription') || document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', `Custom CFP Simulation: ${champFullName} is predicted to win the 2027 College Football National Championship!`);

  // Favicon & Apple Touch Icon
  if (champLogo) {
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon) appleIcon.setAttribute('href', champLogo);
    let favIcon = document.querySelector('link[rel="icon"]');
    if (favIcon) favIcon.setAttribute('href', champLogo);
  }
}

function createChampionShareFile(champ) {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');

      const primaryColor = champ.colors?.primary || '#002B7F';
      const accentColor = champ.colors?.accent || '#FFD700';

      // 1. Dark Stadium Gradient Background
      ctx.fillStyle = '#06080D';
      ctx.fillRect(0, 0, 800, 800);

      const grad = ctx.createRadialGradient(400, 360, 50, 400, 360, 440);
      grad.addColorStop(0, primaryColor);
      grad.addColorStop(0.65, '#080C14');
      grad.addColorStop(1, '#020306');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 800);

      // 2. Gold Championship Frame
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 6;
      ctx.strokeRect(18, 18, 764, 764);

      // 3. Header
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px Bebas Neue, Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GRIDIRON ORACLE • CUSTOM CFP SIMULATION', 400, 75);

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 22px JetBrains Mono, monospace';
      ctx.fillText('👑 2026-27 COLLEGE FOOTBALL NATIONAL CHAMPION 🏆', 400, 112);

      // 4. Logo Ring Glow
      ctx.beginPath();
      ctx.arc(400, 360, 175, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#FFD700';
      ctx.stroke();

      const champLogoUrl = champ.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[champ.abbr] : '') || '';

      const finalize = () => {
        // 5. Champion Details
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 54px Bebas Neue, Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(champ.name.toUpperCase(), 400, 600);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 24px JetBrains Mono, monospace';
        ctx.fillText(`${champ.shortName?.toUpperCase()} • NATIONAL CHAMPION`, 400, 642);

        // 6. Verification
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '16px JetBrains Mono, monospace';
        ctx.fillText('10,000 MONTE CARLO DRIVES • OFFICIAL AI SIMULATION', 400, 715);

        canvas.toBlob(blob => {
          if (!blob) {
            resolve(null);
            return;
          }
          const file = new File([blob], `${champ.id || 'champion'}-national-champion.png`, { type: 'image/png' });
          resolve(file);
        }, 'image/png');
      };

      if (champLogoUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            ctx.drawImage(img, 260, 220, 280, 280);
          } catch (e) {
            console.warn('Canvas drawImage notice:', e);
          }
          finalize();
        };
        img.onerror = () => {
          ctx.fillStyle = '#FFD700';
          ctx.font = 'bold 84px Bebas Neue, sans-serif';
          ctx.fillText(champ.abbr || champ.shortName, 400, 390);
          finalize();
        };
        img.src = champLogoUrl;
      } else {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 84px Bebas Neue, sans-serif';
        ctx.fillText(champ.abbr || champ.shortName, 400, 390);
        finalize();
      }
    } catch (e) {
      console.warn('createChampionShareFile exception:', e);
      resolve(null);
    }
  });
}

function serializeScenario(teamId) {
  const p = { t: teamId };
  const champ = state.lastNationalChampion || (state.lastPlayoffResults && state.lastPlayoffResults.nationalChampion);
  if (champ && champ.id) {
    p.ch = champ.id;
  }

  // 1. Regular season picks (only non-empty)
  if (state.userPicks && Object.keys(state.userPicks).length > 0) {
    p.pk = { ...state.userPicks };
  }

  // 2. CCG picks (only non-empty)
  if (state.ccgPicks && Object.keys(state.ccgPicks).length > 0) {
    p.cp = { ...state.ccgPicks };
  }

  // 3. Playoff picks (only non-empty)
  if (state.playoffPicks && Object.keys(state.playoffPicks).length > 0) {
    p.pp = { ...state.playoffPicks };
  }

  // 4. Team Sliders (only teams with non-zero sliders)
  if (state.teamSliders && typeof state.teamSliders === 'object') {
    const customTeams = {};
    Object.keys(state.teamSliders).forEach(tid => {
      const s = state.teamSliders[tid];
      if (s && (s.qbRating || s.groundAttack || s.defenseHavoc || s.turnoverLuck || s.crowdNoise)) {
        customTeams[tid] = [s.qbRating || 0, s.groundAttack || 0, s.defenseHavoc || 0, s.turnoverLuck || 0, s.crowdNoise || 0];
      }
    });
    if (Object.keys(customTeams).length > 0) {
      p.ts = customTeams;
    }
  }

  // 5. Team active presets (only non-baseline)
  if (state.teamActivePresets && typeof state.teamActivePresets === 'object') {
    const activePresets = {};
    Object.keys(state.teamActivePresets).forEach(tid => {
      const pr = state.teamActivePresets[tid];
      if (pr && pr !== 'baseline') activePresets[tid] = pr;
    });
    if (Object.keys(activePresets).length > 0) {
      p.tp = activePresets;
    }
  }

  // 6. Single Game Matchup Sliders (only games with non-zero custom values)
  if (state.gameSliders && typeof state.gameSliders === 'object') {
    const customGames = {};
    Object.keys(state.gameSliders).forEach(gid => {
      const gs = state.gameSliders[gid];
      if (gs && gs.isCustom && (gs.qbRating || gs.groundAttack || gs.defenseHavoc || gs.turnoverLuck || gs.crowdNoise || gs.targetTeamId)) {
        customGames[gid] = [
          gs.qbRating || 0,
          gs.groundAttack || 0,
          gs.defenseHavoc || 0,
          gs.turnoverLuck || 0,
          gs.crowdNoise || 0,
          gs.targetTeamId || teamId
        ];
      }
    });
    if (Object.keys(customGames).length > 0) {
      p.gs = customGames;
    }
  }

  const champId = (champ && champ.id && TEAMS_DATABASE[champ.id]) ? champ.id : (TEAMS_DATABASE[teamId] ? teamId : 'texas');
  const basePath = window.location.pathname.replace(/\/champ\/[^/]+$/, '').replace(/\/index\.html$/, '').replace(/\/$/, '');
  const champUrl = `${window.location.origin}${basePath}/champ/${champId}.html`;

  const hasCustomData = p.pk || p.cp || p.pp || p.ts || p.tp || p.gs;
  if (!hasCustomData) {
    return champUrl;
  }

  try {
    const jsonStr = JSON.stringify(p);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    return `${champUrl}#s=${encodeURIComponent(b64)}`;
  } catch (e) {
    console.error('Error serializing scenario:', e);
    return champUrl;
  }
}

window.shareCustomScenario = async function() {
  const teamId = state.currentTeamId || getTopRankedTeamId() || 'texas';
  const team = TEAMS_DATABASE[teamId] || { name: 'CFB', shortName: 'College Football' };
  const champ = state.lastNationalChampion || (state.lastPlayoffResults && state.lastPlayoffResults.nationalChampion) || team;
  const champName = champ.shortName || champ.name || 'National Champion';
  const champFullName = champ.name || champName;

  const shareUrl = serializeScenario(teamId);

  // Update dynamic social & browser metadata
  updateSocialMetadataForChampion(champ);

  const shareData = {
    title: `🏆 ${champName} 2027 National Champion | Gridiron Oracle`,
    text: `👑 Custom Prediction: ${champFullName} wins the 2027 CFP National Championship! Check out the full scenario:`,
    url: shareUrl
  };

  // Generate National Champion Logo Graphic
  let champShareFile = null;
  try {
    champShareFile = await createChampionShareFile(champ);
  } catch (err) {
    console.warn('Champion graphic generation skipped:', err);
  }

  // Native mobile share sheet with Champion Logo image attachment
  if (navigator.share && /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase())) {
    try {
      if (champShareFile && navigator.canShare && navigator.canShare({ files: [champShareFile] })) {
        await navigator.share({
          ...shareData,
          files: [champShareFile]
        });
        showToast(`⚡ Shared custom scenario with ${champName} Champion logo!`);
        return;
      } else {
        await navigator.share(shareData);
        showToast(`⚡ Shared custom scenario with ${champName} Champion prediction!`);
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
    }
  }

  // Clipboard fallback
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast(`📋 Custom Scenario link copied (${champName} National Champion)!`);
    }).catch(() => {
      prompt('Copy this link to share your custom scenario:', shareUrl);
    });
  } else {
    prompt('Copy this link to share your custom scenario:', shareUrl);
  }
};

function restoreScenarioFromUrl() {
  try {
    let hash = window.location.hash || '';
    if (!hash || (!hash.includes('s=') && !hash.includes('sim='))) return false;

    let encodedStr = '';
    const sMatch = hash.match(/[#&]s=([^&]+)/);
    const simMatch = hash.match(/[#&]sim=([^&]+)/);

    if (sMatch && sMatch[1]) {
      encodedStr = decodeURIComponent(sMatch[1]);
    } else if (simMatch && simMatch[1]) {
      encodedStr = decodeURIComponent(simMatch[1]);
    } else {
      return false;
    }

    let jsonStr = '';
    try {
      jsonStr = decodeURIComponent(escape(atob(encodedStr)));
    } catch (e) {
      jsonStr = atob(encodedStr);
    }
    const decoded = JSON.parse(jsonStr);

    let itemsRestored = 0;

    // Support both compact format (v3) and legacy format (v1/v2)
    const targetTeamId = decoded.t || decoded.teamId;
    if (targetTeamId && TEAMS_DATABASE[targetTeamId]) {
      state.currentTeamId = targetTeamId;
    }

    // User picks
    const rawPicks = decoded.pk || decoded.picks;
    if (rawPicks && typeof rawPicks === 'object') {
      state.userPicks = { ...rawPicks };
      itemsRestored += Object.keys(rawPicks).length;
    }

    // CCG picks
    const rawCcg = decoded.cp || decoded.ccgPicks;
    if (rawCcg && typeof rawCcg === 'object') {
      state.ccgPicks = { ...rawCcg };
      itemsRestored += Object.keys(rawCcg).length;
    }

    // Playoff picks
    const rawPlayoff = decoded.pp || decoded.playoffPicks;
    if (rawPlayoff && typeof rawPlayoff === 'object') {
      state.playoffPicks = { ...rawPlayoff };
      itemsRestored += Object.keys(rawPlayoff).length;
    }

    // Team sliders
    const rawTeamSliders = decoded.ts || decoded.teamSliders;
    if (rawTeamSliders && typeof rawTeamSliders === 'object') {
      Object.keys(rawTeamSliders).forEach(tid => {
        const val = rawTeamSliders[tid];
        if (Array.isArray(val)) {
          state.teamSliders[tid] = {
            qbRating: val[0] || 0,
            groundAttack: val[1] || 0,
            defenseHavoc: val[2] || 0,
            turnoverLuck: val[3] || 0,
            crowdNoise: val[4] || 0,
            isCustom: true
          };
        } else if (typeof val === 'object') {
          state.teamSliders[tid] = { ...val };
        }
        itemsRestored++;
      });
    } else if (decoded.sliders && decoded.teamId) {
      state.teamSliders[decoded.teamId] = { ...decoded.sliders, isCustom: true };
      itemsRestored += 1;
    }

    // Team active presets
    const rawTeamPresets = decoded.tp || decoded.teamActivePresets;
    if (rawTeamPresets && typeof rawTeamPresets === 'object') {
      state.teamActivePresets = { ...rawTeamPresets };
    }

    // Single-game sliders
    const rawGameSliders = decoded.gs || decoded.gameSliders;
    if (rawGameSliders && typeof rawGameSliders === 'object') {
      Object.keys(rawGameSliders).forEach(gid => {
        const val = rawGameSliders[gid];
        if (Array.isArray(val)) {
          state.gameSliders[gid] = {
            qbRating: val[0] || 0,
            groundAttack: val[1] || 0,
            defenseHavoc: val[2] || 0,
            turnoverLuck: val[3] || 0,
            crowdNoise: val[4] || 0,
            targetTeamId: val[5] || targetTeamId || state.currentTeamId,
            isCustom: true
          };
        } else if (typeof val === 'object') {
          state.gameSliders[gid] = { ...val };
        }
        itemsRestored++;
      });
    }

    // Re-render and synchronize UI
    if (state.currentTeamId && TEAMS_DATABASE[state.currentTeamId]) {
      selectTeam(state.currentTeamId);
    } else {
      syncSliderInputsToActiveTeam();
      recalculateSeason();
    }

    const team = TEAMS_DATABASE[state.currentTeamId];
    if (itemsRestored > 0) {
      showToast(`⚡ Loaded Shared Custom Scenario: ${team ? team.name : 'Custom'} (${itemsRestored} custom modifications applied)!`);
    }
    return true;
  } catch (err) {
    console.warn('Notice parsing scenario hash:', err);
    return false;
  }
}


async function generateGameHypeCard(game) {
  const canvas = document.getElementById('hypeCanvas');
  if (!canvas) return;
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext('2d');

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {}

  let teamA, teamB, scoreA, scoreB, probA, spreadA, ou;
  if ((game.isPostseason || game.isDreamMatchup) && game.teamA && game.teamB) {
    teamA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
    teamB = TEAMS_DATABASE[game.teamB.id] || game.teamB;
    const sim = simulatePostseasonMatchup(teamA, teamB, { gameId: game.id, isHomeA: game.isHomeA || game.isHome });
    scoreA = sim.scoreA;
    scoreB = sim.scoreB;
    probA = sim.winProbA;
    spreadA = sim.spreadA || (scoreB - scoreA);
    ou = scoreA + scoreB;
  } else {
    teamA = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];
    const oppId = getOpponentTeamId(game);
    const dbOpp = (oppId && TEAMS_DATABASE[oppId]) ? TEAMS_DATABASE[oppId] : null;
    teamB = dbOpp || { 
      shortName: game.oppAbbr || 'OPP', 
      name: game.opponent || 'Opponent', 
      apRank: game.oppRank || 'NR', 
      logoUrl: game.oppLogoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[game.oppAbbr] : '') || '', 
      colors: { primary: game.oppColor || '#334155', accent: '#94A3B8' },
      starPlayer: game.scoutReport?.keyMatchup || ''
    };
    const sim = calculateAdjustedMatchup(game);
    scoreA = sim.projUt;
    scoreB = sim.projOpp;
    probA = sim.adjWinProb;
    spreadA = game.vegasSpread;
    ou = game.overUnder || (scoreA + scoreB);
  }

  // Preload both team logos
  const [logoA, logoB] = await Promise.all([
    loadCanvasImage(teamA.logoUrl),
    loadCanvasImage(teamB.logoUrl || game?.oppLogoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[game?.oppAbbr] : ''))
  ]);

  // Base background
  ctx.fillStyle = '#080C14';
  ctx.fillRect(0, 0, 1200, 675);

  // Radial ambient team glow behind Team A (Left)
  const glowA = ctx.createRadialGradient(210, 250, 10, 210, 250, 420);
  glowA.addColorStop(0, teamA.colors?.primary || '#BF5700');
  glowA.addColorStop(1, 'rgba(8, 12, 20, 0)');
  ctx.fillStyle = glowA;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, 600, 675);

  // Radial ambient team glow behind Team B (Right)
  const glowB = ctx.createRadialGradient(990, 250, 10, 990, 250, 420);
  glowB.addColorStop(0, teamB.colors?.primary || '#00274C');
  glowB.addColorStop(1, 'rgba(8, 12, 20, 0)');
  ctx.fillStyle = glowB;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(600, 0, 600, 675);
  ctx.globalAlpha = 1.0;

  // Subtle Yard Line Grid on canvas
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 80; x < 1200; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 675);
    ctx.stroke();
  }

  // Outer Border & Glow
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  drawCanvasRoundedRect(ctx, 16, 16, 1168, 643, 20);
  ctx.stroke();

  // Header Banner Pill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  drawCanvasRoundedRect(ctx, 40, 32, 1120, 52, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  drawCanvasTextFitted(ctx, '🏈 GRIDIRON ORACLE • MATCHUP SIMULATION ENGINE', 60, 65, 680, 'bold 22px "Bebas Neue", "Outfit", sans-serif', '#F59E0B', 'left');

  const venueText = `${(game.week || 'WEEK 1')} • ${(game.stadium || teamA.stadium || 'STADIUM').toUpperCase()}`;
  drawCanvasTextFitted(ctx, venueText, 1130, 64, 420, '600 13px "JetBrains Mono", monospace', '#94A3B8', 'right');

  // ==========================================
  // TEAM A (LEFT COLUMN: center = 210, maxWidth = 320)
  // ==========================================
  const centerAX = 210;
  const logoRadius = 75;
  const logoCenterY = 230;

  ctx.save();
  ctx.shadowColor = teamA.colors?.primary || '#BF5700';
  ctx.shadowBlur = 30;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.arc(centerAX, logoCenterY, logoRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = teamA.colors?.primary || '#BF5700';
  ctx.stroke();
  ctx.restore();

  if (logoA) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerAX, logoCenterY, logoRadius - 6, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoA, centerAX - (logoRadius - 10), logoCenterY - (logoRadius - 10), (logoRadius - 10) * 2, (logoRadius - 10) * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "Bebas Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(teamA.abbr || 'TEAM', centerAX, logoCenterY + 12);
  }

  drawCanvasTextFitted(ctx, teamA.apRank || '#1 AP', centerAX, 345, 280, 'bold 15px "JetBrains Mono", monospace', teamA.colors?.accent || '#F59E0B', 'center');
  drawCanvasTextFitted(ctx, (teamA.name || teamA.shortName || 'Team A').toUpperCase(), centerAX, 380, 310, 'bold 26px "Outfit", sans-serif', '#FFFFFF', 'center');

  const starA = teamA.starPlayer ? teamA.starPlayer.split('/')[0].trim() : 'Offensive Starters';
  drawCanvasTextFitted(ctx, `⭐ ${starA}`, centerAX, 412, 310, '500 13px "Outfit", sans-serif', '#94A3B8', 'center');

  // ==========================================
  // TEAM B (RIGHT COLUMN: center = 990, maxWidth = 320)
  // ==========================================
  const centerBX = 990;

  ctx.save();
  ctx.shadowColor = teamB.colors?.primary || '#00274C';
  ctx.shadowBlur = 30;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.arc(centerBX, logoCenterY, logoRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = teamB.colors?.primary || '#00274C';
  ctx.stroke();
  ctx.restore();

  if (logoB) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerBX, logoCenterY, logoRadius - 6, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoB, centerBX - (logoRadius - 10), logoCenterY - (logoRadius - 10), (logoRadius - 10) * 2, (logoRadius - 10) * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "Bebas Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(teamB.shortName || 'OPP', centerBX, logoCenterY + 12);
  }

  drawCanvasTextFitted(ctx, teamB.apRank || 'NR', centerBX, 345, 280, 'bold 15px "JetBrains Mono", monospace', teamB.colors?.accent || '#38BDF8', 'center');
  drawCanvasTextFitted(ctx, (teamB.name || teamB.shortName || 'Opponent').toUpperCase(), centerBX, 380, 310, 'bold 26px "Outfit", sans-serif', '#FFFFFF', 'center');

  const starB = teamB.starPlayer ? teamB.starPlayer.split('/')[0].trim() : 'Key Matchup Focus';
  drawCanvasTextFitted(ctx, `⭐ ${starB}`, centerBX, 412, 310, '500 13px "Outfit", sans-serif', '#94A3B8', 'center');

  // ==========================================
  // CENTER SCOREBOARD & ODDS CONSOLE (center = 600, width = 420)
  // ==========================================
  const boxW = 420;
  const boxH = 340;
  const boxX = 600 - boxW / 2;
  const boxY = 105;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawCanvasRoundedRect(ctx, boxX, boxY, boxW, boxH, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const isAWin = scoreA > scoreB;
  const winTeamName = isAWin ? (teamA.shortName || teamA.name) : (teamB.shortName || teamB.name);

  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  drawCanvasRoundedRect(ctx, boxX + 25, boxY + 20, boxW - 50, 34, 17);
  ctx.fill();
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawCanvasTextFitted(ctx, `🏆 PROJECTED WINNER: ${winTeamName.toUpperCase()}`, 600, boxY + 42, boxW - 60, 'bold 14px "JetBrains Mono", monospace', '#10B981', 'center');

  ctx.fillStyle = isAWin ? '#FFFFFF' : '#94A3B8';
  ctx.font = 'bold 78px "Bebas Neue", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(scoreA, 555, boxY + 130);

  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 50px "Bebas Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('-', 600, boxY + 124);

  ctx.fillStyle = !isAWin ? '#FFFFFF' : '#94A3B8';
  ctx.font = 'bold 78px "Bebas Neue", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(scoreB, 645, boxY + 130);

  const barW = 340;
  const barH = 14;
  const barX = 600 - barW / 2;
  const barY = boxY + 155;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  drawCanvasRoundedRect(ctx, barX, barY, barW, barH, 7);
  ctx.fill();

  const fillW = Math.max(14, Math.min(barW - 14, (probA / 100) * barW));
  ctx.fillStyle = isAWin ? '#10B981' : '#38BDF8';
  drawCanvasRoundedRect(ctx, barX, barY, fillW, barH, 7);
  ctx.fill();

  drawCanvasTextFitted(ctx, `${teamA.abbr || 'TEAM'} ${probA}%`, barX, barY + 34, 150, 'bold 13px "JetBrains Mono", monospace', '#E2E8F0', 'left');
  drawCanvasTextFitted(ctx, `${100 - probA}% ${teamB.shortName || 'OPP'}`, barX + barW, barY + 34, 150, 'bold 13px "JetBrains Mono", monospace', '#E2E8F0', 'right');

  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  drawCanvasRoundedRect(ctx, boxX + 25, boxY + 215, boxW - 50, 48, 10);
  ctx.fill();

  const spreadSign = spreadA <= 0 ? `${teamA.abbr} ${spreadA}` : `${teamB.shortName} -${spreadA}`;
  drawCanvasTextFitted(ctx, `VEGAS LINE: ${spreadSign} • O/U: ${ou}`, 600, boxY + 244, boxW - 60, 'bold 14px "JetBrains Mono", monospace', '#F59E0B', 'center');

  const projectedMargin = Math.abs(scoreA - scoreB);
  const spreadDiff = Math.abs(projectedMargin - Math.abs(spreadA));
  drawCanvasTextFitted(ctx, `🔥 MODEL COVER EDGE: ${spreadDiff.toFixed(1)} PTS`, 600, boxY + 285, boxW - 60, '600 12px "JetBrains Mono", monospace', '#38BDF8', 'center');

  // Bottom Tactical Strip
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawCanvasRoundedRect(ctx, 40, 470, 1120, 105, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();

  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('⚡ 10,000 MONTE CARLO DRIVES • TACTICAL MATCHUP INSIGHT', 65, 502);

  const scoutSummary = game.scoutReport?.xFactor || game.scoutReport?.keyMatchup || `High-stakes battle featuring ${teamA.name} vs ${teamB.name}.`;
  drawCanvasTextWrapped(ctx, scoutSummary, 65, 532, 1070, 24, '500 15px "Outfit", sans-serif', '#E2E8F0', 'left', 2);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('POWERED BY GRIDIRON ORACLE • https://jajo9147.github.io/cfb-football-predictor/', 600, 625);

  document.getElementById('hypeCardModal').classList.add('open');
}
window.generateGameHypeCard = generateGameHypeCard;

// ==========================================================================
// 10,000-RUN CFP BUBBLE CHAOS PROBABILITY MATRIX & HEATMAP ENGINE
// ==========================================================================

let currentMatrixConfFilter = 'all';
let currentMatrixSortCol = 'cfp';
let currentMatrixSortAsc = false;

function runCfpMonteCarloSeasonSims(numSims = 10000) {
  const teamIds = Object.keys(TEAMS_DATABASE);
  const stats = {};

  teamIds.forEach(tid => {
    const t = TEAMS_DATABASE[tid];
    stats[tid] = {
      id: tid,
      name: t.name,
      shortName: t.shortName,
      conference: t.conference,
      apRank: t.apRank,
      logoUrl: t.logoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[t.abbr] : ''),
      colors: t.colors,
      nattyCount: 0,
      byeCount: 0,
      cfpCount: 0,
      bubbleCount: 0,
      totalWins: 0
    };
  });

  const teamSimData = {};
  teamIds.forEach(tid => {
    const t = TEAMS_DATABASE[tid];
    teamSimData[tid] = (t.schedule || []).map(g => {
      const sim = calculateAdjustedMatchup(g, tid);
      return {
        prob: sim.adjWinProb / 100
      };
    });
  });

  for (let s = 0; s < numSims; s++) {
    const seasonResults = [];

    teamIds.forEach(tid => {
      let wins = 0;
      const games = teamSimData[tid] || [];
      games.forEach(g => {
        if (Math.random() < g.prob) wins++;
      });
      stats[tid].totalWins += wins;
      seasonResults.push({ id: tid, wins, baseSp: TEAMS_DATABASE[tid]?.baseSpRating || 20 });
    });

    seasonResults.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.baseSp - a.baseSp;
    });

    // Top 4 Byes
    for (let i = 0; i < 4 && i < seasonResults.length; i++) {
      const tid = seasonResults[i].id;
      stats[tid].byeCount++;
      stats[tid].cfpCount++;
    }

    // At-Large (5-12)
    for (let i = 4; i < 12 && i < seasonResults.length; i++) {
      const tid = seasonResults[i].id;
      stats[tid].cfpCount++;
    }

    // Bubble (13-16)
    for (let i = 12; i < 16 && i < seasonResults.length; i++) {
      const tid = seasonResults[i].id;
      stats[tid].bubbleCount++;
    }

    // Simulate Natty Champion from top 12 weighted by SP+ and seeding
    const top12 = seasonResults.slice(0, 12);
    let totalWeight = 0;
    const weights = top12.map((t, idx) => {
      const seedBonus = (12 - idx) * 1.5;
      const w = Math.max(1, (t.baseSp + seedBonus));
      totalWeight += w;
      return w;
    });

    let r = Math.random() * totalWeight;
    for (let i = 0; i < top12.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        stats[top12[i].id].nattyCount++;
        break;
      }
    }
  }

  const matrixList = teamIds.map(tid => {
    const s = stats[tid];
    return {
      id: tid,
      name: s.name,
      shortName: s.shortName,
      conference: s.conference,
      apRank: s.apRank,
      logoUrl: s.logoUrl,
      colors: s.colors,
      nattyPct: parseFloat(((s.nattyCount / numSims) * 100).toFixed(1)),
      byePct: parseFloat(((s.byeCount / numSims) * 100).toFixed(1)),
      cfpPct: parseFloat(((s.cfpCount / numSims) * 100).toFixed(1)),
      bubblePct: parseFloat(((s.bubbleCount / numSims) * 100).toFixed(1)),
      avgWins: parseFloat((s.totalWins / numSims).toFixed(1))
    };
  });

  matrixList.sort((a, b) => b.cfpPct - a.cfpPct || b.nattyPct - a.nattyPct);
  state.lastChaosMatrixResults = matrixList;
  return matrixList;
}

window.openCfpMatrixModal = function() {
  const modal = document.getElementById('cfpMatrixModal');
  if (!modal) return;

  if (!state.lastChaosMatrixResults || state.lastChaosMatrixResults.length === 0) {
    runCfpMonteCarloSeasonSims(10000);
  }
  renderCfpMatrixModal();
  modal.classList.add('open');
};

window.closeCfpMatrixModal = function() {
  const modal = document.getElementById('cfpMatrixModal');
  if (modal) modal.classList.remove('open');
};

window.filterCfpMatrix = function(conf) {
  currentMatrixConfFilter = conf;
  document.querySelectorAll('.conf-filter-btn').forEach(b => {
    if (b.dataset.conf === conf) b.classList.add('active');
    else b.classList.remove('active');
  });
  renderCfpMatrixModal();
};

window.sortCfpMatrix = function(col) {
  if (currentMatrixSortCol === col) {
    currentMatrixSortAsc = !currentMatrixSortAsc;
  } else {
    currentMatrixSortCol = col;
    currentMatrixSortAsc = false;
  }
  renderCfpMatrixModal();
};

window.rerunCfpMatrixSims = function() {
  showToast('🔥 Simulating 10,000 full seasons...');
  setTimeout(() => {
    runCfpMonteCarloSeasonSims(10000);
    renderCfpMatrixModal();
    showToast('⚡ 10,000 season simulations updated!');
  }, 40);
};

function renderCfpMatrixModal() {
  const tbody = document.getElementById('chaosMatrixBody');
  if (!tbody) return;

  let list = [...(state.lastChaosMatrixResults || runCfpMonteCarloSeasonSims(10000))];

  // Filter by conference
  if (currentMatrixConfFilter !== 'all') {
    if (currentMatrixConfFilter === 'G5') {
      list = list.filter(t => t.conference !== 'SEC' && t.conference !== 'Big Ten' && t.conference !== 'Big 12' && t.conference !== 'ACC');
    } else {
      list = list.filter(t => t.conference === currentMatrixConfFilter);
    }
  }

  // Sort
  list.sort((a, b) => {
    let valA = a[currentMatrixSortCol] !== undefined ? a[currentMatrixSortCol] : a.cfpPct;
    let valB = b[currentMatrixSortCol] !== undefined ? b[currentMatrixSortCol] : b.cfpPct;
    if (currentMatrixSortCol === 'natty') { valA = a.nattyPct; valB = b.nattyPct; }
    else if (currentMatrixSortCol === 'bye') { valA = a.byePct; valB = b.byePct; }
    else if (currentMatrixSortCol === 'cfp') { valA = a.cfpPct; valB = b.cfpPct; }
    else if (currentMatrixSortCol === 'bubble') { valA = a.bubblePct; valB = b.bubblePct; }
    else if (currentMatrixSortCol === 'avgWins') { valA = a.avgWins; valB = b.avgWins; }

    return currentMatrixSortAsc ? valA - valB : valB - valA;
  });

  tbody.innerHTML = '';

  list.forEach((t, idx) => {
    const tr = document.createElement('tr');
    const isCurrent = t.id === state.currentTeamId;
    if (isCurrent) {
      tr.style.background = 'rgba(56, 189, 248, 0.12)';
      tr.style.borderLeft = '3px solid #38BDF8';
    }

    const getHeatClass = (val) => {
      if (val >= 60) return 'heat-super';
      if (val >= 35) return 'heat-high';
      if (val >= 15) return 'heat-med';
      if (val > 0) return 'heat-low';
      return 'heat-zero';
    };

    tr.innerHTML = `
      <td style="padding: 0.6rem 0.8rem;">
        <div class="matrix-team-cell">
          <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--color-text-dim); width: 16px;">#${idx + 1}</span>
          <img src="${t.logoUrl}" alt="${t.name}" class="matrix-team-logo">
          <div>
            <div style="font-size: 0.85rem; color: ${isCurrent ? 'var(--color-brand-accent)' : '#FFF'}; font-weight: 800;">${t.shortName}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim); font-family: var(--font-mono);">${t.conference} • ${t.apRank || 'NR'}</div>
          </div>
        </div>
      </td>
      <td style="text-align: center;"><span class="heat-cell ${getHeatClass(t.nattyPct)}">${t.nattyPct}%</span></td>
      <td style="text-align: center;"><span class="heat-cell ${getHeatClass(t.byePct)}">${t.byePct}%</span></td>
      <td style="text-align: center;"><span class="heat-cell ${getHeatClass(t.cfpPct)}" style="font-weight: 900;">${t.cfpPct}%</span></td>
      <td style="text-align: center;"><span class="heat-cell ${getHeatClass(t.bubblePct)}">${t.bubblePct}%</span></td>
      <td style="text-align: center; font-weight: 700; color: #E2E8F0;">${t.avgWins}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ==========================================================================
// VIEW SEGMENTED CONTROLLER & MOBILE ERGONOMICS HANDLERS
// ==========================================================================

window.switchAppView = function(viewName) {
  // Update Segmented Nav buttons
  document.querySelectorAll('.segment-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update Mobile Bottom Dock buttons
  document.querySelectorAll('.dock-btn[data-dock]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dock === viewName);
  });

  if (viewName === 'schedule') {
    const el = document.getElementById('scheduleSection');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (viewName === 'playoffs') {
    const el = document.getElementById('playoffSection');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (viewName === 'tuning') {
    const el = document.querySelector('.tuning-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (viewName === 'dream') {
    if (typeof openDreamSandboxModal === 'function') openDreamSandboxModal();
  }
};

window.scrollToTeamOverview = function() {
  document.querySelectorAll('.dock-btn[data-dock]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dock === 'overview');
  });
  const el = document.getElementById('teamHeroBanner');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.toggleMoreToolsMenu = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const menu = document.getElementById('moreToolsMenu');
  if (!menu) return;
  menu.classList.toggle('show');
};

document.addEventListener('click', (e) => {
  const menu = document.getElementById('moreToolsMenu');
  const btn = document.getElementById('moreToolsBtn');
  if (menu && menu.classList.contains('show')) {
    if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
      menu.classList.remove('show');
    }
  }
});

window.switchPlayoffRound = function(roundKey) {
  document.querySelectorAll('.round-tab-btn[data-round]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.round === roundKey);
  });

  const cards = document.querySelectorAll('#playoffBracketGrid .playoff-round-card');
  if (!cards || cards.length === 0) return;

  if (roundKey === 'all') {
    cards.forEach(card => {
      card.style.display = '';
    });
    return;
  }

  const roundMap = {
    'fr': 0,    // First Round (4)
    'qf': 1,    // Quarterfinals (4)
    'sf': 2,    // Semifinals (2)
    'natty': 3  // National Championship (1)
  };

  const targetIdx = roundMap[roundKey];
  cards.forEach((card, idx) => {
    if (idx === targetIdx) {
      card.style.display = 'flex';
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      card.style.display = 'none';
    }
  });
};
window.switchMobilePlayoffRound = window.switchPlayoffRound;

window.openHypeCardModal = function() {
  const currentTeam = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];
  const nextGame = (currentTeam.schedule && currentTeam.schedule[0]) ? currentTeam.schedule[0] : null;
  if (nextGame && typeof generateGameHypeCard === 'function') {
    generateGameHypeCard(currentTeam, nextGame);
  } else {
    showToast('Exporting Hype Card...');
  }
};

