/**
 * L'Infiltré — jeu social de déduction (4 à 12 joueurs)
 * Rôles secrets · Nuit / Jour · Discussion · Vote
 *
 * Corrections clés :
 * - buildView() ne divulgue plus JAMAIS la carte complète des rôles
 * - La phase de jour passe bien par discussion → vote (state='day' puis 'voting')
 * - Les timers de transition sont nettoyés (clearTimers)
 * - Les icônes de rôle sont des noms d'icônes Lucide (pas d'emojis)
 */

function createGameId() {
  return 'inf_' + Math.random().toString(36).substring(2, 10);
}

// Rôles — `icon` = nom d'icône Lucide (le front la résout)
const ROLES = {
  citizen:     { name: 'Citoyen',   icon: 'User',         color: 'sky',     team: 'village',     objective: 'Élimine tous les Infiltrés. Vote intelligemment le jour.' },
  infiltrated: { name: 'Infiltré',  icon: 'VenetianMask', color: 'red',     team: 'infiltrated', objective: 'Élimine les Citoyens la nuit sans te faire démasquer.' },
  detective:   { name: 'Détective', icon: 'Search',       color: 'blue',    team: 'village',     objective: 'Enquête chaque nuit et démasque les Infiltrés.' },
  guard:       { name: 'Garde',     icon: 'ShieldCheck',  color: 'green',   team: 'village',     objective: 'Protège un joueur chaque nuit contre l\'élimination.' },
  impostor:    { name: 'Imposteur', icon: 'Drama',        color: 'yellow',  team: 'neutral',     objective: 'Fais éliminer le Détective. Tu n\'es ni Village ni Infiltré.' },
};

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;
const NIGHT_TIME_MS = 30000;   // 30 s pour les actions de nuit
const NIGHT_RESULT_MS = 6000;  // 6 s pour lire le résultat de la nuit
const DISCUSSION_TIME_S = 120; // 2 min de discussion
const VOTE_TIME_S = 30;        // 30 s de vote
const VOTE_RESULT_MS = 6000;   // 6 s pour lire le résultat du vote

function createInfiltratedGame(creatorId, playerIds) {
  const allPlayers = [creatorId, ...playerIds.filter((p) => p !== creatorId)];
  if (allPlayers.length < MIN_PLAYERS) return null;

  return {
    id: createGameId(),
    type: 'infiltrated',
    players: allPlayers,
    createdBy: creatorId,
    state: 'waiting',   // waiting | night | day | voting | finished
    phase: 'lobby',     // lobby | night_action | night_result | day_discussion | day_vote | vote_result
    day: 0,
    roles: null,        // attribués au démarrage (jamais envoyés aux clients)
    playerRoles: {},    // rôle par joueur (secret)
    alive: allPlayers.reduce((acc, p) => ({ ...acc, [p]: true }), {}),
    eliminated: [],     // { player, day, reason, role, roleName }
    nightActions: {},
    votes: {},
    clues: [],
    discussionTime: DISCUSSION_TIME_S,
    voteTime: VOTE_TIME_S,
    phaseDeadline: null,
    winner: null,
    winReason: null,
    lastNightResult: null,
    lastVoteResult: null,
    _nightTimer: null,
    _phaseTimer: null,
  };
}

