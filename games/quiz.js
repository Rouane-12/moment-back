/**
 * 🧠 QUIZ — Trivia multijoueur (inspiré de « Qui veut gagner des millions ? »)
 *
 * Un seul pack de 20 questions est généré par partie (via OpenAI) et partagé
 * par les deux joueurs. Chaque joueur reçoit le même pack, mais dans un ordre
 * mélangé qui lui est propre — impossible de copier les réponses de l'autre.
 *
 * Progression asynchrone : chacun avance à son rythme (adapté à la messagerie).
 * Les vues émises sont construites par joueur (buildQuizView) pour ne JAMAIS
 * révéler les réponses correctes des questions que le joueur n'a pas encore
 * traitées.
 */

const { aiGenerateJSON, hasAnyProvider, configuredProviders } = require('../utils/aiProvider');
const QuizQuestion = require('../models/QuizQuestion');
const { normalizeText, createHash, isExactDuplicate, isSemanticSimilar, normalizeQuestion } = require('../utils/quizDuplicateChecker');
// OpenTDB removed - returns English questions. Using only AI + local French bank.

const PACK_SIZE = 20;
const QUESTION_TIME_MS = 20000; // 20s par question
const FEEDBACK_TIME_MS = 6000;  // 6s d'affichage du résultat avant la suivante
const TIERS = ['facile', 'moyen', 'difficile', 'tres_difficile', 'expert'];
const TIER_POINTS = { facile: 100, moyen: 200, difficile: 300, tres_difficile: 500, expert: 600 };

// OpenTDB session token (initialized on first use)
// opentdbToken removed - no longer using OpenTDB

function createGameId() {
  return Math.random().toString(36).substring(2, 10);
}

function shuffleIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ══════════════════════════════════════
// GÉNÉRATION DU PACK (OpenAI + fallback)
// ══════════════════════════════════════

async function getUsedQuestionsText() {
  try {
    const recentQuestions = await QuizQuestion.find({})
      .sort({ lastUsedAt: -1 })
      .limit(100)
      .select('text');
    return recentQuestions.map(q => q.text).join('\n- ');
  } catch (error) {
    console.error('Error fetching used questions:', error.message);
    return '';
  }
}

// Vérifie si une question est en français (détection robuste)
function isFrenchQuestion(question) {
  const questionText = question.question.toLowerCase();
  const allText = (question.question + ' ' + question.answers.join(' ')).toLowerCase();

  // Rejet immédiat si la question commence par un mot anglais interrogatif
  const englishQuestionStarters = ['what', 'where', 'when', 'who', 'why', 'how', 'which', 'whose', 'whom'];
  if (englishQuestionStarters.some(starter => questionText.startsWith(starter))) {
    console.log(`REJECTED (starts with English question word): ${question.question}`);
    return false;
  }

  // Rejet si des mots anglais courants apparaissent dans les réponses
  const englishWordsInAnswers = ['the ', ' an ', ' and ', ' is ', ' are ', ' was ', ' were ', ' has ', ' have ', ' had ', ' can ', ' will ', ' does ', ' did ', ' do ', ' for ', ' from ', ' with ', ' that ', ' this ', ' these ', ' those ', 'historic', 'landmarks', 'documentaries', 'abandoned', 'buildings', 'malls', 'action', 'films', 'liver', 'pancreas', 'stomach', 'gallbladder', 'produces', 'typically', 'focus'];
  for (const word of englishWordsInAnswers) {
    if (allText.includes(word)) {
      console.log(`REJECTED (English word found in answers): ${question.question}`);
      return false;
    }
  }

  // Vérifie que la question contient au moins un mot français courant
  const frenchMarkers = ['quelle', 'quel', 'quels', 'quelles', 'qui', 'comment', 'combien', 'pourquoi', 'où', 'quand', 'dans', 'avec', 'peut', 'est', 'sont', 'été', 'avoir', 'être', 'les', 'des', 'une', 'du', 'la', 'le', 'l\'', 'au', 'aux', 'ce', 'cette', 'ces', 'mon', 'ton', 'son', 'notre', 'votre', 'leur', 'plus', 'moins', 'aussi', 'très', 'bien', 'mal', 'faire', 'dire', 'aller', 'venir', 'prendre', 'donner', 'voir', 'savoir', 'pouvoir', 'vouloir'];
  const hasFrenchMarker = frenchMarkers.some(marker => questionText.includes(marker));
  if (!hasFrenchMarker) {
    console.log(`REJECTED (no French marker found): ${question.question}`);
    return false;
  }

  return true;
}

// Nettoie les questions en anglais de la base de données
async function cleanupEnglishQuestions() {
  try {
    const allQuestions = await QuizQuestion.find({}).lean();
    const englishQuestions = allQuestions.filter(q => !isFrenchQuestion({
      question: q.text,
      answers: q.answers
    }));

    if (englishQuestions.length > 0) {
      console.log(`Found ${englishQuestions.length} English questions in database, deleting...`);
      const idsToDelete = englishQuestions.map(q => q._id);
      await QuizQuestion.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`Deleted ${englishQuestions.length} English questions from database`);
    } else {
      console.log('No English questions found in database');
    }

    return englishQuestions.length;
  } catch (error) {
    console.error('Error cleaning up English questions:', error.message);
    return 0;
  }
}

