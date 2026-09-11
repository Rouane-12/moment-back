/**
 * L'Infiltré - Social Deduction Game
 * 4-12 players · Secret roles · Night/Day phases
 */

function createGameId() {
  return Math.random().toString(36).substring(2, 10);
}

// Roles configuration
const ROLES = {
  citizen: { name: 'Citoyen', emoji: '👤', team: 'village', objective: 'Éliminer tous les Infiltrés' },
  infiltrated: { name: 'Infiltré', emoji: '🕵️', team: 'infiltrated', objective: 'Éliminer les Citoyens sans être découvert' },
  detective: { name: 'Détective', emoji: '🔎', team: 'village', objective: 'Trouver un Infiltré et survivre' },
  guard: { name: 'Garde', emoji: '🛡️', team: 'village', objective: 'Protéger les villageois' },
  impostor: { name: 'Imposteur', emoji: '🎭', team: 'neutral', objective: 'Faire éliminer le Détective' }
};

// Create a new Infiltrated game
function createInfiltratedGame(creatorId, playerIds) {
  const gameId = createGameId();
  const allPlayers = [creatorId, ...playerIds];

  // Assign roles based on player count
  const roles = assignRoles(allPlayers);

  return {
    id: gameId,
    type: 'infiltrated',
    players: allPlayers,
    createdBy: creatorId,
    state: 'waiting', // waiting, night, day, voting, finished
    phase: 'lobby', // lobby, night_action, night_result, day_discussion, day_vote, vote_result
    day: 0,
    roles: roles,
    playerRoles: {}, // Will be populated when game starts (secret)
    alive: allPlayers.reduce((acc, p) => ({ ...acc, [p]: true }), {}),
    eliminated: [],
    nightActions: {},
    votes: {},
    clues: [],
    discussionTime: 180, // 3 minutes discussion
    voteTime: 30, // 30 seconds voting
    phaseStartTime: null,
    winner: null,
    winReason: null
  };
}

// Assign roles based on player count
function assignRoles(playerIds) {
  const count = playerIds.length;
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const roles = {};

  // Base configuration
  if (count >= 4 && count <= 6) {
    // 4-6 players: 1 Infiltré, 1 Détective, rest Citizens
    roles[shuffled[0]] = 'infiltrated';
    roles[shuffled[1]] = 'detective';
    for (let i = 2; i < count; i++) {
      roles[shuffled[i]] = 'citizen';
    }
  } else if (count >= 7 && count <= 9) {
    // 7-9 players: 2 Infiltrés, 1 Détective, 1 Garde, rest Citizens
    roles[shuffled[0]] = 'infiltrated';
    roles[shuffled[1]] = 'infiltrated';
    roles[shuffled[2]] = 'detective';
    roles[shuffled[3]] = 'guard';
    for (let i = 4; i < count; i++) {
      roles[shuffled[i]] = 'citizen';
    }
  } else if (count >= 10) {
    // 10+ players: 2-3 Infiltrés, 1 Détective, 1 Garde, 1 Imposteur, rest Citizens
    const infiltratedCount = count >= 12 ? 3 : 2;
    for (let i = 0; i < infiltratedCount; i++) {
      roles[shuffled[i]] = 'infiltrated';
    }
    roles[shuffled[infiltratedCount]] = 'detective';
    roles[shuffled[infiltratedCount + 1]] = 'guard';
    roles[shuffled[infiltratedCount + 2]] = 'impostor';
    for (let i = infiltratedCount + 3; i < count; i++) {
      roles[shuffled[i]] = 'citizen';
    }
  }

  return roles;
}

// Start the game (reveal roles to each player)
function startGame(game, io) {
  game.state = 'night';
  game.phase = 'night_action';
  game.day = 1;
  game.phaseStartTime = Date.now();
  game.playerRoles = { ...game.roles };
  game.nightActions = {};

  // Send role to each player privately
  for (const playerId of game.players) {
    const role = game.playerRoles[playerId];
    const roleInfo = ROLES[role];
    io.to(`user:${playerId}`).emit('infiltrated-role', {
      role,
      roleName: roleInfo.name,
      emoji: roleInfo.emoji,
      objective: roleInfo.objective,
      team: roleInfo.team
    });
  }

  // Start night phase timer
  game._nightTimer = setTimeout(() => {
    resolveNightPhase(game, io);
  }, 30000); // 30 seconds for night actions

  emitGameState(game, io);
}

