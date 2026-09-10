/**
 * Multiplayer Mini-Games Engine
 * Real-time via Socket.IO — games appear as cards inside conversations
 */

const { createQuizGame, quizAccept, quizAnswer, quizNext, quizRematch, buildQuizView, clearQuizTimers } = require('./quiz');
const { createBuzzerQuiz, addPlayer, removePlayer, onBuzz, submitAnswer: buzzerSubmitAnswer, quizAccept: buzzerAccept, quizRematch: buzzerRematch, buildBuzzerView, emitBuzzerState } = require('./buzzerQuiz');
const { createCodeSecretGame, makeGuess, switchRoles: codeSecretSwitchRoles, codeSecretAccept, codeSecretRematch, emitCodeSecretState } = require('./codeSecret');
const { createMotIntrusGame, submitAnswer: motIntrusSubmit, motIntrusAccept, motIntrusRematch, emitMotIntrusState } = require('./motIntrus');
const { createDevineCeQueJePenseGame, submitQuestion, submitAnswer: devineSubmitAnswer, guessItem, switchRoles: devineSwitchRoles, devineAccept, devineRematch, emitDevineState } = require('./devineCeQueJePense');
const { createAQuelPointGame, setAnswer: aqpSetAnswer, answerQuestion: aqpAnswer, aQuelPointAccept, aQuelPointRematch, emitAQuelPointState } = require('./aQuelPoint');
const { createDeuxVeritesGame, submitStatements, submitGuess, deuxVeritesAccept, deuxVeritesRematch, emitDeuxVeritesState } = require('./deuxVerites');

const activeGames = new Map();

function createGameId() {
  return Math.random().toString(36).substring(2, 10);
}

function emitGameState(io, game) {
  if (!game) return;
  if (game.type === 'quiz') {
    // Le quiz envoie une vue par joueur (les bonnes réponses ne fuient jamais)
    for (const p of game.players) {
      io.to(`user:${p}`).emit('game-state', { game: buildQuizView(game, p) });
    }
    return;
  }
  io.to(`user:${game.players[0]}`).emit('game-state', { game });
  io.to(`user:${game.players[1]}`).emit('game-state', { game });
}

// ══════════════════════════════════════
// REFLEX
// ══════════════════════════════════════
function createReflexGame(p1, p2) {
  return {
    id: createGameId(), type: 'reflex',
    players: [p1, p2], scores: { [p1]: 0, [p2]: 0 },
    currentRound: 0, maxRounds: 3, state: 'waiting',
    phase: 'idle', signalTime: null, reactionTimes: {},
    roundWinner: null, moves: {},
  };
}

function startReflexRound(game, io) {
  game.phase = 'waiting';
  game.currentRound++;
  game.reactionTimes = {};
  game.roundWinner = null;
  game.moves = {};
  emitGameState(io, game);

  const delay = 1500 + Math.random() * 4000;
  if (game._timer) clearTimeout(game._timer);
  game._timer = setTimeout(() => {
    game.phase = 'green';
    game.signalTime = Date.now();
    emitGameState(io, game);
  }, delay);
}

function reflexReact(game, userId, io) {
  if (game.phase !== 'green' || game.moves[userId]) return;
  const reactionTime = Date.now() - game.signalTime;
  game.moves[userId] = reactionTime;
  game.reactionTimes[userId] = reactionTime;

  if (Object.keys(game.moves).length === 2) {
    game.phase = 'result';
    const [p1, p2] = game.players;
    if ((game.reactionTimes[p1] || Infinity) < (game.reactionTimes[p2] || Infinity)) {
      game.scores[p1]++;
      game.roundWinner = p1;
    } else {
      game.scores[p2]++;
      game.roundWinner = p2;
    }
    if (game.currentRound >= game.maxRounds) {
      game.state = 'finished';
      const [a, b] = game.players;
      game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
    }
  }
  emitGameState(io, game);
}

