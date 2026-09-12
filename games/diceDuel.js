/**
 * Duel de Dés — combat au tour par tour (duel 1v1, dans les conversations)
 *
 * Chaque joueur commence avec 30 PV et 0 bouclier.
 * À son tour, le joueur lance 2 dés puis choisit :
 *   ⚔️  Attaquer  → dégâts = somme des dés, absorbés d'abord par le bouclier adverse
 *   🛡️  Défendre  → ajoute la somme des dés à son propre bouclier
 *   🔄  Relancer  → relance les dés (une seule fois par tour)
 * Le bouclier s'use : il encaisse les dégâts et retombe à ce qu'il en reste.
 * Le premier à faire tomber l'autre à 0 PV gagne.
 *
 * Le serveur est seul maître du jeu : les dés sont générés côté serveur,
 * jamais côté client.
 */

const MAX_HP = 30;
const MAX_SHIELD = 20;
const MAX_LOG = 40;

function createGameId() {
  return 'dd_' + Math.random().toString(36).substring(2, 10);
}

function createDiceDuelGame(p1, p2) {
  return {
    id: createGameId(),
    type: 'dice_duel',
    players: [p1, p2],
    state: 'waiting',
    phase: 'idle',          // idle | choose | finished
    turn: p1,
    roll: null,             // [d1, d2] — le lancer en cours
    rerollUsed: false,
    hp: { [p1]: MAX_HP, [p2]: MAX_HP },
    shield: { [p1]: 0, [p2]: 0 },
    // `scores` est affiché dans l'en-tête : les PV restants de chacun
    scores: { [p1]: MAX_HP, [p2]: MAX_HP },
    maxHp: MAX_HP,
    round: 1,
    log: [],
    winner: null,
    createdBy: p1,
  };
}

function other(game, userId) {
  return game.players.find((p) => p !== userId);
}

function pushLog(game, text) {
  game.log.push({ at: Date.now(), text });
  if (game.log.length > MAX_LOG) game.log = game.log.slice(-MAX_LOG);
}

function rollDice(game) {
  game.roll = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
  game.rerollUsed = false;
  game.phase = 'choose';
}

function finish(game, winnerId) {
  game.state = 'finished';
  game.phase = 'finished';
  game.winner = winnerId;
  game.roll = null;
}

function emit(io, game) {
  if (!io || !game) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game });
  }
}

/** Démarre (ou redémarre) le duel : à appeler une seule fois par manche. */
function startDuel(game, io) {
  game._started = true;
  game.state = 'playing';
  game.turn = game.players[0];
  pushLog(game, `${game.players[0]} commence le duel.`);
  rollDice(game);
  emit(io, game);
  return true;
}

function diceDuelAccept(game, io) {
  // Le moteur a déjà passé l'état à 'playing' : on se fie à notre propre drapeau
  if (game._started) return false;
  return startDuel(game, io);
}

/**
 * action ∈ 'attack' | 'defend' | 'reroll'
 */
function diceDuelMove(game, userId, action, io) {
  if (game.state !== 'playing') return false;
  if (game.phase !== 'choose') return false;
  if (userId !== game.turn) return false;
  if (!game.roll) return false;

  const sum = game.roll[0] + game.roll[1];
  const foe = other(game, userId);

  if (action === 'reroll') {
    if (game.rerollUsed) return false;
    game.rerollUsed = true;
    const old = [game.roll[0], game.roll[1]];
    game.roll = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    pushLog(game, `${userId} relance les dés (${old[0]}+${old[1]} → ${game.roll[0]}+${game.roll[1]}).`);
    emit(io, game);
    return true;
  }

  if (action === 'defend') {
    game.shield[userId] = Math.min(MAX_SHIELD, game.shield[userId] + sum);
    pushLog(game, `${userId} se défend : bouclier +${sum} (${game.shield[userId]}).`);
  } else if (action === 'attack') {
    const absorbed = Math.min(game.shield[foe], sum);
    const damage = sum - absorbed;
    game.shield[foe] = Math.max(0, game.shield[foe] - sum);
    game.hp[foe] = Math.max(0, game.hp[foe] - damage);
    game.scores[userId] = game.hp[userId];
    game.scores[foe] = game.hp[foe];
    const absorbedTxt = absorbed > 0 ? ` (${absorbed} absorbés par le bouclier)` : '';
    pushLog(game, `${userId} attaque : ${sum} → ${damage} dégât(s)${absorbedTxt}.`);
  } else {
    return false;
  }

  if (game.hp[foe] <= 0) {
    pushLog(game, `${foe} tombe à 0 PV — ${userId} remporte le duel !`);
    finish(game, userId);
    emit(io, game);
    return true;
  }

  // Main au joueur suivant
  game.turn = foe;
  game.round += 1;
  rollDice(game);
  emit(io, game);
  return true;
}

function diceDuelRematch(game, io) {
  const [a, b] = game.players;
  game.phase = 'idle';
  game.roll = null;
  game.rerollUsed = false;
  game.hp = { [a]: MAX_HP, [b]: MAX_HP };
  game.shield = { [a]: 0, [b]: 0 };
  game.scores = { [a]: MAX_HP, [b]: MAX_HP };
  game.round = 1;
  game.log = [];
  game.winner = null;
  game._started = false;
  startDuel(game, io);
}

module.exports = {
  createDiceDuelGame,
  diceDuelAccept,
  diceDuelMove,
  diceDuelRematch,
  MAX_HP,
  MAX_SHIELD,
};
