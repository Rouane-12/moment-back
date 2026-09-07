/**
 * Multiplayer Mini-Games Engine
 * Games appear as cards inside conversations
 * Real-time via Socket.IO
 */

// In-memory game state (production: use Redis)
const activeGames = new Map(); // gameId → game state

function createGameId() {
  return Math.random().toString(36).substring(2, 10);
}

function createBaseGame(type, p1, p2) {
  return {
    id: createGameId(),
    type,
    players: [p1, p2],
    scores: { [p1]: 0, [p2]: 0 },
    currentRound: 0,
    maxRounds: 5,
    state: 'waiting', // waiting | playing | finished
    moves: {},
    winner: null,
    createdAt: Date.now(),
  };
}

// === REFLEX GAME ===
function createReflexGame(p1, p2) {
  return {
    ...createBaseGame('reflex', p1, p2),
    phase: 'idle', // idle | waiting | green | result
    signalTime: null,
    reactionTimes: {},
    roundWinner: null,
    maxRounds: 3,
  };
}

function startReflexRound(game) {
  game.phase = 'waiting';
  game.currentRound++;
  game.reactionTimes = {};
  game.roundWinner = null;
  game.moves = {};
  // Random delay 1-5 seconds
  const delay = 1000 + Math.random() * 4000;
  game.signalTimeout = setTimeout(() => {
    game.phase = 'green';
    game.signalTime = Date.now();
  }, delay);
  return game;
}

function reflexReact(game, userId) {
  if (game.phase !== 'green' || game.moves[userId]) return null;
  const reactionTime = Date.now() - game.signalTime;
  game.moves[userId] = reactionTime;
  game.reactionTimes[userId] = reactionTime;

  // Check if both players have reacted
  if (Object.keys(game.moves).length === 2) {
    game.phase = 'result';
    const [p1, p2] = game.players;
    const t1 = game.reactionTimes[p1] || Infinity;
    const t2 = game.reactionTimes[p2] || Infinity;
    if (t1 < t2) {
      game.scores[p1]++;
      game.roundWinner = p1;
    } else {
      game.scores[p2]++;
      game.roundWinner = p2;
    }
    // Check if game is over
    if (game.currentRound >= game.maxRounds) {
      game.state = 'finished';
      const [a, b] = game.players;
      game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
    }
  }
  return game;
}

function falseStartReflex(game, userId) {
  if (game.phase !== 'waiting') return null;
  game.phase = 'result';
  game.roundWinner = 'false_start';
  if (game.signalTimeout) clearTimeout(game.signalTimeout);
  game.scores[userId === game.players[0] ? game.players[1] : game.players[0]]++;
  if (game.currentRound >= game.maxRounds) {
    game.state = 'finished';
    const [a, b] = game.players;
    game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
  }
  return game;
}

// === TIC-TAC-TOE ===
function createTicTacToeGame(p1, p2) {
  return {
    ...createBaseGame('tictactoe', p1, p2),
    board: Array(9).fill(null),
    currentTurn: p1,
    marks: { [p1]: 'X', [p2]: 'O' },
    winner: null,
    isDraw: false,
    maxRounds: 3,
  };
}

