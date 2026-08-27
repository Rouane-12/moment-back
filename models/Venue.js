const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String
  },
  category: {
    type: String,
    enum: ['plage', 'food', 'gaming', 'bar', 'cinema', 'concert', 'culture', 'rooftop', 'hotel', 'history', 'nature', 'ecotourism', 'shopping', 'boat', 'exhibition', 'conference', 'sport', 'family', 'walk', 'workshop', 'pool', 'religion', 'architecture', 'public_space'],
    required: true
  },
  categories: [{
    type: String
  }],
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
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
    default: 'Cotonou'
  },
  phone: {
    type: String
  },
  website: {
    type: String
  },
  googlePlaceId: {
    type: String,
    unique: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['active', 'needs_verification', 'planned', 'discovered', 'imported', 'verified', 'partner', 'partner_premium'],
    default: 'discovered'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'source_backed', 'verify_before_publish'],
    default: 'pending'
  },
  sourceTier: {
    type: String,
    enum: ['tourism_official', 'unesco', 'gov_culture', 'secondary_directory', 'user_candidate']
  },
  sourceRefs: [{
    type: String
  }],
  sourceUrl: String,
  lastVerifiedAt: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner'
  },
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
  media: [{
    type: {
      type: String,
      enum: ['image', 'video']
    },
    url: String,
    thumbnail: String,
    sortOrder: {
      type: Number,
      default: 0
    }
  }],
  capacity: {
    type: Number
  },
  openingHours: [{
    day: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    open: String,
    close: String,
    isClosed: {
      type: Boolean,
      default: false
    }
  }],
  tags: [{
    type: String
  }],
  priceRange: {
    min: Number,
    max: Number,
    average: Number,
    unit: {
      type: String,
      default: 'per_person'
    },
    basis: String
  },
  durationMinutes: {
    min: Number,
    max: Number
  },
  bookingRequired: {
    type: String,
    enum: ['unknown', 'not_required', 'recommended', 'required', 'recommended_for_groups'],
    default: 'unknown'
  },
  indoorOutdoor: {
    type: String,
    enum: ['unknown', 'indoor', 'outdoor', 'mixed']
  },
  idealFor: [{
    type: String,
    enum: ['friends', 'couple', 'family', 'solo', 'groups']
  }],
  paymentMethods: [{
    type: String
  }],
  kind: {
    type: String,
    enum: ['public_site', 'market', 'unesco_site', 'restaurant', 'bar', 'hotel', 'beach', 'museum', 'cultural_center', 'concert_venue', 'gaming_venue', 'cinema', 'nature_site', 'ecotourism_site', 'boat_tour', 'shopping_center']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

venueSchema.index({ category: 1, city: 1 });
venueSchema.index({ latitude: 1, longitude: 1 });
venueSchema.index({ partnerId: 1 });

module.exports = mongoose.model('Venue', venueSchema);
