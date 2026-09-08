/**
 * 🧠 QUIZ — Trivia multijoueur (inspiré de « Qui veut gagner des millions ? »)
 *
 * Un seul pack de 20 questions est généré par partie (via OpenAI) et partagé
 * par les deux joueurs. Chaque joueur reçoit le même pack, mais dans un ordre
 * mélangé qui lui est propre — impossible de copier les réponses de l'autre.
 *
 * Progression asynchrone : chacun avance à son rythme (adapté à la messagerie).
 * Les vues émises sont construites par joueur (buildQuizView) pour ne JAMAIS
 * révéler les réponses correctes des questions que le joueur n'a pas encore
 * traitées.
 */

const axios = require('axios');

const PACK_SIZE = 20;
const QUESTION_TIME_MS = 20000; // 20s par question
const FEEDBACK_TIME_MS = 6000;  // 6s d'affichage du résultat avant la suivante
const TIERS = ['facile', 'moyen', 'difficile', 'tres_difficile'];
const TIER_POINTS = { facile: 100, moyen: 200, difficile: 300, tres_difficile: 500 };

function createGameId() {
  return Math.random().toString(36).substring(2, 10);
}

function shuffleIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ══════════════════════════════════════
// GÉNÉRATION DU PACK (OpenAI + fallback)
// ══════════════════════════════════════

const AI_PROMPT = `Tu es un générateur de quiz de culture générale en français pour un jeu multijoueur inspiré de « Qui veut gagner des millions ? ».

Génère exactement 20 questions.
Règles :
- Les 5 premières questions sont faciles, les 5 suivantes moyennes, les 5 suivantes difficiles, les 5 dernières très difficiles.
- Chaque question a exactement 4 réponses possibles et une seule réponse correcte.
- Utilise uniquement des faits objectifs et vérifiables, sans ambiguïté, sans opinion, sans date relative.
- Varie les domaines : géographie, histoire, sciences, sport, arts, culture, technologie, nature...
- Ne répète jamais une question.
- Réponds UNIQUEMENT avec un objet JSON au format : {"questions":[{"question":"...","answers":["...","...","...","..."],"correctIndex":0}]}
- "correctIndex" est l'index (0 à 3) de la bonne réponse dans "answers".`;

function buildPack(rawList) {
  if (!Array.isArray(rawList) || rawList.length < PACK_SIZE) return null;
  const pack = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    const q = rawList[i];
    if (!q || typeof q.question !== 'string' || !q.question.trim()) return null;
    if (!Array.isArray(q.answers) || q.answers.length !== 4) return null;
    if (q.answers.some(a => typeof a !== 'string' || !a.trim())) return null;
    const correctIndex = Number(q.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;
    const tier = TIERS[Math.floor(i / 5)];
    pack.push({
      id: `q${i + 1}`,
      question: q.question.trim(),
      answers: q.answers.map(a => a.trim()),
      correctIndex,
      difficulty: tier,
      points: TIER_POINTS[tier],
    });
  }
  return pack;
}

