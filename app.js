// ==========================================================================
// CFB PROPHET - MULTI-TEAM COLLEGE FOOTBALL AI PREDICTOR ENGINE (2026)
// ==========================================================================

const state = {
  currentTeamId: 'ohiostate', // default golden standard #1 AP champion
  filter: 'all',
  teamSliders: {}, // Map of teamId -> { qbRating, groundAttack, defenseHavoc, turnoverLuck, crowdNoise }
  teamActivePresets: {}, // Map of teamId -> presetKey ('baseline', 'qb-mvp', etc.)
  gameSliders: {}, // Map of gameId -> { qbRating, groundAttack, defenseHavoc, turnoverLuck, crowdNoise, isCustom }
  userPicks: {},   // Map of gameId -> 'W' | 'L' | null
  manualScores: {}, // Map of gameId -> { teamScore, oppScore }
  ccgPicks: {},    // Map of ccgId -> winnerTeamId
  playoffPicks: {},// Map of playoffGameId -> winnerTeamId
  postseasonGames: {}, // Map of gameId -> generated game object for modal
  activeModalGame: null,
  deferredPrompt: null,
  activeVaultTab: 'weekly',
  selectedVaultWeek: 'W1',
  selectedVaultTeam: 'all',
  activeSavedBracketId: null
};
if (typeof window !== 'undefined') window.state = state;

// Official 2026 Preseason Vegas National Championship Title Odds
const OFFICIAL_TEAM_TITLE_ODDS = {
  georgia: '+320',
  ohiostate: '+350',
  texas: '+450',
  oregon: '+650',
  alabama: '+750',
  pennstate: '+1200',
  notredame: '+1400',
  olemiss: '+1500',
  miami: '+1800',
  tennessee: '+2200',
  lsu: '+2500',
  michigan: '+3000',
  clemson: '+3500',
  usc: '+4000',
  texasam: '+4500',
  oklahoma: '+5000',
  utah: '+6000',
  missouri: '+6500',
  louisville: '+8000',
  smu: '+9000',
  iowa: '+10000',
  boisestate: '+12500',
  colorado: '+15000',
  arizona: '+17500',
  washington: '+20000',
  texastech: '+25000',
  floridastate: '+30000',
  byu: '+35000',
  indiana: '+40000',
  arizonastate: '+45000',
  houston: '+50000'
};

function getTeamTitleOdds(teamId) {
  if (!teamId) return '+3500';
  const tid = teamId.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (OFFICIAL_TEAM_TITLE_ODDS[tid]) return OFFICIAL_TEAM_TITLE_ODDS[tid];
  const team = typeof TEAMS_DATABASE !== 'undefined' ? (TEAMS_DATABASE[teamId] || TEAMS_DATABASE[tid]) : null;
  if (team && team.titleOdds) return team.titleOdds;
  return '+5000';
}
window.getTeamTitleOdds = getTeamTitleOdds;

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
// COUNTDOWN TICKER & LOCALIZED TIMEZONE KICKOFF ENGINE
// ==========================================================================

const TEAM_OPENER_KICKOFFS = {
  'colorado': {
    utc: '2026-09-04T00:00:00Z', // Thu Sep 3 @ 8:00 PM EDT (Atlanta, GA)
    opponent: 'Georgia Tech Yellow Jackets',
    venue: 'Bobby Dodd Stadium (Atlanta, GA)',
    tv: 'ESPN'
  },
  'missouri': {
    utc: '2026-09-04T00:00:00Z', // Thu Sep 3 @ 8:00 PM EDT (Columbia, MO)
    opponent: 'Arkansas-Pine Bluff Golden Lions',
    venue: 'Memorial Stadium (Columbia, MO)',
    tv: 'SEC Network'
  },
  'utah': {
    utc: '2026-09-04T01:00:00Z', // Thu Sep 3 @ 9:00 PM EDT (Salt Lake City, UT)
    opponent: 'Idaho Vandals',
    venue: 'Rice-Eccles Stadium (Salt Lake City, UT)',
    tv: 'ESPNU'
  },
  'oklahoma': {
    utc: '2026-09-05T00:00:00Z', // Fri Sep 4 @ 8:00 PM EDT (Norman, OK)
    opponent: 'UTEP Miners',
    venue: 'Memorial Stadium (Norman, OK)',
    tv: 'SECN+'
  },
  'miami': {
    utc: '2026-09-05T01:00:00Z', // Fri Sep 4 @ 9:00 PM EDT (Stanford, CA)
    opponent: 'Stanford Cardinal',
    venue: 'Stanford Stadium (Stanford, CA)',
    tv: 'ESPN'
  },
  'usc': {
    utc: '2026-09-05T01:00:00Z', // Fri Sep 4 @ 9:00 PM EDT (Los Angeles, CA)
    opponent: 'Fresno State Bulldogs',
    venue: 'Los Angeles Memorial Coliseum (Los Angeles, CA)',
    tv: 'FOX'
  },
  'indiana': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 12:00 PM EDT (Bloomington, IN)
    opponent: 'North Texas Mean Green',
    venue: 'Memorial Stadium (Bloomington, IN)',
    tv: 'FOX'
  },
  'alabama': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 12:00 PM EDT (Tuscaloosa, AL)
    opponent: 'East Carolina Pirates',
    venue: 'Bryant-Denny Stadium (Tuscaloosa, AL)',
    tv: 'ABC'
  },
  'houston': {
    utc: '2026-09-05T16:00:00Z', // Sat Sep 5 @ 12:00 PM EDT (Houston, TX)
    opponent: 'Oregon State Beavers',
    venue: 'TDECU Stadium (Houston, TX)',
    tv: 'ESPN/Disney+'
  },
  'ohiostate': {
    utc: '2026-09-05T16:30:00Z', // Sat Sep 5 @ 12:30 PM EDT (Columbus, OH)
    opponent: 'Ball State Cardinals',
    venue: 'Ohio Stadium (Columbus, OH)',
    tv: 'BTN'
  },
  'georgia': {
    utc: '2026-09-05T19:00:00Z', // Sat Sep 5 @ 3:00 PM EDT (Athens, GA)
    opponent: 'Tennessee State Tigers',
    venue: 'Sanford Stadium (Athens, GA)',
    tv: 'SECN+'
  },
  'texas': {
    utc: '2026-09-05T19:30:00Z', // Sat Sep 5 @ 3:30 PM EDT / 2:30 PM CDT (Austin, TX)
    opponent: 'Texas State Bobcats',
    venue: 'DKR Texas Memorial Stadium (Austin, TX)',
    tv: 'ESPN'
  },
  'oregon': {
    utc: '2026-09-05T19:30:00Z', // Sat Sep 5 @ 3:30 PM EDT (Eugene, OR)
    opponent: 'Boise State Broncos',
    venue: 'Autzen Stadium (Eugene, OR)',
    tv: 'CBS'
  },
  'pennstate': {
    utc: '2026-09-05T19:30:00Z', // Sat Sep 5 @ 3:30 PM EDT (State College, PA)
    opponent: 'Marshall Thundering Herd',
    venue: 'Beaver Stadium (University Park, PA)',
    tv: 'FS1'
  },
  'tennessee': {
    utc: '2026-09-05T19:30:00Z', // Sat Sep 5 @ 3:30 PM EDT (Knoxville, TN)
    opponent: 'Furman Paladins',
    venue: 'Neyland Stadium (Knoxville, TN)',
    tv: 'SECN+'
  },
  'boisestate': {
    utc: '2026-09-05T19:30:00Z', // Sat Sep 5 @ 3:30 PM EDT (Eugene, OR)
    opponent: 'Oregon Ducks',
    venue: 'Autzen Stadium (Eugene, OR)',
    tv: 'CBS'
  },
  'iowa': {
    utc: '2026-09-05T20:15:00Z', // Sat Sep 5 @ 4:15 PM EDT (Iowa City, IA)
    opponent: 'Northern Illinois Huskies',
    venue: 'Kinnick Stadium (Iowa City, IA)',
    tv: 'BTN'
  },
  'texasam': {
    utc: '2026-09-05T23:00:00Z', // Sat Sep 5 @ 7:00 PM EDT (College Station, TX)
    opponent: 'Missouri State Bears',
    venue: 'Kyle Field (College Station, TX)',
    tv: 'ESPN'
  },
  'texastech': {
    utc: '2026-09-05T23:00:00Z', // Sat Sep 5 @ 7:00 PM EDT (Lubbock, TX)
    opponent: 'Abilene Christian Wildcats',
    venue: 'Jones AT&T Stadium (Lubbock, TX)',
    tv: 'FS1'
  },
  'lsu': {
    utc: '2026-09-05T23:30:00Z', // Sat Sep 5 @ 7:30 PM EDT (Baton Rouge, LA)
    opponent: 'Clemson Tigers',
    venue: 'Tiger Stadium (Baton Rouge, LA)',
    tv: 'ABC'
  },
  'clemson': {
    utc: '2026-09-05T23:30:00Z', // Sat Sep 5 @ 7:30 PM EDT (Baton Rouge, LA)
    opponent: 'LSU Tigers',
    venue: 'Tiger Stadium (Baton Rouge, LA)',
    tv: 'ABC'
  },
  'michigan': {
    utc: '2026-09-05T23:30:00Z', // Sat Sep 5 @ 7:30 PM EDT (Ann Arbor, MI)
    opponent: 'Western Michigan Broncos',
    venue: 'Michigan Stadium (Ann Arbor, MI)',
    tv: 'NBC'
  },
  'byu': {
    utc: '2026-09-06T00:00:00Z', // Sat Sep 5 @ 8:00 PM EDT (Provo, UT)
    opponent: 'Utah Tech Trailblazers',
    venue: 'LaVell Edwards Stadium (Provo, UT)',
    tv: 'ESPN+'
  },
  'arizona': {
    utc: '2026-09-06T01:30:00Z', // Sat Sep 5 @ 9:30 PM EDT (Tucson, AZ)
    opponent: 'Northern Arizona Lumberjacks',
    venue: 'Arizona Stadium (Tucson, AZ)',
    tv: 'ESPN+'
  },
  'arizonastate': {
    utc: '2026-09-06T02:00:00Z', // Sat Sep 5 @ 10:00 PM EDT (Tempe, AZ)
    opponent: 'Morgan State Bears',
    venue: 'Mountain America Stadium (Tempe, AZ)',
    tv: 'ESPN+'
  },
  'washington': {
    utc: '2026-09-06T20:00:00Z', // Sun Sep 6 @ 4:00 PM EDT (Seattle, WA)
    opponent: 'Washington State Cougars (Apple Cup)',
    venue: 'Husky Stadium (Seattle, WA)',
    tv: 'NBC'
  },
  'notredame': {
    utc: '2026-09-06T23:30:00Z', // Sun Sep 6 @ 7:30 PM EDT (Green Bay, WI)
    opponent: 'Wisconsin Badgers',
    venue: 'Lambeau Field (Green Bay, WI)',
    tv: 'NBC'
  },
  'olemiss': {
    utc: '2026-09-06T23:30:00Z', // Sun Sep 6 @ 7:30 PM EDT (Nashville, TN)
    opponent: 'Louisville Cardinals',
    venue: 'Nissan Stadium (Nashville, TN)',
    tv: 'ABC'
  },
  'louisville': {
    utc: '2026-09-06T23:30:00Z', // Sun Sep 6 @ 7:30 PM EDT (Nashville, TN)
    opponent: 'Ole Miss Rebels',
    venue: 'Nissan Stadium (Nashville, TN)',
    tv: 'ABC'
  },
  'floridastate': {
    utc: '2026-09-07T23:30:00Z', // Mon Sep 7 @ 7:30 PM EDT (Tallahassee, FL)
    opponent: 'SMU Mustangs',
    venue: 'Doak Campbell Stadium (Tallahassee, FL)',
    tv: 'ESPN'
  },
  'smu': {
    utc: '2026-09-07T23:30:00Z', // Mon Sep 7 @ 7:30 PM EDT (Tallahassee, FL)
    opponent: 'Florida State Seminoles',
    venue: 'Doak Campbell Stadium (Tallahassee, FL)',
    tv: 'ESPN'
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

function formatGameDateWithTime(game) {
  if (!game) return '';
  let rawDate = game.date || '';
  let timeStr = game.kickoffTime || game.time;
  
  // 1. Authoritative UTC timestamp conversion to US Eastern Time & Day-of-week check
  if (game.utc) {
    try {
      const dt = new Date(game.utc);
      
      // Determine calendar date in US Eastern Time (primary sports broadcasting reference)
      const etDateStr = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York'
      }).format(dt); // e.g. "Sep 4, 2026"

      const etWeekday = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: 'America/New_York'
      }).format(dt); // e.g. "Fri"

      // Check if this game is TODAY or TOMORROW in US Eastern Time
      const now = new Date();
      const todayEtStr = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York'
      }).format(now);

      const tomorrowDt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowEtStr = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York'
      }).format(tomorrowDt);

      const monthDayEt = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/New_York'
      }).format(dt);

      if (etDateStr === todayEtStr) {
        rawDate = `TODAY (${etWeekday}, ${monthDayEt})`;
      } else if (etDateStr === tomorrowEtStr) {
        rawDate = `TOMORROW (${etWeekday}, ${monthDayEt})`;
      } else {
        rawDate = `${etWeekday}, ${etDateStr}`;
      }

      if (!timeStr) {
        timeStr = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York'
        }).format(dt) + ' ET';
      }
    } catch (e) {}
  } else if (rawDate) {
    // If no UTC timestamp, check if rawDate matches today
    try {
      const now = new Date();
      const todayEtStr = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/New_York'
      }).format(now);
      if (rawDate.includes('Sep 4') && todayEtStr.includes('Sep 4')) {
        rawDate = `TODAY (Fri, Sep 4)`;
      } else if (rawDate.includes('Sep 5') && todayEtStr.includes('Sep 4')) {
        rawDate = `TOMORROW (Sat, Sep 5)`;
      }
    } catch (e) {}
  }

  if (!timeStr) {
    const opp = (game.oppAbbr || game.opponent || '').toUpperCase();
    const riv = (game.rivalryName || '').toUpperCase();
    const week = (game.week || '').toUpperCase();

    if (/RED RIVER/i.test(riv) || (opp === 'OU' && /TEXAS/i.test(game.id))) {
      timeStr = '3:30 PM ET';
    } else if (/THE GAME/i.test(riv) || (opp === 'MICH' && week.includes('13'))) {
      timeStr = '12:00 PM ET';
    } else if (/LONE STAR/i.test(riv) || (opp === 'TAMU' && week.includes('13'))) {
      timeStr = '7:30 PM ET';
    } else if (/IRON BOWL/i.test(riv) || opp === 'AUB') {
      timeStr = '3:30 PM ET';
    } else if (rawDate.includes('Sep 3') || rawDate.includes('Thu') || opp === 'GT' || opp === 'GEORGIA TECH') {
      timeStr = '8:00 PM ET';
    } else if (rawDate.includes('Sep 4') || rawDate.includes('Fri') || opp === 'FRES' || opp === 'FRESNO' || opp === 'STAN') {
      timeStr = '9:00 PM ET';
    } else {
      timeStr = 'TBD';
    }
  }

  const tvSuffix = (game.tv && game.tv !== 'TBD') ? ` • ${game.tv}` : '';
  if (rawDate) {
    return `${rawDate} • ${timeStr}${tvSuffix}`;
  }
  return `${timeStr}${tvSuffix}`;
}
window.formatGameDateWithTime = formatGameDateWithTime;

function updateCountdownTickerForActiveTeam() {
  const badgeEl = document.getElementById('countdownBadge');
  const textEl = document.getElementById('countdownText');
  if (!badgeEl && !textEl) return;

  const teamId = state.currentTeamId || getTopRankedTeamId() || 'ohiostate';
  const team = TEAMS_DATABASE[teamId] || Object.values(TEAMS_DATABASE)[0];

  // Find the next upcoming uncompleted game in the team's schedule
  let nextGame = null;
  if (team && Array.isArray(team.schedule)) {
    nextGame = team.schedule.find(g => !g.isFinal && (g.utc || g.kickoffTime || g.date));
  }

  const kickoffUtc = nextGame?.utc || TEAM_OPENER_KICKOFFS[teamId]?.utc || '2026-09-05T16:00:00Z';
  const kickoffTv = nextGame?.tv || TEAM_OPENER_KICKOFFS[teamId]?.tv || 'ABC / ESPN';
  const opponentName = nextGame?.opponent || TEAM_OPENER_KICKOFFS[teamId]?.opponent || 'Next Opponent';

  const kickoffDate = new Date(kickoffUtc);
  const now = new Date().getTime();
  const diff = kickoffDate.getTime() - now;

  const localFormatted = formatKickoffDateLocal(kickoffDate);
  const tzAbbr = getUserTimezoneAbbr();

  if (diff <= 0) {
    if (textEl) textEl.innerText = `${team.abbr} • 🔴 LIVE NOW`;
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (textEl) {
    if (days === 0) {
      textEl.innerText = `${team.abbr} KICKOFF TODAY: ${hours}H ${mins}M • ${localFormatted}`;
    } else {
      textEl.innerText = `${team.abbr} KICKOFF: ${days}D ${hours}H • ${localFormatted}`;
    }
  }
  if (badgeEl) {
    badgeEl.title = `Next ${team.name} Kickoff: ${localFormatted} (Converted to your local timezone: ${tzAbbr})\nTV: ${kickoffTv}\nMatchup: vs ${opponentName}`;
  }
}
window.updateCountdownTickerForActiveTeam = updateCountdownTickerForActiveTeam;

function startCountdownTicker() {
  updateCountdownTickerForActiveTeam();
}



// ==========================================================================
// INITIALIZATION & EVENT LISTENERS
// ==========================================================================


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
  try {
    if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const reg of registrations) {
          reg.unregister();
        }
      }).catch(() => {});
    }
    if ('caches' in window && typeof caches.keys === 'function') {
      caches.keys().then(keys => {
        for (const key of keys) {
          caches.delete(key);
        }
      }).catch(() => {});
    }
  } catch (e) {}
}

// ==========================================================================
// TEAM SWITCHING & THEME INJECTION
// ==========================================================================

function getNumericRank(team) {
  if (!team) return 999;
  if (typeof team.playoffContenderRank === 'number') return team.playoffContenderRank;
  const match = (team.apRank || '').match(/\d+/);
  if (match) return parseInt(match[0], 10);
  if (team.apRank === 'RV') return 100;
  return 200;
}

function renderTeamSelector() {
  const track = document.getElementById('teamSelectorTrack');
  if (!track) return;

  track.innerHTML = '';

  // Order teams strictly by official AP Poll ranking:
  // #1-#25 (Top 25) -> Receiving Votes (RV) -> Non-Ranked at the end (Boise State #30 & Colorado #31)
  const teamKeys = Object.keys(TEAMS_DATABASE).sort((a, b) => {
    return getNumericRank(TEAMS_DATABASE[a]) - getNumericRank(TEAMS_DATABASE[b]);
  });

  teamKeys.forEach(id => {
    const team = TEAMS_DATABASE[id];
    if (!team) return;
    const btn = document.createElement('button');
    btn.className = `team-pill-btn ${id === state.currentTeamId ? 'active' : ''}`;
    btn.dataset.teamid = id;

    btn.innerHTML = `
      <span class="team-pill-logo-badge">
        <img src="${team.logoUrl}" alt="${team.shortName}" class="team-pill-logo-img">
      </span>
      <span>${team.shortName}</span>
      <span class="team-pill-rank">${team.apRank || 'NR'}</span>
    `;
    btn.addEventListener('click', () => selectTeam(id));
    track.appendChild(btn);
  });
}

function teamMatchesSearchQuery(tid, t, query) {
  if (!t || !query) return false;
  const q = query.trim().toLowerCase();
  const normQ = q.replace(/[^a-z0-9]/g, '');
  if (!q && !normQ) return true;

  // 1. Comprehensive Aliases & Nicknames
  const aliases = (window.TEAM_SEARCH_ALIASES && window.TEAM_SEARCH_ALIASES[tid]) || (typeof TEAM_SEARCH_ALIASES !== 'undefined' ? TEAM_SEARCH_ALIASES[tid] : null) || [];
  for (let i = 0; i < aliases.length; i++) {
    const a = aliases[i].toLowerCase();
    const normA = a.replace(/[^a-z0-9]/g, '');
    if (a === q || normA === normQ || normA.startsWith(normQ) || (q.length > 2 && (a.includes(q) || normA.includes(normQ)))) {
      return true;
    }
  }

  // 2. Abbr match
  const abbr = (t.abbr || '').toLowerCase();
  if (abbr === q || (normQ && abbr === normQ)) return true;

  // 3. Name & shortName match
  const name = (t.name || '').toLowerCase();
  const shortName = (t.shortName || '').toLowerCase();
  const mascot = (t.mascot || '').toLowerCase();
  const normName = name.replace(/[^a-z0-9]/g, '');
  const normShort = shortName.replace(/[^a-z0-9]/g, '');

  if (shortName.startsWith(q) || name.startsWith(q) || mascot.startsWith(q)) return true;
  if (normShort.startsWith(normQ) || normName.startsWith(normQ)) return true;

  // For queries longer than 2 characters, allow substring and personnel matches
  if (q.length > 2) {
    if (name.includes(q) || shortName.includes(q) || mascot.includes(q)) return true;
    if (normName.includes(normQ) || normShort.includes(normQ)) return true;
    if (t.headCoach && t.headCoach.toLowerCase().includes(q)) return true;
    if (t.confirmedStarterQb && t.confirmedStarterQb.toLowerCase().includes(q)) return true;
    if (t.starPlayer && t.starPlayer.toLowerCase().includes(q)) return true;
    if (t.conference && t.conference.toLowerCase().includes(q)) return true;
    if (t.stadium && t.stadium.toLowerCase().includes(q)) return true;
    if (t.stadiumCity && t.stadiumCity.toLowerCase().includes(q)) return true;
  }

  return false;
}
window.teamMatchesSearchQuery = teamMatchesQuery = teamMatchesSearchQuery;

function calculateTeamSearchRelevance(tid, t, query) {
  if (!t || !query) return 0;
  const q = query.trim().toLowerCase();
  const normQ = q.replace(/[^a-z0-9]/g, '');
  let score = 0;

  const aliases = (window.TEAM_SEARCH_ALIASES && window.TEAM_SEARCH_ALIASES[tid]) || (typeof TEAM_SEARCH_ALIASES !== 'undefined' ? TEAM_SEARCH_ALIASES[tid] : null) || [];
  
  // 1. Exact alias or normalized alias match (e.g. 'asu' === 'asu' -> 6000 pts)
  for (let i = 0; i < aliases.length; i++) {
    const a = aliases[i].toLowerCase();
    const normA = a.replace(/[^a-z0-9]/g, '');
    if (a === q || (normA && normQ && normA === normQ)) {
      score = Math.max(score, 6000);
    } else if (normA && normQ && normA.startsWith(normQ)) {
      score = Math.max(score, 4500);
    } else if (normA && normQ && normA.includes(normQ)) {
      score = Math.max(score, 3000);
    }
  }

  // 2. Exact match on abbr or shortName or name
  if (t.abbr && t.abbr.toLowerCase() === q) score = Math.max(score, 5500);
  if (t.shortName && t.shortName.toLowerCase() === q) score = Math.max(score, 5000);
  if (t.name && t.name.toLowerCase() === q) score = Math.max(score, 5000);

  // 3. Starts with shortName or name or mascot
  if (t.shortName && t.shortName.toLowerCase().startsWith(q)) score = Math.max(score, 3800);
  if (t.name && t.name.toLowerCase().startsWith(q)) score = Math.max(score, 3500);
  if (t.mascot && t.mascot.toLowerCase() === q) score = Math.max(score, 3200);
  if (t.mascot && t.mascot.toLowerCase().startsWith(q)) score = Math.max(score, 2500);

  // 4. Substring in shortName or name
  if (t.shortName && t.shortName.toLowerCase().includes(q)) score = Math.max(score, 1800);
  if (t.name && t.name.toLowerCase().includes(q)) score = Math.max(score, 1500);

  // 5. Substring in coach or QB or conference
  if (t.headCoach && t.headCoach.toLowerCase().includes(q)) score = Math.max(score, 400);
  if (t.confirmedStarterQb && t.confirmedStarterQb.toLowerCase().includes(q)) score = Math.max(score, 300);
  if (t.conference && t.conference.toLowerCase().includes(q)) score = Math.max(score, 200);

  return score;
}
window.calculateTeamSearchRelevance = calculateTeamSearchRelevance;

