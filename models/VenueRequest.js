const mongoose = require('mongoose');

const venueRequestSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  district: {
    type: String
  },
  city: {
    type: String,
    required: true,
    default: 'Cotonou'
  },
  phone: {
    type: String,
    required: true
  },
  website: {
    type: String
  },
  latitude: {
    type: Number
  },
  longitude: {
    type: Number
  },
  openingHours: [{
    day: String,
    open: String,
    close: String,
    isClosed: { type: Boolean, default: false }
  }],
  tags: [{
    type: String
  }],
  idealFor: [{
    type: String
  }],
  priceRange: {
    min: Number,
    max: Number,
    average: Number
  },
  durationMinutesMin: Number,
  durationMinutesMax: Number,
  capacity: Number,
  bookingRequired: {
    type: String,
    default: 'unknown'
  },
  indoorOutdoor: {
    type: String,
    default: 'unknown'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'paid', 'completed'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  paymentAmount: {
    type: Number,
    default: 5000
  },
  paymentReference: {
    type: String
  },
  adminNotes: {
    type: String
  },
  venueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue'
  },
  rejectedReason: {
    type: String
  },
  images: [{
    url: String,
    type: { type: String, default: 'image' },
    sortOrder: { type: Number, default: 0 }
  }],
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('VenueRequest', venueRequestSchema);
