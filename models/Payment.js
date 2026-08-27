const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  provider: {
    type: String,
    enum: ['kkiapay', 'mobile_money', 'card', 'cash'],
    required: true
  },
  providerTransactionId: {
    type: String,
    unique: true,
    sparse: true
  },
  amount: {
    type: Number,
    required: true
  },
  fees: {
    type: Number,
    default: 0
  },
  method: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'success', 'failed', 'refunded'],
    default: 'pending'
  },
  paidAt: {
    type: Date
  },
  refundedAt: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  webhookReceived: {
    type: Boolean,
    default: false
  },
  webhookData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

paymentSchema.index({ bookingId: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
