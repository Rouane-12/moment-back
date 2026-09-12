/**
 * La Course en Spirale — jeu de dés de plateau (2 à 6 joueurs, page Jeux)
 *
 * Le plateau est une spirale de 49 cases (grille 7×7) :
 *   - la case 0 est le DÉPART, la case 48 est la FIN (au centre),
 *   - chaque case a un effet : +2, +5, +10 (bonus), −3, −5, −8 (pièges),
 *     🔄 relance (rejoue), ⚡ rift (échange ta place avec le joueur de tête).
 *
 * Chacun son tour : le serveur lance UN dé, le pion avance, l'effet de la case
 * s'applique, puis la main passe au joueur suivant. Le premier à atteindre la
 * FIN gagne.
 *
 * Le serveur est seul maître du jeu : le dé est généré côté serveur.
 */

const GRID = 7;                 // grille 7×7…
const LAST = GRID * GRID - 1;   // …donc 49 cases (0 → 48, la FIN au centre)
const MAX_ROLLS_PER_TURN = 3;   // garde-fou contre les relances en série

function createGameId() {
  return 'dsp_' + Math.random().toString(36).substring(2, 10);
}

/** Effet aléatoire d'une case intermédiaire. */
function randomEffect() {
  const r = Math.random();
  if (r < 0.44) return { effect: 'none', value: 0 };
  if (r < 0.58) return { effect: 'plus', value: 2 };
  if (r < 0.68) return { effect: 'plus', value: 5 };
  if (r < 0.74) return { effect: 'plus', value: 10 };
  if (r < 0.83) return { effect: 'minus', value: 3 };
  if (r < 0.88) return { effect: 'minus', value: 5 };
  if (r < 0.91) return { effect: 'minus', value: 8 };
  if (r < 0.96) return { effect: 'relance', value: 0 };
  return { effect: 'rift', value: 0 };
}

/** Construit le plateau : effet par index de case (0 → 48). */
function buildBoard() {
  const tiles = [];
  for (let i = 0; i <= LAST; i++) {
    if (i === 0) tiles.push({ effect: 'start', value: 0 });
    else if (i === LAST) tiles.push({ effect: 'finish', value: 0 });
    else tiles.push(randomEffect());
  }
  // Quelques cases remarquables fixes, pour que chaque plateau ait du caractère
  const forced = [
    [7, { effect: 'plus', value: 5 }],
    [13, { effect: 'minus', value: 5 }],
    [19, { effect: 'relance', value: 0 }],
    [26, { effect: 'rift', value: 0 }],
    [33, { effect: 'minus', value: 8 }],
    [40, { effect: 'plus', value: 10 }],
  ];
  for (const [i, tile] of forced) tiles[i] = tile;
  return tiles;
}

function createDiceSpiraleGame(creator, otherPlayers) {
  const players = [creator, ...(otherPlayers || []).filter((p) => p && p !== creator)].slice(0, 6);
  if (players.length < 2) return null;

  const game = {
    id: createGameId(),
    type: 'dice_spirale',
    multiplayer: true,       // → page Jeux (et non duel dans une conversation)
    players,
    createdBy: creator,
    state: 'waiting',        // waiting | playing | finished
    phase: 'rolling',        // rolling | finished
    turn: creator,
    board: buildBoard(),
    lastIndex: LAST,
    pos: {},
    scores: {},              // position de chacun (affichage)
    dice: null,
    lastRoll: null,
    rollsThisTurn: 0,
    log: [],
    winner: null,
  };
  for (const p of players) {
    game.pos[p] = 0;
    game.scores[p] = 0;
  }
  return game;
}

function pushLog(game, text) {
  game.log.push({ at: Date.now(), text });
  if (game.log.length > 40) game.log = game.log.slice(-40);
}

function finish(game, winnerId) {
  game.state = 'finished';
  game.phase = 'finished';
  game.winner = winnerId;
}

function emit(io, game) {
  if (!io || !game) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game });
  }
}