function reflexFalseStart(game, userId, io) {
  if (game.phase !== 'waiting') return;
  if (game._timer) clearTimeout(game._timer);
  game.phase = 'result';
  game.roundWinner = 'false_start';
  game.scores[userId === game.players[0] ? game.players[1] : game.players[0]]++;
  if (game.currentRound >= game.maxRounds) {
    game.state = 'finished';
    const [a, b] = game.players;
    game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
  }
  emitGameState(io, game);
}

function reflexRematch(game, io) {
  game.state = 'playing';
  game.currentRound = 0;
  game.scores = {};
  game.players.forEach(p => game.scores[p] = 0);
  game.winner = null;
  startReflexRound(game, io);
}

// ══════════════════════════════════════
// TIC-TAC-TOE
// ══════════════════════════════════════
function createTicTacToeGame(p1, p2) {
  return {
    id: createGameId(), type: 'tictactoe',
    players: [p1, p2], scores: { [p1]: 0, [p2]: 0 },
    currentRound: 0, maxRounds: 3, state: 'waiting',
    board: Array(9).fill(null), currentTurn: p1,
    marks: { [p1]: 'X', [p2]: 'O' },
    winner: null, isDraw: false, roundWinner: null,
  };
}

const TTT_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function checkTTT(board) {
  for (const [a,b,c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line: [a,b,c] };
  }
  return board.every(v => v !== null) ? { winner: 'draw', line: [] } : null;
}

function tttMove(game, userId, cellIndex, io) {
  if (game.state !== 'playing' || game.currentTurn !== userId) return;
  if (cellIndex < 0 || cellIndex > 9 || game.board[cellIndex] !== null) return;
  game.board[cellIndex] = game.marks[userId];
  const result = checkTTT(game.board);
  if (result) {
    game.state = 'finished';
    game.winLine = result.line;
    if (result.winner === 'draw') {
      game.isDraw = true; game.winner = 'draw';
    } else {
      game.roundWinner = userId;
      game.winner = userId;
      game.scores[userId]++;
    }
  } else {
    game.currentTurn = game.currentTurn === game.players[0] ? game.players[1] : game.players[0];
  }
  emitGameState(io, game);
}

function tttRematch(game, io) {
  game.board = Array(9).fill(null);
  game.currentTurn = game.players[0];
  game.currentRound++;
  game.state = 'playing';
  game.winner = null; game.isDraw = false; game.roundWinner = null; game.winLine = null;
  emitGameState(io, game);
}

// ══════════════════════════════════════
// ROCK-PAPER-SCISSORS
// ══════════════════════════════════════
function createRPSGame(p1, p2) {
  return {
    id: createGameId(), type: 'rps',
    players: [p1, p2], scores: { [p1]: 0, [p2]: 0 },
    currentRound: 0, maxRounds: 5, state: 'waiting',
    moves: {}, choices: {}, phase: 'choosing',
    roundWinner: null,
  };
}

const RPS_BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

function rpsMove(game, userId, choice, io) {
  if (game.phase !== 'choosing' || !['rock', 'paper', 'scissors'].includes(choice)) return;
  if (!game.moves) game.moves = {};
  game.moves[userId] = choice;

  if (Object.keys(game.moves).length === 2) {
    const [p1, p2] = game.players;
    const c1 = game.moves[p1], c2 = game.moves[p2];
    game.choices = { [p1]: c1, [p2]: c2 };
    game.phase = 'revealed';
    if (c1 === c2) {
      game.roundWinner = 'draw';
    } else if (RPS_BEATS[c1] === c2) {
      game.roundWinner = p1; game.scores[p1]++;
    } else {
      game.roundWinner = p2; game.scores[p2]++;
    }
    if (game.currentRound >= game.maxRounds) {
      game.state = 'finished';
      const [a, b] = game.players;
      game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
    }
  }
  emitGameState(io, game);
}

function rpsNextRound(game, io) {
  game.currentRound++;
  game.moves = {}; game.choices = {};
  game.phase = 'choosing'; game.roundWinner = null;
  emitGameState(io, game);
}