async function generateQuizPack() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY absente du .env');

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      temperature: 1.0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: AI_PROMPT },
      ],
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 45000,
    }
  );

  const content = res.data?.choices?.[0]?.message?.content;
  const cleaned = String(content || '').replace(/```(?:json)?/gi, '').trim();
  const parsed = JSON.parse(cleaned);
  const rawList = Array.isArray(parsed) ? parsed : parsed?.questions;
  const pack = buildPack(rawList);
  if (!pack) throw new Error('Pack généré par l\'IA invalide');
  return pack;
}

// Banque locale de secours — utilisée uniquement si l'API OpenAI échoue,
// pour que le jeu ne soit jamais bloqué.
const FALLBACK_BANK = {
  facile: [
    { question: 'Quelle est la capitale de la France ?', answers: ['Paris', 'Lyon', 'Marseille', 'Toulouse'], correctIndex: 0 },
    { question: 'Combien de côtés possède un triangle ?', answers: ['4', '3', '5', '6'], correctIndex: 1 },
    { question: 'Quelle planète est surnommée « la planète rouge » ?', answers: ['Vénus', 'Saturne', 'Mars', 'Jupiter'], correctIndex: 2 },
    { question: 'Quel animal dit-on être le meilleur ami de l\'homme ?', answers: ['Le chat', 'Le chien', 'Le cheval', 'Le perroquet'], correctIndex: 1 },
    { question: 'Quel est le symbole chimique de l\'eau ?', answers: ['O2', 'CO2', 'H2O', 'H2O2'], correctIndex: 2 },
    { question: 'Combien de jours compte une année bissextile ?', answers: ['364', '365', '366', '367'], correctIndex: 2 },
  ],
  moyen: [
    { question: 'En quelle année a eu lieu la Révolution française ?', answers: ['1799', '1789', '1776', '1815'], correctIndex: 1 },
    { question: 'Qui a peint « La Joconde » ?', answers: ['Pablo Picasso', 'Vincent van Gogh', 'Claude Monet', 'Léonard de Vinci'], correctIndex: 3 },
    { question: 'Quel pays a remporté la Coupe du monde de football en 2018 ?', answers: ['Le Brésil', 'L\'Allemagne', 'La France', 'L\'Argentine'], correctIndex: 2 },
    { question: 'Quelle est la plus grande planète du système solaire ?', answers: ['Saturne', 'Neptune', 'Jupiter', 'La Terre'], correctIndex: 2 },
    { question: 'Qui a écrit « Le Petit Prince » ?', answers: ['Victor Hugo', 'Antoine de Saint-Exupéry', 'Jules Verne', 'Marcel Pagnol'], correctIndex: 1 },
    { question: 'Quel est le plus grand océan du monde ?', answers: ['L\'Atlantique', 'L\'Indien', 'Le Pacifique', 'L\'Arctique'], correctIndex: 2 },
  ],
  difficile: [
    { question: 'Quel est le premier élément du tableau périodique ?', answers: ['L\'hélium', 'L\'oxygène', 'Le carbone', 'L\'hydrogène'], correctIndex: 3 },
    { question: 'Combien de cordes possède un violon ?', answers: ['6', '4', '5', '7'], correctIndex: 1 },
    { question: 'Quelle est la capitale de l\'Australie ?', answers: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correctIndex: 2 },
    { question: 'En quelle année l\'homme a-t-il marché sur la Lune pour la première fois ?', answers: ['1965', '1972', '1969', '1959'], correctIndex: 2 },
    { question: 'Quel est le plus petit pays du monde ?', answers: ['Monaco', 'Malte', 'L\'Andorre', 'Le Vatican'], correctIndex: 3 },
    { question: 'Qui a composé la Neuvième Symphonie ?', answers: ['Mozart', 'Bach', 'Chopin', 'Beethoven'], correctIndex: 3 },
  ],
  tres_difficile: [
    { question: 'Quelle est la vitesse approximative de la lumière ?', answers: ['150 000 km/s', '300 000 km/s', '1 000 000 km/s', '30 000 km/s'], correctIndex: 1 },
    { question: 'Quel est l\'os le plus long du corps humain ?', answers: ['Le tibia', 'L\'humérus', 'Le fémur', 'Le radius'], correctIndex: 2 },
    { question: 'Combien de pays membres compte l\'ONU ?', answers: ['180', '185', '201', '193'], correctIndex: 3 },
    { question: 'Quelle est la capitale de la Nouvelle-Zélande ?', answers: ['Auckland', 'Christchurch', 'Wellington', 'Canberra'], correctIndex: 2 },
    { question: 'Combien de dents possède un adulte en moyenne ?', answers: ['28', '36', '32', '24'], correctIndex: 2 },
    { question: 'Quel est le plus grand organe du corps humain ?', answers: ['Le foie', 'Les poumons', 'Le cerveau', 'La peau'], correctIndex: 3 },
  ],
};

function fallbackPack() {
  const pack = [];
  let id = 1;
  for (const tier of TIERS) {
    const pool = shuffleIndices(FALLBACK_BANK[tier].length)
      .slice(0, 5)
      .map(i => FALLBACK_BANK[tier][i]);
    for (const q of pool) {
      pack.push({ id: `q${id++}`, ...q, difficulty: tier, points: TIER_POINTS[tier] });
    }
  }
  return pack;
}

// ══════════════════════════════════════
// VIE DE LA PARTIE
// ══════════════════════════════════════

function createQuizGame(p1, p2, io) {
  const game = {
    id: createGameId(), type: 'quiz',
    players: [p1, p2],
    scores: { [p1]: 0, [p2]: 0 },
    correctCount: { [p1]: 0, [p2]: 0 },
    state: 'waiting',          // waiting | playing | finished
    quizStatus: 'generating',  // generating | ready
    quizError: null,
    questions: [],             // pack partagé (avec correctIndex, côté serveur uniquement)
    order: { [p1]: [], [p2]: [] },
    progress: { [p1]: 0, [p2]: 0 },   // nb de questions répondues par joueur
    pstate: { [p1]: 'idle', [p2]: 'idle' }, // idle | question | feedback | done
    deadline: { [p1]: null, [p2]: null },
    lastResult: { [p1]: null, [p2]: null },
    winner: null,
    createdBy: p1,
    _timers: {},
  };

  // Génération UNE seule fois, en arrière-plan. Le jeu est créé immédiatement
  // (la carte d'invitation s'affiche), puis le pack arrive quand il est prêt.
  generateQuizPack()
    .then(pack => onPackReady(game, io, pack))
    .catch(err => {
      console.error('🧠 Génération IA indisponible, pack de secours :', err.message);
      onPackReady(game, io, fallbackPack());
    });

  return game;
}

function onPackReady(game, io, pack) {
  game.questions = pack;
  game.quizStatus = 'ready';
  game.order[game.players[0]] = shuffleIndices(pack.length);
  game.order[game.players[1]] = shuffleIndices(pack.length);
  console.log(`🧠 Quiz prêt : ${pack.length} questions pour ${game.players[0]} vs ${game.players[1]}`);
  emitQuizState(io, game);
  if (game.state === 'playing') startQuiz(game, io);
}

function quizAccept(game, io) {
  if (game.quizStatus === 'ready') startQuiz(game, io);
  else emitQuizState(io, game);
}

function startQuiz(game, io) {
  for (const p of game.players) startPlayerQuestion(game, p, io);
}

function startPlayerQuestion(game, userId, io) {
  if (game.state !== 'playing' || game.quizStatus !== 'ready') return;
  if (game.pstate[userId] !== 'idle') return;
  if (game.progress[userId] >= game.questions.length) {
    game.pstate[userId] = 'done';
    emitQuizState(io, game);
    maybeFinish(game, io);
    return;
  }
  game.pstate[userId] = 'question';
  game.deadline[userId] = Date.now() + QUESTION_TIME_MS;
  emitQuizState(io, game);
  schedule(game, userId, io, QUESTION_TIME_MS, () => onQuestionTimeout(game, userId, io));
}

function quizAnswer(game, userId, answerIndex, io) {
  if (game.state !== 'playing' || game.quizStatus !== 'ready') return;
  if (game.pstate[userId] !== 'question') return;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return;

  const qIndex = game.order[userId][game.progress[userId]];
  const q = game.questions[qIndex];
  const correct = answerIndex === q.correctIndex;
  if (correct) {
    game.scores[userId] += q.points;
    game.correctCount[userId]++;
  }
  game.lastResult[userId] = {
    qIndex,
    answerIndex,
    correct,
    points: correct ? q.points : 0,
    timedOut: false,
    correctIndex: q.correctIndex,
  };
  game.progress[userId]++;
  game.pstate[userId] = 'feedback';
  emitQuizState(io, game);
  schedule(game, userId, io, FEEDBACK_TIME_MS, () => quizNext(game, userId, io));
}

function onQuestionTimeout(game, userId, io) {
  if (game.pstate[userId] !== 'question') return;
  const qIndex = game.order[userId][game.progress[userId]];
  const q = game.questions[qIndex];
  game.lastResult[userId] = {
    qIndex,
    answerIndex: -1,
    correct: false,
    points: 0,
    timedOut: true,
    correctIndex: q.correctIndex,
  };
  game.progress[userId]++;
  game.pstate[userId] = 'feedback';
  emitQuizState(io, game);
  schedule(game, userId, io, FEEDBACK_TIME_MS, () => quizNext(game, userId, io));
}

function quizNext(game, userId, io) {
  // Garde anti double-tap / double timer : on n'avance que depuis 'feedback'
  if (game.pstate[userId] !== 'feedback') return;
  clearTimeout(game._timers[userId]);
  game.lastResult[userId] = null;
  if (game.progress[userId] >= game.questions.length) {
    game.pstate[userId] = 'done';
    emitQuizState(io, game);
    maybeFinish(game, io);
    return;
  }
  // startPlayerQuestion exige 'idle' : on repasse par là depuis le feedback
  game.pstate[userId] = 'idle';
  startPlayerQuestion(game, userId, io);
}

function maybeFinish(game, io) {
  if (game.state !== 'playing') return;
  const [a, b] = game.players;
  if (game.pstate[a] === 'done' && game.pstate[b] === 'done') {
    game.state = 'finished';
    clearQuizTimers(game);
    if (game.scores[a] > game.scores[b]) game.winner = a;
    else if (game.scores[a] < game.scores[b]) game.winner = b;
    else game.winner = 'draw';
    console.log(`🧠 Quiz terminé : ${game.winner} (${game.scores[a]} vs ${game.scores[b]})`);
    emitQuizState(io, game);
  }
}

function quizRematch(game, io) {
  clearQuizTimers(game);
  game.state = 'playing';
  game.winner = null;
  for (const p of game.players) {
    game.scores[p] = 0;
    game.correctCount[p] = 0;
    game.progress[p] = 0;
    game.pstate[p] = 'idle';
    game.deadline[p] = null;
    game.lastResult[p] = null;
    game.order[p] = shuffleIndices(game.questions.length);
  }
  emitQuizState(io, game);
  startQuiz(game, io);
}

function schedule(game, userId, io, ms, fn) {
  if (game._timers[userId]) clearTimeout(game._timers[userId]);
  game._timers[userId] = setTimeout(fn, ms);
}

function clearQuizTimers(game) {
  for (const k of Object.keys(game._timers || {})) {
    clearTimeout(game._timers[k]);
  }
  game._timers = {};
}

// ══════════════════════════════════════
// VUE PAR JOUEUR — ne fuite JAMAIS les réponses
// ══════════════════════════════════════

function buildQuizView(game, viewer) {
  const other = game.players.find(p => p !== viewer);
  const pack = (game.questions || []).map(q => ({
    id: q.id,
    question: q.question,
    answers: q.answers,
    difficulty: q.difficulty,
    points: q.points,
    // correctIndex délibérément omis
  }));
  return {
    id: game.id,
    type: 'quiz',
    players: game.players,
    scores: game.scores,
    correctCount: game.correctCount,
    state: game.state,
    quizStatus: game.quizStatus,
    quizError: game.quizError,
    questions: pack,
    order: game.order[viewer] || [],
    progress: game.progress[viewer],
    pstate: game.pstate[viewer],
    deadline: game.deadline[viewer],
    lastResult: game.lastResult[viewer],
    opponent: { progress: game.progress[other] },
    winner: game.winner,
    createdBy: game.createdBy,
  };
}

function emitQuizState(io, game) {
  if (!game || !io) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game: buildQuizView(game, p) });
  }
}

module.exports = {
  createQuizGame,
  quizAccept,
  quizAnswer,
  quizNext,
  quizRematch,
  buildQuizView,
  emitQuizState,
  clearQuizTimers,
};