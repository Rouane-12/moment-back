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
  googleMapsUrl: { type: String, trim: true },
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
