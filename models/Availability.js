const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  capacity: {
    type: Number,
    required: true
  },
  remainingCapacity: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['available', 'temporarily_reserved', 'fully_booked', 'cancelled'],
    default: 'available'
  },
  reservedAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  }
}, {
  timestamps: true
});

availabilitySchema.index({ offerId: 1, date: 1, status: 1 });
availabilitySchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('Availability', availabilitySchema);
