/**
 * À quel point tu me connais ? — Compatibility quiz
 *
 * Flux :
 *   1. Player A remplit TOUTES ses données (ses vraies préférences)
 *   2. Player B devine les réponses de A (une par une)
 *   3. On montre les résultats pour les données de A
 *   4. On inverse : Player B remplit ses données
 *   5. Player A devine les réponses de B
 *   6. Score final + pourcentage de compatibilité
 *
 * La banque contient 40 questions variées ; chaque partie en tire 20
 * AU HASARD, donc deux parties ne posent jamais exactement les mêmes.
 */

const QUESTIONS_PER_GAME = 20;

const QUESTIONS = [
  { id: 1, text: "Quelle est ma saison preferee ?", options: ["Printemps", "Ete", "Automne", "Hiver"] },
  { id: 2, text: "Quel est mon moment prefere de la journee ?", options: ["Le matin", "L'apres-midi", "Le soir", "La nuit"] },
  { id: 3, text: "Comment je recharge mes batteries ?", options: ["En voyant des amis", "En restant seul", "En dormant", "En bougeant"] },
  { id: 4, text: "Quel est mon plus grand talent cache ?", options: ["Chanter", "Cuisiner", "Ecouter les autres", "Bricoler"] },
  { id: 5, text: "Quel est mon pire defaut ?", options: ["Tetue", "Distrait", "Impatient", "Rancunier"] },
  { id: 6, text: "Comment je reagis quand je suis en colere ?", options: ["Je me tais", "J'argumente", "Je plaisante", "Je m'isole"] },
  { id: 7, text: "Quel est mon plat prefere ?", options: ["Un plat de chez moi", "Une pizza", "Des pates", "Un plat epice"] },
  { id: 8, text: "Quelle est ma boisson du quotidien ?", options: ["Cafe", "The", "Jus", "Eau"] },
  { id: 9, text: "Quelle est ma plus grande peur ?", options: ["Le vide", "L'eau", "Les araignees", "Le noir"] },
  { id: 10, text: "Quel super-pouvoir je choisirais ?", options: ["Voler", "Me teleporter", "Lire les pensees", "Etre invisible"] },
  { id: 11, text: "Quel pays je reves de visiter ?", options: ["Le Japon", "Le Bresil", "L'Italie", "L'Egypte"] },
  { id: 12, text: "Ma facon de voyager, c'est plutot...", options: ["Sac a dos", "Hotel confortable", "Road trip", "Au hasard"] },
  { id: 13, text: "Quel est mon animal prefere ?", options: ["Le chat", "Le chien", "Le lion", "Le dauphin"] },
  { id: 14, text: "Quel moyen de transport je prefere ?", options: ["La voiture", "Le train", "L'avion", "Le velo"] },
  { id: 15, text: "Quelle couleur je porterais tout le temps ?", options: ["Le noir", "Le blanc", "Le bleu", "Une couleur vive"] },
  { id: 16, text: "Comment je choisis mes vetements ?", options: ["Confort avant tout", "Toujours classe", "Streetwear", "Minimaliste"] },
  { id: 17, text: "Quel est mon genre de film prefere ?", options: ["Action", "Comedie", "Thriller", "Science-fiction"] },
  { id: 18, text: "Quelle musique me fait danser ?", options: ["Afrobeats", "Pop", "Rap", "Rock"] },
  { id: 19, text: "Quel est mon sport prefere ?", options: ["Football", "Basket", "Tennis", "Natation"] },
  { id: 20, text: "Un match, je prefere le regarder...", options: ["A la tele", "Au stade", "Entre amis", "Peu m'importe"] },
  { id: 21, text: "Quelle est ma plus grande qualite ?", options: ["La patience", "La generosite", "L'humour", "La franchise"] },
  { id: 22, text: "Combien d'amis proches il me faut ?", options: ["Un seul", "Trois ou quatre", "Beaucoup", "Peu importe"] },
  { id: 23, text: "Quel cadeau me ferait le plus plaisir ?", options: ["Un voyage", "Un objet utile", "Un livre", "Du temps ensemble"] },
  { id: 24, text: "Comment je prefere communiquer ?", options: ["Messages", "Appels", "En personne", "Notes vocales"] },
  { id: 25, text: "Quelle est ma plus grande fierte ?", options: ["Ma famille", "Mes etudes", "Mes amis", "Mon travail"] },
  { id: 26, text: "Qu'est-ce qui m'enerve le plus ?", options: ["Le mensonge", "La lenteur", "Le bruit", "L'impolitesse"] },
  { id: 27, text: "Sur quoi je depense sans compter ?", options: ["La nourriture", "Les sorties", "Les vetements", "Les gadgets"] },
  { id: 28, text: "Quel est mon plus grand reve ?", options: ["Voyager partout", "Fonder une famille", "Reussir mon projet", "Vivre pres de la mer"] },
  { id: 29, text: "Comment je gere mon argent ?", options: ["Je depense vite", "J'epargne tout", "Je planifie", "Je ne regarde jamais"] },
  { id: 30, text: "Quel metier j'aurais aime faire ?", options: ["Medecin", "Artiste", "Journaliste", "Pilote"] },
  { id: 31, text: "Je suis plutot...", options: ["Optimiste", "Realiste", "Reveur", "Pragmatique"] },
  { id: 32, text: "Quand je suis triste, je...", options: ["Parle a quelqu'un", "Ecoute de la musique", "Pleure", "Fais semblant que ca va"] },
  { id: 33, text: "Quelle est mon habitude du soir ?", options: ["Regarder une serie", "Lire", "Travailler tard", "Scroller mon telephone"] },
  { id: 34, text: "Je ne pourrais pas vivre sans...", options: ["Mon telephone", "Ma musique", "Mes amis", "Mon sport"] },
  { id: 35, text: "Mon plus beau souvenir d'enfance ?", options: ["Les vacances", "Les fetes de famille", "Les jeux dehors", "Un cadeau precis"] },
  { id: 36, text: "Ce qui me fait rire a coup sur ?", options: ["Les blagues nulles", "Les videos d'animaux", "Les situations genantes", "Mes amis"] },
  { id: 37, text: "Quel compliment me touche le plus ?", options: ["Sur mon intelligence", "Sur mon humour", "Sur mon coeur", "Sur mon style"] },
  { id: 38, text: "Comment je prends une decision difficile ?", options: ["Je pese le pour et le contre", "Je demande conseil", "J'ecoute mon instinct", "Je prends du temps"] },
  { id: 39, text: "Si on me donnait une semaine libre, je...", options: ["Partirais loin", "Dormirais enfin", "Verrais tout le monde", "Apprendrais quelque chose"] },
  { id: 40, text: "Le premier truc que je remarque chez quelqu'un ?", options: ["Le sourire", "Les yeux", "L'allure", "La voix"] },
];

