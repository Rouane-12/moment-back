/**
 * MOMENT — Seed complet
 * Peuple TOUTES les collections avec des données réalistes pour le Bénin.
 *
 * Usage :  cd backend && node seed-complete.js
 *
 * Crée :
 *  - 5 utilisateurs (super_admin, admin, 2 users, 1 partner_owner)
 *  - 4 partenaires
 *  - ~50 venues réelles réparties dans 6 villes
 *  - 6 événements
 *  - ~15 reviews
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Partner = require('./models/Partner');
const Venue = require('./models/Venue');
const Event = require('./models/Event');
const Review = require('./models/Review');

/* ------------------------------------------------------------------ */
/*  USERS                                                              */
/* ------------------------------------------------------------------ */
const usersData = [
  {
    firstName: 'Super',
    lastName: 'Admin',
    email: 'superadmin@moment.bj',
    phone: '+229 97 00 00 00',
    password: 'Admin@123',
    role: 'super_admin',
    city: 'Cotonou',
    isVerified: true,
  },
  {
    firstName: 'Adjovi',
    lastName: 'Koffi',
    email: 'admin@moment.bj',
    phone: '+229 97 01 01 01',
    password: 'Admin@123',
    role: 'admin',
    city: 'Cotonou',
    isVerified: true,
  },
  {
    firstName: 'Jean',
    lastName: 'Kouassi',
    email: 'jean@moment.bj',
    phone: '+229 90 01 02 03',
    password: 'User@123',
    role: 'user',
    city: 'Cotonou',
    isVerified: true,
    preferences: {
      favoriteCategories: ['food', 'bar', 'rooftop'],
      minBudget: 5000,
      maxBudget: 30000,
      preferredDistance: 10,
      favoriteAmbiences: ['festif', 'chill'],
    },
  },
  {
    firstName: 'Marie',
    lastName: 'Adjoua',
    email: 'marie@moment.bj',
    phone: '+229 90 04 05 06',
    password: 'User@123',
    role: 'user',
    city: 'Porto-Novo',
    isVerified: true,
    preferences: {
      favoriteCategories: ['culture', 'plage', 'food'],
      minBudget: 3000,
      maxBudget: 15000,
    },
  },
  {
    firstName: 'Kossi',
    lastName: 'Agossa',
    email: 'partner@moment.bj',
    phone: '+229 90 07 08 09',
    password: 'Partner@123',
    role: 'partner_owner',
    city: 'Cotonou',
    isVerified: true,
  },
];

/* ------------------------------------------------------------------ */
/*  PARTNERS                                                           */
/* ------------------------------------------------------------------ */
const partnersData = [
  {
    name: 'The Garden Cotonou',
    contactName: 'Marc Adjovi',
    email: 'garden@partner.bj',
    phone: '+229 91 10 10 10',
    type: 'bar',
    city: 'Cotonou',
    address: 'Akpakpa, Cotonou',
    description: 'Bar-lounge rooftop avec billard et karaoké',
    status: 'active',
    commissionRate: 8,
    paymentInfo: { mobileMoneyNumber: '+229 91 10 10 10', mobileMoneyProvider: 'MTN' },
  },
  {
    name: 'Africa Sound City',
    contactName: 'Kofi Mensah',
    email: 'africasound@partner.bj',
    phone: '+229 91 20 20 20',
    type: 'event_organizer',
    city: 'Cotonou',
    address: 'Rue 2935, Cotonou',
    description: 'Lieu de musique live et performances culturelles',
    status: 'active',
    commissionRate: 10,
    paymentInfo: { mobileMoneyNumber: '+229 91 20 20 20', mobileMoneyProvider: 'Moov' },
  },
  {
    name: 'Plage Resort Grand-Popo',
    contactName: 'Yvette Sossa',
    email: 'resort@grandpopo.bj',
    phone: '+229 91 30 30 30',
    type: 'venue',
    city: 'Grand-Popo',
    address: 'Route Pavée, Grand-Popo',
    description: 'Resort hôtelier avec accès plage',
    status: 'active',
    commissionRate: 6,
    paymentInfo: { mobileMoneyNumber: '+229 91 30 30 30', mobileMoneyProvider: 'MTN' },
  },
  {
    name: 'Cave du Nord Parakou',
    contactName: 'Aïcha Diallo',
    email: 'cave@parakou.bj',
    phone: '+229 91 40 40 40',
    type: 'bar',
    city: 'Parakou',
    address: 'Parakou',
    description: 'Bar-lounge chic avec DJ, ouvert tard',
    status: 'active',
    commissionRate: 7,
    paymentInfo: { mobileMoneyNumber: '+229 91 40 40 40', mobileMoneyProvider: 'MTN' },
  },
];

