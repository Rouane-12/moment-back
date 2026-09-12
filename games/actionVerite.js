/**
 * Action ou Vérité — duel 1v1, questions écrites par les joueurs.
 *
 * Aucune carte prédéfinie : tout est écrit par les joueurs eux-mêmes.
 *
 * Déroulement d'un tour :
 *   1. CHOIX    — le joueur questionné choisit « Vérité » ou « Action ».
 *   2. RÉDACTION — le questionneur écrit la question (Vérité) ou le défi (Action)
 *                  dans un champ de texte, puis l'envoie.
 *   3. RÉPONSE  — le joueur questionné répond :
 *                 • Vérité → il écrit sa réponse (texte) qui repart chez l'autre
 *                 • Action → il déclare « Je l'ai faite » ou « Je refuse »
 *   4. On inverse les rôles et on recommence.
 *
 * Points : Vérité répondue +100, Action faite +200, refus 0.
 */

const MAX_ROUNDS = 6;          // 3 tours chacun
const VERITE_POINTS = 100;
const ACTION_POINTS = 200;
const MAX_PROMPT_LEN = 220;
const MAX_ANSWER_LEN = 300;

function createGameId() {
  return 'av_' + Math.random().toString(36).substring(2, 10);
}

function createAvGame(p1, p2) {
  const game = {
    id: createGameId(),
    type: 'action_verite',
    players: [p1, p2],
    scores: { [p1]: 0, [p2]: 0 },
    currentRound: 0,
    maxRounds: MAX_ROUNDS,
    state: 'waiting',
    phase: 'choosing',        // choosing | writing | answering | result | finished
    round: 0,
    asker: null,              // celui qui rédige la question / le défi
    answerer: null,           // celui qui choisit et qui répond
    choice: null,             // 'verite' | 'action'
    prompt: null,             // texte écrit par le questionneur
    answer: null,             // réponse texte (Vérité)
    actionDone: null,         // true / false (Action)
    lastResult: null,
    winner: null,
    createdBy: p1,
  };
  return game;
}

function avAccept(game, io) {
  if (game._started) return;
  game._started = true;
  game.state = 'playing';
  nextRound(game, io);
}

function nextRound(game, io) {
  if (game.state !== 'playing') return;
  if (game.round >= game.maxRounds) {
    finishGame(game, io);
    return;
  }
  game.round++;
  // Le premier tour : le créateur pose la question, l'autre choisit et répond.
  // Puis on alterne strictement.
  const first = game.createdBy;
  const second = game.players.find((p) => p !== first);
  game.asker = game.round % 2 === 1 ? first : second;
  game.answerer = game.asker === first ? second : first;
  game.choice = null;
  game.prompt = null;
  game.answer = null;
  game.actionDone = null;
  game.lastResult = null;
  game.phase = 'choosing';
  emitView(io, game);
}

// 1. Le joueur questionné choisit Action ou Vérité
function avChoose(game, userId, choice, io) {
  if (game.state !== 'playing') return;
  if (game.phase !== 'choosing') return;
  if (userId !== game.answerer) return;
  if (choice !== 'verite' && choice !== 'action') return;
  game.choice = choice;
  game.phase = 'writing';
  emitView(io, game);
}

// 2. Le questionneur écrit la question / le défi
function avPrompt(game, userId, text, io) {
  if (game.state !== 'playing') return;
  if (game.phase !== 'writing') return;
  if (userId !== game.asker) return;
  const clean = String(text || '').trim().slice(0, MAX_PROMPT_LEN);
  if (clean.length < 3) return;
  game.prompt = clean;
  game.phase = 'answering';
  emitView(io, game);
}

// 3. Le joueur questionné répond
function avRespond(game, userId, text, io) {
  if (game.state !== 'playing') return;
  if (game.phase !== 'answering') return;
  if (userId !== game.answerer) return;

  if (game.choice === 'verite') {
    const clean = String(text || '').trim().slice(0, MAX_ANSWER_LEN);
    if (clean.length < 1) return;
    game.answer = clean;
    game.scores[game.answerer] += VERITE_POINTS;
    game.lastResult = {
      round: game.round,
      choice: 'verite',
      prompt: game.prompt,
      answer: clean,
      points: VERITE_POINTS,
      player: game.answerer,
    };
  } else {
    const done = text === true || text === 'true' || text === 'done';
    game.actionDone = done;
    const points = done ? ACTION_POINTS : 0;
    game.scores[game.answerer] += points;
    game.lastResult = {
      round: game.round,
      choice: 'action',
      prompt: game.prompt,
      answer: done ? 'Action faite' : 'Action refusée',
      accepted: done,
      points,
      player: game.answerer,
    };
  }

  game.phase = 'result';
  emitView(io, game);

  // Petite pause d'affichage puis tour suivant
  clearAVTimers(game);
  game._gameTimer = setTimeout(() => {
    game._gameTimer = null;
    if (game.state !== 'playing') return;
    if (game.round >= game.maxRounds) finishGame(game, io);
    else nextRound(game, io);
  }, 5000);
}

function finishGame(game, io) {
  game.state = 'finished';
  game.phase = 'finished';
  clearAVTimers(game);
  const [a, b] = game.players;
  const sa = game.scores[a] || 0;
  const sb = game.scores[b] || 0;
  if (sa > sb) game.winner = a;
  else if (sb > sa) game.winner = b;
  else game.winner = 'draw';
  emitView(io, game);
}

function avRematch(game, io) {
  clearAVTimers(game);
  game._started = true;
  game.state = 'playing';
  game.winner = null;
  game.round = 0;
  game.currentRound = 0;
  game.phase = 'choosing';
  game.choice = null;
  game.prompt = null;
  game.answer = null;
  game.actionDone = null;
  game.lastResult = null;
  for (const p of game.players) game.scores[p] = 0;
  nextRound(game, io);
}

function clearAVTimers(game) {
  if (game._gameTimer) {
    clearTimeout(game._gameTimer);
    game._gameTimer = null;
  }
}

// ══════════════════════════════════════
// VUE PAR JOUEUR
// ══════════════════════════════════════
function buildAvView(game, viewer) {
  const isAsker = game.asker === viewer;
  const isAnswerer = game.answerer === viewer;
  return {
    id: game.id,
    type: 'action_verite',
    players: game.players,
    scores: game.scores,
    currentRound: game.round,
    maxRounds: game.maxRounds,
    state: game.state,
    phase: game.phase,
    asker: game.asker,
    answerer: game.answerer,
    isMyTurn: isAsker || isAnswerer,
    amAsker: isAsker,
    amAnswerer: isAnswerer,
    choice: game.choice,
    // Le texte n'est visible qu'une fois envoyé (et par les deux joueurs)
    prompt: game.prompt,
    answer: game.answer,
    actionDone: game.actionDone,
    lastResult: game.lastResult,
    veritePoints: VERITE_POINTS,
    actionPoints: ACTION_POINTS,
    winner: game.winner,
    createdBy: game.createdBy,
  };
}

function emitView(io, game) {
  if (!io || !game) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game: buildAvView(game, p) });
  }
}

module.exports = {
  createAvGame,
  avAccept,
  avChoose,
  avPrompt,
  avRespond,
  avRematch,
  buildAvView,
  emitAvView: emitView,
  clearAVTimers,
  VERITE_POINTS,
  ACTION_POINTS,
  MAX_ROUNDS,
};