function createGameId() {
  return 'aqp_' + Math.random().toString(36).substring(2, 10);
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Tire 20 questions au hasard dans la banque (jamais deux fois les mêmes). */
function pickQuestions() {
  return shuffleArray(QUESTIONS).slice(0, QUESTIONS_PER_GAME);
}

function createAQuelPointGame(p1, p2) {
  const shuffledQuestions = pickQuestions();

  return {
    id: createGameId(), type: 'a_quel_point',
    players: [p1, p2],
    state: 'waiting',
    // Phases : setting_p1 | guessing_p2 | result_p1 | setting_p2 | guessing_p1 | result_p2 | finished
    phase: 'setting_p1',
    currentRound: 0,
    maxRounds: shuffledQuestions.length,
    questions: shuffledQuestions,
    currentQuestion: null,
    // Les VRAIES réponses de chaque joueur (cachées à l'adversaire)
    trueAnswers: { [p1]: {}, [p2]: {} },
    // Les devinettes de l'adversaire
    guesses: { [p1]: {}, [p2]: {} },
    scores: { [p1]: 0, [p2]: 0 },
    compatibility: 0,
    winner: null,
    createdBy: p1,
    // Qui remplit ses données en ce moment
    settingPlayer: p1,
    // Qui devine en ce moment
    guessingPlayer: null,
    lastResult: null,
    _roundTimer: null,
  };
}

// ══════════════════════════════════════
// DÉROULEMENT
// ══════════════════════════════════════

function startSettingPhase(game, io) {
  // Le joueur courant remplit TOUTES ses données, une par une
  game.settingIndex = 0;
  game.currentQuestion = game.questions[0];
  game.phase = game.settingPlayer === game.players[0] ? 'setting_p1' : 'setting_p2';
  emitView(io, game);
}

function startGuessingPhase(game, io) {
  // L'adversaire commence à deviner
  game.guessingPlayer = game.settingPlayer === game.players[0] ? game.players[1] : game.players[0];
  game.currentRound = 0;
  nextGuessQuestion(game, io);
}

function nextGuessQuestion(game, io) {
  if (game.currentRound >= game.maxRounds) {
    // Toutes les questions devinées → résultat
    const resultPhase = game.guessingPlayer === game.players[1] ? 'result_p1' : 'result_p2';
    game.phase = resultPhase;
    emitView(io, game);

    // Après 4 secondes, on passe à la phase suivante ou fin
    game._roundTimer = setTimeout(() => {
      game._roundTimer = null;
      if (game.guessingPlayer === game.players[1]) {
        // On vient de deviner les réponses de P1 → on passe à P2
        game.settingPlayer = game.players[1];
        startSettingPhase(game, io);
      } else {
        // On vient de deviner les réponses de P2 → fin
        calculateResults(game, io);
      }
    }, 4000);
    return;
  }

  game.currentRound++;
  game.currentQuestion = game.questions[game.currentRound - 1];
  const resultPhase = game.guessingPlayer === game.players[1] ? 'guessing_p2' : 'guessing_p1';
  game.phase = resultPhase;
  emitView(io, game);
}

// ══════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════

function settingAnswer(game, userId, questionId, answerIndex, io) {
  if (game.state !== 'playing') return false;
  if (userId !== game.settingPlayer) return false;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return false;

  // Stocke la VRAIE réponse du joueur
  game.trueAnswers[userId][questionId] = answerIndex;

  // Passe à la question suivante ou phase de devinette
  game.settingIndex = (game.settingIndex || 0) + 1;
  if (game.settingIndex >= game.maxRounds) {
    // Ce joueur a fini de remplir → phase de devinette
    startGuessingPhase(game, io);
  } else {
    game.currentQuestion = game.questions[game.settingIndex];
    emitView(io, game);
  }
  return true;
}

function guessAnswer(game, userId, questionId, answerIndex, io) {
  if (game.state !== 'playing') return false;
  if (userId !== game.guessingPlayer) return false;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return false;

  const settingUserId = game.settingPlayer;
  game.guesses[userId][questionId] = answerIndex;

  // Vérifie si la devinette est correcte
  const correct = game.trueAnswers[settingUserId][questionId] === answerIndex;
  if (correct) {
    game.scores[userId]++;
  }

  game.lastResult = {
    question: game.currentQuestion,
    correct,
    theAnswer: game.currentQuestion.options[game.trueAnswers[settingUserId][questionId]],
    myGuess: game.currentQuestion.options[answerIndex],
  };

  // Question suivante
  nextGuessQuestion(game, io);
  return true;
}

function calculateResults(game, io) {
  game.state = 'finished';
  game.phase = 'finished';

  const totalPossible = game.maxRounds * 2;
  const p1Score = game.scores[game.players[0]];
  const p2Score = game.scores[game.players[1]];

  game.compatibility = totalPossible ? Math.round(((p1Score + p2Score) / totalPossible) * 100) : 0;

  if (p1Score > p2Score) game.winner = game.players[0];
  else if (p2Score > p1Score) game.winner = game.players[1];
  else game.winner = 'draw';

  emitView(io, game);
}

// ══════════════════════════════════════
// VIE DE LA PARTIE
// ══════════════════════════════════════

function aQuelPointAccept(game, io) {
  if (game._started) return;
  game._started = true;
  game.state = 'playing';
  startSettingPhase(game, io);
}

function aQuelPointRematch(game, io) {
  clearAqpTimers(game);
  const shuffledQuestions = pickQuestions();

  game._started = true;
  game.state = 'playing';
  game.currentRound = 0;
  game.maxRounds = shuffledQuestions.length;
  game.questions = shuffledQuestions;
  game.trueAnswers = { [game.players[0]]: {}, [game.players[1]]: {} };
  game.guesses = { [game.players[0]]: {}, [game.players[1]]: {} };
  game.scores = { [game.players[0]]: 0, [game.players[1]]: 0 };
  game.compatibility = 0;
  game.winner = null;
  game.settingPlayer = game.players[0];
  game.guessingPlayer = null;
  game.lastResult = null;

  startSettingPhase(game, io);
}

function clearAqpTimers(game) {
  if (game._roundTimer) {
    clearTimeout(game._roundTimer);
    game._roundTimer = null;
  }
}

// ══════════════════════════════════════
// VUE PAR JOUEUR
// ══════════════════════════════════════

function compatibilityMessage(pct) {
  if (pct >= 90) return "Impressionnant ! Vous vous connaissez par coeur.";
  if (pct >= 70) return "Tres bon score — vous etes vraiment proches.";
  if (pct >= 50) return "Pas mal ! Il vous reste quelques choses a decouvrir.";
  if (pct >= 30) return "Vous ne vous connaissez pas assez... il faut passer plus de temps ensemble !";
  return "Aie... vous etes pratiquement des inconnus l'un pour l'autre !";
}

function emitView(io, game) {
  if (!io || !game) return;
  for (const p of game.players) {
    const isSetting = game.settingPlayer === p;
    const isGuessing = game.guessingPlayer === p;
    const view = {
      id: game.id,
      type: 'a_quel_point',
      players: game.players,
      scores: game.scores,
      currentRound: game.currentRound,
      maxRounds: game.maxRounds,
      state: game.state,
      phase: game.phase,
      currentQuestion: game.currentQuestion,
      settingIndex: game.settingIndex || 0,
      // Qui joue en ce moment (pour afficher le bon nom côté client)
      settingPlayer: game.settingPlayer,
      guessingPlayer: game.guessingPlayer,
      // Le joueur qui remplit voit les questions, l'autre voit "En attente..."
      canSet: isSetting && (game.phase === 'setting_p1' || game.phase === 'setting_p2'),
      // Le joueur qui devine voit les questions, l'autre voit "En attente..."
      canGuess: isGuessing && (game.phase === 'guessing_p1' || game.phase === 'guessing_p2'),
      // Nombre de réponses déjà remplies
      filledCount: Object.keys(game.trueAnswers[p] || {}).length,
      // Nombre de devinettes déjà faites
      guessedCount: Object.keys(game.guesses[p] || {}).length,
      lastResult: game.lastResult,
      compatibility: game.compatibility,
      compatibilityMessage: game.state === 'finished' ? compatibilityMessage(game.compatibility) : null,
      winner: game.winner,
      createdBy: game.createdBy,
    };
    io.to(`user:${p}`).emit('game-state', { game: view });
  }
}

module.exports = {
  createAQuelPointGame,
  settingAnswer,
  guessAnswer,
  aQuelPointAccept,
  aQuelPointRematch,
  clearAqpTimers,
  QUESTIONS,
  QUESTIONS_PER_GAME,
};
