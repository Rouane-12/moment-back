const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  venue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue'
  },
  review: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  },
  type: {
    type: String,
    enum: ['venue', 'review', 'user', 'other'],
    required: true
  },
  category: {
    type: String,
    enum: ['inappropriate_content', 'spam', 'harassment', 'fake_info', 'safety', 'other'],
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'resolved', 'dismissed'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    trim: true
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ type: 1 });
reportSchema.index({ user: 1 });

module.exports = mongoose.model('Report', reportSchema);
