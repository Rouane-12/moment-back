/**
 * Action ou Vérité — duel 1v1
 *
 * À chaque tour, un joueur reçoit une carte :
 *   • VÉRITÉ : il doit répondre honnêtement à la question.
 *   • ACTION : il doit accomplir le défi proposé.
 * L'autre joueur juge : carte réussie (+points) ou refusée (0 pt).
 * Les cartes sont générées par l'IA (OpenAI) en français, avec une banque
 * locale de secours pour que le jeu ne soit jamais bloqué.
 *
 * Rôles alternés : chaque joueur reçoit autant de cartes que l'autre.
 */

const axios = require('axios');

const MAX_ROUNDS = 10;        // 5 cartes chacun
const VERITE_POINTS = 100;
const ACTION_POINTS = 200;
const MAX_SKIPS_PER_PLAYER = 2;
const FEEDBACK_MS = 5000;     // affichage du verdict avant la carte suivante

function createGameId() {
  return Math.random().toString(36).substring(2, 10);
}

// Mémoire des cartes déjà servies (évite les répétitions entre parties)
const recentCards = new Set();

// ══════════════════════════════════════
// GÉNÉRATION IA (OpenAI) + banque de secours
// ══════════════════════════════════════

async function generateCards(count = 12) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY absente du .env');

  const avoid = [...recentCards].slice(-40).map(c => `- ${c}`).join('\n');

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      temperature: 1.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu génères des cartes pour un jeu d'« Action ou Vérité » en FRANÇAIS, pour un jeu entre amis sur une messagerie.

Règles absolues :
- TOUT doit être rédigé en français correct et naturel.
- Les cartes doivent être amusantes, légères et bienveillantes.
- INTERDIT : contenu sexuel, humiliant, dangereux, illégal, discriminatoire, ou impliquant l'alcool/la drogue.
- Les VÉRITÉS sont des questions ouvertes sur la personnalité, les souvenirs, les petites hontes mignonnes, les goûts.
- Les ACTIONS sont des défis réalisables chez soi devant son téléphone (mimer, chanter, imiter, montrer un geste, faire une déclaration rigolote…).
- Chaque carte : une seule phrase, entre 20 et 140 caractères.
- Varie beaucoup les thèmes d'une partie à l'autre. Évite les classiques éculés (« quel est ton plus grand secret ? »).

${avoid ? `NE RÉPÈTE PAS ces cartes déjà servies récemment :\n${avoid}` : ''}