async function buildAIPrompt() {
  const usedQuestions = await getUsedQuestionsText();
  return `Tu es le générateur officiel du quiz de l'application.

⚠️ RÈGLE ABSOLUE : GÉNÈRE EXCLUSIVEMENT DES QUESTIONS ET RÉPONSES EN FRANÇAIS.
⚠️ INTERDICTION TOTALE DE GÉNÉRER DES QUESTIONS EN ANGLAIS.
⚠️ SI TU GÈNÈRES UNE QUESTION EN ANGLAIS, LA RÉPONSE SERA REJETÉE.

Génère 20 questions originales de culture générale en FRANÇAIS.

Exemples de questions CORRECTES (cultivées mais accessibles) :
- "Quel pays est surnommé « le pays du Soleil-Levant » ?"
- "Quel fleuve traverse la ville du Caire ?"
- "Qui a composé « La Flûte enchantée » ?"

Exemples de questions INTERDITES (trop simples ou enfantines) :
- "Combien de doigts a une main ?"
- "De quelle couleur est le ciel ?"
- "Combien de jours compte une semaine ?"

Contraintes OBLIGATOIRES :
- TOUTES les questions doivent commencer par des mots français (Quelle, Qui, Quel, Quels, Quelles, Combien, En quelle, Dans quel, etc.)
- TOUTES les réponses doivent être en français.
- JAMAIS de mots anglais comme "What", "Where", "When", "Who", "Why", "How".
- JAMAIS de noms propres anglais obscurs (ex: "Dan Bell").
- Chaque question possède exactement 4 réponses.
- Une seule réponse est correcte.
- Les questions doivent être adaptées à des adultes.
- Ne génère pas de questions enfantines.
- Les questions doivent couvrir plusieurs domaines :
  histoire, géographie, sciences, art, littérature, musique,
  cinéma, technologie, économie, culture africaine, monde,
  société, sport, architecture, mythologie, etc.
- INTERDICTION ABSOLUE des questions triviales, enfantines ou évidentes (compter des doigts, des jours, des saisons, des roues…). Chaque question doit apprendre quelque chose.
- Privilégie des questions de culture vivante : histoire, géographie (capitales, fleuves, monuments), sciences, art, littérature, musique, cinéma, sport, économie, culture africaine et mondiale, mythologie, architecture.
- Utilise aussi des questions de comparaison et de classement (« Quel est le plus long… », « Quel pays compte le plus… », « Quelle œuvre a été créée avant… »).
- Évite les questions extrêmement connues ou évidentes : aucun classique grand public.
- La difficulté doit progressivement augmenter.
- Les questions 1 à 5 : moyen
- 6 à 10 : moyen/difficile
- 11 à 15 : difficile
- 16 à 20 : très difficile
- CHAQUE partie doit être entièrement nouvelle : ne réutilise jamais une question, un sujet ou un fait déjà généré lors d'une partie précédente.
- Ne reformule jamais une question déjà fournie précédemment.
- Ne produis jamais une question portant sur exactement le même fait qu'une question précédente.
- Varie largement les thèmes d'une question à l'autre : ne mets pas deux questions du même domaine à la suite.
- Privilégie des questions précises, originales et peu connues du grand public.
- Les quatre propositions doivent être plausibles.
- Ne crée aucune réponse ambiguë.
- Une réponse doit être factuellement vérifiable.
- Ne mets pas la réponse correcte systématiquement à la même position.

QUESTIONS DÉJÀ UTILISÉES (ne pas reformuler) :
${usedQuestions ? '- ' + usedQuestions : '(aucune question enregistrée)'}

Réponds uniquement avec le JSON demandé : {"questions":[{"question":"...","answers":["...","...","...","..."],"correctIndex":0}]}`;
}

function buildPack(rawList) {
  if (!Array.isArray(rawList) || rawList.length < PACK_SIZE) return null;
  const pack = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    const q = rawList[i];
    if (!q || typeof q.question !== 'string' || !q.question.trim()) return null;
    if (!Array.isArray(q.answers) || q.answers.length !== 4) return null;
    if (q.answers.some(a => typeof a !== 'string' || !a.trim())) return null;
    const correctIndex = Number(q.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;
    
    // Vérifie que la question est en français
    if (!isFrenchQuestion(q)) {
      console.log(`Question en anglais détectée et rejetée: ${q.question}`);
      continue; // Skip this question
    }
    
    const tier = TIERS[Math.floor(i / 5)];
    pack.push({
      id: `q${i + 1}`,
      question: q.question.trim(),
      answers: q.answers.map(a => a.trim()),
      correctIndex,
      difficulty: tier,
      points: TIER_POINTS[tier] || 200,
    });
  }
  
  // Si on n'a pas assez de questions après filtrage, retourne null
  if (pack.length < PACK_SIZE) {
    console.log(`Pas assez de questions en français après filtrage: ${pack.length}/${PACK_SIZE}`);
    return null;
  }
  
  return pack;
}

async function generateQuizPack(maxRetries = 3) {
  if (!hasAnyProvider()) {
    throw new Error(
      'Aucune clé IA configurée (GEMINI_API_KEY, OPENAI_API_KEY ou PERPLEXITY_API_KEY)'
    );
  }

  // Clean up English questions from database before generating
  try {
    await cleanupEnglishQuestions();
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`AI generation attempt ${attempt}/${maxRetries}`);

    const prompt = await buildAIPrompt();

    // Fournisseur multi-IA (Gemini → OpenAI → Perplexity).
    const { data: parsed, provider } = await aiGenerateJSON({
      systemPrompt: prompt,
      userPrompt: 'Génère maintenant le pack de 20 questions en respectant strictement le format JSON demandé.',
      temperature: 1.1,
      maxTokens: 8000,
      json: true,
    });
    console.log(`Questions générées via ${provider}`);

    const rawList = Array.isArray(parsed) ? parsed : parsed?.questions;
    const pack = buildPack(rawList);

    if (!pack) {
      console.log(`Attempt ${attempt}: Pack invalide ou trop de questions en anglais`);
      if (attempt < maxRetries) continue;
      throw new Error('Pack généré par l\'IA invalide après ' + maxRetries + ' tentatives');
    }

    console.log(`Attempt ${attempt}: ${pack.length} questions valides en français`);

    // Check for duplicates and save to database
    const filteredPack = await filterAndSaveQuestions(pack, 'ai');
    return filteredPack;
  }

  throw new Error('Échec de la génération après ' + maxRetries + ' tentatives');
}

