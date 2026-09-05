require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('./models/Venue');

// Category mapping: user categories → backend enum
const catMap = {
  chill: 'bar',
  divertissement: 'culture',
  food: 'food',
  fun: 'gaming',
  surprise: 'nature',
};

// All venues from the user's list (deduplicated — one entry per venue even if multi-category)
const newVenues = [
  // ─── CHILL ───
  {
    name: 'AMBA YARD',
    description: 'Ferme-auberge et espace détente en périphérie de Cotonou : hébergement, restauration et cadre nature.',
    category: 'bar', categories: ['food'],
    latitude: 6.5102433, longitude: 2.2073988,
    address: 'Cotonou, Bénin', city: 'Cotonou', phone: '+229 01 99 33 00 68',
  },
  {
    name: 'Café Étoile Bénin',
    description: 'Café climatisé avec vue sur le rond-point de l\'Étoile Rouge, formules petit-déjeuner et pâtisseries.',
    category: 'bar', categories: [],
    latitude: 6.3705916, longitude: 2.410112,
    address: 'Carrefour de l\'Étoile Rouge, Immeuble Noir, à côté du magasin Infinix, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 50 08 54 50',
  },
  {
    name: 'Club des Rois',
    description: 'Restaurant-bar en bord de plage sur la Route des Pêches, cocktails et ambiance DJ certains soirs.',
    category: 'bar', categories: ['food'],
    latitude: 6.3487108, longitude: 2.3284003,
    address: '88XH+F9J, Cotonou, Bénin', city: 'Cotonou', phone: '+229 01 96 24 27 53',
  },
  {
    name: 'Face À La Mer',
    description: 'Restaurant en plein air à Fidjrossè, cuisine africaine et internationale, musique live le week-end.',
    category: 'food', categories: ['bar', 'culture'],
    latitude: 6.3509153, longitude: 2.3505747,
    address: '03 BP 68 Fidjrossè, Route des Pêches, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 90 39 03 03',
  },
  {
    name: 'Havana beach',
    description: 'Espace balnéaire convivial avec plusieurs coins assis pour se détendre en journée ou le week-end.',
    category: 'bar', categories: ['plage'],
    latitude: 6.359903, longitude: 2.496386,
    address: 'Rue 1368, Cotonou, Bénin', city: 'Cotonou', phone: null,
  },
  {
    name: 'Hotel Les Arcades',
    description: 'Hôtel avec restaurant, bar lounge et salle de réception pour événements.',
    category: 'hotel', categories: ['food', 'bar'],
    latitude: 6.4692126, longitude: 2.3456148,
    address: 'Quartier ZOCA, Bénin', city: 'Cotonou', phone: '+229 01 69 20 21 20',
  },
  {
    name: 'L\'Epicurienne Café',
    description: 'Café cosy et climatisé, formules petit-déjeuner, pâtisseries et frappés.',
    category: 'bar', categories: ['food'],
    latitude: 6.3762335, longitude: 2.4228122,
    address: 'Cotonou, Bénin', city: 'Cotonou', phone: '+229 01 94 35 68 68',
  },
  {
    name: 'Le Jardin d\'Ethan',
    description: 'Restaurant-jardin à Abomey-Calavi, soirées à thème avec groupe live et grand espace convivial.',
    category: 'food', categories: ['bar', 'culture'],
    latitude: 6.4533539, longitude: 2.3324939,
    address: 'F83J+8XX, Abomey-Calavi, Bénin',
    city: 'Abomey-Calavi', phone: '+229 01 95 86 31 53',
  },
  {
    name: 'Le Jardin Ô Z\'Épices',
    description: 'Restaurant-jardin à ambiance chaleureuse, cuisine locale et cocktails.',
    category: 'food', categories: ['bar'],
    latitude: 6.374, longitude: 2.418,
    address: 'Cotonou, Bénin', city: 'Cotonou', phone: null,
  },
  {
    name: 'Pura Vida Café',
    description: 'Café-bar à l\'ambiance décontractée, cocktails, cuisine internationale et soirées musicales.',
    category: 'bar', categories: ['food'],
    latitude: 6.3579396, longitude: 2.3972008,
    address: 'Rue 954B, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 97 26 47 97',
  },

  // ─── DIVERTISSEMENT ───
  {
    name: 'Centre Culturel Artisttik Africa',
    description: 'Centre culturel et galerie dédiés à la création artistique africaine, expositions et événements.',
    category: 'culture', categories: ['exhibition'],
    latitude: 6.378823, longitude: 2.371502,
    address: '99HC+GJC, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 96 76 67 67',
  },
  {
    name: 'CINE LE BENIN',
    description: 'Ancien cinéma historique de Cotonou, aujourd\'hui reconverti et peu actif.',
    category: 'cinema', categories: [],
    latitude: 6.3617041, longitude: 2.4225825,
    address: '9C6F+M2P, Boulevard Saint Michel, Cotonou, Bénin',
    city: 'Cotonou', phone: null,
  },
  {
    name: 'Fondation Zinsou Ouidah',
    description: 'Musée d\'art contemporain africain installé dans un bâtiment historique restauré, expositions et restaurant.',
    category: 'culture', categories: ['exhibition', 'food'],
    latitude: 6.3615125, longitude: 2.0853281,
    address: '936P+J44, Ouidah, Bénin', city: 'Ouidah', phone: null,
  },
  {
    name: 'L\'ART GALERIE',
    description: 'Galerie d\'art contemporain à Abomey-Calavi.',
    category: 'culture', categories: ['exhibition'],
    latitude: 6.4317423, longitude: 2.3322777,
    address: '229, Abomey-Calavi, Bénin',
    city: 'Abomey-Calavi', phone: '+229 01 97 65 65 81',
  },
  {
    name: 'Mur Graffiti du Port de Cotonou',
    description: 'Fresque murale à ciel ouvert le long du port, art urbain béninois, accès libre.',
    category: 'culture', categories: ['public_space'],
    latitude: 6.3499768, longitude: 2.4156886,
    address: '8CX8+X7, Cotonou, Bénin', city: 'Cotonou', phone: null,
  },
  {
    name: 'Royal Cinéma',
    description: 'Salle de cinéma et de divertissement familial à Atrokpocodji.',
    category: 'cinema', categories: ['family'],
    latitude: 6.392542, longitude: 2.3195812,
    address: '00229, Atrokpocodji, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 62 24 93 41',
  },

  // ─── FOOD (not already listed above) ───
  {
    name: 'Ferrari Lounge',
    description: 'Café-restaurant lounge chic, ouvert tard, cadre soigné.',
    category: 'food', categories: ['bar'],
    latitude: 6.3734833, longitude: 2.4523824,
    address: '9FF2+9XR, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 42 68 88 37',
  },
  {
    name: 'JN Restaurant Épicerie Fine',
    description: 'Restaurant gastronomique et épicerie fine à Abomey-Calavi, cuisine française et internationale.',
    category: 'food', categories: [],
    latitude: 6.4347403, longitude: 2.3456647,
    address: 'Bidossessi, Abomey-Calavi, Bénin',
    city: 'Abomey-Calavi', phone: '+229 01 53 28 68 32',
  },
  {
    name: 'L\'Imprévu',
    description: 'Restaurant central proposant buffet et carte, menu varié.',
    category: 'food', categories: [],
    latitude: 6.352869, longitude: 2.4374779,
    address: 'Face à ECOBANK direction générale, Ganhi, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 66 97 40 40',
  },
  {
    name: 'Restaurant Chez Maman Bénin',
    description: 'Restaurant de cuisine béninoise traditionnelle, cadre confortable.',
    category: 'food', categories: [],
    latitude: 6.3624633, longitude: 2.4225517,
    address: 'Rue 201A, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 21 32 33 38',
  },
  {
    name: 'Restaurant Espace JAAADE',
    description: 'Espace de restauration et d\'événements à Abomey-Calavi.',
    category: 'food', categories: [],
    latitude: 6.4950785, longitude: 2.3327976,
    address: 'F8WM+24M, Abomey-Calavi, Bénin',
    city: 'Abomey-Calavi', phone: '+229 01 67 47 83 01',
  },
  {
    name: 'Sapin Royal',
    description: 'Salle des fêtes et restaurant à Godomey, cadre spacieux pour événements.',
    category: 'food', categories: [],
    latitude: 6.4225172, longitude: 2.3120731,
    address: 'Route non nommée, Godomey, Bénin',
    city: 'Godomey', phone: '+229 01 66 42 59 60',
  },

  // ─── FUN ───
  {
    name: 'AQUAFUN PARK',
    description: 'Parc aquatique familial sur la Route des Pêches, toboggans et restauration sur place.',
    category: 'sport', categories: ['family', 'pool'],
    latitude: 6.3493987, longitude: 2.3207139,
    address: 'Togbin, après le carrefour Club des Rois, Route des Pêches, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 56 50 22 73',
  },
  {
    name: 'AQUAMAZONE',
    description: 'Base nautique au milieu des mangroves : canoë, jet-ski et activités familiales.',
    category: 'sport', categories: ['family', 'nature'],
    latitude: 6.3487974, longitude: 2.2819732,
    address: 'Togbin Adounko, Route des Pêches, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 54 28 44 44',
  },
  {
    name: 'Bab\'s Dock',
    description: 'Restaurant lacustre accessible en pirogue à travers la mangrove.',
    category: 'food', categories: ['nature', 'ecotourism'],
    latitude: 6.3476763, longitude: 2.268093,
    address: '87X9+36G, Cotonou, Bénin', city: 'Cotonou', phone: null,
  },
  {
    name: 'Calavie',
    description: 'Espace de loisirs et détente à Cotonou.',
    category: 'gaming', categories: [],
    latitude: 6.365, longitude: 2.415,
    address: 'Cotonou, Bénin', city: 'Cotonou', phone: null,
  },
  {
    name: 'Club 8 Billard Cotonou',
    description: 'Club de billard, tables de qualité et ambiance conviviale entre amis.',
    category: 'gaming', categories: ['bar'],
    latitude: 6.3729511, longitude: 2.4248638,
    address: '237 Ave de la Libération, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 63 17 88 88',
  },
  {
    name: 'Khalifa Play Zone',
    description: 'Espace de jeux vidéo pour enfants et familles à Abomey-Calavi.',
    category: 'gaming', categories: ['family'],
    latitude: 6.4375677, longitude: 2.330055,
    address: 'Abomey-Calavi Djadjo, marché, Abomey-Calavi, Bénin',
    city: 'Abomey-Calavi', phone: '+229 01 98 52 40 41',
  },
  {
    name: 'Parkour Park Cotonou',
    description: 'Club de parkour encadré, cours pour enfants et adultes.',
    category: 'sport', categories: ['family'],
    latitude: 6.369639, longitude: 2.4510925,
    address: 'Rue 1209, Cotonou, Bénin',
    city: 'Cotonou', phone: '+229 01 95 11 86 00',
  },
  {
    name: 'Splash Park Bénin',
    description: 'Parc aquatique familial avec toboggans et bassins à Abomey-Calavi.',
    category: 'sport', categories: ['family', 'pool'],
    latitude: 6.4740316, longitude: 2.33564,
    address: 'Calavi, Zoundja, Bénin',
    city: 'Abomey-Calavi', phone: '+229 01 97 97 35 31',
  },

  // ─── SURPRISE ───
  {
    name: 'Route des Pêches Fidjrossè',
    description: 'Route côtière emblématique entre Cotonou et Ouidah, plages et vue sur l\'océan, accès libre.',
    category: 'nature', categories: ['plage', 'walk'],
    latitude: 6.3494908, longitude: 2.3649948,
    address: '89X7+QXX, Route non nommée, Cotonou, Bénin',
    city: 'Cotonou', phone: null,
  },
];

