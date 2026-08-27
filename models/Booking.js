const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itineraryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Itinerary',
    required: true
  },
  partners: [{
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner'
    },
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venue'
    },
    amount: Number
  }],
  status: {
    type: String,
    enum: ['pending', 'held', 'paid', 'confirmed', 'cancelled', 'expired', 'refunded', 'completed', 'no_show'],
    default: 'pending'
  },
  subtotal: {
    type: Number,
    required: true
  },
  commission: {
    type: Number,
    default: 0
  },
  fees: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'XOF'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  qrCode: {
    type: String,
    unique: true
  },
  heldAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  paidAt: {
    type: Date
  },
  confirmedAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ itineraryId: 1 });
bookingSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
