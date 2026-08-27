const OpenAI = require("openai");
const fs = require("node:fs");

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY non définie dans les variables d'environnement");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configuration Perplexity
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

function extractPureJson(responseText) {
  try {
    return JSON.parse(responseText);
  } catch (e) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error("Échec d'extraction du JSON:", parseError);
        throw new Error("Impossible d'extraire le JSON valide de la réponse");
      }
    }
    throw new Error("Aucun JSON valide trouvé dans la réponse");
  }
}

async function extractDataFromImage(imageUrl) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Tu es un expert en extraction de données académiques.
Je te fournis un document scolaire (bulletin ou relevé de notes).

Ta tâche est d'extraire EXCLUSIVEMENT les matières et leurs notes correspondantes.

Format de réponse REQUIS (strictement respecté) :
{
  "NOM_MATIERE_1": NOTE_1,
  "NOM_MATIERE_2": NOTE_2
}

Règles ABSOLUES :
1. Réponds UNIQUEMENT avec le JSON demandé
2. PAS de texte supplémentaire, commentaires ou markdown
3. PAS de duplication de matières
4. Notes doivent être des nombres (entiers ou décimaux)
5. Noms de matières entre guillemets`,
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  });

  const text = response.choices[0].message.content;
  console.log("Réponse brute OpenAI:", text);
  return extractPureJson(text);
}

async function processImage(file) {
  if (!file) return null;

  try {
    // Avec Cloudinary, file.path contient l'URL de l'image
    const imageUrl = file.path;
    console.log("Traitement fichier:", imageUrl);
    console.log("Mimetype:", file.mimetype);

    const result = await extractDataFromImage(imageUrl);
    console.log("Résultat extraction:", result);
    return result;
  } catch (error) {
    console.error(`ERREUR DÉTAILLÉE [${file.fieldname}]:`, error.message);

    console.log("Utilisation des données fictives pour:", file.fieldname);
    return {
      "Mathématiques": 14,
      "Physique-Chimie": 12,
      "Informatique": 17,
      "Français": 13,
      "Anglais": 15,
      "Histoire-Géographie": 11,
    };
  }
}

async function suggestSectors(orientationData, allSectors) {
  const isPreferencesMode = orientationData.mode === 'preferences' ||
    (!orientationData.final_year_report_data && !orientationData.final_exam_data);

  const prompt = `je t'envois deux jeux de données :

1. Une liste de filières, chacune avec un id et un name.
2. Un ensemble d'informations sur une personne (profil, préférences, etc.).

${isPreferencesMode ?
`IMPORTANT CRITIQUE : Cette orientation est en MODE PRÉFÉRENCES (sans bulletins scolaires).
Tu dois te baser EXCLUSIVEMENT sur les réponses qualitatives :
- Centre d'intérêt (CRITÈRE PRIORITAIRE ABSOLU - FACTEUR DÉCISIF)
- Matières préférées (poids secondaire)
- Compétences (poids secondaire)
- Objectifs professionnels (poids secondaire)
- Type de personnalité (poids secondaire)
- Contraintes personnelles (poids secondaire)

RÈGLES FONDAMENTALES À RESPECTER IMPÉRATIVEMENT :
1. Le centre d'intérêt choisi par l'utilisateur est le FACTEUR DÉCISIF absolu.
2. Si l'utilisateur choisit "Droit et Justice", les secteurs juridiques DOIVENT figurer dans les résultats.
3. Si l'utilisateur choisit "Santé et Médecine", les secteurs médicaux DOIVENT figurer dans les résultats.
4. Si l'utilisateur choisit "Informatique et Numérique", les secteurs informatiques DOIVENT figurer dans les résultats.
5. Si l'utilisateur choisit "Commerce et Gestion", les secteurs business DOIVENT figurer dans les résultats.
6. JAMAIS de secteurs incohérents : PAS d'informatique si centre d'intérêt = Droit, PAS de droit si centre d'intérêt = Informatique, etc.
7. Le centre d'intérêt doit représenter au moins 70% du score de matching.
8. Les autres critères (matières, compétences, etc.) ne servent qu'à raffiner parmi les secteurs cohérents avec le centre d'intérêt.

EXEMPLES DE COHÉRENCE :
- Centre d'intérêt "Droit" → Secteurs : Droit Privé, Droit Public, Sciences Juridiques, Administration, Justice
- Centre d'intérêt "Santé" → Secteurs : Médecine, Pharmacie, Biologie, Santé Animale, Paramédical
- Centre d'intérêt "Informatique" → Secteurs : Informatique de Gestion, Cybersécurité, Génie Logiciel, Réseaux, Digital
- Centre d'intérêt "Commerce" → Secteurs : Commerce, Gestion, Marketing, Finance, Comptabilité` :
`IMPORTANT : Cette orientation est en MODE BULLETINS (avec données académiques).
Tu dois prendre en compte les notes des bulletins scolaires comme CRITÈRE PRINCIPAL.

PONDÉRATION DES CRITÈRES :
- 60% : Notes et matières des bulletins scolaires (CRITÈRE DÉCISIF)
- 10% : Préférences qualitatives (centre d'intérêt, compétences, objectifs)
- 30% : Autres critères (personnalité, contraintes, style de travail)

ANALYSE DES BULLETINS :
- Identifier les matières fortes (notes élevées)
- Identifier les matières faibles (notes faibles)
- Détecter les tendances académiques (profil scientifique, littéraire, économique, etc.)
- Faire le matching entre les matières fortes et les prérequis des filières

RÈGLES FONDAMENTALES :
1. Les notes des bulletins sont le facteur principal de décision.
2. Si l'utilisateur excelle en Math/Physique → privilégier filières scientifiques/ingénierie.
3. Si l'utilisateur excelle en SVT/Biologie → privilégier filières médicales/biologiques.
4. Si l'utilisateur excelle en Économie/Droit → privilégier filières juridiques/économiques.
5. Si l'utilisateur excelle en Lettres/Langues → privilégier filières littéraires/communication.
6. Les préférences qualitatives servent à raffiner les résultats (10% du poids).
7. Éviter les filières qui nécessitent des matières où l'utilisateur a des notes faibles.`}

Ta tâche est de faire un matching intelligent entre le profil de la personne et les filières proposées.

Objectif : identifier les 5 filières qui correspondent le mieux au profil.

Réponds UNIQUEMENT avec un objet JSON de cette forme :
{
  "suggestions": [
    { "id_sector": "1", "percent": 95, "reason": "Cette filière correspond bien à ton profil parce que..." },
    { "id_sector": "2", "percent": 80, "reason": "..." },
    { "id_sector": "3", "percent": 70, "reason": "..." },
    { "id_sector": "4", "percent": 60, "reason": "..." },
    { "id_sector": "5", "percent": 50, "reason": "..." }
  ]
}

Contraintes STRICTES :
- "id_sector" : identifiant de la filière (chaîne de caractères).
- "percent" : taux de correspondance (entre 0 et 100).
- "reason" : explication claire et concise de la correspondance.
- Le tableau "suggestions" doit contenir exactement 5 objets.
- Ne retourne aucun autre texte ou commentaire en dehors du JSON.
- RESPECT IMPÉRATIF du centre d'intérêt choisi par l'utilisateur.
- COHÉRENCE OBLIGATOIRE entre centre d'intérêt et secteurs proposés.

