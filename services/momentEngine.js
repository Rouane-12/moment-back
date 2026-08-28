const Venue = require('../models/Venue');
const Offer = require('../models/Offer');
const Event = require('../models/Event');

const ROLL_THEMES = {
  1: { key: 'chill', label: 'Chill', emoji: '🌴', categories: ['plage', 'bar', 'food'] },
  2: { key: 'food', label: 'Food', emoji: '🍽', categories: ['food', 'rooftop', 'bar'] },
  3: { key: 'fun', label: 'Fun', emoji: '🎮', categories: ['gaming', 'food', 'bar'] },
  4: { key: 'entertainment', label: 'Entertainment', emoji: '🎬', categories: ['gaming', 'food', 'rooftop'] },
  5: { key: 'night', label: 'Night', emoji: '🎤', categories: ['food', 'concert', 'rooftop'] },
  6: { key: 'surprise', label: 'Surprise', emoji: '🎲', categories: ['culture', 'food', 'concert'] }
};

const VIBE_CATEGORIES = {
  food: ['food'],
  gaming: ['gaming'],
  chill: ['plage', 'bar'],
  festif: ['concert', 'rooftop'],
  cine: ['cinema'],
  romantique: ['rooftop', 'food'],
  concert: ['concert'],
  culture: ['culture']
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addMinutes(time, minutes) {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function composeMoment(params) {
  const { city, people, budgetPerPerson, startTime, vibes, roll, date } = params;
  const theme = ROLL_THEMES[roll] || ROLL_THEMES[1];
  const seed = hash(`${city}|${people}|${budgetPerPerson}|${date}|${vibes.join(',')}|${roll}`);
  const rand = rng(seed);
  const budgetTotal = budgetPerPerson * people;

  const vibeCats = [];
  for (const v of vibes) {
    if (VIBE_CATEGORIES[v]) {
      vibeCats.push(...VIBE_CATEGORIES[v]);
    }
  }

  const wanted = [...theme.categories];
  let adapted = false;

  const picked = [];
  
  for (const cat of wanted) {
    const pool = await Venue.find({
      category: cat,
      city: city,
      isActive: true,
      status: { $in: ['verified', 'partner', 'partner_premium'] }
    }).lean();
    
    let candidates = pool.filter(v => !picked.some(p => p._id.toString() === v._id.toString()));
    
    if (candidates.length === 0) {
      const fallbackOrder = ['food', 'bar', 'rooftop', 'plage', 'gaming'];
      const fallbackPool = await Venue.find({
        category: { $in: fallbackOrder },
        city: city,
        isActive: true,
        status: { $in: ['verified', 'partner', 'partner_premium'] }
      }).lean();
      
      candidates = fallbackPool.filter(v => !picked.some(p => p._id.toString() === v._id.toString()));
      adapted = true;
    }

    candidates.sort((a, b) => {
      const bonus = (v) => vibeCats.includes(v.category) ? 0.5 : 0;
      return b.rating / 5 + bonus(b) - (a.rating / 5 + bonus(a)) + (rand() - 0.5) * 0.4;
    });

    if (candidates[0]) {
      picked.push(candidates[0]);
    }
  }

  if (picked.length === 0) {
    throw new Error('Aucun lieu trouvé dans la base de données. Veuillez importer des lieux via Google Places API ou ajouter des lieux manuellement.');
  }

  let total = () => picked.reduce((s, v) => {
    const price = v.priceRange?.average || v.priceRange?.min || 5000;
    return s + price * people;
  }, 0);

  for (let i = 0; i < picked.length && total() > budgetTotal; i++) {
    const step = picked[i];
    const cheaperPool = await Venue.find({
      category: step.category,
      city: city,
      isActive: true,
      status: { $in: ['verified', 'partner', 'partner_premium'] }
    }).lean();
    
    const cheaper = cheaperPool
      .filter(v => !picked.some(p => p._id.toString() === v._id.toString()))
      .sort((a, b) => (a.priceRange?.average || a.priceRange?.min || 5000) - (b.priceRange?.average || b.priceRange?.min || 5000))[0];
    
    if (cheaper) {
      picked[i] = cheaper;
      adapted = true;
    }
  }

  while (total() > budgetTotal && picked.length > 2) {
    const worst = [...picked].sort((a, b) => {
      const priceA = a.priceRange?.average || a.priceRange?.min || 5000;
      const priceB = b.priceRange?.average || b.priceRange?.min || 5000;
      return priceB - priceA;
    })[0];
    
    picked.splice(picked.indexOf(worst), 1);
    adapted = true;
  }

  // Filter out venues with invalid coordinates
  const withCoords = picked.filter(v => v.latitude && v.longitude && !(v.latitude === 0 && v.longitude === 0));
  const ordered = [...(withCoords.length >= 2 ? withCoords : picked)];
  ordered.sort((a, b) => a.longitude - b.longitude);
  
  let current = ordered.shift();
  const finalOrder = [current];
  
  while (ordered.length) {
    const from = current;
    ordered.sort((a, b) => calculateDistance(from.latitude, from.longitude, a.latitude, a.longitude) - calculateDistance(from.latitude, from.longitude, b.latitude, b.longitude));
    current = ordered.shift();
    finalOrder.push(current);
  }

  let clock = startTime;
  let distanceKm = 0;
  const steps = finalOrder.map((venue, i) => {
    const travel = i === 0 ? 0 : calculateDistance(finalOrder[i - 1].latitude, finalOrder[i - 1].longitude, venue.latitude, venue.longitude);
    // Cap absurd distances (e.g. from missing coords) to a reasonable value
    const cappedTravel = Math.min(travel, 50);
    distanceKm += cappedTravel;
    if (i > 0) clock = addMinutes(clock, Math.round(cappedTravel * 4) + 10);
    const start = clock;
    const end = addMinutes(start, 90);
    clock = end;
    
    const price = venue.priceRange?.average || venue.priceRange?.min || 5000;
    
    const pricePerPerson = price;
    return {
      venue: {
        id: venue._id,
        name: venue.name,
        category: venue.category,
        district: venue.district,
        rating: venue.rating,
        reviewCount: venue.reviewCount,
        latitude: venue.latitude,
        longitude: venue.longitude,
        address: venue.address,
        image: venue.media?.[0]?.url || '',
        pricePerPerson: pricePerPerson,
        reviews: venue.reviewCount,
        durationMin: 90,
        tagline: venue.description || ''
      },
      start,
      end,
      price: price * people,
      distanceKm: Math.round(cappedTravel * 100) / 100
    };
  });

  const spent = steps.reduce((s, st) => s + st.price, 0);
  const budgetScore = Math.max(0, 1 - Math.abs(budgetTotal * 0.85 - spent) / budgetTotal);
  const ratingScore = steps.reduce((s, st) => s + st.venue.rating, 0) / (steps.length * 5);
  const distScore = Math.max(0, 1 - distanceKm / 25);
  const prefScore = steps.filter(st => vibeCats.includes(st.venue.category)).length / steps.length;
  const score = Math.round((budgetScore * 0.25 + distScore * 0.2 + ratingScore * 0.25 + prefScore * 0.2 + 0.1) * 100);

  const TITLES = {
    chill: ['Coucher de Soleil', 'Cotonou Zen', 'Palmeraie & Brise'],
    food: ['Table Ouverte', 'Braise & Co', 'Goût de la Nuit'],
    fun: ['Manettes & Grillades', 'Session Arcade', 'Soirée Jeux'],
    entertainment: ['Écran Total', 'Soirée Ciné', 'Grand Jeu'],
    night: ['Afrobeat Nocturne', 'Live & Tard', 'Cotonou After'],
    surprise: ['Carte Blanche', 'Le Détour', 'Hasard Choisi']
  };

  const titles = TITLES[theme.key] || ['Ton Moment'];

  return {
    title: titles[Math.floor(rand() * titles.length)] || 'Ton Moment',
    theme: { key: theme.key, label: theme.label, emoji: theme.emoji },
    steps,
    total: spent,
    perPerson: Math.round(spent / people),
    score: Math.min(98, Math.max(62, score)),
    distanceKm: Math.round(distanceKm * 10) / 10,
    adapted,
    params
  };
}

module.exports = { composeMoment, ROLL_THEMES };
