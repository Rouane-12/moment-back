const mongoose = require('mongoose');

const QuizQuestionSchema = new mongoose.Schema({
  // Normalized hash for exact duplicate detection
  hash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Original question text
  text: {
    type: String,
    required: true
  },
  
  // Normalized text (lowercase, no punctuation, normalized spaces)
  normalizedText: {
    type: String,
    required: true,
    index: true
  },
  
  // Answers array
  answers: [{
    type: String,
    required: true
  }],
  
  // Index of correct answer (0-3)
  correctIndex: {
    type: Number,
    required: true,
    min: 0,
    max: 3
  },
  
  // Difficulty level
  difficulty: {
    type: String,
    enum: ['facile', 'moyen', 'difficile', 'tres_difficile', 'expert'],
    required: true
  },
  
  // Points value
  points: {
    type: Number,
    required: true
  },
  
  // Category/domain
  category: {
    type: String,
    enum: ['geographie', 'histoire', 'sciences', 'sport', 'arts', 'culture', 'technologie', 'nature', 'politique', 'economie', 'litterature', 'musique', 'cinema', 'societe', 'architecture', 'mythologie', 'afrique', 'monde', 'autre'],
    default: 'autre'
  },
  
  // Source of the question
  source: {
    type: String,
    enum: ['ai', 'fallback', 'opentdb', 'manual'],
    required: true
  },
  
  // Usage tracking
  usedCount: {
    type: Number,
    default: 0
  },
  
  // Games that used this question
  usedByGames: [{
    type: String
  }],
  
  // Last time this question was used
  lastUsedAt: {
    type: Date
  },
  
  // Semantic embedding (for future duplicate detection)
  embedding: {
    type: [Number] // Array of numbers for vector similarity
  },
  
  // Whether this question is flagged as duplicate
  isDuplicate: {
    type: Boolean,
    default: false
  },
  
  // If duplicate, reference to original question
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuizQuestion'
  }
}, {
  timestamps: true
});

// Index for efficient queries
QuizQuestionSchema.index({ difficulty: 1, usedCount: 1 });
QuizQuestionSchema.index({ category: 1, difficulty: 1 });
QuizQuestionSchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('QuizQuestion', QuizQuestionSchema);