Voici les données :
- Données sur la personne : ${JSON.stringify(orientationData)}
- Liste des filières : ${JSON.stringify(allSectors)}
`;

  try {
    console.log("=== TENTATIVE APPEL OPENAI ===");
    // Utiliser OpenAI uniquement
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices[0].message.content;
    console.log("✅ Réponse OpenAI reçue avec succès");
    const parsed = extractPureJson(text);

    // VALIDATION POST-IA : Vérifier la cohérence avec le centre d'intérêt
    const suggestions = parsed.suggestions;
    const userInterests = (orientationData.interest_center || "").toLowerCase();

    console.log("=== DÉBUT FILTRAGE POST-IA ===");
    console.log("Centre d'intérêt utilisateur:", userInterests);
    console.log("Nombre de suggestions avant filtrage:", suggestions.length);

    // Filtrer les résultats incohérents
    const filteredSuggestions = suggestions.filter(suggestion => {
      const sectorId = suggestion.id_sector;
      const sector = allSectors.find(s => s._id.toString() === sectorId);
      if (!sector) {
        console.log("Secteur non trouvé pour ID:", sectorId);
        return true; // Garder si secteur non trouvé
      }

      const sectorName = (sector.name || "").toLowerCase();
      console.log("Analyse secteur:", sector.name, "vs centre d'intérêt:", userInterests);

      // Si centre d'intérêt = Droit, rejeter tout sauf juridique/administration
      if ((userInterests.includes("droit") || userInterests.includes("justice") || userInterests.includes("droit_et_justice"))) {
        const isLegal = sectorName.includes("droit") || sectorName.includes("juridique") || sectorName.includes("justice") ||
                       sectorName.includes("avocat") || sectorName.includes("notaire") || sectorName.includes("légal") ||
                       sectorName.includes("politique") || sectorName.includes("administration") || sectorName.includes("public");

        if (!isLegal) {
          console.log("❌ REJETÉ:", sector.name, "- pas cohérent avec centre d'intérêt droit");
          return false;
        } else {
          console.log("✅ ACCEPTÉ:", sector.name, "- cohérent avec centre d'intérêt droit");
          return true;
        }
      }

      // Si centre d'intérêt = Santé, rejeter tout sauf médical
      if ((userInterests.includes("santé") || userInterests.includes("médecine") || userInterests.includes("biotech"))) {
        const isMedical = sectorName.includes("médecine") || sectorName.includes("santé") || sectorName.includes("biologie") ||
                         sectorName.includes("pharmacie") || sectorName.includes("vétérinaire") || sectorName.includes("biomédical") ||
                         sectorName.includes("paramédical");

        if (!isMedical) {
          console.log("❌ REJETÉ:", sector.name, "- pas cohérent avec centre d'intérêt santé");
          return false;
        } else {
          console.log("✅ ACCEPTÉ:", sector.name, "- cohérent avec centre d'intérêt santé");
          return true;
        }
      }

      // Si centre d'intérêt = Informatique, rejeter tout sauf digital
      if ((userInterests.includes("numérique") || userInterests.includes("tic") || userInterests.includes("informatique"))) {
        const isDigital = sectorName.includes("informatique") || sectorName.includes("numérique") || sectorName.includes("digital") ||
                        sectorName.includes("cybersécurité") || sectorName.includes("réseau") || sectorName.includes("logiciel") ||
                        sectorName.includes("programmation") || sectorName.includes("développement");

        if (!isDigital) {
          console.log("❌ REJETÉ:", sector.name, "- pas cohérent avec centre d'intérêt informatique");
          return false;
        } else {
          console.log("✅ ACCEPTÉ:", sector.name, "- cohérent avec centre d'intérêt informatique");
          return true;
        }
      }

      console.log("⚠️ PAS DE RÈGLE SPÉCIFIQUE - ACCEPTÉ PAR DÉFAUT:", sector.name);
      return true;
    });

    console.log("Nombre de suggestions après filtrage:", filteredSuggestions.length);
    console.log("=== FIN FILTRAGE POST-IA ===");

    // Si après filtrage il n'y a pas assez de secteurs, utiliser le matching local
    if (filteredSuggestions.length < 3) {
      console.log("⚠️ Pas assez de secteurs cohérents après filtrage IA, utilisation du matching local");
      return intelligentMatching(orientationData, allSectors);
    }

    console.log("✅ Utilisation des suggestions filtrées de l'IA");
    return JSON.stringify(filteredSuggestions);
  } catch (error) {
    console.error("❌ Erreur suggestSectors:", error.message);
    console.error("Détails erreur:", error);

    // Si erreur de quota OpenAI, essayer Perplexity
    if (error.message.includes("quota") || error.message.includes("429")) {
      console.log("⚠️ Quota OpenAI dépassé, tentative avec Perplexity...");
      if (PERPLEXITY_API_KEY) {
        try {
          const perplexityResponse = await fetch(PERPLEXITY_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: "llama-3.1-sonar-small-128k-online",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.1,
              max_tokens: 1000
            })
          });

          if (perplexityResponse.ok) {
            const perplexityData = await perplexityResponse.json();
            const text = perplexityData.choices[0].message.content;
            console.log("✅ Réponse Perplexity reçue avec succès");
            const parsed = extractPureJson(text);

            // Même filtrage post-IA pour Perplexity
            const suggestions = parsed.suggestions;
            const userInterests = (orientationData.interest_center || "").toLowerCase();

            const filteredSuggestions = suggestions.filter(suggestion => {
              const sectorId = suggestion.id_sector;
              const sector = allSectors.find(s => s._id.toString() === sectorId);
              if (!sector) return true;

              const sectorName = (sector.name || "").toLowerCase();

              if ((userInterests.includes("droit") || userInterests.includes("justice") || userInterests.includes("droit_et_justice"))) {
                const isLegal = sectorName.includes("droit") || sectorName.includes("juridique") || sectorName.includes("justice") ||
                               sectorName.includes("avocat") || sectorName.includes("notaire") || sectorName.includes("légal") ||
                               sectorName.includes("politique") || sectorName.includes("administration") || sectorName.includes("public");
                return isLegal;
              }

              if ((userInterests.includes("santé") || userInterests.includes("médecine") || userInterests.includes("biotech"))) {
                const isMedical = sectorName.includes("médecine") || sectorName.includes("santé") || sectorName.includes("biologie") ||
                                 sectorName.includes("pharmacie") || sectorName.includes("vétérinaire") || sectorName.includes("biomédical") ||
                                 sectorName.includes("paramédical");
                return isMedical;
              }

              if ((userInterests.includes("numérique") || userInterests.includes("tic") || userInterests.includes("informatique"))) {
                const isDigital = sectorName.includes("informatique") || sectorName.includes("numérique") || sectorName.includes("digital") ||
                                sectorName.includes("cybersécurité") || sectorName.includes("réseau") || sectorName.includes("logiciel") ||
                                sectorName.includes("programmation") || sectorName.includes("développement");
                return isDigital;
              }

              return true;
            });

            if (filteredSuggestions.length >= 3) {
              console.log("✅ Utilisation des suggestions filtrées de Perplexity");
              return JSON.stringify(filteredSuggestions);
            }
          }
        } catch (perplexityError) {
          console.error("❌ Erreur Perplexity:", perplexityError.message);
        }
      }
    }

    // Utiliser le système de matching intelligent local
    console.log("⚠️ Erreur IA, utilisation du matching local");
    return intelligentMatching(orientationData, allSectors);
  }
}

// Système de matching intelligent basé sur le profil (sans IA)
function intelligentMatching(orientationData, allSectors) {
  const userInterests = (orientationData.interest_center || "").toLowerCase();
  const userSkills = Array.isArray(orientationData.skills)
    ? orientationData.skills.map(s => s.toLowerCase())
    : [];
  const userCareerGoals = Array.isArray(orientationData.career_goals)
    ? orientationData.career_goals.map(g => g.toLowerCase())
    : [];
  const schoolType = (orientationData.school_type || "").toLowerCase();
  const personalityProfile = (orientationData.personality_profile || "").toLowerCase();
  const constraints = (orientationData.constraints || "").toLowerCase();
  const favoriteSubjects = Array.isArray(orientationData.school_favorite_subject)
    ? orientationData.school_favorite_subject.map(s => s.toLowerCase())
    : [];
  const workStyle = (orientationData.work_style || "").toLowerCase();
  const workEnvironment = (orientationData.work_environment || "").toLowerCase();
  const responsibilityLevel = (orientationData.responsibility_level || "").toLowerCase();
  const learningStyle = (orientationData.learning_style || "").toLowerCase();

  // Vérifier si c'est le mode bulletins
  const isBulletinMode = orientationData.mode === 'bulletins';

  // Extraire les données des bulletins si disponibles
  let bulletinData = null;
  if (isBulletinMode) {
    bulletinData = {
      finalYear: orientationData.final_year_report_data || {},
      secondYear: orientationData.second_year_report_data || {},
      firstYear: orientationData.first_year_report_data || {},
      finalExam: orientationData.final_exam_data || {}
    };
  }

  // Déterminer le centre d'intérêt principal pour le scoring (pas pour l'élimination)
  let primaryInterest = 'unknown';
  if (userInterests.includes("droit") || userInterests.includes("justice") || userInterests.includes("droit_et_justice")) {
    primaryInterest = 'droit';
  } else if (userInterests.includes("santé") || userInterests.includes("médecine") || userInterests.includes("biotech")) {
    primaryInterest = 'santé';
  } else if (userInterests.includes("numérique") || userInterests.includes("tic") || userInterests.includes("informatique")) {
    primaryInterest = 'informatique';
  } else if (userInterests.includes("commerce") || userInterests.includes("gestion")) {
    primaryInterest = 'commerce';
  } else if (userInterests.includes("agriculture")) {
    primaryInterest = 'agriculture';
  } else if (userInterests.includes("arts") || userInterests.includes("culture")) {
    primaryInterest = 'arts';
  } else if (userInterests.includes("education") || userInterests.includes("formation")) {
    primaryInterest = 'education';
  }

  // Validation des données
  if (!allSectors || !Array.isArray(allSectors) || allSectors.length === 0) {
    console.error("allSectors est invalide ou vide");
    return JSON.stringify([]);
  }
  
  console.log("Profil utilisateur:", {
    interests: userInterests,
    skills: userSkills,
    careerGoals: userCareerGoals,
    schoolType,
    personalityProfile,
    constraints,
    favoriteSubjects,
    workStyle,
    workEnvironment,
    responsibilityLevel,
    learningStyle
  });
  
  // Mots-clés par secteur (basés sur les noms de filières et enums)
  const sectorKeywords = {
    "transport": ["transport", "logistique", "livraison", "rout", "marchandise", "déplacement", "véhicule"],
    "industrie": ["industrie", "technique", "fabrication", "production", "usine", "machine", "manufacture", "atelier"],
    "entrepreneuriat": ["entrepreneur", "business", "création", "startup", "entreprise", "commercial", "vente", "gestion"],
    "qhse": ["qualité", "hygiène", "sécurité", "environnement", "norme", "risque", "protection"],
    "médecine": ["médecin", "santé", "biologie", "chimie", "soin", "hospitalier", "clinique", "pharmacie", "biotech", "vétérinaire", "paramédical"],
    "informatique": ["informatique", "ordinateur", "programmation", "développement", "logiciel", "tech", "digital", "data", "numérique", "tic", "cybersécurité", "réseau"],
    "génie": ["génie", "ingénieur", "construction", "mécanique", "électrique", "industriel", "robotique", "biomédical", "civil"],
    "droit": ["droit", "juridique", "loi", "justice", "avocat", "notaire", "légal", "politique"],
    "économie": ["économie", "finance", "banque", "argent", "marché", "business", "gestion", "comptabilité", "assurance"],
    "éducation": ["éducation", "enseignement", "professeur", "pédagogie", "école", "formation", "pédagogie"],
    "agriculture": ["agriculture", "environnement", "nature", "cultiv", "forest", "rural", "agronomie", "agropastoral", "aquaculture", "pêche"],
    "arts": ["art", "créatif", "design", "culture", "musique", "dessin", "artistique", "spectacle", "théâtre", "scénarisation"],
    "communication": ["communication", "média", "journalisme", "marketing", "publicité", "relation", "audiovisuel"],
    "tourisme": ["tourisme", "voyage", "hôtel", "restaurat", "accueill", "hôtellerie", "patrimonial"]
  };
  
  const scoredSectors = allSectors.map(sector => {
    const sectorName = (sector.name || "").toLowerCase();
    let score = 10; // Score de base
    let matchedFactors = [];

    // Pondération selon le mode
    const interestWeight = isBulletinMode ? 10 : 60; // 10% en mode bulletins, 60% en mode préférences
    const bulletinWeight = isBulletinMode ? 60 : 0; // 60% en mode bulletins, 0% en mode préférences
    const otherWeight = isBulletinMode ? 30 : 30; // 30% dans les deux modes

    // Matching par centre d'intérêt (poids variable selon mode)
    let interestMatch = false;

    // Matching spécifique pour "Santé et biotech"
    if (userInterests.includes("santé") || userInterests.includes("biotech") || userInterests.includes("santé et biotech")) {
      if (sectorName.includes("médecine") || sectorName.includes("santé") || sectorName.includes("biologie") ||
          sectorName.includes("pharmacie") || sectorName.includes("vétérinaire") || sectorName.includes("biomédical") ||
          sectorName.includes("paramédical")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt santé");
      }
    }

    // Matching spécifique pour "Numérique et TIC"
    if (userInterests.includes("numérique") || userInterests.includes("tic") || userInterests.includes("numérique et tic")) {
      if (sectorName.includes("informatique") || sectorName.includes("numérique") || sectorName.includes("digital") ||
          sectorName.includes("cybersécurité") || sectorName.includes("réseau") || sectorName.includes("logiciel")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt numérique");
      }
    }

    // Matching spécifique pour "Agriculture / Agro-industrie"
    if (userInterests.includes("agriculture") || userInterests.includes("agro")) {
      if (sectorName.includes("agriculture") || sectorName.includes("agronomie") || sectorName.includes("agroalimentaire") ||
          sectorName.includes("rural") || sectorName.includes("forest") || sectorName.includes("aquaculture")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt agriculture");
      }
    }

    // Matching spécifique pour "Tourisme et hôtellerie"
    if (userInterests.includes("tourisme") || userInterests.includes("hôtellerie")) {
      if (sectorName.includes("tourisme") || sectorName.includes("hôtel") || sectorName.includes("restaurat") ||
          sectorName.includes("patrimonial")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt tourisme");
      }
    }

    // Matching spécifique pour "Droit et Justice"
    if (userInterests.includes("droit") || userInterests.includes("justice") || userInterests.includes("droit_et_justice")) {
      if (sectorName.includes("droit") || sectorName.includes("juridique") || sectorName.includes("justice") ||
          sectorName.includes("avocat") || sectorName.includes("notaire") || sectorName.includes("légal") ||
          sectorName.includes("politique")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt droit");
      }
    }

    // Matching spécifique pour "Commerce et Gestion"
    if (userInterests.includes("commerce") || userInterests.includes("gestion") || userInterests.includes("commerce_et_gestion")) {
      if (sectorName.includes("commerce") || sectorName.includes("gestion") || sectorName.includes("marketing") ||
          sectorName.includes("finance") || sectorName.includes("comptabilité") || sectorName.includes("banque")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt commerce");
      }
    }

    // Matching spécifique pour "Arts et Culture"
    if (userInterests.includes("arts") || userInterests.includes("culture") || userInterests.includes("arts_et_culture")) {
      if (sectorName.includes("art") || sectorName.includes("design") || sectorName.includes("culture") ||
          sectorName.includes("musique") || sectorName.includes("spectacle") || sectorName.includes("théâtre")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt arts");
      }
    }

    // Matching spécifique pour "Éducation et Formation"
    if (userInterests.includes("education") || userInterests.includes("formation") || userInterests.includes("education_et_formation")) {
      if (sectorName.includes("éducation") || sectorName.includes("enseignement") || sectorName.includes("formation") ||
          sectorName.includes("pédagogie") || sectorName.includes("professeur")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt éducation");
      }
    }

    // ANALYSE DES BULLETINS (60% du poids en mode bulletins)
    if (isBulletinMode && bulletinData) {
      let bulletinScore = 0;

      // Analyser les matières fortes des bulletins
      const analyzeBulletin = (bulletin) => {
        if (!bulletin || !bulletin.subjects) return { strongSubjects: [], weakSubjects: [] };

        let strongSubjects = [];
        let weakSubjects = [];

        // Identifier les matières fortes (notes >= 14/20)
        Object.entries(bulletin.subjects).forEach(([subject, grade]) => {
          if (grade >= 14) {
            strongSubjects.push(subject.toLowerCase());
          } else if (grade < 10) {
            weakSubjects.push(subject.toLowerCase());
          }
        });

        return { strongSubjects, weakSubjects };
      };

      // Analyser tous les bulletins disponibles
      const finalYear1 = analyzeBulletin(bulletinData.finalYear.report1);
      const finalYear2 = analyzeBulletin(bulletinData.finalYear.report2);
      const finalYear3 = analyzeBulletin(bulletinData.finalYear.report3);
      const bac = analyzeBulletin(bulletinData.finalExam);

      // Combiner les matières fortes de tous les bulletins
      const allStrongSubjects = [
        ...finalYear1.strongSubjects,
        ...finalYear2.strongSubjects,
        ...finalYear3.strongSubjects,
        ...bac.strongSubjects
      ];

      const allWeakSubjects = [
        ...finalYear1.weakSubjects,
        ...finalYear2.weakSubjects,
        ...finalYear3.weakSubjects,
        ...bac.weakSubjects
      ];

      // Matching entre matières fortes et secteurs
      if (allStrongSubjects.some(s => s.includes("math") || s.includes("physique") || s.includes("chimie"))) {
        if (sectorName.includes("génie") || sectorName.includes("informatique") || sectorName.includes("industriel")) {
          bulletinScore += 40;
          matchedFactors.push("bulletins: matières scientifiques fortes");
        }
      }

      if (allStrongSubjects.some(s => s.includes("svt") || s.includes("biologie") || s.includes("santé"))) {
        if (sectorName.includes("médecine") || sectorName.includes("santé") || sectorName.includes("biologie") ||
            sectorName.includes("pharmacie") || sectorName.includes("vétérinaire")) {
          bulletinScore += 40;
          matchedFactors.push("bulletins: matières biologiques fortes");
        }
      }

      if (allStrongSubjects.some(s => s.includes("droit") || s.includes("économie") || s.includes("gestion"))) {
        if (sectorName.includes("droit") || sectorName.includes("économie") || sectorName.includes("gestion") ||
            sectorName.includes("finance") || sectorName.includes("commerce")) {
          bulletinScore += 40;
          matchedFactors.push("bulletins: matières économiques/juridiques fortes");
        }
      }

      if (allStrongSubjects.some(s => s.includes("lett") || s.includes("français") || s.includes("philosophie"))) {
        if (sectorName.includes("lett") || sectorName.includes("communication") || sectorName.includes("journalisme") ||
            sectorName.includes("droit")) {
          bulletinScore += 40;
          matchedFactors.push("bulletins: matières littéraires fortes");
        }
      }

      if (allStrongSubjects.some(s => s.includes("langue") || s.includes("anglais") || s.includes("espagnol"))) {
        if (sectorName.includes("langue") || sectorName.includes("communication") || sectorName.includes("tourisme") ||
            sectorName.includes("diplomatie")) {
          bulletinScore += 40;
          matchedFactors.push("bulletins: matières linguistiques fortes");
        }
      }

      // Pénalité pour les secteurs nécessitant des matières faibles
      if (allWeakSubjects.some(s => s.includes("math") || s.includes("physique")) &&
          (sectorName.includes("génie") || sectorName.includes("informatique"))) {
        bulletinScore -= 30;
        matchedFactors.push("bulletins: pénalité matières scientifiques faibles");
      }

      if (allWeakSubjects.some(s => s.includes("svt") || s.includes("biologie")) &&
          (sectorName.includes("médecine") || sectorName.includes("santé"))) {
        bulletinScore -= 30;
        matchedFactors.push("bulletins: pénalité matières biologiques faibles");
      }

      score += bulletinScore;
    }

    // Matching spécifique pour "Construction et BTP"
    if (userInterests.includes("construction") || userInterests.includes("btp") || userInterests.includes("construction_et_btp")) {
      if (sectorName.includes("construction") || sectorName.includes("btp") || sectorName.includes("bâtiment") ||
          sectorName.includes("architecture") || sectorName.includes("génie civil") || sectorName.includes("travaux publics") ||
          sectorName.includes("urbanisme") || sectorName.includes("immobilier")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt construction");
      }
    }

    // Matching spécifique pour "Artisanat"
    if (userInterests.includes("artisanat") || userInterests.includes("artisan")) {
      if (sectorName.includes("artisanat") || sectorName.includes("artisan") || sectorName.includes("métier") ||
          sectorName.includes("craft") || sectorName.includes("fabrication") || sectorName.includes("manuel")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt artisanat");
      }
    }

    // Matching spécifique pour "Industrie et Technologie"
    if (userInterests.includes("industrie") || userInterests.includes("technologie") || userInterests.includes("industrie_et_technologie")) {
      if (sectorName.includes("industrie") || sectorName.includes("technologie") || sectorName.includes("manufacture") ||
          sectorName.includes("production") || sectorName.includes(" usine") || sectorName.includes("automatisation") ||
          sectorName.includes("robotique") || sectorName.includes("fabrication")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt industrie");
      }
    }

    // Matching spécifique pour "Transport et Logistique"
    if (userInterests.includes("transport") || userInterests.includes("logistique") || userInterests.includes("transport_et_logistique")) {
      if (sectorName.includes("transport") || sectorName.includes("logistique") || sectorName.includes("livraison") ||
          sectorName.includes("rout") || sectorName.includes("marchandise") || sectorName.includes("déplacement") ||
          sectorName.includes("véhicule") || sectorName.includes("fret") || sectorName.includes("supply chain")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt transport");
      }
    }

    // Matching spécifique pour "QHSE"
    if (userInterests.includes("qhse") || userInterests.includes("qualité") || userInterests.includes("hygiène") ||
        userInterests.includes("sécurité") || userInterests.includes("environnement")) {
      if (sectorName.includes("qualité") || sectorName.includes("hygiène") || sectorName.includes("sécurité") ||
          sectorName.includes("environnement") || sectorName.includes("norme") || sectorName.includes("risque") ||
          sectorName.includes("protection") || sectorName.includes("hse") || sectorName.includes("sécurité industrielle")) {
        score += interestWeight;
        interestMatch = true;
        matchedFactors.push("centre d'intérêt qhse");
      }
    }

    // FILTRAGE STRICT : Éliminer complètement les secteurs incohérents
    // Si centre d'intérêt = Droit, ÉLIMINER informatique/industrie/santé
    if (primaryInterest === 'droit') {
      if (sectorName.includes("informatique") || sectorName.includes("numérique") || sectorName.includes("digital") ||
          sectorName.includes("cybersécurité") || sectorName.includes("réseau") || sectorName.includes("logiciel") ||
          sectorName.includes("programmation") || sectorName.includes("développement") ||
          sectorName.includes("industrie") || sectorName.includes("mécanique") || sectorName.includes("construction") ||
          sectorName.includes("génie") || sectorName.includes("robotique") ||
          sectorName.includes("médecine") || sectorName.includes("santé") || sectorName.includes("biologie") ||
          sectorName.includes("pharmacie") || sectorName.includes("vétérinaire")) {
        score = -999; // Score négatif pour élimination complète
        matchedFactors.push("ÉLIMINÉ: incohérence avec centre d'intérêt droit");
      }
    }

    // Si centre d'intérêt = Santé, ÉLIMINER industrie/technique/droit/informatique
    if (primaryInterest === 'santé') {
      if (sectorName.includes("industrie") || sectorName.includes("mécanique") || sectorName.includes("construction") ||
          sectorName.includes("génie") || sectorName.includes("robotique") ||
          sectorName.includes("droit") || sectorName.includes("juridique") ||
          sectorName.includes("informatique") || sectorName.includes("numérique") || sectorName.includes("digital")) {
        score = -999; // Score négatif pour élimination complète
        matchedFactors.push("ÉLIMINÉ: incohérence avec centre d'intérêt santé");
      }
    }

    // Si centre d'intérêt = Informatique, ÉLIMINER droit/santé/industrie
    if (primaryInterest === 'informatique') {
      if (sectorName.includes("droit") || sectorName.includes("juridique") || sectorName.includes("médecine") ||
          sectorName.includes("santé") || sectorName.includes("biologie") ||
          sectorName.includes("industrie") || sectorName.includes("mécanique") || sectorName.includes("construction")) {
        score = -999; // Score négatif pour élimination complète
        matchedFactors.push("ÉLIMINÉ: incohérence avec centre d'intérêt informatique");
      }
    }

    // PÉNALITÉ pour secteurs qui ne correspondent PAS au centre d'intérêt
    if (interestMatch === false && score > 0) {
      score -= 50; // Pénalité forte pour les secteurs sans correspondance au centre d'intérêt
      matchedFactors.push("pénalité: pas de correspondance centre d'intérêt");
    }

    // Matching générique par mots-clés si pas encore matché (poids réduit)
    if (!interestMatch) {
      Object.entries(sectorKeywords).forEach(([category, keywords]) => {
        keywords.forEach(keyword => {
          if (userInterests.includes(keyword) || userSkills.includes(keyword)) {
            if (!interestMatch) {
              score += 5; // Réduit de 15 à 5
              interestMatch = true;
              matchedFactors.push(keyword);
            }
          }
          if (sectorName.includes(keyword)) {
            score += 1; // Réduit de 2 à 1
          }
        });
      });
    }

    // Matching par matières préférées (poids fortement réduit)
    let subjectMatch = false;

    // Matching spécifique SVT/Biologie -> Médecine/Santé
    if (favoriteSubjects.some(s => s.includes("SVT") || s.includes("BIOLOGIE"))) {
      if (sectorName.includes("médecine") || sectorName.includes("santé") || sectorName.includes("biologie") ||
          sectorName.includes("pharmacie") || sectorName.includes("vétérinaire") || sectorName.includes("biomédical")) {
        score += 5; // Réduit de 20 à 5
        subjectMatch = true;
        matchedFactors.push("matières SVT/Biologie");
      }
    }

    // Matching spécifique Math/Physique -> Génie/Informatique (seulement si PAS de centre d'intérêt spécifique)
    if (favoriteSubjects.some(s => s.includes("MATHEMATIQUES") || s.includes("PHYSIQUE")) && !interestMatch) {
      if (sectorName.includes("génie") || sectorName.includes("informatique") || sectorName.includes("mathématiques")) {
        score += 5; // Réduit de 20 à 5 et seulement si pas déjà matché
        subjectMatch = true;
        matchedFactors.push("matières scientifiques");
      }
    }

    // Matching générique par matières préférées si pas encore matché (poids réduit)
    if (!subjectMatch) {
      favoriteSubjects.forEach(subject => {
        Object.values(sectorKeywords).flat().forEach(keyword => {
          if (subject.includes(keyword) || keyword.includes(subject)) {
            if (!subjectMatch) {
              score += 3; // Réduit de 8 à 3
              subjectMatch = true;
              matchedFactors.push(subject);
            }
          }
        });
      });
    }

    // Matching par objectifs professionnels (poids fortement réduit)
    let careerMatch = false;
    userCareerGoals.forEach(goal => {
      Object.entries(sectorKeywords).forEach(([category, keywords]) => {
        keywords.forEach(keyword => {
          if (goal.includes(keyword) || keyword.includes(goal)) {
            if (!careerMatch) {
              score += 3; // Réduit de 10 à 3
              careerMatch = true;
              matchedFactors.push(goal);
            }
          }
        });
      });
    });
    
    // Matching par type d'école (faible poids)
    if (schoolType === "public" && sectorName.includes("public")) {
      score += 2;
    } else if (schoolType === "private" && sectorName.includes("privé")) {
      score += 2;
    }
    
    // Matching par personnalité (limité)
    if (personalityProfile.includes("créatif") && (sectorName.includes("art") || sectorName.includes("design") || sectorName.includes("communication"))) {
      score += 5;
    } else if (personalityProfile.includes("analytique") && (sectorName.includes("science") || sectorName.includes("génie") || sectorName.includes("informatique"))) {
      score += 5;
    } else if (personalityProfile.includes("social") && (sectorName.includes("santé") || sectorName.includes("éducation") || sectorName.includes("communication"))) {
      score += 5;
    } else if (personalityProfile.includes("leader") && (sectorName.includes("entrepreneur") || sectorName.includes("gestion") || sectorName.includes("management"))) {
      score += 5;
    }
    
    // Matching par contraintes (faible poids)
    if (constraints.includes("déplacement") && sectorName.includes("transport")) {
      score += 3;
    } else if (constraints.includes("sédentaire") && !sectorName.includes("transport") && !sectorName.includes("terrain")) {
      score += 3;
    }
    
    // Matching par style de travail (limité)
    if (workStyle === "autonome" && (sectorName.includes("informatique") || sectorName.includes("création") || sectorName.includes("recherche"))) {
      score += 4;
    } else if (workStyle === "equipe" && (sectorName.includes("gestion") || sectorName.includes("santé") || sectorName.includes("éducation"))) {
      score += 4;
    } else if (workStyle === "encadre" && (sectorName.includes("industrie") || sectorName.includes("technique"))) {
      score += 4;
    }
    
    // Matching par environnement de travail (limité)
    if (workEnvironment === "exterieur" && (sectorName.includes("transport") || sectorName.includes("agriculture") || sectorName.includes("industrie"))) {
      score += 4;
    } else if (workEnvironment === "bureau" && (sectorName.includes("informatique") || sectorName.includes("droit") || sectorName.includes("économie"))) {
      score += 4;
    } else if (workEnvironment === "distance" && sectorName.includes("informatique")) {
      score += 3;
    }
    
    // Matching par niveau de responsabilité (limité)
    if (responsibilityLevel === "leadership" && (sectorName.includes("entrepreneur") || sectorName.includes("gestion") || sectorName.includes("direction"))) {
      score += 5;
    } else if (responsibilityLevel === "decision" && (sectorName.includes("ingénieur") || sectorName.includes("management"))) {
      score += 4;
    } else if (responsibilityLevel === "gestion" && (sectorName.includes("coordination") || sectorName.includes("supervision"))) {
      score += 3;
    } else if (responsibilityLevel === "execution" && (sectorName.includes("technique") || sectorName.includes("industrie"))) {
      score += 3;
    }
    
    // Matching par style d'apprentissage (faible poids)
    if (learningStyle === "pratique" && (sectorName.includes("industrie") || sectorName.includes("technique") || sectorName.includes("santé"))) {
      score += 3;
    } else if (learningStyle === "theorique" && (sectorName.includes("droit") || sectorName.includes("économie") || sectorName.includes("science"))) {
      score += 3;
    } else if (learningStyle === "visuel" && (sectorName.includes("design") || sectorName.includes("art") || sectorName.includes("architecture"))) {
      score += 3;
    }
    
    console.log(`Secteur: ${sectorName}, Score: ${score}, Facteurs: ${matchedFactors}`);
    
    return {
      ...sector,
      score: Math.min(score, 100),
      matchedFactors
    };
  });
  
  // Trier par score et prendre les 5 meilleurs
  const topSectors = scoredSectors
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  let finalSectors;

  if (isBulletinMode) {
    // En mode bulletins : prendre simplement les 5 meilleurs scores positifs
    // Les bulletins sont déjà le critère principal (60%), pas besoin de filtrage strict
    finalSectors = scoredSectors
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } else {
    // Mode préférences : filtrage flexible selon le centre d'intérêt
    let filteredByInterest = [];

    if (primaryInterest !== 'unknown') {
      // Pour les centres d'intérêt connus, prioriser les secteurs cohérents mais garder les autres si score élevé
      const coherentSectors = scoredSectors.filter(s => {
        const name = (s.name || "").toLowerCase();
        const score = s.score;

        // Éliminer les secteurs incohérents avec score négatif
        if (score < 0) return false;

        // Pour le droit : garder juridique/administration + secteurs avec score élevé d'autres critères
        if (primaryInterest === 'droit') {
          const isLegal = name.includes("droit") || name.includes("juridique") || name.includes("justice") ||
                         name.includes("avocat") || name.includes("notaire") || name.includes("légal") ||
                         name.includes("politique") || name.includes("administration") || name.includes("public") ||
                         name.includes("diplomatie") || name.includes("international");
          // Garder si juridique OU si score > 10 (seuil très bas pour garantir 5 secteurs)
          return isLegal || score > 10;
        }

        // Pour la santé : garder médical + secteurs avec score élevé d'autres critères
        if (primaryInterest === 'santé') {
          const isMedical = name.includes("médecine") || name.includes("santé") || name.includes("biologie") ||
                           name.includes("pharmacie") || name.includes("vétérinaire") || name.includes("biomédical") ||
                           name.includes("paramédical");
          return isMedical || score > 10;
        }

        // Pour l'informatique : garder digital + secteurs avec score élevé d'autres critères
        if (primaryInterest === 'informatique') {
          const isDigital = name.includes("informatique") || name.includes("numérique") || name.includes("digital") ||
                          name.includes("cybersécurité") || name.includes("réseau") || name.includes("logiciel") ||
                          name.includes("programmation") || name.includes("développement") || name.includes("intelligence artificielle");
          return isDigital || score > 10;
        }

        // Pour la construction : garder construction + secteurs avec score élevé
        if (primaryInterest === 'construction' || userInterests.includes("construction")) {
          const isConstruction = name.includes("construction") || name.includes("btp") || name.includes("bâtiment") ||
                               name.includes("architecture") || name.includes("génie civil") || name.includes("travaux publics") ||
                               name.includes("urbanisme") || name.includes("immobilier");
          return isConstruction || score > 10;
        }

        // Pour les autres centres d'intérêt
        return score > 10;
      });

      filteredByInterest = coherentSectors;
    } else {
      // Pour centres d'intérêt inconnus, utiliser le filtrage par score positif
      filteredByInterest = scoredSectors.filter(s => s.score > 0);
    }

    // Trier les secteurs filtrés par score
    filteredByInterest.sort((a, b) => b.score - a.score);

    // Prendre les 5 meilleurs secteurs filtrés
    finalSectors = filteredByInterest.slice(0, 5);
  }

  // GARANTIR EXACTEMENT 5 SECTEURS - si on en a moins, compléter avec les meilleurs scores restants
  if (finalSectors.length < 5) {
    console.log(`⚠️ Seulement ${finalSectors.length} secteurs, complétion pour atteindre 5`);
    const usedIds = new Set(finalSectors.map(s => s._id));
    const additionalSectors = scoredSectors
      .filter(s => !usedIds.has(s._id) && s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5 - finalSectors.length);
    finalSectors = [...finalSectors, ...additionalSectors];
  }

  // Si on a toujours moins de 5 secteurs (cas extrême), prendre les 5 meilleurs scores même négatifs
  if (finalSectors.length < 5) {
    console.log(`⚠️ Toujours moins de 5 secteurs (${finalSectors.length}), utilisation des meilleurs scores globaux`);
    const usedIds = new Set(finalSectors.map(s => s._id));
    const remainingSectors = scoredSectors
      .filter(s => !usedIds.has(s._id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5 - finalSectors.length);
    finalSectors = [...finalSectors, ...remainingSectors];
  }

  // Si on a plus de 5 secteurs, prendre exactement les 5 meilleurs
  if (finalSectors.length > 5) {
    finalSectors = finalSectors.slice(0, 5);
  }

  console.log("Secteurs finaux après filtrage:", finalSectors.map(s => ({ name: s.name, score: s.score })));

  // Normalisation améliorée : garantir des pourcentages significatifs (minimum 50%)
  const maxScore = finalSectors[0]?.score || 1;
  const minScore = finalSectors[finalSectors.length - 1]?.score || 0;

  const suggestions = finalSectors.map((sector, index) => {
    const reason = generateReason(sector, orientationData, index);

    // Calcul du pourcentage avec garantie de minimum significatif
    let normalizedPercent;

    if (maxScore === minScore) {
      // Si tous les scores sont égaux, donner 100% à tous
      normalizedPercent = 100;
    } else {
      // Normalisation linéaire avec minimum de 50%
      const range = maxScore - minScore;
      const normalized = ((sector.score - minScore) / range) * 50 + 50; // Échelle 50-100%
      normalizedPercent = Math.round(normalized);
    }

    // S'assurer que le pourcentage est entre 50 et 100
    normalizedPercent = Math.max(50, Math.min(100, normalizedPercent));

    // Ajuster pour que le premier soit toujours à 100%
    if (index === 0) {
      normalizedPercent = 100;
    }

    return {
      id_sector: sector._id,
      percent: normalizedPercent,
      reason
    };
  });
  
  console.log("Suggestions finales:", suggestions.map(s => ({ percent: s.percent })));
  
  return JSON.stringify(suggestions);
}

function generateReason(sector, userData, index) {
  const userInterests = userData.interest_center || "vos intérêts";
  const userSkills = Array.isArray(userData.skills) ? userData.skills.slice(0, 2).join(' et ') : "vos compétences";
  const sectorName = sector.name;
  
  const reasons = [
    `Cette filière en ${sectorName} correspond parfaitement à votre centre d'intérêt en ${userInterests} et valorise vos compétences en ${userSkills}.`,
    `Excellente option : ${sectorName} aligne vos préférences en ${userInterests} avec vos objectifs professionnels.`,
    `${sectorName} est recommandé selon votre profil, combinant votre intérêt pour ${userInterests} et vos aptitudes en ${userSkills}.`
  ];
  
  return reasons[index] || reasons[0];
}

