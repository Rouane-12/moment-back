/**
 * Le Mot Intrus - Find the odd word out
 * 5 words are displayed, find the one that doesn't belong
 */

const QUESTION_TIME_MS = 30000; // 30 seconds per question
const ROUNDS_PER_GAME = 5;

function createGameId() {
  return 'mi_' + Math.random().toString(36).substring(2, 10);
}

// Word sets organized by difficulty
const WORD_SETS = {
  facile: [
    { words: ['Paris', 'Lyon', 'Marseille', 'Berlin', 'Toulouse'], intrus: 3, explanation: 'Berlin est en Allemagne, les autres sont en France' },
    { words: ['Chien', 'Chat', 'Cheval', 'Voiture', 'Poisson'], intrus: 3, explanation: 'Voiture n\'est pas un animal' },
    { words: ['Pomme', 'Banane', 'Carotte', 'Orange', 'Raisin'], intrus: 2, explanation: 'Carotte est un legume, les autres sont des fruits' },
    { words: ['Lundi', 'Mars', 'Mercredi', 'Vendredi', 'Samedi'], intrus: 1, explanation: 'Mars est un mois, les autres sont des jours' },
    { words: ['Bleu', 'Rouge', 'Vert', 'Chat', 'Jaune'], intrus: 3, explanation: 'Chat n\'est pas une couleur' },
    { words: ['Piano', 'Guitare', 'Violon', 'Table', 'Flute'], intrus: 3, explanation: 'Table n\'est pas un instrument' },
    { words: ['Soleil', 'Lune', 'Etoile', 'Voiture', 'Mars'], intrus: 3, explanation: 'Voiture n\'est pas un astre' },
    { words: ['France', 'Espagne', 'Italie', 'Paris', 'Portugal'], intrus: 3, explanation: 'Paris est une ville, les autres sont des pays' },
  ],
  moyen: [
    { words: ['Japon', 'Tokyo', 'Kyoto', 'Osaka', 'Seoul'], intrus: 4, explanation: 'Seoul est en Coree, les autres sont japonais' },
    { words: ['Einstein', 'Newton', 'Darwin', 'Shakespeare', 'Galilee'], intrus: 3, explanation: 'Shakespeare est ecrivain, les autres sont scientifiques' },
    { words: ['Mars', 'Venus', 'Terre', 'Pluton', 'Jupiter'], intrus: 3, explanation: 'Pluton est une planete naine' },
    { words: ['Python', 'JavaScript', 'HTML', 'Java', 'C++'], intrus: 2, explanation: 'HTML est un langage de balisage, pas de programmation' },
    { words: ['Tennis', 'Football', 'Natation', 'Piano', 'Basket'], intrus: 3, explanation: 'Piano n\'est pas un sport' },
    { words: ['Mozart', 'Beethoven', 'Bach', 'Picasso', 'Chopin'], intrus: 3, explanation: 'Picasso est peintre, les autres sont compositeurs' },
    { words: ['H2O', 'CO2', 'O2', 'NaCl', 'Fe'], intrus: 4, explanation: 'NaCl est du sel, les autres sont des gaz' },
    { words: ['Kilometre', 'Litre', 'Kilogramme', 'Heure', 'Newton'], intrus: 4, explanation: 'Newton est une unite de force, les autres sont des mesures simples' },
  ],
  difficile: [
    { words: ['Socratique', 'Platon', 'Aristote', 'Nietzsche', 'Descartes'], intrus: 3, explanation: 'Nietzsche est du XIXe siecle, les autres sont de l\'Antiquite/Classique' },
    { words: ['Photosynthese', 'Mitose', 'Osmose', 'Respiration', 'Digestion'], intrus: 4, explanation: 'Digestion est un processus organique, les autres sont des mecanismes cellulaires' },
    { words: ['Fibonacci', 'Pythagore', 'Euclide', 'Archimede', 'Galilee'], intrus: 0, explanation: 'Fibonacci est mathematicien, les autres sont physiciens/astronomes' },
    { words: ['Peer Gynt', 'Casse-Noisette', 'Le Lac des Cygnes', 'La Boheme', 'Swan Lake'], intrus: 3, explanation: 'La Boheme est un opera de Puccini, les autres sont des ballets' },
    { words: ['ADN', 'ARN', 'ATP', 'AGP', 'ADP'], intrus: 3, explanation: 'AGP n\'est pas une molecule biologique reconnue' },
    { words: ['Kafka', 'Proust', 'Joyce', 'Hemingway', 'Borges'], intrus: 4, explanation: 'Borges est argentin, les autres sont europeens' },
    { words: ['Subjonctif', 'Conditionnel', 'Imperatif', 'Infinitif', 'Participe'], intrus: 4, explanation: 'Participe n\'est pas un mode, c\'est un temps' },
    { words: ['Tectonique', 'Erosion', 'Volcanisme', 'Seisme', 'Urbanisme'], intrus: 4, explanation: 'Urbanisme n\'est pas un phenomene geologique naturel' },
  ],
};

