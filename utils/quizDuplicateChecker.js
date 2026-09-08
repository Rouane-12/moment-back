const crypto = require('crypto');

/**
 * Normalizes text for duplicate detection
 * - Converts to lowercase
 * - Removes punctuation
 * - Normalizes spaces
 * - Removes accents
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

/**
 * Creates a hash from normalized text for exact duplicate detection
 */
function createHash(text) {
  const normalized = normalizeText(text);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Checks if a question is an exact duplicate based on hash
 */
function isExactDuplicate(text, existingHashes) {
  const hash = createHash(text);
  return existingHashes.has(hash);
}

/**
 * Checks if a question is semantically similar (basic version)
 * This is a simplified version - for production, use embeddings
 */
function isSemanticSimilar(newQuestion, existingQuestions, threshold = 0.7) {
  const normalizedNew = normalizeText(newQuestion);
  const newWords = new Set(normalizedNew.split(' '));
  
  for (const existing of existingQuestions) {
    const normalizedExisting = normalizeText(existing);
    const existingWords = new Set(normalizedExisting.split(' '));
    
    // Calculate Jaccard similarity
    const intersection = new Set([...newWords].filter(x => existingWords.has(x)));
    const union = new Set([...newWords, ...existingWords]);
    const similarity = intersection.size / union.size;
    
    if (similarity >= threshold) {
      return true;
    }
  }
  
  return false;
}

/**
 * Normalizes a complete question object for storage
 */
function normalizeQuestion(question) {
  return {
    hash: createHash(question.question),
    normalizedText: normalizeText(question.question),
    text: question.question,
    answers: question.answers,
    correctIndex: question.correctIndex
  };
}

module.exports = {
  normalizeText,
  createHash,
  isExactDuplicate,
  isSemanticSimilar,
  normalizeQuestion
};
