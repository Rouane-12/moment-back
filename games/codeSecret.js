/**
 * Le Code Secret — Mastermind style game
 * Le créateur choisit un code de 4 symboles.
 * L'adversaire doit le deviner en 6 tentatives.
 * Vert = bon symbole, bonne position.
 * Orange = bon symbole, mauvaise position.
 * Rôle inverséaprèsfin.
 */

const SYMBOLS = ['🔴', '🟢', '🟣', '🟡', '🔵', '🟠'];
const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 6;

function createGameId() {
  return 'cs_' + Math.random().toString(36).substring(2, 10);
}

function evaluateGuess(code, guess) {
  const result = [];
  // On utilise des indices pour éviter les conflits de symboles identiques
  const codeRemaining = [...code];
  const guessRemaining = [...guess];
  const usedCode = new Array(CODE_LENGTH).fill(false);
  const usedGuess = new Array(CODE_LENGTH).fill(false);

  // 1. Exact matches (vert)
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] === code[i]) {
      result.push({ symbol: guess[i], status: 'correct', position: i });
      usedCode[i] = true;
      usedGuess[i] = true;
    }
  }

  // 2. Wrong position (orange) — seulement pour les non-marques
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (!usedGuess[i]) {
      const idx = codeRemaining.findIndex(
        (s, j) => !usedCode[j] && s === guess[i]
      );
      if (idx !== -1) {
        result.push({ symbol: guess[i], status: 'wrong_position', position: i });
        usedCode[idx] = true;
        usedGuess[i] = true;
      } else {
        result.push({ symbol: guess[i], status: 'absent', position: i });
      }
    }
  }

  // 3. Sort result by position for clean display
  result.sort((a, b) => a.position - b.position);
  return result;
}

function createCodeSecretGame(p1, p2) {
  return {
    id: createGameId(),
    type: 'code_secret',
    players: [p1, p2],
    state: 'waiting',
    phase: 'setting_code',   // setting_code | guessing | result | finished
    code: null,              // defined by initiator (hidden from guesser)
    codeCreator: p1,
    currentGuesser: p2,
    attempts: [],
    attemptsByPlayer: { [p1]: 0, [p2]: 0 },
    currentGuess: [],
    scores: { [p1]: 0, [p2]: 0 },
    winner: null,
    createdBy: p1,
    deadline: null,
    lastResult: null,
  };
}

// The creator sets the code
function setCode(game, userId, symbol, io) {
  if (game.state !== 'waiting' && game.state !== 'playing') return false;
  if (game.phase !== 'setting_code') return false;
  if (userId !== game.codeCreator) return false;
  if (!SYMBOLS.includes(symbol)) return false;
  if (!game._codeBuilding) game._codeBuilding = [];
  if (game._codeBuilding.length >= CODE_LENGTH) return false;

  game._codeBuilding = [...game._codeBuilding, symbol];

  if (game._codeBuilding.length === CODE_LENGTH) {
    game.code = [...game._codeBuilding];
    // The guesser can now start trying
    game.phase = 'guessing';
    game.deadline = Date.now() + 180000; // 3 min
    emitCodeSecretState(io, game);
  } else {
    emitCodeSecretState(io, game);
  }
  return true;
}