// Banque locale de secours — utilisée uniquement si l'API OpenAI échoue,
// pour que le jeu ne soit jamais bloqué.
const FALLBACK_BANK = {
  facile: [
    { question: 'Quelle est la capitale du Sénégal ?', answers: ['Dakar', 'Abidjan', 'Bamako', 'Conakry'], correctIndex: 0 },
    { question: 'Quel pays est surnommé « le pays du Soleil-Levant » ?', answers: ['La Chine', 'Le Japon', 'La Thaïlande', 'La Corée du Sud'], correctIndex: 1 },
    { question: 'Qui a écrit la pièce « L\'Avare » ?', answers: ['Molière', 'Victor Hugo', 'Émile Zola', 'Jean Racine'], correctIndex: 0 },
    { question: 'Quel est le plus long fleuve d\'Afrique ?', answers: ['Le Congo', 'Le Nil', 'Le Niger', 'Le Zambèze'], correctIndex: 1 },
    { question: 'Quelle planète est la plus proche du Soleil ?', answers: ['Vénus', 'Mercure', 'La Terre', 'Mars'], correctIndex: 1 },
    { question: 'Quelle est la langue la plus parlée au monde comme langue maternelle ?', answers: ['L\'anglais', 'Le mandarin', 'L\'espagnol', 'L\'hindi'], correctIndex: 1 },
    { question: 'Quel monument se trouve à Agra, en Inde ?', answers: ['Le Taj Mahal', 'Angkor Wat', 'Pétra', 'Borobudur'], correctIndex: 0 },
    { question: 'Combien de continents compte le monde ?', answers: ['5', '6', '7', '8'], correctIndex: 2 },
    { question: 'Qui interprète le rôle principal dans le film « Titanic » ?', answers: ['Brad Pitt', 'Leonardo DiCaprio', 'Tom Cruise', 'Johnny Depp'], correctIndex: 1 },
    { question: 'Quelle est la capitale officielle de la Côte d\'Ivoire ?', answers: ['Abidjan', 'Yamoussoukro', 'Accra', 'Lomé'], correctIndex: 1 },
    { question: 'Quel gaz les plantes absorbent-elles pour la photosynthèse ?', answers: ['L\'oxygène', 'Le dioxyde de carbone', 'L\'azote', 'L\'hydrogène'], correctIndex: 1 },
    { question: 'Qui a composé l\'opéra « La Flûte enchantée » ?', answers: ['Mozart', 'Beethoven', 'Bach', 'Vivaldi'], correctIndex: 0 },
    { question: 'Quelle mer sépare l\'Europe de l\'Afrique ?', answers: ['La mer Rouge', 'La mer Méditerranée', 'La mer Noire', 'La mer Baltique'], correctIndex: 1 },
    { question: 'Quel est le plus grand désert chaud du monde ?', answers: ['Le Gobi', 'Le Sahara', 'L\'Atacama', 'Le Kalahari'], correctIndex: 1 },
    { question: 'Dans quelle ville se trouve le Colisée ?', answers: ['Athènes', 'Rome', 'Naples', 'Madrid'], correctIndex: 1 },
    { question: 'Quelle vitamine trouve-t-on surtout dans les oranges ?', answers: ['Vitamine A', 'Vitamine C', 'Vitamine D', 'Vitamine K'], correctIndex: 1 },
    { question: 'Quel pays a pour capitale Lisbonne ?', answers: ['L\'Espagne', 'Le Portugal', 'Le Brésil', 'L\'Italie'], correctIndex: 1 },
    { question: 'Quelle est la capitale du Canada ?', answers: ['Toronto', 'Ottawa', 'Montréal', 'Vancouver'], correctIndex: 1 },
    { question: 'Quelle est la plus grande île du monde ?', answers: ['Madagascar', 'Le Groenland', 'Bornéo', 'La Nouvelle-Guinée'], correctIndex: 1 },
    { question: 'Combien de joueurs d\'une équipe de basket sont sur le terrain ?', answers: ['5', '6', '7', '4'], correctIndex: 0 },
    { question: 'Quelle est la capitale de l\'Égypte ?', answers: ['Alexandrie', 'Le Caire', 'Louxor', 'Assouan'], correctIndex: 1 },
    { question: 'Quel métal est liquide à température ambiante ?', answers: ['Le mercure', 'Le plomb', 'L\'étain', 'Le zinc'], correctIndex: 0 },
    { question: 'Qui a été le premier président de la République française ?', answers: ['Napoléon III', 'Louis-Napoléon Bonaparte', 'Charles de Gaulle', 'Jules Grévy'], correctIndex: 1 },
    { question: 'Quel sport pratique-t-on à Roland-Garros ?', answers: ['Le football', 'Le tennis', 'Le rugby', 'Le golf'], correctIndex: 1 },
    { question: 'Quelle est la capitale de l\'Allemagne ?', answers: ['Munich', 'Berlin', 'Francfort', 'Hambourg'], correctIndex: 1 },
    { question: 'Quel animal est capable de changer de couleur ?', answers: ['Le caméléon', 'Le gecko', 'L\'iguane', 'Le varan'], correctIndex: 0 },
    { question: 'Quelle est la capitale du Kenya ?', answers: ['Mombasa', 'Nairobi', 'Kisumu', 'Dakar'], correctIndex: 1 },
    { question: 'Quel pays a offert la statue de la Liberté aux États-Unis ?', answers: ['Le Royaume-Uni', 'La France', 'L\'Espagne', 'Les Pays-Bas'], correctIndex: 1 },
    { question: 'Quel est l\'organe qui filtre le sang dans le corps humain ?', answers: ['Le foie', 'Les reins', 'La rate', 'L\'estomac'], correctIndex: 1 },
    { question: 'Quelle est la capitale de la Turquie ?', answers: ['Istanbul', 'Ankara', 'Izmir', 'Bursa'], correctIndex: 1 },
  ],
  moyen: [
    { question: 'En quelle année a eu lieu la Révolution française ?', answers: ['1799', '1789', '1776', '1815'], correctIndex: 1 },
    { question: 'Qui a peint « La Joconde » ?', answers: ['Pablo Picasso', 'Vincent van Gogh', 'Claude Monet', 'Léonard de Vinci'], correctIndex: 3 },
    { question: 'Quel pays a remporté la Coupe du monde de football en 2018 ?', answers: ['Le Brésil', 'L\'Allemagne', 'La France', 'L\'Argentine'], correctIndex: 2 },
    { question: 'Quelle est la plus grande planète du système solaire ?', answers: ['Saturne', 'Neptune', 'Jupiter', 'La Terre'], correctIndex: 2 },
    { question: 'Qui a écrit « Le Petit Prince » ?', answers: ['Victor Hugo', 'Antoine de Saint-Exupéry', 'Jules Verne', 'Marcel Pagnol'], correctIndex: 1 },
    { question: 'Quel est le plus grand océan du monde ?', answers: ['L\'Atlantique', 'L\'Indien', 'Le Pacifique', 'L\'Arctique'], correctIndex: 2 },
    { question: 'En quelle année le Titanic a-t-il coulé ?', answers: ['1905', '1912', '1920', '1915'], correctIndex: 1 },
    { question: 'Quel est le plus haut sommet du monde ?', answers: ['Le Mont Blanc', 'Le Kilimandjaro', 'L\'Everest', 'Le Mont Fuji'], correctIndex: 2 },
    { question: 'Qui a découvert l\'Amérique en 1492 ?', answers: ['Vasco de Gama', 'Christophe Colomb', 'Magellan', 'Jacques Cartier'], correctIndex: 1 },
    { question: 'Combien d\'os compte le corps humain adulte ?', answers: ['186', '206', '226', '246'], correctIndex: 1 },
    { question: 'Quelle est la capitale de l\'Espagne ?', answers: ['Barcelone', 'Séville', 'Madrid', 'Valence'], correctIndex: 2 },
    { question: 'En quelle année a eu lieu la chute du mur de Berlin ?', answers: ['1985', '1989', '1991', '1993'], correctIndex: 1 },
    { question: 'Quel gaz compose majoritairement l\'atmosphère terrestre ?', answers: ['L\'oxygène', 'L\'azote', 'Le dioxyde de carbone', 'L\'hydrogène'], correctIndex: 1 },
    { question: 'Combien de pays y a-t-il dans l\'Union européenne ?', answers: ['25', '27', '29', '31'], correctIndex: 1 },
    { question: 'Qui a inventé l\'ampoule électrique ?', answers: ['Nikola Tesla', 'Thomas Edison', 'Alexander Graham Bell', 'Albert Einstein'], correctIndex: 1 },
    { question: 'Qui a écrit « Les Misérables » ?', answers: ['Émile Zola', 'Gustave Flaubert', 'Alexandre Dumas', 'Victor Hugo'], correctIndex: 3 },
    { question: 'Quelle est la capitale de l\'Italie ?', answers: ['Milan', 'Naples', 'Rome', 'Turin'], correctIndex: 2 },
    { question: 'En quelle année a commencé la Première Guerre mondiale ?', answers: ['1912', '1914', '1916', '1918'], correctIndex: 1 },
    { question: 'Quel est le plus long fleuve d\'Europe ?', answers: ['Le Rhin', 'La Volga', 'Le Danube', 'La Seine'], correctIndex: 1 },
    { question: 'Qui a écrit « Roméo et Juliette » ?', answers: ['Charles Dickens', 'Molière', 'Johann Wolfgang von Goethe', 'William Shakespeare'], correctIndex: 3 },
    { question: 'Quelle est la capitale du Maroc ?', answers: ['Casablanca', 'Marrakech', 'Rabat', 'Fès'], correctIndex: 2 },
    { question: 'Combien de joueurs compose une équipe de football ?', answers: ['9', '10', '11', '12'], correctIndex: 2 },
    { question: 'Quel est le deuxième plus grand océan du monde ?', answers: ['L\'Atlantique', 'L\'Indien', 'Le Pacifique', 'L\'Arctique'], correctIndex: 0 },
    { question: 'Qui a peint « Guernica » ?', answers: ['Salvador Dalí', 'Pablo Picasso', 'Joan Miró', 'Francisco Goya'], correctIndex: 1 },
    { question: 'Quelle est la monnaie du Royaume-Uni ?', answers: ['L\'euro', 'La livre sterling', 'Le dollar', 'Le franc suisse'], correctIndex: 1 },
    { question: 'Quel organe pompe le sang dans le corps humain ?', answers: ['Le foie', 'Les poumons', 'Le cœur', 'Le rein'], correctIndex: 2 },
    { question: 'Quelle est la capitale du Brésil ?', answers: ['Rio de Janeiro', 'São Paulo', 'Brasilia', 'Salvador'], correctIndex: 2 },
    { question: 'Qui a découvert la pénicilline ?', answers: ['Louis Pasteur', 'Alexander Fleming', 'Marie Curie', 'Robert Koch'], correctIndex: 1 },
    { question: 'Quel compositeur a poursuivi sa carrière malgré sa surdité ?', answers: ['Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Ludwig van Beethoven', 'Frédéric Chopin'], correctIndex: 2 },
    { question: 'Quelle est la capitale de l\'Algérie ?', answers: ['Oran', 'Constantine', 'Alger', 'Annaba'], correctIndex: 2 },
  ],
  difficile: [
    { question: 'Quel est le premier élément du tableau périodique ?', answers: ['L\'hélium', 'L\'oxygène', 'Le carbone', 'L\'hydrogène'], correctIndex: 3 },
    { question: 'Combien de cordes possède un violon ?', answers: ['6', '4', '5', '7'], correctIndex: 1 },
    { question: 'Quelle est la capitale de l\'Australie ?', answers: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correctIndex: 2 },
    { question: 'En quelle année l\'homme a-t-il marché sur la Lune pour la première fois ?', answers: ['1965', '1972', '1969', '1959'], correctIndex: 2 },
    { question: 'Quel est le plus petit pays du monde ?', answers: ['Monaco', 'Malte', 'L\'Andorre', 'Le Vatican'], correctIndex: 3 },
    { question: 'Qui a composé la Neuvième Symphonie ?', answers: ['Mozart', 'Bach', 'Chopin', 'Beethoven'], correctIndex: 3 },
    { question: 'Quelle est la capitale du Canada ?', answers: ['Toronto', 'Vancouver', 'Ottawa', 'Montréal'], correctIndex: 2 },
    { question: 'En quelle année a été créé le World Wide Web ?', answers: ['1985', '1990', '1995', '2000'], correctIndex: 1 },
    { question: 'Quel est le fleuve le plus long du monde ?', answers: ['L\'Amazone', 'Le Nil', 'Le Mississippi', 'Le Yangtsé'], correctIndex: 1 },
    { question: 'Combien de pays bordent la mer Méditerranée ?', answers: ['15', '21', '28', '34'], correctIndex: 1 },
    { question: 'Quelle est la monnaie du Japon ?', answers: ['Le won', 'Le yuan', 'Le yen', 'Le ringgit'], correctIndex: 2 },
    { question: 'En quelle année a été fondé l\'État d\'Israël ?', answers: ['1945', '1948', '1950', '1952'], correctIndex: 1 },
    { question: 'Quel est le désert le plus chaud du monde ?', answers: ['Le Sahara', 'Le désert de Gobi', 'Le désert d\'Atacama', 'Le désert de Kalahari'], correctIndex: 0 },
    { question: 'Combien de planètes composent notre système solaire ?', answers: ['7', '8', '9', '10'], correctIndex: 1 },
    { question: 'Quelle est la capitale de la Norvège ?', answers: ['Bergen', 'Oslo', 'Stockholm', 'Helsinki'], correctIndex: 1 },
    { question: 'Quelle est la capitale de l\'Argentine ?', answers: ['Santiago', 'Buenos Aires', 'Montevideo', 'Lima'], correctIndex: 1 },
    { question: 'Qui a développé la théorie de la relativité ?', answers: ['Isaac Newton', 'Niels Bohr', 'Max Planck', 'Albert Einstein'], correctIndex: 3 },
    { question: 'Quel est le plus grand lac d\'Afrique ?', answers: ['Le lac Victoria', 'Le lac Tanganyika', 'Le lac Tchad', 'Le lac Malawi'], correctIndex: 0 },
    { question: 'Quelle est la capitale de la Turquie ?', answers: ['Istanbul', 'Ankara', 'Izmir', 'Bursa'], correctIndex: 1 },
    { question: 'Combien de cordes possède une guitare classique ?', answers: ['4', '6', '7', '12'], correctIndex: 1 },
    { question: 'Qui a écrit « L\'Étranger » ?', answers: ['Jean-Paul Sartre', 'Albert Camus', 'André Gide', 'François Mauriac'], correctIndex: 1 },
    { question: 'Quel est le plus haut sommet d\'Afrique ?', answers: ['Le mont Kenya', 'Le Kilimandjaro', 'Le mont Toubkal', 'Le Ruwenzori'], correctIndex: 1 },
    { question: 'Quelle est la capitale du Portugal ?', answers: ['Porto', 'Lisbonne', 'Braga', 'Faro'], correctIndex: 1 },
    { question: 'En quelle année a été signé le traité de Versailles ?', answers: ['1917', '1918', '1919', '1920'], correctIndex: 2 },
    { question: 'Quel fleuve traverse Paris ?', answers: ['Le Rhône', 'La Loire', 'La Seine', 'La Garonne'], correctIndex: 2 },
    { question: 'Quel pays a inventé le papier ?', answers: ['L\'Égypte', 'La Grèce', 'La Chine', 'La Perse'], correctIndex: 2 },
    { question: 'Quelle est la capitale du Kenya ?', answers: ['Mombasa', 'Nairobi', 'Kisumu', 'Dakar'], correctIndex: 1 },
    { question: 'Combien de diagonales possède un pentagone ?', answers: ['3', '5', '7', '10'], correctIndex: 1 },
    { question: 'Qui a peint « La Nuit étoilée » ?', answers: ['Claude Monet', 'Paul Cézanne', 'Pierre-Auguste Renoir', 'Vincent van Gogh'], correctIndex: 3 },
    { question: 'Quelle est la capitale de la Suède ?', answers: ['Göteborg', 'Malmö', 'Stockholm', 'Uppsala'], correctIndex: 2 },
  ],
  tres_difficile: [
    { question: 'Quelle est la vitesse approximative de la lumière ?', answers: ['150 000 km/s', '300 000 km/s', '1 000 000 km/s', '30 000 km/s'], correctIndex: 1 },
    { question: 'Quel est l\'os le plus long du corps humain ?', answers: ['Le tibia', 'L\'humérus', 'Le fémur', 'Le radius'], correctIndex: 2 },
    { question: 'Combien de pays membres compte l\'ONU ?', answers: ['180', '185', '201', '193'], correctIndex: 3 },
    { question: 'Quelle est la capitale de la Nouvelle-Zélande ?', answers: ['Auckland', 'Christchurch', 'Wellington', 'Canberra'], correctIndex: 2 },
    { question: 'Combien de dents possède un adulte en moyenne ?', answers: ['28', '36', '32', '24'], correctIndex: 2 },
    { question: 'Quel est le plus grand organe du corps humain ?', answers: ['Le foie', 'Les poumons', 'Le cerveau', 'La peau'], correctIndex: 3 },
    { question: 'En quelle année a été signé le traité de Rome ?', answers: ['1950', '1957', '1962', '1969'], correctIndex: 1 },
    { question: 'Quel est le point le plus bas sur Terre ?', answers: ['La mer Morte', 'La fosse des Mariannes', 'Le lac Baïkal', 'La vallée de la Mort'], correctIndex: 0 },
    { question: 'Combien de chromosomes possède l\'être humain ?', answers: ['23', '46', '44', '48'], correctIndex: 1 },
    { question: 'Quelle est la capitale du Bhoutan ?', answers: ['Thimphou', 'Paro', 'Punakha', 'Wangdue'], correctIndex: 0 },
    { question: 'En quelle année a eu lieu la bataille de Waterloo ?', answers: ['1805', '1812', '1815', '1820'], correctIndex: 2 },
    { question: 'Quel est le métal le plus abondant dans la croûte terrestre ?', answers: ['Le fer', 'L\'aluminium', 'Le cuivre', 'Le zinc'], correctIndex: 1 },
    { question: 'Quelle famille d\'animaux compte le plus grand nombre d\'espèces ?', answers: ['Les mammifères', 'Les insectes', 'Les oiseaux', 'Les reptiles'], correctIndex: 1 },
    { question: 'Quelle est la capitale du Suriname ?', answers: ['Paramaribo', 'Lelydorp', 'Nieuw Nickerie', 'Albina'], correctIndex: 0 },
    { question: 'En quelle année a été découverte la pénicilline ?', answers: ['1925', '1928', '1932', '1935'], correctIndex: 1 },
    { question: 'Quelle est la capitale du Kazakhstan ?', answers: ['Almaty', 'Astana', 'Bichkek', 'Tachkent'], correctIndex: 1 },
    { question: 'Quel est l\'élément le plus abondant de l\'univers ?', answers: ['L\'oxygène', 'L\'hydrogène', 'L\'hélium', 'Le carbone'], correctIndex: 1 },
    { question: 'Combien de pays composent le Royaume-Uni ?', answers: ['3', '4', '5', '6'], correctIndex: 1 },
    { question: 'Quel est le plus petit pays d\'Afrique ?', answers: ['Les Seychelles', 'Les Comores', 'Le Cap-Vert', 'La Gambie'], correctIndex: 0 },
    { question: 'Quelle est la capitale de l\'Uruguay ?', answers: ['Buenos Aires', 'Montevideo', 'Asuncion', 'Santiago'], correctIndex: 1 },
    { question: 'En quelle année a été fondée l\'ONU ?', answers: ['1943', '1945', '1947', '1950'], correctIndex: 1 },
    { question: 'Quel est le plus long fleuve d\'Asie ?', answers: ['Le Gange', 'Le Mékong', 'Le Yangtsé', 'Le Huang He'], correctIndex: 2 },
    { question: 'Combien de vertèbres compte la colonne vertébrale humaine ?', answers: ['26', '33', '40', '48'], correctIndex: 1 },
    { question: 'Qui a écrit « Guerre et Paix » ?', answers: ['Fiodor Dostoïevski', 'Léon Tolstoï', 'Anton Tchekhov', 'Ivan Tourgueniev'], correctIndex: 1 },
    { question: 'Combien de dents de lait possède un enfant ?', answers: ['20', '24', '28', '32'], correctIndex: 0 },
    { question: 'Quelle est la capitale de la Mongolie ?', answers: ['Oulan-Bator', 'Oulan-Oude', 'Pékin', 'Astana'], correctIndex: 0 },
    { question: 'En quelle année l\'apartheid a-t-il pris fin en Afrique du Sud ?', answers: ['1990', '1992', '1994', '1996'], correctIndex: 2 },
    { question: 'Quelle est la capitale de l\'Islande ?', answers: ['Reykjavik', 'Oslo', 'Helsinki', 'Copenhague'], correctIndex: 0 },
    { question: 'Quel est le plus petit État des États-Unis ?', answers: ['Delaware', 'Rhode Island', 'Hawaï', 'Vermont'], correctIndex: 1 },
    { question: 'Quelle est la capitale de l\'Angola ?', answers: ['Luanda', 'Lagos', 'Maputo', 'Kinshasa'], correctIndex: 0 },
    { question: 'En quelle année a eu lieu la première Coupe du monde de football ?', answers: ['1928', '1930', '1934', '1938'], correctIndex: 1 },
  ],
};