function assignRoles(playerIds) {
  const count = playerIds.length;
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const roles = {};

  if (count <= 6) {
    // 4-6 joueurs : 1 Infiltré, 1 Détective, le reste Citoyens
    roles[shuffled[0]] = 'infiltrated';
    roles[shuffled[1]] = 'detective';
    for (let i = 2; i < count; i++) roles[shuffled[i]] = 'citizen';
  } else if (count <= 9) {
    // 7-9 joueurs : 2 Infiltrés, 1 Détective, 1 Garde
    roles[shuffled[0]] = 'infiltrated';
    roles[shuffled[1]] = 'infiltrated';
    roles[shuffled[2]] = 'detective';
    roles[shuffled[3]] = 'guard';
    for (let i = 4; i < count; i++) roles[shuffled[i]] = 'citizen';
  } else {
    // 10-12 joueurs : 2-3 Infiltrés, 1 Détective, 1 Garde, 1 Imposteur
    const infiltratedCount = count >= 12 ? 3 : 2;
    for (let i = 0; i < infiltratedCount; i++) roles[shuffled[i]] = 'infiltrated';
    roles[shuffled[infiltratedCount]] = 'detective';
    roles[shuffled[infiltratedCount + 1]] = 'guard';
    roles[shuffled[infiltratedCount + 2]] = 'impostor';
    for (let i = infiltratedCount + 3; i < count; i++) roles[shuffled[i]] = 'citizen';
  }
  return roles;
}

// ── Démarrage ────────────────────────────────────────────────
function startGame(game, io) {
  if (game.state !== 'waiting') return false;
  if (game.players.length < MIN_PLAYERS) return false;

  game.roles = assignRoles(game.players);
  game.playerRoles = { ...game.roles };
  game.state = 'night';
  game.day = 1;
  game.nightActions = {};
  beginNightAction(game, io);
  return true;
}

function beginNightAction(game, io) {
  game.state = 'night';
  game.phase = 'night_action';
  game.nightActions = {};
  game.phaseDeadline = Date.now() + NIGHT_TIME_MS;
  if (game._nightTimer) clearTimeout(game._nightTimer);
  game._nightTimer = setTimeout(() => resolveNightPhase(game, io), NIGHT_TIME_MS);
  emitGameState(game, io);
}

// ── Actions de nuit ──────────────────────────────────────────
function nightEliminate(game, playerId, targetId, io) {
  if (game.state !== 'night' || game.phase !== 'night_action') return false;
  if (game.playerRoles[playerId] !== 'infiltrated') return false;
  if (!game.alive[playerId] || !game.alive[targetId] || targetId === playerId) return false;
  game.nightActions[playerId] = { type: 'eliminate', target: targetId };
  emitGameState(game, io);
  return true;
}

function nightInvestigate(game, playerId, targetId, io) {
  if (game.state !== 'night' || game.phase !== 'night_action') return false;
  if (game.playerRoles[playerId] !== 'detective') return false;
  if (!game.alive[playerId] || !game.alive[targetId] || targetId === playerId) return false;

  game.nightActions[playerId] = { type: 'investigate', target: targetId };
  // Résultat envoyé UNIQUEMENT au détective
  io.to(`user:${playerId}`).emit('infiltrated-investigation', {
    gameId: game.id,
    target: targetId,
    isInfiltrated: game.playerRoles[targetId] === 'infiltrated',
  });
  emitGameState(game, io);
  return true;
}

function nightProtect(game, playerId, targetId, io) {
  if (game.state !== 'night' || game.phase !== 'night_action') return false;
  if (game.playerRoles[playerId] !== 'guard') return false;
  if (!game.alive[playerId] || !game.alive[targetId]) return false;
  game.nightActions[playerId] = { type: 'protect', target: targetId };
  emitGameState(game, io);
  return true;
}

// ── Résolution de la nuit ────────────────────────────────────
function resolveNightPhase(game, io) {
  if (game.state !== 'night') return;
  if (game._nightTimer) { clearTimeout(game._nightTimer); game._nightTimer = null; }

  const protectedTargets = new Set();
  for (const action of Object.values(game.nightActions)) {
    if (action.type === 'protect') protectedTargets.add(action.target);
  }

  let eliminated = null;
  for (const action of Object.values(game.nightActions)) {
    if (action.type === 'eliminate' && !protectedTargets.has(action.target)) {
      eliminated = action.target;
      break;
    }
  }

  if (eliminated) {
    game.alive[eliminated] = false;
    const role = game.playerRoles[eliminated];
    game.eliminated.push({ player: eliminated, day: game.day, reason: 'night', role, roleName: ROLES[role].name });
  }

  game.clues.push({ day: game.day, text: generateClue(game, eliminated) });
  game.lastNightResult = { day: game.day, eliminated, wasProtected: !eliminated && Object.values(game.nightActions).some((a) => a.type === 'eliminate') };
  game.phase = 'night_result';
  game.phaseDeadline = Date.now() + NIGHT_RESULT_MS;
  emitGameState(game, io);

  game._phaseTimer = setTimeout(() => {
    const win = checkWinCondition(game);
    if (win) return finishGame(game, io, win);
    startDayPhase(game, io);
  }, NIGHT_RESULT_MS);
}