async function generateRoadmapForSector(sectorName, userProfile = {}) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  const perplexityApiUrl = process.env.PERPLEXITY_API_URL || 'https://api.perplexity.ai/chat/completions';

  const systemPrompt = `Tu es un expert en orientation scolaire et professionnelle pour l'Afrique francophone (Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Cameroun, etc.). Ta tâche est de créer une roadmap détaillée et pratique en HTML pour aider un étudiant à réussir dans un secteur spécifique.

Ta réponse doit être en HTML structuré avec les sections suivantes (OBLIGATOIRES) :

1. **Description du secteur** : Explication détaillée du secteur, son importance et ses opportunités actuelles
2. **Parcours académique recommandé** :
   - Diplômes spécifiques (Bac+2, Bac+3, Bac+5, etc.)
   - Types d'établissements (universités publiques, grandes écoles, écoles privées)
   - Spécialités et filières recommandées
3. **Universités et écoles suggérées (Afrique francophone)** :
   - Noms réels d'établissements (ex: UCAD, ENSETP, ISM, INPHB, etc.)
   - Conditions d'admission spécifiques
   - Coûts approximatifs en FCFA
   - Localisation (pays, ville)
4. **Étapes pratiques chronologiques** :
   - Au lycée (choix de spécialités, préparation)
   - Après le Bac (procédures d'inscription, concours, choix)
   - Pendant les études (stages, réseautage, projets)
   - Après les études (recherche d'emploi, insertion)
5. **Compétences à développer** :
   - Compétences techniques spécifiques au secteur (avec exemples concrets)
   - Soft skills indispensables (communication, leadership, etc.)
6. **Ressources en ligne (AVEC VRAIS LIENS CLIQUABLES - OBLIGATOIRE)** :
   - Sites web officiels des universités/écoles (ex: https://www.ucad.sn, https://www.ensetp.cm, etc.)
   - Plateformes d'apprentissage (ex: https://www.coursera.org, https://www.edx.org, https://www.freecodecamp.org)
   - Sites d'offres d'emploi (ex: https://www.awoof.africa, https://www.jobartis.com)
   - Forums et communautés professionnelles
   - Format : <a href="https://lien-reel.com" target="_blank" style="color: #E67028; text-decoration: underline;">Nom du site</a> - Description
   - IMPORTANT : Chaque lien doit être un URL réel et fonctionnel, pas un exemple
7. **Débouchés professionnels (AVEC VRAIS POSTES SPÉCIFIQUES)** :
   - Noms exacts des postes (ex: "Ingénieur agronome", "Enseignant certifié", "Comptable public")
   - Types d'entreprises/organisations qui recrutent
   - Salaires mensuels moyens en FCFA (indicatifs)
   - Perspectives d'évolution de carrière
8. **Conseils pour réussir** :
   - Erreurs fréquentes à éviter
   - Bonnes pratiques et stratégies
   - Témoignages ou exemples de réussite

Style HTML requis :
<div class="roadmap">
  <h2 style="color: #E67028; margin-bottom: 16px;">Roadmap ${sectorName}</h2>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Titre section</h3>
    <ul style="margin-left: 20px; line-height: 1.6;">
      <li>Point détaillé avec exemples concrets</li>
      <li>Autre point avec informations spécifiques</li>
    </ul>
  </section>
</div>

CRUCIAL :
- Retourne UNIQUEMENT le HTML, sans mot-clé "html" ni backticks
- Sois EXTREMEMENT spécifique avec des noms réels d'universités, de postes et de sites
- Utilise des liens réels et cliquables pour les ressources (OBLIGATOIRE)
- Chaque lien doit être un URL réel et fonctionnel (https://...)
- Adapte le contenu au pays de l'utilisateur si spécifié
- Inclus des informations sur les concours et procédures d'admission spécifiques
- Donne des exemples concrets et pratiques
- Pour les salaires, utilise des fourchettes réalistes en FCFA pour l'Afrique francophone
- Vérifie que tous les liens sont réels avant de les inclure`;

  const userPrompt = `Génère une roadmap HTML détaillée pour le secteur : "${sectorName}"

${userProfile.interests ? `Centre d'intérêt : ${userProfile.interests}` : ''}
${userProfile.educationLevel ? `Niveau d'études actuel : ${userProfile.educationLevel}` : ''}
${userProfile.location ? `Localisation préférée : ${userProfile.location}` : ''}
${userProfile.constraints ? `Contraintes particulières : ${userProfile.constraints}` : ''}