async function filterAndSaveQuestions(questions, source) {
  const filtered = [];
  const existingHashes = new Set();
  
  // Fetch existing hashes from database
  try {
    const existingQuestions = await QuizQuestion.find({}).select('hash');
    existingQuestions.forEach(q => existingHashes.add(q.hash));
  } catch (error) {
    console.error('Error fetching existing hashes:', error.message);
  }
  
  for (const q of questions) {
    const normalized = normalizeQuestion(q);
    
    // Check for exact duplicate
    if (existingHashes.has(normalized.hash)) {
      console.log(`Skipping duplicate question: ${q.question}`);
      continue;
    }
    
    // Check for semantic similarity with recent questions.
    // Si la base est indisponible, on ne jette pas les questions de l'IA :
    // on saute simplement la détection de similarité.
    let recentTexts = [];
    try {
      const recentQuestions = await QuizQuestion.find({})
        .sort({ lastUsedAt: -1 })
        .limit(50)
        .select('text');
      recentTexts = recentQuestions.map(rq => rq.text);
    } catch (error) {
      console.error('Error fetching recent questions:', error.message);
    }

    if (isSemanticSimilar(q.question, recentTexts, 0.7)) {
      console.log(`Skipping semantically similar question: ${q.question}`);
      continue;
    }
    
    filtered.push(q);
    existingHashes.add(normalized.hash);
  }
  
  // If we filtered out too many questions, try to fetch from database
  if (filtered.length < PACK_SIZE) {
    console.log(`Filtered pack has only ${filtered.length} questions, fetching from database...`);
    const dbQuestions = await fetchUnusedQuestions(PACK_SIZE - filtered.length);
    filtered.push(...dbQuestions);
  }
  
  // Save new questions to database
  for (const q of filtered) {
    if (!q._saved) {
      await saveQuestionToDatabase(q, source);
    }
  }
  
  return filtered.slice(0, PACK_SIZE);
}