/* ------------------------------------------------------------------ */
/*  VENUES — 50+ lieux réels répartis dans 6 villes                   */
/* ------------------------------------------------------------------ */
const budgetTierToPrice = {
  1: { min: 0, max: 3000, average: 1500 },
  2: { min: 3000, max: 10000, average: 5000 },
  3: { min: 10000, max: 30000, average: 15000 },
};

const categoryMap = {
  plage: 'plage', food: 'food', gaming: 'gaming', bar: 'bar',
  cinema: 'cinema', concert: 'concert', culture: 'culture', rooftop: 'rooftop',
};

const venuesRaw = [
  // ── COTONOU ──────────────────────────────────────────────────────
  { name: 'The Garden Rooftop', city: 'Cotonou', categories: ['rooftop', 'bar', 'food'], address: 'Akpakpa, Cotonou', latitude: 6.3730259, longitude: 2.4682515, budget_tier: 2, rating: 4.2, phone: '+229 01 90 00 56 56', description: 'Bar-lounge avec billard, karaoké et concerts live.' },
  { name: 'Sky Lounge', city: 'Cotonou', categories: ['rooftop', 'bar', 'food'], address: 'Plage Fin Pavé, Cotonou', latitude: 6.3502592, longitude: 2.3690021, budget_tier: 2, rating: 4.2, phone: '+229 01 68 37 37 37', description: 'Lounge rooftop, cuisine indienne, vue nocturne.' },
  { name: 'Hi Five Rooftop', city: 'Cotonou', categories: ['rooftop', 'food', 'bar'], address: 'Maro-Militaire, Cotonou', latitude: 6.3617931, longitude: 2.423476, budget_tier: 2, rating: 4.6, phone: '+229 01 66 66 23 84', description: 'Restaurant rooftop, ambiance soignée, Di-vin Sunday.' },
  { name: 'Le Rooftop Chez Gero', city: 'Cotonou', categories: ['rooftop', 'food'], address: 'Fin Pavé, Cotonou', latitude: 6.3505832, longitude: 2.3674803, budget_tier: 2, rating: 5.0, phone: '+229 01 56 00 78 07', description: 'Rooftop avec piscine, spécialité fruits de mer.' },
  { name: 'Moon Bar-Restaurant', city: 'Cotonou', categories: ['bar', 'food', 'plage'], address: 'Fidjrossè, Cotonou', latitude: 6.3511343, longitude: 2.3453483, budget_tier: 2, rating: 4.0, phone: '+229 01 53 71 45 90', description: 'Bar-restaurant face à la plage, DJ, cocktails.' },
  { name: "Didi's Garden Togbin", city: 'Cotonou', categories: ['bar', 'food'], address: 'Togbin, Cotonou', latitude: 6.348693, longitude: 2.314171, budget_tier: 3, rating: 4.5, phone: '+229 01 96 22 32 22', description: 'Restaurant-bar en bord de route côtière.' },
  { name: 'Le Jardin Secret', city: 'Cotonou', categories: ['food'], address: 'Boulevard de la Marina, Cotonou', latitude: 6.3570, longitude: 2.4180, budget_tier: 3, rating: 4.8, phone: '+229 91 11 11 11', description: 'Restaurant gastronomique, ambiance romantique.' },
  { name: 'Game Zone', city: 'Cotonou', categories: ['gaming'], address: 'Centre Commercial, Cotonou', latitude: 6.3600, longitude: 2.4200, budget_tier: 1, rating: 4.2, phone: '+229 92 22 22 22', description: 'Salle de jeux vidéo et bowling.' },
  { name: 'Metaverse Gaming', city: 'Cotonou', categories: ['gaming', 'bar'], address: 'Cotonou', latitude: 6.3904552, longitude: 2.3677316, budget_tier: 2, rating: 4.5, phone: '+229 01 97 91 23 12', description: 'Espace gaming VR, coworking, restauration.' },
  { name: 'The Game', city: 'Cotonou', categories: ['gaming'], address: 'Cotonou', latitude: 6.3739182, longitude: 2.4071996, budget_tier: 1, rating: 4.6, phone: '+229 01 52 27 45 45', description: 'Salle de jeux vidéo PS5, ambiance jeunes.' },
  { name: 'Kati-Kati Gaming Lounge', city: 'Cotonou', categories: ['gaming'], address: 'Ci Gusta 2, Cotonou', latitude: 6.3539207, longitude: 2.393446, budget_tier: 2, rating: 4.4, phone: '+229 01 67 74 74 44', description: 'Lounge gaming avec ambiance conviviale.' },
  { name: 'Moonlight Water Park', city: 'Cotonou', categories: ['gaming', 'food', 'rooftop'], address: 'Cotonou', latitude: 6.3574105, longitude: 2.3689504, budget_tier: 2, rating: 4.2, phone: '+229 01 66 83 83 89', description: 'Parc aquatique rooftop, arcade, familles.' },
  { name: 'Majestic Cinéma Wologuèdè', city: 'Cotonou', categories: ['cinema'], address: 'Wologuèdè, Cotonou', latitude: 6.3755308, longitude: 2.4143737, budget_tier: 1, rating: 4.2, phone: '+229 01 65 19 17 10', description: 'Salle de cinéma populaire.' },
  { name: 'Africa Sound City', city: 'Cotonou', categories: ['concert', 'bar', 'food'], address: 'Rue 2935, Cotonou', latitude: 6.3930113, longitude: 2.3646328, budget_tier: 2, rating: 4.5, phone: '+229 01 66 99 63 23', description: 'Musique live, performances culturelles, restauration.' },
  { name: 'Congress Palace', city: 'Cotonou', categories: ['concert', 'culture'], address: 'Cotonou', latitude: 6.3476683, longitude: 2.4049963, budget_tier: 2, rating: 4.2, phone: '+229 01 91 80 00 00', description: 'Palais des congrès, grand théâtre.' },
  { name: 'Centre Culturel Concerto', city: 'Cotonou', categories: ['concert', 'culture'], address: 'Cotonou', latitude: 6.3622651, longitude: 2.44704, budget_tier: 2, rating: 3.8, phone: '+229 01 99 08 66 66', description: 'Salle de concerts, ouverte jeudi-samedi.' },
  { name: 'Fondation Zinsou', city: 'Cotonou', categories: ['culture'], address: 'Haie Vive, Cotonou', latitude: 6.3580, longitude: 2.4190, budget_tier: 1, rating: 4.7, phone: '+229 01 21 18 22', description: "Centre d'art contemporain, expositions." },
  { name: 'Espace Culturel Le Centre', city: 'Cotonou', categories: ['culture'], address: 'Godomey, Cotonou', latitude: 6.3862253, longitude: 2.3183001, budget_tier: 1, rating: 4.9, phone: '+229 01 62 40 56 56', description: 'Centre culturel, jardin de sculptures, musée.' },
  { name: 'Le Musée de la Récade', city: 'Cotonou', categories: ['culture'], address: 'Godomey, Cotonou', latitude: 6.3862398, longitude: 2.3186632, budget_tier: 1, rating: 4.9, phone: '+229 01 62 40 56 56', description: 'Musée des récades royales du Dahomey.' },
  { name: 'Institut Français du Bénin', city: 'Cotonou', categories: ['culture', 'concert'], address: 'Ave Jean-Paul II, Cotonou', latitude: 6.3527723, longitude: 2.4127557, budget_tier: 1, rating: 4.2, phone: '+229 01 21 30 08 56', description: 'Théâtre, bibliothèque, programmation régulière.' },
  { name: 'Cotonou Beach', city: 'Cotonou', categories: ['plage'], address: 'Cotonou', latitude: 6.3486558, longitude: 2.3303207, budget_tier: 1, rating: 4.0, description: 'Plage publique de Cotonou.' },
  { name: 'Le Carrefour', city: 'Cotonou', categories: ['bar'], address: 'Ave Jean-Paul II, Cotonou', latitude: 6.3550, longitude: 2.4220, budget_tier: 1, rating: 4.3, phone: '+229 94 44 44 44', description: 'Bar animé avec musique live.' },

  // ── PORTO-NOVO ──────────────────────────────────────────────────
  { name: "Palais Royal Honmè", city: 'Porto-Novo', categories: ['culture'], address: 'Porto-Novo', latitude: 6.4691571, longitude: 2.6248765, budget_tier: 1, rating: 4.5, description: 'Ancien palais du roi Toffa, musée.' },
  { name: "L'Endroit by Olabissi", city: 'Porto-Novo', categories: ['food', 'bar'], address: 'Ave William Ponty, Porto-Novo', latitude: 6.472712, longitude: 2.6172574, budget_tier: 3, rating: 4.5, phone: '+229 01 60 13 56 56', description: 'Grand jardin, cuisine africaine et européenne.' },
  { name: 'Royal Plaza Rooftop', city: 'Porto-Novo', categories: ['rooftop', 'bar', 'food'], address: 'Porto-Novo Tanzoun', latitude: 6.5250535, longitude: 2.6258504, budget_tier: 2, rating: 4.8, phone: '+229 01 46 77 71 78', description: 'Rooftop, soirées traditionnelles le dimanche.' },
  { name: 'Restaurant Art Résidence', city: 'Porto-Novo', categories: ['rooftop', 'food', 'bar'], address: 'Agbokou Avakpa, Porto-Novo', latitude: 6.4825119, longitude: 2.61127, budget_tier: 2, rating: 4.6, phone: '+229 01 91 71 64 64', description: 'Restaurant-bar-rooftop.' },
  { name: "L'Escale Zévougnon", city: 'Porto-Novo', categories: ['food'], address: 'Porto-Novo', latitude: 6.4566918, longitude: 2.6209706, budget_tier: 2, rating: 4.8, phone: '+229 01 40 11 63 79', description: 'Restaurant vue lagune.' },
  { name: 'African Foodseum', city: 'Porto-Novo', categories: ['food'], address: 'Porto-Novo', latitude: 6.4733654, longitude: 2.6036404, budget_tier: 2, rating: 4.4, phone: '+229 01 62 74 76 28', description: 'Cuisine béninoise, terrasse sur lagune.' },
  { name: 'Panthéon Négro-Africain', city: 'Porto-Novo', categories: ['culture'], address: 'Place Bayol, Porto-Novo', latitude: 6.4786238, longitude: 2.6203212, budget_tier: 1, rating: 4.2, phone: '+229 01 97 54 73 97', description: 'Musée hommage aux figures noires.' },
  { name: 'Musée Salomon Biokou', city: 'Porto-Novo', categories: ['culture'], address: 'Porto-Novo', latitude: 6.4744669, longitude: 2.6277465, budget_tier: 1, rating: 4.0, description: 'Musée local à Porto-Novo.' },
  { name: 'Lagoon', city: 'Porto-Novo', categories: ['food', 'bar'], address: 'Tokpota, Porto-Novo', latitude: 6.4883353, longitude: 2.6093894, budget_tier: 1, rating: 3.0, phone: '+229 01 64 01 11 85', description: 'Espace calme, cuisine locale.' },

  // ── OUIDAH ──────────────────────────────────────────────────────
  { name: 'Plage de Ouidah', city: 'Ouidah', categories: ['plage'], address: 'Ouidah', latitude: 6.3242812, longitude: 2.0895879, budget_tier: 1, rating: 4.7, description: 'Plage mémorielle, calme.' },
  { name: 'Fosse Commune — Route des Esclaves', city: 'Ouidah', categories: ['culture'], address: 'Route des Esclaves, Ouidah', latitude: 6.3398185, longitude: 2.0893738, budget_tier: 1, rating: 5.0, description: 'Site mémoriel.' },
  { name: 'Place Chacha — Marché aux Esclaves', city: 'Ouidah', categories: ['culture'], address: 'Ouidah', latitude: 6.3564869, longitude: 2.0849461, budget_tier: 1, rating: 4.5, description: 'Ancien marché aux enchères, visite guidée.' },
  { name: 'Arbre du Non-Retour', city: 'Ouidah', categories: ['culture'], address: 'Ouidah', latitude: 6.340155, longitude: 2.0887971, budget_tier: 1, rating: 4.1, description: 'Site historique majeur.' },
  { name: 'Temple des Pythons', city: 'Ouidah', categories: ['culture'], address: 'Ouidah', latitude: 6.3595647, longitude: 2.0851368, budget_tier: 1, rating: 4.2, description: 'Temple vodoun sacré, visite guidée.' },

  // ── GRAND-POPO ──────────────────────────────────────────────────
  { name: 'Grand-Popo Centre', city: 'Grand-Popo', categories: ['plage'], address: 'RNIE 1, Grand-Popo', latitude: 6.2780278, longitude: 1.8070847, budget_tier: 1, rating: 4.4, description: 'Ville côtière, cuisine locale.' },
  { name: 'Awalé Plage', city: 'Grand-Popo', categories: ['plage', 'food', 'bar'], address: 'Ewe Condji, Grand-Popo', latitude: 6.270213, longitude: 1.786942, budget_tier: 2, rating: 3.9, phone: '+229 01 95 50 29 15', description: 'Hôtel-restaurant, piscine, accès plage.' },
  { name: 'Chez Mathias Coco Beach', city: 'Grand-Popo', categories: ['plage', 'bar', 'food'], address: 'Route Pavée, Grand-Popo', latitude: 6.2740279, longitude: 1.8060648, budget_tier: 2, rating: 4.2, phone: '+229 01 97 18 22 46', description: 'Restaurant-bungalows bord de plage.' },
  { name: 'OFF Resort', city: 'Grand-Popo', categories: ['plage'], address: 'Agoué, Grand-Popo', latitude: 6.2537818, longitude: 1.7066385, budget_tier: 3, rating: 4.4, phone: '+229 01 97 98 54 33', description: 'Bungalows, piscines privées, plage privée.' },
  { name: 'The Yacht by Nostress.bj', city: 'Grand-Popo', categories: ['plage', 'food'], address: 'Houssoukouè, Grand-Popo', latitude: 6.2777901, longitude: 1.8227044, budget_tier: 3, rating: 4.1, phone: '+229 01 57 53 17 90', description: 'Restaurant-hôtel, spécialité poisson.' },

  // ── ABOMEY ──────────────────────────────────────────────────────
  { name: "Palais Royal d'Abomey", city: 'Abomey', categories: ['culture'], address: 'Abomey', latitude: 7.1855024, longitude: 1.997943, budget_tier: 1, rating: 4.6, description: 'Site UNESCO, bas-reliefs.' },
  { name: 'Palais du Roi Béhanzin', city: 'Abomey', categories: ['culture'], address: 'Abomey', latitude: 7.1828881, longitude: 2.0249007, budget_tier: 1, rating: 4.2, description: 'Résidence royale, patrimoine du Dahomey.' },
  { name: 'Musée Historique d\'Abomey', city: 'Abomey', categories: ['culture'], address: 'Abomey', latitude: 7.1863091, longitude: 1.9943789, budget_tier: 1, rating: 3.4, description: 'Musée du royaume du Dahomey.' },
  { name: 'Exposition Béhanzin', city: 'Abomey', categories: ['culture'], address: 'Rue du Palais Royal, Abomey', latitude: 7.1839858, longitude: 1.9925878, budget_tier: 1, rating: 3.7, description: 'Exposition dédiée au roi Béhanzin.' },
  { name: 'Palais Royal Gbindôdo', city: 'Abomey', categories: ['culture'], address: 'Abomey', latitude: 7.1632405, longitude: 2.0187098, budget_tier: 1, rating: 3.6, description: 'Palais royal, guide recommandé.' },

  // ── PARAKOU ─────────────────────────────────────────────────────
  { name: 'Lounge Bar Chez Nabil', city: 'Parakou', categories: ['bar', 'food', 'concert'], address: 'Parakou', latitude: 9.3586907, longitude: 2.6169432, budget_tier: 1, rating: 3.9, phone: '+229 01 61 71 39 39', description: 'Restaurant-nightclub, musique forte.' },
  { name: 'Bar Restau Chez Lebini', city: 'Parakou', categories: ['bar', 'food'], address: 'Parakou', latitude: 9.3439943, longitude: 2.5896349, budget_tier: 2, rating: 4.5, phone: '+229 01 96 66 72 13', description: 'Bar-restaurant local.' },
  { name: 'Mix Club Parakou', city: 'Parakou', categories: ['bar', 'concert'], address: 'Parakou', latitude: 9.366125, longitude: 2.6316014, budget_tier: 2, rating: 4.3, description: 'Club/bar populaire.' },
  { name: 'Le Secret de la Vieille Marmite', city: 'Parakou', categories: ['food'], address: 'Parakou', latitude: 9.3566623, longitude: 2.614329, budget_tier: 2, rating: 4.0, phone: '+229 01 66 22 29 39', description: 'Cuisine béninoise variée.' },
  { name: 'Maquis Le Mono', city: 'Parakou', categories: ['food'], address: 'Route de Transa, Parakou', latitude: 9.3430563, longitude: 2.624941, budget_tier: 1, rating: 3.8, phone: '+229 01 96 33 79 29', description: 'Buffet cuisine béninoise.' },
  { name: 'Espace Culturel Windekpé', city: 'Parakou', categories: ['culture', 'concert'], address: 'Quartier Nima, Parakou', latitude: 9.3519628, longitude: 2.6475268, budget_tier: 1, rating: 4.3, phone: '+229 01 95 54 89 79', description: 'Espace culturel, spectacles.' },
  { name: 'Cave du Nord', city: 'Parakou', categories: ['bar', 'concert'], address: 'Parakou', latitude: 9.3487903, longitude: 2.6198356, budget_tier: 3, rating: 4.3, phone: '+229 01 97 57 60 57', description: 'Bar-lounge chic, DJ, ouvert tard.' },
];

