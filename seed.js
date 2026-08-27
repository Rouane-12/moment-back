require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('./models/Venue');

const venues = [
  {
    name: 'Plage de Fidjrossè',
    description: 'Belle plage de sable fin avec restaurants et bars',
    category: 'plage',
    latitude: 6.3536,
    longitude: 2.4175,
    address: 'Route de la Plage, Cotonou',
    district: 'Fidjrossè',
    city: 'Cotonou',
    phone: '+229 90 00 00 00',
    rating: 4.5,
    reviewCount: 120,
    priceRange: { min: 2000, max: 10000, average: 5000 },
    status: 'verified',
    openingHours: [
      { day: 'monday', open: '08:00', close: '22:00' },
      { day: 'tuesday', open: '08:00', close: '22:00' },
      { day: 'wednesday', open: '08:00', close: '22:00' },
      { day: 'thursday', open: '08:00', close: '22:00' },
      { day: 'friday', open: '08:00', close: '23:00' },
      { day: 'saturday', open: '08:00', close: '23:00' },
      { day: 'sunday', open: '08:00', close: '22:00' }
    ],
    tags: ['plage', 'restaurant', 'bar', 'familial'],
    capacity: 500
  },
  {
    name: 'Le Jardin Secret',
    description: 'Restaurant gastronomique avec ambiance romantique',
    category: 'food',
    latitude: 6.3570,
    longitude: 2.4180,
    address: 'Boulevard de la Marina, Cotonou',
    district: 'Haie Vive',
    city: 'Cotonou',
    phone: '+229 91 00 00 00',
    rating: 4.8,
    reviewCount: 85,
    priceRange: { min: 8000, max: 25000, average: 15000 },
    status: 'verified',
    openingHours: [
      { day: 'monday', open: '12:00', close: '23:00' },
      { day: 'tuesday', open: '12:00', close: '23:00' },
      { day: 'wednesday', open: '12:00', close: '23:00' },
      { day: 'thursday', open: '12:00', close: '23:00' },
      { day: 'friday', open: '12:00', close: '00:00' },
      { day: 'saturday', open: '12:00', close: '00:00' },
      { day: 'sunday', open: '12:00', close: '23:00' }
    ],
    tags: ['gastronomique', 'romantique', 'vin'],
    capacity: 80
  },
  {
    name: 'Game Zone',
    description: 'Salle de jeux vidéo et bowling',
    category: 'gaming',
    latitude: 6.3600,
    longitude: 2.4200,
    address: 'Centre Commercial, Cotonou',
    district: 'Gbèdjromèdé',
    city: 'Cotonou',
    phone: '+229 92 00 00 00',
    rating: 4.2,
    reviewCount: 200,
    priceRange: { min: 3000, max: 8000, average: 5000 },
    status: 'verified',
    openingHours: [
      { day: 'monday', open: '10:00', close: '22:00' },
      { day: 'tuesday', open: '10:00', close: '22:00' },
      { day: 'wednesday', open: '10:00', close: '22:00' },
      { day: 'thursday', open: '10:00', close: '22:00' },
      { day: 'friday', open: '10:00', close: '23:00' },
      { day: 'saturday', open: '10:00', close: '23:00' },
      { day: 'sunday', open: '14:00', close: '20:00' }
    ],
    tags: ['jeux vidéo', 'bowling', 'billard'],
    capacity: 150
  },
  {
    name: 'Sky Bar',
    description: 'Bar rooftop avec vue panoramique sur la ville',
    category: 'rooftop',
    latitude: 6.3650,
    longitude: 2.4250,
    address: 'Immeuble Azalï, Cotonou',
    district: 'Cadjèhoun',
    city: 'Cotonou',
    phone: '+229 93 00 00 00',
    rating: 4.6,
    reviewCount: 95,
    priceRange: { min: 5000, max: 15000, average: 8000 },
    status: 'verified',
    openingHours: [
      { day: 'monday', open: '17:00', close: '01:00' },
      { day: 'tuesday', open: '17:00', close: '01:00' },
      { day: 'wednesday', open: '17:00', close: '01:00' },
      { day: 'thursday', open: '17:00', close: '02:00' },
      { day: 'friday', open: '17:00', close: '02:00' },
      { day: 'saturday', open: '17:00', close: '03:00' },
      { day: 'sunday', open: '17:00', close: '01:00' }
    ],
    tags: ['rooftop', 'cocktails', 'vue', 'nightlife'],
    capacity: 120
  },
  {
    name: 'Le Carrefour',
    description: 'Bar animé avec musique live',
    category: 'bar',
    latitude: 6.3550,
    longitude: 2.4220,
    address: 'Avenue Jean-Paul II, Cotonou',
    district: 'Akpakpa',
    city: 'Cotonou',
    phone: '+229 94 00 00 00',
    rating: 4.3,
    reviewCount: 150,
    priceRange: { min: 2000, max: 6000, average: 3500 },
    status: 'verified',
    openingHours: [
      { day: 'monday', open: '16:00', close: '02:00' },
      { day: 'tuesday', open: '16:00', close: '02:00' },
      { day: 'wednesday', open: '16:00', close: '02:00' },
      { day: 'thursday', open: '16:00', close: '03:00' },
      { day: 'friday', open: '16:00', close: '03:00' },
      { day: 'saturday', open: '16:00', close: '04:00' },
      { day: 'sunday', open: '16:00', close: '01:00' }
    ],
    tags: ['bar', 'musique', 'ambiance'],
    capacity: 100
  },
  {
    name: 'Canal Olympia',
    description: 'Salle de concert et événements culturels',
    category: 'concert',
    latitude: 6.3620,
    longitude: 2.4280,
    address: 'Boulevard de la Francophonie, Cotonou',
    district: 'Cadjèhoun',
    city: 'Cotonou',
    phone: '+229 95 00 00 00',
    rating: 4.4,
    reviewCount: 180,
    priceRange: { min: 3000, max: 20000, average: 8000 },
    status: 'verified',
    openingHours: [
      { day: 'monday', open: '10:00', close: '22:00' },
      { day: 'tuesday', open: '10:00', close: '22:00' },
      { day: 'wednesday', open: '10:00', close: '22:00' },
      { day: 'thursday', open: '10:00', close: '22:00' },
      { day: 'friday', open: '10:00', close: '23:00' },
      { day: 'saturday', open: '10:00', close: '23:00' },
      { day: 'sunday', open: '14:00', close: '20:00' }
    ],
    tags: ['concert', 'culture', 'spectacle'],
    capacity: 2000
  },
  {
    name: 'Fondation Zinsou',
    description: 'Centre d\'art contemporain et expositions',
    category: 'culture',
    latitude: 6.3580,
    longitude: 2.4190,
    address: 'Rue des Arts, Cotonou',
    district: 'Haie Vive',
    city: 'Cotonou',
    phone: '+229 96 00 00 00',
    rating: 4.7,
    reviewCount: 60,
    priceRange: { min: 0, max: 2000, average: 500 },
    status: 'verified',
    openingHours: [
      { day: 'monday', open: '10:00', close: '18:00' },
      { day: 'tuesday', open: '10:00', close: '18:00' },
      { day: 'wednesday', open: '10:00', close: '18:00' },
      { day: 'thursday', open: '10:00', close: '18:00' },
      { day: 'friday', open: '10:00', close: '18:00' },
      { day: 'saturday', open: '10:00', close: '18:00' },
      { day: 'sunday', isClosed: true }
    ],
    tags: ['art', 'culture', 'exposition', 'gratuit'],
    capacity: 50
  },
  {
    name: 'Canal Olympia Cinéma',
    description: 'Salle de cinéma moderne',
    category: 'cinema',
    latitude: 6.3625,
    longitude: 2.4285,
    address: 'Boulevard de la Francophonie, Cotonou',
    district: 'Cadjèhoun',
    city: 'Cotonou',
    phone: '+229 97 00 00 00',
    rating: 4.5,
    reviewCount: 220,
    priceRange: { min: 3000, max: 8000, average: 5000 },
    status: 'verified',
    openingHours: [
      { day: 'monday', open: '13:00', close: '23:00' },
      { day: 'tuesday', open: '13:00', close: '23:00' },
      { day: 'wednesday', open: '13:00', close: '23:00' },
      { day: 'thursday', open: '13:00', close: '23:00' },
      { day: 'friday', open: '13:00', close: '00:00' },
      { day: 'saturday', open: '10:00', close: '00:00' },
      { day: 'sunday', open: '10:00', close: '23:00' }
    ],
    tags: ['cinéma', 'films', '3D'],
    capacity: 300
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // Clear existing venues
    await Venue.deleteMany({});
    console.log('Cleared existing venues');

    // Insert new venues
    await Venue.insertMany(venues);
    console.log(`Inserted ${venues.length} venues`);

    console.log('Seed completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