async function saveQuestionToDatabase(question, source, gameId = null) {
  try {
    const normalized = normalizeQuestion(question);
    const tier = question.difficulty || TIERS[Math.floor(Math.random() * TIERS.length)];
    
    const quizQuestion = new QuizQuestion({
      hash: normalized.hash,
      text: normalized.text,
      normalizedText: normalized.normalizedText,
      answers: normalized.answers,
      correctIndex: normalized.correctIndex,
      difficulty: tier,
      points: TIER_POINTS[tier] || 200,
      category: question.category || 'autre',
      source: source,
      usedCount: 1,
      usedByGames: gameId ? [gameId] : [],
      lastUsedAt: new Date()
    });
    
    await quizQuestion.save();
    question._saved = true;
    console.log(`Saved question to database: ${question.question}`);
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error - question already exists
      console.log(`Question already exists in database: ${question.question}`);
    } else {
      console.error('Error saving question to database:', error.message);
    }
  }
}

async function fetchUnusedQuestions(count) {
  try {
    // Fetch questions with lowest usage count
    const questions = await QuizQuestion.find({ isDuplicate: false })
      .sort({ usedCount: 1, lastUsedAt: 1 })
      .limit(count * 3) // Fetch triple to filter out non-French questions
      .lean();

    // Filter out non-French questions
    const frenchQuestions = questions.filter(q => isFrenchQuestion({
      question: q.text,
      answers: q.answers
    }));

    // Log how many English questions were filtered
    const englishCount = questions.length - frenchQuestions.length;
    if (englishCount > 0) {
      console.log(`Database: Filtered out ${englishCount} English questions`);
    }

    // Take only the requested count
    const selectedQuestions = frenchQuestions.slice(0, count);

    // Marque l'utilisation pour ne jamais resservir les mêmes questions
    // en boucle : elles repartent en fin de file (usedCount + lastUsedAt).
    if (selectedQuestions.length > 0) {
      await QuizQuestion.updateMany(
        { _id: { $in: selectedQuestions.map(q => q._id) } },
        { $inc: { usedCount: 1 }, $set: { lastUsedAt: new Date() } }
      );
    }

    return selectedQuestions.map(q => ({
      id: q._id.toString(),
      question: q.text,
      answers: q.answers,
      correctIndex: q.correctIndex,
      difficulty: q.difficulty,
      points: q.points,
      _saved: true
    }));
  } catch (error) {
    console.error('Error fetching unused questions:', error.message);
    return [];
  }
}

