/**
 * Mémoire Flash — duel 1v1
 *
 * Une séquence de couleurs s'affiche brièvement, puis disparaît.
 * Chaque joueur doit la reproduire de mémoire dans le bon ordre.
 * La difficulté augmente à chaque manche (séquence de plus en plus longue) :
 *   Manche 1 : 3 couleurs  (Facile, +100)
 *   Manche 2 : 4 couleurs  (Moyen, +200)
 *   Manche 3 : 5 couleurs  (Difficile, +300)
 *   Manche 4 : 6 couleurs  (Très difficile, +500)
 *   Manche 5 : 7 couleurs  (Expert, +600)
 *
 * Chaque joueur a SA propre séquence (impossible de copier l'autre).
 * Les vues sont construites par joueur : la séquence n'est envoyée au client
 * QUE pendant la phase de mémorisation — jamais pendant la reproduction.
 */

const SHOW_MS_PER_SYMBOL = 900;  // temps d'affichage par couleur
const SHOW_BASE_MS = 2500;       // temps de mémorisation supplémentaire
const INPUT_BASE_MS = 6000;      // temps de reproduction de base
const INPUT_MS_PER_SYMBOL = 1200;
const FEEDBACK_MS = 4000;        // affichage du résultat avant la manche suivante

const LEVELS = [
  { len: 3, points: 100, label: 'Facile' },
  { len: 4, points: 200, label: 'Moyen' },
  { len: 5, points: 300, label: 'Difficile' },
  { len: 6, points: 500, label: 'Très difficile' },
  { len: 7, points: 600, label: 'Expert' },
];

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

function createGameId() {
  return Math.random().toString(36).substring(2, 10);
}

function randomSequence(len) {
  const seq = [];
  for (let i = 0; i < len; i++) {
    seq.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
  }
  return seq;
}

function levelFor(game) {
  return LEVELS[Math.min(game.currentRound, LEVELS.length) - 1] || LEVELS[0];
}

// ══════════════════════════════════════
// CRÉATION / ACCEPTATION
// ══════════════════════════════════════

function createMemoireGame(p1, p2) {
  return {
    id: createGameId(), type: 'memoire_flash',
    players: [p1, p2], scores: { [p1]: 0, [p2]: 0 },
    currentRound: 0, maxRounds: LEVELS.length,
    state: 'waiting', phase: 'idle',
    pstate: { [p1]: 'idle', [p2]: 'idle' },   // idle | show | reproduce | feedback
    deadline: { [p1]: null, [p2]: null },
    sequences: { [p1]: [], [p2]: [] },        // secret serveur
    inputs: { [p1]: [], [p2]: [] },
    lastResult: { [p1]: null, [p2]: null },
    progress: { [p1]: 0, [p2]: 0 },
    winner: null, createdBy: p1,
    _timers: {},
    _roundTimer: null,
  };
}

function memoireAccept(game, io) {
  // Le moteur passe déjà state='playing' avant d'appeler — on garde juste un
  // garde-fou anti double-démarrage.
  if (game._started) return;
  game._started = true;
  game.state = 'playing';
  startRound(game, io);
}

// ══════════════════════════════════════
// DÉROULEMENT D'UNE MANCHE
// ══════════════════════════════════════

function startRound(game, io) {
  game.currentRound++;
  const level = levelFor(game);
  for (const p of game.players) {
    game.pstate[p] = 'show';
    game.sequences[p] = randomSequence(level.len);
    game.inputs[p] = [];
    game.lastResult[p] = null;
    game.deadline[p] = Date.now() + showTime(level.len);
    schedulePlayer(game, p, io, showTime(level.len), () => startReproduce(game, p, io));
  }
  emitView(io, game);
}

function showTime(len) {
  return SHOW_BASE_MS + len * SHOW_MS_PER_SYMBOL;
}

function inputTime(len) {
  return INPUT_BASE_MS + len * INPUT_MS_PER_SYMBOL;
}

function startReproduce(game, userId, io) {
  if (game.state !== 'playing' || game.pstate[userId] !== 'show') return;
  const level = levelFor(game);
  game.pstate[userId] = 'reproduce';
  game.deadline[userId] = Date.now() + inputTime(level.len);
  schedulePlayer(game, userId, io, inputTime(level.len), () => {
    // Temps écoulé : on valide ce que le joueur avait saisi (souvent incomplet)
    submitInput(game, userId, io, true);
  });
  emitView(io, game);
}

function memoireInput(game, userId, color, io) {
  if (game.state !== 'playing' || game.pstate[userId] !== 'reproduce') return;
  const level = levelFor(game);
  if (game.inputs[userId].length >= level.len) return;
  game.inputs[userId] = [...game.inputs[userId], color];
  if (game.inputs[userId].length >= level.len) {
    // Séquence complète : validation immédiate
    submitInput(game, userId, io, false);
  } else {
    emitView(io, game);
  }
}