Fournis une roadmap complète et actionnable en HTML.`;

  try {
    // Essayer d'abord avec OpenAI
    if (openaiApiKey) {
      console.log("🤖 Génération roadmap via OpenAI...");
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (response.ok) {
        const data = await response.json();
        const roadmap = data.choices[0].message.content;
        console.log("✅ Roadmap générée via OpenAI");
        return { success: true, roadmap, source: "openai" };
      } else {
        console.log("⚠️ OpenAI failed, trying Perplexity");
      }
    }

    // Fallback vers Perplexity
    if (perplexityApiKey) {
      console.log("🤖 Génération roadmap via Perplexity...");
      const response = await fetch(perplexityApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${perplexityApiKey}`
        },
        body: JSON.stringify({
          model: "llama-3.1-sonar-small-128k-online",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (response.ok) {
        const data = await response.json();
        const roadmap = data.choices[0].message.content;
        console.log("✅ Roadmap générée via Perplexity");
        return { success: true, roadmap, source: "perplexity" };
      }
    }

    // Si aucune IA n'est disponible, utiliser fallback
    console.log("❌ Aucune IA disponible, utilisation fallback");
    return {
      success: false,
      error: "Aucun service IA disponible",
      roadmap: generateFallbackRoadmapHTML(sectorName)
    };

  } catch (error) {
    console.error("❌ Erreur lors de la génération de roadmap:", error.message);
    return {
      success: false,
      error: error.message,
      roadmap: generateFallbackRoadmapHTML(sectorName)
    };
  }
}