const TTT_WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function checkTTTWinner(board) {
  for (const [a,b,c] of TTT_WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(v => v !== null) ? 'draw' : null;
}

function tttMove(game, userId, cellIndex) {
  if (game.state !== 'playing' || game.currentTurn !== userId) return null;
  if (game.board[cellIndex] !== null) return null;
  game.board[cellIndex] = game.marks[userId];
  const result = checkTTTWinner(game.board);
  if (result) {
    game.state = 'finished';
    if (result === 'draw') {
      game.isDraw = true;
      game.winner = 'draw';
    } else {
      game.winner = userId;
      game.scores[userId]++;
    }
  } else {
    game.currentTurn = game.currentTurn === game.players[0] ? game.players[1] : game.players[0];
  }
  return game;
}

function tttRematch(game) {
  game.board = Array(9).fill(null);
  game.currentTurn = game.players[0];
  game.currentRound++;
  game.state = 'playing';
  game.winner = null;
  game.isDraw = false;
  return game;
}

// === ROCK-PAPER-SCISSORS ===
function createRPSGame(p1, p2) {
  return {
    ...createBaseGame('rps', p1, p2),
    choices: {},
    phase: 'choosing', // choosing | revealed | result
    maxRounds: 5,
  };
}

const RPS_BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

function rpsMove(game, userId, choice) {
  if (game.phase !== 'choosing') return null;
  if (!['rock', 'paper', 'scissors'].includes(choice)) return null;
  game.moves[userId] = choice;

  if (Object.keys(game.moves).length === 2) {
    game.choices = { ...game.moves };
    game.phase = 'revealed';
    const [p1, p2] = game.players;
    const c1 = game.moves[p1];
    const c2 = game.moves[p2];
    let roundWinner;
    if (c1 === c2) {
      roundWinner = 'draw';
    } else if (RPS_BEATS[c1] === c2) {
      roundWinner = p1;
      game.scores[p1]++;
    } else {
      roundWinner = p2;
      game.scores[p2]++;
    }
    game.roundWinner = roundWinner;

    if (game.currentRound >= game.maxRounds) {
      game.state = 'finished';
      const [a, b] = game.players;
      game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
    }
  }
  return game;
}

function rpsNextRound(game) {
  game.currentRound++;
  game.moves = {};
  game.choices = {};
  game.phase = 'choosing';
  game.roundWinner = null;
  return game;
}

// === DICE DUEL ===
function createDiceGame(p1, p2, mode = 'duel') {
  return {
    ...createBaseGame('dice', p1, p2),
    mode, // duel | twentyone
    dice: {},
    phase: 'rolling', // rolling | done
    total: {},
    maxRounds: 3,
  };
}

function diceRoll(game, userId) {
  if (game.phase !== 'rolling' || game.moves[userId]) return null;
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  game.dice[userId] = [d1, d2];
  game.total[userId] = d1 + d2;
  game.moves[userId] = true;

  if (Object.keys(game.moves).length === 2) {
    game.phase = 'done';
    const [p1, p2] = game.players;
    if (game.total[p1] > game.total[p2]) {
      game.scores[p1]++;
      game.roundWinner = p1;
    } else if (game.total[p1] < game.total[p2]) {
      game.scores[p2]++;
      game.roundWinner = p2;
    } else {
      game.roundWinner = 'draw';
    }
    if (game.currentRound >= game.maxRounds) {
      game.state = 'finished';
      const [a, b] = game.players;
      game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
    }
  }
  return game;
}

function diceRematch(game) {
  game.currentRound++;
  game.moves = {};
  game.dice = {};
  game.total = {};
  game.phase = 'rolling';
  game.roundWinner = null;
  game.state = 'playing';
  return game;
}

// === PUBLIC API ===
function setupGameEvents(socket, io, getUserId) {
  socket.on('game-invite', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const { to, gameType } = data;
    const gameId = createGameId();
    let game;
    switch (gameType) {
      case 'reflex': game = createReflexGame(userId, to); break;
      case 'tictactoe': game = createTicTacToeGame(userId, to); break;
      case 'rps': game = createRPSGame(userId, to); break;
      case 'dice': game = createDiceGame(userId, to); break;
      default: return;
    }
    game.id = gameId;
    game.state = 'waiting';
    game.createdBy = userId;
    activeGames.set(gameId, game);
    console.log(`🎮 Game invite: ${gameType} from ${userId} to ${to}, id: ${gameId}`);
    io.to(`user:${to}`).emit('game-invite', { game, from: userId });
    io.to(`user:${userId}`).emit('game-invite', { game, from: userId });
  });

  socket.on('game-accept', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game || game.state !== 'waiting') return;
    game.state = 'playing';
    console.log(`🎮 Game accepted: ${game.type}, id: ${gameId}`);
    // Emit to both players
    io.to(`user:${game.players[0]}`).emit('game-start', { game });
    io.to(`user:${game.players[1]}`).emit('game-start', { game });
    // Auto-start first round for reflex
    if (game.type === 'reflex') {
      startReflexRound(game);
      io.to(`user:${game.players[0]}`).emit('game-state', { game });
      io.to(`user:${game.players[1]}`).emit('game-state', { game });
    } else if (game.type === 'rps') {
      game.currentRound++;
      io.to(`user:${game.players[0]}`).emit('game-state', { game });
      io.to(`user:${game.players[1]}`).emit('game-state', { game });
    } else if (game.type === 'dice') {
      game.currentRound++;
      io.to(`user:${game.players[0]}`).emit('game-state', { game });
      io.to(`user:${game.players[1]}`).emit('game-state', { game });
    }
  });

  socket.on('game-decline', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;
    game.state = 'finished';
    io.to(`user:${game.players[0]}`).emit('game-state', { game });
    io.to(`user:${game.players[1]}`).emit('game-state', { game });
    activeGames.delete(gameId);
  });

  socket.on('game-move', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const { gameId, move, cellIndex, choice } = data;
    const game = activeGames.get(gameId);
    if (!game) return;
    let updated = false;
    switch (game.type) {
      case 'reflex':
        if (move === 'react') { reflexReact(game, userId); updated = true; }
        if (move === 'false-start') { falseStartReflex(game, userId); updated = true; }
        break;
      case 'tictactoe':
        if (cellIndex !== undefined) { tttMove(game, userId, cellIndex); updated = true; }
        break;
      case 'rps':
        if (choice) { rpsMove(game, userId, choice); updated = true; }
        break;
      case 'dice':
        if (move === 'roll') { diceRoll(game, userId); updated = true; }
        break;
    }
    if (updated) {
      io.to(`user:${game.players[0]}`).emit('game-state', { game });
      io.to(`user:${game.players[1]}`).emit('game-state', { game });
    }
  });

  socket.on('game-rematch', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game || game.state !== 'finished') return;
    switch (game.type) {
      case 'tictactoe': tttRematch(game); break;
      case 'dice': diceRematch(game); break;
      case 'reflex': game.currentRound = 0; game.scores = {}; game.players.forEach(p => game.scores[p] = 0); game.state = 'playing'; startReflexRound(game); break;
      case 'rps': game.currentRound = 0; game.scores = {}; game.players.forEach(p => game.scores[p] = 0); game.state = 'playing'; game.phase = 'choosing'; game.currentRound = 1; break;
    }
    io.to(`user:${game.players[0]}`).emit('game-state', { game });
    io.to(`user:${game.players[1]}`).emit('game-state', { game });
  });

  socket.on('game-next-round', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const { gameId } = data;
    const game = activeGames.get(gameId);
    if (!game) return;
    if (game.type === 'rps') { rpsNextRound(game); }
    io.to(`user:${game.players[0]}`).emit('game-state', { game });
    io.to(`user:${game.players[1]}`).emit('game-state', { game });
  });

  socket.on('disconnect', () => {
    const userId = getUserId(socket);
    if (!userId) return;
    // Clean up games where this user was playing
    for (const [id, game] of activeGames) {
      if (game.players.includes(userId) && game.state === 'playing') {
        game.state = 'finished';
        const other = game.players.find(p => p !== userId);
        if (other) {
          io.to(`user:${other}`).emit('game-state', { game });
        }
        activeGames.delete(id);
      }
    }
  });
}

module.exports = { setupGameEvents, activeGames };
