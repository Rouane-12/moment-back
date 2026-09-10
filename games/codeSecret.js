/**
 * Le Code Secret - Mastermind style game
 * One player creates a code, the other tries to break it
 */

const GAME_TIME_MS = 180000; // 3 minutes max
const TURN_TIME_MS = 30000;  // 30 seconds per attempt

const SYMBOLS = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠'];
const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 6;

function createGameId() {
  return 'cs_' + Math.random().toString(36).substring(2, 10);
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateCode() {
  return Array.from({ length: CODE_LENGTH }, () => 
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  );
}

function evaluateGuess(code, guess) {
  const result = [];
  const codeCopy = [...code];
  const guessCopy = [...guess];
  
  // First pass: exact matches (green)
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guessCopy[i] === codeCopy[i]) {
      result.push({ symbol: guessCopy[i], status: 'correct' });
      codeCopy[i] = null;
      guessCopy[i] = null;
    }
  }
  
  // Second pass: wrong position (orange)
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guessCopy[i] !== null) {
      const codeIndex = codeCopy.indexOf(guessCopy[i]);
      if (codeIndex !== -1) {
        result.push({ symbol: guessCopy[i], status: 'wrong_position' });
        codeCopy[codeIndex] = null;
      } else {
        result.push({ symbol: guessCopy[i], status: 'absent' });
      }
    }
  }
  
  return result;
}

function createCodeSecretGame(p1, p2) {
  const code = generateCode();
  
  return {
    id: createGameId(),
    type: 'code_secret',
    players: [p1, p2],
    state: 'waiting',       // waiting | playing | finished
    phase: 'setting_code',  // setting_code | guessing | result
    code,                    // the secret code (only known by server)
    codeCreator: p1,         // who created the code
    currentGuesser: p2,      // who is currently guessing
    attempts: [],            // { guess: [...], result: [...] }
    attemptsByPlayer: { [p1]: 0, [p2]: 0 },
    currentGuess: [],        // current guess being built
    scores: { [p1]: 0, [p2]: 0 },
    winner: null,
    deadline: null,
    createdBy: p1,
  };
}

function makeGuess(game, userId, guess, io) {
  if (game.state !== 'playing' || game.phase !== 'guessing') return false;
  if (userId !== game.currentGuesser) return false;
  if (!Array.isArray(guess) || guess.length !== CODE_LENGTH) return false;
  if (!guess.every(s => SYMBOLS.includes(s))) return false;
  
  const attemptCount = game.attemptsByPlayer[userId] || 0;
  if (attemptCount >= MAX_ATTEMPTS) return false;
  
  // Evaluate the guess
  const result = evaluateGuess(game.code, guess);
  game.attempts.push({
    guess,
    result,
    player: userId,
    attemptNumber: attemptCount + 1,
  });
  game.attemptsByPlayer[userId] = attemptCount + 1;
  
  // Check if code is broken
  const isCorrect = result.every(r => r.status === 'correct');
  if (isCorrect) {
    game.state = 'finished';
    game.winner = userId;
    game.scores[userId] += Math.max(100 - (attemptCount * 15), 10); // More points for fewer attempts
    emitCodeSecretState(io, game);
    return true;
  }
  
  // Check if max attempts reached
  if (game.attemptsByPlayer[userId] >= MAX_ATTEMPTS) {
    // Game over, other player wins
    game.state = 'finished';
    const other = game.players.find(p => p !== userId);
    game.winner = other;
    game.scores[other] += 50;
    emitCodeSecretState(io, game);
    return true;
  }
  
  // Reset for next guess
  game.currentGuess = [];
  emitCodeSecretState(io, game);
  return true;
}

function switchRoles(game, io) {
  // After one player finishes guessing, switch roles
  const [p1, p2] = game.players;
  
  if (game.codeCreator === p1) {
    game.codeCreator = p2;
    game.currentGuesser = p1;
  } else {
    game.codeCreator = p1;
    game.currentGuesser = p2;
  }
  
  // Generate new code for the other player
  game.code = generateCode();
  game.attempts = [];
  game.currentGuess = [];
  game.phase = 'guessing';
  
  emitCodeSecretState(io, game);
}

function emitCodeSecretState(io, game) {
  if (!game || !io) return;
  
  // Send different views to each player
  for (const p of game.players) {
    const isCreator = p === game.codeCreator;
    const view = {
      ...game,
      // Don't reveal the code to the guesser
      code: isCreator ? game.code : null,
      // Don't reveal the code in attempts to the guesser
      attempts: game.attempts.map(a => ({
        ...a,
        result: a.result,
      })),
    };
    io.to(`user:${p}`).emit('game-state', { game: view });
  }
}

function codeSecretAccept(game, io) {
  game.state = 'playing';
  game.phase = 'guessing';
  game.deadline = Date.now() + GAME_TIME_MS;
  emitCodeSecretState(io, game);
}

function codeSecretRematch(game, io) {
  const [p1, p2] = game.players;
  const newCode = generateCode();
  
  game.state = 'playing';
  game.phase = 'guessing';
  game.code = newCode;
  game.codeCreator = p1;
  game.currentGuesser = p2;
  game.attempts = [];
  game.currentGuess = [];
  game.attemptsByPlayer = { [p1]: 0, [p2]: 0 };
  game.winner = null;
  
  emitCodeSecretState(io, game);
}

module.exports = {
  createCodeSecretGame,
  makeGuess,
  switchRoles,
  codeSecretAccept,
  codeSecretRematch,
  emitCodeSecretState,
  SYMBOLS,
  CODE_LENGTH,
  MAX_ATTEMPTS,
};
