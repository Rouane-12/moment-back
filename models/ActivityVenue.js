const mongoose = require('mongoose');

/**
 * Lieu d'activité (sportive ou de loisirs) — ex : académie de foot, salle de boxe,
 * club de tennis, piscine. Distinct des « moments détente » (bars, plages, cinéma…).
 *
 * Circuit de publication identique aux demandes de lieux partenaires :
 *   pending → approved (visible dans la liste publique) / rejected.
 * L'admin peut créer directement en approved.
 */
const activityVenueSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  activity: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  description: { type: String, trim: true },
  address: { type: String, trim: true },
  district: { type: String, trim: true },
  city: { type: String, default: 'Cotonou', trim: true },
  phone: { type: String, trim: true },
  whatsapp: { type: String, trim: true },
  latitude: { type: Number },
  longitude: { type: Number },
  horaires: { type: String, trim: true },
  // Indication libre de prix, renseignée par le partenaire ou l'admin
  // (ex : « à partir de 2 000 FCFA/séance ») — affichée sur la fiche pour
  // donner un repère au client. Pas un priceRange structuré.
  priceIndication: { type: String, trim: true, maxlength: 200 },
  googleMapsUrl: { type: String, trim: true },
  // Note moyenne des avis clients (calculée par routes/reviews.js)
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  rejectedReason: { type: String },
  source: {
    type: String,
    enum: ['seed', 'partner', 'user', 'admin'],
    default: 'admin',
  },
}, { timestamps: true });

// Index pour les listes par ville / activité / statut
activityVenueSchema.index({ city: 1, activity: 1, status: 1 });

module.exports = mongoose.model('ActivityVenue', activityVenueSchema);