// Night action: Infiltrated eliminates
function nightEliminate(game, playerId, targetId, io) {
  if (game.phase !== 'night_action') return;
  if (!game.alive[playerId]) return;
  if (game.playerRoles[playerId] !== 'infiltrated') return;
  if (!game.alive[targetId]) return;

  game.nightActions[playerId] = { type: 'eliminate', target: targetId };
  emitGameState(game, io);
}

// Night action: Detective investigates
function nightInvestigate(game, playerId, targetId, io) {
  if (game.phase !== 'night_action') return;
  if (!game.alive[playerId]) return;
  if (game.playerRoles[playerId] !== 'detective') return;
  if (!game.alive[targetId]) return;

  const targetRole = game.playerRoles[targetId];
  const isInfiltrated = targetRole === 'infiltrated';

  game.nightActions[playerId] = { type: 'investigate', target: targetId, result: isInfiltrated };

  // Send result to detective only
  io.to(`user:${playerId}`).emit('infiltrated-investigation', {
    target: targetId,
    isInfiltrated
  });

  emitGameState(game, io);
}

// Night action: Guard protects
function nightProtect(game, playerId, targetId, io) {
  if (game.phase !== 'night_action') return;
  if (!game.alive[playerId]) return;
  if (game.playerRoles[playerId] !== 'guard') return;
  if (!game.alive[targetId]) return;

  game.nightActions[playerId] = { type: 'protect', target: targetId };
  emitGameState(game, io);
}

// Resolve night phase
function resolveNightPhase(game, io) {
  if (game._nightTimer) clearTimeout(game._nightTimer);

  game.phase = 'night_result';

  // Process night actions
  let eliminated = null;
  const protected = new Set();

  for (const [playerId, action] of Object.entries(game.nightActions)) {
    if (action.type === 'protect') {
      protected.add(action.target);
    }
  }

  for (const [playerId, action] of Object.entries(game.nightActions)) {
    if (action.type === 'eliminate' && !protected.has(action.target)) {
      eliminated = action.target;
      break;
    }
  }

  // Eliminate player
  if (eliminated) {
    game.alive[eliminated] = false;
    game.eliminated.push({ player: eliminated, day: game.day, reason: 'night' });
  }

  // Generate clue
  const clue = generateClue(game, eliminated);
  game.clues.push({ day: game.day, text: clue });

  // Check win condition
  const winResult = checkWinCondition(game);
  if (winResult) {
    game.winner = winResult.winner;
    game.winReason = winResult.reason;
    game.state = 'finished';
    emitGameState(game, io);
    return;
  }

  // Move to day phase
  setTimeout(() => {
    startDayPhase(game, io);
  }, 5000); // 5 seconds to show night result

  emitGameState(game, io);
}

// Generate a public clue
function generateClue(game, eliminated) {
  const clues = [
    `L'Infiltré n'a pas choisi un joueur situé à côté de lui dans la liste.`,
    `Parmi les joueurs encore en vie, l'un possède un rôle hostile.`,
    `L'Infiltré a utilisé son pouvoir pendant les 20 dernières secondes de la nuit.`,
    `Le Détective a enquêté sur un joueur qui n'est pas un Infiltré.`,
    `Le Garde a protégé quelqu'un cette nuit.`,
    eliminated ? `Un joueur a été éliminé cette nuit.` : `Personne n'a été éliminé cette nuit.`
  ];

  return clues[Math.floor(Math.random() * clues.length)];
}

// Start day phase
function startDayPhase(game, io) {
  game.phase = 'day_discussion';
  game.phaseStartTime = Date.now();
  game.votes = {};

  // Discussion timer
  game._discussionTimer = setTimeout(() => {
    startVotingPhase(game, io);
  }, game.discussionTime * 1000);

  emitGameState(game, io);
}

// Vote to eliminate
function vote(game, playerId, targetId, io) {
  if (game.phase !== 'day_vote') return;
  if (!game.alive[playerId]) return;
  if (!game.alive[targetId]) return;

  game.votes[playerId] = targetId;
  emitGameState(game, io);

  // Check if all alive players voted
  const alivePlayers = game.players.filter(p => game.alive[p]);
  if (Object.keys(game.votes).length === alivePlayers.length) {
    resolveVoting(game, io);
  }
}

