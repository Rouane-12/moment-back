const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'voice', 'document'],
      required: true
    },
    url: { type: String, required: true },
    name: { type: String, default: '' },
    size: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    mimeType: { type: String, default: '' }
  }]
}, {
  timestamps: true
});

// Index for fast conversation lookups
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1 });

module.exports = mongoose.model('Message', messageSchema);
