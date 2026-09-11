/**
 * 🎯 BUZZER QUIZ — Quiz multijoueur à buzzer (3-5 joueurs)
 *
 * Style "Qui veut gagner des millions ?" en mode buzzer :
 * - Une question est affichée à TOUS les joueurs en même temps
 * - Le premier à buzzer peut répondre
 * - S'il a raison, il gagne les points
 * - S'il a tort, les autres peuvent buzzer
 * - Points selon la difficulté (comme le quiz 1v1)
 */

const axios = require('axios');
const { generateQuizPack, buildQuizView, emitQuizState, clearQuizTimers, FALLBACK_BANK, TIERS, fallbackPack } = require('./quiz');

const BUZZER_TIME_MS = 20000;      // 20s pour buzzer
const ANSWER_TIME_MS = 10000;      // 10s pour répondre après avoir buzzer
const FEEDBACK_TIME_MS = 4000;     // 4s d'affichage du résultat
const MAX_PLAYERS = 5;
const MIN_PLAYERS = 2;

function createGameId() {
  return 'buz_' + Math.random().toString(36).substring(2, 10);
}

function shuffleIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function schedule(game, fn, ms) {
  if (game._timer) clearTimeout(game._timer);
  game._timer = setTimeout(fn, ms);
}

// ══════════════════════════════════════
// CRÉATION DE LA PARTIE
// ══════════════════════════════════════

function createBuzzerQuiz(creator, io) {
  const game = {
    id: createGameId(),
    type: 'buzzer_quiz',
    players: [creator],
    scores: {},
    correctCount: {},
    state: 'waiting',           // waiting | playing | finished
    quizStatus: 'generating',   // generating | ready
    quizError: null,
    questions: [],
    questionIndex: 0,           // index de la question courante
    order: {},                  // mélange par joueur
    pstate: {},                 // idle | buzzing | answering | feedback | done
    buzzOrder: [],              // ordre dans lequel les joueurs ont buzzer
    currentBuzz: null,          // joueur qui a buzzer en premier
    deadline: null,
    lastQuestionResult: null,   // résultat de la dernière question
    scoresHistory: [],          // historique des scores par question
    winner: null,
    createdBy: creator,
    _timer: null,
  };

  game.scores[creator] = 0;
  game.correctCount[creator] = 0;
  game.pstate[creator] = 'idle';

  // Génération du pack de questions en arrière-plan
  generateQuizPack()
    .then(pack => onPackReady(game, io, pack))
    .catch(async (err) => {
      console.error('🎯 Buzzer Quiz IA indisponible, pack de secours:', err.message);
      const fallback = await fallbackPack();
      onPackReady(game, io, fallback);
    });

  return game;
}

function onPackReady(game, io, pack) {
  game.questions = pack;
  game.quizStatus = 'ready';
  // Chaque joueur reçoit les mêmes questions dans le même ordre (buzzer = tous voient la même question)
  for (const p of game.players) {
    game.order[p] = Array.from({ length: pack.length }, (_, i) => i);
  }
  console.log(`🎯 Buzzer Quiz prêt: ${pack.length} questions pour ${game.players.length} joueurs`);
  emitBuzzerState(io, game);
  if (game.state === 'playing') startQuestion(game, io);
}

// ══════════════════════════════════════
// GESTION DES JOUEURS
// ══════════════════════════════════════

function addPlayer(game, userId, io) {
  if (game.state !== 'waiting') return false;
  if (game.players.length >= MAX_PLAYERS) return false;
  if (game.players.includes(userId)) return false;

  game.players.push(userId);
  game.scores[userId] = 0;
  game.correctCount[userId] = 0;
  game.pstate[userId] = 'idle';

  emitBuzzerState(io, game);
  return true;
}

function removePlayer(game, userId, io) {
  const idx = game.players.indexOf(userId);
  if (idx === -1) return;

  game.players.splice(idx, 1);
  delete game.scores[userId];
  delete game.correctCount[userId];
  delete game.pstate[userId];

  // Si le créateur quitte, transférer la partie
  if (userId === game.createdBy && game.players.length > 0) {
    game.createdBy = game.players[0];
  }

  // Si plus assez de joueurs et partie en attente
  if (game.state === 'waiting' && game.players.length < MIN_PLAYERS) {
    emitBuzzerState(io, game);
    return;
  }

  // Si partie en cours et un joueur quitte
  if (game.state === 'playing') {
    // Vérifier si le joueur qui a buzzé a quitté
    if (game.currentBuzz === userId) {
      game.currentBuzz = null;
      game.buzzOrder = game.buzzOrder.filter(p => p !== userId);
      // Passer au suivant ou timeout
      advanceAfterBuzz(game, io);
    }
  }

  emitBuzzerState(io, game);
}