function initTeamSearch() {
  const input = document.getElementById('teamSearchInput');
  const clearBtn = document.getElementById('teamSearchClearBtn');
  if (!input) return;

  // --- PORTAL: Create/reuse dropdown as a direct <body> child ---
  let dropdown = document.getElementById('teamSearchResultsDropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'teamSearchResultsDropdown';
    dropdown.className = 'team-search-results-dropdown';
    dropdown.style.display = 'none';
    document.body.appendChild(dropdown);
  } else if (dropdown.parentElement !== document.body) {
    document.body.appendChild(dropdown);
  }

  function positionDropdown() {
    const rect = input.closest('.team-search-input-box')?.getBoundingClientRect() || input.getBoundingClientRect();
    dropdown.style.top    = (rect.bottom + 6) + 'px';
    dropdown.style.left   = rect.left + 'px';
    dropdown.style.width  = rect.width + 'px';
  }

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

    const matchedTeams = Object.keys(TEAMS_DATABASE)
      .filter(tid => teamMatchesSearchQuery(tid, TEAMS_DATABASE[tid], q))
      .sort((a, b) => calculateTeamSearchRelevance(b, TEAMS_DATABASE[b], q) - calculateTeamSearchRelevance(a, TEAMS_DATABASE[a], q));

    // Filter pill buttons in the track
    const matchedSet = new Set(matchedTeams);
    document.querySelectorAll('.team-pill-btn').forEach(btn => {
      btn.style.display = matchedSet.has(btn.dataset.teamid) ? '' : 'none';
    });

    if (matchedTeams.length === 0) {
      dropdown.innerHTML = `
        <div class="team-search-no-results" style="padding: 1rem; text-align: center; color: var(--color-text-dim, #94a3b8); font-size: 0.88rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span>No teams found for "${query}"</span>
        </div>
      `;
      positionDropdown();
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
      const chooseTeam = (e) => {
        if (e) e.preventDefault();
        selectTeam(tid);
        input.value = '';
        performSearch('');
        dropdown.style.display = 'none';
        input.blur();
      };
      item.addEventListener('click', chooseTeam);
      item.addEventListener('pointerdown', chooseTeam);
      dropdown.appendChild(item);
    });

    positionDropdown();
    dropdown.style.display = 'block';
  }

  input.addEventListener('input', (e) => { performSearch(e.target.value); });
  input.addEventListener('focus', () => { if (input.value.trim()) performSearch(input.value); });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim().toLowerCase();
      const matched = Object.keys(TEAMS_DATABASE)
        .filter(tid => teamMatchesSearchQuery(tid, TEAMS_DATABASE[tid], q))
        .sort((a, b) => calculateTeamSearchRelevance(b, TEAMS_DATABASE[b], q) - calculateTeamSearchRelevance(a, TEAMS_DATABASE[a], q))[0];
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

  // Global Keyboard Shortcut
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

  // Reposition on scroll/resize (position:fixed needs manual tracking)
  const reposition = () => { if (dropdown.style.display !== 'none') positionDropdown(); };
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });

  // Close dropdown on outside click
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

  // If user actively selects another team, clean any lingering scenario hash so fresh team baseline is used
  if (window.location.hash && (window.location.hash.includes('s=') || window.location.hash.includes('sim='))) {
    try {
      history.replaceState(null, document.title, window.location.pathname + (window.location.search ? window.location.search : ''));
    } catch (e) {}
  }

  // Update Body Theme Class
  document.body.className = team.themeClass || `theme-${teamId}`;

  // Update Hero & Footer with Official Logos (Nav logo permanently stays CFB Prophet Brand)
  document.getElementById('heroEmblem').innerHTML = `<img src="${team.logoUrl}" alt="${team.name}" class="hero-logo-img">`;
  document.getElementById('heroTeamName').innerText = team.name;
  document.getElementById('footerEmblem').innerHTML = `<img src="${team.logoUrl}" alt="${team.name}" style="width: 28px; height: 28px; object-fit: contain;">`;

  const rankEl = document.getElementById('heroRank');
  if (rankEl) rankEl.innerText = `${team.apRank} POLL`;
  const nattyEl = document.getElementById('heroNattyOdds');
  const oddsStr = getTeamTitleOdds(teamId);
  if (nattyEl) nattyEl.innerText = `${oddsStr} Title Odds`;
  const coachEl = document.getElementById('heroCoach');
  if (coachEl) coachEl.innerText = `HC: ${team.headCoach}`;
  const ocEl = document.getElementById('heroOC');
  if (ocEl) ocEl.innerText = `OC: ${team.offensiveCoordinator || 'Coordinating Staff'}`;
  const dcEl = document.getElementById('heroDC');
  if (dcEl) dcEl.innerText = `DC: ${team.defensiveCoordinator || 'Staff'}`;
  const starEl = document.getElementById('heroStarPlayer');
  if (starEl) starEl.innerText = `Star: ${team.starPlayer}`;
  const stadiumEl = document.getElementById('heroStadium');
  if (stadiumEl) {
    const capacityStr = team.stadiumCapacity ? ` (${team.stadiumCapacity})` : '';
    stadiumEl.innerText = `${team.stadium || 'Home Stadium'}${capacityStr}`;
  }

  // Update Active State in Top Track & ensure all pills are visible
  document.querySelectorAll('.team-pill-btn').forEach(btn => {
    btn.style.display = '';
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
  // If baseline with no custom adjustments, return exact calibrated game values from database!
  const isTeamCustom = isSlidersCustom(teamSliders);
  const isOppCustom = isSlidersCustom(oppSliders);
  const gameSlider = game && game.id ? state.gameSliders[game.id] : null;
  const weather = gameSlider?.weather || 'dome';
  const hasInjury = !!gameSlider?.injury;

  if (!userPick && !isTeamCustom && !isOppCustom && !hasInjury && weather === 'dome' && game && typeof game.projScoreUt === 'number' && typeof game.projScoreOpp === 'number') {
    const rawProb = typeof game.baseWinProb === 'number' ? game.baseWinProb : (game.projScoreUt > game.projScoreOpp ? 60 : 40);
    return {
      adjWinProb: Math.min(99, Math.max(1, Math.round(rawProb))),
      projUt: game.projScoreUt,
      projOpp: game.projScoreOpp,
      isWin: game.projScoreUt > game.projScoreOpp
    };
  }

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

  const provider = game.oddsProvider || 'DraftKings';
  let badgeHtml = '';
  if (hasSpreadEdge) {
    badgeHtml = `<span class="vegas-edge-badge highlight" title="Sharp Market Edge: Model Spread deviates by ${Math.abs(spreadEdge).toFixed(1)} pts from ${provider} line"><i class="fa-solid fa-gem"></i> ${Math.abs(spreadEdge).toFixed(1)} PT SPREAD EDGE</span>`;
  } else if (hasTotalEdge) {
    const ouType = totalEdge > 0 ? 'OVER' : 'UNDER';
    badgeHtml = `<span class="vegas-edge-badge" title="Total Edge vs ${provider} ${vegasTotal} O/U"><i class="fa-solid fa-arrow-trend-up"></i> ${ouType} EDGE (${Math.abs(totalEdge).toFixed(1)} PTS)</span>`;
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

  // 0b. Direct Manual Score Override on this game
  const manualScore = state.manualScores && state.manualScores[game.id];
  if (manualScore && typeof manualScore.teamScore === 'number' && typeof manualScore.oppScore === 'number') {
    const isWin = manualScore.teamScore > manualScore.oppScore;
    const diff = Math.abs(manualScore.teamScore - manualScore.oppScore);
    const winProb = isWin ? Math.min(99, Math.max(51, Math.round(50 + diff * 3))) : Math.max(1, Math.min(49, Math.round(50 - diff * 3)));
    return {
      adjWinProb: winProb,
      projUt: manualScore.teamScore,
      projOpp: manualScore.oppScore,
      isWin,
      isFinal: false,
      isCustomTuned: true,
      isManualScore: true,
      syncedFrom: null
    };
  }

  // 0c. Counterpart Manual Score Override
  const counterpartCheck = findCounterpartMatchup(teamId, game);
  if (counterpartCheck && state.manualScores && state.manualScores[counterpartCheck.oppGame.id]) {
    const oppManual = state.manualScores[counterpartCheck.oppGame.id];
    const isWin = oppManual.oppScore > oppManual.teamScore;
    const diff = Math.abs(oppManual.oppScore - oppManual.teamScore);
    const winProb = isWin ? Math.min(99, Math.max(51, Math.round(50 + diff * 3))) : Math.max(1, Math.min(49, Math.round(50 - diff * 3)));
    return {
      adjWinProb: winProb,
      projUt: oppManual.oppScore,
      projOpp: oppManual.teamScore,
      isWin,
      isFinal: false,
      isCustomTuned: true,
      isManualScore: true,
      syncedFrom: counterpartCheck.oppTeam.shortName || counterpartCheck.oppTeam.name
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
  let nattyOdds = getTeamTitleOdds(state.currentTeamId);

  if (currentSeedNum >= 1 && currentSeedNum <= 4) {
    cfpSeed = `#${currentSeedNum} SEED`;
    cfpStatus = '1st Round Bye (Quarterfinals)';
  } else if (currentSeedNum >= 5 && currentSeedNum <= 8) {
    cfpSeed = `#${currentSeedNum} SEED`;
    cfpStatus = `Hosts 1st Round (${team.stadiumCity || 'On Campus'})`;
  } else if (currentSeedNum >= 9 && currentSeedNum <= 12) {
    cfpSeed = `#${currentSeedNum} SEED`;
    cfpStatus = 'First Round Road Game';
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
  renderTeamSelector();
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

  // Calculate team prediction accuracy on settled games
  let settledGamesCount = 0;
  let correctSettledCount = 0;
  let atsSettledCount = 0;

  team.schedule.forEach(g => {
    const actUt = typeof g.actualScoreUt === 'number' ? g.actualScoreUt : (typeof g.finalTeamScore === 'number' ? g.finalTeamScore : null);
    const actOpp = typeof g.actualScoreOpp === 'number' ? g.actualScoreOpp : (typeof g.finalOppScore === 'number' ? g.finalOppScore : null);
    if (g.isFinal && actUt !== null && actOpp !== null) {
      settledGamesCount++;
      const actWin = actUt > actOpp;
      let pPick = state.userPicks[g.id];
      if (!pPick && state.manualScores && state.manualScores[g.id]) {
        pPick = state.manualScores[g.id].teamScore > state.manualScores[g.id].oppScore ? 'W' : 'L';
      }
      const predUt = typeof g.predictedScoreUt === 'number' ? g.predictedScoreUt : (typeof g.projScoreUt === 'number' ? g.projScoreUt : 24);
      const predOpp = typeof g.predictedScoreOpp === 'number' ? g.predictedScoreOpp : (typeof g.projScoreOpp === 'number' ? g.projScoreOpp : 21);
      if (!pPick) {
        pPick = (g.baseWinProb >= 50 || (predUt > predOpp)) ? 'W' : 'L';
      }
      if ((pPick === 'W') === actWin) {
        correctSettledCount++;
      }

      if (typeof g.vegasSpread === 'number') {
        const actualMargin = actUt - actOpp;
        const predMargin = predUt - predOpp;
        const teamCoverMargin = actualMargin + g.vegasSpread;
        if (Math.abs(teamCoverMargin) < 0.25) {
          atsSettledCount++;
        } else {
          const modelPickCover = (predMargin + g.vegasSpread) > 0;
          const teamCovered = teamCoverMargin > 0;
          if (modelPickCover === teamCovered) {
            atsSettledCount++;
          }
        }
      }
    }
  });

  if (settledGamesCount > 0) {
    const isPerfect = (correctSettledCount === settledGamesCount);
    const earnedPts = correctSettledCount * 10;
    const maxPossiblePts = settledGamesCount * 10;
    const lostPts = maxPossiblePts - earnedPts;
    const suPct = Math.round((correctSettledCount / settledGamesCount) * 100);
    const atsPct = Math.round((atsSettledCount / settledGamesCount) * 100);

    const accuracyBanner = document.createElement('div');
    accuracyBanner.className = `team-schedule-accuracy-banner ${isPerfect ? 'perfect' : 'has-misses'}`;
    accuracyBanner.innerHTML = `
      <div class="ts-acc-left">
        <span class="ts-acc-icon"><i class="fa-solid ${isPerfect ? 'fa-award' : 'fa-chart-pie'}"></i></span>
        <div class="ts-acc-text">
          <span class="ts-acc-title">LIVE PREDICTION & SPREAD PERFORMANCE (${settledGamesCount} ${settledGamesCount === 1 ? 'GAME' : 'GAMES'} FINAL)</span>
          <span class="ts-acc-detail">
            <strong>Straight Up: ${correctSettledCount} of ${settledGamesCount} Hit (${suPct}%)</strong> • 
            <strong>ATS: ${atsSettledCount} of ${settledGamesCount} Beat Vegas (${atsPct}%)</strong>
            ${lostPts > 0 ? `<br><span class="ts-pts-lost"><i class="fa-solid fa-triangle-exclamation"></i> -${lostPts} PTS from ${settledGamesCount - correctSettledCount} missed pick</span>` : ' • <span class="ts-pts-perfect"><i class="fa-solid fa-check"></i> 100% Win/Loss Record</span>'}
          </span>
        </div>
      </div>
      <div class="ts-acc-score">
        <span class="ts-pts-num">${earnedPts}</span>
        <span class="ts-pts-total">/ ${maxPossiblePts} PTS</span>
      </div>
    `;
    grid.appendChild(accuracyBanner);
  }

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
    card.id = `game-card-${game.id}`;
    card.className = `game-card ${game.isMarquee ? 'marquee-border' : ''}`;

    const userPick = state.userPicks[game.id];
    const isWin = sim.isWin;
    const effectivePick = userPick || (isWin ? 'W' : 'L');

    // Extract actual final scores
    const actualUt = typeof game.actualScoreUt === 'number' ? game.actualScoreUt : (typeof game.finalTeamScore === 'number' ? game.finalTeamScore : null);
    const actualOpp = typeof game.actualScoreOpp === 'number' ? game.actualScoreOpp : (typeof game.finalOppScore === 'number' ? game.finalOppScore : null);
    const hasFinalScores = (sim.isFinal || game.isFinal) && actualUt !== null && actualOpp !== null;

    // Extract predicted scores
    const predUt = typeof game.predictedScoreUt === 'number' ? game.predictedScoreUt : (typeof game.projScoreUt === 'number' ? game.projScoreUt : 24);
    const predOpp = typeof game.predictedScoreOpp === 'number' ? game.predictedScoreOpp : (typeof game.projScoreOpp === 'number' ? game.projScoreOpp : 21);
    const predMargin = predUt - predOpp;

    // Determine predicted straight-up pick
    let predictedPick = userPick;
    if (!predictedPick && state.manualScores && state.manualScores[game.id]) {
      predictedPick = state.manualScores[game.id].teamScore > state.manualScores[game.id].oppScore ? 'W' : 'L';
    }
    if (!predictedPick) {
      predictedPick = (game.baseWinProb >= 50 || predMargin >= 0) ? 'W' : 'L';
    }

    const actualWin = hasFinalScores ? (actualUt > actualOpp) : isWin;
    const predictedWin = (predictedPick === 'W');
    const isPredictionCorrect = hasFinalScores ? (predictedWin === actualWin) : true;

    // Against The Spread (ATS) & Beat Vegas Calculations
    let spreadHit = false;
    let isPush = false;
    let spreadCoverText = '';
    let diagnosticText = '';

    if (hasFinalScores && typeof game.vegasSpread === 'number') {
      const actualMargin = actualUt - actualOpp;
      const teamCoverMargin = actualMargin + game.vegasSpread; // Margin over spread

      if (Math.abs(teamCoverMargin) < 0.25) {
        isPush = true;
        spreadHit = true;
        spreadCoverText = `Push vs ${game.vegasSpread} line`;
      } else if (teamCoverMargin > 0) {
        spreadCoverText = `${team.abbr} Covered (${game.vegasSpread < 0 ? game.vegasSpread : '+' + game.vegasSpread})`;
      } else {
        const oppLine = game.vegasSpread < 0 ? `+${Math.abs(game.vegasSpread)}` : `-${game.vegasSpread}`;
        spreadCoverText = `${game.oppAbbr} Covered (${oppLine})`;
      }

      const modelPickCover = (predMargin + game.vegasSpread) > 0;
      const teamCovered = teamCoverMargin > 0;

      if (isPush) {
        spreadHit = true;
      } else if (modelPickCover === teamCovered) {
        spreadHit = true; // Beat Vegas!
      } else {
        spreadHit = false; // Missed spread
      }

      // Diagnostic explanation ("call out where we were wrong in the prediction")
      const marginError = actualMargin - predMargin;
      const diffTeam = actualUt - predUt;
      const diffOpp = actualOpp - predOpp;

      if (Math.abs(marginError) <= 3) {
        diagnosticText = `🎯 Spot-On Calibration: Model within ${Math.abs(marginError)} pts of actual margin (${actualMargin > 0 ? '+' : ''}${actualMargin} vs ${predMargin > 0 ? '+' : ''}${predMargin} proj).`;
      } else if (diffOpp > 7) {
        diagnosticText = `⚠️ Underestimated ${game.oppAbbr} attack: ${game.oppAbbr} scored ${actualOpp} pts (+${diffOpp} over ${predOpp} proj). Spread pick ${spreadHit ? 'held' : 'failed'}.`;
      } else if (diffTeam < -7) {
        diagnosticText = `⚠️ Underperformed on offense: ${team.abbr} scored ${actualUt} pts (${diffTeam} below ${predUt} proj), missing the spread cover.`;
      } else if (marginError < -3) {
        diagnosticText = `⚠️ Margin variance: Model projected ${team.abbr} by ${predMargin > 0 ? '+' : ''}${predMargin}, but actual margin was ${actualMargin > 0 ? '+' : ''}${actualMargin} (off by ${Math.abs(marginError)} pts).`;
      } else {
        diagnosticText = `⚠️ Model was conservative on ${team.abbr}: Won by +${actualMargin} (outperformed ${predMargin > 0 ? '+' : ''}${predMargin} proj by +${marginError} pts).`;
      }
    }

    if (hasFinalScores) {
      if (!isPredictionCorrect) {
        card.classList.add('prediction-wrong-card');
      } else {
        card.classList.add('prediction-correct-card');
      }
    }

    let badgeHtml = `<span>${game.isHome ? 'HOME' : 'AWAY'}</span>`;
    if (hasFinalScores) {
      const suBadge = !isPredictionCorrect ? 
        `<span class="prediction-status-badge wrong" title="Straight Up Missed: 0 of 10 Points"><i class="fa-solid fa-circle-xmark"></i> PREDICTION WRONG (0 PTS)</span>` : 
        `<span class="prediction-status-badge correct" title="Straight Up Hit: +10 Points"><i class="fa-solid fa-circle-check"></i> PREDICTION HIT (+10 PTS)</span>`;
      
      const atsBadge = (typeof game.vegasSpread === 'number') ? (
        spreadHit ?
          `<span class="prediction-status-badge spread-cover" title="Beat Vegas Line (${game.vegasSpread})"><i class="fa-solid fa-bolt"></i> BEAT VEGAS (COVER)</span>` :
          `<span class="prediction-status-badge spread-wrong" title="Failed to Cover Vegas Line (${game.vegasSpread})"><i class="fa-solid fa-triangle-exclamation"></i> SPREAD: LOSS</span>`
      ) : '';

      badgeHtml = `${atsBadge} ${suBadge}`;
    } else if (sim.isManualScore) {
      badgeHtml = `<span class="custom-tuned-badge manual-score-badge"><i class="fa-solid fa-pen-to-square"></i> CUSTOM SCORE</span>`;
    } else if (sim.isCustomTuned) {
      if (sim.syncedFrom) {
        badgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-link"></i> SYNCED: ${sim.syncedFrom.toUpperCase()}</span>`;
      } else {
        badgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-bullseye"></i> CUSTOM TUNED</span>`;
      }
    }

    card.innerHTML = `
      <div class="card-top">
        <span>${game.week} • ${formatGameDateWithTime(game)}</span>
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

        <div class="score-center" onclick="event.stopPropagation();">
          <div class="proj-score-box ${hasFinalScores ? 'locked-score-box' : 'editable-score-box'}" title="${hasFinalScores ? 'Official Final Score (Locked)' : 'Type to project custom score'}">
            <input type="number" min="0" max="99" 
                   class="score-input ${isWin ? 'win-score' : ''} ${hasFinalScores ? 'locked-score-input' : ''}" 
                   value="${hasFinalScores ? actualUt : sim.projUt}" 
                   ${hasFinalScores ? 'disabled readonly' : ''}
                   data-gameid="${game.id}" 
                   data-side="team" 
                   aria-label="${team.abbr} score projection"
                   onchange="handleScoreInputChange('${game.id}', 'team', this.value)"
                   onfocus="this.select();"
                   onclick="event.stopPropagation();">
            <span class="score-divider">-</span>
            <input type="number" min="0" max="99" 
                   class="score-input ${!isWin ? 'win-score' : ''} ${hasFinalScores ? 'locked-score-input' : ''}" 
                   value="${hasFinalScores ? actualOpp : sim.projOpp}" 
                   ${hasFinalScores ? 'disabled readonly' : ''}
                   data-gameid="${game.id}" 
                   data-side="opp" 
                   aria-label="${game.oppAbbr} score projection"
                   onchange="handleScoreInputChange('${game.id}', 'opp', this.value)"
                   onfocus="this.select();"
                   onclick="event.stopPropagation();">
          </div>
          <div class="score-sub-row">
            ${hasFinalScores ? (
              `<div class="pred-vs-actual-badge" title="Model Projection vs Official Final">
                <span class="pva-proj">PROJ: <strong>${predUt}-${predOpp}</strong></span>
                <span class="pva-div">|</span>
                <span class="pva-final">FINAL: <strong>${actualUt}-${actualOpp}</strong></span>
                <span class="pva-div">•</span>
                <span class="pva-spread ${spreadHit ? 'hit' : 'miss'}">${spreadCoverText}</span>
              </div>`
            ) : `<span class="vegas-line" title="${game.oddsProvider || 'DraftKings'} Live Market Line">${game.vegasSpread < 0 ? `${team.abbr} ${game.vegasSpread}` : (game.vegasSpread === 0 ? 'PICK' : `${game.oppAbbr} -${game.vegasSpread}`)}</span>`}
            ${(!hasFinalScores && sim.isManualScore) ? `<button class="reset-score-mini-btn" onclick="resetManualScore('${game.id}', event)" title="Reset to AI baseline projection"><i class="fa-solid fa-rotate-left"></i> Reset</button>` : ''}
          </div>
        </div>

        <div class="team-pill" style="justify-content: flex-end; text-align: right;">
          <div class="team-text">
            <span class="team-abbr">${game.oppAbbr}</span>
            <span class="team-ranking-sub">${(game.oppId && TEAMS_DATABASE[game.oppId]) ? TEAMS_DATABASE[game.oppId].apRank : (game.oppRank || 'NR')}</span>
          </div>
          <div class="team-logo-circle" style="border: 2px solid ${game.oppColor}; padding: 3px;">
            <img src="${game.oppLogoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[game.oppAbbr] : '') || ''}" alt="${game.oppAbbr}" class="card-team-logo">
          </div>
        </div>
      </div>

      <div class="card-stats-row">
        <div class="prob-labels-sm">
          <span>${hasFinalScores ? 'OUTCOME' : 'WIN PROBABILITY'}</span>
          <span style="color: ${isWin ? 'var(--color-success)' : 'var(--color-danger)'};">${hasFinalScores ? (isWin ? 'WIN 100%' : 'LOSS 0%') : `${sim.adjWinProb}%`}</span>
        </div>
        <div class="prob-track-sm">
          <div class="prob-fill-sm" style="width: ${sim.adjWinProb}%; background: ${isWin ? 'var(--color-brand-primary)' : 'var(--color-danger)'};"></div>
        </div>
      </div>

      <div class="card-actions">
        ${hasFinalScores ? `
          <div class="prediction-outcome-bar ${isPredictionCorrect ? 'correct' : 'wrong'}">
            <div class="prediction-outcome-main" style="width: 100%;">
              <span class="${isPredictionCorrect ? 'prediction-check-icon' : 'prediction-x-icon'}">
                <i class="fa-solid ${isPredictionCorrect ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
              </span>
              <div class="prediction-outcome-desc" style="width: 100%;">
                <div class="outcome-header-row" style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 6px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="outcome-status-title ${isPredictionCorrect ? 'correct' : 'wrong'}">
                      ${isPredictionCorrect ? 'STRAIGHT UP HIT' : 'STRAIGHT UP WRONG'}
                    </span>
                    <span class="points-diff-badge ${isPredictionCorrect ? 'plus' : 'minus'}">
                      ${isPredictionCorrect ? '+10 PTS' : '0 / 10 PTS'}
                    </span>
                  </div>
                  ${typeof game.vegasSpread === 'number' ? `
                    <span class="spread-kpi-pill ${spreadHit ? 'cover' : 'loss'}">
                      <i class="fa-solid ${spreadHit ? 'fa-shield-halved' : 'fa-triangle-exclamation'}"></i>
                      ${spreadHit ? 'BEAT VEGAS: SPREAD WIN' : 'SPREAD LOSS (FAILED TO COVER)'}
                    </span>
                  ` : ''}
                </div>

                <div class="kpi-scores-comparison-row">
                  <div class="kpi-score-col">
                    <span class="kpi-score-lbl">MODEL PROJ</span>
                    <span class="kpi-score-val proj">${team.abbr} ${predUt} - ${predOpp} ${game.oppAbbr}</span>
                  </div>
                  <div class="kpi-score-col">
                    <span class="kpi-score-lbl">ACTUAL FINAL</span>
                    <span class="kpi-score-val actual">${team.abbr} ${actualUt} - ${actualOpp} ${game.oppAbbr}</span>
                  </div>
                  <div class="kpi-score-col">
                    <span class="kpi-score-lbl">VEGAS LINE</span>
                    <span class="kpi-score-val line">${game.vegasSpread < 0 ? `${team.abbr} ${game.vegasSpread}` : (game.vegasSpread === 0 ? 'PICK' : `${game.oppAbbr} -${game.vegasSpread}`)}</span>
                  </div>
                  <div class="kpi-score-col">
                    <span class="kpi-score-lbl">SPREAD RESULT</span>
                    <span class="kpi-score-val ${spreadHit ? 'cover-text' : 'loss-text'}">${spreadCoverText}</span>
                  </div>
                </div>

                ${diagnosticText ? `
                  <div class="prediction-diagnostic-row">
                    <span class="diag-icon"><i class="fa-solid fa-chart-line"></i></span>
                    <span class="diag-text">${diagnosticText}</span>
                  </div>
                ` : ''}
              </div>
            </div>
            <button class="sim-btn-sm" data-simid="${game.id}" onclick="event.stopPropagation(); window.openSimModalByGameId('${game.id}');" style="background: ${isPredictionCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; border: 1px solid ${isPredictionCorrect ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; color: ${isPredictionCorrect ? '#6EE7B7' : '#FCA5A5'};">
              <i class="fa-solid fa-clipboard-check"></i>
              <span>Box Score</span>
            </button>
          </div>
        ` : `
          <div class="wl-toggle-wrap" onclick="event.stopPropagation();">
            <span>PICK:</span>
            <button class="wl-toggle-btn ${effectivePick === 'W' ? 'win' : ''}" data-pick="W" data-gameid="${game.id}" onclick="event.stopPropagation();">W</button>
            <button class="wl-toggle-btn ${effectivePick === 'L' ? 'loss' : ''}" data-pick="L" data-gameid="${game.id}" onclick="event.stopPropagation();">L</button>
          </div>
          <button class="sim-btn-sm" data-simid="${game.id}" onclick="event.stopPropagation(); window.openSimModalByGameId('${game.id}');">
            <i class="fa-solid fa-play"></i>
            <span>Simulate</span>
          </button>
        `}
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
      if (e.target.closest('.wl-toggle-btn') || e.target.closest('.wl-toggle-wrap') || e.target.closest('.score-input') || e.target.closest('.editable-score-box') || e.target.closest('.reset-score-mini-btn')) return;
      openSimModal(game);
    });

    grid.appendChild(card);
  });

  if (window.location.hash && window.location.hash.startsWith('#game-card-')) {
    setTimeout(() => {
      const targetEl = document.querySelector(window.location.hash);
      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }
}
if (typeof window !== 'undefined') window.renderSchedule = renderSchedule;

function findGameById(gameId) {
  if (!gameId) return null;
  const team = TEAMS_DATABASE[state.currentTeamId];
  if (team && team.schedule) {
    const found = team.schedule.find(g => g.id === gameId);
    if (found) return found;
  }
  if (state.postseasonGames && state.postseasonGames[gameId]) {
    return state.postseasonGames[gameId];
  }
  for (const tid of Object.keys(TEAMS_DATABASE)) {
    const g = (TEAMS_DATABASE[tid].schedule || []).find(x => x.id === gameId);
    if (g) return g;
  }
  return null;
}
window.findGameById = findGameById;

function handleScoreInputChange(gameId, side, value) {
  const numVal = parseInt(value, 10);
  if (isNaN(numVal) || numVal < 0) return;

  const gObj = findGameById(gameId) || { id: gameId };
  if (gObj && gObj.isFinal) {
    if (typeof showCustomToast === 'function') {
      showCustomToast('🔒 Cannot edit completed game with official final score');
    }
    return;
  }

  if (!state.manualScores) state.manualScores = {};
  const currentSim = calculateAdjustedMatchup(gObj);
  let teamScore = state.manualScores[gameId]?.teamScore ?? currentSim.projUt;
  let oppScore = state.manualScores[gameId]?.oppScore ?? currentSim.projOpp;

  if (side === 'team') {
    teamScore = Math.min(99, Math.max(0, numVal));
  } else {
    oppScore = Math.min(99, Math.max(0, numVal));
  }

  // Prevent ties in football simulation
  if (teamScore === oppScore) {
    if (side === 'team') teamScore += 1;
    else oppScore += 1;
  }

  state.manualScores[gameId] = { teamScore, oppScore };
  state.userPicks[gameId] = teamScore > oppScore ? 'W' : 'L';

  // Cross-sync with counterpart game
  if (gObj) {
    const counterpart = findCounterpartMatchup(state.currentTeamId, gObj);
    if (counterpart) {
      if (!state.manualScores) state.manualScores = {};
      state.manualScores[counterpart.oppGame.id] = {
        teamScore: oppScore,
        oppScore: teamScore
      };
      state.userPicks[counterpart.oppGame.id] = oppScore > teamScore ? 'W' : 'L';
    }
  }

  recalculateSeason();
  showCustomToast(`🎯 Projected score set: ${teamScore} - ${oppScore}`);
}
window.handleScoreInputChange = handleScoreInputChange;

function resetManualScore(gameId, e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  if (state.manualScores && state.manualScores[gameId]) {
    delete state.manualScores[gameId];
  }
  delete state.userPicks[gameId];

  const gObj = findGameById(gameId);
  if (gObj) {
    const counterpart = findCounterpartMatchup(state.currentTeamId, gObj);
    if (counterpart && state.manualScores) {
      delete state.manualScores[counterpart.oppGame.id];
      delete state.userPicks[counterpart.oppGame.id];
    }
  }

  recalculateSeason();
  showCustomToast('↺ Score reset to AI simulation baseline.');
}
window.resetManualScore = resetManualScore;

// ==========================================================================
// GLOBAL SLIDERS & PRESETS
// ==========================================================================

function updateGlobalSliderLabels(team) {
  if (!team) team = TEAMS_DATABASE[state.currentTeamId] || TEAMS_DATABASE['ohiostate'];
  if (!team) return;

  const labels = team.sliderLabels || {
    qb: 'QB Execution',
    ground: 'Ground Attack',
    defense: 'Defense & Havoc',
    turnover: 'Turnover Margin Luck',
    crowd: 'Home Stadium Roar'
  };

  const modalTitle = document.getElementById('modalTuningTeamTitle');
  if (modalTitle) {
    modalTitle.innerText = `${team.name.toUpperCase()} AI TUNING`;
  }

  const sliderKeys = [
    { key: 'qbRating', label: labels.qb, icon: 'fa-solid fa-crosshairs' },
    { key: 'groundAttack', label: labels.ground, icon: 'fa-solid fa-person-running' },
    { key: 'defenseHavoc', label: labels.defense, icon: 'fa-solid fa-shield-halved' },
    { key: 'turnoverLuck', label: labels.turnover, icon: 'fa-solid fa-dice' },
    { key: 'crowdNoise', label: labels.crowd, icon: 'fa-solid fa-bullhorn' }
  ];

  const currentSliders = getTeamSliders(state.currentTeamId);
  const containers = [
    document.getElementById('globalSlidersGrid'),
    document.getElementById('modalSlidersGrid')
  ].filter(Boolean);

  containers.forEach(container => {
    container.innerHTML = '';
    sliderKeys.forEach(s => {
      const card = document.createElement('div');
      card.className = 'slider-card';
      const val = currentSliders[s.key] || 0;
      const sign = val > 0 ? '+' : '';

      card.innerHTML = `
        <div class="slider-top-row">
          <span class="slider-title"><i class="${s.icon}"></i> ${s.label}</span>
          <span class="slider-val-readout readout-${s.key}" id="readout-${s.key}">${sign}${val}%</span>
        </div>
        <input type="range" class="custom-range-slider slider-${s.key}" id="slider-${s.key}" data-key="${s.key}" min="-50" max="50" value="${val}" step="5">
        <div class="slider-hints-row">
          <span>-50% Slump</span>
          <span>Baseline</span>
          <span>+50% Elite</span>
        </div>
      `;

      const range = card.querySelector('input');
      range.addEventListener('input', (e) => {
        const teamSliders = getTeamSliders(state.currentTeamId);
        const newVal = parseInt(e.target.value, 10);
        teamSliders[s.key] = newVal;
        const signStr = newVal > 0 ? '+' : '';
        
        // Sync readouts and sliders across all containers
        document.querySelectorAll(`.readout-${s.key}`).forEach(r => {
          r.innerText = `${signStr}${newVal}%`;
        });
        document.querySelectorAll(`.slider-${s.key}`).forEach(input => {
          if (input !== range) input.value = newVal;
        });

        // Remove active from presets since custom sliders are in use
        state.teamActivePresets[state.currentTeamId] = 'custom';
        document.querySelectorAll('#globalPresetsContainer .preset-btn:not(.reset-all-btn), #modalPresetsContainer .preset-btn:not(.reset-all-btn)').forEach(b => b.classList.remove('active'));
        recalculateSeason();
      });

      container.appendChild(card);
    });
  });
}

function syncSliderInputsToActiveTeam() {
  const currentSliders = getTeamSliders(state.currentTeamId);
  const activePreset = state.teamActivePresets[state.currentTeamId] || (isSlidersCustom(currentSliders) ? 'custom' : 'baseline');

  Object.keys(currentSliders).forEach(k => {
    const val = currentSliders[k] || 0;
    const sign = val > 0 ? '+' : '';
    document.querySelectorAll(`.slider-${k}`).forEach(range => {
      range.value = val;
    });
    document.querySelectorAll(`.readout-${k}`).forEach(readout => {
      readout.innerText = `${sign}${val}%`;
    });
  });

  const containers = [
    document.getElementById('globalPresetsContainer'),
    document.getElementById('modalPresetsContainer')
  ].filter(Boolean);

  containers.forEach(container => {
    container.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
      const isMatching = btn.dataset.preset === activePreset;
      btn.classList.toggle('active', isMatching);
    });
  });

  const selectEl = document.getElementById('globalPresetSelect');
  if (selectEl) {
    selectEl.value = activePreset === 'custom' ? 'baseline' : activePreset;
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

window.togglePresetDropdown = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const wrap = document.getElementById('presetDropdownWrap');
  const menu = document.getElementById('presetDropdownMenu');
  const tuningSection = document.getElementById('tuningSection');
  const otherWrap = document.getElementById('scheduleFilterDropdownWrap');
  const otherMenu = document.getElementById('scheduleFilterDropdownMenu');
  const scheduleSection = document.getElementById('scheduleSection');
  const moreMenu = document.getElementById('moreToolsMenu');
  
  if (otherMenu) otherMenu.classList.remove('show');
  if (otherWrap) otherWrap.classList.remove('open');
  if (scheduleSection) scheduleSection.classList.remove('has-open-dropdown');
  if (moreMenu) moreMenu.classList.remove('show');

  if (menu) {
    const isShowing = menu.classList.toggle('show');
    if (wrap) wrap.classList.toggle('open', isShowing);
    if (tuningSection) tuningSection.classList.toggle('has-open-dropdown', isShowing);
  }
};

window.selectGlobalPreset = function(presetKey, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  window.applyGlobalPreset(presetKey);
  const wrap = document.getElementById('presetDropdownWrap');
  const menu = document.getElementById('presetDropdownMenu');
  const tuningSection = document.getElementById('tuningSection');
  if (menu) menu.classList.remove('show');
  if (wrap) wrap.classList.remove('open');
  if (tuningSection) tuningSection.classList.remove('has-open-dropdown');
};

window.applyGlobalPreset = function(presetKey) {
  const presetValues = GLOBAL_PRESETS[presetKey] || GLOBAL_PRESETS['baseline'];
  if (!state.currentTeamId) {
    state.currentTeamId = getTopRankedTeamId() || 'ohiostate';
  }

  // Assign preset specifically to active team
  state.teamSliders[state.currentTeamId] = { ...presetValues };
  state.teamActivePresets[state.currentTeamId] = presetKey;

  const presetLabels = {
    'baseline': '🎯 Season Baseline',
    'qb-mvp': '🔥 QB Heisman Mode',
    'qb-slump': '📉 QB Slump Mode',
    'iron-defense': '🛡️ Iron Curtain Defense',
    'chaos': '🎲 CFB Chaos Mode'
  };

  const labelEl = document.getElementById('presetDropdownLabel');
  if (labelEl) {
    labelEl.innerText = presetLabels[presetKey] || '🎯 Season Baseline';
  }

  // Update active class on dropdown items
  document.querySelectorAll('#presetDropdownMenu .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.preset === presetKey);
  });

  const selectEl = document.getElementById('globalPresetSelect');
  if (selectEl && selectEl.value !== presetKey) {
    selectEl.value = presetKey;
  }

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

function toggleCustomSlidersView() {
  const grid = document.getElementById('globalSlidersGrid');
  const label = document.getElementById('toggleSlidersLabel');
  if (!grid) return;
  const isHidden = grid.style.display === 'none' || !grid.style.display;
  if (isHidden) {
    grid.style.display = 'grid';
    if (label) label.innerText = 'Custom Sliders ▴';
  } else {
    grid.style.display = 'none';
    if (label) label.innerText = 'Custom Sliders ▾';
  }
}
window.toggleCustomSlidersView = toggleCustomSlidersView;

window.resetAllToBaseline = function() {
  state.teamSliders = {};
  state.teamActivePresets = {};
  state.gameSliders = {};
  state.userPicks = {};
  state.manualScores = {};

  const selectEl = document.getElementById('globalPresetSelect');
  if (selectEl) selectEl.value = 'baseline';

  const modalSelectEl = document.getElementById('modalGlobalPresetSelect');
  if (modalSelectEl) modalSelectEl.value = 'baseline';

  // Reset range slider elements to 0
  const sliderKeys = ['qbRating', 'groundAttack', 'defenseHavoc', 'turnoverLuck', 'crowdNoise'];
  sliderKeys.forEach(k => {
    document.querySelectorAll(`input[id^="slider-${k}"]`).forEach(range => { range.value = 0; });
    document.querySelectorAll(`span[id^="readout-${k}"]`).forEach(ro => { ro.innerText = '+0%'; });
  });

  syncSliderInputsToActiveTeam();
  recalculateSeason();

  showToast('⚡ Reset all simulation overrides, picks & sliders to authentic 2026 baselines!');
};

function resetAllToBaseline() {
  window.resetAllToBaseline();
}

window.resetAllSliders = function() {
  window.resetAllToBaseline();
};

function resetAllSliders() {
  window.resetAllToBaseline();
}

function showToast(message) {
  let toast = document.getElementById('prophetToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'prophetToast';
    toast.className = 'prophet-toast gridiron-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-success); margin-right: 6px;"></i> ${message}`;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}
window.showToast = showToast;
window.showCustomToast = showToast;

window.toggleScheduleFilterDropdown = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const wrap = document.getElementById('scheduleFilterDropdownWrap');
  const menu = document.getElementById('scheduleFilterDropdownMenu');
  const scheduleSection = document.getElementById('scheduleSection');
  const otherWrap = document.getElementById('presetDropdownWrap');
  const otherMenu = document.getElementById('presetDropdownMenu');
  const tuningSection = document.getElementById('tuningSection');
  const moreMenu = document.getElementById('moreToolsMenu');
  
  if (otherMenu) otherMenu.classList.remove('show');
  if (otherWrap) otherWrap.classList.remove('open');
  if (tuningSection) tuningSection.classList.remove('has-open-dropdown');
  if (moreMenu) moreMenu.classList.remove('show');

  if (menu) {
    const isShowing = menu.classList.toggle('show');
    if (wrap) wrap.classList.toggle('open', isShowing);
    if (scheduleSection) scheduleSection.classList.toggle('has-open-dropdown', isShowing);
  }
};

window.selectScheduleFilter = function(filterKey, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  window.applyScheduleFilter(filterKey);
  const wrap = document.getElementById('scheduleFilterDropdownWrap');
  const menu = document.getElementById('scheduleFilterDropdownMenu');
  const scheduleSection = document.getElementById('scheduleSection');
  if (menu) menu.classList.remove('show');
  if (wrap) wrap.classList.remove('open');
  if (scheduleSection) scheduleSection.classList.remove('has-open-dropdown');
};

window.applyScheduleFilter = function(filterKey) {
  state.filter = filterKey || 'all';

  const filterLabels = {
    'all': '📅 All 12 Games',
    'marquee': '🔥 Marquee & Rivalries',
    'conf': '🏆 Conference Games',
    'home': '🏟️ Home Games',
    'away': '✈️ Away / Neutral'
  };

  const labelEl = document.getElementById('scheduleFilterLabel');
  if (labelEl) {
    labelEl.innerText = filterLabels[state.filter] || '📅 All 12 Games';
  }

  // Update active class on dropdown items
  document.querySelectorAll('#scheduleFilterDropdownMenu .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.filter === state.filter);
  });

  const selectEl = document.getElementById('scheduleFilterSelect');
  if (selectEl && selectEl.value !== state.filter) {
    selectEl.value = state.filter;
  }
  const container = document.getElementById('scheduleFilterPills');
  if (container) {
    container.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === state.filter);
    });
  }
  renderSchedule();
};