Réponds UNIQUEMENT avec un JSON valide :
{ "verites": ["...", "..."], "actions": ["...", "..."] }
Exactement ${count} vérités et ${count} actions.`,
        },
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
  const verites = sanitizeList(parsed?.verites);
  const actions = sanitizeList(parsed?.actions);

  if (verites.length < 4 || actions.length < 4) {
    throw new Error('Pack IA invalide (trop peu de cartes valides)');
  }
  for (const c of [...verites, ...actions]) recentCards.add(c);
  if (recentCards.size > 200) {
    // Garde seulement les 100 plus récentes
    const arr = [...recentCards];
    recentCards.clear();
    for (const c of arr.slice(-100)) recentCards.add(c);
  }
  return { verites, actions };
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const text = String(raw || '').trim();
    if (text.length < 10 || text.length > 160) continue;
    const key = text.toLowerCase();
    if (seen.has(key) || recentCards.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

// Banque de secours 100 % française — utilisée si l'IA échoue.
const FALLBACK = {
  verites: [
    'Quelle est la chanson que tu écoutes en secret et que tu assumes à moitié ?',
    'Quel est le mensonge le plus bête que tu aies dit pour éviter une sortie ?',
    'Quelle est la plus longue durée pendant laquelle tu as porté le même pull ?',
    'Quel cadeau as-tu fait semblant d\'adorer alors que non ?',
    'Quelle application ouvres-tu en premier le matin, sans exception ?',
    'Quel est le truc le plus childish que tu fais encore aujourd\'hui ?',
    'Quelle est ta plus grosse frousse totalement irrationnelle ?',
    'As-tu déjà parlé seul(e) dans le bus ? Raconte.',
    'Quel est le plat que tu rates systématiquement ?',
    'Quelle est la photo la plus gênante de ton téléphone ? Décris-la.',
    'Quelle est la pire coupe de cheveux que tu aies eue ?',
    'Quel est le gossip que tu n\'as jamais pu garder plus d\'une semaine ?',
    'Quelle est la dernière chose que tu as cherchée sur internet en cachette ?',
    'As-tu déjà fait semblant de connaître quelqu\'un qui te parlait ?',
    'Quel est ton talent inutile dont tu es secrètement fier(e) ?',
    'Quelle est la note que tu donnerais à ta propre cuisine, honnêtement ?',
    'Quel est le message que tu as écrit mais jamais envoyé ?',
    'Quelle série as-tu prétendu finir alors que tu as arrêté au premier épisode ?',
  ],
  actions: [
    'Chante le refrain d\'une chanson au ralenti, voix grave.',
    'Imite une célébrité jusqu\'à ce que l\'autre devine qui.',
    'Fais 3 tours sur toi-même puis dis une phrase sans t\'arrêter.',
    'Parle pendant 30 secondes sans jamais dire « euh ».',
    'Envoie un emoji très bizarre à ta personne préférée, sans explication.',
    'Fais ta meilleure imitation de voice assistant dépanné.',
    'Mime un sport de manière très dramatique.',
    'Récite l\'alphabet à l\'envers depuis la lettre M.',
    'Fais une déclaration d\'amour théâtrale à un objet proche de toi.',
    'Chante « Joyeux anniversaire » comme si c\'était un opéra.',
    'Fais 10 squats en te filmant, sans grimacer (ou si).',
    'Imite le cri de ton animal préféré pendant 5 secondes.',
    'Décris ta journée comme un documentaire animalier.',
    'Parle avec un accent français du sud pendant 20 secondes.',
    'Fais semblant d\'être un chat qui demande à manger.',
    'Raconte ta dernière sortie comme si c\'était un film d\'action.',
    'Tape sur ton ventre en rythme en chantant en même temps.',
    'Fais ta pose de superhéros la plus épique et tiens-la 10 secondes.',
  ],
};

function pickFrom(list) {
  const pool = list.filter(c => !recentCards.has(c));
  const arr = pool.length ? pool : list;
  const card = arr[Math.floor(Math.random() * arr.length)];
  recentCards.add(card);
  return card;
}

// ══════════════════════════════════════
// VIE DE LA PARTIE
// ══════════════════════════════════════

function createAvGame(p1, p2, io) {
  const game = {
    id: createGameId(), type: 'action_verite',
    players: [p1, p2], scores: { [p1]: 0, [p2]: 0 },
    currentRound: 0, maxRounds: MAX_ROUNDS,
    state: 'waiting',
    avStatus: 'generating',
    avError: null,
    turn: null,
    currentCard: null,   // { kind: 'verite'|'action', text }
    verdict: null,       // { by, accepted }
    lastResult: null,
    skips: { [p1]: 0, [p2]: 0 },
    winner: null,
    createdBy: p1,
    _gameTimer: null,
  };

  generateCards()
    .then(cards => {
      game._aiCards = cards;
      game.avStatus = 'ready';
      emitView(io, game);
    })
    .catch(err => {
      console.error('🎲 AV génération IA indisponible, banque de secours :', err.message);
      game.avStatus = 'ready'; // la banque locale prend le relais
      emitView(io, game);
    });

  return game;
}

function avAccept(game, io) {
  // Le moteur passe déjà state='playing' avant d'appeler — garde-fou anti double-démarrage.
  if (game._started) return;
  game._started = true;
  game.state = 'playing';
  nextCard(game, io);
}

function nextCard(game, io) {
  if (game.state !== 'playing') return;
  if (game.currentRound >= game.maxRounds) {
    finishGame(game, io);
    return;
  }
  game.currentRound++;
  // Alternance stricte : chaque joueur reçoit autant de cartes que l'autre
  game.turn = game.players[(game.currentRound - 1) % 2];
  const kind = Math.random() < 0.5 ? 'verite' : 'action';
  const list = kind === 'verite'
    ? (game._aiCards?.verites?.length ? game._aiCards.verites : FALLBACK.verites)
    : (game._aiCards?.actions?.length ? game._aiCards.actions : FALLBACK.actions);
  game.currentCard = { kind, text: pickFrom(list) };
  game.verdict = null;
  game.lastResult = null;
  emitView(io, game);
}

// L'autre joueur juge la carte : réussie ou refusée
function avVerdict(game, userId, accepted, io) {
  if (game.state !== 'playing') return;
  if (!game.currentCard || game.verdict) return;
  const other = game.players.find(p => p !== game.turn);
  if (userId !== other) return;

  const points = accepted
    ? (game.currentCard.kind === 'action' ? ACTION_POINTS : VERITE_POINTS)
    : 0;
  game.scores[game.turn] += points;
  game.verdict = { by: userId, accepted };
  game.lastResult = {
    kind: game.currentCard.kind,
    text: game.currentCard.text,
    accepted,
    points,
    player: game.turn,
  };
  game.currentCard = null;
  emitView(io, game);

  if (game._gameTimer) clearTimeout(game._gameTimer);
  game._gameTimer = setTimeout(() => {
    game._gameTimer = null;
    if (game.state !== 'playing') return;
    if (game.currentRound >= game.maxRounds) {
      finishGame(game, io);
    } else {
      nextCard(game, io);
    }
  }, FEEDBACK_MS);
}

// L'autre joueur peut demander une nouvelle carte (limité)
function avSkip(game, userId, io) {
  if (game.state !== 'playing') return;
  if (!game.currentCard || game.verdict) return;
  const other = game.players.find(p => p !== game.turn);
  if (userId !== other) return;
  if ((game.skips[userId] || 0) >= MAX_SKIPS_PER_PLAYER) return;
  game.skips[userId] = (game.skips[userId] || 0) + 1;
  const kind = Math.random() < 0.5 ? 'verite' : 'action';
  const list = kind === 'verite'
    ? (game._aiCards?.verites?.length ? game._aiCards.verites : FALLBACK.verites)
    : (game._aiCards?.actions?.length ? game._aiCards.actions : FALLBACK.actions);
  game.currentCard = { kind, text: pickFrom(list) };
  emitView(io, game);
}

function finishGame(game, io) {
  game.state = 'finished';
  game.currentCard = null;
  if (game._gameTimer) { clearTimeout(game._gameTimer); game._gameTimer = null; }
  const [a, b] = game.players;
  game.winner = game.scores[a] > game.scores[b] ? a : game.scores[a] < game.scores[b] ? b : 'draw';
  emitView(io, game);
}

function avRematch(game, io) {
  clearAVTimers(game);
  game._started = true;
  game.state = 'playing';
  game.currentRound = 0;
  game.winner = null;
  game.turn = null;
  game.currentCard = null;
  game.verdict = null;
  game.lastResult = null;
  for (const p of game.players) {
    game.scores[p] = 0;
    game.skips[p] = 0;
  }
  nextCard(game, io);
}

// Appelé quand le pack IA arrive (branché par le moteur via onAICards)
function avSetCards(game, cards) {
  game._aiCards = cards;
}

function clearAVTimers(game) {
  if (game._gameTimer) {
    clearTimeout(game._gameTimer);
    game._gameTimer = null;
  }
}

// ══════════════════════════════════════
// VUE
// ══════════════════════════════════════

function buildAvView(game, viewer) {
  const other = game.players.find(p => p !== viewer);
  return {
    id: game.id,
    type: 'action_verite',
    players: game.players,
    scores: game.scores,
    currentRound: game.currentRound,
    maxRounds: game.maxRounds,
    state: game.state,
    avStatus: game.avStatus,
    avError: game.avError,
    isMyTurn: game.turn === viewer,
    turnName: null, // le front utilise players pour afficher le nom
    currentCard: game.currentCard,
    verdict: game.verdict,
    lastResult: game.lastResult,
    skipsLeft: MAX_SKIPS_PER_PLAYER - (game.skips[viewer] || 0),
    canJudge: game.turn !== viewer && !!game.currentCard && !game.verdict,
    canSkip: game.turn !== viewer && !!game.currentCard && !game.verdict && (game.skips[viewer] || 0) < MAX_SKIPS_PER_PLAYER,
    opponent: { progress: other ? Math.ceil((game.currentRound + 1) / 2) : 0 },
    winner: game.winner,
    createdBy: game.createdBy,
  };
}

function emitView(io, game) {
  if (!io || !game) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game: buildAvView(game, p) });
  }
}

module.exports = {
  createAvGame,
  avAccept,
  avVerdict,
  avSkip,
  avRematch,
  avSetCards,
  buildAvView,
  emitAvView: emitView,
  clearAVTimers,
  // Exposés pour les tests
  FALLBACK,
  VERITE_POINTS,
  ACTION_POINTS,
  MAX_ROUNDS,
};
