const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  password: {
    type: String,
    select: false
  },
  avatar: {
    type: String,
    default: ''
  },
  coverImage: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: 'Cotonou'
  },
  country: {
    type: String,
    default: 'Bénin'
  },
  dateOfBirth: {
    type: Date
  },
  role: {
    type: String,
    enum: ['user', 'partner_owner', 'partner_manager', 'partner_staff', 'admin', 'super_admin'],
    default: 'user'
  },
  preferences: {
    favoriteCategories: [{
      type: String
    }],
    minBudget: {
      type: Number,
      default: 2000
    },
    maxBudget: {
      type: Number,
      default: 40000
    },
    preferredDistance: {
      type: Number,
      default: 15
    },
    favoriteAmbiences: [{
      type: String
    }],
    preferredTimes: [{
      type: String
    }]
  },
  stats: {
    totalBookings: {
      type: Number,
      default: 0
    },
    totalSpent: {
      type: Number,
      default: 0
    },
    averageBudget: {
      type: Number,
      default: 0
    }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  otpCode: {
    type: String
  },
  otpExpires: {
    type: Date
  },
  resetCode: {
    type: String
  },
  resetCodeExpires: {
    type: Date
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
