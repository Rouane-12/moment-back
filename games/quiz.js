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
const QuizQuestion = require('../models/QuizQuestion');
const { normalizeText, createHash, isExactDuplicate, isSemanticSimilar, normalizeQuestion } = require('../utils/quizDuplicateChecker');
const { fetchOpenTDBQuestions, requestSessionToken } = require('../utils/openTDB');

const PACK_SIZE = 20;
const QUESTION_TIME_MS = 20000; // 20s par question
const FEEDBACK_TIME_MS = 6000;  // 6s d'affichage du résultat avant la suivante
const TIERS = ['facile', 'moyen', 'difficile', 'tres_difficile', 'expert'];
const TIER_POINTS = { facile: 100, moyen: 200, difficile: 300, tres_difficile: 500, expert: 600 };

// OpenTDB session token (initialized on first use)
let opentdbToken = null;

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

async function getUsedQuestionsText() {
  try {
    const recentQuestions = await QuizQuestion.find({})
      .sort({ lastUsedAt: -1 })
      .limit(100)
      .select('text');
    return recentQuestions.map(q => q.text).join('\n- ');
  } catch (error) {
    console.error('Error fetching used questions:', error.message);
    return '';
  }
}

async function buildAIPrompt() {
  const usedQuestions = await getUsedQuestionsText();
  return `Tu es le générateur officiel du quiz de l'application.

Génère 20 questions originales de culture générale.

Contraintes :
- Chaque question possède exactement 4 réponses.
- Une seule réponse est correcte.
- Les questions doivent être adaptées à des adultes.
- Ne génère pas de questions enfantines.
- Les questions doivent couvrir plusieurs domaines :
  histoire, géographie, sciences, art, littérature, musique,
  cinéma, technologie, économie, culture africaine, monde,
  société, sport, architecture, mythologie, etc.
- Évite les questions extrêmement connues ou évidentes.
- La difficulté doit progressivement augmenter.
- Les questions 1 à 5 : moyen
- 6 à 10 : moyen/difficile
- 11 à 15 : difficile
- 16 à 20 : très difficile
- Ne reformule jamais une question déjà fournie précédemment.
- Ne produis jamais une question portant sur exactement le même fait qu'une question précédente.
- Les quatre propositions doivent être plausibles.
- Ne crée aucune réponse ambiguë.
- Une réponse doit être factuellement vérifiable.
- Ne mets pas la réponse correcte systématiquement à la même position.

QUESTIONS DÉJÀ UTILISÉES (ne pas reformuler) :
${usedQuestions ? '- ' + usedQuestions : '(aucune question enregistrée)'}

Réponds uniquement avec le JSON demandé : {"questions":[{"question":"...","answers":["...","...","...","..."],"correctIndex":0}]}`;
}

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

  const prompt = await buildAIPrompt();

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      temperature: 1.0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
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
  
  // Check for duplicates and save to database
  const filteredPack = await filterAndSaveQuestions(pack, 'ai');
  return filteredPack;
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
    { question: 'Quelle couleur mélange le bleu et le jaune ?', answers: ['Vert', 'Orange', 'Violet', 'Marron'], correctIndex: 0 },
    { question: 'Combien de pattes a une araignée ?', answers: ['6', '8', '10', '12'], correctIndex: 1 },
    { question: 'Quel est le plus grand animal terrestre ?', answers: ['L\'éléphant', 'La baleine', 'Le rhinocéros', 'La girafe'], correctIndex: 0 },
    { question: 'Combien de continents y a-t-il sur Terre ?', answers: ['5', '6', '7', '8'], correctIndex: 2 },
    { question: 'Quel fruit est jaune et courbé ?', answers: ['La pomme', 'La poire', 'La banane', 'L\'orange'], correctIndex: 2 },
    { question: 'Combien de jours y a-t-il dans une semaine ?', answers: ['5', '6', '7', '8'], correctIndex: 2 },
    { question: 'Quelle saison vient après l\'été ?', answers: ['Le printemps', 'L\'automne', 'L\'hiver', 'L\'été'], correctIndex: 1 },
    { question: 'Quel instrument de musique a des touches noires et blanches ?', answers: ['La guitare', 'Le piano', 'La batterie', 'Le violon'], correctIndex: 1 },
    { question: 'Combien de doigts a une main ?', answers: ['4', '5', '6', '7'], correctIndex: 1 },
  ],
  moyen: [
    { question: 'En quelle année a eu lieu la Révolution française ?', answers: ['1799', '1789', '1776', '1815'], correctIndex: 1 },
    { question: 'Qui a peint « La Joconde » ?', answers: ['Pablo Picasso', 'Vincent van Gogh', 'Claude Monet', 'Léonard de Vinci'], correctIndex: 3 },
    { question: 'Quel pays a remporté la Coupe du monde de football en 2018 ?', answers: ['Le Brésil', 'L\'Allemagne', 'La France', 'L\'Argentine'], correctIndex: 2 },
    { question: 'Quelle est la plus grande planète du système solaire ?', answers: ['Saturne', 'Neptune', 'Jupiter', 'La Terre'], correctIndex: 2 },
    { question: 'Qui a écrit « Le Petit Prince » ?', answers: ['Victor Hugo', 'Antoine de Saint-Exupéry', 'Jules Verne', 'Marcel Pagnol'], correctIndex: 1 },
    { question: 'Quel est le plus grand océan du monde ?', answers: ['L\'Atlantique', 'L\'Indien', 'Le Pacifique', 'L\'Arctique'], correctIndex: 2 },
    { question: 'En quelle année le Titanic a-t-il coulé ?', answers: ['1905', '1912', '1920', '1915'], correctIndex: 1 },
    { question: 'Quel est le plus haut sommet du monde ?', answers: ['Le Mont Blanc', 'Le Kilimandjaro', 'L\'Everest', 'Le Mont Fuji'], correctIndex: 2 },
    { question: 'Qui a découvert l\'Amérique en 1492 ?', answers: ['Vasco de Gama', 'Christophe Colomb', 'Magellan', 'Jacques Cartier'], correctIndex: 1 },
    { question: 'Combien d\'os compte le corps humain adulte ?', answers: ['186', '206', '226', '246'], correctIndex: 1 },
    { question: 'Quelle est la capitale de l\'Espagne ?', answers: ['Barcelone', 'Séville', 'Madrid', 'Valence'], correctIndex: 2 },
    { question: 'En quelle année a eu lieu la chute du mur de Berlin ?', answers: ['1985', '1989', '1991', '1993'], correctIndex: 1 },
    { question: 'Quel gaz compose majoritairement l\'atmosphère terrestre ?', answers: ['L\'oxygène', 'L\'azote', 'Le dioxyde de carbone', 'L\'hydrogène'], correctIndex: 1 },
    { question: 'Combien de pays y a-t-il dans l\'Union européenne ?', answers: ['25', '27', '29', '31'], correctIndex: 1 },
    { question: 'Qui a inventé l\'ampoule électrique ?', answers: ['Nikola Tesla', 'Thomas Edison', 'Alexander Graham Bell', 'Albert Einstein'], correctIndex: 1 },
  ],
  difficile: [
    { question: 'Quel est le premier élément du tableau périodique ?', answers: ['L\'hélium', 'L\'oxygène', 'Le carbone', 'L\'hydrogène'], correctIndex: 3 },
    { question: 'Combien de cordes possède un violon ?', answers: ['6', '4', '5', '7'], correctIndex: 1 },
    { question: 'Quelle est la capitale de l\'Australie ?', answers: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correctIndex: 2 },
    { question: 'En quelle année l\'homme a-t-il marché sur la Lune pour la première fois ?', answers: ['1965', '1972', '1969', '1959'], correctIndex: 2 },
    { question: 'Quel est le plus petit pays du monde ?', answers: ['Monaco', 'Malte', 'L\'Andorre', 'Le Vatican'], correctIndex: 3 },
    { question: 'Qui a composé la Neuvième Symphonie ?', answers: ['Mozart', 'Bach', 'Chopin', 'Beethoven'], correctIndex: 3 },
    { question: 'Quelle est la capitale du Canada ?', answers: ['Toronto', 'Vancouver', 'Ottawa', 'Montréal'], correctIndex: 2 },
    { question: 'En quelle année a été créé le World Wide Web ?', answers: ['1985', '1990', '1995', '2000'], correctIndex: 1 },
    { question: 'Quel est le fleuve le plus long du monde ?', answers: ['L\'Amazone', 'Le Nil', 'Le Mississippi', 'Le Yangtsé'], correctIndex: 1 },
    { question: 'Combien de pays bordent la Méditerranée ?', answers: ['18', '21', '24', '27'], correctIndex: 1 },
    { question: 'Quelle est la monnaie du Japon ?', answers: ['Le won', 'Le yuan', 'Le yen', 'Le ringgit'], correctIndex: 2 },
    { question: 'En quelle année a été fondé l\'État d\'Israël ?', answers: ['1945', '1948', '1950', '1952'], correctIndex: 1 },
    { question: 'Quel est le désert le plus chaud du monde ?', answers: ['Le Sahara', 'Le désert de Gobi', 'Le désert d\'Atacama', 'Le désert de Kalahari'], correctIndex: 0 },
    { question: 'Combien de planètes composent notre système solaire ?', answers: ['7', '8', '9', '10'], correctIndex: 1 },
    { question: 'Quelle est la capitale de la Norvège ?', answers: ['Bergen', 'Oslo', 'Stockholm', 'Helsinki'], correctIndex: 1 },
  ],
  tres_difficile: [
    { question: 'Quelle est la vitesse approximative de la lumière ?', answers: ['150 000 km/s', '300 000 km/s', '1 000 000 km/s', '30 000 km/s'], correctIndex: 1 },
    { question: 'Quel est l\'os le plus long du corps humain ?', answers: ['Le tibia', 'L\'humérus', 'Le fémur', 'Le radius'], correctIndex: 2 },
    { question: 'Combien de pays membres compte l\'ONU ?', answers: ['180', '185', '201', '193'], correctIndex: 3 },
    { question: 'Quelle est la capitale de la Nouvelle-Zélande ?', answers: ['Auckland', 'Christchurch', 'Wellington', 'Canberra'], correctIndex: 2 },
    { question: 'Combien de dents possède un adulte en moyenne ?', answers: ['28', '36', '32', '24'], correctIndex: 2 },
    { question: 'Quel est le plus grand organe du corps humain ?', answers: ['Le foie', 'Les poumons', 'Le cerveau', 'La peau'], correctIndex: 3 },
    { question: 'En quelle année a été signé le traité de Rome ?', answers: ['1950', '1957', '1962', '1969'], correctIndex: 1 },
    { question: 'Quel est le point le plus bas sur Terre ?', answers: ['La mer Morte', 'La fosse des Mariannes', 'Le lac Baïkal', 'La vallée de la Mort'], correctIndex: 0 },
    { question: 'Combien de chromosomes possède l\'être humain ?', answers: ['23', '46', '44', '48'], correctIndex: 1 },
    { question: 'Quelle est la capitale du Bhoutan ?', answers: ['Thimphou', 'Paro', 'Punakha', 'Wangdue'], correctIndex: 0 },
    { question: 'En quelle année a eu lieu la bataille de Waterloo ?', answers: ['1805', '1812', '1815', '1820'], correctIndex: 2 },
    { question: 'Quel est le métal le plus abondant dans la croûte terrestre ?', answers: ['Le fer', 'L\'aluminium', 'Le cuivre', 'Le zinc'], correctIndex: 1 },
    { question: 'Combien d\'espèces de pingouins existent-elles ?', answers: ['12', '17', '22', '27'], correctIndex: 1 },
    { question: 'Quelle est la capitale du Suriname ?', answers: ['Paramaribo', 'Lelydorp', 'Nieuw Nickerie', 'Albina'], correctIndex: 0 },
    { question: 'En quelle année a été découverte la pénicilline ?', answers: ['1925', '1928', '1932', '1935'], correctIndex: 1 },
  ],
};

