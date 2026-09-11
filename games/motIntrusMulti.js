/**
 * Le Mot Intrus — version multijoueur (2 à 6 joueurs)
 *
 * Le même set de mots est proposé à tous en même temps. Le premier à
 * trouver l'intrus marque des points (selon la difficulté du set).
 * Une mauvaise réponse bloque le joueur 2 s (il voit déjà le feedback).
 */

const { WORD_SETS } = require('./motIntrus');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const ROUNDS_PER_GAME = 8;
const ROUND_TIME_MS = 20000; // 20 s pour trouver l'intrus
const FEEDBACK_MS = 3500;    // 3.5 s d'affichage du résultat
const POINTS = { facile: 100, moyen: 200, difficile: 300, expert: 500 };
const WRONG_LOCK_MS = 2000;  // petit blocage après une mauvaise réponse

function createGameId() {
  return 'mim_' + Math.random().toString(36).substring(2, 10);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Constitution d'un round : 5 mots issus du set, ordre mélangé,
// l'index de l'intrus recalculé après mélange.
function buildRound(set) {
  const words = shuffle(set.words);
  const answerIndex = words.indexOf(set.words[set.intrus]);
  return { words, answerIndex, explanation: set.explanation, difficulty: set.difficulty, points: POINTS[set.difficulty] || 100 };
}

function pickRounds() {
  const rounds = [];
  const difficulties = ['facile', 'moyen', 'difficile', 'expert'].filter((d) => WORD_SETS[d] && WORD_SETS[d].length > 0);
  // 2 rounds de chaque difficulté disponible, puis compléter aléatoirement
  const pool = [];
  for (const d of difficulties) {
    for (const set of shuffle(WORD_SETS[d]).slice(0, 2)) pool.push(set);
  }
  const allSets = difficulties.flatMap((d) => WORD_SETS[d]);
  while (pool.length < ROUNDS_PER_GAME) {
    pool.push(allSets[Math.floor(Math.random() * allSets.length)]);
  }
  for (const set of shuffle(pool).slice(0, ROUNDS_PER_GAME)) rounds.push(buildRound(set));
  return rounds;
}

function createMotIntrusMultiGame(creator, otherPlayers) {
  const players = [creator, ...(otherPlayers || []).filter((p) => p && p !== creator)].slice(0, MAX_PLAYERS);
  if (players.length < MIN_PLAYERS) return null;

  const game = {
    id: createGameId(),
    type: 'mot_intrus_multi',
    players,
    createdBy: creator,
    state: 'waiting',       // waiting | playing | finished
    roundIndex: 0,
    rounds: pickRounds(),
    scores: {},
    roundWins: {},
    pstate: {},             // answering | locked | round_done
    lockedUntil: {},        // userId -> timestamp (mauvaise réponse)
    answered: {},           // userId -> index répondu ce round
    roundWinner: null,
    lastRoundResult: null,
    deadline: null,
    winner: null,
    _timer: null,
    _lockTimer: null,
  };
  for (const p of players) {
    game.scores[p] = 0;
    game.roundWins[p] = 0;
    game.pstate[p] = 'answering';
    game.lockedUntil[p] = 0;
  }
  return game;
}

function schedule(game, fn, ms) {
  if (game._timer) clearTimeout(game._timer);
  game._timer = setTimeout(fn, ms);
}

function emitMotIntrusMultiState(io, game) {
  if (!game || !io) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game: buildView(game, p) });
  }
}

function startRound(game, io) {
  if (game.roundIndex >= game.rounds.length) return finishGame(game, io);
  const round = game.rounds[game.roundIndex];
  game.roundWinner = null;
  game.lastRoundResult = null;
  game.answered = {};
  game.deadline = Date.now() + ROUND_TIME_MS;
  for (const p of game.players) {
    game.pstate[p] = 'answering';
    game.lockedUntil[p] = 0;
  }
  emitMotIntrusMultiState(io, game);
  schedule(game, () => onRoundTimeout(game, io), ROUND_TIME_MS);
  return round; // unused, lisibilité
}

function motIntrusMultiAccept(game, io) {
  if (game.state !== 'waiting') return false;
  game.state = 'playing';
  game.roundIndex = 0;
  startRound(game, io);
  return true;
}