// Mémoire des questions de secours récemment servies (FIFO) : même si l'IA,
// la base et OpenTDB sont tous indisponibles, deux parties de suite ne
// retombent jamais sur les mêmes questions de la banque locale.
const recentFallbackQuestions = [];

async function fallbackPack() {
  // Clean up English questions from database (one-time cleanup)
  try {
    await cleanupEnglishQuestions();
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }

  // Try to fetch from database first
  try {
    const dbQuestions = await fetchUnusedQuestions(PACK_SIZE);
    if (dbQuestions.length >= PACK_SIZE) {
      console.log('Using questions from database');
      return dbQuestions.slice(0, PACK_SIZE);
    }
  } catch (error) {
    console.error('Error fetching from database:', error.message);
  }
  
  // Final fallback to local bank
  console.log('Using local fallback bank');
  const pack = [];
  let id = 1;
  for (const tier of TIERS) {
    const bank = FALLBACK_BANK[tier];
    if (!bank || bank.length === 0) continue; // 'expert' n'a pas de banque locale
    // On évite les questions servies très récemment (les banques ont 30+ entrées
    // par niveau, donc plusieurs parties sans répétition avant réinitialisation).
    const recentlyUsed = new Set(recentFallbackQuestions);
    let candidates = bank.filter(q => !recentlyUsed.has(q.question));
    if (candidates.length < 5) {
      recentFallbackQuestions.length = 0; // banque épuisée : on repart du début
      candidates = bank;
    }
    const pool = shuffleIndices(candidates.length)
      .slice(0, 5)
      .map(i => candidates[i]);
    for (const q of pool) {
      recentFallbackQuestions.push(q.question);
      pack.push({ id: `q${id++}`, ...q, difficulty: tier, points: TIER_POINTS[tier] });
    }
  }
  if (recentFallbackQuestions.length > 80) recentFallbackQuestions.splice(0, recentFallbackQuestions.length - 80);
  return pack;
}