// Start voting phase
function startVotingPhase(game, io) {
  if (game._discussionTimer) clearTimeout(game._discussionTimer);

  game.phase = 'day_vote';
  game.votes = {};

  // Voting timer
  game._voteTimer = setTimeout(() => {
    resolveVoting(game, io);
  }, game.voteTime * 1000);

  emitGameState(game, io);
}

// Resolve voting
function resolveVoting(game, io) {
  if (game._voteTimer) clearTimeout(game._voteTimer);

  game.phase = 'vote_result';

  // Count votes
  const voteCount = {};
  for (const [voter, target] of Object.entries(game.votes)) {
    voteCount[target] = (voteCount[target] || 0) + 1;
  }

  // Find player with most votes
  let maxVotes = 0;
  let eliminated = null;
  for (const [playerId, count] of Object.entries(voteCount)) {
    if (count > maxVotes) {
      maxVotes = count;
      eliminated = playerId;
    }
  }

  // Eliminate if more than half voted for them
  const alivePlayers = game.players.filter(p => game.alive[p]);
  if (eliminated && maxVotes > alivePlayers.length / 2) {
    game.alive[eliminated] = false;
    game.eliminated.push({ player: eliminated, day: game.day, reason: 'vote' });

    // Reveal role
    const role = game.playerRoles[eliminated];
    io.emit('infiltrated-elimination', {
      player: eliminated,
      role,
      roleName: ROLES[role].name
    });
  }

  // Check win condition
  const winResult = checkWinCondition(game);
  if (winResult) {
    game.winner = winResult.winner;
    game.winReason = winResult.reason;
    game.state = 'finished';
    emitGameState(game, io);
    return;
  }

  // Next night
  setTimeout(() => {
    game.day++;
    game.phase = 'night_action';
    game.nightActions = {};
    game.phaseStartTime = Date.now();

    game._nightTimer = setTimeout(() => {
      resolveNightPhase(game, io);
    }, 30000);

    emitGameState(game, io);
  }, 5000);

  emitGameState(game, io);
}

// Check win condition
function checkWinCondition(game) {
  const alivePlayers = game.players.filter(p => game.alive[p]);
  const aliveRoles = alivePlayers.map(p => game.playerRoles[p]);

  const infiltratedAlive = aliveRoles.filter(r => r === 'infiltrated').length;
  const villageAlive = aliveRoles.filter(r => r !== 'infiltrated').length;
  const detectiveAlive = aliveRoles.includes('detective');

  // Village wins if all infiltrated eliminated
  if (infiltratedAlive === 0) {
    return { winner: 'village', reason: 'Tous les Infiltrés ont été éliminés' };
  }

  // Infiltrated wins if they equal or outnumber village
  if (infiltratedAlive >= villageAlive) {
    return { winner: 'infiltrated', reason: 'Les Infiltrés ont pris le contrôle' };
  }

  // Imposteur wins if detective eliminated
  if (!detectiveAlive) {
    const impostorAlive = aliveRoles.includes('impostor');
    if (impostorAlive) {
      return { winner: 'impostor', reason: 'Le Détective a été éliminé' };
    }
  }

  return null;
}

// Build game state for a specific player
function buildView(game, playerId) {
  const view = { ...game };

  // Hide other players' roles
  if (game.state !== 'finished') {
    view.playerRoles = {};
    view.playerRoles[playerId] = game.playerRoles[playerId];
  }

  // Hide night actions except for own
  if (game.phase === 'night_action' || game.phase === 'night_result') {
    view.nightActions = {};
    if (game.nightActions[playerId]) {
      view.nightActions[playerId] = game.nightActions[playerId];
    }
  }

  return view;
}

// Emit game state to all players
function emitGameState(game, io) {
  for (const playerId of game.players) {
    io.to(`user:${playerId}`).emit('game-state', { game: buildView(game, playerId) });
  }
}

// Clear timers
function clearTimers(game) {
  if (game._nightTimer) clearTimeout(game._nightTimer);
  if (game._discussionTimer) clearTimeout(game._discussionTimer);
  if (game._voteTimer) clearTimeout(game._voteTimer);
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
  ROLES
};