function diceSpiraleAccept(game, io) {
  if (game.state !== 'waiting') return false;
  game.state = 'playing';
  game.phase = 'rolling';
  game.turn = game.createdBy;
  game.rollsThisTurn = 0;
  pushLog(game, `La course commence — ${game.createdBy} lance le premier dé.`);
  emit(io, game);
  return true;
}

/** Applique l'effet d'une case. Retourne true si le tour doit se rejouer. */
function applyTile(game, userId) {
  const idx = game.pos[userId];
  const tile = game.board[idx];
  if (!tile || tile.effect === 'none' || tile.effect === 'start' || tile.effect === 'finish') return false;

  if (tile.effect === 'plus' || tile.effect === 'minus') {
    const delta = tile.effect === 'plus' ? tile.value : -tile.value;
    const target = Math.max(0, Math.min(LAST, idx + delta));
    game.pos[userId] = target;
    pushLog(game, `${userId} tombe sur ${tile.effect === 'plus' ? '+' : '−'}${tile.value} → case ${target}.`);
    game.scores[userId] = target;
    return false;
  }

  if (tile.effect === 'relance') {
    pushLog(game, `${userId} tombe sur 🔄 relance — il rejoue !`);
    return true;
  }

  if (tile.effect === 'rift') {
    const others = game.players.filter((p) => p !== userId);
    const leader = others.reduce((best, p) => (game.pos[p] > game.pos[best] ? p : best), others[0]);
    if (leader && game.pos[leader] > game.pos[userId]) {
      const mine = game.pos[userId];
      game.pos[userId] = game.pos[leader];
      game.pos[leader] = mine;
      game.scores[userId] = game.pos[userId];
      game.scores[leader] = game.pos[leader];
      pushLog(game, `${userId} tombe sur ⚡ rift — il échange sa place avec ${leader} !`);
    } else {
      pushLog(game, `${userId} tombe sur ⚡ rift — personne devant, aucun effet.`);
    }
    return false;
  }

  return false;
}

function nextTurn(game) {
  const idx = game.players.indexOf(game.turn);
  game.turn = game.players[(idx + 1) % game.players.length];
  game.rollsThisTurn = 0;
}

/** Action principale : lancer le dé. */
function diceSpiraleRoll(game, userId, io) {
  if (game.state !== 'playing') return false;
  if (userId !== game.turn) return false;
  if (game.rollsThisTurn >= MAX_ROLLS_PER_TURN) return false;

  const d = Math.floor(Math.random() * 6) + 1;
  game.dice = d;
  game.rollsThisTurn += 1;

  const from = game.pos[userId];
  const target = Math.min(LAST, from + d);
  game.pos[userId] = target;
  game.scores[userId] = target;
  game.lastRoll = { by: userId, dice: d, from, to: target, at: Date.now() };
  pushLog(game, `${userId} lance ${d} : case ${from} → ${target}.`);

  if (target >= LAST) {
    pushLog(game, `${userId} atteint la FIN — victoire !`);
    finish(game, userId);
    emit(io, game);
    return true;
  }

  const replay = applyTile(game, userId);

  // La case a pu renvoyer le pion sur la FIN (bonus +10)
  if (game.pos[userId] >= LAST) {
    pushLog(game, `${userId} atteint la FIN — victoire !`);
    finish(game, userId);
    emit(io, game);
    return true;
  }

  if (!replay) nextTurn(game);

  emit(io, game);
  return true;
}

function diceSpiraleRematch(game, io) {
  if (game.state !== 'finished') return false;
  game.state = 'playing';
  game.phase = 'rolling';
  game.board = buildBoard();
  game.dice = null;
  game.lastRoll = null;
  game.rollsThisTurn = 0;
  game.log = [];
  game.winner = null;
  for (const p of game.players) {
    game.pos[p] = 0;
    game.scores[p] = 0;
  }
  // Le perdant commence la revanche
  game.turn = game.players[0] === game.createdBy ? game.players[1] : game.players[0];
  pushLog(game, `Revanche ! ${game.turn} commence.`);
  emit(io, game);
  return true;
}

module.exports = {
  createDiceSpiraleGame,
  diceSpiraleAccept,
  diceSpiraleRoll,
  diceSpiraleRematch,
  buildBoard,
  GRID,
  LAST,
};