// ══════════════════════════════════════
// VIE DE LA PARTIE
// ══════════════════════════════════════

function createQuizGame(p1, p2, io) {
  // Accepte aussi un tableau de joueurs (quiz multijoueur 2 à 8 joueurs)
  const players = Array.isArray(p1) ? [...p1] : [p1, p2];
  const game = {
    id: createGameId(), type: 'quiz',
    players,
    scores: {},
    correctCount: {},
    state: 'waiting',          // waiting | playing | finished
    quizStatus: 'generating',  // generating | ready
    quizError: null,
    questions: [],             // pack partagé (avec correctIndex, côté serveur uniquement)
    order: {},
    progress: {},              // nb de questions répondues par joueur
    pstate: {},                // idle | question | feedback | done
    deadline: {},
    lastResult: {},
    winner: null,
    createdBy: players[0],
    _timers: {},
  };
  for (const p of players) {
    game.scores[p] = 0;
    game.correctCount[p] = 0;
    game.order[p] = [];
    game.progress[p] = 0;
    game.pstate[p] = 'idle';
    game.deadline[p] = null;
    game.lastResult[p] = null;
  }

  // Génération UNE seule fois, en arrière-plan. Le jeu est créé immédiatement
  // (la carte d'invitation s'affiche), puis le pack arrive quand il est prêt.
  generateQuizPack()
    .then(pack => onPackReady(game, io, pack))
    .catch(async (err) => {
      console.error('🧠 Génération IA indisponible, pack de secours :', err.message);
      const fallback = await fallbackPack();
      onPackReady(game, io, fallback);
    });

  return game;
}

function onPackReady(game, io, pack) {
  game.questions = pack;
  game.quizStatus = 'ready';
  // Chaque joueur reçoit le MÊME pack, mais dans un ordre mélangé qui lui est propre
  for (const p of game.players) game.order[p] = shuffleIndices(pack.length);
  console.log(`🧠 Quiz prêt : ${pack.length} questions pour ${game.players.length} joueur(s)`);
  emitQuizState(io, game);
  if (game.state === 'playing') startQuiz(game, io);
}

function quizAccept(game, io) {
  if (game.quizStatus === 'ready') startQuiz(game, io);
  else emitQuizState(io, game);
}

function startQuiz(game, io) {
  for (const p of game.players) startPlayerQuestion(game, p, io);
}