function selectQuestion(difficulty) {
  const sets = WORD_SETS[difficulty] || WORD_SETS.facile;
  return sets[Math.floor(Math.random() * sets.length)];
}

function createMotIntrusGame(p1, p2) {
  return {
    id: createGameId(),
    type: 'mot_intrus',
    players: [p1, p2],
    state: 'waiting',
    phase: 'playing',
    currentRound: 0,
    maxRounds: ROUNDS_PER_GAME,
    currentQuestion: null,
    scores: { [p1]: 0, [p2]: 0 },
    currentPlayer: p1,
    deadline: null,
    winner: null,
    createdBy: p1,
  };
}

function startRound(game, io) {
  if (game.currentRound >= game.maxRounds) {
    finishGame(game, io);
    return;
  }
  
  game.currentRound++;
  game.phase = 'playing';
  game.currentQuestion = selectQuestion(
    game.currentRound <= 2 ? 'facile' :
    game.currentRound <= 4 ? 'moyen' : 'difficile'
  );
  game.deadline = Date.now() + QUESTION_TIME_MS;
  
  emitMotIntrusState(io, game);
}

function submitAnswer(game, userId, answerIndex, io) {
  if (game.state !== 'playing' || game.phase !== 'playing') return false;
  if (userId !== game.currentPlayer) return false;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 4) return false;
  
  const correct = answerIndex === game.currentQuestion.intrus;
  if (correct) {
    game.scores[userId] += 100;
  }
  
  // Show result and switch player
  game.phase = 'result';
  game.lastResult = {
    answerIndex,
    correct,
    intrus: game.currentQuestion.intrus,
    explanation: game.currentQuestion.explanation,
  };
  
  emitMotIntrusState(io, game);
  
  // Auto-advance after showing result
  setTimeout(() => {
    game.currentPlayer = game.currentPlayer === game.players[0] ? game.players[1] : game.players[0];
    startRound(game, io);
  }, 3000);
  
  return true;
}

function finishGame(game, io) {
  game.state = 'finished';
  const [a, b] = game.players;
  if (game.scores[a] > game.scores[b]) game.winner = a;
  else if (game.scores[a] < game.scores[b]) game.winner = b;
  else game.winner = 'draw';
  
  emitMotIntrusState(io, game);
}

function emitMotIntrusState(io, game) {
  if (!game || !io) return;
  for (const p of game.players) {
    const view = {
      ...game,
      currentQuestion: {
        ...game.currentQuestion,
        // Don't reveal which one is the intrus during the question
        intrus: game.phase === 'result' ? game.currentQuestion.intrus : undefined,
        explanation: game.phase === 'result' ? game.currentQuestion.explanation : undefined,
      },
    };
    io.to(`user:${p}`).emit('game-state', { game: view });
  }
}

function motIntrusAccept(game, io) {
  game.state = 'playing';
  startRound(game, io);
}

function motIntrusRematch(game, io) {
  const [p1, p2] = game.players;
  game.state = 'playing';
  game.currentRound = 0;
  game.currentPlayer = p1;
  game.scores = { [p1]: 0, [p2]: 0 };
  game.winner = null;
  startRound(game, io);
}

module.exports = {
  createMotIntrusGame,
  submitAnswer,
  motIntrusAccept,
  motIntrusRematch,
  emitMotIntrusState,
};
