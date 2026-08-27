const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  venueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue'
  },
  rate: {
    type: Number,
    required: true
  },
  grossAmount: {
    type: Number,
    required: true
  },
  commissionAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'available', 'paid_out'],
    default: 'pending'
  },
  paidOutAt: {
    type: Date
  },
  payoutId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payout'
  }
}, {
  timestamps: true
});

commissionSchema.index({ partnerId: 1, status: 1 });
commissionSchema.index({ bookingId: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