// ══════════════════════════════════════
// DÉROULEMENT DU JEU
// ══════════════════════════════════════

function startGame(game, io) {
  if (game.state !== 'waiting') return false;
  if (game.players.length < MIN_PLAYERS) return false;

  game.state = 'playing';
  game.questionIndex = 0;
  if (game.quizStatus !== 'ready') {
    // Attendre que le pack soit prêt — onPackReady lancera la 1re question
    emitBuzzerState(io, game);
    return true;
  }

  startQuestion(game, io);
  return true;
}

function startQuestion(game, io) {
  if (game.questionIndex >= game.questions.length) {
    finishGame(game, io);
    return;
  }

  // Reset état pour cette question
  game.currentBuzz = null;
  game.buzzOrder = [];
  game.lastQuestionResult = null;
  for (const p of game.players) {
    game.pstate[p] = 'buzzing';
  }

  game.deadline = Date.now() + BUZZER_TIME_MS;
  emitBuzzerState(io, game);

  // Timer : si personne ne buzz après BUZZER_TIME_MS, on passe à la question suivante
  schedule(game, () => onQuestionTimeout(game, io), BUZZER_TIME_MS);
}

function onBuzz(game, userId, io) {
  if (game.state !== 'playing') return false;
  if (game.pstate[userId] !== 'buzzing') return false;
  if (game.currentBuzz !== null) return false; // quelqu'un a déjà buzzé

  // Premier à buzzer !
  game.currentBuzz = userId;
  game.pstate[userId] = 'answering';
  game.buzzOrder.push(userId);

  // Les autres passent en attente
  for (const p of game.players) {
    if (p !== userId && game.pstate[p] === 'buzzing') {
      game.pstate[p] = 'waiting_answer';
    }
  }

  game.deadline = Date.now() + ANSWER_TIME_MS;
  emitBuzzerState(io, game);

  // Timer pour la réponse
  schedule(game, () => onAnswerTimeout(game, userId, io), ANSWER_TIME_MS);
  return true;
}

function submitAnswer(game, userId, answerIndex, io) {
  if (game.state !== 'playing') return false;
  if (game.pstate[userId] !== 'answering') return false;
  if (game.currentBuzz !== userId) return false;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return false;

  const q = game.questions[game.questionIndex];
  const correct = answerIndex === q.correctIndex;

  if (correct) {
    game.scores[userId] += q.points;
    game.correctCount[userId]++;
  }

  game.lastQuestionResult = {
    questionIndex: game.questionIndex,
    buzzedBy: userId,
    answerIndex,
    correct,
    points: correct ? q.points : 0,
    correctIndex: q.correctIndex,
  };

  // Enregistrer l'historique
  game.scoresHistory.push({
    questionIndex: game.questionIndex,
    buzzedBy: userId,
    answerIndex,
    correct,
    points: correct ? q.points : 0,
    scores: { ...game.scores },
  });

  game.pstate[userId] = 'feedback';

  // Les autres voient le résultat aussi
  for (const p of game.players) {
    if (p !== userId && game.pstate[p] !== 'done') {
      game.pstate[p] = 'feedback';
    }
  }

  emitBuzzerState(io, game);

  // Passer à la question suivante après le feedback
  schedule(game, () => nextQuestion(game, io), FEEDBACK_TIME_MS);
  return true;
}

function onAnswerTimeout(game, userId, io) {
  if (game.pstate[userId] !== 'answering') return;

  // Le joueur n'a pas répondu à temps
  game.lastQuestionResult = {
    questionIndex: game.questionIndex,
    buzzedBy: userId,
    answerIndex: -1,
    correct: false,
    points: 0,
    timedOut: true,
    correctIndex: game.questions[game.questionIndex].correctIndex,
  };

  game.scoresHistory.push({
    questionIndex: game.questionIndex,
    buzzedBy: userId,
    answerIndex: -1,
    correct: false,
    points: 0,
    scores: { ...game.scores },
  });

  game.pstate[userId] = 'feedback';
  for (const p of game.players) {
    if (p !== userId && game.pstate[p] !== 'done') {
      game.pstate[p] = 'feedback';
    }
  }

  emitBuzzerState(io, game);
  schedule(game, () => nextQuestion(game, io), FEEDBACK_TIME_MS);
}