function rpsRematch(game, io) {
  game.state = 'playing'; game.currentRound = 0;
  game.scores = {}; game.players.forEach(p => game.scores[p] = 0);
  game.winner = null; game.currentRound = 1;
  game.moves = {}; game.choices = {}; game.phase = 'choosing'; game.roundWinner = null;
  emitGameState(io, game);
}

// ══════════════════════════════════════
// DICE DUEL
// ══════════════════════════════════════
function createDiceGame(p1, p2) {
  return {
    id: createGameId(), type: 'dice',
    players: [p1, p2], scores: { [p1]: 0, [p2]: 0 },
    currentRound: 0, maxRounds: 3, state: 'waiting',
    dice: {}, total: {}, phase: 'rolling',
    moves: {}, roundWinner: null,
  };
}

function diceRoll(game, userId, io) {
  if (game.phase !== 'rolling' || game.moves[userId]) return;
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  game.dice[userId] = [d1, d2];
  game.total[userId] = d1 + d2;
  game.moves[userId] = true;

  if (Object.keys(game.moves).length === 2) {
    game.phase = 'done';
    const [p1, p2] = game.players;
    if (game.total[p1] > game.total[p2]) { game.scores[p1]++; game.roundWinner = p1; }
    else if (game.total[p1] < game.total[p2]) { game.scores[p2]++; game.roundWinner = p2; }
    else { game.roundWinner = 'draw'; }
    if (game.currentRound >= game.maxRounds) {
      game.state = 'finished';
      const [a, b] = game.players;
      game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
    }
  }
  emitGameState(io, game);
}

function diceNextRound(game, io) {
  game.currentRound++;
  game.moves = {}; game.dice = {}; game.total = {};
  game.phase = 'rolling'; game.roundWinner = null;
  game.state = 'playing';
  emitGameState(io, game);
}

function diceRematch(game, io) {
  game.state = 'playing'; game.currentRound = 0;
  game.scores = {}; game.players.forEach(p => game.scores[p] = 0);
  game.winner = null; game.moves = {}; game.dice = {}; game.total = {};
  game.phase = 'rolling'; game.roundWinner = null;
  game.currentRound = 1;
  emitGameState(io, game);
}

