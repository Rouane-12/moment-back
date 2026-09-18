const mongoose = require('mongoose');

/**
 * Réservation d'activité (mise en relation WhatsApp payante).
 *
 * Contrairement à Booking (détente : réservation ferme + QR code), ici le
 * client paie un FRAIS FIXE DE MISE EN RELATION — il rémunère l'organisation
 * (génération du moment, sélection du lieu, message pré-rempli) et non une
 * réservation garantie : le prix et la disponibilité se négocient en direct
 * avec le partenaire sur WhatsApp.
 *
 * Cycle de vie :
 *   pending  → créé, en attente du paiement Kkiapay
 *   paid     → paiement vérifié → le bouton WhatsApp est débloqué côté client
 *   refunded → le partenaire n'a jamais répondu dans le délai → remboursé
 *   expired  → jamais payé (purge TTL 24h)
 */
const activityBookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  itineraryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Itinerary',
    required: true,
  },
  activityVenueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActivityVenue',
    required: true,
  },
  // Frais fixe de mise en relation (FCFA) — 100 FCFA/personne, plafonné
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  peopleCount: { type: Number, default: 1 },
  status: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'expired'],
    default: 'pending',
    index: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  providerTransactionId: {
    type: String,
    index: true,
    sparse: true,
  },
  paidAt: { type: Date },
  refundedAt: { type: Date },
  refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  refundReason: { type: String },
  // Traçabilité : le message WhatsApp a-t-il été envoyé (utile pour la
  // politique de remboursement automatique en cas de non-réponse partenaire)
  whatsappSentAt: { type: Date },
}, { timestamps: true });

activityBookingSchema.index({ userId: 1, status: 1 });
activityBookingSchema.index({ itineraryId: 1 });

module.exports = mongoose.model('ActivityBooking', activityBookingSchema);
