/**
 * À quel point tu me connais ? — Compatibility quiz
 *
 * Flux corrigé :
 *   1. Player A remplit TOUTES ses données (ses vraies préférences)
 *   2. Player B devine les réponses de A (une par une)
 *   3. On montre les résultats pour les données de A
 *   4. On inverse : Player B remplit ses données
 *   5. Player A devine les réponses de B
 *   6. Score final + pourcentage de compatibilité
 */

const ROUNDS = 5;

const QUESTIONS = [
  { id: 1, text: "Quelle est ma nourriture preferee ?", options: ["Pizza", "Sushi", "Poulet", "Pates"] },
  { id: 2, text: "Quel pays voudrais-je visiter ?", options: ["Japon", "Etats-Unis", "Australie", "Bresil"] },
  { id: 3, text: "Quelle est ma plus grande peur ?", options: ["Araignees", "Hauteur", "Obscurite", "Eau"] },
  { id: 4, text: "Quel est mon film prefere ?", options: ["Inception", "Intouchables", "Le Loup de Wall Street", "Interstellar"] },
  { id: 5, text: "Quelle est ma saison preferee ?", options: ["Printemps", "Ete", "Automne", "Hiver"] },
  { id: 6, text: "Quel est mon sport prefere ?", options: ["Football", "Basketball", "Tennis", "Natation"] },
  { id: 7, text: "Quelle est ma couleur preferee ?", options: ["Bleu", "Rouge", "Vert", "Noir"] },
  { id: 8, text: "Quel est mon animal prefere ?", options: ["Chien", "Chat", "Lion", "Dauphin"] },
  { id: 9, text: "Quel est mon metier de reve ?", options: ["Medecin", "Artiste", "Voyageur", "Entrepreneur"] },
  { id: 10, text: "Quelle est ma boisson preferee ?", options: ["Cafe", "The", "Jus", "Eau"] },
  { id: 11, text: "Quel est mon style de musique ?", options: ["Pop", "Rap", "Rock", "R&B"] },
  { id: 12, text: "Quel est mon reseau social prefere ?", options: ["Instagram", "TikTok", "Twitter", "YouTube"] },
  { id: 13, text: "Quelle est ma saison preferee pour voyager ?", options: ["Printemps", "Ete", "Automne", "Hiver"] },
  { id: 14, text: "Quel est mon plat prefere au petit-dejeuner ?", options: ["Cereales", "Oeufs", "Pain", "Fruits"] },
  { id: 15, text: "Quel est mon type de film prefere ?", options: ["Action", "Comedie", "Drame", "Horreur"] },
  { id: 16, text: "Quelle est ma destination de reve ?", options: ["Maldives", "New York", "Tokyo", "Paris"] },
  { id: 17, text: "Quel est mon hobby prefere ?", options: ["Lire", "Voyager", "Jouer", "Cuisiner"] },
  { id: 18, text: "Quelle est ma saison preferee pour le sport ?", options: ["Printemps", "Ete", "Automne", "Hiver"] },
  { id: 19, text: "Quel est mon style de vetements ?", options: ["Casual", "Sport", "Elegant", "Street"] },
  { id: 20, text: "Quelle est ma facon de me detendre ?", options: ["Lire", "Ecouter de la musique", "Marcher", "Regarder des series"] },
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

function createAQuelPointGame(p1, p2) {
  const shuffledQuestions = shuffleArray(QUESTIONS).slice(0, ROUNDS);

  return {
    id: createGameId(), type: 'a_quel_point',
    players: [p1, p2],
    state: 'waiting',
    // Phases : setting_p1 | guessing_p2 | result_p1 | setting_p2 | guessing_p1 | result_p2 | finished
    phase: 'setting_p1',
    currentRound: 0,
    maxRounds: ROUNDS,
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

  game.compatibility = Math.round(((p1Score + p2Score) / totalPossible) * 100);

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
  const shuffledQuestions = shuffleArray(QUESTIONS).slice(0, ROUNDS);

  game._started = true;
  game.state = 'playing';
  game.currentRound = 0;
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
  if (pct >= 90) return "Impressionnant ! Vous vous connaissez par cœur.";
  if (pct >= 70) return "Très bon score — vous êtes vraiment proches.";
  if (pct >= 50) return "Pas mal ! Il vous reste quelques choses à découvrir.";
  if (pct >= 30) return "Vous ne vous connaissez pas assez… il faut passer plus de temps ensemble !";
  return "Aïe… vous êtes pratiquement des inconnus l'un pour l'autre !";
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
};