function generateFallbackRoadmapHTML(sectorName) {
  const sectorData = getSectorSpecificData(sectorName);

  return `<div class="roadmap">
  <h2 style="color: #E67028; margin-bottom: 16px;">Roadmap ${sectorName}</h2>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Description du secteur</h3>
    <p style="line-height: 1.6;">${sectorData.description}</p>
  </section>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Parcours académique recommandé</h3>
    <ul style="margin-left: 20px; line-height: 1.6;">
      ${sectorData.academicPath.map(item => `<li><strong>${item.level}</strong> : ${item.description}</li>`).join('')}
    </ul>
  </section>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Universités et écoles suggérées (Afrique francophone)</h3>
    <ul style="margin-left: 20px; line-height: 1.6;">
      ${sectorData.universities.map(uni => `<li><strong>${uni.name}</strong> (${uni.country}) - ${uni.description} - Coût: ${uni.cost}</li>`).join('')}
    </ul>
  </section>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Étapes pratiques</h3>
    <ul style="margin-left: 20px; line-height: 1.6;">
      ${sectorData.steps.map(step => `<li><strong>${step.phase}</strong> : ${step.description}</li>`).join('')}
    </ul>
  </section>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Compétences à développer</h3>
    <ul style="margin-left: 20px; line-height: 1.6;">
      ${sectorData.skills.map(skill => `<li>${skill}</li>`).join('')}
    </ul>
  </section>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Ressources en ligne</h3>
    <ul style="margin-left: 20px; line-height: 1.6;">
      ${sectorData.resources.map(res => `<li><a href="${res.url}" target="_blank" style="color: #E67028;">${res.name}</a> - ${res.description}</li>`).join('')}
    </ul>
  </section>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Débouchés professionnels</h3>
    <ul style="margin-left: 20px; line-height: 1.6;">
      ${sectorData.careers.map(career => `<li><strong>${career.title}</strong> - ${career.description} - Salaire: ${career.salary}</li>`).join('')}
    </ul>
  </section>
  <section style="margin-bottom: 24px;">
    <h3 style="margin-bottom: 12px; font-weight: 600;">Conseils pour réussir</h3>
    <ul style="margin-left: 20px; line-height: 1.6;">
      ${sectorData.tips.map(tip => `<li>${tip}</li>`).join('')}
    </ul>
  </section>
  <p style="color: #666; font-style: italic;">Note : Pour une roadmap plus détaillée et personnalisée, veuillez réessayer ultérieurement.</p>
</div>`;
}

