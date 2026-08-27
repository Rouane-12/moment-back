const mongoose = require('mongoose');

const itineraryStepSchema = new mongoose.Schema({
  venueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue',
    required: true
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer'
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  type: {
    type: String,
    enum: ['venue', 'offer', 'event'],
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
  price: {
    type: Number,
    required: true
  },
  distanceKm: {
    type: Number,
    default: 0
  },
  order: {
    type: Number,
    required: true
  }
});

const itinerarySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  city: {
    type: String,
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
  peopleCount: {
    type: Number,
    required: true
  },
  budget: {
    type: Number,
    required: true
  },
  totalPrice: {
    type: Number,
    required: true
  },
  score: {
    type: Number,
    min: 0,
    max: 100
  },
  theme: {
    key: String,
    label: String,
    emoji: String
  },
  title: {
    type: String
  },
  roll: {
    type: Number
  },
  vibes: [{
    type: String
  }],
  transport: {
    type: String
  },
  distanceKm: {
    type: Number,
    default: 0
  },
  adapted: {
    type: Boolean,
    default: false
  },
  steps: [itineraryStepSchema],
  status: {
    type: String,
    enum: ['draft', 'generated', 'booked', 'cancelled', 'completed'],
    default: 'generated'
  },
  isGuest: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

itinerarySchema.index({ userId: 1, status: 1 });
itinerarySchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('Itinerary', itinerarySchema);
