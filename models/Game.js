const mongoose = require('mongoose');

/**
 * Persistance des parties de jeux.
 *
 * Aujourd'hui les parties vivent uniquement dans une Map en mémoire
 * (backend/games/gameEngine.js → activeGames). Un redéploiement Render
 * les détruit silencieusement. Ce modèle permet de sauvegarder l'état
 * brut de chaque partie pour la restaurer au retour d'un joueur.
 *
 * Le document stocke le game object tel quel (strict:false → champs libres),
 * chaque jeu garde sa propre structure interne.
 */
const gameSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true, index: true },
  players: [{ type: String, index: true }],
  state: { type: String, default: 'waiting' },
  // État complet du jeu (structure libre selon le type)
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true, strict: false });

// TTL de sécurité : une partie non touchée depuis 24h est purgée
gameSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('Game', gameSchema);