// Venue names already in the database (from seed-venues.js)
const ALREADY_IN_DB = new Set([
  'Hall des Arts, Loisirs et Sports',
  'Institut Français du Bénin',
  'Majestic Cinéma Wologuèdè',
  'Kati-Kati Gaming Lounge',
  'Metaverse Gaming',
]);

async function addMissingVenues() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all existing venue names (case-insensitive)
    const existingVenues = await Venue.find({}, 'name').lean();
    const existingNames = new Set(
      existingVenues.map(v => v.name.toLowerCase().trim())
    );

    console.log(`\n📊 Existing venues in DB: ${existingVenues.length}`);
    console.log(`📋 New venues to check: ${newVenues.length}`);

    const toAdd = [];
    const skipped = [];

    for (const venue of newVenues) {
      const key = venue.name.toLowerCase().trim();
      if (existingNames.has(key) || ALREADY_IN_DB.has(venue.name)) {
        skipped.push(venue.name);
        continue;
      }
      toAdd.push({
        ...venue,
        status: 'verified',
        verificationStatus: 'source_backed',
        sourceTier: 'secondary_directory',
        isActive: true,
        rating: 0,
        reviewCount: 0,
        tags: [venue.category, ...(venue.categories || [])],
        priceRange: { min: null, max: null, average: null, unit: 'per_person' },
        bookingRequired: 'unknown',
        indoorOutdoor: 'unknown',
        media: [],
      });
      existingNames.add(key); // prevent duplicates within the list
    }

    console.log(`\n✅ Already in DB (skipped): ${skipped.length}`);
    skipped.forEach(n => console.log(`   ⏭  ${n}`));

    console.log(`\n🆕 To add: ${toAdd.length}`);

    if (toAdd.length === 0) {
      console.log('\n✅ Nothing to add — all venues already exist!');
      process.exit(0);
    }

    // Insert one by one to handle individual errors
    let added = 0;
    let failed = 0;
    for (const venue of toAdd) {
      try {
        await Venue.create(venue);
        console.log(`   ✅ ${venue.name} (${venue.category})`);
        added++;
      } catch (err) {
        console.error(`   ❌ ${venue.name}: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`✅ Added: ${added}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭  Skipped (already exists): ${skipped.length}`);

    // Show final counts by category
    const finalVenues = await Venue.find({ isActive: true });
    const byCategory = {};
    finalVenues.forEach(v => {
      byCategory[v.category] = (byCategory[v.category] || 0) + 1;
    });
    console.log(`\n📊 Total active venues: ${finalVenues.length}`);
    Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addMissingVenues();
