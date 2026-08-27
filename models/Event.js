const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  venueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue',
    required: true
  },
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner'
  },
  startAt: {
    type: Date,
    required: true
  },
  endAt: {
    type: Date,
    required: true
  },
  image: {
    type: String
  },
  video: {
    type: String
  },
  categories: [{
    type: String
  }],
  capacity: {
    type: Number,
    required: true
  },
  ticketTypes: [{
    name: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    remaining: {
      type: Number,
      required: true
    },
    commissionRate: {
      type: Number,
      default: 8
    },
    description: String
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'cancelled', 'completed'],
    default: 'draft'
  },
  isFeatured: {
    type: Boolean,
    default: false
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

eventSchema.index({ startAt: 1, status: 1 });
eventSchema.index({ venueId: 1 });
eventSchema.index({ organizerId: 1 });

module.exports = mongoose.model('Event', eventSchema);