/* ------------------------------------------------------------------ */
/*  EVENTS                                                             */
/* ------------------------------------------------------------------ */
function buildEvents(partnerIds, venueIds) {
  const now = new Date();
  const day = (d) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(20, 0, 0, 0); return x; };
  const hour = (d, h) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x; };
  const addH = (d, h) => new Date(d.getTime() + h * 3600000);

  const concertVenue = venueIds.find((v) => v.name === 'Africa Sound City');
  const rooftopVenue = venueIds.find((v) => v.name === 'Hi Five Rooftop');
  const cultureVenue = venueIds.find((v) => v.name === 'Fondation Zinsou');
  const barVenue = venueIds.find((v) => v.name === 'Moon Bar-Restaurant');
  const gameVenue = venueIds.find((v) => v.name === 'Metaverse Gaming');
  const palais = venueIds.find((v) => v.name === "Palais Royal d'Abomey");

  const organizer = partnerIds.find((p) => p.name === 'Africa Sound City');

  const events = [
    {
      name: 'Festival Afro-Jazz',
      description: 'Concert de musique jazz africaine avec artistes internationaux',
      venueId: concertVenue?._id,
      organizerId: organizer?._id,
      startAt: day(3),
      endAt: addH(day(3), 4),
      capacity: 2000,
      ticketTypes: [
        { name: 'Standard', price: 5000, quantity: 1500, remaining: 1500, commissionRate: 8 },
        { name: 'VIP', price: 15000, quantity: 500, remaining: 500, commissionRate: 10 },
      ],
      categories: ['musique', 'jazz', 'concert'],
      status: 'published',
      isFeatured: true,
      tags: ['concert', 'jazz', 'international'],
    },
    {
      name: 'Soirée Électro au Moonlight',
      description: 'DJ set avec artistes locaux et internationaux',
      venueId: barVenue?._id,
      organizerId: organizer?._id,
      startAt: day(5),
      endAt: addH(day(5), 5),
      capacity: 500,
      ticketTypes: [
        { name: 'Entrée', price: 3000, quantity: 500, remaining: 500, commissionRate: 8 },
      ],
      categories: ['musique', 'electro', 'soirée'],
      status: 'published',
      tags: ['electro', 'dj', 'nightlife'],
    },
    {
      name: 'Exposition Art Contemporain Béninois',
      description: 'Exposition collective de 12 artistes béninois contemporains',
      venueId: cultureVenue?._id,
      startAt: day(1),
      endAt: addH(day(14), 8),
      capacity: 100,
      ticketTypes: [
        { name: 'Entrée', price: 1000, quantity: 100, remaining: 100, commissionRate: 5 },
      ],
      categories: ['art', 'exposition', 'culture'],
      status: 'published',
      isFeatured: true,
      tags: ['art', 'exposition', 'contemporain'],
    },
    {
      name: 'Di-vin Sunday — Jazz & Brunch',
      description: 'Brunch dominical avec jazz live sur le rooftop',
      venueId: rooftopVenue?._id,
      startAt: day(6),
      endAt: addH(day(6), 5),
      capacity: 120,
      ticketTypes: [
        { name: 'Brunch + Concert', price: 12000, quantity: 120, remaining: 120, commissionRate: 8 },
      ],
      categories: ['brunch', 'jazz', 'rooftop'],
      status: 'published',
      tags: ['brunch', 'jazz', 'dimanche'],
    },
    {
      name: 'Tournoi Gaming — Metaverse Cup',
      description: 'Tournoi FIFA & Fortnite, prix pour les gagnants',
      venueId: gameVenue?._id,
      startAt: day(7),
      endAt: addH(day(7), 6),
      capacity: 80,
      ticketTypes: [
        { name: 'Joueur', price: 5000, quantity: 60, remaining: 60, commissionRate: 10 },
        { name: 'Spectateur', price: 2000, quantity: 20, remaining: 20, commissionRate: 5 },
      ],
      categories: ['gaming', 'tournoi', 'compétition'],
      status: 'published',
      tags: ['gaming', 'fifa', 'fortnite'],
    },
    {
      name: 'Visite Guidée des Palais Royaux',
      description: 'Visite guidée du site UNESCO avec conteur local',
      venueId: palais?._id,
      startAt: day(2),
      endAt: addH(day(2), 3),
      capacity: 30,
      ticketTypes: [
        { name: 'Visite guidée', price: 3000, quantity: 30, remaining: 30, commissionRate: 5 },
      ],
      categories: ['culture', 'histoire', 'visite'],
      status: 'published',
      tags: ['unesco', 'histoire', 'guide'],
    },
  ];

  return events;
}