async function filterAndSaveQuestions(questions, source) {
  const filtered = [];
  const existingHashes = new Set();
  
  // Fetch existing hashes from database
  try {
    const existingQuestions = await QuizQuestion.find({}).select('hash');
    existingQuestions.forEach(q => existingHashes.add(q.hash));
  } catch (error) {
    console.error('Error fetching existing hashes:', error.message);
  }
  
  for (const q of questions) {
    const normalized = normalizeQuestion(q);
    
    // Check for exact duplicate
    if (existingHashes.has(normalized.hash)) {
      console.log(`Skipping duplicate question: ${q.question}`);
      continue;
    }
    
    // Check for semantic similarity with recent questions
    const recentQuestions = await QuizQuestion.find({})
      .sort({ lastUsedAt: -1 })
      .limit(50)
      .select('text');
    
    if (isSemanticSimilar(q.question, recentQuestions.map(rq => rq.text), 0.7)) {
      console.log(`Skipping semantically similar question: ${q.question}`);
      continue;
    }
    
    filtered.push(q);
    existingHashes.add(normalized.hash);
  }
  
  // If we filtered out too many questions, try to fetch from database
  if (filtered.length < PACK_SIZE) {
    console.log(`Filtered pack has only ${filtered.length} questions, fetching from database...`);
    const dbQuestions = await fetchUnusedQuestions(PACK_SIZE - filtered.length);
    filtered.push(...dbQuestions);
  }
  
  // Save new questions to database
  for (const q of filtered) {
    if (!q._saved) {
      await saveQuestionToDatabase(q, source);
    }
  }
  
  return filtered.slice(0, PACK_SIZE);
}