function startPlayerQuestion(game, userId, io) {
  if (game.state !== 'playing' || game.quizStatus !== 'ready') return;
  if (game.pstate[userId] !== 'idle') return;
  if (game.progress[userId] >= game.questions.length) {
    game.pstate[userId] = 'done';
    emitQuizState(io, game);
    maybeFinish(game, io);
    return;
  }
  game.pstate[userId] = 'question';
  game.deadline[userId] = Date.now() + QUESTION_TIME_MS;
  emitQuizState(io, game);
  schedule(game, userId, io, QUESTION_TIME_MS, () => onQuestionTimeout(game, userId, io));
}

function quizAnswer(game, userId, answerIndex, io) {
  if (game.state !== 'playing' || game.quizStatus !== 'ready') return;
  if (game.pstate[userId] !== 'question') return;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return;

  const qIndex = game.order[userId][game.progress[userId]];
  const q = game.questions[qIndex];
  const correct = answerIndex === q.correctIndex;
  if (correct) {
    game.scores[userId] += q.points;
    game.correctCount[userId]++;
  }
  game.lastResult[userId] = {
    qIndex,
    answerIndex,
    correct,
    points: correct ? q.points : 0,
    timedOut: false,
    correctIndex: q.correctIndex,
  };
  game.progress[userId]++;
  game.pstate[userId] = 'feedback';
  emitQuizState(io, game);
  schedule(game, userId, io, FEEDBACK_TIME_MS, () => quizNext(game, userId, io));
}

function onQuestionTimeout(game, userId, io) {
  if (game.pstate[userId] !== 'question') return;
  const qIndex = game.order[userId][game.progress[userId]];
  const q = game.questions[qIndex];
  game.lastResult[userId] = {
    qIndex,
    answerIndex: -1,
    correct: false,
    points: 0,
    timedOut: true,
    correctIndex: q.correctIndex,
  };
  game.progress[userId]++;
  game.pstate[userId] = 'feedback';
  emitQuizState(io, game);
  schedule(game, userId, io, FEEDBACK_TIME_MS, () => quizNext(game, userId, io));
}

function quizNext(game, userId, io) {
  // Garde anti double-tap / double timer : on n'avance que depuis 'feedback'
  if (game.pstate[userId] !== 'feedback') return;
  clearTimeout(game._timers[userId]);
  game.lastResult[userId] = null;
  if (game.progress[userId] >= game.questions.length) {
    game.pstate[userId] = 'done';
    emitQuizState(io, game);
    maybeFinish(game, io);
    return;
  }
  // startPlayerQuestion exige 'idle' : on repasse par là depuis le feedback
  game.pstate[userId] = 'idle';
  startPlayerQuestion(game, userId, io);
}

function maybeFinish(game, io) {
  if (game.state !== 'playing') return;
  if (!game.players.every(p => game.pstate[p] === 'done')) return;
  game.state = 'finished';
  clearQuizTimers(game);
  let best = null, bestScore = -1, tie = false;
  for (const p of game.players) {
    const s = game.scores[p] || 0;
    if (s > bestScore) { best = p; bestScore = s; tie = false; }
    else if (s === bestScore) { tie = true; }
  }
  game.winner = tie ? 'draw' : best;
  console.log(`🧠 Quiz terminé : ${game.winner}`);
  emitQuizState(io, game);
}

async function quizRematch(game, io) {
  clearQuizTimers(game);
  game.state = 'playing';
  game.winner = null;
  game.quizStatus = 'generating';
  game.quizError = null;
  for (const p of game.players) {
    game.scores[p] = 0;
    game.correctCount[p] = 0;
    game.progress[p] = 0;
    game.pstate[p] = 'idle';
    game.deadline[p] = null;
    game.lastResult[p] = null;
    game.order[p] = [];
  }
  emitQuizState(io, game);
  
  // Generate new questions for rematch to avoid repetition
  generateQuizPack()
    .then(pack => onPackReady(game, io, pack))
    .catch(async (err) => {
      console.error('🧠 Génération IA indisponible pour revanche, pack de secours :', err.message);
      const fallback = await fallbackPack();
      onPackReady(game, io, fallback);
    });
}

function schedule(game, userId, io, ms, fn) {
  if (game._timers[userId]) clearTimeout(game._timers[userId]);
  game._timers[userId] = setTimeout(fn, ms);
}

function clearQuizTimers(game) {
  for (const k of Object.keys(game._timers || {})) {
    clearTimeout(game._timers[k]);
  }
  game._timers = {};
}

// ══════════════════════════════════════
// VUE PAR JOUEUR — ne fuite JAMAIS les réponses
// ══════════════════════════════════════

function buildQuizView(game, viewer) {
  const pack = (game.questions || []).map(q => ({
    id: q.id,
    question: q.question,
    answers: q.answers,
    difficulty: q.difficulty,
    points: q.points,
    // correctIndex délibérément omis
  }));
  const opponents = game.players
    .filter(p => p !== viewer)
    .map(p => ({ id: p, progress: game.progress[p] || 0, score: game.scores[p] || 0 }));
  return {
    id: game.id,
    type: 'quiz',
    players: game.players,
    scores: game.scores,
    correctCount: game.correctCount,
    state: game.state,
    quizStatus: game.quizStatus,
    quizError: game.quizError,
    questions: pack,
    order: game.order[viewer] || [],
    progress: game.progress[viewer],
    pstate: game.pstate[viewer],
    deadline: game.deadline[viewer],
    lastResult: game.lastResult[viewer],
    // Rétrocompat duo + liste complète pour le multijoueur
    opponent: { progress: game.progress[opponents[0]?.id] || 0 },
    opponents,
    // true quand la partie vient de la page Jeux (quiz multijoueur)
    multiplayer: !!game.multiplayer,
    winner: game.winner,
    createdBy: game.createdBy,
  };
}

function emitQuizState(io, game) {
  if (!game || !io) return;
  for (const p of game.players) {
    io.to(`user:${p}`).emit('game-state', { game: buildQuizView(game, p) });
  }
}

module.exports = {
  createQuizGame,
  quizAccept,
  quizAnswer,
  quizNext,
  quizRematch,
  buildQuizView,
  emitQuizState,
  clearQuizTimers,
  generateQuizPack,
  // Exposés pour les tests
  FALLBACK_BANK,
  TIERS,
  fallbackPack,
};