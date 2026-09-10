/**
 * A quel point tu me connais ? - Compatibility quiz
 * Both players answer questions about each other
 */

const QUESTION_TIME_MS = 15000;
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
    id: createGameId(),
    type: 'a_quel_point',
    players: [p1, p2],
    state: 'waiting',
    phase: 'setting',       // setting | answering | result | finished
    currentRound: 0,
    maxRounds: ROUNDS,
    questions: shuffledQuestions,
    currentQuestion: null,
    answers: { [p1]: {}, [p2]: {} },  // { questionId: answerIndex }
    settings: { [p1]: {}, [p2]: {} }, // { questionId: answerIndex } (what they set as their answer)
    scores: { [p1]: 0, [p2]: 0 },
    compatibility: 0,
    winner: null,
    createdBy: p1,
    deadline: null,
    settingPlayer: null,
  };
}

function startRound(game, io) {
  if (game.currentRound >= game.maxRounds) {
    calculateResults(game, io);
    return;
  }
  
  game.currentRound++;
  game.currentQuestion = game.questions[game.currentRound - 1];
  game.phase = 'setting';
  game.settingPlayer = game.players[0]; // First player sets their answer
  
  emitAQuelPointState(io, game);
}

function setAnswer(game, userId, questionId, answerIndex, io) {
  if (game.state !== 'playing' || game.phase !== 'setting') return false;
  if (userId !== game.settingPlayer) return false;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return false;
  
  game.settings[userId][questionId] = answerIndex;
  
  // Switch to the other player
  game.settingPlayer = game.settingPlayer === game.players[0] ? game.players[1] : game.players[0];
  
  // If both have set their answers, move to answering phase
  if (Object.keys(game.settings[game.players[0]]).length === game.currentRound &&
      Object.keys(game.settings[game.players[1]]).length === game.currentRound) {
    game.phase = 'answering';
  }
  
  emitAQuelPointState(io, game);
  return true;
}

function answerQuestion(game, userId, questionId, answerIndex, io) {
  if (game.state !== 'playing' || game.phase !== 'answering') return false;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return false;
  
  game.answers[userId][questionId] = answerIndex;
  
  // Check if both have answered
  if (Object.keys(game.answers[game.players[0]]).length === game.currentRound &&
      Object.keys(game.answers[game.players[1]]).length === game.currentRound) {
    // Show result for this round
    game.phase = 'result';
    game.lastResult = {
      question: game.currentQuestion,
      settings: {
        [game.players[0]]: game.settings[game.players[0]][questionId],
        [game.players[1]]: game.settings[game.players[1]][questionId],
      },
      answers: {
        [game.players[0]]: game.answers[game.players[0]][questionId],
        [game.players[1]]: game.answers[game.players[1]][questionId],
      },
    };
    
    // Check if answers match the settings
    const p1Match = game.answers[game.players[0]][questionId] === game.settings[game.players[0]][questionId];
    const p2Match = game.answers[game.players[1]][questionId] === game.settings[game.players[1]][questionId];
    
    if (p1Match) game.scores[game.players[0]]++;
    if (p2Match) game.scores[game.players[1]]++;
    
    // Auto advance after showing result
    setTimeout(() => startRound(game, io), 3000);
  }
  
  emitAQuelPointState(io, game);
  return true;
}

function calculateResults(game, io) {
  game.state = 'finished';
  game.phase = 'finished';
  
  const totalPossible = game.maxRounds;
  const p1Score = game.scores[game.players[0]];
  const p2Score = game.scores[game.players[1]];
  
  game.compatibility = Math.round(((p1Score + p2Score) / (totalPossible * 2)) * 100);
  
  if (p1Score > p2Score) game.winner = game.players[0];
  else if (p2Score > p1Score) game.winner = game.players[1];
  else game.winner = 'draw';
  
  emitAQuelPointState(io, game);
}

function emitAQuelPointState(io, game) {
  if (!game || !io) return;
  
  for (const p of game.players) {
    const view = {
      ...game,
      currentQuestion: game.phase !== 'result' ? game.currentQuestion : game.lastResult?.question,
      // Don't reveal the other player's settings during setting phase
      settings: game.phase === 'setting' ? { [p]: game.settings[p] } : game.settings,
      // Don't reveal answers during answering phase
      answers: game.phase === 'result' ? game.answers : {},
    };
    io.to(`user:${p}`).emit('game-state', { game: view });
  }
}

function aQuelPointAccept(game, io) {
  game.state = 'playing';
  startRound(game, io);
}

function aQuelPointRematch(game, io) {
  const shuffledQuestions = shuffleArray(QUESTIONS).slice(0, ROUNDS);
  
  game.state = 'playing';
  game.currentRound = 0;
  game.questions = shuffledQuestions;
  game.answers = { [game.players[0]]: {}, [game.players[1]]: {} };
  game.settings = { [game.players[0]]: {}, [game.players[1]]: {} };
  game.scores = { [game.players[0]]: 0, [game.players[1]]: 0 };
  game.compatibility = 0;
  game.winner = null;
  
  startRound(game, io);
}

module.exports = {
  createAQuelPointGame,
  setAnswer,
  answerQuestion,
  aQuelPointAccept,
  aQuelPointRematch,
  emitAQuelPointState,
};