async function saveQuestionToDatabase(question, source, gameId = null) {
  try {
    const normalized = normalizeQuestion(question);
    const tier = question.difficulty || TIERS[Math.floor(Math.random() * TIERS.length)];
    
    const quizQuestion = new QuizQuestion({
      hash: normalized.hash,
      text: normalized.text,
      normalizedText: normalized.normalizedText,
      answers: normalized.answers,
      correctIndex: normalized.correctIndex,
      difficulty: tier,
      points: TIER_POINTS[tier] || 200,
      category: question.category || 'autre',
      source: source,
      usedCount: 1,
      usedByGames: gameId ? [gameId] : [],
      lastUsedAt: new Date()
    });
    
    await quizQuestion.save();
    question._saved = true;
    console.log(`Saved question to database: ${question.question}`);
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error - question already exists
      console.log(`Question already exists in database: ${question.question}`);
    } else {
      console.error('Error saving question to database:', error.message);
    }
  }
}

async function fetchUnusedQuestions(count) {
  try {
    // Fetch questions with lowest usage count
    const questions = await QuizQuestion.find({ isDuplicate: false })
      .sort({ usedCount: 1, lastUsedAt: 1 })
      .limit(count)
      .lean();
    
    return questions.map(q => ({
      id: q._id.toString(),
      question: q.text,
      answers: q.answers,
      correctIndex: q.correctIndex,
      difficulty: q.difficulty,
      points: q.points,
      _saved: true
    }));
  } catch (error) {
    console.error('Error fetching unused questions:', error.message);
    return [];
  }
}