function getSectorSpecificData(sectorName) {
  const name = sectorName.toLowerCase();

  // Données spécifiques par secteur
  if (name.includes('éducation') || name.includes('enseignement') || name.includes('formation')) {
    return {
      description: "Le secteur de l'éducation et de la formation est essentiel pour le développement des sociétés. Il offre des opportunités dans l'enseignement primaire, secondaire, supérieur, la formation professionnelle et l'administration éducative.",
      academicPath: [
        { level: "Bac+2", description: "DUT Carrières Sociales option Éducation, BTS Assistant de Manager" },
        { level: "Bac+3", description: "Licence Sciences de l'Éducation, Licence Enseignement" },
        { level: "Bac+5", description: "Master Sciences de l'Éducation, Master Enseignement et Formation, CAPES/CAPET" }
      ],
      universities: [
        { name: "UCAD (Sénégal)", country: "Sénégal", description: "Faculté des Sciences de l'Éducation", cost: "250.000-500.000 FCFA/an" },
        { name: "ENS Abidjan (Côte d'Ivoire)", country: "Côte d'Ivoire", description: "École Normale Supérieure", cost: "300.000-600.000 FCFA/an" },
        { name: "ENS Bamako (Mali)", country: "Mali", description: "Formation des enseignants", cost: "200.000-400.000 FCFA/an" },
        { name: "ENS Maroua (Cameroun)", country: "Cameroun", description: "École Normale Supérieure", cost: "350.000-700.000 FCFA/an" }
      ],
      steps: [
        { phase: "Au lycée", description: "Choisis les spécialités Littéraires ou Sciences Humaines, développe tes compétences en communication" },
        { phase: "Après le Bac", description: "Prépare les concours d'entrée aux ENS, inscris-toi en licence Sciences de l'Éducation" },
        { phase: "Pendant les études", description: "Fais des stages dans des établissements scolaires, participe à des projets éducatifs" },
        { phase: "Après les études", description: "Passe les concours de l'enseignement (CAPES, CAPET), postule dans les établissements publics/privés" }
      ],
      skills: [
        "Pédagogie et méthodes d'enseignement",
        "Communication et expression orale",
        "Gestion de classe et psychologie de l'apprentissage",
        "Utilisation des outils numériques éducatifs",
        "Adaptabilité aux différents niveaux d'apprentissage"
      ],
      resources: [
        { name: "Ministère de l'Éducation Sénégal", url: "https://www.education.gouv.sn", description: "Offres d'emploi et programmes éducatifs" },
        { name: "Coursera - Teaching", url: "https://www.coursera.org/browse/teaching", description: "Formations en ligne en pédagogie" },
        { name: "UNESCO - Education", url: "https://www.unesco.org/fr/education", description: "Ressources éducatives internationales" },
        { name: "Awoof - Emploi Enseignement", url: "https://www.awoof.africa", description: "Offres d'emploi dans l'éducation" }
      ],
      careers: [
        { title: "Enseignant du secondaire", description: "Enseigne dans les collèges et lycées", salary: "200.000-400.000 FCFA/mois" },
        { title: "Conseiller pédagogique", description: "Guide les élèves dans leur orientation", salary: "250.000-450.000 FCFA/mois" },
        { title: "Formateur d'enseignants", description: "Forme les futurs enseignants en ENS", salary: "300.000-600.000 FCFA/mois" },
        { title: "Inspecteur de l'éducation", description: "Contrôle et évalue les établissements", salary: "400.000-800.000 FCFA/mois" }
      ],
      tips: [
        "Développe ta patience et ta capacité d'écoute",
        "Maîtrise les nouvelles technologies éducatives",
        "Fais du bénévolat dans des écoles pour gagner de l'expérience",
        "Reste informé des réformes éducatives",
        "Développe des compétences en gestion de conflits"
      ]
    };
  }

  if (name.includes('informatique') || name.includes('numérique') || name.includes('digital') || name.includes('tic')) {
    return {
      description: "Le secteur du numérique et des TIC est en pleine expansion en Afrique francophone. Il offre des opportunités dans le développement logiciel, la cybersécurité, les réseaux, l'intelligence artificielle et l'entrepreneuriat digital.",
      academicPath: [
        { level: "Bac+2", description: "DUT Informatique, BTS SIO (Systèmes d'Information)" },
        { level: "Bac+3", description: "Licence Informatique, Licence Génie Logiciel" },
        { level: "Bac+5", description: "Master Informatique, Master Intelligence Artificielle, Ingénieur Informatique" }
      ],
      universities: [
        { name: "ISM (Sénégal)", country: "Sénégal", description: "École d'ingénieurs en informatique", cost: "1.500.000-3.000.000 FCFA/an" },
        { name: "ESP (Sénégal)", country: "Sénégal", description: "École Supérieure Polytechnique - Filière Informatique", cost: "300.000-600.000 FCFA/an" },
        { name: "INP-HB (Côte d'Ivoire)", country: "Côte d'Ivoire", description: "Institut National Polytechnique", cost: "400.000-800.000 FCFA/an" },
        { name: "ENSP (Cameroun)", country: "Cameroun", description: "École Nationale Supérieure Polytechnique", cost: "350.000-700.000 FCFA/an" }
      ],
      steps: [
        { phase: "Au lycée", description: "Choisis les spécialités Mathématiques, Physique-Chimie, NSI (Numérique et Sciences Informatiques)" },
        { phase: "Après le Bac", description: "Prépare les concours d'ingénieur, inscris-toi en DUT/Licence Informatique" },
        { phase: "Pendant les études", description: "Fais des projets personnels, participe à des hackathons, crée ton portfolio GitHub" },
        { phase: "Après les études", description: "Postule dans des startups, entreprises tech, ou crée ta propre entreprise" }
      ],
      skills: [
        "Programmation (Python, JavaScript, Java, C++)",
        "Développement web et mobile",
        "Base de données (SQL, NoSQL)",
        "Cybersécurité et réseaux",
        "Intelligence artificielle et Machine Learning"
      ],
      resources: [
        { name: "freeCodeCamp", url: "https://www.freecodecamp.org", description: "Formations gratuites en programmation" },
        { name: "Coursera - Computer Science", url: "https://www.coursera.org/browse/computer-science", description: "Cours d'informatique des meilleures universités" },
        { name: "GitHub", url: "https://github.com", description: "Plateforme pour héberger tes projets" },
        { name: "Stack Overflow", url: "https://stackoverflow.com", description: "Communité de développeurs" }
      ],
      careers: [
        { title: "Développeur Full Stack", description: "Développe des applications web et mobiles", salary: "400.000-1.200.000 FCFA/mois" },
        { title: "Ingénieur Cybersécurité", description: "Protège les systèmes informatiques", salary: "500.000-1.500.000 FCFA/mois" },
        { title: "Data Scientist", description: "Analyse les données pour l'IA", salary: "600.000-2.000.000 FCFA/mois" },
        { title: "Chef de Projet Digital", description: "Gère les projets technologiques", salary: "500.000-1.000.000 FCFA/mois" }
      ],
      tips: [
        "Crée des projets personnels pour ton portfolio",
        "Participe à des communautés de développeurs",
        "Apprends en anglais pour accéder à plus de ressources",
        "Reste à jour avec les nouvelles technologies",
        "Développe des compétences en communication technique"
      ]
    };
  }

  if (name.includes('santé') || name.includes('médecine') || name.includes('biologie') || name.includes('pharmacie')) {
    return {
      description: "Le secteur de la santé est crucial et offre de nombreuses opportunités en médecine, pharmacie, biologie, soins infirmiers et santé publique. La demande en professionnels de santé est forte en Afrique francophone.",
      academicPath: [
        { level: "Bac+2", description: "BTS Analyses Médicales, DUT Carrières Sociales option Santé" },
        { level: "Bac+3", description: "Licence Sciences de la Vie, Licence Santé Publique" },
        { level: "Bac+5+", description: "Doctorat en Médecine (7 ans), Doctorat en Pharmacie (6 ans), Master Biologie" }
      ],
      universities: [
        { name: "FMPO UCAD (Sénégal)", country: "Sénégal", description: "Faculté de Médecine, de Pharmacie et d'Odontologie", cost: "400.000-800.000 FCFA/an" },
        { name: "UFR Sciences Médicales Abidjan (Côte d'Ivoire)", country: "Côte d'Ivoire", description: "Formation médicale", cost: "500.000-1.000.000 FCFA/an" },
        { name: "FMP Bamako (Mali)", country: "Mali", description: "Faculté de Médecine et de Pharmacie", cost: "350.000-700.000 FCFA/an" },
        { name: "FMSS Yaoundé (Cameroun)", country: "Cameroun", description: "Faculté de Médecine et des Sciences Biomédicales", cost: "450.000-900.000 FCFA/an" }
      ],
      steps: [
        { phase: "Au lycée", description: "Choisis les spécialités SVT, Physique-Chimie, Mathématiques" },
        { phase: "Après le Bac", description: "Prépare les concours de médecine/pharmacie, inscris-toi en première année santé" },
        { phase: "Pendant les études", description: "Fais des stages hospitaliers, participe à la recherche, développe ton réseau professionnel" },
        { phase: "Après les études", description: "Fais ton internat, prépare ta thèse, postule dans les hôpitaux ou ouvre ton cabinet" }
      ],
      skills: [
        "Connaissances médicales et scientifiques",
        "Diagnostic et prise de décision clinique",
        "Communication avec les patients",
        "Gestion d'urgence et stress",
        "Travail en équipe multidisciplinaire"
      ],
      resources: [
        { name: "OMS Afrique", url: "https://www.afro.who.int", description: "Ressources santé de l'OMS pour l'Afrique" },
        { name: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov", description: "Base de données médicale" },
        { name: "Coursera - Health", url: "https://www.coursera.org/browse/health", description: "Formations en santé" },
        { name: "Jobartis - Santé", url: "https://www.jobartis.com", description: "Offres d'emploi dans la santé" }
      ],
      careers: [
        { title: "Médecin généraliste", description: "Diagnostique et traite les patients", salary: "500.000-1.500.000 FCFA/mois" },
        { title: "Pharmacien", description: "Prépare et délivre les médicaments", salary: "400.000-1.200.000 FCFA/mois" },
        { title: "Infirmier diplômé d'État", description: "Soigne et accompagne les patients", salary: "250.000-500.000 FCFA/mois" },
        { title: "Biologiste médical", description: "Effectue des analyses biologiques", salary: "350.000-800.000 FCFA/mois" }
      ],
      tips: [
        "Développe ton empathie et ton écoute",
        "Reste informé des avancées médicales",
        "Fais du bénévolat dans des hôpitaux",
        "Prépare sérieusement les concours",
        "Développe des compétences en gestion de stress"
      ]
    };
  }

  if (name.includes('droit') || name.includes('juridique') || name.includes('justice')) {
    return {
      description: "Le secteur du droit et de la justice offre des opportunités en droit privé, public, international, notariat, avocature et conseil juridique. Les juristes sont essentiels pour le fonctionnement des sociétés et des entreprises.",
      academicPath: [
        { level: "Bac+2", description: "DUT Carrières Juridiques, BTS Notariat" },
        { level: "Bac+3", description: "Licence Droit Privé, Licence Droit Public" },
        { level: "Bac+5", description: "Master Droit Privé, Master Droit Public, Master Droit des Affaires, École de Magistrat" }
      ],
      universities: [
        { name: "FJ UCAD (Sénégal)", country: "Sénégal", description: "Faculté des Sciences Juridiques et Politiques", cost: "250.000-500.000 FCFA/an" },
        { name: "UFR Droit Abidjan (Côte d'Ivoire)", country: "Côte d'Ivoire", description: "Formation en droit", cost: "300.000-600.000 FCFA/an" },
        { name: "ENAM Mali (Mali)", country: "Mali", description: "École Nationale d'Administration", cost: "200.000-400.000 FCFA/an" },
        { name: "ENAM Yaoundé (Cameroun)", country: "Cameroun", description: "École Nationale d'Administration et de Magistrature", cost: "350.000-700.000 FCFA/an" }
      ],
      steps: [
        { phase: "Au lycée", description: "Choisis les spécialités Littéraires, Histoire-Géographie, SES" },
        { phase: "Après le Bac", description: "Inscis-toi en licence Droit, prépare les concours d'ENAM ou d'école d'avocat" },
        { phase: "Pendant les études", description: "Fais des stages dans des cabinets d'avocats, tribunaux, notaires" },
        { phase: "Après les études", description: "Prépare le CRFPA (avocat), concours de magistrature, ou intègre un cabinet" }
      ],
      skills: [
        "Rédaction juridique et analyse de textes",
        "Plaidoirie et argumentation",
        "Négociation et médiation",
        "Connaissance des lois et réglementations",
        "Esprit critique et rigueur"
      ],
      resources: [
        { name: "Légifrance", url: "https://www.legifrance.gouv.fr", description: "Base de données juridique française" },
        { name: "Coursera - Law", url: "https://www.coursera.org/browse/law", description: "Cours de droit en ligne" },
        { name: "Awoof - Emploi Juridique", url: "https://www.awoof.africa", description: "Offres d'emploi en droit" },
        { name: "OHADA", url: "https://www.ohada.org", description: "Droit des affaires en Afrique" }
      ],
      careers: [
        { title: "Avocat", description: "Défend les clients en justice", salary: "400.000-1.500.000 FCFA/mois" },
        { title: "Notaire", description: "Authentifie les actes juridiques", salary: "500.000-2.000.000 FCFA/mois" },
        { title: "Magistrat", description: "Juge les affaires juridiques", salary: "600.000-1.800.000 FCFA/mois" },
        { title: "Juriste d'entreprise", description: "Conseille les entreprises sur le droit", salary: "500.000-1.200.000 FCFA/mois" }
      ],
      tips: [
        "Développe ta capacité d'analyse et de synthèse",
        "Maîtrise la rédaction juridique",
        "Fais des stages variés (tribunaux, cabinets, entreprises)",
        "Reste informé des évolutions législatives",
        "Développe un réseau professionnel dans le domaine juridique"
      ]
    };
  }

  // Données par défaut pour les autres secteurs
  return {
    description: "Ce secteur offre de nombreuses opportunités de carrière et est en constante évolution en Afrique francophone.",
    academicPath: [
      { level: "Bac+2", description: "DUT/BTS dans le domaine" },
      { level: "Bac+3", description: "Licence professionnelle" },
      { level: "Bac+5", description: "Master ou diplôme d'école spécialisée" }
    ],
    universities: [
      { name: "UCAD (Sénégal)", country: "Sénégal", description: "Université Cheikh Anta Diop", cost: "250.000-500.000 FCFA/an" },
      { name: "Université Felix Houphouet-Boigny (Côte d'Ivoire)", country: "Côte d'Ivoire", description: "Formation universitaire", cost: "300.000-600.000 FCFA/an" },
      { name: "Université des Sciences, Techniques et Technologies de Bamako (Mali)", country: "Mali", description: "Formation technique", cost: "200.000-400.000 FCFA/an" },
      { name: "Université de Yaoundé I (Cameroun)", country: "Cameroun", description: "Formation universitaire", cost: "350.000-700.000 FCFA/an" }
    ],
    steps: [
      { phase: "Au lycée", description: "Choisis les spécialités en rapport avec ce secteur" },
      { phase: "Après le Bac", description: "Informe-toi sur les formations disponibles et prépare les concours" },
      { phase: "Pendant les études", description: "Fais des stages et du réseautage professionnel" },
      { phase: "Après les études", description: "Postule dans les entreprises du secteur ou crée ton activité" }
    ],
    skills: [
      "Compétences techniques spécifiques au secteur",
      "Communication et travail en équipe",
      "Gestion de projet",
      "Adaptabilité et apprentissage continu",
      "Résolution de problèmes"
    ],
    resources: [
      { name: "Coursera", url: "https://www.coursera.org", description: "Plateforme d'apprentissage en ligne" },
      { name: "edX", url: "https://www.edx.org", description: "Cours en ligne des meilleures universités" },
      { name: "Awoof", url: "https://www.awoof.africa", description: "Site d'offres d'emploi en Afrique" },
      { name: "Jobartis", url: "https://www.jobartis.com", description: "Portail d'emploi africain" }
    ],
    careers: [
      { title: "Cadre dans le secteur", description: "Poste de direction ou technique", salary: "300.000-800.000 FCFA/mois" },
      { title: "Spécialiste technique", description: "Expert dans le domaine", salary: "250.000-600.000 FCFA/mois" },
      { title: "Consultant", description: "Conseil pour les entreprises", salary: "400.000-1.000.000 FCFA/mois" },
      { title: "Entrepreneur", description: "Créateur d'entreprise dans le secteur", salary: "Variable selon le succès" }
    ],
    tips: [
      "Développe tes compétences techniques et soft skills",
      "Fais des stages pour gagner de l'expérience",
      "Crée un réseau professionnel dans le secteur",
      "Reste informé des évolutions du marché",
      "Développe des compétences en langues (anglais, français)"
    ]
  };
}

module.exports = {
  extractDataFromImage,
  processImage,
  suggestSectors,
  generateRoadmapForSector,
};