/* ------------------------------------------------------------------ */
/*  REVIEWS — reviews réalistes                                        */
/* ------------------------------------------------------------------ */
function buildReviews(userIds, venueIds) {
  const r = (userIdIdx, venueIdx, rating, title, comment) => ({
    user: userIds[userIdIdx]?._id,
    venue: venueIds[venueIdx]?._id,
    rating, title, comment,
    helpfulCount: Math.floor(Math.random() * 20),
  });

  return [
    r(2, 0, 5, 'Incroyable ambiance', 'Le meilleur rooftop de Cotonou ! La vue est magnifique et les cocktails sont délicieux.'),
    r(2, 6, 4, 'Cuisine raffinée', 'Plats excellents, un peu cher mais ça vaut le coup pour une occasion spéciale.'),
    r(3, 1, 5, 'Vue nocturne magique', 'On voit toute la ville de là-haut, parfait pour une soirée romantique.'),
    r(2, 4, 4, 'Ambiance plage', 'Très bon endroit pour se détendre le week-end, musique chill.'),
    r(3, 8, 5, 'Parfait pour les enfants', 'Les enfants ont adoré le parc aquatique, on y retournera !'),
    r(2, 7, 3, 'Correct mais basique', 'PS5 disponible mais l\'espace est petit. Convient pour un passage rapide.'),
    r(2, 14, 5, 'Expo bluffante', 'Les expositions de la Fondation Zinsou sont toujours au top.'),
    r(3, 15, 5, 'Musée incontournable', 'Vraiment instructif, les guides sont passionnés.'),
    r(2, 13, 4, 'Bonne surprise', 'On ne s\'attendait pas à un tel espace culturel dans ce quartier.'),
    r(3, 24, 5, 'Authentique Porto-Novo', 'Le meilleur restaurant de la capitale, cuisine traditionnelle.'),
    r(2, 26, 4, 'Vue lagune', 'Très beau cadre, un peu long à servir.'),
    r(3, 30, 5, 'Plage préservée', 'On se sent à l\'autre bout du monde, magnifique.'),
    r(2, 31, 4, 'Très bon cadre', 'Les bungalows sont sympas, le service moyen.'),
    r(2, 34, 4, 'Inoubliable', 'Les pythons sont fascinants, expérience unique !'),
    r(3, 42, 5, 'Nightlife Parakou', 'La Cave du Nord a une super ambiance le samedi.'),
  ];
}

