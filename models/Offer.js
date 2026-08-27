const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  venueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  price: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'XOF'
  },
  duration: {
    type: Number,
    default: 60
  },
  capacity: {
    type: Number,
    required: true
  },
  commissionRate: {
    type: Number,
    default: 5
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive', 'sold_out'],
    default: 'draft'
  },
  availableFrom: {
    type: Date
  },
  availableUntil: {
    type: Date
  },
  conditions: {
    type: String
  },
  isGroupOffer: {
    type: Boolean,
    default: false
  },
  minPeople: {
    type: Number,
    default: 1
  },
  maxPeople: {
    type: Number
  },
  tags: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

offerSchema.index({ venueId: 1, status: 1 });
offerSchema.index({ status: 1, availableFrom: 1, availableUntil: 1 });

module.exports = mongoose.model('Offer', offerSchema);
