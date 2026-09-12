/**
 * Le Code Secret — style Mastermind (duel 1v1)
 *
 * Déroulement :
 *   1. Le créateur (celui qui a lancé la partie) compose un code de 4 couleurs.
 *   2. L'adversaire a 6 tentatives pour le deviner.
 *      Vert  = bonne couleur, bonne position
 *      Orange = bonne couleur, mauvaise position
 *   3. On inverse les rôles : le devineur compose à son tour son code,
 *      et l'ancien créateur tente de le deviner.
 *   4. Celui qui casse le code en le moins de tentatives gagne.
 *
 * Les couleurs sont des clés ('red', 'green'…) rendues côté client par de
 * vraies pastilles de couleur — jamais d'emoji.
 */

const COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'orange'];
const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 6;

function createGameId() {
  return 'cs_' + Math.random().toString(36).substring(2, 10);
}

/**
 * Compare une proposition au code secret.
 * Retourne un tableau indexé par POSITION : [{ color, status }]
 * status ∈ 'correct' | 'wrong_position' | 'absent'
 */
function evaluateGuess(code, guess) {
  const usedCode = new Array(CODE_LENGTH).fill(false);
  const usedGuess = new Array(CODE_LENGTH).fill(false);
  const result = new Array(CODE_LENGTH).fill(null);

  // 1. Bonnes couleurs bien placées
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] === code[i]) {
      result[i] = { color: guess[i], status: 'correct' };
      usedCode[i] = true;
      usedGuess[i] = true;
    }
  }

  // 2. Bonnes couleurs mal placées (chaque pion du code ne sert qu'une fois)
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (usedGuess[i]) continue;
    const idx = code.findIndex((c, j) => !usedCode[j] && c === guess[i]);
    if (idx !== -1) {
      result[i] = { color: guess[i], status: 'wrong_position' };
      usedCode[idx] = true;
    } else {
      result[i] = { color: guess[i], status: 'absent' };
    }
  }

  return result;
}

function createCodeSecretGame(p1, p2) {
  return {
    id: createGameId(),
    type: 'code_secret',
    players: [p1, p2],
    state: 'waiting',
    phase: 'setting_code',     // setting_code | guessing | finished
    round: 1,                  // 1 = p1 crée / p2 devine, 2 = l'inverse
    code: null,                // code secret (jamais envoyé au devineur)
    _codeBuilding: [],         // code en cours de composition (créateur uniquement)
    codeCreator: p1,
    currentGuesser: p2,
    attemptsBy: { [p1]: [], [p2]: [] },
    results: {},               // { [joueur]: { solved, attempts } }
    scores: { [p1]: 0, [p2]: 0 },
    lastResult: null,
    winner: null,
    createdBy: p1,
  };
}

// ══════════════════════════════════════
// COMPOSITION DU CODE (créateur)
// ══════════════════════════════════════
function setCode(game, userId, symbol, io, action = 'add') {
  if (game.state !== 'playing') return false;
  if (game.phase !== 'setting_code') return false;
  if (userId !== game.codeCreator) return false;

  if (action === 'remove') {
    game._codeBuilding.pop();
    emitCodeSecretState(io, game);
    return true;
  }
  if (action === 'reset') {
    game._codeBuilding = [];
    emitCodeSecretState(io, game);
    return true;
  }

  if (!COLORS.includes(symbol)) return false;
  if (game._codeBuilding.length >= CODE_LENGTH) return false;
  game._codeBuilding.push(symbol);

  if (game._codeBuilding.length === CODE_LENGTH) {
    // Code verrouillé → au devineur de jouer
    game.code = [...game._codeBuilding];
    game.phase = 'guessing';
    game.lastResult = null;
  }
  emitCodeSecretState(io, game);
  return true;
}