async function fallbackPack() {
  // Try to fetch from database first
  try {
    const dbQuestions = await fetchUnusedQuestions(PACK_SIZE);
    if (dbQuestions.length >= PACK_SIZE) {
      console.log('Using questions from database');
      return dbQuestions.slice(0, PACK_SIZE);
    }
  } catch (error) {
    console.error('Error fetching from database:', error.message);
  }
  
  // Try OpenTDB as second fallback
  try {
    if (!opentdbToken) {
      opentdbToken = await requestSessionToken();
      if (opentdbToken) console.log('OpenTDB session token acquired');
    }
    
    if (opentdbToken) {
      const opentdbQuestions = await fetchOpenTDBQuestions(PACK_SIZE, undefined, undefined, opentdbToken);
      if (opentdbQuestions.length >= PACK_SIZE) {
        console.log('Using questions from OpenTDB');
        const filtered = await filterAndSaveQuestions(opentdbQuestions, 'opentdb');
        if (filtered.length >= PACK_SIZE) {
          return filtered.slice(0, PACK_SIZE);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching from OpenTDB:', error.message);
  }
  
  // Final fallback to local bank
  console.log('Using local fallback bank');
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
    .catch(async (err) => {
      console.error('🧠 Génération IA indisponible, pack de secours :', err.message);
      const fallback = await fallbackPack();
      onPackReady(game, io, fallback);
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

async function quizRematch(game, io) {
  clearQuizTimers(game);
  game.state = 'playing';
  game.winner = null;
  game.quizStatus = 'generating';
  game.quizError = null;
  for (const p of game.players) {
    game.scores[p] = 0;
    game.correctCount[p] = 0;
    game.progress[p] = 0;
    game.pstate[p] = 'idle';
    game.deadline[p] = null;
    game.lastResult[p] = null;
    game.order[p] = [];
  }
  emitQuizState(io, game);
  
  // Generate new questions for rematch to avoid repetition
  generateQuizPack()
    .then(pack => onPackReady(game, io, pack))
    .catch(async (err) => {
      console.error('🧠 Génération IA indisponible pour revanche, pack de secours :', err.message);
      const fallback = await fallbackPack();
      onPackReady(game, io, fallback);
    });
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