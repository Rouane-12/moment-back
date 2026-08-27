const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  method: {
    type: String,
    enum: ['mobile_money', 'bank_transfer'],
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['requested', 'processing', 'completed', 'failed'],
    default: 'requested'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  transactionReference: {
    type: String
  },
  notes: {
    type: String
  },
  commissionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Commission'
  }]
}, {
  timestamps: true
});

payoutSchema.index({ partnerId: 1, status: 1 });
payoutSchema.index({ status: 1, requestedAt: 1 });

module.exports = mongoose.model('Payout', payoutSchema);
