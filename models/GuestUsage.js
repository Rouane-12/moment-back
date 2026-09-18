const mongoose = require('mongoose');

const guestUsageSchema = new mongoose.Schema({
  fingerprint: {
    type: String,
    required: true,
    index: true
  },
  // Dernière IP vue — permet de combiner fingerprint + IP pour durcir le quota
  ip: {
    type: String,
    index: true
  },
  count: {
    type: Number,
    default: 0
  },
  // Compteur cumulé par IP (anti-contournement navigation privée)
  ipCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GuestUsage', guestUsageSchema);