function answerRound(game, userId, answerIndex, io) {
  if (game.state !== 'playing') return false;
  if (game.pstate[userId] !== 'answering') return false;
  if (game.roundWinner) return false; // round déjà gagné
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 4) return false;

  const round = game.rounds[game.roundIndex];
  const correct = answerIndex === round.answerIndex;
  game.answered[userId] = answerIndex;

  if (correct) {
    // Premier à trouver l'intrus : il marque les points, round terminé
    game.scores[userId] += round.points;
    game.roundWins[userId] += 1;
    game.roundWinner = userId;
    game.lastRoundResult = { roundIndex: game.roundIndex, winner: userId, answerIndex, correct: true, points: round.points, explanation: round.explanation };
    for (const p of game.players) game.pstate[p] = 'round_done';
    if (game._timer) clearTimeout(game._timer);
    emitMotIntrusMultiState(io, game);
    schedule(game, () => nextRound(game, io), FEEDBACK_MS);
    return true;
  }

  // Mauvaise réponse : blocage temporaire de 2 s
  game.pstate[userId] = 'locked';
  game.lockedUntil[userId] = Date.now() + WRONG_LOCK_MS;
  emitMotIntrusMultiState(io, game);
  setTimeout(() => {
    if (game.state === 'playing' && game.pstate[userId] === 'locked' && !game.roundWinner) {
      game.pstate[userId] = 'answering';
      game.lockedUntil[userId] = 0;
      emitMotIntrusMultiState(io, game);
    }
  }, WRONG_LOCK_MS);
  return false;
}

function onRoundTimeout(game, io) {
  if (game.state !== 'playing' || game.roundWinner) return;
  const round = game.rounds[game.roundIndex];
  game.lastRoundResult = { roundIndex: game.roundIndex, winner: null, timedOut: true, explanation: round.explanation };
  for (const p of game.players) game.pstate[p] = 'round_done';
  emitMotIntrusMultiState(io, game);
  schedule(game, () => nextRound(game, io), FEEDBACK_MS);
}

function nextRound(game, io) {
  game.roundIndex++;
  if (game.roundIndex >= game.rounds.length) return finishGame(game, io);
  startRound(game, io);
}

function finishGame(game, io) {
  game.state = 'finished';
  game.deadline = null;
  if (game._timer) { clearTimeout(game._timer); game._timer = null; }
  const sorted = Object.entries(game.scores).sort(([, a], [, b]) => b - a);
  game.winner = sorted.length >= 2 && sorted[0][1] === sorted[1][1] ? 'draw' : (sorted[0] ? sorted[0][0] : null);
  emitMotIntrusMultiState(io, game);
}

function motIntrusMultiRematch(game, io) {
  if (game.state !== 'finished') return false;
  game.rounds = pickRounds();
  game.roundIndex = 0;
  game.roundWinner = null;
  game.lastRoundResult = null;
  game.answered = {};
  game.winner = null;
  for (const p of game.players) {
    game.scores[p] = 0;
    game.roundWins[p] = 0;
    game.pstate[p] = 'answering';
    game.lockedUntil[p] = 0;
  }
  game.state = 'playing';
  startRound(game, io);
  return true;
}

function buildView(game, viewer) {
  const round = game.rounds[game.roundIndex] || null;
  return {
    id: game.id,
    type: 'mot_intrus_multi',
    players: game.players,
    createdBy: game.createdBy,
    state: game.state,
    roundIndex: game.roundIndex,
    totalRounds: game.rounds.length,
    scores: game.scores,
    roundWins: game.roundWins,
    pstate: game.pstate[viewer] || 'answering',
    lockedUntil: game.pstate[viewer] === 'locked' ? game.lockedUntil[viewer] : 0,
    roundWinner: game.roundWinner,
    lastRoundResult: game.lastRoundResult,
    deadline: game.deadline,
    winner: game.winner,
    currentRound: round
      ? {
          words: round.words,
          difficulty: round.difficulty,
          points: round.points,
          // answerIndex jamais exposé pendant le round — révélé via lastRoundResult
        }
      : null,
  };
}

module.exports = {
  createMotIntrusMultiGame,
  answerRound,
  motIntrusMultiAccept,
  motIntrusMultiRematch,
  emitMotIntrusMultiState,
  buildView,
  MIN_PLAYERS,
  MAX_PLAYERS,
  ROUNDS_PER_GAME,
};