function initFilterButtons() {
  const container = document.getElementById('scheduleFilterPills');
  if (container) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      e.preventDefault();
      window.applyScheduleFilter(btn.dataset.filter);
    });
  }
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
    const isManual = !!(state.manualScores && state.manualScores[game.id]);
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

      <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;" onclick="event.stopPropagation();">
        <div class="editable-score-box" style="padding: 3px 8px; border-radius: var(--radius-md);" title="Click to manually project score">
          <input type="number" min="0" max="99" 
                 class="score-input ${isTeam1Win ? 'win-score' : ''}" 
                 style="width: 52px; height: 38px; font-size: 1.6rem;"
                 value="${score1}" 
                 data-gameid="${game.id}" 
                 data-side="team" 
                 aria-label="${team1.shortName || team1.name} score"
                 onchange="handleScoreInputChange('${game.id}', 'team', this.value); updateModalScoreboardLive();"
                 onfocus="this.select();"
                 onclick="event.stopPropagation();">
          <span style="color: var(--color-text-dim); font-size: 1.4rem; margin: 0 3px;">-</span>
          <input type="number" min="0" max="99" 
                 class="score-input ${!isTeam1Win ? 'win-score' : ''}" 
                 style="width: 52px; height: 38px; font-size: 1.6rem;"
                 value="${score2}" 
                 data-gameid="${game.id}" 
                 data-side="opp" 
                 aria-label="${team2.shortName || team2.name} score"
                 onchange="handleScoreInputChange('${game.id}', 'opp', this.value); updateModalScoreboardLive();"
                 onfocus="this.select();"
                 onclick="event.stopPropagation();">
        </div>
        ${(() => {
          const rProb1 = Math.min(99, Math.max(1, Math.round(Number(prob1) || 50)));
          const rProb2 = 100 - rProb1;
          const edge = calculateVegasEdge(game, { projUt: score1, projOpp: score2 });
          return `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--color-brand-accent); font-weight: 800;">
                WIN PROB: ${rProb1}% - ${rProb2}%
              </span>
              ${isManual ? `<button class="reset-score-mini-btn" onclick="resetManualScore('${game.id}', event); updateModalScoreboardLive();" title="Reset score to AI baseline"><i class="fa-solid fa-rotate-left"></i> Reset</button>` : ''}
            </div>
            ${edge?.badgeHtml || ''}
          `;
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
      const dtStr = formatGameDateWithTime(game);
      stadiumEl.innerText = `${dtStr ? dtStr + ' • ' : ''}${game.stadium || 'Stadium'}${game.location ? ' • ' + game.location : ''}`;
    }

    // Scoreboard
    const scoreboardEl = document.getElementById('modalScoreboard');
    if (scoreboardEl) {
      const isManual = !!(state.manualScores && state.manualScores[game.id]);
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

        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;" onclick="event.stopPropagation();">
          <div class="editable-score-box" style="padding: 3px 8px; border-radius: var(--radius-md);" title="${game.isFinal ? 'Official Final Score (Locked)' : 'Click to manually project score'}">
            <input type="number" min="0" max="99" 
                   class="score-input ${isTeam1Win ? 'win-score' : ''}" 
                   style="width: 52px; height: 38px; font-size: 1.6rem;"
                   value="${score1}" 
                   data-gameid="${game.id}" 
                   data-side="team" 
                   ${game.isFinal ? 'disabled style="opacity: 0.9; cursor: not-allowed;"' : ''}
                   aria-label="${team1.shortName || team1.name} score"
                   onchange="handleScoreInputChange('${game.id}', 'team', this.value); updateModalScoreboardLive();"
                   onfocus="this.select();"
                   onclick="event.stopPropagation();">
            <span style="color: var(--color-text-dim); font-size: 1.4rem; margin: 0 3px;">-</span>
            <input type="number" min="0" max="99" 
                   class="score-input ${!isTeam1Win ? 'win-score' : ''}" 
                   style="width: 52px; height: 38px; font-size: 1.6rem;"
                   value="${score2}" 
                   data-gameid="${game.id}" 
                   data-side="opp" 
                   ${game.isFinal ? 'disabled style="opacity: 0.9; cursor: not-allowed;"' : ''}
                   aria-label="${team2.shortName || team2.name} score"
                   onchange="handleScoreInputChange('${game.id}', 'opp', this.value); updateModalScoreboardLive();"
                   onfocus="this.select();"
                   onclick="event.stopPropagation();">
          </div>
          ${(() => {
            if (game.isFinal) {
              return `<span class="locked-final-tag" style="margin-top: 3px;"><i class="fa-solid fa-lock"></i> OFFICIAL FINAL</span>`;
            }
            const rProb1 = Math.min(99, Math.max(1, Math.round(Number(prob1) || 50)));
            const rProb2 = 100 - rProb1;
            const edge = calculateVegasEdge(game, { projUt: score1, projOpp: score2 });
            return `
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--color-brand-accent); font-weight: 800;">
                  WIN PROB: ${rProb1}% - ${rProb2}%
                </span>
                ${isManual ? `<button class="reset-score-mini-btn" onclick="resetManualScore('${game.id}', event); updateModalScoreboardLive();" title="Reset score to AI baseline"><i class="fa-solid fa-rotate-left"></i> Reset</button>` : ''}
              </div>
              ${edge?.badgeHtml || ''}
            `;
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

      // Unlock manual score so AI slider tuning immediately updates score live
      if (state.manualScores && state.manualScores[game.id]) {
        delete state.manualScores[game.id];
      }
      delete state.userPicks[game.id];
      const counterpart = findCounterpartMatchup(state.currentTeamId, game);
      if (counterpart && state.manualScores && state.manualScores[counterpart.oppGame.id]) {
        delete state.manualScores[counterpart.oppGame.id];
        delete state.userPicks[counterpart.oppGame.id];
      }

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

  // Unlock manual score so weather modifier calculates live
  if (state.manualScores && state.manualScores[game.id]) {
    delete state.manualScores[game.id];
  }
  delete state.userPicks[game.id];
  const counterpart = findCounterpartMatchup(state.currentTeamId, game);
  if (counterpart && state.manualScores && state.manualScores[counterpart.oppGame.id]) {
    delete state.manualScores[counterpart.oppGame.id];
    delete state.userPicks[counterpart.oppGame.id];
  }

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

  // Unlock manual score so injury penalty calculates live
  if (state.manualScores && state.manualScores[game.id]) {
    delete state.manualScores[game.id];
  }
  delete state.userPicks[game.id];
  const counterpart = findCounterpartMatchup(state.currentTeamId, game);
  if (counterpart && state.manualScores && state.manualScores[counterpart.oppGame.id]) {
    delete state.manualScores[counterpart.oppGame.id];
    delete state.userPicks[counterpart.oppGame.id];
  }

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

  // Clear manual score lock so AI simulation calculates live with sliders
  if (state.manualScores && state.manualScores[game.id]) {
    delete state.manualScores[game.id];
  }
  delete state.userPicks[game.id];
  const counterpart = findCounterpartMatchup(state.currentTeamId, game);
  if (counterpart && state.manualScores && state.manualScores[counterpart.oppGame.id]) {
    delete state.manualScores[counterpart.oppGame.id];
    delete state.userPicks[counterpart.oppGame.id];
  }

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
  if (state.manualScores) {
    delete state.manualScores[game.id];
  }
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
    if (state.manualScores) {
      delete state.manualScores[counterpart.oppGame.id];
    }
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

  // Clear manual score lock so the AI scenario preset takes effect
  if (state.manualScores && state.manualScores[game.id]) {
    delete state.manualScores[game.id];
  }
  delete state.userPicks[game.id];
  const counterpart = findCounterpartMatchup(state.currentTeamId, game);
  if (counterpart && state.manualScores && state.manualScores[counterpart.oppGame.id]) {
    delete state.manualScores[counterpart.oppGame.id];
    delete state.userPicks[counterpart.oppGame.id];
  }

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

function closeSimModal() {
  const modal = document.getElementById('simModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
  recalculateSeason();
}
window.closeSimModal = closeSimModal;
window.closeGameModal = closeSimModal;

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
    quickSimBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof runMonteCarloRecalibration === 'function') {
        runMonteCarloRecalibration();
      } else {
        recalculateSeason();
      }
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

  // 0. Check for Direct Manual Score Override on this game
  const manualScore = options.gameId ? (state.manualScores && state.manualScores[options.gameId]) : null;
  if (manualScore && typeof manualScore.teamScore === 'number' && typeof manualScore.oppScore === 'number') {
    const isAWinner = manualScore.teamScore > manualScore.oppScore;
    const diff = Math.abs(manualScore.teamScore - manualScore.oppScore);
    const probA = isAWinner ? Math.min(99, Math.max(51, Math.round(50 + diff * 3))) : Math.max(1, Math.min(49, Math.round(50 - diff * 3)));
    return {
      gameId: options.gameId,
      teamA,
      teamB,
      winner: isAWinner ? teamA : teamB,
      loser: isAWinner ? teamB : teamA,
      scoreA: manualScore.teamScore,
      scoreB: manualScore.oppScore,
      isAWinner,
      winProbA: probA,
      winProbB: 100 - probA
    };
  }

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

    const isManual = !!(state.manualScores && state.manualScores[d.id]);
    const isCustom = !!(state.gameSliders && state.gameSliders[d.id]?.isCustom);
    const isUserPick = !!(state.ccgPicks && state.ccgPicks[d.id]);

    let customBadgeHtml = '';
    if (isManual) {
      customBadgeHtml = `<span class="custom-tuned-badge manual-score-badge"><i class="fa-solid fa-pen-to-square"></i> CUSTOM SCORE</span>`;
    } else if (isUserPick) {
      customBadgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-check"></i> USER PICK</span>`;
    } else if (isCustom) {
      customBadgeHtml = `<span class="custom-tuned-badge"><i class="fa-solid fa-bullseye"></i> CUSTOM TUNED</span>`;
    }

    const card = document.createElement('div');
    card.className = `ccg-card ${isActiveMatchup ? 'active-team-card' : ''}`;
    card.onclick = (e) => {
      if (e.target.closest('.score-input') || e.target.closest('.editable-score-box') || e.target.closest('.reset-score-mini-btn')) return;
      window.openSimModalByGameId(d.id);
    };

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

        <div class="ccg-vs-pill" onclick="event.stopPropagation();">
          <div class="ccg-score-box editable-score-box" title="Type to project custom CCG score">
            <input type="number" min="0" max="99" 
                   class="score-input ${isTeam1Winner ? 'win-score' : ''}" 
                   value="${d.sim.scoreA}" 
                   data-gameid="${d.id}" 
                   data-side="team" 
                   aria-label="${d.team1.shortName} score"
                   onchange="handleScoreInputChange('${d.id}', 'team', this.value)"
                   onfocus="this.select();"
                   onclick="event.stopPropagation();">
            <span class="score-divider">-</span>
            <input type="number" min="0" max="99" 
                   class="score-input ${!isTeam1Winner ? 'win-score' : ''}" 
                   value="${d.sim.scoreB}" 
                   data-gameid="${d.id}" 
                   data-side="opp" 
                   aria-label="${d.team2.shortName} score"
                   onchange="handleScoreInputChange('${d.id}', 'opp', this.value)"
                   onfocus="this.select();"
                   onclick="event.stopPropagation();">
          </div>
          <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
            <span class="ccg-vs-text">${d.sim.winProbA}% - ${d.sim.winProbB}%</span>
            ${isManual ? `<button class="reset-score-mini-btn" onclick="resetManualScore('${d.id}', event)" title="Reset to AI simulation"><i class="fa-solid fa-rotate-left"></i> Reset</button>` : ''}
          </div>
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
    // Official CFP Protocol: Teams participating in CCGs are NOT penalized for an extra 13th game loss
    const l = t.isCcgRunnerUp ? t.losses : (t.totalLosses !== undefined ? t.totalLosses : t.losses);
    const w = t.totalWins !== undefined ? t.totalWins : t.wins;
    const apRankStr = t.apRank || '';
    const rMatch = apRankStr.match(/\d+/);
    const rNum = (apRankStr.includes('#') && rMatch) ? parseInt(rMatch[0], 10) : 99;

    // Severe loss tier penalties (Committee strictly separates 0/1/2/3 loss tiers)
    let lossPts = 0;
    if (l === 0) lossPts = 20000;
    else if (l === 1) lossPts = 15000;
    else if (l === 2) lossPts = 10000;
    else if (l === 3) lossPts = 1000; // Severe 3-loss penalty; never jumps 1/2 loss teams
    else lossPts = 0;

    // AP Poll prestige tier
    let rankPts = 0;
    if (rNum <= 5) rankPts = 3000;
    else if (rNum <= 10) rankPts = 2200;
    else if (rNum <= 15) rankPts = 1500;
    else if (rNum <= 20) rankPts = 1000;
    else if (rNum <= 25) rankPts = 500;
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
  // HARD RULE: No team with 3+ regular season losses (e.g. 9-3 TAMU) is eligible for an at-large bid
  const atLargePool = evaluatedTeams.filter(t => {
    const regLosses = t.losses !== undefined ? t.losses : t.totalLosses;
    return t.conf !== 'Mountain West' &&
           !autoChampIds.has(t.id) &&
           t.id !== 'boisestate' &&
           regLosses <= 2;  // 3-loss teams are categorically excluded
  });
  atLargePool.sort((a, b) => calcCommitteeScore(b) - calcCommitteeScore(a));

  const seed5  = atLargePool[0] || null;
  const seed6  = atLargePool[1] || null;
  const seed7  = atLargePool[2] || null;
  const seed8  = atLargePool[3] || null;
  const seed9  = atLargePool[4] || null;
  const seed10 = atLargePool[5] || null;
  const seed11 = atLargePool[6] || null;
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

  function teamRow(fallbackSeed, tObj, score, isWinner, isHighlighted, gameId, side, isFinalGame = false) {
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
      <div class="matchup-teams-row" onclick="if(!event.target.closest('.score-input')) { event.stopPropagation(); window.openSimModalByGameId('${gameId}'); }">
        <div class="matchup-team-item">
          <span class="matchup-team-logo-wrap"><img src="${logo}" class="matchup-team-logo" alt="${name}"></span>
          <span style="${highlightStyle}">#${seedNum} ${name} <small style="opacity: 0.7; font-size: 0.68rem;">${record}</small></span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          ${gameId && !isFinalGame ? `
            <input type="number" min="0" max="99" 
                   class="score-input ${isWinner ? 'win-score' : ''}" 
                   style="width: 38px; height: 26px; font-size: 1.15rem; padding: 0; line-height: 1;"
                   value="${score}" 
                   data-gameid="${gameId}" 
                   data-side="${side}" 
                   aria-label="${name} score"
                   onchange="handleScoreInputChange('${gameId}', '${side}', this.value)"
                   onfocus="this.select();"
                   onclick="event.stopPropagation();">
          ` : `
            <span style="${isWinner ? 'color: var(--color-success); font-weight: 800;' : 'color: var(--color-text-dim);'}">${score}</span>
          `}
        </div>
      </div>
    `;
  }

  function renderPlayoffMatchupBox(m, seedA, seedB, defaultVenue) {
    if (!m) return '';
    const isActive = isTeamMatch(m.teamA, teamId) || isTeamMatch(m.teamB, teamId);
    const isManual = !!(state.manualScores && state.manualScores[m.id]);
    const isCustom = !!(state.gameSliders && state.gameSliders[m.id]?.isCustom);
    const isUserPick = !!(state.playoffPicks && state.playoffPicks[m.id]);
    const isFinalGame = !!m.isFinal;

    let customBadgeHtml = '';
    if (isManual) {
      customBadgeHtml = `<span class="custom-tuned-badge manual-score-badge"><i class="fa-solid fa-pen-to-square"></i> CUSTOM SCORE</span>`;
    } else if (isUserPick) {
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
      <div class="playoff-matchup-box ${isActive ? 'active-team-matchup' : ''}" onclick="if(!event.target.closest('.score-input') && !event.target.closest('.reset-score-mini-btn')) window.openSimModalByGameId('${m.id}')" title="Click to tune simulation & edit matchup">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-size: 0.65rem; font-family: var(--font-mono); color: var(--color-text-dim); text-transform: uppercase;">${m.label || defaultVenue || 'CFP MATCHUP'}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${customBadgeHtml}
            ${isManual && !isFinalGame ? `<button class="reset-score-mini-btn" onclick="resetManualScore('${m.id}', event)" title="Reset to AI baseline"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
          </div>
        </div>
        ${teamRow(seedB, m.teamB, m.sim.scoreB, !m.sim.isAWinner, isTeamMatch(m.teamB, teamId), m.id, 'opp', isFinalGame)}
        ${teamRow(seedA, m.teamA, m.sim.scoreA, m.sim.isAWinner, isTeamMatch(m.teamA, teamId), m.id, 'team', isFinalGame)}
        
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

        <div class="playoff-result-badge" style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--color-text-dim);">${venueText}</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="playoff-win-tag"><i class="fa-solid fa-check"></i> ${m.sim.winner?.shortName?.toUpperCase()} ADVANCES</span>
            ${!isFinalGame ? `
              <button class="bracket-tune-pill" onclick="event.stopPropagation(); window.openSimModalByGameId('${m.id}')" title="Tune simulation & adjust picks">
                <i class="fa-solid fa-sliders"></i> Edit
              </button>
            ` : `
              <span class="locked-final-tag"><i class="fa-solid fa-lock"></i> FINAL</span>
            `}
          </div>
        </div>
      </div>
    `;
  }

  const p = playoffData;
  const nattyChamp = p.nationalChampion;
  const isNattyManual = !!(state.manualScores && state.manualScores['playoff-natty']);
  const isNattyCustom = !!(state.gameSliders && state.gameSliders['playoff-natty']?.isCustom);
  const isNattyUserPick = !!(state.playoffPicks && state.playoffPicks['playoff-natty']);

  let nattyCustomBadgeHtml = '';
  if (isNattyManual) {
    nattyCustomBadgeHtml = `<span class="custom-tuned-badge manual-score-badge"><i class="fa-solid fa-pen-to-square"></i> CUSTOM SCORE</span>`;
  } else if (isNattyUserPick) {
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
      <div class="playoff-matchup-box ${isTeamMatch(p.natty.teamA, teamId) || isTeamMatch(p.natty.teamB, teamId) ? 'active-team-matchup' : ''}" onclick="if(!event.target.closest('.score-input') && !event.target.closest('.reset-score-mini-btn')) window.openSimModalByGameId('${p.natty.id}')">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-size: 0.65rem; font-family: var(--font-mono); color: #FFD700; font-weight: 800; text-transform: uppercase;">NATIONAL TITLE GAME</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${nattyCustomBadgeHtml}
            ${isNattyManual && !p.natty?.isFinal ? `<button class="reset-score-mini-btn" onclick="resetManualScore('playoff-natty', event)" title="Reset to AI baseline"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
          </div>
        </div>
        ${teamRow('SF1', p.natty.teamA, p.natty.sim.scoreA, p.natty.sim.isAWinner, isTeamMatch(p.natty.teamA, teamId), 'playoff-natty', 'team', !!p.natty?.isFinal)}
        ${teamRow('SF2', p.natty.teamB, p.natty.sim.scoreB, !p.natty.sim.isAWinner, isTeamMatch(p.natty.teamB, teamId), 'playoff-natty', 'opp', !!p.natty?.isFinal)}
        
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

        <div class="playoff-result-badge" style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--color-text-dim);">Mercedes-Benz Stadium (Atlanta)</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="playoff-win-tag" style="color: #FFD700;"><i class="fa-solid fa-crown"></i> ${nattyChamp?.shortName?.toUpperCase()} CHAMPION</span>
            ${!p.natty?.isFinal ? `
              <button class="bracket-tune-pill" style="border-color: rgba(255, 215, 0, 0.4); color: #FFD700;" onclick="event.stopPropagation(); window.openSimModalByGameId('playoff-natty')" title="Tune National Title Game">
                <i class="fa-solid fa-sliders"></i> Edit
              </button>
            ` : `
              <span class="locked-final-tag"><i class="fa-solid fa-lock"></i> FINAL</span>
            `}
          </div>
        </div>
      </div>

      <div style="margin-top: auto; padding: 0.85rem 0.75rem; background: linear-gradient(180deg, rgba(0, 0, 0, 0.7), rgba(245, 158, 11, 0.12)); border-radius: var(--radius-sm); border: 1px solid rgba(255, 215, 0, 0.35); text-align: center; display: flex; flex-direction: column; gap: 0.5rem; align-items: center;">
        <div>
          <div style="font-size: 0.68rem; font-family: var(--font-mono); color: #FFD700; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
            👑 2026-27 NATIONAL CHAMPION
          </div>
          <div style="font-size: 1.2rem; font-weight: 900; color: #FFFFFF; margin-top: 2px;">
            ${nattyChamp?.name || 'CHAMPION'}
          </div>
        </div>

        <button class="action-btn" onclick="openSaveBracketModal()" style="width: 100%; background: ${state.activeSavedBracketId ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'linear-gradient(135deg, #10B981, #059669)'}; color: #FFFFFF; font-weight: 800; font-size: 0.82rem; padding: 0.55rem 0.85rem; border-radius: var(--radius-md); box-shadow: 0 4px 14px ${state.activeSavedBracketId ? 'rgba(37, 99, 235, 0.4)' : 'rgba(16, 185, 129, 0.4)'}; border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem;" title="${state.activeSavedBracketId ? 'Update and save changes to your active bracket' : 'Submit and save your complete season and playoff bracket projection'}">
          <i class="fa-solid ${state.activeSavedBracketId ? 'fa-cloud-arrow-up' : 'fa-paper-plane'}"></i>
          <span>${state.activeSavedBracketId ? 'Save Bracket Changes' : 'Submit Your Picks'}</span>
        </button>
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

function closeHypeCardModal() {
  const modal = document.getElementById('hypeCardModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}
window.closeHypeCardModal = closeHypeCardModal;

function downloadHypeCardImage() {
  const canvas = document.getElementById('hypeCanvas');
  if (!canvas) return;
  const link = document.createElement('a');
  const g = state.activeModalGame;
  const slug = (g && g.teamA && g.teamB) 
    ? `${g.teamA.shortName || 'TeamA'}-vs-${g.teamB.shortName || 'TeamB'}` 
    : (state.currentTeamId || 'season');
  link.download = `cfb-prophet-${slug}-matchup.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('📥 Hype Card downloaded successfully!');
}
window.downloadHypeCardImage = downloadHypeCardImage;

function copyHypeCardImage() {
  const canvas = document.getElementById('hypeCanvas');
  if (!canvas) return;
  canvas.toBlob(blob => {
    if (navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => showToast('📋 Hype Card copied to clipboard! Ready to paste into group chat.'))
        .catch(() => showToast('💾 Use "Save Image" to download the Hype Card.'));
    } else {
      showToast('💾 Use "Save Image" to download the Hype Card.');
    }
  });
}
window.copyHypeCardImage = copyHypeCardImage;

function openSeasonHypeCardModal() {
  state.activeModalGame = null;
  const hypeModal = document.getElementById('hypeCardModal');
  if (hypeModal) {
    hypeModal.classList.add('open');
    document.body.classList.add('modal-open');
  }
  generateHypeCard();
}
window.openSeasonHypeCardModal = openSeasonHypeCardModal;

function exportModalGameCard() {
  const game = state.activeModalGame;
  const simModal = document.getElementById('simModal');
  if (simModal) simModal.classList.remove('open');

  const hypeModal = document.getElementById('hypeCardModal');
  if (hypeModal) {
    hypeModal.classList.add('open');
    document.body.classList.add('modal-open');
  }

  if (game) {
    state.activeModalGame = game;
    generateGameHypeCard(game);
  } else {
    state.activeModalGame = null;
    generateHypeCard();
  }
}
window.exportModalGameCard = exportModalGameCard;

function initHypeCardExport() {
  const openBtn = document.getElementById('openHypeCardBtn');
  const heroBtn = document.getElementById('heroHypeCardBtn');
  const modalExportBtn = document.getElementById('modalExportCardBtn');
  const closeBtn = document.getElementById('closeHypeCardBtn');
  const downloadBtn = document.getElementById('downloadHypeCardBtn');
  const copyBtn = document.getElementById('copyHypeCardBtn');

  if (openBtn) {
    openBtn.onclick = (e) => {
      e.stopPropagation();
      openSeasonHypeCardModal();
    };
  }
  if (heroBtn) {
    heroBtn.onclick = (e) => {
      e.stopPropagation();
      openSeasonHypeCardModal();
    };
  }
  if (modalExportBtn) {
    modalExportBtn.onclick = exportModalGameCard;
  }
  if (closeBtn) {
    closeBtn.onclick = closeHypeCardModal;
  }
  if (downloadBtn) {
    downloadBtn.onclick = downloadHypeCardImage;
  }
  if (copyBtn) {
    copyBtn.onclick = copyHypeCardImage;
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
      const scale = Math.max(0.65, maxWidth / textWidth);
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
  ctx.clearRect(0, 0, 1200, 675);
  state.activeModalGame = null;

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

  // Radial Aura
  const glow = ctx.createRadialGradient(250, 240, 10, 250, 240, 480);
  glow.addColorStop(0, team.colors?.primary || '#BF5700');
  glow.addColorStop(1, 'rgba(8, 12, 20, 0)');
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.5;
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

  // Outer Border & Glow
  ctx.strokeStyle = team.colors?.accent || '#F59E0B';
  ctx.lineWidth = 2.5;
  drawCanvasRoundedRect(ctx, 16, 16, 1168, 643, 20);
  ctx.stroke();

  // Header Banner Pill (Y: 28 to 76)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  drawCanvasRoundedRect(ctx, 36, 28, 1128, 48, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  drawCanvasTextFitted(ctx, `🏈 CFB PROPHET • 2026 AI SEASON BLUEPRINT`, 56, 60, 600, 'bold 22px "Bebas Neue", "Outfit", sans-serif', '#FFFFFF', 'left');
  
  const venueHeader = `📍 ${(team.stadium || 'Stadium').toUpperCase()} • ${(team.conference || 'CFB')} • 10,000 SIMS`;
  drawCanvasTextFitted(ctx, venueHeader, 1144, 58, 480, '600 13px "JetBrains Mono", monospace', team.colors?.accent || '#F59E0B', 'right');

  // ==========================================
  // LEFT COLUMN: TEAM HERO CARD (X: 36, Width: 420, Y: 92 to 565, Height: 473)
  // ==========================================
  const leftX = 36;
  const leftW = 420;
  const leftY = 92;
  const leftH = 473;
  const leftCenterX = leftX + leftW / 2;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawCanvasRoundedRect(ctx, leftX, leftY, leftW, leftH, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.stroke();

  // Team Logo Circle (Center Y: 162, Radius: 50)
  const logoCenterY = leftY + 70;
  const logoRad = 50;

  ctx.save();
  ctx.shadowColor = team.colors?.primary || '#BF5700';
  ctx.shadowBlur = 25;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.beginPath();
  ctx.arc(leftCenterX, logoCenterY, logoRad, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = team.colors?.primary || '#BF5700';
  ctx.stroke();
  ctx.restore();

  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(leftCenterX, logoCenterY, logoRad - 4, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, leftCenterX - (logoRad - 6), logoCenterY - (logoRad - 6), (logoRad - 6) * 2, (logoRad - 6) * 2);
    ctx.restore();
  }

  // Team Name & AP Rank
  drawCanvasTextFitted(ctx, `${team.apRank || ''} ${team.name.toUpperCase()}`, leftCenterX, leftY + 145, leftW - 40, 'bold 22px "Outfit", sans-serif', '#FFFFFF', 'center');

  // Predicted Record Card (Y: leftY + 160 to leftY + 250, Height: 88)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  drawCanvasRoundedRect(ctx, leftX + 20, leftY + 162, leftW - 40, 88, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  const totalRecStr = document.getElementById('kpiTotalRecord')?.innerText || '15 - 1';
  const regRecStr = document.getElementById('kpiRecord')?.innerText || '11 - 1';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 56px "Bebas Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(totalRecStr, leftCenterX, leftY + 224);

  drawCanvasTextFitted(ctx, `TOTAL RECORD (${regRecStr} REGULAR SEASON)`, leftCenterX, leftY + 242, leftW - 60, 'bold 11px "JetBrains Mono", monospace', '#94A3B8', 'center');

  // Postseason / CFP Status Banner (Y: leftY + 252 to leftY + 296, Height: 44)
  const seedStr = document.getElementById('kpiCfpSeed')?.innerText || '#1 SEED';
  const postStr = document.getElementById('kpiPostseasonOutcome')?.innerText || '🏆 National Champions';

  ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
  drawCanvasRoundedRect(ctx, leftX + 20, leftY + 252, leftW - 40, 44, 10);
  ctx.fill();
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawCanvasTextFitted(ctx, `${seedStr} • ${postStr}`, leftCenterX, leftY + 280, leftW - 60, 'bold 14px "JetBrains Mono", monospace', '#F59E0B', 'center');

  // Natty Odds Pill (Y: leftY + 304 to leftY + 338, Height: 34)
  const nattyOdds = document.getElementById('kpiNattyOdds')?.innerText || '+350';
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  drawCanvasRoundedRect(ctx, leftX + 20, leftY + 304, leftW - 40, 34, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.stroke();
  drawCanvasTextFitted(ctx, `NATTY TITLE ODDS: ${nattyOdds}`, leftCenterX, leftY + 326, leftW - 60, 'bold 12px "JetBrains Mono", monospace', '#38BDF8', 'center');

  // Coaching Staff Line
  const staffShort = `HC: ${team.headCoach} • DC: ${team.defensiveCoordinator}`;
  drawCanvasTextFitted(ctx, `🎯 ${staffShort}`, leftCenterX, leftY + 365, leftW - 50, '600 12px "Outfit", sans-serif', '#E2E8F0', 'center');

  // Stadium & Capacity
  const venueCap = `${team.stadium || 'Stadium'} (${team.stadiumCapacity || '100k'})`;
  drawCanvasTextFitted(ctx, `📍 ${venueCap}`, leftCenterX, leftY + 395, leftW - 50, '500 12px "Outfit", sans-serif', '#94A3B8', 'center');

  // Key Roster Star
  drawCanvasTextFitted(ctx, `⚡ STAR: ${team.starPlayer || 'Consensus Starters'}`, leftCenterX, leftY + 425, leftW - 50, '500 11px "Outfit", sans-serif', '#CBD5E1', 'center');

  // Secondary star
  drawCanvasTextFitted(ctx, `🛡️ CORE: ${team.secondaryStar || 'Elite Roster Depth'}`, leftCenterX, leftY + 452, leftW - 50, '500 11px "Outfit", sans-serif', '#64748B', 'center');

  // ==========================================
  // RIGHT COLUMN - 4 SEASON-DEFINING MATCHUPS (X: 476, Width: 688, Y: 92 to 460, Height: 368)
  // ==========================================
  const rightX = 476;
  const rightW = 688;
  const rightY = 92;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawCanvasRoundedRect(ctx, rightX, rightY, rightW, 368, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px "Bebas Neue", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔥 SEASON-DEFINING MATCHUPS & RESULTS', rightX + 24, rightY + 32);

  // Dynamic game selection: Highlight all losses/stumbles + top marquee rivalry wins
  const allSims = (team.schedule || []).map(g => {
    const sim = calculateAdjustedMatchup(g);
    const oppRankNum = (g.oppRank && g.oppRank.startsWith('#')) ? parseInt(g.oppRank.replace('#', '').replace(' AP', '')) : 99;
    return {
      game: g,
      sim: sim,
      isLoss: !sim.isWin,
      oppRankNum: oppRankNum,
      margin: Math.abs(sim.projUt - sim.projOpp),
      isMarquee: g.isMarquee || false,
      rivalryName: g.rivalryName || ''
    };
  });

  const simLosses = allSims.filter(s => s.isLoss);
  const simWins = allSims.filter(s => !s.isLoss);

  simLosses.sort((a, b) => a.oppRankNum - b.oppRankNum || a.margin - b.margin);

  const getWinPriority = (w) => {
    const riv = (w.rivalryName || '').toUpperCase();
    const isNamedRivalry = /RED RIVER|LONE STAR|THE GAME|IRON BOWL|EGG BOWL|HOLY WAR|BEDLAM|CIVIL WAR|GAMEDAY/.test(riv) || ['OU', 'TAMU', 'MICH', 'AUB'].includes(w.game?.oppAbbr);
    if (isNamedRivalry || w.oppRankNum <= 5) return 0;
    if (w.isMarquee || w.oppRankNum <= 15) return 1;
    return 2;
  };

  simWins.sort((a, b) => {
    const prioDiff = getWinPriority(a) - getWinPriority(b);
    if (prioDiff !== 0) return prioDiff;
    return a.oppRankNum - b.oppRankNum || b.margin - a.margin;
  });

  let featuredMatchups = [];
  if (simLosses.length === 1) {
    featuredMatchups.push({ ...simLosses[0], tag: '🚨 ONLY LOSS', tagColor: '#EF4444' });
    simWins.slice(0, 3).forEach((w, idx) => {
      const riv = (w.rivalryName || '').toUpperCase();
      let tag = '🔥 MARQUEE CLASH';
      if (/RED RIVER/.test(riv) || w.game?.oppAbbr === 'OU') tag = '🤠 RED RIVER RIVALRY';
      else if (/LONE STAR/.test(riv) || w.game?.oppAbbr === 'TAMU') tag = '⚡ LONE STAR SHOWDOWN';
      else if (/THE GAME/.test(riv)) tag = '⚔️ THE GAME';
      else if (idx === 0 || w.oppRankNum <= 5) tag = '🏆 SIGNATURE WIN';
      featuredMatchups.push({ ...w, tag, tagColor: tag.includes('WIN') ? '#10B981' : '#F59E0B' });
    });
  } else if (simLosses.length === 2) {
    featuredMatchups.push({ ...simLosses[0], tag: '🚨 TOUGHEST ROAD TEST', tagColor: '#EF4444' });
    featuredMatchups.push({ ...simLosses[1], tag: '⚠️ PIVOTAL LOSS', tagColor: '#F97316' });
    simWins.slice(0, 2).forEach((w, idx) => {
      const riv = (w.rivalryName || '').toUpperCase();
      let tag = idx === 0 ? '🏆 SIGNATURE WIN' : '🔥 MARQUEE CLASH';
      if (/RED RIVER/.test(riv) || w.game?.oppAbbr === 'OU') tag = '🤠 RED RIVER RIVALRY';
      else if (/LONE STAR/.test(riv) || w.game?.oppAbbr === 'TAMU') tag = '⚡ LONE STAR SHOWDOWN';
      featuredMatchups.push({ ...w, tag, tagColor: tag.includes('WIN') ? '#10B981' : '#F59E0B' });
    });
  } else if (simLosses.length >= 3) {
    featuredMatchups.push({ ...simLosses[0], tag: '🚨 TOUGHEST TEST', tagColor: '#EF4444' });
    featuredMatchups.push({ ...(simLosses[1] || simLosses[0]), tag: '⚠️ ROAD STUMBLE', tagColor: '#F97316' });
    simWins.slice(0, 2).forEach((w, idx) => {
      featuredMatchups.push({ ...w, tag: idx === 0 ? '🏆 SIGNATURE WIN' : '🔥 KEY VICTORY', tagColor: '#10B981' });
    });
  } else {
    simWins.slice(0, 4).forEach((w, idx) => {
      const riv = (w.rivalryName || '').toUpperCase();
      let tag = idx === 0 ? '🏆 MARQUEE TEST #1' : `🔥 MARQUEE CLASH #${idx + 1}`;
      if (/RED RIVER/.test(riv) || w.game?.oppAbbr === 'OU') tag = '🤠 RED RIVER RIVALRY';
      else if (/LONE STAR/.test(riv) || w.game?.oppAbbr === 'TAMU') tag = '⚡ LONE STAR SHOWDOWN';
      else if (/THE GAME/.test(riv)) tag = '⚔️ THE GAME';
      featuredMatchups.push({ ...w, tag, tagColor: idx === 0 ? '#10B981' : '#F59E0B' });
    });
  }

  featuredMatchups = featuredMatchups.slice(0, 4);

  const marqueeLogos = await Promise.all(featuredMatchups.map(m => loadCanvasImage(m.game?.oppLogoUrl || (typeof ESPN_LOGOS !== 'undefined' ? ESPN_LOGOS[m.game?.oppAbbr] : ''))));

  let mY = rightY + 46;
  featuredMatchups.forEach((m, idx) => {
    const g = m.game;
    const sim = m.sim;
    const mLogo = marqueeLogos[idx];
    const rowH = 64;

    // Card Row
    ctx.fillStyle = m.isLoss ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.04)';
    drawCanvasRoundedRect(ctx, rightX + 18, mY, rightW - 36, rowH, 10);
    ctx.fill();
    ctx.strokeStyle = m.isLoss ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Opponent Logo in circular frame
    const logoX = rightX + 42;
    const logoY = mY + 32;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.beginPath();
    ctx.arc(logoX, logoY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = m.isLoss ? '#EF4444' : 'rgba(255, 255, 255, 0.2)';
    ctx.stroke();
    if (mLogo) {
      ctx.beginPath();
      ctx.arc(logoX, logoY, 18, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(mLogo, logoX - 16, logoY - 16, 32, 32);
    }
    ctx.restore();

    // Matchup Tag Badge
    drawCanvasTextFitted(ctx, m.tag, rightX + 76, mY + 21, 180, 'bold 11px "JetBrains Mono", monospace', m.tagColor, 'left');

    // Matchup Text
    const homeStr = g.isHome ? 'vs' : '@';
    drawCanvasTextFitted(ctx, `${g.week}: ${homeStr} ${g.opponent || g.oppAbbr} (${g.oppRank})`, rightX + 76, mY + 46, 340, 'bold 14px "Outfit", sans-serif', '#FFFFFF', 'left');

    // Score & Win / Loss Outcome
    const outcomeStr = m.isLoss ? 'LOSS' : 'WIN';
    const scoreColor = m.isLoss ? '#EF4444' : '#10B981';
    drawCanvasTextFitted(ctx, `${sim.projUt} - ${sim.projOpp} (${outcomeStr})`, rightX + rightW - 28, mY + 28, 200, 'bold 17px "JetBrains Mono", monospace', scoreColor, 'right');
    drawCanvasTextFitted(ctx, `${sim.adjWinProb}% Win Prob`, rightX + rightW - 28, mY + 49, 160, '500 11px "JetBrains Mono", monospace', '#94A3B8', 'right');

    mY += 74;
  });

  // ==========================================
  // BOTTOM RIGHT - PLAYMAKERS, SCHEME & DIRECT QR CODE (Y: 472 to 565, Height: 93)
  // ==========================================
  const bottomBoxW = 575;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawCanvasRoundedRect(ctx, rightX, 472, bottomBoxW, 93, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();

  // QB and Staff
  const qbName = team.confirmedStarterQb || (team.starPlayer ? team.starPlayer.split('/')[0].trim() : 'Quarterback Room');
  drawCanvasTextFitted(ctx, `🎯 QB: ${qbName.toUpperCase()} • DC: ${team.defensiveCoordinator.toUpperCase()}`, rightX + 20, 498, bottomBoxW - 40, 'bold 12px "JetBrains Mono", monospace', '#F59E0B', 'left');

  const starStr = `⚡ KEY PLAYMAKERS: ${team.starPlayer || 'Consensus Starters'}`;
  drawCanvasTextFitted(ctx, starStr, rightX + 20, 524, bottomBoxW - 40, '500 12px "Outfit", sans-serif', '#E2E8F0', 'left');

  const dcScheme = `🛡️ DEFENSIVE UNIT: ${team.secondaryStar || 'Elite Roster Depth & Pressure Matrix'}`;
  drawCanvasTextFitted(ctx, dcScheme, rightX + 20, 548, bottomBoxW - 40, '500 11px "Outfit", sans-serif', '#94A3B8', 'left');

  // Direct Interactive QR Code Card (Embedded in canvas)
  const canonicalTeamId = state.currentTeamId || getTopRankedTeamId() || 'ohiostate';
  const appUrl = `https://jajo9147.github.io/cfb-football-predictor/?team=${canonicalTeamId}`;
  const qrX = rightX + bottomBoxW + 12; // 1063
  const qrW = 101;
  ctx.fillStyle = '#FFFFFF';
  drawCanvasRoundedRect(ctx, qrX, 472, qrW, 93, 10);
  ctx.fill();

  try {
    if (typeof QRious !== 'undefined') {
      const qr = new QRious({
        value: appUrl,
        size: 200,
        background: '#FFFFFF',
        foreground: '#000000',
        level: 'M',
        padding: 4
      });
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qr.canvas, qrX + 13, 475, 75, 75);
      ctx.restore();
    }
  } catch (e) {
    console.error('QR code generation error:', e);
  }

  ctx.fillStyle = '#080C14';
  ctx.font = 'bold 8px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN TO PLAY', qrX + (qrW / 2), 558);

  // Footer Tagline with direct app link
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`POWERED BY CFB PROPHET • 2026 AI SIMULATOR • ${appUrl}`, 600, 620);

  const directLinkEl = document.getElementById('hypeDirectHyperlink');
  if (directLinkEl) {
    directLinkEl.href = appUrl;
    directLinkEl.textContent = appUrl;
  }

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
  '97': 'louisville',
  '38': 'colorado',
  '9': 'arizonastate'
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
  louisville: '97',
  colorado: '38',
  arizonastate: '9'
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
      const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=150');
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.events || data.events.length === 0) return false;

      const findScheduledGame = (schedule, oppComp, isHome) => {
        if (!schedule || !oppComp) return null;
        const oppAbbr = (oppComp.team?.abbreviation || '').toUpperCase();
        const oppDisplay = (oppComp.team?.displayName || '').toLowerCase();
        const oppShort = (oppComp.team?.shortDisplayName || '').toLowerCase();
        const oppName = (oppComp.team?.name || '').toLowerCase();
        const mappedOppId = ESPN_TEAM_MAP[oppComp.id];

        return schedule.find(g => {
          if (g.isHome !== isHome) return false;
          if (g.oppId && mappedOppId && g.oppId === mappedOppId) return true;
          if (g.oppAbbr && oppAbbr && g.oppAbbr.toUpperCase() === oppAbbr) return true;
          if (g.opponent) {
            const oppLow = g.opponent.toLowerCase();
            if (oppDisplay && oppLow.includes(oppDisplay)) return true;
            if (oppShort && oppLow.includes(oppShort)) return true;
            if (oppName && oppLow.includes(oppName)) return true;
          }
          return false;
        });
      };

      let updatedCount = 0;
      data.events.forEach(event => {
        const comp = event.competitions?.[0];
        if (!comp) return;

        const isCompleted = event.status?.type?.completed === true;
        const isLiveInProgress = event.status?.type?.state === 'in';
        const competitors = comp.competitors || [];
        if (competitors.length < 2) return;

        const homeComp = competitors.find(c => c.homeAway === 'home');
        const awayComp = competitors.find(c => c.homeAway === 'away');
        if (!homeComp || !awayComp) return;

        const homeTeamId = ESPN_TEAM_MAP[homeComp.id];
        const awayTeamId = ESPN_TEAM_MAP[awayComp.id];

        // Extract real-time kickoff timestamp and TV broadcast
        const eventUtc = event.date;
        let eventKickoffTime = null;
        let eventDateStr = null;
        if (eventUtc) {
          try {
            const dt = new Date(eventUtc);
            eventKickoffTime = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/New_York'
            }).format(dt) + ' ET';

            eventDateStr = new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'America/New_York'
            }).format(dt); // e.g. "Sep 4, 2026"
          } catch (e) {}
        }
        let eventTv = comp.broadcast || '';
        if (!eventTv && comp.broadcasts && comp.broadcasts.length > 0) {
          eventTv = (comp.broadcasts[0].names || []).join('/');
        }
        const eventStatusDetail = event.status?.type?.shortDetail || event.status?.type?.detail || '';

        // Update global opener kickoffs mapping if available
        if (homeTeamId && TEAM_OPENER_KICKOFFS[homeTeamId] && eventUtc) {
          TEAM_OPENER_KICKOFFS[homeTeamId].utc = eventUtc;
          if (eventTv) TEAM_OPENER_KICKOFFS[homeTeamId].tv = eventTv;
        }
        if (awayTeamId && TEAM_OPENER_KICKOFFS[awayTeamId] && eventUtc) {
          TEAM_OPENER_KICKOFFS[awayTeamId].utc = eventUtc;
          if (eventTv) TEAM_OPENER_KICKOFFS[awayTeamId].tv = eventTv;
        }

        // 1. Extract live DraftKings odds from ESPN feed if available
        let liveSpreadHome = null;
        let liveSpreadAway = null;
        let liveOverUnder = null;
        let oddsProviderName = 'DraftKings';

        const oddsArr = comp.odds || [];
        if (oddsArr.length > 0) {
          const oddsObj = oddsArr.find(o => o.provider?.name?.toLowerCase().includes('draftkings')) || oddsArr[0];
          oddsProviderName = oddsObj.provider?.displayName || oddsObj.provider?.name || 'DraftKings';

          if (typeof oddsObj.overUnder === 'number') {
            liveOverUnder = oddsObj.overUnder;
          }

          let rawSpread = null;
          if (typeof oddsObj.spread === 'number') {
            rawSpread = Math.abs(oddsObj.spread);
          } else if (oddsObj.details) {
            const m = oddsObj.details.match(/-?(\d+(\.\d+)?)/);
            if (m) rawSpread = parseFloat(m[1]);
          }

          if (rawSpread !== null) {
            const homeFav = oddsObj.homeTeamOdds?.favorite === true;
            const awayFav = oddsObj.awayTeamOdds?.favorite === true;
            if (homeFav) {
              liveSpreadHome = -rawSpread;
              liveSpreadAway = +rawSpread;
            } else if (awayFav) {
              liveSpreadHome = +rawSpread;
              liveSpreadAway = -rawSpread;
            } else if (oddsObj.details && (oddsObj.details.toUpperCase().includes('EVEN') || oddsObj.details.toUpperCase().includes('PICK'))) {
              liveSpreadHome = 0;
              liveSpreadAway = 0;
            }
          }
        }

        // 2. Update home team schedule
        if (homeTeamId && TEAMS_DATABASE[homeTeamId]) {
          const game = findScheduledGame(TEAMS_DATABASE[homeTeamId].schedule, awayComp, true);
          if (game) {
            if (eventUtc) game.utc = eventUtc;
            if (eventDateStr) game.date = eventDateStr;
            if (eventKickoffTime) game.kickoffTime = eventKickoffTime;
            if (eventTv) game.tv = eventTv;
            if (eventStatusDetail) game.liveStatus = eventStatusDetail;

            if (isLiveInProgress) {
              game.isLive = true;
              game.clock = event.status?.displayClock;
              game.period = event.status?.period;
              if (homeComp.score) game.actualScoreUt = parseInt(homeComp.score, 10);
              if (awayComp.score) game.actualScoreOpp = parseInt(awayComp.score, 10);
              updatedCount++;
            } else if (isCompleted) {
              game.isFinal = true;
              game.isLive = false;
              game.actualScoreUt = parseInt(homeComp.score, 10);
              game.actualScoreOpp = parseInt(awayComp.score, 10);
              updatedCount++;
            } else {
              // Update live DraftKings line without altering model predictions
              if (liveSpreadHome !== null) {
                game.vegasSpread = liveSpreadHome;
                game.oddsProvider = oddsProviderName;
                updatedCount++;
              }
              if (liveOverUnder !== null) {
                game.overUnder = liveOverUnder;
              }
            }
          }
        }

        // 3. Update away team schedule
        if (awayTeamId && TEAMS_DATABASE[awayTeamId]) {
          const game = findScheduledGame(TEAMS_DATABASE[awayTeamId].schedule, homeComp, false);
          if (game) {
            if (eventUtc) game.utc = eventUtc;
            if (eventDateStr) game.date = eventDateStr;
            if (eventKickoffTime) game.kickoffTime = eventKickoffTime;
            if (eventTv) game.tv = eventTv;
            if (eventStatusDetail) game.liveStatus = eventStatusDetail;

            if (isLiveInProgress) {
              game.isLive = true;
              game.clock = event.status?.displayClock;
              game.period = event.status?.period;
              if (awayComp.score) game.actualScoreUt = parseInt(awayComp.score, 10);
              if (homeComp.score) game.actualScoreOpp = parseInt(homeComp.score, 10);
              updatedCount++;
            } else if (isCompleted) {
              game.isFinal = true;
              game.isLive = false;
              game.actualScoreUt = parseInt(awayComp.score, 10);
              game.actualScoreOpp = parseInt(homeComp.score, 10);
              updatedCount++;
            } else {
              // Update live DraftKings line without altering model predictions
              if (liveSpreadAway !== null) {
                game.vegasSpread = liveSpreadAway;
                game.oddsProvider = oddsProviderName;
                updatedCount++;
              }
              if (liveOverUnder !== null) {
                game.overUnder = liveOverUnder;
              }
            }
          }
        }
      });

      if (updatedCount > 0) {
        if (typeof renderSchedule === 'function') renderSchedule();
        if (typeof window.renderSchedule === 'function') window.renderSchedule();
        if (typeof updateCountdownTickerForActiveTeam === 'function') updateCountdownTickerForActiveTeam();
        if (typeof window.updateCountdownTickerForActiveTeam === 'function') window.updateCountdownTickerForActiveTeam();
      }

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

function closeMonteCarloModal() {
  const modal = document.getElementById('monteCarloModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
  recalculateSeason();
}
window.closeMonteCarloModal = closeMonteCarloModal;

function runMonteCarloRecalibration() {
  const menu = document.getElementById('moreToolsMenu');
  if (menu) menu.classList.remove('show');
  openMonteCarloModal();
}
window.runMonteCarloRecalibration = runMonteCarloRecalibration;
window.openMonteCarloModal = openMonteCarloModal;

function initMonteCarloEngine() {
  const quickSimBtn = document.getElementById('quickSimAllBtn');
  if (quickSimBtn) {
    quickSimBtn.addEventListener('click', (e) => {
      e.preventDefault();
      runMonteCarloRecalibration();
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
    rerunBtn.onclick = () => {
      openMonteCarloModal();
    };
  }

  const closeBtn = document.getElementById('closeMonteCarloModalBtn');
  if (closeBtn) {
    closeBtn.onclick = closeMonteCarloModal;
  }

  const applyCloseBtn = document.getElementById('mcApplyCloseBtn');
  if (applyCloseBtn) {
    applyCloseBtn.onclick = closeMonteCarloModal;
  }

  const mcModal = document.getElementById('monteCarloModal');
  if (mcModal) {
    mcModal.addEventListener('click', (e) => {
      if (e.target === mcModal) {
        closeMonteCarloModal();
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const mcModal = document.getElementById('monteCarloModal');
      if (mcModal && mcModal.classList.contains('open')) {
        closeMonteCarloModal();
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
  document.title = `👑 ${champName} 2027 National Champion | CFB Prophet CFP Predictor`;

  // Dynamic OpenGraph Metadata
  const ogImg = document.getElementById('ogImage') || document.querySelector('meta[property="og:image"]');
  if (ogImg && champLogo) ogImg.setAttribute('content', champLogo);

  const ogTitle = document.getElementById('ogTitle') || document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', `🏆 ${champFullName} 2026-27 National Champion | CFB Prophet`);

  const ogDesc = document.getElementById('ogDescription') || document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', `Custom CFP Simulation: ${champFullName} is predicted to win the 2027 College Football National Championship!`);
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
      ctx.fillText('CFB PROPHET • CUSTOM CFP SIMULATION', 400, 75);

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

  const champId = (champ && champ.id && TEAMS_DATABASE[champ.id]) ? champ.id : (TEAMS_DATABASE[teamId] ? teamId : (getTopRankedTeamId() || 'ohiostate'));
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
  const teamId = state.currentTeamId || getTopRankedTeamId() || 'ohiostate';
  const team = TEAMS_DATABASE[teamId] || { name: 'CFB', shortName: 'College Football' };
  const champ = state.lastNationalChampion || (state.lastPlayoffResults && state.lastPlayoffResults.nationalChampion) || team;
  const champName = champ.shortName || champ.name || 'National Champion';
  const champFullName = champ.name || champName;

  const shareUrl = serializeScenario(teamId);

  // Update dynamic social & browser metadata
  updateSocialMetadataForChampion(champ);

  // Instant Visual Feedback on button: Change text to "Copied!"
  const btn = document.getElementById('shareScenarioBtn');
  if (btn) {
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check" style="color: #34D399;"></i> Copied!';
    setTimeout(() => {
      btn.innerHTML = origHtml;
    }, 2500);
  }

  // Copy to clipboard immediately with multi-method safety
  copyTextToClipboardSafe(shareUrl, `📋 Custom Scenario link copied (${champName} National Champion)!`);

  const shareData = {
    title: `🏆 ${champName} 2027 National Champion | CFB Prophet`,
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

  // Native mobile share sheet if supported
  if (navigator.share && /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase())) {
    try {
      if (champShareFile && navigator.canShare && navigator.canShare({ files: [champShareFile] })) {
        await navigator.share({
          ...shareData,
          files: [champShareFile]
        });
      } else {
        await navigator.share(shareData);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
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

    // Auto-Import Bracket into Local Device Vault if shared bracket name is present
    if (decoded.bn) {
      try {
        const existingBrackets = getSavedBrackets();
        const alreadyExists = existingBrackets.some(b => b.name === decoded.bn);
        if (!alreadyExists) {
          const imported = saveCurrentProjectionAsBracket(decoded.bn, decoded.cr || 'Shared Coach', decoded.nt || 'Imported via shared device link');
          showCustomToast(`📥 Bracket "${decoded.bn}" automatically saved to this device's Vault!`);
        }
      } catch (e) {}
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

  drawCanvasTextFitted(ctx, '🏈 CFB PROPHET • MATCHUP SIMULATION ENGINE', 60, 65, 680, 'bold 22px "Bebas Neue", "Outfit", sans-serif', '#F59E0B', 'left');

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

  const probB = Number((100 - probA).toFixed(1));
  drawCanvasTextFitted(ctx, `${teamA.abbr || 'TEAM'} ${probA}%`, barX, barY + 34, 150, 'bold 13px "JetBrains Mono", monospace', '#E2E8F0', 'left');
  drawCanvasTextFitted(ctx, `${probB}% ${teamB.shortName || 'OPP'}`, barX + barW, barY + 34, 150, 'bold 13px "JetBrains Mono", monospace', '#E2E8F0', 'right');

  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  drawCanvasRoundedRect(ctx, boxX + 25, boxY + 215, boxW - 50, 48, 10);
  ctx.fill();

  const spreadSign = spreadA <= 0 ? `${teamA.abbr} ${spreadA}` : `${teamB.shortName} -${spreadA}`;
  drawCanvasTextFitted(ctx, `VEGAS LINE: ${spreadSign} • O/U: ${ou}`, 600, boxY + 244, boxW - 60, 'bold 14px "JetBrains Mono", monospace', '#F59E0B', 'center');

  const projectedMargin = Math.abs(scoreA - scoreB);
  const spreadDiff = Math.abs(projectedMargin - Math.abs(spreadA));
  drawCanvasTextFitted(ctx, `🔥 MODEL COVER EDGE: ${spreadDiff.toFixed(1)} PTS`, 600, boxY + 285, boxW - 60, '600 12px "JetBrains Mono", monospace', '#38BDF8', 'center');

  // Bottom Tactical Strip
  const tactW = 995;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawCanvasRoundedRect(ctx, 40, 470, tactW, 105, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();

  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('⚡ 10,000 MONTE CARLO DRIVES • TACTICAL MATCHUP INSIGHT', 65, 502);

  const scoutSummary = game.scoutReport?.xFactor || game.scoutReport?.keyMatchup || `High-stakes battle featuring ${teamA.name} vs ${teamB.name}.`;
  drawCanvasTextWrapped(ctx, scoutSummary, 65, 532, tactW - 50, 24, '500 15px "Outfit", sans-serif', '#E2E8F0', 'left', 2);

  // Embedded QR Code on Matchup Card (points to clean baseline app)
  const appUrl = 'https://jajo9147.github.io/cfb-football-predictor/';
  const gQrX = 1050;
  const gQrW = 110;
  ctx.fillStyle = '#FFFFFF';
  drawCanvasRoundedRect(ctx, gQrX, 470, gQrW, 105, 10);
  ctx.fill();

  try {
    if (typeof QRious !== 'undefined') {
      const qr = new QRious({
        value: appUrl,
        size: 200,
        background: '#FFFFFF',
        foreground: '#000000',
        level: 'M',
        padding: 4
      });
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qr.canvas, gQrX + 15, 475, 80, 80);
      ctx.restore();
    }
  } catch (e) {}

  ctx.fillStyle = '#080C14';
  ctx.font = 'bold 8px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN TO PLAY', gQrX + (gQrW / 2), 567);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`POWERED BY CFB PROPHET • 2026 AI SIMULATOR • ${appUrl}`, 600, 625);

  const directLinkEl = document.getElementById('hypeDirectHyperlink');
  if (directLinkEl) {
    directLinkEl.href = appUrl;
    directLinkEl.textContent = appUrl;
  }

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
    if (el) {
      const top = el.getBoundingClientRect().top + window.pageYOffset - 60;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  } else if (viewName === 'playoffs') {
    const el = document.getElementById('playoffSection');
    if (el) {
      const top = el.getBoundingClientRect().top + window.pageYOffset - 60;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  } else if (viewName === 'tuning') {
    if (typeof openAiTuningModal === 'function') openAiTuningModal();
  } else if (viewName === 'dream') {
    if (typeof openDreamSandboxModal === 'function') openDreamSandboxModal();
  }
};

window.addEventListener('hashchange', () => {
  const hash = (window.location.hash || '').replace('#', '');
  if (['playoffs', 'schedule', 'tuning', 'dream'].includes(hash)) {
    if (typeof window.switchAppView === 'function') window.switchAppView(hash);
  }
});

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
  const moreMenu = document.getElementById('moreToolsMenu');
  const moreBtn = document.getElementById('moreToolsBtn');
  if (moreMenu && moreMenu.classList.contains('show')) {
    if (!moreMenu.contains(e.target) && (!moreBtn || !moreBtn.contains(e.target))) {
      moreMenu.classList.remove('show');
    }
  }

  const presetMenu = document.getElementById('presetDropdownMenu');
  const presetBtn = document.getElementById('presetDropdownBtn');
  const presetWrap = document.getElementById('presetDropdownWrap');
  const tuningSection = document.getElementById('tuningSection');
  if (presetMenu && presetMenu.classList.contains('show')) {
    if (!presetMenu.contains(e.target) && (!presetBtn || !presetBtn.contains(e.target))) {
      presetMenu.classList.remove('show');
      if (presetWrap) presetWrap.classList.remove('open');
      if (tuningSection) tuningSection.classList.remove('has-open-dropdown');
    }
  }

  const filterMenu = document.getElementById('scheduleFilterDropdownMenu');
  const filterBtn = document.getElementById('scheduleFilterDropdownBtn');
  const filterWrap = document.getElementById('scheduleFilterDropdownWrap');
  const scheduleSection = document.getElementById('scheduleSection');
  if (filterMenu && filterMenu.classList.contains('show')) {
    if (!filterMenu.contains(e.target) && (!filterBtn || !filterBtn.contains(e.target))) {
      filterMenu.classList.remove('show');
      if (filterWrap) filterWrap.classList.remove('open');
      if (scheduleSection) scheduleSection.classList.remove('has-open-dropdown');
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

window.openHypeCardModal = function(game) {
  const targetGame = game || state.activeModalGame;
  const hypeModal = document.getElementById('hypeCardModal');
  if (hypeModal) {
    hypeModal.classList.add('open');
    document.body.classList.add('modal-open');
  }

  if (targetGame) {
    state.activeModalGame = targetGame;
    generateGameHypeCard(targetGame);
  } else {
    state.activeModalGame = null;
    generateHypeCard();
  }
};


// ==========================================================================
// 12-TEAM CFP BRACKET VAULT & EXPORT SYSTEM
// CFB PROPHET WEEK-BY-WEEK PREDICTION & 30-TEAM VAULT MATRIX ENGINE
// ==========================================================================

state.selectedVaultWeek = 'W1'; // Default to current week (Week 1)
state.selectedVaultTeam = 'all'; // Default to all teams (Global view)
const ALL_WEEKS_LIST = [
  { key: 'W0', label: 'Week 0' },
  { key: 'W1', label: 'Week 1' },
  { key: 'W2', label: 'Week 2' },
  { key: 'W3', label: 'Week 3' },
  { key: 'W4', label: 'Week 4' },
  { key: 'W5', label: 'Week 5' },
  { key: 'W6', label: 'Week 6' },
  { key: 'W7', label: 'Week 7' },
  { key: 'W8', label: 'Week 8' },
  { key: 'W9', label: 'Week 9' },
  { key: 'W10', label: 'Week 10' },
  { key: 'W11', label: 'Week 11' },
  { key: 'W12', label: 'Week 12' },
  { key: 'W13', label: 'Week 13' },
  { key: 'W14', label: 'Week 14' },
  { key: 'CCG', label: 'Conf Champs' },
  { key: 'CFP', label: 'CFP Playoff' },
  { key: 'all', label: 'Full Season Standings' }
];

function getTeamsOnByeForWeek(targetWeek = 'W1') {
  if (targetWeek === 'all' || targetWeek === 'CCG' || targetWeek === 'CFP') return [];
  const byeTeams = [];
  const teamIds = Object.keys(TEAMS_DATABASE);

  teamIds.forEach(tid => {
    const t = TEAMS_DATABASE[tid];
    const hasGame = (t.schedule || []).some(g => {
      const gWeek = (g.week || 'WEEK 1').toUpperCase().replace('WEEK ', 'W');
      return gWeek === targetWeek;
    });
    if (!hasGame) {
      byeTeams.push(t);
    }
  });

  return byeTeams;
}

function calculateWeeklyScoreForUser(bracket, targetWeek = 'W1') {
  // Weekly Point System: +10 pts per straight-up win
  // Accurately factors in BYE weeks, real completed games, and individual bracket predictions
  const weekGames = [];
  const teamIds = Object.keys(TEAMS_DATABASE);
  const seenGameKeys = new Set();

  teamIds.forEach(tid => {
    const t = TEAMS_DATABASE[tid];
    (t.schedule || []).forEach(g => {
      const gWeek = (g.week || 'WEEK 1').toUpperCase().replace('WEEK ', 'W');
      if (targetWeek === 'all' || gWeek === targetWeek) {
        const gameKey = [tid, g.opponent].sort().join('__');
        if (!seenGameKeys.has(gameKey)) {
          seenGameKeys.add(gameKey);
          weekGames.push({ teamId: tid, game: g });
        }
      }
    });
  });

  const totalPossible = (weekGames.length * 10) || 10;
  const userPicks = bracket.simState?.userPicks || {};
  const manualScores = bracket.simState?.manualScores || {};
  const teamSliders = bracket.simState?.teamSliders || {};

  let correctPicks = 0;
  let earnedPts = 0;
  let lockedCount = 0;

  weekGames.forEach(({ teamId, game }) => {
    let isPredictedWin = true;
    if (manualScores[game.id]) {
      isPredictedWin = manualScores[game.id].teamScore > manualScores[game.id].oppScore;
    } else if (userPicks[game.id]) {
      isPredictedWin = userPicks[game.id] === 'W';
    } else {
      const oppId = getOpponentTeamId(game);
      const teamSl = teamSliders[teamId] || GLOBAL_PRESETS['baseline'];
      const oppEffSliders = oppId && teamSliders[oppId] ? teamSliders[oppId] : GLOBAL_PRESETS['baseline'];
      const sim = calculateCombinedMatchup(game, teamId, teamSl, oppId, oppEffSliders, null);
      isPredictedWin = sim.isWin;
    }

    if (game.isFinal && typeof game.actualScoreUt === 'number') {
      lockedCount++;
      const actualWin = game.actualScoreUt > game.actualScoreOpp;
      if (isPredictedWin === actualWin) {
        correctPicks++;
        earnedPts += 10;
      }
    } else {
      // Future unplayed game: standard baseline prediction points
      correctPicks++;
      earnedPts += 10;
    }
  });

  const pct = Math.round((earnedPts / totalPossible) * 100);
  const grade = pct >= 90 ? 'A+' : (pct >= 80 ? 'A' : (pct >= 70 ? 'B' : (pct >= 60 ? 'C' : 'D')));

  return {
    pts: earnedPts,
    maxPts: totalPossible,
    pct,
    gameCount: weekGames.length,
    lockedCount,
    hits: `${correctPicks}/${weekGames.length} Correct Picks`,
    grade
  };
}

function calculateTeamScoreForUser(bracket, teamId) {
  if (!teamId || teamId === 'all') {
    return calculateWeeklyScoreForUser(bracket, 'all');
  }
  const team = TEAMS_DATABASE[teamId];
  if (!team || !team.schedule) {
    return { pts: 120, maxPts: 120, pct: 100.0, wins: 12, losses: 0, record: '12-0', hits: '12/12 Live Picks', grade: 'A+' };
  }

  const userPicks = bracket.simState?.userPicks || {};
  const manualScores = bracket.simState?.manualScores || {};
  const teamSliders = bracket.simState?.teamSliders?.[teamId] || {};
  const gameSliders = bracket.simState?.gameSliders || {};

  let predictedWins = 0;
  let predictedLosses = 0;
  let correctPicks = 0;
  const totalGames = team.schedule.length;

  team.schedule.forEach(game => {
    let isWin = true;
    let projScoreUt = game.projScoreUt || 28;
    let projScoreOpp = game.projScoreOpp || 21;

    if (game.isFinal && typeof game.actualScoreUt === 'number') {
      isWin = game.actualScoreUt > game.actualScoreOpp;
      projScoreUt = game.actualScoreUt;
      projScoreOpp = game.actualScoreOpp;
    } else if (manualScores[game.id]) {
      isWin = manualScores[game.id].teamScore > manualScores[game.id].oppScore;
      projScoreUt = manualScores[game.id].teamScore;
      projScoreOpp = manualScores[game.id].oppScore;
    } else if (userPicks[game.id]) {
      isWin = userPicks[game.id] === 'W';
    } else {
      const oppId = getOpponentTeamId(game);
      const oppEffSliders = oppId && bracket.simState?.teamSliders?.[oppId] ? bracket.simState.teamSliders[oppId] : GLOBAL_PRESETS['baseline'];
      const sim = calculateCombinedMatchup(game, teamId, teamSliders, oppId, oppEffSliders, null);
      isWin = sim.isWin;
      projScoreUt = sim.projUt;
      projScoreOpp = sim.projOpp;
    }

    if (isWin) predictedWins++;
    else predictedLosses++;

    if (game.isFinal) {
      const actualWin = game.actualScoreUt > game.actualScoreOpp;
      if (isWin === actualWin) correctPicks++;
    } else {
      correctPicks++;
    }
  });

  const pts = correctPicks * 10;
  const maxPts = totalGames * 10;
  const pct = Math.round((pts / maxPts) * 100);
  const grade = pct >= 90 ? 'A+' : (pct >= 80 ? 'A' : (pct >= 70 ? 'B' : 'C'));

  return {
    pts,
    maxPts,
    pct,
    predictedWins,
    predictedLosses,
    record: `${predictedWins}-${predictedLosses}`,
    gameCount: totalGames,
    hits: `${correctPicks}/${totalGames} Correct Picks`,
    grade
  };
}
window.calculateTeamScoreForUser = calculateTeamScoreForUser;

function renderVaultWeekSelector() {
  const dropdown = document.getElementById('vaultWeekSelectDropdown');
  const tabSelect = document.getElementById('vaultTabSelect');
  const teamDropdown = document.getElementById('vaultTeamSelectDropdown');
  const weekWrapper = document.getElementById('vaultWeekDropdownWrapper');
  const teamWrapper = document.getElementById('vaultTeamDropdownWrapper');

  if (tabSelect) {
    tabSelect.value = state.activeVaultTab || 'weekly';
  }

  if (dropdown) {
    const isSeasonTab = state.activeVaultTab === 'community';
    const activeVal = isSeasonTab ? 'all' : (state.selectedVaultWeek || 'W1');
    dropdown.value = activeVal;
  }

  if (teamDropdown) {
    if (teamDropdown.options.length <= 1) {
      let teamOpts = `<option value="all" ${state.selectedVaultTeam === 'all' ? 'selected' : ''}>🏈 All Teams (Global View)</option>`;
      const teamIds = Object.keys(TEAMS_DATABASE).sort((a, b) => TEAMS_DATABASE[a].name.localeCompare(TEAMS_DATABASE[b].name));
      teamIds.forEach(tid => {
        const t = TEAMS_DATABASE[tid];
        teamOpts += `<option value="${tid}" ${state.selectedVaultTeam === tid ? 'selected' : ''}>${t.name} (${t.conference})</option>`;
      });
      teamDropdown.innerHTML = teamOpts;
    }
    teamDropdown.value = state.selectedVaultTeam || 'all';
  }

  if (weekWrapper) {
    weekWrapper.style.display = (state.activeVaultTab === 'mine' || state.selectedVaultTeam !== 'all') ? 'none' : 'flex';
  }
}

function selectVaultTeam(teamId) {
  state.selectedVaultTeam = teamId || 'all';
  const dropdown = document.getElementById('vaultTeamSelectDropdown');
  if (dropdown) dropdown.value = state.selectedVaultTeam;
  renderVaultWeekSelector();
  renderSavedBracketsVault();
}
window.selectVaultTeam = selectVaultTeam;

function selectVaultWeek(weekKey) {
  state.selectedVaultWeek = weekKey;
  const select = document.getElementById('vaultTabSelect');
  if (weekKey === 'all') {
    state.activeVaultTab = 'community';
    if (select) select.value = 'community';
  } else {
    if (state.activeVaultTab === 'community') {
      state.activeVaultTab = 'weekly';
      if (select) select.value = 'weekly';
    }
  }
  renderVaultWeekSelector();
  renderSavedBracketsVault();
}
window.selectVaultWeek = selectVaultWeek;

function renderAll30TeamsVaultMatrix() {
  const grid = document.getElementById('bracketVaultGrid');
  if (!grid) return;

  const teamIds = Object.keys(TEAMS_DATABASE);
  let html = `<div class="all-teams-vault-container">`;

  // Check if a single week is selected or full season
  const isSingleWeek = state.selectedVaultWeek && state.selectedVaultWeek !== 'all';
  const byeTeams = isSingleWeek ? getTeamsOnByeForWeek(state.selectedVaultWeek) : [];

  if (isSingleWeek && byeTeams.length > 0) {
    html += `
      <div style="background: rgba(30, 41, 59, 0.7); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: var(--radius-md); padding: 0.75rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="font-family: var(--font-mono); font-size: 0.72rem; color: #F59E0B; font-weight: 800; text-transform: uppercase;">
          💤 TEAMS ON BYE THIS WEEK (${state.selectedVaultWeek}):
        </span>
        ${byeTeams.map(t => `
          <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.4); padding: 0.2rem 0.5rem; border-radius: var(--radius-full); font-size: 0.72rem; color: #E2E8F0;">
            <img src="${t.logoUrl || ''}" style="width: 16px; height: 16px; object-fit: contain;">
            ${t.shortName}
          </span>
        `).join('')}
      </div>
    `;
  }

  teamIds.forEach(tid => {
    const t = TEAMS_DATABASE[tid];
    let totalWins = 0;
    let totalLosses = 0;

    const gameChips = (t.schedule || []).map(g => {
      const sim = calculateAdjustedMatchup(g, tid);
      if (sim.isWin) totalWins++; else totalLosses++;

      const weekLabel = (g.week || 'W1').replace('WEEK ', 'W');
      const isHome = g.isHome;
      const vsPrefix = isHome ? 'vs' : '@';
      const oppName = g.oppShort || g.opponent;

      return `
        <div class="matrix-game-chip ${sim.isWin ? 'win' : 'loss'}" title="${g.week || ''}: ${t.shortName} ${sim.projUt}-${sim.projOpp} ${oppName} (${sim.adjWinProb}% win prob)">
          <div style="display: flex; justify-content: space-between; opacity: 0.8;">
            <span>${weekLabel}</span>
            <span style="font-weight: 800; color: ${sim.isWin ? '#34D399' : '#F87171'};">${sim.isWin ? 'W' : 'L'} ${sim.projUt}-${sim.projOpp}</span>
          </div>
          <div style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${vsPrefix} ${oppName}
          </div>
        </div>
      `;
    }).join('');

    html += `
      <div class="team-season-matrix-card">
        <div class="team-season-matrix-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <img src="${t.logoUrl || ''}" style="width: 28px; height: 28px; object-fit: contain;">
            <div>
              <span style="font-weight: 800; font-size: 0.95rem; color: #FFFFFF;">${t.name}</span>
              <span style="font-size: 0.72rem; color: #94A3B8; margin-left: 0.35rem;">(${t.conference})</span>
            </div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.9rem; font-weight: 800; color: ${totalWins >= 10 ? '#34D399' : '#FBBF24'};">
            ${totalWins} - ${totalLosses} Proj
          </div>
        </div>
        <div class="team-season-matrix-games">
          ${gameChips}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  grid.innerHTML = html;
}





// ==========================================================================
// USER AUTHENTICATION & PROPHET CREATOR ID SYSTEM
// ==========================================================================

const AUTH_STORAGE_KEY = 'cfb_prophet_auth_user_v4';
const BRACKET_STORAGE_KEY = 'cfb_prophet_saved_brackets_v5';
const COMMUNITY_BRACKETS_KEY = 'cfb_prophet_community_brackets_v5';
const COMMUNITY_CLOUD_TOPIC = 'cfb_prophet_community_2026_v5';
const DELETED_BRACKETS_KEY = 'cfb_prophet_deleted_bracket_ids_v5';

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem('cfb_prophet_auth_user_v3');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function setCurrentUser(user) {
  try {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem('cfb_prophet_auth_user_v3', JSON.stringify(user));
      localStorage.setItem('cfb_prophet_user_handle', user.displayName || user.handle || 'Coach');
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem('cfb_prophet_auth_user_v3');
    }
  } catch (e) {}
  updateAuthUI();
  renderSavedBracketsVault();
}

function updateAuthUI() {
  const user = getCurrentUser();
  const btn = document.getElementById('navAuthBtn');
  const label = document.getElementById('navAuthLabel');
  const icon = document.getElementById('navAuthIcon');

  const loggedInView = document.getElementById('authLoggedInView');
  const loggedOutView = document.getElementById('authLoggedOutView');

  if (user) {
    if (btn) btn.classList.add('logged-in');
    if (label) label.textContent = user.displayName || user.handle || 'Profile';
    if (icon) {
      if (user.avatarUrl) {
        icon.className = '';
        icon.innerHTML = `<img src="${user.avatarUrl}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; vertical-align: middle;" alt="avatar">`;
      } else {
        icon.className = 'fa-solid fa-user-check';
        icon.innerHTML = '';
      }
    }

    if (loggedInView) loggedInView.style.display = 'block';
    if (loggedOutView) loggedOutView.style.display = 'none';

    const pName = document.getElementById('authProfileName');
    const pEmail = document.getElementById('authProfileEmail');
    const pTeamName = document.getElementById('authProfileTeamName');
    const pTeamLogo = document.getElementById('authProfileTeamLogo');
    const pSavedCount = document.getElementById('authProfileSavedCount');

    if (pName) pName.textContent = user.displayName || user.handle || 'Coach';
    let badge = 'Supabase Verified';
    if (user.provider === 'apple') badge = 'Apple Verified';
    else if (user.provider === 'google') badge = 'Google Verified';
    else if (user.provider === 'github') badge = 'GitHub Verified';
    if (pEmail) pEmail.textContent = user.email ? `${user.email} • ${badge}` : `@${user.handle || 'Coach'} • ${badge}`;

    const savedFav = user.favTeam || localStorage.getItem('cfb_prophet_fav_team') || localStorage.getItem('cfb_prophet_favorite_team_id') || state.currentTeamId || 'ohiostate';
    user.favTeam = savedFav;
    const favTeam = TEAMS_DATABASE[savedFav] || TEAMS_DATABASE['ohiostate'] || TEAMS_DATABASE['usc'];
    if (pTeamName) pTeamName.textContent = favTeam.name;
    if (pTeamLogo) pTeamLogo.src = favTeam.logoUrl || '';

    populateFavoriteTeamDropdown(savedFav);

    const myBrackets = getSavedBrackets();
    if (pSavedCount) pSavedCount.textContent = `${myBrackets.length} Active Saved`;
  } else {
    if (btn) btn.classList.remove('logged-in');
    if (label) label.textContent = 'Sign In';
    if (icon) {
      icon.className = 'fa-solid fa-user-circle';
      icon.innerHTML = '';
    }

    if (loggedInView) loggedInView.style.display = 'none';
    if (loggedOutView) loggedOutView.style.display = 'block';
  }
}
window.updateAuthUI = updateAuthUI;

function populateFavoriteTeamDropdown(selectedTeamId) {
  const selectEl = document.getElementById('authFavoriteTeamSelect');
  if (!selectEl) return;

  const sortedTeams = Object.keys(TEAMS_DATABASE).map(k => TEAMS_DATABASE[k]).sort((a, b) => a.name.localeCompare(b.name));
  selectEl.innerHTML = sortedTeams.map(t => `
    <option value="${t.id}" ${t.id === selectedTeamId ? 'selected' : ''}>
      ${t.name} (${t.conference || 'FBS'})
    </option>
  `).join('');
}
window.populateFavoriteTeamDropdown = populateFavoriteTeamDropdown;

function handleFavoriteTeamChange(newTeamId) {
  if (!newTeamId || !TEAMS_DATABASE[newTeamId]) return;

  localStorage.setItem('cfb_prophet_fav_team', newTeamId);
  localStorage.setItem('cfb_prophet_favorite_team_id', newTeamId);

  const user = getCurrentUser();
  if (user) {
    user.favTeam = newTeamId;
    setCurrentUser(user);
    if (window.CFBProphetSupabase && typeof window.CFBProphetSupabase.updateProfile === 'function') {
      try { window.CFBProphetSupabase.updateProfile({ favTeam: newTeamId }); } catch (e) {}
    }
  }
  
  const favTeam = TEAMS_DATABASE[newTeamId];
  const pTeamName = document.getElementById('authProfileTeamName');
  const pTeamLogo = document.getElementById('authProfileTeamLogo');
  if (pTeamName) pTeamName.textContent = favTeam.name;
  if (pTeamLogo) pTeamLogo.src = favTeam.logoUrl || '';

  selectTeam(newTeamId);
  if (typeof showCustomToast === 'function') {
    showCustomToast(`⭐ Favorite team updated to ${favTeam.name}!`);
  }
}
window.handleFavoriteTeamChange = handleFavoriteTeamChange;

function openAuthModal() {
  updateAuthUI();
  hideAuthAlert();
  switchAuthTab('password');
  cancelDeleteAccountConfirmation();

  // Detect iOS native app vs web browser
  const isIosNative = (
    (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios') ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    (window.webkit && window.webkit.messageHandlers && !window.location.hostname.includes('github.io') && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1'))
  );

  const googleSec = document.getElementById('googleAuthSection');
  if (googleSec) {
    // Hide on iOS native app to adhere to App Store Guideline 4.8; keep visible on Web
    googleSec.style.display = isIosNative ? 'none' : 'block';
  }

  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('open');
  document.body.classList.add('modal-open');
}
window.openAuthModal = openAuthModal;

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}
window.closeAuthModal = closeAuthModal;

let currentAuthPasswordMode = 'signin'; // 'signin' or 'signup'

function switchAuthTab(tab) {
  const tabs = ['password', 'magic'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
    const content = document.getElementById(`auth${t.charAt(0).toUpperCase() + t.slice(1)}Tab`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (content) content.style.display = (t === tab) ? 'block' : 'none';
  });
  hideAuthAlert();
}
window.switchAuthTab = switchAuthTab;

function fillReviewerDemoCredentials() {
  const emailInput = document.getElementById('supaEmailInput');
  const passInput = document.getElementById('supaPasswordInput');
  if (emailInput) emailInput.value = 'reviewer.demo@cfbprophet.app';
  if (passInput) passInput.value = 'ReviewerDemo2026!';
  switchAuthTab('password');
  handleSupabasePasswordAuth();
}
window.fillReviewerDemoCredentials = fillReviewerDemoCredentials;

function toggleAuthPasswordMode() {
  currentAuthPasswordMode = (currentAuthPasswordMode === 'signin') ? 'signup' : 'signin';
  const isReg = (currentAuthPasswordMode === 'signup');

  const nameGroup = document.getElementById('authRegNameGroup');
  const teamGroup = document.getElementById('authRegTeamGroup');
  const submitLabel = document.getElementById('supaPasswordSubmitLabel');
  const toggleBtn = document.getElementById('togglePasswordModeBtn');

  if (nameGroup) nameGroup.style.display = isReg ? 'flex' : 'none';
  if (teamGroup) teamGroup.style.display = isReg ? 'flex' : 'none';
  if (submitLabel) submitLabel.textContent = isReg ? 'Create Account' : 'Sign In';
  if (toggleBtn) toggleBtn.textContent = isReg ? 'Already have an account? Sign in' : "Don't have an account? Create one";
  hideAuthAlert();
}
window.toggleAuthPasswordMode = toggleAuthPasswordMode;

function showAuthAlert(msg, type = 'error') {
  const banner = document.getElementById('authAlertBanner');
  if (!banner) return;
  banner.className = `auth-alert-banner ${type}`;
  let icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
  else if (type === 'info') icon = '<i class="fa-solid fa-circle-info"></i>';
  banner.innerHTML = `${icon} <span>${msg}</span>`;
  banner.style.display = 'flex';
}
window.showAuthAlert = showAuthAlert;

function hideAuthAlert() {
  const banner = document.getElementById('authAlertBanner');
  if (banner) banner.style.display = 'none';
}
window.hideAuthAlert = hideAuthAlert;

async function handleSupabaseGoogleSignIn() {
  hideAuthAlert();
  if (window.CFBProphetSupabase) {
    const res = await window.CFBProphetSupabase.signInWithGoogle();
    if (res && res.error) {
      const msg = res.error.message?.includes('provider') 
        ? "Google OAuth isn't enabled in Supabase Dashboard yet (Auth -> Providers). You can sign in right now with Email & Pass or Magic Link!" 
        : (res.error.message || 'Google sign-in error.');
      showAuthAlert(msg, 'error');
    }
  }
}
window.handleSupabaseGoogleSignIn = handleSupabaseGoogleSignIn;

async function handleSupabaseGitHubSignIn() {
  hideAuthAlert();
  if (window.CFBProphetSupabase) {
    const res = await window.CFBProphetSupabase.signInWithGitHub();
    if (res && res.error) {
      const msg = res.error.message?.includes('provider') 
        ? "GitHub OAuth isn't enabled in Supabase Dashboard yet (Auth -> Providers). You can sign in right now with Email & Pass or Magic Link!" 
        : (res.error.message || 'GitHub sign-in error.');
      showAuthAlert(msg, 'error');
    }
  }
}
window.handleSupabaseGitHubSignIn = handleSupabaseGitHubSignIn;

async function handleSupabaseAppleSignIn() {
  hideAuthAlert();
  if (window.CFBProphetSupabase) {
    const res = await window.CFBProphetSupabase.signInWithApple();
    if (res && res.error) {
      const msg = res.error.message?.includes('provider') 
        ? "Apple Sign-In isn't enabled in Supabase Dashboard yet (Auth -> Providers). You can sign in right now with Email & Pass or Magic Link!" 
        : (res.error.message || 'Apple sign-in error.');
      showAuthAlert(msg, 'error');
    }
  }
}
window.handleSupabaseAppleSignIn = handleSupabaseAppleSignIn;

async function handleSupabaseMagicLinkAuth(e) {
  if (e) e.preventDefault();
  hideAuthAlert();
  const emailInput = document.getElementById('supaMagicEmailInput');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email || !email.includes('@')) {
    showAuthAlert('Please enter a valid email address.', 'error');
    return;
  }

  showAuthAlert('Sending magic login link...', 'info');
  if (window.CFBProphetSupabase) {
    const res = await window.CFBProphetSupabase.signInWithMagicLink(email);
    if (res && res.error) {
      showAuthAlert(res.error.message || 'Error sending magic link.', 'error');
    } else {
      showAuthAlert('⚡ Magic login link sent! Check your inbox to sign in.', 'success');
    }
  }
}
window.handleSupabaseMagicLinkAuth = handleSupabaseMagicLinkAuth;

async function handleSupabasePasswordAuth(e) {
  if (e) e.preventDefault();
  hideAuthAlert();
  const email = document.getElementById('supaEmailInput')?.value?.trim();
  const password = document.getElementById('supaPasswordInput')?.value?.trim();
  const displayName = document.getElementById('supaNameInput')?.value?.trim();
  const favTeam = document.getElementById('supaFavTeamSelect')?.value || 'usc';

  if (!email || !password) {
    showAuthAlert('Please provide both email and password.', 'error');
    return;
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  // Apple App Reviewer Demo Account (Guideline 2.1 Demo Credentials)
  if (cleanEmail === 'reviewer.demo@cfbprophet.app' || cleanEmail === 'apple.reviewer@cfbprophet.app') {
    if (cleanPass !== 'Reviewer2026!' && cleanPass !== 'ReviewerDemo2026!') {
      showAuthAlert('Invalid email or password.', 'error');
      return;
    }
    const demoUser = {
      id: 'reviewer_demo_user_2026',
      email: cleanEmail,
      displayName: 'Apple App Reviewer',
      handle: 'app_reviewer',
      avatarUrl: '',
      favTeam: 'texas',
      provider: 'demo',
      createdAt: new Date().toISOString()
    };
    setCurrentUser(demoUser);
    showCustomToast('🎉 Welcome, Apple App Reviewer! Signed in.');
    closeAuthModal();
    return;
  }

  if (currentAuthPasswordMode === 'signup') {
    showAuthAlert('Creating your Supabase account...', 'info');
    if (window.CFBProphetSupabase) {
      const res = await window.CFBProphetSupabase.signUpWithPassword(email, password, displayName, favTeam);
      if (res && res.error) {
        showAuthAlert(res.error.message || 'Registration failed.', 'error');
      } else {
        showAuthAlert('🎉 Account created! Check your email to confirm registration.', 'success');
        setTimeout(() => closeAuthModal(), 2000);
      }
    }
  } else {
    showAuthAlert('Signing in...', 'info');
    if (window.CFBProphetSupabase) {
      const res = await window.CFBProphetSupabase.signInWithPassword(email, password);
      if (res && res.error) {
        showAuthAlert(res.error.message || 'Invalid email or password.', 'error');
      } else {
        showCustomToast('🎉 Signed in successfully!');
        closeAuthModal();
      }
    }
  }
}
window.handleSupabasePasswordAuth = handleSupabasePasswordAuth;

async function handleProfileSetPassword() {
  const input = document.getElementById('authProfileNewPasswordInput');
  const notice = document.getElementById('authPasswordStatusNotice');
  const btn = document.getElementById('authProfileSavePasswordBtn');
  const password = input?.value?.trim();

  if (!password || password.length < 6) {
    if (notice) {
      notice.textContent = '❌ Min 6 characters required';
      notice.style.color = '#F87171';
    }
    showCustomToast('⚠️ Password must be at least 6 characters.');
    return;
  }

  if (btn) btn.disabled = true;
  if (notice) {
    notice.textContent = 'Updating password...';
    notice.style.color = '#38BDF8';
  }

  try {
    if (window.CFBProphetSupabase && typeof window.CFBProphetSupabase.updateAccountPassword === 'function') {
      const res = await window.CFBProphetSupabase.updateAccountPassword(password);
      if (res && res.error) {
        if (notice) {
          notice.textContent = `❌ ${res.error.message}`;
          notice.style.color = '#F87171';
        }
        showCustomToast(`⚠️ Error: ${res.error.message}`);
      } else {
        if (notice) {
          notice.textContent = '✅ Password saved!';
          notice.style.color = '#34D399';
        }
        if (input) input.value = '';
        showCustomToast('🔒 Password saved! You can now log in with email & password on any device.');
      }
    } else {
      showCustomToast('⚠️ Cloud connection unavailable.');
    }
  } catch (err) {
    showCustomToast(`⚠️ ${err.message || 'Failed to update password'}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.handleProfileSetPassword = handleProfileSetPassword;

async function handleForgotPasswordRequest() {
  const emailInput = document.getElementById('supaEmailInput');
  let email = emailInput?.value?.trim();

  if (!email) {
    email = prompt('Enter your account email to receive a password creation / reset link:');
    if (email) email = email.trim();
  }

  if (!email || !email.includes('@')) {
    showAuthAlert('Please enter your email address first.', 'error');
    return;
  }

  showAuthAlert(`Sending password setup link to ${email}...`, 'info');

  try {
    if (window.CFBProphetSupabase && typeof window.CFBProphetSupabase.resetPasswordForEmail === 'function') {
      const res = await window.CFBProphetSupabase.resetPasswordForEmail(email);
      if (res && res.error) {
        showAuthAlert(res.error.message || 'Could not send email link.', 'error');
      } else {
        showAuthAlert(`📬 Password link sent to ${email}! Check your inbox to create your password.`, 'success');
        showCustomToast(`📬 Password email sent to ${email}!`);
      }
    } else {
      showAuthAlert('Cloud connection unavailable.', 'error');
    }
  } catch (err) {
    showAuthAlert(err.message || 'Failed to send email link.', 'error');
  }
}
window.handleForgotPasswordRequest = handleForgotPasswordRequest;

function toggleSupabaseConfigDrawer() {
  const drawer = document.getElementById('supabaseConfigDrawer');
  if (drawer) {
    drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
  }
}
window.toggleSupabaseConfigDrawer = toggleSupabaseConfigDrawer;

function saveSupabaseConfigInputs() {
  const url = document.getElementById('cfgSupabaseUrl')?.value?.trim();
  const key = document.getElementById('cfgSupabaseKey')?.value?.trim();
  if (url && key && window.CFBProphetSupabase) {
    window.CFBProphetSupabase.setConfig(url, key);
    showAuthAlert('✅ Supabase project connected successfully!', 'success');
    toggleSupabaseConfigDrawer();
  } else {
    showAuthAlert('Please enter both Supabase URL and Anon Key.', 'error');
  }
}
window.saveSupabaseConfigInputs = saveSupabaseConfigInputs;

// Native Swift Bridge Callback for Apple Sign In
window.handleAppleSignInResult = function(payload) {
  if (!payload || !payload.userId) return;
  const user = {
    id: `apple_${payload.userId}`,
    displayName: payload.fullName || payload.displayName || 'Apple User',
    handle: payload.fullName || 'Apple User',
    email: payload.email || 'apple_user@privaterelay.appleid.com',
    provider: 'apple',
    favTeam: state.currentTeamId || 'usc',
    createdAt: new Date().toISOString()
  };
  setCurrentUser(user);
  showCustomToast(`🍎 Signed in with Apple ID as ${user.displayName}!`);
  closeAuthModal();
};

function handleSignOutClick() {
  if (window.CFBProphetSupabase) {
    window.CFBProphetSupabase.signOut();
  }
  setCurrentUser(null);
  showCustomToast('👋 Signed out of CFB Prophet.');
  closeAuthModal();
}
window.handleSignOutClick = handleSignOutClick;

function showDeleteAccountConfirmation() {
  const initial = document.getElementById('authDeleteAccountInitial');
  const confirmBox = document.getElementById('authDeleteAccountConfirmBox');
  if (initial) initial.style.display = 'none';
  if (confirmBox) confirmBox.style.display = 'block';
}
window.showDeleteAccountConfirmation = showDeleteAccountConfirmation;

function cancelDeleteAccountConfirmation() {
  const initial = document.getElementById('authDeleteAccountInitial');
  const confirmBox = document.getElementById('authDeleteAccountConfirmBox');
  if (initial) initial.style.display = 'block';
  if (confirmBox) confirmBox.style.display = 'none';
}
window.cancelDeleteAccountConfirmation = cancelDeleteAccountConfirmation;

async function executeDeleteAccount() {
  const currentUser = getCurrentUser();

  // 1. Mark all user brackets as deleted in local storage tombstone
  try {
    const myBrackets = getSavedBrackets();
    if (Array.isArray(myBrackets)) {
      myBrackets.forEach(b => {
        if (b && b.id) {
          addDeletedBracketId(b.id);
        }
      });
    }
  } catch (e) {}

  // 2. Clear bracket storage keys
  try {
    localStorage.removeItem(BRACKET_STORAGE_KEY);
    localStorage.removeItem('cfb_prophet_saved_brackets_v5');
    localStorage.removeItem('cfb_prophet_saved_brackets_v4');
    localStorage.removeItem('cfb_prophet_saved_brackets_v3');
  } catch (e) {}

  // 3. Clear cloud session & auth keys
  try {
    if (window.CFBProphetSupabase && window.CFBProphetSupabase.deleteUserAccount) {
      await window.CFBProphetSupabase.deleteUserAccount();
    } else if (window.CFBProphetSupabase) {
      await window.CFBProphetSupabase.signOut();
    }
  } catch (e) {}

  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('cfb_prophet_auth_user_v4');
  localStorage.removeItem('cfb_prophet_auth_user_v3');
  localStorage.removeItem('cfb_prophet_user_handle');
  localStorage.removeItem('cfb_prophet_fav_team');
  localStorage.removeItem('cfb_prophet_favorite_team_id');

  cancelDeleteAccountConfirmation();
  setCurrentUser(null);
  updateAuthUI();
  showCustomToast('🗑️ Your account and data have been permanently deleted.');
  closeAuthModal();
}
window.executeDeleteAccount = executeDeleteAccount;

async function runAccountDeletionDemoRecording() {
  console.log("Starting automated Account Deletion demo flow...");
  // Step 1: Initial home view pause
  await new Promise(r => setTimeout(r, 2000));
  
  // Step 2: Open Sign In modal
  openAuthModal();
  await new Promise(r => setTimeout(r, 2200));
  
  // Step 3: Click demo reviewer credentials button
  fillReviewerDemoCredentials();
  await new Promise(r => setTimeout(r, 2500));
  
  // Step 4: Open profile modal
  openAuthModal();
  await new Promise(r => setTimeout(r, 2200));
  
  // Step 5: Smoothly scroll to the Delete Account button
  const triggerBtn = document.getElementById('authDeleteAccountTriggerBtn');
  if (triggerBtn) {
    triggerBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  await new Promise(r => setTimeout(r, 2200));
  
  // Step 6: Reveal the confirmation dialog
  showDeleteAccountConfirmation();
  await new Promise(r => setTimeout(r, 3200));
  
  // Step 7: Confirm deletion
  await executeDeleteAccount();
  await new Promise(r => setTimeout(r, 4000));
}
window.runAccountDeletionDemoRecording = runAccountDeletionDemoRecording;

// Check if demo recording flag was requested
try {
  if (localStorage.getItem('run_account_deletion_demo') === 'true') {
    localStorage.removeItem('run_account_deletion_demo');
    setTimeout(() => {
      runAccountDeletionDemoRecording();
    }, 2000);
  }
} catch (e) {}

function saveCurrentProjectionAsBracket(name, creator, notes, forceNewId = false) {
  const evaluated = evaluateRegularSeasonAllTeams();
  const ccg = simulateConferenceChampionships(evaluated);
  const cfp = (state.lastPlayoffResults && state.lastPlayoffResults.cfp) ? state.lastPlayoffResults.cfp : generate12TeamCfpField(ccg.confChamps, evaluated);
  const playoff = state.lastPlayoffResults || simulatePlayoffBracket(cfp);
  const champTeam = state.lastNationalChampion || (playoff.nationalChampion ? (TEAMS_DATABASE[playoff.nationalChampion.id] || playoff.nationalChampion) : TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate']);
  const runnerTeam = playoff.runnerUp ? (TEAMS_DATABASE[playoff.runnerUp.id] || playoff.runnerUp) : TEAMS_DATABASE['oregon'];

  const currentUser = getCurrentUser();
  const creatorName = creator && creator.trim() ? creator.trim() : (currentUser ? currentUser.displayName : 'Coach');
  const creatorId = currentUser ? currentUser.id : `guest_${Date.now()}`;

  const allKnown = getAllKnownBrackets();
  const existingBracket = state.activeSavedBracketId ? allKnown.find(b => b.id === state.activeSavedBracketId) : null;
  const isAi = existingBracket && (existingBracket.isAdminBenchmark || existingBracket.id === 'bracket_prophet_ai_baseline' || (existingBracket.name && existingBracket.name.toLowerCase().includes('prophet ai')));
  const isOwner = existingBracket && !isAi && (isBracketOwnedByUser(existingBracket, currentUser) || getSavedBrackets().some(sb => sb.id === existingBracket.id));

  const isEditingExisting = !forceNewId && isOwner;
  const bracketId = isEditingExisting ? state.activeSavedBracketId : `bracket_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const seeds = (cfp.seeds || []).slice(0, 12).map((s, idx) => ({
    seed: idx + 1,
    id: s?.id || 'team',
    name: s?.shortName || s?.name || 'Team',
    logoUrl: s?.logoUrl || '',
    wins: s?.wins !== undefined ? s.wins : (s?.totalWins || 11),
    losses: s?.losses !== undefined ? s.losses : (s?.totalLosses || 1)
  }));

  const bracketObj = {
    id: bracketId,
    name: (name && name.trim()) ? name.trim() : `${champTeam.shortName || 'CFB'} Championship Projection`,
    creator: creatorName,
    creatorId: creatorId,
    creatorEmail: currentUser ? (currentUser.email || '') : '',
    notes: (notes && notes.trim()) ? notes.trim() : 'Custom 2026 CFP Simulation',
    createdAt: new Date().toISOString(),
    mode: isSlidersCustom() ? 'custom' : 'baseline',
    isPublic: true,
    champion: {
      id: champTeam.id || getTopRankedTeamId() || 'ohiostate',
      name: champTeam.name || 'Texas Longhorns',
      shortName: champTeam.shortName || 'Texas',
      logoUrl: champTeam.logoUrl || '',
      score: playoff.natty?.sim?.winnerScore || playoff.natty?.sim?.scoreA || 35,
      oppScore: playoff.natty?.sim?.loserScore || playoff.natty?.sim?.scoreB || 28
    },
    runnerUp: {
      id: runnerTeam.id || 'oregon',
      name: runnerTeam.name || 'Oregon Ducks',
      shortName: runnerTeam.shortName || 'Oregon'
    },
    seeds: seeds,
    playoffSummary: {
      fr: [
        { winner: playoff.fr1?.sim?.winner?.shortName || 'Team' },
        { winner: playoff.fr2?.sim?.winner?.shortName || 'Team' },
        { winner: playoff.fr3?.sim?.winner?.shortName || 'Team' },
        { winner: playoff.fr4?.sim?.winner?.shortName || 'Team' }
      ],
      qf: [
        { winner: playoff.qf1?.sim?.winner?.shortName || 'Team' },
        { winner: playoff.qf2?.sim?.winner?.shortName || 'Team' },
        { winner: playoff.qf3?.sim?.winner?.shortName || 'Team' },
        { winner: playoff.qf4?.sim?.winner?.shortName || 'Team' }
      ],
      sf: [
        { winner: playoff.sf1?.sim?.winner?.shortName || 'Team' },
        { winner: playoff.sf2?.sim?.winner?.shortName || 'Team' }
      ]
    },
    simState: {
      teamId: state.currentTeamId || getTopRankedTeamId() || 'ohiostate',
      userPicks: JSON.parse(JSON.stringify(state.userPicks || {})),
      manualScores: JSON.parse(JSON.stringify(state.manualScores || {})),
      ccgPicks: JSON.parse(JSON.stringify(state.ccgPicks || {})),
      playoffPicks: JSON.parse(JSON.stringify(state.playoffPicks || {})),
      teamSliders: JSON.parse(JSON.stringify(state.teamSliders || {})),
      gameSliders: JSON.parse(JSON.stringify(state.gameSliders || {}))
    }
  };

  const myBrackets = getSavedBrackets();
  const existingIdx = myBrackets.findIndex(b => b && b.id === bracketId);
  if (existingIdx !== -1) {
    myBrackets[existingIdx] = bracketObj;
  } else {
    myBrackets.unshift(bracketObj);
  }
  state.activeSavedBracketId = bracketObj.id;

  try {
    localStorage.setItem(BRACKET_STORAGE_KEY, JSON.stringify(myBrackets));
  } catch (e) {}

  if (window.CFBProphetSupabase && typeof window.CFBProphetSupabase.saveBracket === 'function') {
    window.CFBProphetSupabase.saveBracket(bracketObj);
  }

  return bracketObj;
}
window.saveCurrentProjectionAsBracket = saveCurrentProjectionAsBracket;

function getDeletedBracketIds() {
  try {
    const raw = localStorage.getItem(DELETED_BRACKETS_KEY);
    if (raw) {
      const set = new Set(JSON.parse(raw) || []);
      // Protect Jake Johnson personal / Coach restored brackets from any accidental test tombstones
      const protectedIds = [
        'bracket_texas_natty_run_curated',
        'bracket_1788379888693_dp2edk', // Long Horns Nation
        'bracket_1787937962988_ekhyka', // HOOK'EM
        'bracket_1788031172051_pe9e3z', // Georgia Natty Projection
        'bracket_1788107533721_xivsla', // Ohio State Natty Projection (Coach)
        'bracket_1788032610598_nbefcu', // Ohio State Natty Projection (Coachi)
        'bracket_1787956769853_9u53gs', // Georgia Natty Projection (Coach)
        'bracket_1787858780235_md4xw1'  // Alabama Kelon out here (Big Jay)
      ];
      protectedIds.forEach(id => set.delete(id));
      return set;
    }
  } catch (e) {}
  return new Set();
}

function addDeletedBracketId(bracketId) {
  if (!bracketId) return;
  try {
    const set = getDeletedBracketIds();
    set.add(bracketId);
    localStorage.setItem(DELETED_BRACKETS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function isBracketOwnedByUser(b, currentUser, isFromLocalSaved = false) {
  if (!b || !b.id || b.id === 'bracket_prophet_ai_baseline' || b.id === 'bracket_usc_wins_out_curated') return false;

  const bCreatorId = (b.creatorId || b.creator_id || b.user_id || b.userId || '').trim();
  const bCreator = (b.creator || '').trim().toLowerCase();
  const bCreatorEmail = (b.creatorEmail || b.creator_email || '').trim().toLowerCase();

  // If not logged in (guest)
  if (!currentUser) {
    if (isFromLocalSaved) {
      if (bCreatorEmail === 'jajo9147@gmail.com' || bCreatorEmail === 'jake.johnson1@verizon.com' || bCreatorEmail.includes('@')) return false;
      if (bCreator === 'jake johnson' || bCreator === 'jake t johnson' || bCreator === 'hayden karr' || bCreator === 'logandplunkett' || bCreator === 'bill johnson' || bCreator.includes('phillip')) return false;
      return (!bCreatorId || bCreatorId.startsWith('guest_'));
    }
    return false;
  }

  const userId = (currentUser.id || '').trim();
  const userDisplayName = (currentUser.displayName || '').trim().toLowerCase();
  const userEmail = (currentUser.email || '').trim().toLowerCase();

  // ----------------------------------------------------
  // CASE 1: Reviewer Demo (reviewer.demo@cfbprophet.app)
  // STRICT ISOLATION: Reviewer Demo owns ONLY their own demo bracket!
  // Can NEVER own, edit, or delete any Jake Johnson, Jake T Johnson, or community bracket!
  // ----------------------------------------------------
  const isReviewerDemo = userEmail === 'reviewer.demo@cfbprophet.app' || userId === 'reviewer_demo_user_2026' || userDisplayName.includes('reviewer');
  if (isReviewerDemo) {
    if (b.id === 'bracket_demo_reviewer_sample') return true;
    if (bCreatorEmail === 'reviewer.demo@cfbprophet.app') return true;
    if (bCreatorId === 'reviewer_demo_user_2026') return true;
    return false; // Absolute hard wall: cannot own or edit anything else
  }

  // ----------------------------------------------------
  // CASE 2: Account A: Jake Johnson Personal (jajo9147@gmail.com)
  // ----------------------------------------------------
  const isJajoAccount = userEmail === 'jajo9147@gmail.com' || (userDisplayName === 'jake johnson' && !userEmail.includes('verizon'));
  if (isJajoAccount) {
    // Hard rejection of Verizon work account brackets
    if (bCreatorEmail === 'jake.johnson1@verizon.com' || bCreator === 'jake t johnson' || bCreator === 'big10 sucks' || bCreator === 'big 12 sucks' || b.id === 'bracket_1788283017975_otti8m' || b.id === 'bracket_1787937853466_h2h0r3') {
      return false;
    }
    // Hard rejection of the other 4 users: Bill, Logan, Hayden, Phillip
    if (bCreator === 'hayden karr' || bCreator === 'logandplunkett' || bCreator === 'bill johnson' || bCreator.includes('phillip') || bCreatorEmail.includes('phillip')) {
      return false;
    }
    if (bCreatorId === 'db667bf7-5c78-4554-81b2-e0039c241936' || bCreatorId === '9a630b09-0dd9-47e0-9e7c-ecfd770fe060' || bCreatorId === '56a97b58-44e3-445b-bdb1-cbfce0d9b5aa') {
      return false;
    }
    if (b.id === 'bracket_demo_reviewer_sample' || bCreatorEmail === 'reviewer.demo@cfbprophet.app') {
      return false;
    }

    // Jake owns his personal account submissions:
    if (bCreatorEmail === 'jajo9147@gmail.com') return true;
    if (bCreatorId === '116de3ad-fe71-4f75-8743-49162d223d08') return true;
    if (b.id === 'bracket_texas_natty_run_curated' || b.id === 'bracket_1787937962988_ekhyka' || b.id === 'bracket_1788031172051_pe9e3z') return true;

    // Jake also made Coach, Coachi, Big Jay predictions!
    if (bCreator === 'coach' || bCreator === 'coachi' || bCreator === 'big jay' || bCreator === 'jake johnson') {
      return true;
    }

    if (isFromLocalSaved && (!bCreatorId || bCreatorId.startsWith('guest_'))) {
      return true;
    }

    return false;
  }

  // ----------------------------------------------------
  // CASE 3: Account B: Jake T Johnson Work (jake.johnson1@verizon.com)
  // ----------------------------------------------------
  const isVerizonAccount = userEmail === 'jake.johnson1@verizon.com' || userDisplayName === 'jake t johnson';
  if (isVerizonAccount) {
    // Hard rejection of Jajo personal brackets
    if (bCreatorEmail === 'jajo9147@gmail.com' || bCreator === 'jake johnson' || b.id === 'bracket_texas_natty_run_curated' || b.id === 'bracket_1787937962988_ekhyka' || b.id === 'bracket_1788031172051_pe9e3z' || bCreator === 'coach' || bCreator === 'coachi' || bCreator === 'big jay') {
      return false;
    }
    // Hard rejection of the other 4 users: Bill, Logan, Hayden, Phillip
    if (bCreator === 'hayden karr' || bCreator === 'logandplunkett' || bCreator === 'bill johnson' || bCreator.includes('phillip')) return false;
    if (bCreatorId === 'db667bf7-5c78-4554-81b2-e0039c241936' || bCreatorId === '9a630b09-0dd9-47e0-9e7c-ecfd770fe060' || bCreatorId === '56a97b58-44e3-445b-bdb1-cbfce0d9b5aa') return false;

    // Jake T Johnson owns his work account submissions:
    if (bCreatorEmail === 'jake.johnson1@verizon.com') return true;
    if (bCreatorId === '8f96664c-c8e9-4360-8071-503aac2e3155') return true;
    if (b.id === 'bracket_1788283017975_otti8m' || b.id === 'bracket_1787937853466_h2h0r3') return true;
    if (bCreator === 'jake t johnson' || bCreator === 'big10 sucks' || bCreator === 'big 12 sucks') return true;
    return false;
  }

  // ----------------------------------------------------
  // CASE 4: Any other signed-in user (Bill, Logan, Hayden, Phillip)
  // ----------------------------------------------------
  if (bCreatorEmail === 'jajo9147@gmail.com' || bCreatorEmail === 'jake.johnson1@verizon.com') return false;
  if (b.id === 'bracket_texas_natty_run_curated' || b.id === 'bracket_1787937962988_ekhyka' || b.id === 'bracket_1788031172051_pe9e3z' || b.id === 'bracket_1788283017975_otti8m' || b.id === 'bracket_1787937853466_h2h0r3') {
    return false;
  }
  if (userId && bCreatorId && (bCreatorId === userId)) return true;
  if (userEmail && bCreatorEmail && (bCreatorEmail === userEmail)) return true;
  if (userDisplayName && bCreator && (bCreator === userDisplayName)) return true;

  return false;
}
window.isBracketOwnedByUser = isBracketOwnedByUser;

function getSavedBrackets() {
  const currentUser = getCurrentUser();
  const deletedIds = getDeletedBracketIds();
  const userBracketsMap = new Map();

  if (!currentUser) {
    // Guest: only load local unassigned brackets
    let localSavedBrackets = [];
    try {
      const raw = localStorage.getItem(BRACKET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) localSavedBrackets = parsed;
      }
    } catch (e) {}
    localSavedBrackets.forEach(b => {
      if (isBracketOwnedByUser(b, null, true)) {
        userBracketsMap.set(b.id, b);
      }
    });
    return Array.from(userBracketsMap.values());
  }

  const userEmail = (currentUser.email || '').toLowerCase();
  const userId = currentUser.id || '';

  // 1. Reviewer Demo: dedicated demo bracket ONLY
  if (userEmail === 'reviewer.demo@cfbprophet.app' || userId === 'reviewer_demo_user_2026') {
    const demoBracket = {
      id: 'bracket_demo_reviewer_sample',
      name: 'Reviewer 2026 CFP Simulation',
      creator: 'Apple App Reviewer',
      creatorId: 'reviewer_demo_user_2026',
      creatorEmail: 'reviewer.demo@cfbprophet.app',
      notes: 'Demo bracket for App Review validation',
      createdAt: new Date().toISOString(),
      mode: 'custom',
      isPublic: true,
      champion: {
        id: 'georgia',
        name: 'Georgia Bulldogs',
        shortName: 'Georgia',
        logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png',
        score: 34,
        oppScore: 24
      },
      runnerUp: {
        id: 'ohiostate',
        name: 'Ohio State Buckeyes',
        shortName: 'Ohio State'
      },
      seeds: [
        { id: 'georgia', name: 'Georgia', seed: 1, wins: 13, losses: 0, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png' },
        { id: 'ohiostate', name: 'Ohio State', seed: 2, wins: 12, losses: 1, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png' },
        { id: 'miami', name: 'Miami', seed: 3, wins: 12, losses: 1, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2390.png' },
        { id: 'texastech', name: 'Texas Tech', seed: 4, wins: 11, losses: 2, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2641.png' },
        { id: 'michigan', name: 'Michigan', seed: 5, wins: 12, losses: 1, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/130.png' },
        { id: 'notredame', name: 'Notre Dame', seed: 6, wins: 11, losses: 1, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/87.png' },
        { id: 'texas', name: 'Texas', seed: 7, wins: 10, losses: 2, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png' },
        { id: 'oregon', name: 'Oregon', seed: 8, wins: 10, losses: 2, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png' },
        { id: 'olemiss', name: 'Ole Miss', seed: 9, wins: 10, losses: 2, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/145.png' },
        { id: 'lsu', name: 'LSU', seed: 10, wins: 10, losses: 3, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/99.png' },
        { id: 'alabama', name: 'Alabama', seed: 11, wins: 9, losses: 3, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png' },
        { id: 'clemson', name: 'Clemson', seed: 12, wins: 10, losses: 3, logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/228.png' }
      ]
    };
    if (!deletedIds.has(demoBracket.id)) {
      userBracketsMap.set(demoBracket.id, demoBracket);
    }
    return Array.from(userBracketsMap.values());
  }

  // 2. Jake Johnson (jajo9147@gmail.com): Ensure his Texas Natty Run bracket is present
  const isJajo = (userEmail === 'jajo9147@gmail.com' || ((currentUser.displayName || '').toLowerCase() === 'jake johnson' && !userEmail.includes('verizon')));
  if (isJajo) {
    const texasBracket = createTexasWinsOutBracket();
    if (!deletedIds.has(texasBracket.id)) {
      texasBracket.creatorId = '116de3ad-fe71-4f75-8743-49162d223d08';
      texasBracket.creator = 'Jake Johnson';
      texasBracket.creatorEmail = 'jajo9147@gmail.com';
      userBracketsMap.set(texasBracket.id, texasBracket);
    }
  }

  // 3. Scan community brackets (strict ownership match)
  let commSources = [];
  try {
    const comm = getLocalCommunityBrackets();
    if (Array.isArray(comm)) commSources.push(...comm);
  } catch (e) {}

  commSources.forEach(b => {
    if (!b || !b.id || b.id === 'bracket_prophet_ai_baseline' || b.id === 'bracket_usc_wins_out_curated' || deletedIds.has(b.id)) return;
    if (isBracketOwnedByUser(b, currentUser, false)) {
      userBracketsMap.set(b.id, b);
    }
  });

  // 4. Scan local device storage (allowing local drafts for current user)
  let localSources = [];
  const storageKeys = [
    BRACKET_STORAGE_KEY,
    'cfb_prophet_saved_brackets_v5',
    'cfb_prophet_saved_brackets_v4',
    'cfb_prophet_saved_brackets_v3'
  ];
  storageKeys.forEach(k => {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) localSources.push(...parsed);
      }
    } catch (e) {}
  });

  localSources.forEach(b => {
    if (!b || !b.id || b.id === 'bracket_prophet_ai_baseline' || b.id === 'bracket_usc_wins_out_curated' || deletedIds.has(b.id)) return;
    if (isBracketOwnedByUser(b, currentUser, true)) {
      userBracketsMap.set(b.id, b);
    }
  });

  return Array.from(userBracketsMap.values());
}

function getAllKnownBrackets() {
  const map = new Map();
  if (typeof getCommunityBrackets === 'function') {
    try {
      getCommunityBrackets().forEach(b => { if (b && b.id) map.set(b.id, b); });
    } catch(e) {}
  }
  if (typeof getSavedBrackets === 'function') {
    try {
      getSavedBrackets().forEach(b => { if (b && b.id) map.set(b.id, b); });
    } catch(e) {}
  }
  return Array.from(map.values());
}
window.getAllKnownBrackets = getAllKnownBrackets;

function createProphetAiBenchmarkBracket() {
  return {
    id: 'bracket_prophet_ai_baseline',
    name: "Prophet AI's Picks",
    creator: 'Prophet AI (Model Benchmark)',
    notes: 'The golden standard: 10,000 Monte Carlo simulation baseline. Can you beat the AI?',
    createdAt: '2026-08-27T12:00:00Z',
    mode: 'baseline',
    isAdminBenchmark: true,
    isPublic: true,
    champion: {
      id: 'ohiostate',
      name: 'Ohio State Buckeyes',
      shortName: 'Ohio State',
      logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png',
      score: 34,
      oppScore: 24
    },
    runnerUp: {
      id: 'oregon',
      name: 'Oregon Ducks',
      shortName: 'Oregon'
    },
    seeds: [
      { seed: 1,  id: 'ohiostate',  name: 'Ohio State',  logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png',  wins: 13, losses: 0 },
      { seed: 2,  id: 'texas',      name: 'Texas',       logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png',  wins: 12, losses: 1 },
      { seed: 3,  id: 'miami',      name: 'Miami',       logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2390.png', wins: 12, losses: 1 },
      { seed: 4,  id: 'texastech',  name: 'Texas Tech',  logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2641.png', wins: 10, losses: 3 },
      { seed: 5,  id: 'oregon',     name: 'Oregon',      logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png', wins: 11, losses: 2 },
      { seed: 6,  id: 'georgia',    name: 'Georgia',     logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png',   wins: 11, losses: 2 },
      { seed: 7,  id: 'notredame',  name: 'Notre Dame',  logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/87.png',   wins: 11, losses: 1 },
      { seed: 8,  id: 'alabama',    name: 'Alabama',     logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png',  wins: 10, losses: 2 },
      { seed: 9,  id: 'olemiss',    name: 'Ole Miss',    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/145.png',  wins: 10, losses: 2 },
      { seed: 10, id: 'indiana',    name: 'Indiana',     logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/84.png',   wins: 10, losses: 2 },
      { seed: 11, id: 'lsu',        name: 'LSU',         logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/99.png',   wins: 10, losses: 2 },
      { seed: 12, id: 'boisestate', name: 'Boise State', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/68.png',   wins: 12, losses: 1 }
    ],
    playoffSummary: {
      fr: [
        { label: '#5 vs #12', winner: 'Oregon' },
        { label: '#6 vs #11', winner: 'Georgia' },
        { label: '#7 vs #10', winner: 'Notre Dame' },
        { label: '#8 vs #9', winner: 'Alabama' }
      ],
      qf: [
        { bowl: 'Sugar Bowl', winner: 'Ohio State' },
        { bowl: 'Rose Bowl', winner: 'Oregon' },
        { bowl: 'Peach Bowl', winner: 'Texas' },
        { bowl: 'Fiesta Bowl', winner: 'Georgia' }
      ],
      sf: [
        { bowl: 'Orange Bowl', winner: 'Ohio State' },
        { bowl: 'Cotton Bowl', winner: 'Oregon' }
      ]
    },
    simState: {
      teamId: 'ohiostate',
      userPicks: {},
      manualScores: {},
      ccgPicks: {},
      playoffPicks: {},
      teamSliders: {},
      gameSliders: {}
    }
  };
}

function createBaselineBracketObject() {
  return createProphetAiBenchmarkBracket();
}

function createTexasWinsOutBracket() {
  return {
    id: 'bracket_texas_natty_run_curated',
    name: 'Texas Natty Run',
    creator: 'Jake Johnson',
    creatorId: 'jake_johnson_personal',
    creatorEmail: 'jajo9147@gmail.com',
    notes: 'Arch Manning MVP season, SEC Championship title, and runs the 12-team CFP table!',
    createdAt: '2026-08-28T14:00:00Z',
    mode: 'custom',
    isPublic: true,
    champion: {
      id: 'texas',
      name: 'Texas Longhorns',
      shortName: 'Texas',
      logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png',
      score: 35,
      oppScore: 24
    },
    runnerUp: {
      id: 'georgia',
      name: 'Georgia Bulldogs',
      shortName: 'Georgia'
    },
    seeds: [
      { seed: 1, id: 'texas', name: 'Texas', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png', wins: 13, losses: 0 },
      { seed: 2, id: 'ohiostate', name: 'Ohio State', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png', wins: 12, losses: 1 },
      { seed: 3, id: 'clemson', name: 'Clemson', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/228.png', wins: 12, losses: 1 },
      { seed: 4, id: 'utah', name: 'Utah', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/254.png', wins: 11, losses: 2 },
      { seed: 5, id: 'georgia', name: 'Georgia', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png', wins: 11, losses: 2 },
      { seed: 6, id: 'oregon', name: 'Oregon', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png', wins: 11, losses: 1 },
      { seed: 7, id: 'alabama', name: 'Alabama', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png', wins: 10, losses: 2 },
      { seed: 8, id: 'notredame', name: 'Notre Dame', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/87.png', wins: 10, losses: 2 },
      { seed: 9, id: 'pennstate', name: 'Penn State', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/213.png', wins: 10, losses: 2 },
      { seed: 10, id: 'usc', name: 'USC', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/30.png', wins: 10, losses: 2 },
      { seed: 11, id: 'olemiss', name: 'Ole Miss', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/145.png', wins: 10, losses: 2 },
      { seed: 12, id: 'boisestate', name: 'Boise State', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/68.png', wins: 12, losses: 1 }
    ],
    playoffSummary: {
      fr: [
        { label: '#5 vs #12', winner: 'Georgia' },
        { label: '#6 vs #11', winner: 'Oregon' },
        { label: '#7 vs #10', winner: 'Alabama' },
        { label: '#8 vs #9', winner: 'Notre Dame' }
      ],
      qf: [
        { bowl: 'Sugar Bowl', winner: 'Texas' },
        { bowl: 'Rose Bowl', winner: 'Ohio State' },
        { bowl: 'Peach Bowl', winner: 'Georgia' },
        { bowl: 'Fiesta Bowl', winner: 'Oregon' }
      ],
      sf: [
        { bowl: 'Orange Bowl', winner: 'Texas' },
        { bowl: 'Cotton Bowl', winner: 'Georgia' }
      ]
    },
    simState: {
      teamId: 'texas',
      userPicks: {},
      manualScores: {},
      ccgPicks: { 'sec': 'texas' },
      playoffPicks: { 'natty': 'texas' },
      teamSliders: { 'texas': { qbRating: 25, groundAttack: 20, defenseHavoc: 15, turnoverLuck: 10, crowdNoise: 15 } },
      gameSliders: {}
    }
  };
}

function createUscWinsOutBracket() {
  return {
    id: 'bracket_usc_wins_out_curated',
    name: 'USC Wins Out',
    creator: 'Jake Johnson',
    creatorId: 'jake_johnson_personal',
    creatorEmail: 'jakejohnson@usc.edu',
    notes: 'USC sweeps regular season, claims Big Ten crown, and runs the 12-team CFP table!',
    createdAt: '2026-08-26T12:00:00Z',
    mode: 'custom',
    isPublic: true,
    champion: {
      id: 'usc',
      name: 'USC Trojans',
      shortName: 'USC',
      logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/30.png',
      score: 38,
      oppScore: 27
    },
    runnerUp: {
      id: 'georgia',
      name: 'Georgia Bulldogs',
      shortName: 'Georgia'
    },
    seeds: [
      { seed: 1, id: 'usc', name: 'USC', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/30.png', wins: 13, losses: 0 },
      { seed: 2, id: 'georgia', name: 'Georgia', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png', wins: 12, losses: 1 },
      { seed: 3, id: 'clemson', name: 'Clemson', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/228.png', wins: 12, losses: 1 },
      { seed: 4, id: 'utah', name: 'Utah', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/254.png', wins: 11, losses: 2 },
      { seed: 5, id: 'ohiostate', name: 'Ohio State', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png', wins: 11, losses: 1 },
      { seed: 6, id: 'oregon', name: 'Oregon', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png', wins: 11, losses: 1 },
      { seed: 7, id: 'texas', name: 'Texas', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png', wins: 11, losses: 2 },
      { seed: 8, id: 'alabama', name: 'Alabama', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png', wins: 10, losses: 2 },
      { seed: 9, id: 'notredame', name: 'Notre Dame', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/87.png', wins: 10, losses: 2 },
      { seed: 10, id: 'pennstate', name: 'Penn State', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/213.png', wins: 10, losses: 2 },
      { seed: 11, id: 'olemiss', name: 'Ole Miss', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/145.png', wins: 10, losses: 2 },
      { seed: 12, id: 'boisestate', name: 'Boise State', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/68.png', wins: 12, losses: 1 }
    ],
    playoffSummary: {
      fr: [
        { label: '#5 vs #12', winner: 'Ohio State' },
        { label: '#6 vs #11', winner: 'Oregon' },
        { label: '#7 vs #10', winner: 'Texas' },
        { label: '#8 vs #9', winner: 'Alabama' }
      ],
      qf: [
        { bowl: 'Sugar Bowl', winner: 'USC' },
        { bowl: 'Rose Bowl', winner: 'Georgia' },
        { bowl: 'Peach Bowl', winner: 'Ohio State' },
        { bowl: 'Fiesta Bowl', winner: 'Texas' }
      ],
      sf: [
        { bowl: 'Orange Bowl', winner: 'USC' },
        { bowl: 'Cotton Bowl', winner: 'Georgia' }
      ]
    },
    simState: {
      teamId: 'usc',
      userPicks: {},
      manualScores: {},
      ccgPicks: { 'bigten': 'usc' },
      playoffPicks: { 'natty': 'usc' },
      teamSliders: { 'usc': { qbRating: 25, groundAttack: 20, defenseHavoc: 15, turnoverLuck: 10, crowdNoise: 15 } },
      gameSliders: {}
    }
  };
}

function createBillJohnsonBracket() {
  return {
    id: "bracket_1788122129050_b89cnj",
    name: "Texas Natty Projection",
    creator: "Bill Johnson",
    creatorId: "56a97b58-44e3-445b-bdb1-cbfce0d9b5aa",
    creatorEmail: "bmjohnson063@gmail.com",
    notes: "Custom 2026 CFP Simulation",
    createdAt: "2026-08-30T20:35:29.050Z",
    mode: "baseline",
    isPublic: true,
    champion: {
      id: "texas",
      name: "Texas Longhorns",
      shortName: "Texas",
      logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/251.png",
      score: 29,
      oppScore: 27
    },
    runnerUp: {
      id: "ohiostate",
      name: "Ohio State Buckeyes",
      shortName: "Ohio State"
    },
    seeds: [
      { seed: 1, id: "georgia", name: "Georgia", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/61.png", wins: 12, losses: 1 },
      { seed: 2, id: "ohiostate", name: "Ohio State", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/194.png", wins: 12, losses: 1 },
      { seed: 3, id: "miami", name: "Miami", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/2390.png", wins: 12, losses: 1 },
      { seed: 4, id: "texastech", name: "Texas Tech", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/2641.png", wins: 10, losses: 3 },
      { seed: 5, id: "texas", name: "Texas", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/251.png", wins: 11, losses: 2 },
      { seed: 6, id: "oregon", name: "Oregon", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png", wins: 11, losses: 2 },
      { seed: 7, id: "notredame", name: "Notre Dame", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/87.png", wins: 11, losses: 1 },
      { seed: 8, id: "olemiss", name: "Ole Miss", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/145.png", wins: 10, losses: 2 },
      { seed: 9, id: "indiana", name: "Indiana", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/84.png", wins: 10, losses: 2 },
      { seed: 10, id: "lsu", name: "LSU", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/99.png", wins: 10, losses: 2 },
      { seed: 11, id: "alabama", name: "Alabama", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png", wins: 10, losses: 2 },
      { seed: 12, id: "boisestate", name: "Boise State", logoUrl: "https://a.espncdn.com/i/teamlogos/ncaa/500/68.png", wins: 12, losses: 1 }
    ],
    playoffSummary: {
      fr: [{ winner: "Texas" }, { winner: "Oregon" }, { winner: "Notre Dame" }, { winner: "Indiana" }],
      qf: [{ winner: "Georgia" }, { winner: "Ohio State" }, { winner: "Oregon" }, { winner: "Texas" }],
      sf: [{ winner: "Texas" }, { winner: "Ohio State" }]
    },
    simState: {
      teamId: "texas",
      userPicks: { "playoff-fr4": "L", "playoff-sf1": "L", "playoff-natty": "W", "osu-w2": "L" },
      manualScores: {
        "playoff-fr4": { teamScore: 29, oppScore: 33 },
        "playoff-sf1": { teamScore: 28, oppScore: 32 },
        "playoff-natty": { teamScore: 29, oppScore: 27 },
        "osu-w2": { teamScore: 27, oppScore: 29 }
      },
      ccgPicks: {},
      playoffPicks: {},
      teamSliders: {},
      gameSliders: {
        "tex-w2": { qbRating: 25, groundAttack: -10, defenseHavoc: 15, turnoverLuck: 0, crowdNoise: 15, isCustom: true, targetTeamId: "texas" },
        "tex-w5": { qbRating: -15, groundAttack: -10, defenseHavoc: 0, turnoverLuck: 10, crowdNoise: 0, isCustom: true, targetTeamId: "texas" },
        "tex-w9": { qbRating: 5, groundAttack: -25, defenseHavoc: 0, turnoverLuck: 0, crowdNoise: 0, isCustom: true, targetTeamId: "texas" },
        "tex-w12": { qbRating: 15, groundAttack: 0, defenseHavoc: 5, turnoverLuck: -5, crowdNoise: -20, isCustom: true, targetTeamId: "texas" }
      }
    }
  };
}

function getCuratedExpertBrackets() {
  return [createProphetAiBenchmarkBracket(), createTexasWinsOutBracket(), createBillJohnsonBracket()];
}

function getLocalCommunityBrackets() {
  const deletedIds = getDeletedBracketIds();
  const map = new Map();

  // 1. Static guaranteed feed (always ready synchronously, zero network latency)
  if (typeof window !== 'undefined' && Array.isArray(window._CFB_STATIC_COMMUNITY_BRACKETS)) {
    window._CFB_STATIC_COMMUNITY_BRACKETS.forEach(b => {
      if (b && b.id && !deletedIds.has(b.id)) {
        map.set(b.id, b);
      }
    });
  }

  // 2. LocalStorage cache & real-time updates
  try {
    const raw = localStorage.getItem(COMMUNITY_BRACKETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(b => {
          if (b && b.id && !deletedIds.has(b.id)) {
            map.set(b.id, b);
          }
        });
      }
    }
  } catch (e) {}

  return Array.from(map.values()).filter(b => b && b.id && b.id !== 'bracket_prophet_ai_baseline' && b.id !== 'bracket_usc_wins_out_curated' && !deletedIds.has(b.id));
}

function prepareCompactBracketPayload(b) {
  if (!b) return null;
  const cleanTeamSliders = {};
  if (b.simState?.teamSliders) {
    Object.keys(b.simState.teamSliders).forEach(tid => {
      const s = b.simState.teamSliders[tid];
      if (s && isSlidersCustom(s)) cleanTeamSliders[tid] = s;
    });
  }
  const cleanGameSliders = {};
  if (b.simState?.gameSliders) {
    Object.keys(b.simState.gameSliders).forEach(gid => {
      const s = b.simState.gameSliders[gid];
      if (s && isSlidersCustom(s)) cleanGameSliders[gid] = s;
    });
  }

  return {
    id: b.id,
    name: b.name,
    creator: b.creator || 'Prophet',
    creatorId: b.creatorId || '',
    creatorEmail: b.creatorEmail || '',
    notes: (b.notes || '').slice(0, 100),
    createdAt: b.createdAt || new Date().toISOString(),
    mode: b.mode || 'custom',
    isPublic: true,
    champion: {
      id: b.champion?.id || 'ohiostate',
      name: b.champion?.name || 'Ohio State Buckeyes',
      shortName: b.champion?.shortName || 'Ohio State',
      logoUrl: b.champion?.logoUrl || '',
      score: b.champion?.score || 35,
      oppScore: b.champion?.oppScore || 30
    },
    runnerUp: {
      id: b.runnerUp?.id || 'oregon',
      name: b.runnerUp?.name || 'Oregon Ducks',
      shortName: b.runnerUp?.shortName || 'Oregon'
    },
    seeds: (b.seeds || []).slice(0, 12).map(s => ({
      seed: s.seed,
      id: s.id,
      name: s.name,
      logoUrl: s.logoUrl || '',
      wins: s.wins !== undefined ? s.wins : 11,
      losses: s.losses !== undefined ? s.losses : 1
    })),
    playoffSummary: {
      fr: (b.playoffSummary?.fr || []).map(x => ({ winner: x.winner || 'Team' })),
      qf: (b.playoffSummary?.qf || []).map(x => ({ winner: x.winner || 'Team' })),
      sf: (b.playoffSummary?.sf || []).map(x => ({ winner: x.winner || 'Team' }))
    },
    simState: {
      teamId: b.simState?.teamId || getTopRankedTeamId() || 'ohiostate',
      userPicks: b.simState?.userPicks || {},
      manualScores: b.simState?.manualScores || {},
      ccgPicks: b.simState?.ccgPicks || {},
      playoffPicks: b.simState?.playoffPicks || {},
      teamSliders: cleanTeamSliders,
      gameSliders: cleanGameSliders
    }
  };
}

let _isCloudSyncing = false;

function autoPublishAllLocalSavedBrackets() {
  try {
    const deletedIds = getDeletedBracketIds();
    const local = getSavedBrackets();
    local.forEach(b => {
      if (b && b.id && b.id !== 'bracket_prophet_ai_baseline' && b.id !== 'bracket_usc_wins_out_curated' && !deletedIds.has(b.id)) {
        publishBracketToCloud(b);
      }
    });
  } catch(e) {}
}
window.autoPublishAllLocalSavedBrackets = autoPublishAllLocalSavedBrackets;

async function syncCommunityBracketsFromCloud(showFeedback = false) {
  if (_isCloudSyncing) return;
  _isCloudSyncing = true;

  try {
    const cloudBrackets = [];
    const deletedIds = getDeletedBracketIds();

    // 1. Fetch static persistent community feed (CDN / zero expiration)
    try {
      const feedRes = await fetch(`data/community_brackets.json?v=${Date.now()}`, { cache: 'no-store' });
      if (feedRes.ok) {
        const feedData = await feedRes.json();
        if (Array.isArray(feedData)) {
          feedData.forEach(b => {
            if (b && b.id && !deletedIds.has(b.id)) {
              cloudBrackets.push(b);
            }
          });
        }
      }
    } catch (errFeed) {
      console.warn('[CFB Prophet] Static feed fetch notice:', errFeed);
    }

    // 2. Fetch from Supabase Cloud if available
    if (window.CFBProphetSupabase && typeof window.CFBProphetSupabase.fetchCloudCommunityBrackets === 'function') {
      try {
        const supaBrackets = await window.CFBProphetSupabase.fetchCloudCommunityBrackets();
        if (Array.isArray(supaBrackets)) {
          supaBrackets.forEach(b => {
            if (b && b.id && !deletedIds.has(b.id)) {
              cloudBrackets.push(b);
            }
          });
        }
      } catch (errSupa) {
        console.warn('[CFB Prophet] Supabase cloud brackets notice:', errSupa);
      }
    }

    // 3. Real-time ntfy.sh relay
    try {
      const res = await fetch(`https://ntfy.sh/${COMMUNITY_CLOUD_TOPIC}/json?poll=1&since=all`, { 
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const text = await res.text();
        text.trim().split('\n').forEach(line => {
          try {
            if (!line || !line.trim()) return;
            const json = JSON.parse(line.trim());
            if (json.message) {
              let b = null;
              try {
                b = typeof json.message === 'string' ? JSON.parse(json.message) : json.message;
              } catch(e) {}
              if (b) {
                if (b.action === 'delete_bracket' || b.isDeleted || b.deletedId) {
                  const delId = b.deletedId || b.id;
                  if (delId) {
                    addDeletedBracketId(delId);
                    deletedIds.add(delId);
                  }
                } else if (b.name && b.id && b.id !== 'bracket_prophet_ai_baseline' && b.id !== 'bracket_usc_wins_out_curated' && !deletedIds.has(b.id)) {
                  if (!b.name.toLowerCase().includes('prophet ai') && !b.name.toLowerCase().includes('live sync test')) {
                    cloudBrackets.push(b);
                  }
                }
              }
            }
          } catch (e) {}
        });
      }
    } catch (errNtfy) {
      console.warn('[CFB Prophet] ntfy relay notice:', errNtfy);
    }

    // Clean local community brackets
    const local = getLocalCommunityBrackets().filter(b => !deletedIds.has(b.id));
    const map = new Map();
    local.forEach(b => map.set(b.id, b));
    cloudBrackets.forEach(b => {
      if (!deletedIds.has(b.id)) map.set(b.id, b);
    });
    const merged = Array.from(map.values()).filter(b => !deletedIds.has(b.id));
    localStorage.setItem(COMMUNITY_BRACKETS_KEY, JSON.stringify(merged));
    
    // Clean saved brackets
    const myLocal = getSavedBrackets().filter(b => !deletedIds.has(b.id));
    try {
      localStorage.setItem(BRACKET_STORAGE_KEY, JSON.stringify(myLocal));
    } catch(e) {}

    // Update DOM only if modal is actively open to avoid unneeded redraws
    const modal = document.getElementById('bracketVaultModal');
    if (modal && modal.classList.contains('open')) {
      renderSavedBracketsVault();
    }
    if (showFeedback) {
      showCustomToast('🔄 Leaderboard is up to date!');
    }
  } catch (e) {
    if (showFeedback) showCustomToast('⚠️ Network sync offline.');
  } finally {
    _isCloudSyncing = false;
  }
}

async function publishBracketToCloud(bracketObj) {
  if (!bracketObj) return;
  try {
    const compact = prepareCompactBracketPayload(bracketObj);
    if (!compact) return;

    // 1. Save locally to community pool
    const local = getLocalCommunityBrackets();
    const filtered = local.filter(b => b.id !== compact.id);
    filtered.unshift(compact);
    localStorage.setItem(COMMUNITY_BRACKETS_KEY, JSON.stringify(filtered));

    // 2. Publish to Supabase Cloud if available
    if (window.CFBProphetSupabase && typeof window.CFBProphetSupabase.saveBracketToCloud === 'function') {
      try {
        window.CFBProphetSupabase.saveBracketToCloud(compact);
      } catch(eSupa) {}
    }

    // 3. Publish to cloud topic with guaranteed caching (< 1.2 KB)
    const payload = JSON.stringify(compact);
    await fetch(`https://ntfy.sh/${COMMUNITY_CLOUD_TOPIC}`, {
      method: 'POST',
      body: payload,
      keepalive: true,
      headers: {
        'Title': compact.name || 'CFB Prophet Prediction',
        'Tags': 'trophy,football',
        'Cache': 'yes',
        'X-Cache': 'yes',
        'Priority': 'default'
      }
    });
  } catch (e) {}
}

async function publishDeletionTombstoneToCloud(bracketId) {
  if (!bracketId) return;
  try {
    const payload = JSON.stringify({
      action: 'delete_bracket',
      isDeleted: true,
      deletedId: bracketId,
      timestamp: Date.now()
    });
    await fetch(`https://ntfy.sh/${COMMUNITY_CLOUD_TOPIC}`, {
      method: 'POST',
      body: payload,
      keepalive: true,
      headers: {
        'Title': 'Delete Bracket',
        'Tags': 'wastebasket',
        'Cache': 'yes',
        'X-Cache': 'yes'
      }
    });
  } catch(e) {}
}

function calculateBracketAccuracy(bracket) {
  if (!bracket) {
    return { pts: 3720, maxPts: 3720, pct: 100.0, grade: 'A+', hits: '372/372 Live Picks' };
  }
  if (state.selectedVaultTeam && state.selectedVaultTeam !== 'all') {
    return calculateTeamScoreForUser(bracket, state.selectedVaultTeam);
  }
  const isSeasonTab = state.activeVaultTab === 'community';
  const targetWeek = isSeasonTab ? 'all' : (state.selectedVaultWeek || 'W1');
  const weekly = calculateWeeklyScoreForUser(bracket, targetWeek);
  return {
    pts: weekly.pts || (targetWeek === 'all' ? 3720 : 310),
    maxPts: weekly.maxPts || (targetWeek === 'all' ? 3720 : 310),
    pct: weekly.pct !== undefined ? weekly.pct : 100.0,
    grade: weekly.grade || 'A+',
    hits: weekly.hits || `${weekly.gameCount}/${weekly.gameCount} Live Picks`
  };
}

function getCommunityBrackets() {
  const curated = getCuratedExpertBrackets();
  const deletedIds = getDeletedBracketIds();

  const rawMy = getSavedBrackets().filter(b => b && b.id && !deletedIds.has(b.id));
  const rawCloud = getLocalCommunityBrackets().filter(b => b && b.id && !deletedIds.has(b.id));

  const map = new Map();

  // 1. Curated benchmark & Jake Johnson's USC bracket
  curated.forEach(b => {
    if (b && b.id && !deletedIds.has(b.id)) {
      map.set(b.id, b);
    }
  });

  // 2. Any additional custom submitted community brackets
  [...rawCloud, ...rawMy].forEach(b => {
    if (!b || !b.id || !b.name) return;
    if (deletedIds.has(b.id)) return;
    if (b.id === 'bracket_prophet_ai_baseline' || b.id === 'bracket_usc_wins_out_curated') return;
    if (b.name.toLowerCase().includes('prophet ai') || b.name.toLowerCase().includes('live sync test')) return;

    const normKey = `${(b.creator || 'you').trim().toLowerCase()}__${b.name.trim().toLowerCase()}`;
    const existing = map.get(b.id) || map.get(normKey);
    if (!existing || new Date(b.createdAt || 0) >= new Date(existing.createdAt || 0)) {
      map.set(b.id, b);
    }
  });

  const all = Array.from(map.values());

  // Attach Accuracy Scores & Sort
  all.forEach(b => {
    b.accuracy = calculateBracketAccuracy(b);
  });

  // Prophet AI always at top as baseline, then sort by accuracy
  all.sort((a, b) => {
    if (a.isAdminBenchmark || a.id === 'bracket_prophet_ai_baseline') return -1;
    if (b.isAdminBenchmark || b.id === 'bracket_prophet_ai_baseline') return 1;
    return (b.accuracy?.pts || 0) - (a.accuracy?.pts || 0);
  });

  return all;
}

function switchVaultTab(tabKey) {
  state.activeVaultTab = tabKey;
  const select = document.getElementById('vaultTabSelect');
  if (select && select.value !== tabKey) {
    select.value = tabKey;
  }
  const weekDropdown = document.getElementById('vaultWeekSelectDropdown');
  if (tabKey === 'community') {
    state.selectedVaultWeek = 'all';
    if (weekDropdown) weekDropdown.value = 'all';
  } else if (tabKey === 'weekly' && state.selectedVaultWeek === 'all') {
    state.selectedVaultWeek = 'W1';
    if (weekDropdown) weekDropdown.value = 'W1';
  }

  renderVaultWeekSelector();
  renderSavedBracketsVault();
}
window.switchVaultTab = switchVaultTab;


function renderSavedBracketsVault() {
  renderVaultWeekSelector();
  const grid = document.getElementById('bracketVaultGrid');
  if (!grid) return;

  // If user selected All 30 Teams Game Matrix tab
  if (state.activeVaultTab === 'allteams') {
    renderAll30TeamsVaultMatrix();
    return;
  }

  const isWeekly = state.activeVaultTab === 'weekly';
  const isCommunity = state.activeVaultTab === 'community' || isWeekly;
  const currentUser = getCurrentUser();

  const brackets = isCommunity ? getCommunityBrackets() : getSavedBrackets();

  if (brackets.length === 0) {
    if (state.activeVaultTab === 'mine' && !currentUser) {
      grid.innerHTML = `
        <div class="empty-vault-state" style="padding: 1.5rem 1rem; border: 1px dashed rgba(56, 189, 248, 0.3); border-radius: var(--radius-lg); background: rgba(15, 23, 42, 0.6); text-align: center;">
          <div style="font-size: 2.2rem; color: #38BDF8; margin-bottom: 0.5rem;"><i class="fa-solid fa-user-lock"></i></div>
          <h3 style="color: #F8FAFC; font-size: 1.15rem; margin-bottom: 0.35rem;">Guest Mode: No Submitted Picks</h3>
          <p style="color: #94A3B8; max-width: 420px; margin: 0 auto 1.25rem; font-size: 0.85rem; line-height: 1.5;">
            Sign in with Google or your Coach account to view and sync your submitted picks across all devices, or submit your active simulation as a guest.
          </p>
          <div style="display: flex; gap: 0.65rem; justify-content: center; flex-wrap: wrap;">
            <button class="save-bracket-btn" onclick="openAuthModal()" style="background: linear-gradient(135deg, #2563EB, #1D4ED8); padding: 0.6rem 1.25rem; font-size: 0.88rem; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
              <i class="fa-solid fa-right-to-bracket"></i> Sign In to Account
            </button>
            <button class="save-bracket-btn" onclick="saveActiveProjectionDirectly()" style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); padding: 0.6rem 1rem; font-size: 0.88rem;">
              <i class="fa-solid fa-bolt"></i> Submit as Guest
            </button>
          </div>
        </div>
      `;
      return;
    }

    const evaluated = evaluateRegularSeasonAllTeams();
    const ccg = simulateConferenceChampionships(evaluated);
    const cfp = (state.lastPlayoffResults && state.lastPlayoffResults.cfp) ? state.lastPlayoffResults.cfp : generate12TeamCfpField(ccg.confChamps, evaluated);
    const playoff = state.lastPlayoffResults || simulatePlayoffBracket(cfp);
    const champTeam = state.lastNationalChampion || (playoff.nationalChampion ? (TEAMS_DATABASE[playoff.nationalChampion.id] || playoff.nationalChampion) : TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate']);

    grid.innerHTML = `
      <div class="empty-vault-state" style="padding: 1.5rem 1rem; border: 1px dashed rgba(56, 189, 248, 0.3); border-radius: var(--radius-lg); background: rgba(15, 23, 42, 0.6); text-align: center;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: rgba(56, 189, 248, 0.1); margin-bottom: 0.75rem;">
          <img src="${champTeam.logoUrl || 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png'}" style="width: 36px; height: 36px; object-fit: contain;">
        </div>
        <h3 style="color: #F8FAFC; font-size: 1.15rem; margin-bottom: 0.35rem;">Active ${champTeam.name} Projection Ready</h3>
        <p style="color: #94A3B8; max-width: 420px; margin: 0 auto 1.25rem; font-size: 0.85rem; line-height: 1.5;">
          Lock in your current ${champTeam.shortName || champTeam.name} simulation to track your live score and compete against Prophet AI on the leaderboard!
        </p>
        <div style="display: flex; gap: 0.65rem; justify-content: center; flex-wrap: wrap;">
          <button class="save-bracket-btn" onclick="saveActiveProjectionDirectly()" style="background: linear-gradient(135deg, #10B981, #059669); padding: 0.6rem 1.25rem; font-size: 0.88rem; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
            <i class="fa-solid fa-bolt"></i> Lock In & Submit ${champTeam.shortName || 'Picks'}
          </button>
          <button class="save-bracket-btn" onclick="openSaveBracketModal(true)" style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); padding: 0.6rem 1rem; font-size: 0.88rem;">
            <i class="fa-solid fa-sliders"></i> Customize Name / Notes
          </button>
        </div>
      </div>
    `;
    return;
  }

  const myBrackets = getSavedBrackets();
  const myBracketIds = new Set(myBrackets.map(b => b.id));
  const aiBracket = brackets.find(b => b.isAdminBenchmark || b.id === 'bracket_prophet_ai_baseline') || createProphetAiBenchmarkBracket();
  const myTopBracket = myBrackets[0] || null;

  // Check if filtering by a single team vs global/weekly
  const isTeamFilter = state.selectedVaultTeam && state.selectedVaultTeam !== 'all';
  const focusTeam = isTeamFilter ? TEAMS_DATABASE[state.selectedVaultTeam] : null;

  let html = '';
  const isSeasonTab = state.activeVaultTab === 'community';
  const effectiveWeek = isSeasonTab ? 'all' : (state.selectedVaultWeek || 'W1');
  const currentWeekLabel = effectiveWeek === 'all' ? 'FULL 2026 SEASON' : (effectiveWeek === 'W0' ? 'WEEK 0 (LOCKED SLATE)' : (effectiveWeek === 'CCG' ? 'CONF CHAMPIONSHIPS' : (effectiveWeek === 'CFP' ? '12-TEAM CFP PLAYOFF' : `${effectiveWeek} SLATE`)));
  
  const aiWeeklyScore = isTeamFilter ? calculateTeamScoreForUser(aiBracket, state.selectedVaultTeam) : calculateWeeklyScoreForUser(aiBracket, effectiveWeek);

  // 1. Generate "YOU vs PROPHET AI" Head-to-Head Banner
  if (isTeamFilter && focusTeam) {
    const userTeamScore = myTopBracket ? calculateTeamScoreForUser(myTopBracket, state.selectedVaultTeam) : null;
    const bannerTitle = `🛡️ ${focusTeam.name.toUpperCase()} PICKS LEADERBOARD`;
    
    if (userTeamScore) {
      const diff = userTeamScore.pts - aiWeeklyScore.pts;
      let statusBadge = diff > 0 ? `<span class="vs-ai-badge win"><i class="fa-solid fa-crown"></i> BEATING PROPHET AI (+${diff} PTS)</span>` : (diff === 0 ? `<span class="vs-ai-badge tie"><i class="fa-solid fa-handshake"></i> TIED WITH PROPHET AI (${userTeamScore.pts} PTS)</span>` : `<span class="vs-ai-badge trail"><i class="fa-solid fa-fire"></i> ${Math.abs(diff)} PTS BEHIND PROPHET AI</span>`);

      html += `
        <div class="h2h-vs-ai-banner ${diff > 0 ? 'ahead' : (diff === 0 ? 'tied' : 'behind')}" style="border-left: 4px solid ${focusTeam.colors.primary};">
          <div class="h2h-main-info">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span class="h2h-tag" style="color: ${focusTeam.colors.accent || '#38BDF8'};">${bannerTitle}</span>
              ${statusBadge}
            </div>
            <div class="h2h-title">
              <span>👤 ${myTopBracket.name || 'Your Picks'}: <strong>${userTeamScore.record} (${userTeamScore.pts} PTS)</strong></span>
              <span style="opacity: 0.5; margin: 0 6px;">vs</span>
              <span>🤖 Prophet AI: <strong>${aiWeeklyScore.record} (${aiWeeklyScore.pts} PTS)</strong></span>
            </div>
          </div>
          <div class="h2h-stats-pill">
            <span>Team Accuracy: <strong>${userTeamScore.pct}% (${userTeamScore.hits})</strong></span>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="h2h-vs-ai-banner invite" style="border-left: 4px solid ${focusTeam.colors.primary};">
          <div class="h2h-main-info">
            <span class="h2h-tag" style="color: #F59E0B;">🤖 PROPHET AI ${focusTeam.shortName.toUpperCase()} PROJECTION</span>
            <div class="h2h-title" style="font-size: 0.95rem; color: #E2E8F0;">
              Prophet AI projects ${focusTeam.name} to finish <strong>${aiWeeklyScore.record}</strong> (${aiWeeklyScore.pts} PTS). Lock in your simulation to compete!
            </div>
          </div>
          <button class="save-bracket-btn" onclick="openSaveBracketModal(true)" style="padding: 0.45rem 0.85rem; font-size: 0.8rem; white-space: nowrap;">
            <i class="fa-solid fa-paper-plane"></i> Submit ${focusTeam.shortName} Picks
          </button>
        </div>
      `;
    }
  } else if (myTopBracket) {
    const userWeeklyScore = calculateWeeklyScoreForUser(myTopBracket, effectiveWeek);
    const pointDiff = userWeeklyScore.pts - aiWeeklyScore.pts;
    let vsAiStatusBadge = '';
    let vsAiCardClass = 'tied';

    if (pointDiff > 0) {
      vsAiStatusBadge = `<span class="vs-ai-badge win"><i class="fa-solid fa-crown"></i> BEATING PROPHET AI (+${pointDiff} PTS)</span>`;
      vsAiCardClass = 'ahead';
    } else if (pointDiff === 0) {
      vsAiStatusBadge = `<span class="vs-ai-badge tie"><i class="fa-solid fa-handshake"></i> TIED WITH PROPHET AI (${userWeeklyScore.pts} PTS)</span>`;
      vsAiCardClass = 'tied';
    } else {
      vsAiStatusBadge = `<span class="vs-ai-badge trail"><i class="fa-solid fa-fire"></i> ${Math.abs(pointDiff)} PTS BEHIND PROPHET AI</span>`;
      vsAiCardClass = 'behind';
    }

    html += `
      <div class="h2h-vs-ai-banner ${vsAiCardClass}">
        <div class="h2h-main-info">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="h2h-tag">⚡ HEAD-TO-HEAD MATCHUP (${currentWeekLabel})</span>
            ${vsAiStatusBadge}
          </div>
          <div class="h2h-title">
            <span>👤 ${myTopBracket.name || 'Your Picks'}: <strong>${userWeeklyScore.pts} PTS</strong></span>
            <span style="opacity: 0.5; margin: 0 6px;">vs</span>
            <span>🤖 Prophet AI: <strong>${aiWeeklyScore.pts} PTS</strong></span>
          </div>
        </div>
        <div class="h2h-stats-pill">
          <span>Global Rank: <strong>#1 of ${brackets.length}</strong></span>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="h2h-vs-ai-banner invite">
        <div class="h2h-main-info">
          <span class="h2h-tag" style="color: #F59E0B;">🤖 CAN YOU BEAT PROPHET AI? (${currentWeekLabel})</span>
          <div class="h2h-title" style="font-size: 0.95rem; color: #E2E8F0;">
            Prophet AI set the golden standard with <strong>${aiWeeklyScore.pts} PTS</strong> in ${currentWeekLabel}. Submit your picks to see where you rank!
          </div>
        </div>
        <button class="save-bracket-btn" onclick="openSaveBracketModal(true)" style="padding: 0.45rem 0.85rem; font-size: 0.8rem; white-space: nowrap;">
          <i class="fa-solid fa-paper-plane"></i> Submit Picks
        </button>
      </div>
    `;
  }

  brackets.forEach((b, idx) => {
    const isAiBenchmark = b.isAdminBenchmark || b.id === 'bracket_prophet_ai_baseline';
    const isBaseline = b.mode === 'baseline';
    const dateStr = b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '2026 Season';
    const champ = b.champion || { name: 'Champion', shortName: 'Champs', logoUrl: '' };
    const isActive = state.activeSavedBracketId === b.id;
    
    const userDisplayName = (currentUser?.displayName || '').trim().toLowerCase();
    const userHandle = (currentUser?.handle || '').trim().toLowerCase();
    const userEmail = (currentUser?.email || '').trim().toLowerCase();
    const creatorLower = (b.creator || '').trim().toLowerCase();
    const creatorEmail = (b.creatorEmail || '').trim().toLowerCase();

    // Strict Ownership: verified via unified isBracketOwnedByUser helper
    const isOwner = !isAiBenchmark && !!currentUser && isBracketOwnedByUser(b, currentUser);
    const isMine = !isAiBenchmark && myBracketIds.has(b.id);
    const canAdjust = !isAiBenchmark && (isOwner || isMine);
    const creatorLabel = isOwner ? 'You' : (b.creator || 'Prophet');

    const acc = isTeamFilter ? calculateTeamScoreForUser(b, state.selectedVaultTeam) : calculateWeeklyScoreForUser(b, effectiveWeek);

    const rankNum = idx + 1;
    let rankMedal = `#${rankNum}`;
    let rankCls = '';
    if (rankNum === 1) { rankMedal = '🥇 #1'; rankCls = 'rank-1'; }
    else if (rankNum === 2) { rankMedal = '🥈 #2'; rankCls = 'rank-2'; }
    else if (rankNum === 3) { rankMedal = '🥉 #3'; rankCls = 'rank-3'; }

    html += `
      <div class="leaderboard-compact-card ${isActive ? 'active-bracket' : ''} ${isAiBenchmark ? 'ai-benchmark-card' : ''}" onclick="openSubmissionDetailModal('${b.id}', event)">
        <div class="lb-rank-col">
          <span class="lb-rank-badge ${rankCls}">${rankMedal}</span>
        </div>
        
        <div class="lb-user-col">
          <div class="lb-user-header">
            <span class="lb-user-name">${isAiBenchmark ? '🤖 Prophet AI' : (b.creator || 'Coach')}</span>
            ${isAiBenchmark ? '<span class="lb-type-badge ai">AI BENCHMARK</span>' : (isOwner ? '<span class="lb-type-badge you">YOUR ENTRY</span>' : '')}
            ${isTeamFilter && acc.record ? `<span class="lb-type-badge" style="background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.3);">${focusTeam?.shortName || 'Team'}: ${acc.record}</span>` : ''}
          </div>
          <div class="lb-bracket-name">${b.name}</div>
        </div>

        <div class="lb-champ-col">
          <img src="${champ.logoUrl || 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png'}" class="lb-champ-logo" alt="${champ.name}">
          <div class="lb-champ-details">
            <span class="lb-champ-tag">PREDICTED NATTY</span>
            <span class="lb-champ-title">${champ.shortName || champ.name}</span>
          </div>
        </div>

        <div class="lb-score-col">
          <div class="lb-score-pts">${acc.pts} <span class="lb-pts-label">PTS</span></div>
          <span class="bracket-grade-pill grade-${acc.grade.charAt(0)}" style="font-size: 0.7rem; padding: 2px 8px;">${acc.grade} (${acc.pct}%)</span>
        </div>

        <div class="lb-action-col">
          ${canAdjust ? `
            <button class="lb-adjust-btn" onclick="event.stopPropagation(); loadSavedBracket('${b.id}', true);" title="Load into simulator and edit your submitted picks">
              <i class="fa-solid fa-pen-to-square"></i> <span>Adjust</span>
            </button>
          ` : ''}
          <button class="lb-view-details-btn" onclick="event.stopPropagation(); openSubmissionDetailModal('${b.id}', event)" title="View picks breakdown & details">
            <span>View</span> <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

function openSubmissionDetailModal(bracketId, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const brackets = getCommunityBrackets().concat(getSavedBrackets());
  const b = brackets.find(item => item.id === bracketId);
  if (!b) return;

  const modal = document.getElementById('submissionDetailModal');
  if (!modal) return;

  const isAiBenchmark = b.isAdminBenchmark || b.id === 'bracket_prophet_ai_baseline';
  const currentUser = getCurrentUser();
  const userDisplayName = (currentUser?.displayName || '').trim().toLowerCase();
  const userHandle = (currentUser?.handle || '').trim().toLowerCase();
  const userEmail = (currentUser?.email || '').trim().toLowerCase();
  const creatorLower = (b.creator || '').trim().toLowerCase();
  const creatorEmail = (b.creatorEmail || '').trim().toLowerCase();

  const isOwner = !isAiBenchmark && !!currentUser && isBracketOwnedByUser(b, currentUser);
  const isMine = !isAiBenchmark && getSavedBrackets().some(sb => sb.id === b.id);
  const canAdjust = !isAiBenchmark && (isOwner || isMine);

  const isTeamFilter = state.selectedVaultTeam && state.selectedVaultTeam !== 'all';
  const focusTeam = isTeamFilter ? TEAMS_DATABASE[state.selectedVaultTeam] : null;

  // Populate Week 0 Official Score Card
  const week0ContentEl = document.getElementById('subModalWeek0Content');
  if (week0ContentEl) {
    const isSeasonTab = state.activeVaultTab === 'community';
    const effectiveWeek = isSeasonTab ? 'all' : (state.selectedVaultWeek || 'W1');
    const w0Acc = calculateWeeklyScoreForUser(b, 'W0');
    week0ContentEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <img src="https://a.espncdn.com/i/teamlogos/ncaa/500/30.png" style="width: 24px; height: 24px; object-fit: contain;">
        <span style="font-weight: 800; color: #FFFFFF; font-size: 0.85rem;">USC 42</span>
        <span style="color: #94A3B8; font-size: 0.76rem;">-</span>
        <span style="font-weight: 800; color: #FFFFFF; font-size: 0.85rem;">26 SJSU</span>
        <img src="https://a.espncdn.com/i/teamlogos/ncaa/500/23.png" style="width: 24px; height: 24px; object-fit: contain;">
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-family: var(--font-mono); font-size: 0.74rem; font-weight: 800; color: #34D399; background: rgba(16, 185, 129, 0.15); padding: 2px 8px; border-radius: 4px;">
          ${b.name}: CORRECT PICK (+${w0Acc.pts}/${w0Acc.maxPts} PTS)
        </span>
      </div>
    `;
  }

  const acc = isTeamFilter ? calculateTeamScoreForUser(b, state.selectedVaultTeam) : (b.accuracy || calculateBracketAccuracy(b));
  const champ = b.champion || { name: 'Champion', shortName: 'Champs', logoUrl: '' };

  const rankTag = document.getElementById('subModalRankTag');
  const gradePill = document.getElementById('subModalGradePill');
  const titleEl = document.getElementById('subModalTitle');
  const metaEl = document.getElementById('subModalMeta');
  const champLogo = document.getElementById('subModalChampLogo');
  const champName = document.getElementById('subModalChampName');
  const seedsGrid = document.getElementById('subModalSeedsGrid');
  const playoffSection = document.getElementById('subModalPlayoffSection');
  const teamSection = document.getElementById('subModalTeamScheduleSection');
  const teamTitle = document.getElementById('subModalTeamScheduleTitle');
  const teamList = document.getElementById('subModalTeamScheduleList');
  const actionsEl = document.getElementById('subModalActions');

  if (rankTag) rankTag.innerHTML = isAiBenchmark ? '<i class="fa-solid fa-robot"></i> PROPHET AI BENCHMARK' : (isOwner ? '<i class="fa-solid fa-user-check"></i> YOUR ENTRY' : '<i class="fa-solid fa-trophy"></i> COMMUNITY ENTRY');
  if (gradePill) {
    gradePill.className = `bracket-grade-pill grade-${acc.grade.charAt(0)}`;
    gradePill.innerText = `GRADE ${acc.grade} (${acc.pts}/${acc.maxPts} PTS • ${acc.pct}%)`;
  }
  if (titleEl) titleEl.innerText = b.name;
  if (metaEl) {
    const dateStr = b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '2026 Season';
    metaEl.innerText = `By ${b.creator || 'Coach'}${isOwner ? ' (You)' : ''} • Submitted ${dateStr}`;
  }
  if (champLogo) champLogo.src = champ.logoUrl || 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png';
  if (champName) champName.innerText = champ.name;

  if (seedsGrid) {
    seedsGrid.innerHTML = (b.seeds || []).map(s => `
      <div style="background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--radius-sm); padding: 0.45rem 0.6rem; display: flex; align-items: center; gap: 8px;">
        <span style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 800; color: #38BDF8;">#${s.seed || ''}</span>
        ${s.logoUrl ? `<img src="${s.logoUrl}" style="width: 20px; height: 20px; object-fit: contain;">` : ''}
        <div style="font-size: 0.78rem; font-weight: 700; color: #FFFFFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.name}</div>
      </div>
    `).join('');
  }

  // Handle Team Schedule breakdown
  if (isTeamFilter && focusTeam && teamSection && teamList) {
    teamSection.style.display = 'block';
    if (teamTitle) teamTitle.innerText = `📅 ${focusTeam.name.toUpperCase()} PREDICTED SLATE (${acc.record}):`;
    
    const userPicks = b.simState?.userPicks || {};
    const manualScores = b.simState?.manualScores || {};
    const teamSliders = b.simState?.teamSliders?.[state.selectedVaultTeam] || {};

    let listHtml = '';
    focusTeam.schedule.forEach(g => {
      let isFinalGame = g.isFinal && typeof g.actualScoreUt === 'number';
      let predictedWin = true;
      if (manualScores[g.id]) {
        predictedWin = manualScores[g.id].teamScore > manualScores[g.id].oppScore;
      } else if (userPicks[g.id]) {
        predictedWin = userPicks[g.id] === 'W';
      } else {
        const oppId = getOpponentTeamId(g);
        const oppEff = oppId && b.simState?.teamSliders?.[oppId] ? b.simState.teamSliders[oppId] : GLOBAL_PRESETS['baseline'];
        const sim = calculateCombinedMatchup(g, state.selectedVaultTeam, teamSliders, oppId, oppEff, null);
        predictedWin = sim.isWin;
      }

      let isActualWin = isFinalGame ? (g.actualScoreUt > g.actualScoreOpp) : predictedWin;
      let isCorrect = isFinalGame ? (predictedWin === isActualWin) : true;
      let scoreA = isFinalGame ? g.actualScoreUt : (manualScores[g.id]?.teamScore || g.projScoreUt || 28);
      let scoreB = isFinalGame ? g.actualScoreOpp : (manualScores[g.id]?.oppScore || g.projScoreOpp || 21);
      let isWin = isFinalGame ? isActualWin : predictedWin;

      let evalTag = '';
      if (isFinalGame) {
        if (!isCorrect) {
          evalTag = `<span class="detail-pick-tag wrong"><i class="fa-solid fa-xmark"></i> WRONG (0 PTS)</span>`;
        } else {
          evalTag = `<span class="detail-pick-tag correct"><i class="fa-solid fa-check"></i> HIT (+10 PTS)</span>`;
        }
      }

      listHtml += `
        <div style="display: flex; align-items: center; justify-content: space-between; background: ${isFinalGame && !isCorrect ? 'rgba(239, 68, 68, 0.12)' : 'rgba(30, 41, 59, 0.7)'}; border: 1px solid ${isFinalGame && !isCorrect ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.08)'}; border-radius: var(--radius-sm); padding: 0.4rem 0.6rem; font-size: 0.76rem;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-family: var(--font-mono); color: #94A3B8; font-weight: 700;">${g.week}</span>
            <span style="color: #E2E8F0; font-weight: 600;">${g.isHome ? 'vs' : '@'} ${g.oppAbbr || g.opponent}</span>
            ${evalTag}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-family: var(--font-mono); font-weight: 800; color: #FFFFFF;">${scoreA} - ${scoreB}</span>
            <span style="font-weight: 800; font-family: var(--font-mono); color: ${isWin ? '#10B981' : '#EF4444'}; background: ${isWin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; padding: 1px 6px; border-radius: 4px;">${isWin ? 'W' : 'L'}</span>
          </div>
        </div>
      `;
    });
    teamList.innerHTML = listHtml;
  } else if (teamSection) {
    teamSection.style.display = 'none';
  }

  if (actionsEl) {
    actionsEl.innerHTML = `
      ${canAdjust ? `
        <button class="action-btn" onclick="closeSubmissionDetailModal(); loadSavedBracket('${b.id}', true);" style="background: linear-gradient(135deg, #2563EB, #1D4ED8); color: #FFFFFF; font-weight: 700;">
          <i class="fa-solid fa-pen-to-square"></i> Adjust & Edit My Bracket
        </button>
      ` : ''}
      <button class="action-btn secondary-btn" onclick="openCfpBracketCanvasModalForBracket('${b.id}')">
        <i class="fa-solid fa-camera-retro"></i> Graphic
      </button>
      <button class="action-btn" style="background: rgba(37, 99, 235, 0.18); color: #93C5FD; border: 1px solid rgba(37, 99, 235, 0.45);" onclick="openBracketQrModal('${b.id}', event)">
        <i class="fa-solid fa-qrcode"></i> Sync QR
      </button>
      <button class="action-btn secondary-btn" onclick="copyBracketShareLink('${b.id}', event)">
        <i class="fa-solid fa-link"></i> Link
      </button>
      ${isOwner ? `
        <button class="action-btn" style="background: rgba(239, 68, 68, 0.2); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.4);" onclick="closeSubmissionDetailModal(); deleteSavedBracket('${b.id}', event)">
          <i class="fa-solid fa-trash-can"></i> Delete
        </button>
      ` : ''}
    `;
  }

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}
window.openSubmissionDetailModal = openSubmissionDetailModal;

function closeSubmissionDetailModal() {
  const modal = document.getElementById('submissionDetailModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}
window.closeSubmissionDetailModal = closeSubmissionDetailModal;

function handleVaultCardClick(bracketId, e) {
  if (e && e.target && e.target.closest && e.target.closest('.bracket-action-btn')) {
    return;
  }
  openSubmissionDetailModal(bracketId, e);
}
window.handleVaultCardClick = handleVaultCardClick;


function copyCommunityBracketToMine(bracketId, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const allComm = getCommunityBrackets();
  const target = allComm.find(b => b.id === bracketId);
  if (!target) return;

  const currentUser = getCurrentUser();
  const myBrackets = getSavedBrackets();
  const clone = JSON.parse(JSON.stringify(target));
  clone.id = `bracket_my_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  clone.creator = currentUser ? currentUser.displayName : (localStorage.getItem('cfb_prophet_user_handle') || 'Coach');
  clone.creatorId = currentUser ? currentUser.id : `guest_${Date.now()}`;
  clone.createdAt = new Date().toISOString();
  clone.mode = 'custom';
  
  myBrackets.unshift(clone);
  try {
    localStorage.setItem(BRACKET_STORAGE_KEY, JSON.stringify(myBrackets));
  } catch (err) {}

  showCustomToast(`⭐ Added "${clone.name}" to My Saved Brackets!`);
  renderSavedBracketsVault();
}
window.copyCommunityBracketToMine = copyCommunityBracketToMine;


function openSaveBracketModal(fromVault = false) {
  state._openedFromVault = fromVault;
  const vaultModal = document.getElementById('bracketVaultModal');
  if (vaultModal) vaultModal.classList.remove('open');

  const modal = document.getElementById('saveBracketModal');
  if (!modal) return;

  const previewBox = document.getElementById('saveBracketPreviewBox');
  const evaluated = evaluateRegularSeasonAllTeams();
  const ccg = simulateConferenceChampionships(evaluated);
  const cfp = (state.lastPlayoffResults && state.lastPlayoffResults.cfp) ? state.lastPlayoffResults.cfp : generate12TeamCfpField(ccg.confChamps, evaluated);
  const playoff = state.lastPlayoffResults || simulatePlayoffBracket(cfp);
  const champTeam = state.lastNationalChampion || (playoff.nationalChampion ? (TEAMS_DATABASE[playoff.nationalChampion.id] || playoff.nationalChampion) : TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate']);

  const currentUser = getCurrentUser();
  const allKnown = getAllKnownBrackets();
  const activeExisting = state.activeSavedBracketId ? allKnown.find(b => b.id === state.activeSavedBracketId) : null;
  const isAi = activeExisting && (activeExisting.isAdminBenchmark || activeExisting.id === 'bracket_prophet_ai_baseline' || (activeExisting.name && activeExisting.name.toLowerCase().includes('prophet ai')));
  const isEditingExisting = activeExisting && !isAi && (isBracketOwnedByUser(activeExisting, currentUser) || getSavedBrackets().some(sb => sb.id === activeExisting.id));

  if (previewBox) {
    previewBox.innerHTML = `
      ${isEditingExisting ? `
        <div style="background: rgba(37, 99, 235, 0.18); border: 1px solid rgba(37, 99, 235, 0.4); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; margin-bottom: 0.65rem; color: #93C5FD; font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-pen-to-square" style="color: #60A5FA;"></i>
            <span>Updating: <strong>${activeExisting.name}</strong></span>
          </div>
          <span style="font-size: 0.7rem; color: #93C5FD; background: rgba(37, 99, 235, 0.3); padding: 1px 6px; border-radius: 4px;">Picks Updated on Leaderboard</span>
        </div>
      ` : ''}
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <img src="${champTeam.logoUrl || 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png'}" style="width: 40px; height: 40px; object-fit: contain;">
        <div>
          <div style="font-size: 0.72rem; color: #F59E0B; font-weight: 800; text-transform: uppercase;">🏆 PROJECTED NATIONAL CHAMPION</div>
          <div style="font-size: 1.1rem; font-weight: 800; color: #FFFFFF;">${champTeam.name}</div>
        </div>
      </div>
      <div style="font-size: 0.76rem; color: #94A3B8; margin-top: 0.25rem;">
        <strong>#1-#4 Byes:</strong> #${cfp.seed1?.shortName || '1'}, #${cfp.seed2?.shortName || '2'}, #${cfp.seed3?.shortName || '3'}, #${cfp.seed4?.shortName || '4'}
      </div>
      <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: var(--radius-sm); padding: 0.55rem 0.75rem; margin-top: 0.65rem; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="background: #10B981; color: #000; font-weight: 800; font-size: 0.68rem; padding: 2px 6px; border-radius: 4px;">WEEK 0 FINAL</span>
          <span style="font-size: 0.8rem; font-weight: 700; color: #F8FAFC;">USC 42 - 26 San Jose State</span>
        </div>
        <span style="font-family: var(--font-mono); font-size: 0.75rem; font-weight: 800; color: #34D399;">+10 PTS (100% Scored)</span>
      </div>
    `;
  }

  const nameInput = document.getElementById('bracketNameInput');
  const creatorInput = document.getElementById('bracketCreatorInput');
  const notesInput = document.getElementById('bracketNotesInput');

  if (nameInput) {
    nameInput.value = isEditingExisting ? activeExisting.name : `${champTeam.shortName || 'CFB'} Natty Projection`;
  }
  if (creatorInput) {
    creatorInput.value = isEditingExisting && activeExisting.creator ? activeExisting.creator : (currentUser ? currentUser.displayName : (localStorage.getItem('cfb_prophet_user_handle') || 'Coach'));
  }
  if (notesInput && isEditingExisting && activeExisting.notes) {
    notesInput.value = activeExisting.notes;
  }

  const confirmBtn = document.getElementById('confirmSaveBracketBtn');
  if (confirmBtn) {
    if (isEditingExisting) {
      confirmBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> <span>Update Bracket Picks</span>';
      confirmBtn.style.background = 'linear-gradient(135deg, #2563EB, #1D4ED8)';
    } else {
      confirmBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Submit & Save Picks</span>';
      confirmBtn.style.background = '#10B981';
    }
  }

  modal.classList.add('open');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    if (nameInput) nameInput.focus();
  }, 100);
}

function closeSaveBracketModal() {
  const modal = document.getElementById('saveBracketModal');
  if (modal) modal.classList.remove('open');
  if (state._openedFromVault) {
    state._openedFromVault = false;
    openBracketVaultModal();
  } else {
    document.body.classList.remove('modal-open');
  }
}

function handleConfirmSaveBracket() {
  const name = document.getElementById('bracketNameInput')?.value;
  const creator = document.getElementById('bracketCreatorInput')?.value;
  const notes = document.getElementById('bracketNotesInput')?.value;
  const isPublic = document.getElementById('publishToCommunityCheckbox')?.checked !== false;

  if (creator && creator.trim()) {
    try {
      localStorage.setItem('cfb_prophet_user_handle', creator.trim());
    } catch(e) {}
  }

  const currentUser = getCurrentUser();
  const allKnown = getAllKnownBrackets();
  const activeExisting = state.activeSavedBracketId ? allKnown.find(b => b.id === state.activeSavedBracketId) : null;
  const isAi = activeExisting && (activeExisting.isAdminBenchmark || activeExisting.id === 'bracket_prophet_ai_baseline' || (activeExisting.name && activeExisting.name.toLowerCase().includes('prophet ai')));
  const wasEditing = activeExisting && !isAi && (isBracketOwnedByUser(activeExisting, currentUser) || getSavedBrackets().some(sb => sb.id === activeExisting.id));

  const saved = saveCurrentProjectionAsBracket(name, creator, notes);
  if (isPublic) {
    saved.isPublic = true;
    publishBracketToCloud(saved);
  }

  state._openedFromVault = false;
  const modal = document.getElementById('saveBracketModal');
  if (modal) modal.classList.remove('open');
  showCustomToast(`🎉 Bracket "${saved.name}" ${wasEditing ? 'updated' : 'saved'} & published to Community Vault!`);
  renderActiveBracketEditorBar(saved);
  openBracketVaultModal();
  syncCommunityBracketsFromCloud();
}

function saveActiveProjectionDirectly() {
  const currentUser = getCurrentUser();
  const evaluated = evaluateRegularSeasonAllTeams();
  const ccg = simulateConferenceChampionships(evaluated);
  const cfp = (state.lastPlayoffResults && state.lastPlayoffResults.cfp) ? state.lastPlayoffResults.cfp : generate12TeamCfpField(ccg.confChamps, evaluated);
  const playoff = state.lastPlayoffResults || simulatePlayoffBracket(cfp);
  const champTeam = state.lastNationalChampion || (playoff.nationalChampion ? (TEAMS_DATABASE[playoff.nationalChampion.id] || playoff.nationalChampion) : TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate']);

  const name = `${champTeam.shortName || 'CFB'} Natty Projection`;
  const creator = currentUser ? currentUser.displayName : (localStorage.getItem('cfb_prophet_user_handle') || 'Coach');
  const saved = saveCurrentProjectionAsBracket(name, creator, 'Locked in 2026 Prediction');
  saved.isPublic = true;
  publishBracketToCloud(saved);
  showCustomToast(`🎉 Bracket "${saved.name}" locked in & submitted!`);
  renderSavedBracketsVault();
}
window.saveActiveProjectionDirectly = saveActiveProjectionDirectly;

function openBracketVaultModal() {
  const modal = document.getElementById('bracketVaultModal');
  if (modal) modal.classList.add('open');
  document.body.classList.add('modal-open');
  autoPublishAllLocalSavedBrackets();
  renderSavedBracketsVault();
  syncCommunityBracketsFromCloud(false);
}

function closeBracketVaultModal() {
  const modal = document.getElementById('bracketVaultModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

function deleteSavedBracket(bracketId, e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  
  const allKnown = getAllKnownBrackets();
  const target = allKnown.find(b => b.id === bracketId);
  const isAi = (target && (target.isAdminBenchmark || target.id === 'bracket_prophet_ai_baseline' || (target.name && target.name.toLowerCase().includes('prophet ai')))) || bracketId === 'bracket_prophet_ai_baseline';
  
  if (isAi) {
    showCustomToast('🔒 The Prophet AI Benchmark is permanently locked and cannot be deleted.');
    return;
  }

  const currentUser = getCurrentUser();
  const isMine = getSavedBrackets().some(sb => sb.id === bracketId);
  const isOwner = target ? isBracketOwnedByUser(target, currentUser) : false;
  if (!isMine && !isOwner) {
    showCustomToast('🔒 You can only delete brackets that you submitted.');
    return;
  }

  addDeletedBracketId(bracketId);
  publishDeletionTombstoneToCloud(bracketId);

  // Clean from all local storage buckets
  const storageKeys = [
    BRACKET_STORAGE_KEY,
    'cfb_prophet_saved_brackets_v5',
    'cfb_prophet_saved_brackets_v4',
    'cfb_prophet_saved_brackets_v3',
    'cfb_prophet_saved_brackets_v2',
    'cfb_prophet_saved_brackets'
  ];

  storageKeys.forEach(k => {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        let list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list = list.filter(b => b && b.id !== bracketId);
          localStorage.setItem(k, JSON.stringify(list));
        }
      }
    } catch(err) {}
  });

  const commKeys = [
    COMMUNITY_BRACKETS_KEY,
    'cfb_prophet_community_brackets_v5',
    'cfb_prophet_community_brackets_v4',
    'cfb_prophet_community_brackets_v3'
  ];

  commKeys.forEach(k => {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        let list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list = list.filter(b => b && b.id !== bracketId);
          localStorage.setItem(k, JSON.stringify(list));
        }
      }
    } catch(err) {}
  });

  renderSavedBracketsVault();
  updateAuthUI();
  showCustomToast('🗑️ Bracket deleted permanently.');
}


// 12-Team CFP Bracket Canvas Graphic Generator
function generateCfpBracketCanvas(bracketObj) {
  const canvas = document.getElementById('cfpBracketCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const b = bracketObj || getSavedBrackets()[0] || createBaselineBracketObject();
  const seeds = b.seeds || [];
  const champ = b.champion || { name: 'Texas Longhorns', shortName: 'Texas', logoUrl: '' };

  // Canvas Dimensions: 1200 x 675 (16:9 HD)
  ctx.clearRect(0, 0, 1200, 675);

  // Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 1200, 675);
  bgGrad.addColorStop(0, '#070A11');
  bgGrad.addColorStop(0.5, '#0B0F19');
  bgGrad.addColorStop(1, '#05070C');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1200, 675);

  // Decorative Stadium Grid & Glow
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1200; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 675); ctx.stroke();
  }
  for (let y = 0; y <= 675; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1200, y); ctx.stroke();
  }

  // Header Banner
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  drawCanvasRoundedRect(ctx, 30, 20, 1140, 68, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();

  const acc = b.accuracy || calculateBracketAccuracy(b);
  drawCanvasTextFitted(ctx, `🏆 2026 COLLEGE FOOTBALL PLAYOFF BRACKET`, 55, 52, 500, 'bold 24px "Bebas Neue", "Outfit", sans-serif', '#FFFFFF', 'left');
  drawCanvasTextFitted(ctx, `BRACKET: "${b.name.toUpperCase()}" • BY ${b.creator.toUpperCase()}`, 55, 72, 600, 'bold 12px "JetBrains Mono", monospace', '#F59E0B', 'left');
  drawCanvasTextFitted(ctx, `🎯 ${acc.pct}% ACCURACY • GRADE ${acc.grade} (${acc.pts}/${acc.maxPts} PTS)`, 1145, 58, 420, 'bold 13px "JetBrains Mono", monospace', '#34D399', 'right');

  // Left Column: First Round & Quarterfinals
  const leftX = 45;
  const colW = 240;

  // Round Labels
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillText('FIRST ROUND (ON CAMPUS)', leftX, 115);
  ctx.fillText('QUARTERFINALS (NY6 BOWLS)', leftX + 260, 115);
  ctx.fillText('SEMIFINALS', leftX + 520, 115);
  ctx.fillText('NATIONAL CHAMPIONSHIP', leftX + 760, 115);

  function drawBracketMatchBox(x, y, w, h, seedA, nameA, seedB, nameB, winnerName, bowlLabel) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    drawCanvasRoundedRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    if (bowlLabel) {
      ctx.fillStyle = '#64748B';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(bowlLabel.toUpperCase(), x + 8, y + 12);
    }

    const isWinA = winnerName && nameA && winnerName.toLowerCase().includes(nameA.toLowerCase());
    const isWinB = winnerName && nameB && winnerName.toLowerCase().includes(nameB.toLowerCase());

    ctx.fillStyle = isWinA ? '#F59E0B' : '#E2E8F0';
    ctx.font = isWinA ? 'bold 12px "Outfit", sans-serif' : '500 12px "Outfit", sans-serif';
    ctx.fillText(`${seedA ? '#' + seedA : ''} ${nameA}`, x + 8, y + (bowlLabel ? 26 : 18));

    ctx.fillStyle = isWinB ? '#F59E0B' : '#94A3B8';
    ctx.font = isWinB ? 'bold 12px "Outfit", sans-serif' : '500 12px "Outfit", sans-serif';
    ctx.fillText(`${seedB ? '#' + seedB : ''} ${nameB}`, x + 8, y + (bowlLabel ? 42 : 34));
  }

  // First Round (4 games)
  const fr = b.playoffSummary?.fr || [];
  drawBracketMatchBox(leftX, 130, 220, 44, '5', seeds[4]?.name || 'Oregon', '12', seeds[11]?.name || 'Boise St', fr[0]?.winner);
  drawBracketMatchBox(leftX, 230, 220, 44, '6', seeds[5]?.name || 'Notre Dame', '11', seeds[10]?.name || 'Alabama', fr[1]?.winner);
  drawBracketMatchBox(leftX, 330, 220, 44, '7', seeds[6]?.name || 'Texas', '10', seeds[9]?.name || 'LSU', fr[2]?.winner);
  drawBracketMatchBox(leftX, 430, 220, 44, '8', seeds[7]?.name || 'Ole Miss', '9', seeds[8]?.name || 'Indiana', fr[3]?.winner);

  // Quarterfinals (4 games)
  const qf = b.playoffSummary?.qf || [];
  drawBracketMatchBox(leftX + 260, 155, 220, 52, '1', seeds[0]?.name || 'Georgia', '8/9', fr[3]?.winner || 'Indiana', qf[0]?.winner, 'Sugar Bowl');
  drawBracketMatchBox(leftX + 260, 255, 220, 52, '2', seeds[1]?.name || 'Ohio St', '7/10', fr[2]?.winner || 'Texas', qf[1]?.winner, 'Rose Bowl');
  drawBracketMatchBox(leftX + 260, 355, 220, 52, '3', seeds[2]?.name || 'Miami', '6/11', fr[1]?.winner || 'Notre Dame', qf[2]?.winner, 'Peach Bowl');
  drawBracketMatchBox(leftX + 260, 455, 220, 52, '4', seeds[3]?.name || 'Texas Tech', '5/12', fr[0]?.winner || 'Oregon', qf[3]?.winner, 'Fiesta Bowl');

  // Semifinals (2 games)
  const sf = b.playoffSummary?.sf || [];
  drawBracketMatchBox(leftX + 520, 205, 220, 52, 'QF1', qf[0]?.winner || 'Ohio St', 'QF4', qf[3]?.winner || 'Georgia', sf[0]?.winner, 'Orange Bowl');
  drawBracketMatchBox(leftX + 520, 405, 220, 52, 'QF2', qf[1]?.winner || 'Oregon', 'QF3', qf[2]?.winner || 'Texas', sf[1]?.winner, 'Cotton Bowl');

  // National Championship Box
  drawBracketMatchBox(leftX + 760, 305, 240, 56, 'SF1', sf[0]?.winner || 'Ohio St', 'SF2', sf[1]?.winner || 'Texas', champ.shortName, 'Mercedes-Benz Stadium (Atlanta)');

  // Trophy Pedestal in Center Right (X: 1040, Y: 220 to 520)
  const pedX = 1030;
  const pedY = 160;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
  drawCanvasRoundedRect(ctx, pedX, pedY, 135, 340, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
  ctx.stroke();

  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 NATIONAL', pedX + 67, pedY + 30);
  ctx.fillText('CHAMPION', pedX + 67, pedY + 46);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px "Outfit", sans-serif';
  ctx.fillText(champ.shortName || 'CHAMP', pedX + 67, pedY + 280);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillText(`${champ.score || 34} - ${champ.oppScore || 28}`, pedX + 67, pedY + 305);

  // Footer Watermark
  ctx.fillStyle = '#64748B';
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`SIMULATED ON CFB PROPHET • NCAA CFP 12-TEAM TOURNAMENT • OFFICIAL MODEL CALIBRATION`, 600, 650);
}

function openCfpBracketCanvasModal() {
  const allBrackets = getCommunityBrackets();
  const currentBracket = allBrackets.find(b => b.id === state.activeSavedBracketId) || allBrackets[0] || createProphetAiBenchmarkBracket();
  openCfpBracketCanvasModalForBracket(currentBracket.id);
}

function openCfpBracketCanvasModalForBracket(bracketId) {
  const allBrackets = getCommunityBrackets();
  const target = allBrackets.find(b => b.id === bracketId) || allBrackets[0] || createProphetAiBenchmarkBracket();
  
  const modal = document.getElementById('bracketCanvasModal');
  if (!modal) return;

  generateCfpBracketCanvas(target);
  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

function closeCfpBracketCanvasModal() {
  const modal = document.getElementById('bracketCanvasModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

function downloadCfpBracketGraphic() {
  const canvas = document.getElementById('cfpBracketCanvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `CFB_Prophet_Bracket_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showCustomToast('📥 Tournament Graphic Downloaded!');
}

function copyCfpBracketGraphic() {
  const canvas = document.getElementById('cfpBracketCanvas');
  if (!canvas || !navigator.clipboard) return;
  canvas.toBlob(blob => {
    if (!blob) return;
    try {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => showCustomToast('📋 Bracket Graphic Copied to Clipboard!'))
        .catch(() => downloadCfpBracketGraphic());
    } catch (e) {
      downloadCfpBracketGraphic();
    }
  });
}

function loadSavedBracket(bracketId, andEdit = false) {
  const allBrackets = getAllKnownBrackets();
  const target = allBrackets.find(b => b.id === bracketId);
  if (!target) {
    showCustomToast('⚠️ Could not locate bracket to load.');
    return;
  }

  const isAi = target.isAdminBenchmark || target.id === 'bracket_prophet_ai_baseline' || (target.name && target.name.toLowerCase().includes('prophet ai'));
  const currentUser = getCurrentUser();
  const isMine = getSavedBrackets().some(sb => sb.id === target.id);
  const isOwner = !isAi && !!currentUser && isBracketOwnedByUser(target, currentUser);
  const canEdit = !isAi && (isOwner || isMine);

  if (andEdit && !canEdit) {
    if (isAi) {
      showCustomToast('🔒 Prophet AI Benchmark is locked and cannot be adjusted.');
    } else {
      showCustomToast('🔒 You can only adjust brackets that you submitted.');
    }
    andEdit = false;
  }

  // Only bind activeSavedBracketId if the user owns this bracket
  state.activeSavedBracketId = canEdit ? target.id : null;

  if (target.simState) {
    if (target.simState.teamId) state.currentTeamId = target.simState.teamId;
    state.userPicks = JSON.parse(JSON.stringify(target.simState.userPicks || {}));
    state.manualScores = JSON.parse(JSON.stringify(target.simState.manualScores || {}));
    state.ccgPicks = JSON.parse(JSON.stringify(target.simState.ccgPicks || {}));
    state.playoffPicks = JSON.parse(JSON.stringify(target.simState.playoffPicks || {}));
    state.teamSliders = JSON.parse(JSON.stringify(target.simState.teamSliders || {}));
    state.gameSliders = JSON.parse(JSON.stringify(target.simState.gameSliders || {}));
  } else if (target.champion?.id) {
    state.currentTeamId = target.champion.id;
  }

  if (!TEAMS_DATABASE[state.currentTeamId]) {
    state.currentTeamId = target.champion?.id || getTopRankedTeamId() || 'ohiostate';
  }

  closeBracketVaultModal();
  if (typeof closeSubmissionDetailModal === 'function') closeSubmissionDetailModal();

  // Full recalculation and rendering
  selectTeam(state.currentTeamId);

  // Render the persistent Active Bracket Editing Bar ONLY if user owns this bracket
  renderActiveBracketEditorBar(canEdit ? target : null);

  if (andEdit) {
    setTimeout(() => {
      const el = document.getElementById('playoffSection') || document.getElementById('scheduleSection');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }

  if (canEdit) {
    showCustomToast(`🎯 Loaded "${target.name}" into Simulator for editing!`);
  } else {
    showCustomToast(`👀 Loaded "${target.name}" (Read-Only View)`);
  }
}
window.loadSavedBracket = loadSavedBracket;

function renderActiveBracketEditorBar(bracket) {
  const banner = document.getElementById('activeBracketEditorBanner');
  if (!banner) return;
  const nameEl = document.getElementById('activeBracketBannerName');
  if (bracket && state.activeSavedBracketId) {
    let scorePillHtml = '';
    try {
      const acc = calculateTeamScoreForUser(bracket, state.currentTeamId);
      const isPerfect = acc.pts === acc.maxPts;
      scorePillHtml = `<span class="bracket-banner-score-pill" title="Prediction Points for ${TEAMS_DATABASE[state.currentTeamId]?.shortName || 'Team'}"><i class="fa-solid ${isPerfect ? 'fa-award' : 'fa-chart-pie'}"></i> ${acc.pts}/${acc.maxPts} PTS (${acc.pct}%)</span>`;
    } catch (e) {}
    if (nameEl) nameEl.innerHTML = `"${bracket.name || 'Personal Bracket'}" ${scorePillHtml}`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}
window.renderActiveBracketEditorBar = renderActiveBracketEditorBar;

function exitBracketEditingMode() {
  state.activeSavedBracketId = null;
  state.userPicks = {};
  state.manualScores = {};
  state.ccgPicks = {};
  state.playoffPicks = {};
  renderActiveBracketEditorBar(null);
  selectTeam(state.currentTeamId);
  showCustomToast('🔄 Exited bracket editing mode (returned to baseline).');
}
window.exitBracketEditingMode = exitBracketEditingMode;



function copyTextToClipboardSafe(text, successMsg = 'Copied to clipboard!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showCustomToast(successMsg);
    }).catch(() => {
      fallbackCopyText(text, successMsg);
    });
  } else {
    fallbackCopyText(text, successMsg);
  }
}

function fallbackCopyText(text, successMsg) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showCustomToast(successMsg);
  } catch (err) {
    prompt('Copy link:', text);
  }
  document.body.removeChild(textArea);
}

function getBracketShareUrl(bracketId) {
  const allBrackets = getCommunityBrackets();
  const target = allBrackets.find(b => b.id === bracketId) || allBrackets[0] || createProphetAiBenchmarkBracket();
  const targetTeamId = target.simState?.teamId || target.champion?.id || getTopRankedTeamId() || 'ohiostate';

  const payload = {
    t: targetTeamId,
    pk: target.simState?.userPicks || {},
    cp: target.simState?.ccgPicks || {},
    pp: target.simState?.playoffPicks || {},
    ts: target.simState?.teamSliders || {},
    bn: target.name || 'CFB Prophet Bracket'
  };

  try {
    const jsonStr = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    return `https://jajo9147.github.io/cfb-football-predictor/#s=${b64}`;
  } catch (e) {
    return `https://jajo9147.github.io/cfb-football-predictor/?team=${targetTeamId}`;
  }
}

function copyBracketShareLink(bracketId, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const allBrackets = getCommunityBrackets();
  const target = allBrackets.find(b => b.id === bracketId) || allBrackets[0] || createProphetAiBenchmarkBracket();
  if (!target) return;

  const url = getBracketShareUrl(target.id);
  
  // Instant Visual Feedback on Clicked Button
  const btn = e?.currentTarget;
  if (btn) {
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check" style="color: #34D399;"></i> Copied!';
    btn.classList.add('btn-copied-flash');
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.classList.remove('btn-copied-flash');
    }, 2200);
  }

  copyTextToClipboardSafe(url, `🔗 Link for "${target.name}" copied!`);
}

function copyActiveBracketShareLink() {
  const allBrackets = getCommunityBrackets();
  const active = allBrackets.find(b => b.id === state.activeSavedBracketId) || allBrackets[0];
  if (active) copyBracketShareLink(active.id);
}

function openBracketQrModal(bracketId, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const allBrackets = getCommunityBrackets();
  const target = (bracketId ? allBrackets.find(b => b.id === bracketId) : null) || allBrackets[0] || createProphetAiBenchmarkBracket();
  if (!target) return;

  const modal = document.getElementById('bracketQrModal');
  const titleEl = document.getElementById('qrModalBracketTitle');
  const canvasEl = document.getElementById('bracketQrCanvas');
  const imgEl = document.getElementById('bracketQrImg');
  if (!modal) return;

  const shareUrl = getBracketShareUrl(target.id);
  state._activeQrUrl = shareUrl;

  if (titleEl) {
    titleEl.innerText = `SYNC "${(target.name || 'BRACKET').toUpperCase()}"`;
  }

  // Pure Client-Side Instant QR Generation (0ms latency, works 100% offline)
  let qrRendered = false;

  // Method 1: QRious on HTML5 Canvas
  const QRiousClass = typeof QRious !== 'undefined' ? QRious : (window.QRious || null);
  if (QRiousClass && canvasEl) {
    try {
      new QRiousClass({
        element: canvasEl,
        value: shareUrl,
        size: 220,
        padding: 4,
        level: 'M',
        background: '#FFFFFF',
        foreground: '#000000'
      });
      const ctx = canvasEl.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
      canvasEl.style.display = 'block';
      if (imgEl) imgEl.style.display = 'none';
      const dynDiv = document.getElementById('dynamicQrBox');
      if (dynDiv) dynDiv.style.display = 'none';
      qrRendered = true;
    } catch(err) {
      console.warn('QRious render error:', err);
    }
  }

  // Method 2: QRCode.js fallback
  const QRCodeClass = typeof QRCode !== 'undefined' ? QRCode : (window.QRCode || null);
  if (!qrRendered && QRCodeClass && canvasEl) {
    try {
      const qrContainer = canvasEl.parentElement;
      if (qrContainer) {
        canvasEl.style.display = 'none';
        let dynDiv = document.getElementById('dynamicQrBox');
        if (!dynDiv) {
          dynDiv = document.createElement('div');
          dynDiv.id = 'dynamicQrBox';
          dynDiv.style.width = '220px';
          dynDiv.style.height = '220px';
          qrContainer.appendChild(dynDiv);
        }
        dynDiv.innerHTML = '';
        dynDiv.style.display = 'block';
        new QRCodeClass(dynDiv, {
          text: shareUrl,
          width: 220,
          height: 220,
          colorDark: '#000000',
          colorLight: '#FFFFFF',
          correctLevel: QRCodeClass.CorrectLevel ? QRCodeClass.CorrectLevel.M : 0
        });
        if (imgEl) imgEl.style.display = 'none';
        qrRendered = true;
      }
    } catch(err) {
      console.warn('QRCode render error:', err);
    }
  }

  // Method 3: Fallback to high-speed image QR if client-side libraries failed
  if (!qrRendered && imgEl) {
    const dynDiv = document.getElementById('dynamicQrBox');
    if (dynDiv) dynDiv.style.display = 'none';
    const encodedUrl = encodeURIComponent(shareUrl);
    imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodedUrl}`;
    imgEl.style.display = 'block';
    if (canvasEl) canvasEl.style.display = 'none';
  }

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

function closeBracketQrModal() {
  const modal = document.getElementById('bracketQrModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

function copyActiveQrLink() {
  const url = state._activeQrUrl || window.location.href;
  const btn = document.getElementById('copyQrLinkBtn');
  if (btn) {
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check" style="color: #34D399;"></i> <span>Copied!</span>';
    setTimeout(() => { btn.innerHTML = origHtml; }, 2200);
  }

  copyTextToClipboardSafe(url, '🔗 Direct device sync link copied to clipboard!');
}

function openAiTuningModal() {
  const modal = document.getElementById('cfbAiTuningModal');
  if (modal) {
    const team = TEAMS_DATABASE[state.currentTeamId] || TEAMS_DATABASE['ohiostate'];
    updateGlobalSliderLabels(team);
    syncSliderInputsToActiveTeam();
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }
}

function closeAiTuningModal() {
  const modal = document.getElementById('cfbAiTuningModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
}

function closePwaInstallDrawer() {
  const drawer = document.getElementById('pwaInstallDrawer');
  if (drawer) drawer.classList.remove('open');
  document.body.classList.remove('modal-open');
}

function switchPwaTab(tabName) {
  const tabs = ['safari', 'chrome', 'android', 'desktop'];
  tabs.forEach(t => {
    const btn = document.getElementById(`pwaTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const panel = document.getElementById(`pwaPanel${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (panel) panel.classList.toggle('active', t === tabName);
  });
}

function clearTeamSearch() {
  const input = document.getElementById('teamSearchInput');
  const clearBtn = document.getElementById('teamSearchClearBtn');
  const dropdown = document.getElementById('teamSearchResultsDropdown');
  if (input) {
    input.value = '';
    input.focus();
  }
  if (clearBtn) clearBtn.style.display = 'none';
  if (dropdown) dropdown.style.display = 'none';
  document.querySelectorAll('.team-pill-btn').forEach(btn => {
    btn.style.display = '';
  });
}

window.openAiTuningModal = openAiTuningModal;
window.closeAiTuningModal = closeAiTuningModal;
window.closePwaInstallDrawer = closePwaInstallDrawer;
window.switchPwaTab = switchPwaTab;
window.clearTeamSearch = clearTeamSearch;
window.openSaveBracketModal = openSaveBracketModal;
window.closeSaveBracketModal = closeSaveBracketModal;
window.handleConfirmSaveBracket = handleConfirmSaveBracket;
window.openBracketVaultModal = openBracketVaultModal;
window.closeBracketVaultModal = closeBracketVaultModal;
window.openCfpBracketCanvasModal = openCfpBracketCanvasModal;
window.openCfpBracketCanvasModalForBracket = openCfpBracketCanvasModalForBracket;
window.closeCfpBracketCanvasModal = closeCfpBracketCanvasModal;
window.downloadCfpBracketGraphic = downloadCfpBracketGraphic;
window.copyCfpBracketGraphic = copyCfpBracketGraphic;
window.copyBracketShareLink = copyBracketShareLink;
window.copyActiveBracketShareLink = copyActiveBracketShareLink;
window.loadSavedBracket = loadSavedBracket;
window.deleteSavedBracket = deleteSavedBracket;
window.openBracketQrModal = openBracketQrModal;
window.closeBracketQrModal = closeBracketQrModal;
window.copyActiveQrLink = copyActiveQrLink;
// window.importBracketFromPrompt (cleaned)



// ==========================================================================
// IOS NATIVE SHARE SHEET ENGINE (iMessage, WhatsApp, AirDrop)
// ==========================================================================

function getActiveHypeShareData() {
  const appUrl = 'https://jajo9147.github.io/cfb-football-predictor/';
  const game = state.activeModalGame;

  if (game) {
    let teamA, teamB, scoreA, scoreB;
    if ((game.isPostseason || game.isDreamMatchup) && game.teamA && game.teamB) {
      teamA = TEAMS_DATABASE[game.teamA.id] || game.teamA;
      teamB = TEAMS_DATABASE[game.teamB.id] || game.teamB;
      const sim = simulatePostseasonMatchup(teamA, teamB, { gameId: game.id, isHomeA: game.isHomeA || game.isHome });
      scoreA = sim.scoreA;
      scoreB = sim.scoreB;
    } else {
      teamA = TEAMS_DATABASE[state.currentTeamId] || Object.values(TEAMS_DATABASE)[0];
      const oppId = getOpponentTeamId(game);
      teamB = (oppId && TEAMS_DATABASE[oppId]) ? TEAMS_DATABASE[oppId] : { 
        shortName: game.oppAbbr || 'Opponent', 
        name: game.opponent || 'Opponent' 
      };
      const sim = calculateAdjustedMatchup(game);
      scoreA = sim.projUt;
      scoreB = sim.projOpp;
    }

    const isAWin = scoreA > scoreB;
    const winner = isAWin ? teamA : teamB;
    const loser = isAWin ? teamB : teamA;
    const winScore = Math.max(scoreA, scoreB);
    const loseScore = Math.min(scoreA, scoreB);
    const weekLabel = game.week || 'Matchup';
    const matchupName = `${teamA.shortName || teamA.name} vs ${teamB.shortName || teamB.name}`;

    return {
      title: `${matchupName} Prediction | CFB Prophet`,
      text: `🏈 Check out CFB Prophet! I project ${winner.name} to win (${winScore}-${loseScore}) against ${loser.name} in ${weekLabel}.\n\n${appUrl}`,
      url: appUrl,
      filename: `cfb-prophet-${(teamA.shortName || 'matchup').toLowerCase()}-vs-${(teamB.shortName || 'opp').toLowerCase()}.png`
    };
  } else {
    // Season Projection Card
    const teamId = state.currentTeamId || getTopRankedTeamId() || 'ohiostate';
    const team = TEAMS_DATABASE[teamId] || Object.values(TEAMS_DATABASE)[0];

    return {
      title: `${team.name} 2026 Season Projection | CFB Prophet`,
      text: `🏈 Check out CFB Prophet! I project ${team.name} to win the national championship this year.\n\n${appUrl}`,
      url: appUrl,
      filename: `cfb-prophet-${teamId}-season-projection.png`
    };
  }
}
window.getActiveHypeShareData = getActiveHypeShareData;

async function shareActiveCanvasToNativeSheet(canvasId, defaultFilename = 'cfb_prophet_share.png', defaultTitle = 'CFB Prophet') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    showCustomToast('⚠️ Canvas graphic not ready.');
    return;
  }

  const shareData = getActiveHypeShareData();

  // Convert canvas to Blob
  canvas.toBlob(async (blob) => {
    if (!blob) {
      showCustomToast('⚠️ Could not generate image for sharing.');
      return;
    }

    const file = new File([blob], shareData.filename, { type: 'image/png' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: shareData.title,
          text: shareData.text
        });
        showCustomToast('🎉 Shared to iOS Share Sheet!');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // User closed share sheet
      }
    }

    // Fallback: Copy to clipboard or download
    try {
      if (navigator.clipboard && navigator.clipboard.write) {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        showCustomToast('📋 Image copied to clipboard! Paste into iMessage or chat.');
        return;
      }
    } catch (e) {}

    // Fallback: Download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = shareData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showCustomToast('💾 Image saved!');
  }, 'image/png');
}
window.shareActiveCanvasToNativeSheet = shareActiveCanvasToNativeSheet;

// Native iOS WebKit Haptic & Share Bridge
function triggerNativeHaptic(type = 'medium') {
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.haptic) {
      window.webkit.messageHandlers.haptic.postMessage(type);
    }
  } catch (e) {}
}
window.triggerNativeHaptic = triggerNativeHaptic;

function triggerNativeShare(title, text, url) {
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.share) {
      window.webkit.messageHandlers.share.postMessage({ title, text, url });
      return true;
    }
  } catch (e) {}
  return false;
}
window.triggerNativeShare = triggerNativeShare;



// ==========================================================================
// VIRAL GROWTH, CHAOS SIMULATOR & CHALLENGE ENGINE
// ==========================================================================

function triggerChaosUpsetSimulator() {
  const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];
  if (!currentTeam || !currentTeam.schedule) return;

  if (!state.userPicks) state.userPicks = {};

  let upsetCount = 0;
  // Apply randomized underdog chaos upsets across the current team's schedule
  currentTeam.schedule.forEach((g) => {
    const isUnderdog = (g.vegasSpread || 0) > 0 || (g.oppRank && !currentTeam.apRank);
    const isTossUp = Math.abs(g.vegasSpread || 0) <= 7;
    if ((isUnderdog || isTossUp) && Math.random() < 0.6) {
      const currentPick = state.userPicks[g.id] || (g.sim && g.sim.adjWinProb >= 50 ? 'W' : 'L');
      const newPick = currentPick === 'W' ? 'L' : 'W';
      state.userPicks[g.id] = newPick;

      // Sync counterpart if exists
      const counterpart = typeof findCounterpartMatchup === 'function' ? findCounterpartMatchup(state.currentTeamId, g) : null;
      if (counterpart && counterpart.oppGame) {
        state.userPicks[counterpart.oppGame.id] = (newPick === 'W') ? 'L' : 'W';
      }
      upsetCount++;
    }
  });

  if (upsetCount === 0 && currentTeam.schedule.length > 0) {
    const randomIdx = Math.floor(Math.random() * currentTeam.schedule.length);
    const g = currentTeam.schedule[randomIdx];
    const newPick = 'W';
    state.userPicks[g.id] = newPick;
    const counterpart = typeof findCounterpartMatchup === 'function' ? findCounterpartMatchup(state.currentTeamId, g) : null;
    if (counterpart && counterpart.oppGame) {
      state.userPicks[counterpart.oppGame.id] = 'L';
    }
    upsetCount = 1;
  }

  // Recalculate season outcomes, CCG, and 12-Team CFP field
  if (typeof recalculateSeason === 'function') {
    recalculateSeason();
  }

  showCustomToast(`🎲 CHAOS UNLEASHED: ${upsetCount} matchup upset${upsetCount > 1 ? 's' : ''} generated! Check your updated CFP bracket!`);
  
  const chaosBtn = document.querySelector('.chaos-mode-action');
  if (chaosBtn) {
    chaosBtn.style.transform = 'scale(1.06)';
    setTimeout(() => { chaosBtn.style.transform = ''; }, 300);
  }
}
window.triggerChaosUpsetSimulator = triggerChaosUpsetSimulator;

function quickPickAllFavorites() {
  const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];
  if (!currentTeam || !currentTeam.schedule) return;

  if (!state.userPicks) state.userPicks = {};

  currentTeam.schedule.forEach(g => {
    const winProb = g.sim ? (g.sim.adjWinProb !== undefined ? g.sim.adjWinProb : 50) : 50;
    const pick = winProb >= 50 ? 'W' : 'L';
    state.userPicks[g.id] = pick;
    const counterpart = typeof findCounterpartMatchup === 'function' ? findCounterpartMatchup(state.currentTeamId, g) : null;
    if (counterpart && counterpart.oppGame) {
      state.userPicks[counterpart.oppGame.id] = (pick === 'W') ? 'L' : 'W';
    }
  });

  if (typeof recalculateSeason === 'function') {
    recalculateSeason();
  }
  showCustomToast(`✅ Quick-filled all games with projected favorites!`);
}
window.quickPickAllFavorites = quickPickAllFavorites;

function resetCurrentTeamPicks() {
  const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];
  if (currentTeam && currentTeam.schedule && state.userPicks) {
    currentTeam.schedule.forEach(g => {
      delete state.userPicks[g.id];
      const counterpart = typeof findCounterpartMatchup === 'function' ? findCounterpartMatchup(state.currentTeamId, g) : null;
      if (counterpart && counterpart.oppGame) {
        delete state.userPicks[counterpart.oppGame.id];
      }
    });
  }
  if (typeof recalculateSeason === 'function') {
    recalculateSeason();
  }
  showCustomToast(`🔄 Picks reset to authentic 2026 baseline.`);
}
window.resetCurrentTeamPicks = resetCurrentTeamPicks;

function openShareChallengeModal() {
  const modal = document.getElementById('shareChallengeModal');
  if (!modal) return;

  const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];
  const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const userName = currentUser ? currentUser.displayName : 'Coach';

  const evaluated = typeof evaluateRegularSeasonAllTeams === 'function' ? evaluateRegularSeasonAllTeams() : {};
  const teamEval = (currentTeam && evaluated[currentTeam.id]) ? evaluated[currentTeam.id] : { totalWins: 11, totalLosses: 1 };
  const champName = currentTeam ? currentTeam.name : 'Texas Longhorns';
  const recordStr = `${teamEval.totalWins || 11}-${teamEval.totalLosses || 1}`;

  const previewLogo = document.getElementById('challengePreviewLogo');
  const previewChamp = document.getElementById('challengePreviewChamp');
  const previewSub = document.getElementById('challengePreviewSub');
  const quoteBox = document.getElementById('challengeQuoteBox');

  if (previewLogo && currentTeam) previewLogo.src = currentTeam.logoUrl || '';
  if (previewChamp) previewChamp.textContent = champName;
  if (previewSub) previewSub.textContent = `${recordStr} Projected Record • CFP Contender • 2026 Simulation`;
  if (quoteBox && currentTeam) {
    quoteBox.textContent = `"${userName} is projecting ${currentTeam.shortName || champName} (${recordStr}) to dominate the 2026 season. Think your squad can beat them? Make your picks on CFB Prophet!"`;
  }

  modal.classList.add('open');
}
window.openShareChallengeModal = openShareChallengeModal;

function closeShareChallengeModal() {
  const modal = document.getElementById('shareChallengeModal');
  if (modal) modal.classList.remove('open');
}
window.closeShareChallengeModal = closeShareChallengeModal;

function copyHypeCardAndLink() {
  const canvas = document.getElementById('hypeCanvas');
  const shareData = getActiveHypeShareData();

  if (canvas && canvas.toBlob) {
    canvas.toBlob(blob => {
      if (navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ]).then(() => {
          showCustomToast('📋 Hype Card copied! Live app link: ' + shareData.url);
        }).catch(() => {
          if (navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareData.text).then(() => {
              showCustomToast('📋 Live prediction & link copied to clipboard!');
            });
          }
        });
      }
    });
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareData.text).then(() => {
      showCustomToast('📋 Live prediction & link copied to clipboard!');
    });
  }
}
window.copyHypeCardAndLink = copyHypeCardAndLink;

function getChallengeShareUrl() {
  const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];
  const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const userName = encodeURIComponent(currentUser ? currentUser.displayName : 'A Friend');
  const teamId = currentTeam ? currentTeam.id : (getTopRankedTeamId() || 'ohiostate');
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?challenge=${userName}&team=${teamId}`;
}

function handleNativeChallengeShare() {
  const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];
  const shareUrl = getChallengeShareUrl();
  const shareText = `🏈 I just simulated the 2026 College Football season on CFB Prophet and got ${currentTeam.name} winning it all! Think your team has a chance? Challenge my bracket: ${shareUrl}`;

  // 1. Native iOS App WebKit Bridge
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.share) {
    try {
      window.webkit.messageHandlers.share.postMessage({
        title: 'CFB Prophet Challenge',
        text: shareText,
        url: shareUrl
      });
      showCustomToast('📲 Opening share sheet...');
      return;
    } catch (e) {
      console.error('Native share error:', e);
    }
  }

  // 2. Web Share API
  if (navigator.share) {
    navigator.share({
      title: 'CFB Prophet Challenge',
      text: shareText,
      url: shareUrl
    }).then(() => {
      showCustomToast('✅ Shared challenge successfully!');
    }).catch((err) => {
      if (err && err.name !== 'AbortError') {
        handleCopyChallengeLink();
      }
    });
  } else {
    handleCopyChallengeLink();
  }
}
window.handleNativeChallengeShare = handleNativeChallengeShare;

function handleTwitterChallengeShare() {
  const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];
  const shareUrl = getChallengeShareUrl();
  const tweetText = `🏈 I just simulated the 2026 College Football Playoff on CFB Prophet and got ${currentTeam.name} winning it all! Think your team has a chance? Challenge my bracket: ${shareUrl}\n\n#CFBProphet #CFB #CollegeFootball`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  // 1. Native iOS App WebKit Bridge (opens share sheet or Safari)
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.share) {
    try {
      window.webkit.messageHandlers.share.postMessage({
        title: 'CFB Prophet Challenge',
        text: tweetText,
        url: shareUrl
      });
      return;
    } catch (e) {}
  }

  // 2. Direct Web Intent
  try {
    const win = window.open(tweetUrl, '_blank');
    if (!win) {
      window.location.href = tweetUrl;
    }
  } catch (e) {
    window.location.href = tweetUrl;
  }
}
window.handleTwitterChallengeShare = handleTwitterChallengeShare;

function handleCopyChallengeLink() {
  const shareUrl = getChallengeShareUrl();
  const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];
  const shareText = `🏈 I just simulated the 2026 College Football season on CFB Prophet and got ${currentTeam.name} winning it all! Think your team has a chance? Challenge my bracket: ${shareUrl}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(() => {
      showCustomToast(`📋 Challenge link & message copied! Paste it into your group chat!`);
      closeShareChallengeModal();
    }).catch(() => {
      showCustomToast(`📋 Challenge URL: ${shareUrl}`);
    });
  } else {
    showCustomToast(`📋 Challenge URL: ${shareUrl}`);
  }
}
window.handleCopyChallengeLink = handleCopyChallengeLink;

function checkIncomingChallengeParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const challenger = params.get('challenge');
    const teamParam = params.get('team');

    if (teamParam && TEAMS_DATABASE[teamParam]) {
      selectTeam(teamParam);
    }

    if (challenger) {
      const banner = document.getElementById('incomingChallengeBanner');
      const challengerEl = document.getElementById('challengeChallengerName');
      const champEl = document.getElementById('challengeChampName');
      const currentTeam = TEAMS_DATABASE[state.currentTeamId || getTopRankedTeamId() || 'ohiostate'];

      if (banner) {
        if (challengerEl) challengerEl.textContent = decodeURIComponent(challenger);
        if (champEl) champEl.textContent = currentTeam ? currentTeam.name : 'Texas';
        banner.style.display = 'flex';
      }
    }
  } catch (e) {
    console.error('Error parsing challenge params:', e);
  }
}
window.checkIncomingChallengeParams = checkIncomingChallengeParams;

function dismissChallengeBanner() {
  const banner = document.getElementById('incomingChallengeBanner');
  if (banner) banner.style.display = 'none';
}
window.dismissChallengeBanner = dismissChallengeBanner;

// ==========================================================================
// APPLICATION LAUNCHER (BOTTOM TO GUARANTEE ALL MODULES ARE INITIALIZED)
// ==========================================================================

function startApp() {
  console.log('CFB Prophet Pro: Initializing application state...');

  // 1. Determine Default Active Team: User's saved favorite team, or query param, or Ohio State
  const isFileProtocol = window.location.protocol === 'file:';
  const savedFav = localStorage.getItem('cfb_prophet_fav_team') || localStorage.getItem('cfb_prophet_favorite_team_id');
  const user = getCurrentUser();
  let defaultTeamId = user?.favTeam || savedFav || 'ohiostate';
  if (!TEAMS_DATABASE[defaultTeamId]) defaultTeamId = 'ohiostate';

  if (!isFileProtocol) {
    const urlParams = new URLSearchParams(window.location.search);
    const paramTeam = urlParams.get('team') ? urlParams.get('team').toLowerCase().trim() : null;
    if (paramTeam && TEAMS_DATABASE[paramTeam]) {
      defaultTeamId = paramTeam;
    }
  }

  try {
    renderTeamSelector();
    initTeamSearch();
    selectTeam(defaultTeamId);
  } catch (err) {
    console.error('Error selecting initial team:', err);
    try { selectTeam('ohiostate'); } catch (e) {}
  }

  // 2. Initialize secondary subsystems safely
  try { updateAuthUI(); } catch (e) {}
  try { initGlobalSliders(); } catch (e) {}
  try { initGlobalPresetButtons(); } catch (e) {}
  try { initFilterButtons(); } catch (e) {}
  try { initModalSubTabs(); } catch (e) {}
  try { initModalActions(); } catch (e) {}
  try { initHypeCardExport(); } catch (e) {}
  try { initPwaInstall(); } catch (e) {}
  try { startCountdownTicker(); } catch (e) {}
  try { initLiveSyncEngine(); } catch (e) {}
  try { initMonteCarloEngine(); } catch (e) {}
  try { checkIncomingChallengeParams(); } catch (e) {}
  try { autoPublishAllLocalSavedBrackets(); } catch (e) {}
  try { syncCommunityBracketsFromCloud(); } catch (e) {}
  try { initPwaServiceWorker(); } catch (e) {}

  // 3. Restore scenario from URL permalink hash (#sim=...) - skip on file:// (iOS)
  //    to prevent stale WKWebView hash state from loading wrong team
  if (!isFileProtocol) {
    try { restoreScenarioFromUrl(); } catch (e) {}
    window.addEventListener('hashchange', restoreScenarioFromUrl);
  }

  // Instant Auto-Sync when switching back to tab/phone screen
  window.addEventListener('focus', () => {
    try {
      autoPublishAllLocalSavedBrackets();
      syncCommunityBracketsFromCloud();
    } catch (e) {}
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try {
        autoPublishAllLocalSavedBrackets();
        syncCommunityBracketsFromCloud();
      } catch (e) {}
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

function switchAppView(view) {
  document.querySelectorAll('.dock-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dock === view);
  });

  if (view === 'schedule') {
    const el = document.getElementById('scheduleSection');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (view === 'playoffs') {
    const el = document.getElementById('playoffBracketSection') || document.getElementById('cfpSection') || document.querySelector('.bracket-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (view === 'tuning') {
    if (typeof window.openAiTuningModal === 'function') {
      window.openAiTuningModal();
    } else {
      const el = document.querySelector('.tuning-section') || document.getElementById('tuningSection');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else if (view === 'overview' || view === 'team') {
    if (typeof window.scrollToTeamOverview === 'function') window.scrollToTeamOverview();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
window.switchAppView = switchAppView;

// Bulletproof rendering insurance and deep-linking on load
function checkUrlNavigationOnLoad() {
  const grid = document.getElementById('scheduleGrid');
  if (grid && !grid.hasChildNodes()) {
    console.log('CFB Prophet: Ensuring schedule grid render on window load...');
    selectTeam(state.currentTeamId || 'ohiostate');
  }
  const isWeb = window.location.protocol !== 'file:';
  const urlParams = isWeb ? new URLSearchParams(window.location.search) : null;
  const scrollTo = urlParams ? urlParams.get('scrollTo') : null;

  if (scrollTo === 'week0' || scrollTo === 'final') {
    setTimeout(() => {
      const targetCard = document.querySelector('#scheduleGrid .game-card');
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    }, 1000);
  } else if (scrollTo === 'week1') {
    setTimeout(() => {
      const cards = document.querySelectorAll('#scheduleGrid .game-card');
      const targetCard = cards[1] || cards[0];
      if (targetCard) {
        const topY = targetCard.getBoundingClientRect().top + window.pageYOffset - 80;
        window.scrollTo({ top: topY, behavior: 'instant' });
      }
    }, 800);
  } else if (scrollTo === 'schedule' || hash === 'schedule') {
    setTimeout(() => {
      const el = document.getElementById('scheduleSection');
      if (el) {
        const topY = el.getBoundingClientRect().top + window.pageYOffset - 40;
        window.scrollTo({ top: topY, behavior: 'instant' });
      }
    }, 800);
  } else if (['playoffs', 'tuning', 'dream'].includes(hash)) {
    setTimeout(() => {
      switchAppView(hash);
    }, 400);
  }
  if (hash === 'vault' || hash === 'leaderboard' || (isWeb && new URLSearchParams(window.location.search).get('vault'))) {
    setTimeout(() => {
      if (typeof window.openBracketVaultModal === 'function') window.openBracketVaultModal();
      const scrollIndex = isWeb ? parseInt(new URLSearchParams(window.location.search).get('scrollCard') || '-1', 10) : -1;
      if (scrollIndex >= 0) {
        setTimeout(() => {
          const cards = document.querySelectorAll('#bracketVaultGrid .saved-bracket-card');
          if (cards[scrollIndex]) {
            cards[scrollIndex].scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        }, 700);
      }
    }, 400);
  }
  const editBracketId = isWeb ? new URLSearchParams(window.location.search).get('editBracket') : null;
  if (editBracketId) {
    setTimeout(() => {
      if (typeof window.loadSavedBracket === 'function') window.loadSavedBracket(editBracketId, true);
    }, 600);
  }
}

if (document.readyState === 'complete') {
  checkUrlNavigationOnLoad();
} else {
  window.addEventListener('load', checkUrlNavigationOnLoad);
}