// ══════════════════════════════════════
// SOCKET EVENT HANDLERS
// ══════════════════════════════════════
function setupGameEvents(socket, io, getUserId) {
  // Create buzzer quiz from games page
  socket.on('buzzer-create', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const game = createBuzzerQuiz(userId, io);
    activeGames.set(game.id, game);
    console.log(`🎯 Buzzer Quiz created by ${userId}`);
    io.to(`user:${userId}`).emit('game-invite', { game: buildBuzzerView(game, userId), from: userId });
  });

  // Add player to buzzer quiz
  socket.on('buzzer-add-player', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const game = activeGames.get(data.gameId);
    if (!game || game.type !== 'buzzer_quiz') return;
    if (game.createdBy !== userId) return; // only creator can add
    addPlayer(game, data.playerId, io);
  });

  // Remove player from buzzer quiz
  socket.on('buzzer-remove-player', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const game = activeGames.get(data.gameId);
    if (!game || game.type !== 'buzzer_quiz') return;
    removePlayer(game, data.playerId, io);
  });

  // Start buzzer quiz
  socket.on('buzzer-start', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const game = activeGames.get(data.gameId);
    if (!game || game.type !== 'buzzer_quiz') return;
    if (game.createdBy !== userId) return;
    game.state = 'playing';
    buzzerAccept(game, io);
  });

  // Buzz!
  socket.on('buzzer-buzz', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const game = activeGames.get(data.gameId);
    if (!game || game.type !== 'buzzer_quiz') return;
    onBuzz(game, userId, io);
  });

  // Submit answer after buzzing
  socket.on('buzzer-answer', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const game = activeGames.get(data.gameId);
    if (!game || game.type !== 'buzzer_quiz') return;
    buzzerSubmitAnswer(game, userId, data.answerIndex, io);
  });

  // Join buzzer quiz (for invited players)
  socket.on('buzzer-join', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const game = activeGames.get(data.gameId);
    if (!game || game.type !== 'buzzer_quiz') return;
    addPlayer(game, userId, io);
  });

  socket.on('game-invite', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const { to, gameType } = data;
    let game;
    switch (gameType) {
      case 'reflex': game = createReflexGame(userId, to); break;
      case 'tictactoe': game = createTicTacToeGame(userId, to); break;
      case 'rps': game = createRPSGame(userId, to); break;
      case 'dice': game = createDiceGame(userId, to); break;
      case 'quiz': game = createQuizGame(userId, to, io); break;
      case 'code_secret': game = createCodeSecretGame(userId, to); break;
      case 'mot_intrus': game = createMotIntrusGame(userId, to); break;
      case 'devine_ce_que_je_pense': game = createDevineCeQueJePenseGame(userId, to); break;
      case 'a_quel_point': game = createAQuelPointGame(userId, to); break;
      case 'deux_verites': game = createDeuxVeritesGame(userId, to); break;
      default: return;
    }
    game.createdBy = userId;
    activeGames.set(game.id, game);
    console.log(`🎮 Game invite: ${gameType} from ${userId} to ${to}`);
    if (game.type === 'quiz') {
      // Vue par joueur : le pack contient les bonnes réponses côté serveur
      io.to(`user:${to}`).emit('game-invite', { game: buildQuizView(game, to), from: userId });
      io.to(`user:${userId}`).emit('game-invite', { game: buildQuizView(game, userId), from: userId });
    } else {
      io.to(`user:${to}`).emit('game-invite', { game, from: userId });
      io.to(`user:${userId}`).emit('game-invite', { game, from: userId });
    }
  });

  socket.on('game-accept', (data) => {
    const userId = getUserId(socket);
    if (!userId) return;
    const game = activeGames.get(data.gameId);
    if (!game || game.state !== 'waiting') return;
    game.state = 'playing';
    console.log(`🎮 Game accepted: ${game.type}`);
    if (game.type === 'quiz') {
      for (const p of game.players) {
        io.to(`user:${p}`).emit('game-start', { game: buildQuizView(game, p) });
      }
    } else {
      io.to(`user:${game.players[0]}`).emit('game-start', { game });
      io.to(`user:${game.players[1]}`).emit('game-start', { game });
    }

    if (game.type === 'reflex') {
      startReflexRound(game, io);
    } else if (game.type === 'rps' || game.type === 'dice') {
      game.currentRound++;
      emitGameState(io, game);
    } else if (game.type === 'quiz') {
      quizAccept(game, io);
    } else if (game.type === 'code_secret') {
      codeSecretAccept(game, io);
    } else if (game.type === 'mot_intrus') {
      motIntrusAccept(game, io);
    } else if (game.type === 'devine_ce_que_je_pense') {
      devineAccept(game, io);
    } else if (game.type === 'a_quel_point') {
      aQuelPointAccept(game, io);
    } else if (game.type === 'deux_verites') {
      deuxVeritesAccept(game, io);
    } else {
      emitGameState(io, game);
    }
  });

  socket.on('game-decline', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game) return;
    clearQuizTimers(game);
    game.state = 'finished';
    game.winner = 'declined';
    emitGameState(io, game);
    activeGames.delete(data.gameId);
  });

  socket.on('game-close', (data) => {
    const game = activeGames.get(data.gameId);
    if (game) {
      clearQuizTimers(game);
      activeGames.delete(data.gameId);
    }
  });

  socket.on('game-move', (data) => {
    try {
      const userId = getUserId(socket);
      if (!userId) return;
      const game = activeGames.get(data.gameId);
      if (!game) return;

      switch (game.type) {
        case 'reflex':
          if (data.move === 'react') reflexReact(game, userId, io);
          if (data.move === 'false-start') reflexFalseStart(game, userId, io);
          break;
        case 'tictactoe':
          if (data.cellIndex !== undefined) tttMove(game, userId, data.cellIndex, io);
          break;
        case 'rps':
          if (data.choice) rpsMove(game, userId, data.choice, io);
          break;
        case 'dice':
          if (data.move === 'roll') diceRoll(game, userId, io);
          break;
        case 'quiz':
          if (data.move === 'answer' && data.answerIndex !== undefined) quizAnswer(game, userId, data.answerIndex, io);
          if (data.move === 'next') quizNext(game, userId, io);
          break;
        case 'code_secret':
          if (data.move === 'guess' && data.guess) makeGuess(game, userId, data.guess, io);
          if (data.move === 'switch_roles') codeSecretSwitchRoles(game, io);
          break;
        case 'mot_intrus':
          if (data.move === 'answer' && data.answerIndex !== undefined) motIntrusSubmit(game, userId, data.answerIndex, io);
          break;
        case 'devine_ce_que_je_pense':
          if (data.move === 'question' && data.question) submitQuestion(game, userId, data.question, io);
          if (data.move === 'answer' && data.answer) devineSubmitAnswer(game, userId, data.answer, io);
          if (data.move === 'guess' && data.guess) guessItem(game, userId, data.guess, io);
          if (data.move === 'switch_roles') devineSwitchRoles(game, io);
          break;
        case 'a_quel_point':
          if (data.move === 'set_answer' && data.questionId !== undefined && data.answerIndex !== undefined) aqpSetAnswer(game, userId, data.questionId, data.answerIndex, io);
          if (data.move === 'answer' && data.questionId !== undefined && data.answerIndex !== undefined) aqpAnswer(game, userId, data.questionId, data.answerIndex, io);
          break;
        case 'deux_verites':
          if (data.move === 'statements' && data.statements && data.lieIndex !== undefined) submitStatements(game, userId, data.statements, data.lieIndex, io);
          if (data.move === 'guess' && data.guessIndex !== undefined) submitGuess(game, userId, data.guessIndex, io);
          break;
      }
    } catch (err) {
      // Never let one bad move crash the whole server
      console.error('🎮 Erreur game-move:', err);
    }
  });

  socket.on('game-rematch', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || game.state !== 'finished') return;
    switch (game.type) {
      case 'reflex': reflexRematch(game, io); break;
      case 'tictactoe': tttRematch(game, io); break;
      case 'rps': rpsRematch(game, io); break;
      case 'dice': diceRematch(game, io); break;
      case 'quiz': quizRematch(game, io); break;
      case 'code_secret': codeSecretRematch(game, io); break;
      case 'mot_intrus': motIntrusRematch(game, io); break;
      case 'devine_ce_que_je_pense': devineRematch(game, io); break;
      case 'a_quel_point': aQuelPointRematch(game, io); break;
      case 'deux_verites': deuxVeritesRematch(game, io); break;
    }
  });

  socket.on('game-next-round', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game) return;
    // Only advance once per round — ignore taps from both players racing
    if (game.type === 'rps') {
      if (game.phase !== 'revealed') return;
      rpsNextRound(game, io);
    } else if (game.type === 'dice') {
      if (game.phase !== 'done') return;
      diceNextRound(game, io);
    }
  });

  socket.on('disconnect', () => {
    const userId = getUserId(socket);
    if (!userId) return;
    for (const [id, game] of activeGames) {
      if (game.players.includes(userId) && game.state === 'playing') {
        clearQuizTimers(game);
        game.state = 'finished';
        game.winner = 'disconnect';
        const other = game.players.find(p => p !== userId);
        if (other) io.to(`user:${other}`).emit('game-state', { game });
        activeGames.delete(id);
      }
    }
  });
}

module.exports = { setupGameEvents, activeGames };
