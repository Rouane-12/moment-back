const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  contactName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  address: {
    type: String
  },
  city: {
    type: String,
    default: 'Cotonou'
  },
  type: {
    type: String,
    enum: ['restaurant', 'bar', 'activity', 'event_organizer', 'venue'],
    required: true
  },
  description: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'active', 'suspended', 'rejected'],
    default: 'pending'
  },
  verificationDocuments: [{
    type: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  paymentInfo: {
    mobileMoneyNumber: String,
    mobileMoneyProvider: String,
    bankAccountNumber: String,
    bankName: String
  },
  commissionRate: {
    type: Number,
    default: 5
  },
  venues: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue'
  }],
  logo: {
    type: String
  },
  photos: [{
    type: String
  }],
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  totalBookings: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

partnerSchema.index({ email: 1 });
partnerSchema.index({ status: 1 });
partnerSchema.index({ city: 1 });

module.exports = mongoose.model('Partner', partnerSchema);
