/**
 * Deux Verites, Un Mensonge - Two Truths, One Lie
 * Each player writes 3 statements, the other must find the lie
 */

const STATEMENT_TIME_MS = 60000; // 60 seconds to write statements
const GUESS_TIME_MS = 30000;     // 30 seconds to guess
const ROUNDS = 5;

function createGameId() {
  return 'dv_' + Math.random().toString(36).substring(2, 10);
}

function createDeuxVeritesGame(p1, p2) {
  return {
    id: createGameId(),
    type: 'deux_verites',
    players: [p1, p2],
    state: 'waiting',
    phase: 'writing',       // writing | guessing | result | finished
    currentRound: 0,
    maxRounds: ROUNDS,
    currentPlayer: p1,      // who is currently writing statements
    statements: {},         // { playerId: [statement1, statement2, statement3] }
    truthIndex: {},         // { playerId: index of the TRUTH (1 truth, 2 lies) }
    guess: null,            // the guess from the other player
    scores: { [p1]: 0, [p2]: 0 },
    winner: null,
    createdBy: p1,
    deadline: null,
    lastResult: null,
  };
}

function startRound(game, io) {
  if (game.currentRound >= game.maxRounds) {
    finishGame(game, io);
    return;
  }
  
  game.currentRound++;
  game.phase = 'writing';
  game.deadline = Date.now() + STATEMENT_TIME_MS;
  
  emitDeuxVeritesState(io, game);
}

function submitStatements(game, userId, statements, truthIndex, io) {
  if (game.state !== 'playing' || game.phase !== 'writing') return false;
  if (userId !== game.currentPlayer) return false;
  if (!Array.isArray(statements) || statements.length !== 3) return false;
  if (!statements.every(s => typeof s === 'string' && s.trim().length > 0)) return false;
  if (!Number.isInteger(truthIndex) || truthIndex < 0 || truthIndex > 2) return false;
  
  game.statements[userId] = statements.map(s => s.trim());
  game.truthIndex[userId] = truthIndex;
  
  // Switch to guessing phase
  game.phase = 'guessing';
  game.deadline = Date.now() + GUESS_TIME_MS;
  
  emitDeuxVeritesState(io, game);
  return true;
}

function submitGuess(game, userId, guessIndex, io) {
  if (game.state !== 'playing' || game.phase !== 'guessing') return false;
  if (userId === game.currentPlayer) return false; // Can't guess your own
  if (!Number.isInteger(guessIndex) || guessIndex < 0 || guessIndex > 2) return false;
  
  game.guess = { player: userId, guessIndex };
  
  // Check if correct
  // Le joueur devine quel est le TRUC (la verite parmi les 2 mensonges)
  // Donc correct = le joueur a choisi la VERITE
  const correct = guessIndex === game.truthIndex[game.currentPlayer];
  
  if (correct) {
    game.scores[userId] += 100;
  } else {
    game.scores[game.currentPlayer] += 50;
  }
  
  game.lastResult = {
    statements: game.statements[game.currentPlayer],
    truthIndex: game.truthIndex[game.currentPlayer],
    guess: guessIndex,
    correct,
    guesser: userId,
    writer: game.currentPlayer,
  };
  
  game.phase = 'result';
  
  emitDeuxVeritesState(io, game);
  
  // Auto-advance after showing result
  setTimeout(() => {
    // Switch to the other player
    game.currentPlayer = game.currentPlayer === game.players[0] ? game.players[1] : game.players[0];
    game.guess = null;
    startRound(game, io);
  }, 4000);
  
  return true;
}

function finishGame(game, io) {
  game.state = 'finished';
  const [a, b] = game.players;
  if (game.scores[a] > game.scores[b]) game.winner = a;
  else if (game.scores[a] < game.scores[b]) game.winner = b;
  else game.winner = 'draw';
  
  emitDeuxVeritesState(io, game);
}

function emitDeuxVeritesState(io, game) {
  if (!game || !io) return;
  
  for (const p of game.players) {
    const isWriter = p === game.currentPlayer;
    const view = {
      ...game,
      // Affiche les affirmations pendant guessing ET result (pas pendant writing)
      statements: (game.phase === 'guessing' || game.phase === 'result') ? game.statements : {},
      truthIndex: game.phase === 'result' ? game.truthIndex : {},
      // Le writer voit ses propres affirmations pendant writing
      currentStatements: isWriter ? game.statements[p] : undefined,
    };
    io.to(`user:${p}`).emit('game-state', { game: view });
  }
}

function deuxVeritesAccept(game, io) {
  game.state = 'playing';
  startRound(game, io);
}

function deuxVeritesRematch(game, io) {
  game.state = 'playing';
  game.currentRound = 0;
  game.currentPlayer = game.players[0];
  game.statements = {};
  game.truthIndex = {};
  game.guess = null;
  game.scores = { [game.players[0]]: 0, [game.players[1]]: 0 };
  game.winner = null;
  game.lastResult = null;
  
  startRound(game, io);
}

module.exports = {
  createDeuxVeritesGame,
  submitStatements,
  submitGuess,
  deuxVeritesAccept,
  deuxVeritesRematch,
  emitDeuxVeritesState,
};
