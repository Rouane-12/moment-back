const axios = require('axios');

const OPENTDB_BASE_URL = 'https://opentdb.com/api.php';

/**
 * Maps OpenTDB categories to our internal categories
 */
const CATEGORY_MAPPING = {
  9: 'autre', // General Knowledge
  10: 'livres', // Entertainment: Books
  11: 'cinema', // Entertainment: Film
  12: 'musique', // Entertainment: Music
  13: 'theatre', // Entertainment: Musicals & Theatres
  14: 'television', // Entertainment: Television
  15: 'jeux_video', // Entertainment: Video Games
  16: 'jeux', // Entertainment: Board Games
  17: 'sciences', // Science & Nature
  18: 'informatique', // Science: Computers
  19: 'mathematiques', // Science: Mathematics
  20: 'mythologie', // Mythology
  21: 'sport', // Sports
  22: 'geographie', // Geography
  23: 'histoire', // History
  24: 'politique', // Politics
  25: 'art', // Art
  26: 'celebrites', // Celebrities
  27: 'animaux', // Animals
  28: 'vehicules', // Vehicles
  29: 'comics', // Entertainment: Comics
  30: 'gadgets', // Science: Gadgets
  31: 'anime', // Entertainment: Japanese Anime & Manga
  32: 'cartoons', // Entertainment: Cartoons & Animations
};

/**
 * Maps OpenTDB difficulty to our internal difficulty
 */
const DIFFICULTY_MAPPING = {
  easy: 'facile',
  medium: 'moyen',
  hard: 'difficile'
};

/**
 * Fetches questions from OpenTDB API
 * @param {number} amount - Number of questions to fetch (max 50)
 * @param {string} difficulty - 'easy', 'medium', 'hard', or undefined for any
 * @param {number} category - Category ID or undefined for any
 * @param {string} token - Session token to avoid duplicates
 */
async function fetchOpenTDBQuestions(amount = 20, difficulty = undefined, category = undefined, token = undefined) {
  const params = {
    amount: Math.min(amount, 50),
    type: 'multiple' // Multiple choice only
  };
  
  if (difficulty) params.difficulty = difficulty;
  if (category) params.category = category;
  if (token) params.token = token;
  
  try {
    const response = await axios.get(OPENTDB_BASE_URL, { params, timeout: 10000 });
    
    if (response.data.response_code !== 0) {
      throw new Error(`OpenTDB API error: response_code ${response.data.response_code}`);
    }
    
    return response.data.results.map(q => mapOpenTDBQuestion(q));
  } catch (error) {
    console.error('Error fetching from OpenTDB:', error.message);
    throw error;
  }
}

/**
 * Maps an OpenTDB question to our internal format
 */
function mapOpenTDBQuestion(opentdbQuestion) {
  const { question, correct_answer, incorrect_answers, difficulty, category } = opentdbQuestion;
  
  // Shuffle answers and track correct index
  const allAnswers = [...incorrect_answers, correct_answer];
  const shuffled = shuffleArray(allAnswers);
  const correctIndex = shuffled.indexOf(correct_answer);
  
  return {
    question: decodeHTMLEntities(question),
    answers: shuffled.map(a => decodeHTMLEntities(a)),
    correctIndex,
    difficulty: DIFFICULTY_MAPPING[difficulty] || 'moyen',
    category: CATEGORY_MAPPING[opentdbQuestion.category] || 'autre',
    source: 'opentdb'
  };
}

/**
 * Decodes HTML entities (OpenTDB returns HTML-encoded text)
 */
function decodeHTMLEntities(text) {
  const entities = {
    '&quot;': '"',
    '&apos;': "'",
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&eacute;': 'é',
    '&egrave;': 'è',
    '&ecirc;': 'ê',
    '&euml;': 'ë',
    '&aacute;': 'á',
    '&agrave;': 'à',
    '&acirc;': 'â',
    '&iuml;': 'ï',
    '&ocirc;': 'ô',
    '&ucirc;': 'û',
    '&ugrave;': 'ù',
    '&ccedil;': 'ç',
    '&nbsp;': ' ',
    '&#039;': "'",
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&ldquo;': '"',
    '&rdquo;': '"'
  };
  
  return text.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Requests a new session token from OpenTDB
 * Session tokens prevent duplicate questions within a 6-hour session
 */
async function requestSessionToken() {
  try {
    const response = await axios.get('https://opentdb.com/api_token.php?command=request', { timeout: 10000 });
    if (response.data.response_code === 0) {
      return response.data.token;
    }
    return null;
  } catch (error) {
    console.error('Error requesting OpenTDB session token:', error.message);
    return null;
  }
}

/**
 * Resets a session token (clears memory of previously seen questions)
 */
async function resetSessionToken(token) {
  try {
    const response = await axios.get(`https://opentdb.com/api_token.php?command=reset&token=${token}`, { timeout: 10000 });
    return response.data.response_code === 0;
  } catch (error) {
    console.error('Error resetting OpenTDB session token:', error.message);
    return false;
  }
}

module.exports = {
  fetchOpenTDBQuestions,
  requestSessionToken,
  resetSessionToken,
  CATEGORY_MAPPING,
  DIFFICULTY_MAPPING
};