function memoireUndo(game, userId, io) {
  if (game.state !== 'playing' || game.pstate[userId] !== 'reproduce') return;
  game.inputs[userId] = game.inputs[userId].slice(0, -1);
  emitView(io, game);
}

function submitInput(game, userId, io, timedOut) {
  if (game.pstate[userId] !== 'reproduce') return;
  clearTimeout(game._timers[userId]);
  game._timers[userId] = null;

  const level = levelFor(game);
  const expected = game.sequences[userId];
  const got = game.inputs[userId];
  const correct = !timedOut && got.length === expected.length &&
    got.every((c, i) => c === expected[i]);

  if (correct) {
    game.scores[userId] += level.points;
  }
  game.progress[userId] = game.currentRound;
  game.pstate[userId] = 'feedback';
  game.lastResult[userId] = {
    correct,
    timedOut: !!timedOut,
    level: level.len,
    points: correct ? level.points : 0,
    expected,
    got,
  };
  emitView(io, game);
  maybeAdvance(game, io);
}

function maybeAdvance(game, io) {
  const [a, b] = game.players;
  if (game.pstate[a] !== 'feedback' || game.pstate[b] !== 'feedback') return;
  if (game._roundTimer) return; // déjà programmé

  game._roundTimer = setTimeout(() => {
    game._roundTimer = null;
    if (game.state !== 'playing') return;
    if (game.currentRound >= game.maxRounds) {
      game.state = 'finished';
      const [x, y] = game.players;
      game.winner = game.scores[x] > game.scores[y] ? x : game.scores[x] < game.scores[y] ? y : 'draw';
    } else {
      startRound(game, io);
      return; // startRound émet déjà la vue
    }
    emitView(io, game);
  }, FEEDBACK_MS);
}

// ══════════════════════════════════════
// REVANCHE
// ══════════════════════════════════════

function memoireRematch(game, io) {
  clearMemoireTimers(game);
  game._started = true;
  game.state = 'playing';
  game.currentRound = 0;
  game.winner = null;
  for (const p of game.players) {
    game.scores[p] = 0;
    game.progress[p] = 0;
    game.pstate[p] = 'idle';
    game.deadline[p] = null;
    game.lastResult[p] = null;
    game.inputs[p] = [];
    game.sequences[p] = [];
  }
  startRound(game, io);
}

// ══════════════════════════════════════
// TIMERS
// ══════════════════════════════════════

function schedulePlayer(game, userId, io, ms, fn) {
  if (game._timers[userId]) clearTimeout(game._timers[userId]);
  game._timers[userId] = setTimeout(fn, ms);
}

function clearMemoireTimers(game) {
  for (const k of Object.keys(game._timers || {})) {
    clearTimeout(game._timers[k]);
  }
  game._timers = {};
  if (game._roundTimer) {
    clearTimeout(game._roundTimer);
    game._roundTimer = null;
  }
}

// ══════════════════════════════════════
// VUE PAR JOUEUR — la séquence ne fuit QUE pendant la mémorisation
// ══════════════════════════════════════

function buildMemoireView(game, viewer) {
  const other = game.players.find(p => p !== viewer);
  const level = game.state === 'playing' ? levelFor(game) : null;
  const ps = game.pstate[viewer];
  return {
    id: game.id,
    type: 'memoire_flash',
    players: game.players,
    scores: game.scores,
    currentRound: game.currentRound,
    maxRounds: game.maxRounds,
    state: game.state,
    phase: ps,
    level: level ? { ...level } : null,
    // La séquence est envoyée uniquement pendant la phase de mémorisation,
    // et dans le résultat (feedback) pour montrer la bonne réponse.
    sequence: ps === 'show' ? game.sequences[viewer] : (ps === 'feedback' ? game.lastResult[viewer]?.expected : undefined),
    deadline: game.deadline[viewer],
    input: game.inputs[viewer],
    lastResult: game.lastResult[viewer],
    progress: game.progress[viewer],
    opponent: { progress: other ? game.progress[other] : 0 },
    winner: game.winner,
    createdBy: game.createdBy,
  };
}

function emitView(io, game) {
  if (!io || !game) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game: buildMemoireView(game, p) });
  }
}

module.exports = {
  createMemoireGame,
  memoireAccept,
  memoireInput,
  memoireUndo,
  memoireRematch,
  buildMemoireView,
  emitMemoireView: emitView,
  clearMemoireTimers,
  // Exposés pour les tests
  LEVELS,
  COLORS,
};