function makeGuess(game, userId, guess, io) {
  if (game.state !== 'playing' && game.state !== 'waiting') return false;
  if (game.phase !== 'guessing') return false;
  if (userId !== game.currentGuesser) return false;
  if (!Array.isArray(guess) || guess.length !== CODE_LENGTH) return false;
  if (!guess.every(s => SYMBOLS.includes(s))) return false;
  if (game.attempts.some(a => a.guess.join('') === guess.join(''))) return false; // duplicate guess

  const attemptCount = (game.attemptsByPlayer[userId] || 0) + 1;
  game.attemptsByPlayer[userId] = attemptCount;

  const result = evaluateGuess(game.code, guess);
  game.attempts.push({ guess, result, by: userId });

  const isComplete = result.every(r => r.status === 'correct');

  game.lastResult = {
    guess,
    result: result.map(r => ({ symbol: r.symbol, status: r.status })),
    correct: isComplete,
    by: userId,
  };

  if (isComplete) {
    // Guesser wins this round
    if (userId === game.players[0]) game.scores[game.players[0]]++;
    else game.scores[game.players[1]]++;

    if (game.attemptsByPlayer[game.codeCreator] > 0 || game.attemptsByPlayer[game.currentGuesser] > 0) {
      // Role swap: the guesser becomes the new creator
      const newCreator = game.currentGuesser;
      const newGuesser = game.codeCreator;
      game.codeCreator = newCreator;
      game.currentGuesser = newGuesser;
      game._codeBuilding = [];
      game.code = null;
      game.attempts = [];
      game.attemptsByPlayer = { [newCreator]: 0, [newGuesser]: 0 };
      game.phase = 'setting_code';
      game.currentGuess = [];
      game.lastResult = null;
      emitCodeSecretState(io, game);
    } else {
      // First round, no role swap — just mark complete
      game.phase = 'result';
      game.state = 'finished';
      game.winner = userId;
      emitCodeSecretState(io, game);
    }
  } else {
    // Still guessing
    game.deadline = Date.now() + 30000;
    emitCodeSecretState(io, game);
  }

  return true;
}

function codeSecretAccept(game, io) {
  if (game.state === 'finished' || game._started) return;
  game._started = true;
  game.state = 'playing';
  game.phase = 'setting_code';
  game._codeBuilding = [];
  emitCodeSecretState(io, game);
}

function codeSecretRematch(game, io) {
  game.state = 'playing';
  game._started = true;
  game.phase = 'setting_code';
  game.code = null;
  game._codeBuilding = [];
  game.currentGuesser = game.players[0] === game.codeCreator ? game.players[1] : game.players[0];
  game.codeCreator = game.players[0] === game.codeCreator ? game.players[1] : game.players[0];
  game.attempts = [];
  game.attemptsByPlayer = { [game.players[0]]: 0, [game.players[1]]: 0 };
  game.currentGuess = [];
  game.lastResult = null;
  game.deadline = null;
  emitCodeSecretState(io, game);
}

// ══════════════════════════════════════
// VUE PAR JOUEUR
// ══════════════════════════════════════

function emitCodeSecretState(io, game) {
  if (!game || !io) return;

  for (const p of game.players) {
    const isCreator = p === game.codeCreator;
    const isGuesser = p === game.currentGuesser;
    const view = {
      id: game.id,
      type: 'code_secret',
      players: game.players,
      state: game.state,
      phase: game.phase,
      scores: game.scores,
      // Le créateur voit son code en construction
      myCode: isCreator ? [...(game._codeBuilding || [])] : (isCreator ? undefined : undefined),
      // L'adversaire voit les tentatives du créateur
      attempts: game.attempts.map(a => ({
        ...a,
        guess: a.guess,
        result: a.result,
        by: a.by,
      })),
      attemptsByPlayer: { [p]: game.attemptsByPlayer[p] },
      // Le code secret (seulement visible par le créateur pendant ou après)
      code: isCreator && game.state === 'finished' ? game.code : (isCreator ? game.code : null),
      showMyCode: isCreator && game._codeBuilding ? [...game._codeBuilding] : [],
      lastResult: game.lastResult,
      currentGuess: game.currentGuess,
      deadline: game.deadline,
      createdBy: game.createdBy,
      _codeBuilding: game._codeBuilding ? [...game._codeBuilding] : [],
    };
    io.to(`user:${p}`).emit('game-state', { game: view });
  }
}

module.exports = {
  createCodeSecretGame,
  setCode,
  makeGuess,
  codeSecretAccept,
  codeSecretRematch,
  emitCodeSecretState,
  SYMBOLS,
  MAX_ATTEMPTS,
};

// La object for consistent import
module.exports = module.exports;