function generateClue(game, eliminated) {
  const alive = game.players.filter((p) => game.alive[p]);
  const pool = [
    eliminated
      ? `La victime de cette nuit n'était pas protégée par le Garde.`
      : `Personne n'est mort cette nuit : le Garde a bien joué.`,
    `Il reste ${alive.length} joueurs en vie.`,
    `Les Infiltrés frappent silencieusement… observez les votes du jour.`,
    `Le Détective en sait peut-être plus qu'il ne le montre.`,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Phase de jour ────────────────────────────────────────────
function startDayPhase(game, io) {
  game.state = 'day';
  game.phase = 'day_discussion';
  game.votes = {};
  game.phaseDeadline = Date.now() + game.discussionTime * 1000;
  if (game._phaseTimer) clearTimeout(game._phaseTimer);
  game._phaseTimer = setTimeout(() => startVotingPhase(game, io), game.discussionTime * 1000);
  emitGameState(game, io);
}

function startVotingPhase(game, io) {
  if (game.state !== 'day') return;
  game.state = 'voting';
  game.phase = 'day_vote';
  game.votes = {};
  game.phaseDeadline = Date.now() + game.voteTime * 1000;
  if (game._phaseTimer) clearTimeout(game._phaseTimer);
  game._phaseTimer = setTimeout(() => resolveVoting(game, io), game.voteTime * 1000);
  emitGameState(game, io);
}

function vote(game, playerId, targetId, io) {
  if (game.state !== 'voting' || game.phase !== 'day_vote') return false;
  if (!game.alive[playerId] || !game.alive[targetId] || targetId === playerId) return false;
  game.votes[playerId] = targetId;
  emitGameState(game, io);

  const aliveCount = game.players.filter((p) => game.alive[p]).length;
  // Résolution anticipée : un candidat a déjà la majorité absolue
  // (les votes restants ne peuvent que diviser les autres candidats)
  const tally = {};
  for (const t of Object.values(game.votes)) tally[t] = (tally[t] || 0) + 1;
  if (Object.values(tally).some((n) => n > aliveCount / 2)) {
    resolveVoting(game, io);
    return true;
  }
  // Tous les vivants ont voté
  if (Object.keys(game.votes).length >= aliveCount) resolveVoting(game, io);
  return true;
}

function resolveVoting(game, io) {
  if (game.state !== 'voting') return;
  if (game._phaseTimer) { clearTimeout(game._phaseTimer); game._phaseTimer = null; }

  const tally = {};
  for (const target of Object.values(game.votes)) {
    tally[target] = (tally[target] || 0) + 1;
  }

  let maxVotes = 0, top = null, tie = false;
  for (const [playerId, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; top = playerId; tie = false; }
    else if (count === maxVotes) tie = true;
  }

  const alivePlayers = game.players.filter((p) => game.alive[p]);
  let eliminated = null;
  // Éliminé seulement si majorité stricte (évite les éliminations au hasard)
  if (top && !tie && maxVotes > alivePlayers.length / 2) eliminated = top;

  if (eliminated) {
    game.alive[eliminated] = false;
    const role = game.playerRoles[eliminated];
    game.eliminated.push({ player: eliminated, day: game.day, reason: 'vote', role, roleName: ROLES[role].name });
  }

  game.lastVoteResult = { day: game.day, eliminated, tie, tally, noMajority: !eliminated };
  game.phase = 'vote_result';
  game.phaseDeadline = Date.now() + VOTE_RESULT_MS;
  emitGameState(game, io);

  game._phaseTimer = setTimeout(() => {
    const win = checkWinCondition(game);
    if (win) return finishGame(game, io, win);
    game.day++;
    beginNightAction(game, io);
  }, VOTE_RESULT_MS);
}

// ── Fin de partie ────────────────────────────────────────────
function checkWinCondition(game) {
  const alivePlayers = game.players.filter((p) => game.alive[p]);
  const aliveRoles = alivePlayers.map((p) => game.playerRoles[p]);
  const infiltratedAlive = aliveRoles.filter((r) => r === 'infiltrated').length;
  const villageAlive = alivePlayers.length - infiltratedAlive;
  const detectiveAlive = aliveRoles.includes('detective');

  if (infiltratedAlive === 0) {
    return { winner: 'village', reason: 'Tous les Infiltrés ont été démasqués !' };
  }
  if (infiltratedAlive >= villageAlive) {
    return { winner: 'infiltrated', reason: 'Les Infiltrés sont majoritaires : le village tombe.' };
  }
  if (!detectiveAlive) {
    if (aliveRoles.includes('impostor')) {
      return { winner: 'impostor', reason: 'Le Détective a été éliminé : l\'Imposteur gagne.' };
    }
    // Détective mort sans imposteur : la partie continue (le village perd son atout)
  }
  return null;
}

function finishGame(game, io, win) {
  game.state = 'finished';
  game.phase = 'finished';
  game.winner = win.winner;
  game.winReason = win.reason;
  game.phaseDeadline = null;
  clearTimers(game);
  // Vue finale : tout le monde découvre tous les rôles
  emitGameState(game, io);
}

// ── Vues ─────────────────────────────────────────────────────
function buildView(game, playerId) {
  const finished = game.state === 'finished';
  return {
    id: game.id,
    type: 'infiltrated',
    players: game.players,
    createdBy: game.createdBy,
    state: game.state,
    phase: game.phase,
    day: game.day,
    // JAMAIS de carte complète des rôles — seulement le sien (ou tous en fin de partie)
    playerRoles: finished ? { ...game.playerRoles } : { [playerId]: game.playerRoles[playerId] },
    alive: { ...game.alive },
    eliminated: game.eliminated,
    votes: game.state === 'voting' ? Object.keys(game.votes) : [],
    voteCount: game.phase === 'vote_result' && game.lastVoteResult ? game.lastVoteResult.tally : null,
    clues: game.clues,
    discussionTime: game.discussionTime,
    voteTime: game.voteTime,
    phaseDeadline: game.phaseDeadline,
    winner: game.winner,
    winReason: game.winReason,
    lastNightResult: game.phase === 'night_result' ? game.lastNightResult : null,
    lastVoteResult: game.phase === 'vote_result' ? game.lastVoteResult : null,
    myAction: game.nightActions[playerId] || null,
    rolesLegend: Object.entries(ROLES).map(([key, r]) => ({ key, name: r.name, icon: r.icon, team: r.team })),
  };
}

function emitGameState(game, io) {
  if (!game || !io) return;
  for (const playerId of game.players) {
    io.to(`user:${playerId}`).emit('game-state', { game: buildView(game, playerId) });
  }
}

function clearTimers(game) {
  if (game._nightTimer) { clearTimeout(game._nightTimer); game._nightTimer = null; }
  if (game._phaseTimer) { clearTimeout(game._phaseTimer); game._phaseTimer = null; }
}

module.exports = {
  createInfiltratedGame,
  startGame,
  nightEliminate,
  nightInvestigate,
  nightProtect,
  vote,
  buildView,
  emitGameState,
  clearTimers,
  ROLES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  // Internals exposés pour les tests
  _internal: { resolveNightPhase, startDayPhase, startVotingPhase, resolveVoting, checkWinCondition },
};