function onQuestionTimeout(game, io) {
  if (game.state !== 'playing') return;
  if (game.currentBuzz !== null) return; // quelqu'un a déjà buzzé, le timer de réponse gère

  // Personne n'a buzzé
  game.lastQuestionResult = {
    questionIndex: game.questionIndex,
    buzzedBy: null,
    answerIndex: -1,
    correct: false,
    points: 0,
    timedOut: true,
    nobodyBuzzed: true,
    correctIndex: game.questions[game.questionIndex].correctIndex,
  };

  game.scoresHistory.push({
    questionIndex: game.questionIndex,
    buzzedBy: null,
    answerIndex: -1,
    correct: false,
    points: 0,
    scores: { ...game.scores },
  });

  for (const p of game.players) {
    game.pstate[p] = 'feedback';
  }

  emitBuzzerState(io, game);
  schedule(game, () => nextQuestion(game, io), FEEDBACK_TIME_MS);
}

function nextQuestion(game, io) {
  game.questionIndex++;
  if (game.questionIndex >= game.questions.length) {
    finishGame(game, io);
  } else {
    startQuestion(game, io);
  }
}

function finishGame(game, io) {
  game.state = 'finished';
  clearQuizTimers(game);

  // Déterminer le gagnant
  const sorted = Object.entries(game.scores)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) {
    game.winner = 'draw';
  } else {
    game.winner = sorted[0]?.[0] || null;
  }

  console.log(`🎯 Buzzer Quiz terminé: ${game.winner} (${JSON.stringify(game.scores)})`);
  emitBuzzerState(io, game);
}

// ══════════════════════════════════════
// VUE PAR JOUEUR
// ══════════════════════════════════════

function emitBuzzerState(io, game) {
  if (!game || !io) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game: buildBuzzerView(game, p) });
  }
}

function buildBuzzerView(game, viewer) {
  const currentQ = game.questions[game.questionIndex] || null;

  // Pour le viewer, on ne montre PAS correctIndex
  const questions = game.questions.map((q, i) => ({
    id: q.id,
    question: q.question,
    answers: q.answers,
    difficulty: q.difficulty,
    points: q.points,
    // correctIndex seulement pour les questions déjà passées
    ...(i < game.questionIndex ? { correctIndex: q.correctIndex } : {}),
  }));

  return {
    id: game.id,
    type: 'buzzer_quiz',
    players: game.players,
    scores: game.scores,
    correctCount: game.correctCount,
    state: game.state,
    quizStatus: game.quizStatus,
    quizError: game.quizError,
    questions,
    questionIndex: game.questionIndex,
    totalQuestions: game.questions.length,
    currentQuestion: currentQ ? {
      id: currentQ.id,
      question: currentQ.question,
      answers: currentQ.answers,
      difficulty: currentQ.difficulty,
      points: currentQ.points,
    } : null,
    pstate: game.pstate[viewer] || 'idle',
    currentBuzz: game.currentBuzz,
    buzzOrder: game.buzzOrder,
    deadline: game.deadline,
    lastQuestionResult: game.lastQuestionResult,
    scoresHistory: game.scoresHistory,
    winner: game.winner,
    createdBy: game.createdBy,
  };
}

function quizAccept(game, io) {
  if (game.quizStatus === 'ready' && game.state === 'waiting') {
    startGame(game, io);
  } else {
    emitBuzzerState(io, game);
  }
}

function quizRematch(game, io) {
  clearQuizTimers(game);
  game.state = 'playing';
  game.winner = null;
  game.quizStatus = 'generating';
  game.quizError = null;
  game.questionIndex = 0;
  game.currentBuzz = null;
  game.buzzOrder = [];
  game.lastQuestionResult = null;
  game.scoresHistory = [];

  for (const p of game.players) {
    game.scores[p] = 0;
    game.correctCount[p] = 0;
    game.pstate[p] = 'idle';
    game.order[p] = [];
  }

  emitBuzzerState(io, game);

  // Nouveau pack pour la revanche
  generateQuizPack()
    .then(pack => onPackReady(game, io, pack))
    .catch(async (err) => {
      console.error('🎯 Buzzer Quiz IA indisponible pour revanche:', err.message);
      const fallback = await fallbackPack();
      onPackReady(game, io, fallback);
    });
}

module.exports = {
  createBuzzerQuiz,
  addPlayer,
  removePlayer,
  startGame,
  onBuzz,
  submitAnswer,
  quizAccept,
  quizRematch,
  buildBuzzerView,
  emitBuzzerState,
  clearQuizTimers,
  MIN_PLAYERS,
  MAX_PLAYERS,
};