/* ------------------------------------------------------------------ */
/*  MAIN SEED                                                          */
/* ------------------------------------------------------------------ */
async function seed() {
  try {
    console.log('🔗 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté\n');

    // 1. Clear all
    console.log('🧹 Nettoyage...');
    await Promise.all([
      User.deleteMany({}),
      Partner.deleteMany({}),
      Venue.deleteMany({}),
      Event.deleteMany({}),
      Review.deleteMany({}),
    ]);
    console.log('   Collections nettoyées\n');

    // 2. Users
    console.log('👤 Création des utilisateurs...');
    const hashedUsers = await Promise.all(
      usersData.map(async (u) => ({
        ...u,
        password: await bcrypt.hash(u.password, 12),
      })),
    );
    const createdUsers = await User.insertMany(hashedUsers);
    console.log(`   ✅ ${createdUsers.length} utilisateurs créés`);

    // 3. Partners
    console.log('🤝 Création des partenaires...');
    const createdPartners = await Partner.insertMany(partnersData);
    console.log(`   ✅ ${createdPartners.length} partenaires créés`);

    // 4. Venues
    console.log('📍 Création des lieux...');
    const gardenPartner = createdPartners.find((p) => p.name === 'The Garden Cotonou');
    const soundPartner = createdPartners.find((p) => p.name === 'Africa Sound City');
    const resortPartner = createdPartners.find((p) => p.name === 'Plage Resort Grand-Popo');
    const cavePartner = createdPartners.find((p) => p.name === 'Cave du Nord Parakou');

    const venuesToInsert = venuesRaw.map((v) => {
      const mainCat = v.categories[0];
      const price = budgetTierToPrice[v.budget_tier] || { min: 2000, max: 8000, average: 5000 };
      let partnerId = null;
      if (v.name === 'The Garden Rooftop') partnerId = gardenPartner?._id;
      else if (v.name === 'Africa Sound City') partnerId = soundPartner?._id;
      else if (['Awalé Plage', 'OFF Resort', 'The Yacht by Nostress.bj'].includes(v.name)) partnerId = resortPartner?._id;
      else if (v.name === 'Cave du Nord') partnerId = cavePartner?._id;

      return {
        name: v.name,
        description: v.description,
        category: categoryMap[mainCat] || 'culture',
        categories: v.categories.slice(1).map((c) => categoryMap[c] || c),
        latitude: v.latitude,
        longitude: v.longitude,
        address: v.address,
        city: v.city,
        phone: v.phone || undefined,
        rating: v.rating || 0,
        reviewCount: Math.floor(Math.random() * 200) + 10,
        priceRange: { ...price, unit: 'per_person' },
        status: partnerId ? 'partner' : 'verified',
        verificationStatus: 'source_backed',
        sourceTier: 'tourism_official',
        partnerId,
        isActive: true,
        tags: v.categories,
        capacity: Math.floor(Math.random() * 500) + 20,
        openingHours: [
          { day: 'monday', open: '10:00', close: '23:00' },
          { day: 'tuesday', open: '10:00', close: '23:00' },
          { day: 'wednesday', open: '10:00', close: '23:00' },
          { day: 'thursday', open: '10:00', close: '23:00' },
          { day: 'friday', open: '10:00', close: '00:00' },
          { day: 'saturday', open: '10:00', close: '02:00' },
          { day: 'sunday', open: '12:00', close: '22:00' },
        ],
      };
    });

    const createdVenues = await Venue.insertMany(venuesToInsert);
    console.log(`   ✅ ${createdVenues.length} lieux créés`);

    // Update partners with venues
    for (const partner of createdPartners) {
      const partnerVenues = createdVenues.filter((v) => v.partnerId?.toString() === partner._id.toString());
      if (partnerVenues.length > 0) {
        await Partner.findByIdAndUpdate(partner._id, {
          venues: partnerVenues.map((v) => v._id),
          totalBookings: Math.floor(Math.random() * 50),
          totalRevenue: Math.floor(Math.random() * 500000),
          rating: 4.0 + Math.random() * 0.8,
        });
      }
    }

    // 5. Events
    console.log('🎉 Création des événements...');
    const eventsData = buildEvents(createdPartners, createdVenues);
    const validEvents = eventsData.filter((e) => e.venueId);
    const createdEvents = await Event.insertMany(validEvents);
    console.log(`   ✅ ${createdEvents.length} événements créés`);

    // 6. Reviews
    console.log('⭐ Création des reviews...');
    const testUsers = createdUsers.filter((u) => u.role === 'user');
    const topVenues = createdVenues.slice(0, 20);
    const reviewsData = buildReviews(testUsers, topVenues).filter(
      (r) => r.user && r.venue,
    );
    const createdReviews = await Review.insertMany(reviewsData);
    console.log(`   ✅ ${createdReviews.length} reviews créées`);

    // 7. Summary
    console.log('\n' + '═'.repeat(50));
    console.log('🎉  SEED TERMINÉ AVEC SUCCÈS');
    console.log('═'.repeat(50));

    const byCity = {};
    createdVenues.forEach((v) => { byCity[v.city] = (byCity[v.city] || 0) + 1; });
    console.log('\n📍 Lieux par ville :');
    Object.entries(byCity).forEach(([city, n]) => console.log(`   ${city}: ${n}`));

    console.log('\n👤 Comptes de test :');
    console.log('   Super Admin : superadmin@moment.bj / Admin@123');
    console.log('   Admin       : admin@moment.bj / Admin@123');
    console.log('   User        : jean@moment.bj / User@123');
    console.log('   User        : marie@moment.bj / User@123');
    console.log('   Partner     : partner@moment.bj / Partner@123');

    console.log('\n📊 Résumé :');
    console.log(`   Users: ${createdUsers.length}`);
    console.log(`   Partners: ${createdPartners.length}`);
    console.log(`   Venues: ${createdVenues.length}`);
    console.log(`   Events: ${createdEvents.length}`);
    console.log(`   Reviews: ${createdReviews.length}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur seed:', error);
    process.exit(1);
  }
}

seed();
