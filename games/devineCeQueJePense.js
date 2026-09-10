/**
 * Devine ce que je pense - Yes/No guessing game
 * One player thinks of something, the other asks questions to guess it
 */

const MAX_QUESTIONS = 20;
const QUESTION_TIME_MS = 15000; // 15 seconds to ask

const CATEGORIES = [
  {
    name: 'Animaux',
    icon: '🐾',
    items: ['chien', 'chat', 'elephant', 'girafe', 'lion', 'tigre', 'ours', 'loup', 'renard', 'singe', 'poisson', 'oiseau', 'serpent', 'crocodile', 'cheval', 'vache', 'mouton', 'cochon', 'canard', 'poule'],
  },
  {
    name: 'Pays',
    icon: '🌍',
    items: ['France', 'Japon', 'Etats-Unis', 'Bresil', 'Allemagne', 'Italie', 'Espagne', 'Chine', 'Inde', 'Australie', 'Canada', 'Mexique', 'Egypte', 'Maroc', 'Nigeria', 'Suede', 'Norvege', 'Grece', 'Portugal', 'Argentine'],
  },
  {
    name: 'Objets',
    icon: '📦',
    items: ['telephone', 'ordinateur', 'livre', 'chaise', 'table', 'lampe', 'montre', 'cle', 'stylo', 'sac', 'chaussure', 'chapeau', 'lunettes', 'parapluie', 'miroir', 'bouteille', 'assiette', 'fourchette', 'couteau', 'cuillere'],
  },
  {
    name: 'Metiers',
    icon: '👔',
    items: ['medecin', 'professeur', 'policier', 'pompier', 'avocat', 'infirmier', 'cuisinier', 'mecanicien', 'architecte', 'journaliste', 'artiste', 'musicien', 'veterinaire', 'dentiste', 'pharmacien', 'pilote', 'capitaine', 'ingenieur', 'dentiste', 'electricien'],
  },
  {
    name: 'Nourriture',
    icon: '🍽️',
    items: ['pizza', 'pates', 'riz', 'poulet', 'poisson', 'salade', 'soupe', 'fromage', 'pain', 'oeuf', 'steak', 'legumes', 'fruits', 'chocolat', 'glace', 'gateau', 'yaourt', 'cereales', 'sandwich', 'tacos'],
  },
];

function createGameId() {
  return 'dcp_' + Math.random().toString(36).substring(2, 10);
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function createDevineCeQueJePenseGame(p1, p2) {
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const secretItem = category.items[Math.floor(Math.random() * category.items.length)];
  
  return {
    id: createGameId(),
    type: 'devine_ce_que_je_pense',
    players: [p1, p2],
    state: 'waiting',
    phase: 'choosing',      // choosing | asking | answering | result | finished
    category,
    secretItem,
    thinker: p1,             // who thinks of the item
    guesser: p2,             // who tries to guess
    questions: [],
    currentQuestion: null,
    questionCount: 0,
    maxQuestions: MAX_QUESTIONS,
    scores: { [p1]: 0, [p2]: 0 },
    winner: null,
    createdBy: p1,
    lastAnswer: null,
  };
}

function startGame(game, io) {
  game.state = 'playing';
  game.phase = 'asking';
  game.deadline = Date.now() + QUESTION_TIME_MS;
  emitDevineState(io, game);
}

function submitQuestion(game, userId, question, io) {
  if (game.state !== 'playing' || game.phase !== 'asking') return false;
  if (userId !== game.guesser) return false;
  if (!question || question.trim().length < 5) return false;
  
  game.questionCount++;
  game.currentQuestion = {
    number: game.questionCount,
    text: question.trim(),
    askedBy: userId,
  };
  game.phase = 'answering';
  
  emitDevineState(io, game);
  return true;
}

function submitAnswer(game, userId, answer, io) {
  if (game.state !== 'playing' || game.phase !== 'answering') return false;
  if (userId !== game.thinker) return false;
  
  const isYes = answer.toLowerCase().includes('oui');
  const isNo = answer.toLowerCase().includes('non');
  
  if (!isYes && !isNo) return false;
  
  game.lastAnswer = {
    question: game.currentQuestion.text,
    answer: isYes ? 'Oui' : 'Non',
    answerer: userId,
  };
  
  game.questions.push({
    ...game.currentQuestion,
    answer: isYes ? 'Oui' : 'Non',
  });
  
  game.currentQuestion = null;
  
  // Check if max questions reached
  if (game.questionCount >= game.maxQuestions) {
    game.state = 'finished';
    game.winner = game.thinker;
    game.scores[game.thinker] += 100;
    emitDevineState(io, game);
    return true;
  }
  
  // Continue asking
  game.phase = 'asking';
  game.deadline = Date.now() + QUESTION_TIME_MS;
  emitDevineState(io, game);
  return true;
}

function guessItem(game, userId, guess, io) {
  if (game.state !== 'playing' || game.phase !== 'asking') return false;
  if (userId !== game.guesser) return false;
  
  const isCorrect = guess.toLowerCase().trim() === game.secretItem.toLowerCase().trim();
  
  if (isCorrect) {
    game.state = 'finished';
    game.winner = game.guesser;
    // Score based on how few questions were asked
    const bonus = Math.max(100 - (game.questionCount * 5), 10);
    game.scores[game.guesser] += bonus;
    game.scores[game.thinker] += Math.floor(bonus / 2); // Thinker gets half points
  } else {
    game.lastAnswer = {
      question: `Guess: ${guess}`,
      answer: 'Non, ce n\'est pas ca !',
      answerer: userId,
    };
  }
  
  emitDevineState(io, game);
  return true;
}

function switchRoles(game, io) {
  const [p1, p2] = game.players;
  
  // Reset for second round
  const newCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const newSecretItem = newCategory.items[Math.floor(Math.random() * newCategory.items.length)];
  
  game.phase = 'choosing';
  game.category = newCategory;
  game.secretItem = newSecretItem;
  game.thinker = game.thinker === p1 ? p2 : p1;
  game.guesser = game.guesser === p1 ? p2 : p1;
  game.questions = [];
  game.currentQuestion = null;
  game.questionCount = 0;
  game.lastAnswer = null;
  
  emitDevineState(io, game);
}

function emitDevineState(io, game) {
  if (!game || !io) return;
  
  for (const p of game.players) {
    const isThinker = p === game.thinker;
    const view = {
      ...game,
      // Thinker sees the secret item, guesser doesn't
      secretItem: isThinker ? game.secretItem : '???',
      // Don't reveal the category to the guesser until game starts
      category: game.phase !== 'choosing' ? game.category : { name: '???', icon: '?' },
    };
    io.to(`user:${p}`).emit('game-state', { game: view });
  }
}

function devineAccept(game, io) {
  game.state = 'playing';
  game.phase = 'asking';
  game.deadline = Date.now() + QUESTION_TIME_MS;
  emitDevineState(io, game);
}

function devineRematch(game, io) {
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const secretItem = category.items[Math.floor(Math.random() * category.items.length)];
  
  game.state = 'playing';
  game.phase = 'asking';
  game.category = category;
  game.secretItem = secretItem;
  game.questions = [];
  game.currentQuestion = null;
  game.questionCount = 0;
  game.lastAnswer = null;
  game.deadline = Date.now() + QUESTION_TIME_MS;
  
  emitDevineState(io, game);
}

module.exports = {
  createDevineCeQueJePenseGame,
  submitQuestion,
  submitAnswer,
  guessItem,
  switchRoles,
  devineAccept,
  devineRematch,
  emitDevineState,
  CATEGORIES,
};