// ══════════════════════════════════════
// TENTATIVE DU DEVINEUR
// ══════════════════════════════════════
function makeGuess(game, userId, guess, io) {
  if (game.state !== 'playing') return false;
  if (game.phase !== 'guessing') return false;
  if (userId !== game.currentGuesser) return false;
  if (!Array.isArray(guess) || guess.length !== CODE_LENGTH) return false;
  if (!guess.every((s) => COLORS.includes(s))) return false;

  const list = game.attemptsBy[userId];
  const key = guess.join('-');
  if (list.some((a) => a.guess.join('-') === key)) return false; // tentative déjà jouée

  const result = evaluateGuess(game.code, guess);
  const solved = result.every((r) => r.status === 'correct');
  list.push({ guess: [...guess], result });

  game.lastResult = { guess: [...guess], result, correct: solved, by: userId };

  if (solved) {
    game.results[userId] = { solved: true, attempts: list.length };
    // Moins de tentatives = plus de points
    game.scores[userId] = MAX_ATTEMPTS + 1 - list.length;
  } else if (list.length >= MAX_ATTEMPTS) {
    game.results[userId] = { solved: false, attempts: list.length };
    game.scores[userId] = 0;
  }

  const roundOver = game.results[userId] !== undefined;

  if (!roundOver) {
    emitCodeSecretState(io, game);
    return true;
  }

  if (game.round === 1) {
    // Échange des rôles : le devineur compose le code à son tour
    game.round = 2;
    game.codeCreator = userId;
    game.currentGuesser = game.players.find((p) => p !== userId);
    game.code = null;
    game._codeBuilding = [];
    game.lastResult = null;
    game.phase = 'setting_code';
    emitCodeSecretState(io, game);
  } else {
    finishGame(game, io);
  }
  return true;
}

function finishGame(game, io) {
  game.state = 'finished';
  game.phase = 'finished';
  const [a, b] = game.players;
  const sa = game.scores[a] || 0;
  const sb = game.scores[b] || 0;
  if (sa > sb) game.winner = a;
  else if (sb > sa) game.winner = b;
  else game.winner = 'draw';
  emitCodeSecretState(io, game);
}

// ══════════════════════════════════════
// VIE DE LA PARTIE
// ══════════════════════════════════════
function codeSecretAccept(game, io) {
  if (game.state === 'finished' || game._started) return;
  game._started = true;
  game.state = 'playing';
  game.phase = 'setting_code';
  game.round = 1;
  game.codeCreator = game.players[0];
  game.currentGuesser = game.players[1];
  game.code = null;
  game._codeBuilding = [];
  game.attemptsBy = { [game.players[0]]: [], [game.players[1]]: [] };
  game.results = {};
  game.scores = { [game.players[0]]: 0, [game.players[1]]: 0 };
  game.lastResult = null;
  game.winner = null;
  emitCodeSecretState(io, game);
}

function codeSecretRematch(game, io) {
  const [a, b] = game.players;
  game._started = true;
  game.state = 'playing';
  game.phase = 'setting_code';
  game.round = 1;
  // On inverse qui commence (équité entre les deux parties)
  game.codeCreator = game.codeCreator === a ? b : a;
  game.currentGuesser = game.codeCreator === a ? b : a;
  game.code = null;
  game._codeBuilding = [];
  game.attemptsBy = { [a]: [], [b]: [] };
  game.results = {};
  game.scores = { [a]: 0, [b]: 0 };
  game.lastResult = null;
  game.winner = null;
  emitCodeSecretState(io, game);
}

// ══════════════════════════════════════
// VUE PAR JOUEUR (le code ne fuite jamais)
// ══════════════════════════════════════
function buildView(game, viewer) {
  const isCreator = viewer === game.codeCreator;
  const isGuesser = viewer === game.currentGuesser;
  const myRole = isCreator ? 'creator' : isGuesser ? 'guesser' : 'spectator';

  return {
    id: game.id,
    type: 'code_secret',
    players: game.players,
    state: game.state,
    phase: game.phase,
    round: game.round,
    scores: game.scores,
    codeCreator: game.codeCreator,
    currentGuesser: game.currentGuesser,
    myRole,
    colors: COLORS,
    codeLength: CODE_LENGTH,
    maxAttempts: MAX_ATTEMPTS,
    // Seul le créateur voit son code en construction (jamais le code verrouillé)
    myCode: isCreator && game.phase === 'setting_code' ? [...(game._codeBuilding || [])] : [],
    // Tentatives du devineur en cours + résultat de la dernière
    attempts: game.currentGuesser ? game.attemptsBy[game.currentGuesser] || [] : [],
    lastResult: game.lastResult,
    results: game.results,
    winner: game.winner,
    createdBy: game.createdBy,
  };
}

function emitCodeSecretState(io, game) {
  if (!game || !io) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game: buildView(game, p) });
  }
}

module.exports = {
  createCodeSecretGame,
  setCode,
  makeGuess,
  codeSecretAccept,
  codeSecretRematch,
  emitCodeSecretState,
  buildView,
  COLORS,
  CODE_LENGTH,
  MAX_ATTEMPTS,
};
