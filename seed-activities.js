/**
 * Seed des lieux d'activités — données initiales vérifiées (Bénin).
 * Usage : node seed-activities.js
 *
 * Les champs non vérifiés sont null (pas de coordonnées inventées).
 */
const mongoose = require('mongoose');
const ActivityVenue = require('./models/ActivityVenue');
require('dotenv').config();

const ACTIVITIES = [
  // ── Football ─────────────────────────────────────────────────
  { id: 1, nom: 'Berry Football Academy', activity: 'football', adresse: 'Togbin, Route des Pêches', quartier: 'Togbin', ville: 'Cotonou', telephone: '+229 62 35 31 20', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Sam 16h-18h', maps: 'https://www.google.com/maps/search/?api=1&query=Berry+Football+Academy+Cotonou' },
  { id: 2, nom: 'Djeffa FC football club', activity: 'football', adresse: null, quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 97 11 55 27', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Ven 10h-19h', maps: 'https://www.google.com/maps/search/?api=1&query=Djeffa+FC+Cotonou' },
  { id: 3, nom: 'Football club', activity: 'football', adresse: '9CHV+JJF', quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 01 96 81 12 67', whatsapp: null, lat: null, lng: null, horaires: '24h selon fiche', maps: 'https://www.google.com/maps/search/?api=1&query=9CHV%2BJJF+Cotonou' },
  { id: 4, nom: 'Elites Football Academy Calavi', activity: 'football', adresse: null, quartier: null, ville: 'Abomey-Calavi', telephone: '+229 01 66 85 52 24', whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=Elites+Football+Academy+Calavi' },
  { id: 5, nom: 'Académie Jeunes Talents (JAT FC)', activity: 'football', adresse: null, quartier: null, ville: 'Abomey-Calavi', telephone: '+229 01 54 05 68 34', whatsapp: null, lat: null, lng: null, horaires: 'Mar-Sam 14h-18h30', maps: 'https://www.google.com/maps/search/?api=1&query=Academie+Jeunes+Talents+JAT+FC+Calavi' },

  // ── Boxe ─────────────────────────────────────────────────────
  { id: 6, nom: 'CFC (Cotonou Fighting Club)', activity: 'boxe', adresse: 'Houeyiho', quartier: 'Houeyiho', ville: 'Cotonou', telephone: '+229 91 76 55 55', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Ven 7h-22h30', maps: 'https://www.google.com/maps/search/?api=1&query=Cotonou+Fighting+Club' },
  { id: 7, nom: 'SAMARI CLUB Fitness Boxe Yoga et Bien-Etre', activity: 'boxe', adresse: 'Rue 2356, immeuble Jean Pliya', quartier: 'Vedoco', ville: 'Cotonou', telephone: '+229 01 52 03 76 31', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Ven 7h-22h; Sam 7h-14h', maps: 'https://www.google.com/maps/search/?api=1&query=SAMARI+CLUB+Cotonou' },
  { id: 8, nom: 'Les Champions / Espoir Boxing Club', activity: 'boxe', adresse: null, quartier: null, ville: 'Cotonou', telephone: '+229 61 65 57 60', whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=Espoir+Boxing+Club+Cotonou' },
  { id: 9, nom: 'DojoLand Akpakpa', activity: 'boxe', adresse: 'Ciné Concorde', quartier: 'Akpakpa', ville: 'Cotonou', telephone: '+229 01 40 88 28 28', whatsapp: null, lat: null, lng: null, horaires: 'Selon programme', maps: 'https://www.google.com/maps/search/?api=1&query=DojoLand+Akpakpa+Cotonou' },
  { id: 10, nom: 'DojoLand Fidjrossè', activity: 'boxe', adresse: null, quartier: 'Fidjrossè', ville: 'Cotonou', telephone: '+229 01 40 88 28 28', whatsapp: null, lat: null, lng: null, horaires: 'Selon programme', maps: 'https://www.google.com/maps/search/?api=1&query=DojoLand+Fidjrosse+Cotonou' },

  // ── Musculation & Fitness ────────────────────────────────────
  { id: 11, nom: 'Momentum - Gym Premium', activity: 'musculation_gym', adresse: '9946+492', quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 01 62 33 49 56', whatsapp: null, lat: null, lng: null, horaires: '6h-22h; Dim 8h-14h', maps: 'https://www.google.com/maps/search/?api=1&query=Momentum+Gym+Premium+Cotonou' },
  { id: 12, nom: 'Ola Fitness Club', activity: 'musculation_gym', adresse: null, quartier: 'Gbèdjromédé', ville: 'Cotonou', telephone: '+229 97 97 20 87', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Ven 7h-22h; Sam 7h-20h; Dim 7h-12h', maps: 'https://www.google.com/maps/search/?api=1&query=Ola+Fitness+Club+Cotonou' },
  { id: 13, nom: 'Flex Fitness', activity: 'musculation_gym', adresse: 'Rue 2356', quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 01 61 23 69 69', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Ven 7h-22h', maps: 'https://www.google.com/maps/search/?api=1&query=Flex+Fitness+Cotonou' },
  { id: 14, nom: 'La Fabrique 3S - Salle de Sport & Fitness', activity: 'musculation_gym', adresse: null, quartier: 'Zogbo', ville: 'Cotonou', telephone: '+229 59 57 57 17', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Sam 7h-22h', maps: 'https://www.google.com/maps/search/?api=1&query=La+Fabrique+3S+Cotonou' },
  { id: 15, nom: "Let's Go Gym", activity: 'musculation_gym', adresse: null, quartier: 'Fidjrossè', ville: 'Cotonou', telephone: '+229 01 52 65 43 43', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Sam 6h30-22h30', maps: 'https://www.google.com/maps/search/?api=1&query=Lets+Go+Gym+Fidjrosse+Cotonou' },

  // ── Tennis & Padel ───────────────────────────────────────────
  { id: 16, nom: 'Benin Tennis Club', activity: 'tennis_padel', adresse: null, quartier: null, ville: 'Cotonou', telephone: '+229 01 96 74 33 01', whatsapp: null, lat: null, lng: null, horaires: '6h-00h', maps: 'https://www.google.com/maps/search/?api=1&query=Benin+Tennis+Club+Cotonou' },
  { id: 17, nom: 'Cotonou Padel Club', activity: 'tennis_padel', adresse: 'Togbin, Route des Pêches', quartier: 'Togbin', ville: 'Cotonou', telephone: '+229 01 46 09 95 72', whatsapp: null, lat: 6.34944, lng: 2.32039, horaires: 'Lun-Ven 6h30-23h30; Sam 8h-23h30; Dim 8h-22h', maps: 'https://www.google.com/maps/search/?api=1&query=6.34944,2.32039' },
  { id: 18, nom: 'GRAIN DE PASSION Tennis Club', activity: 'tennis_padel', adresse: null, quartier: null, ville: 'Abomey-Calavi', telephone: '+229 97 82 49 35', whatsapp: null, lat: null, lng: null, horaires: '7h-22h', maps: 'https://www.google.com/maps/search/?api=1&query=Grain+de+Passion+Tennis+Club+Calavi' },
  { id: 19, nom: 'Arconville Tennis club', activity: 'tennis_padel', adresse: null, quartier: 'Arconville', ville: 'Abomey-Calavi', telephone: null, whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=Arconville+Tennis+Club+Benin' },
  { id: 20, nom: 'Bénin Sport / B-Sport', activity: 'tennis_padel', adresse: 'Calavi Zopah', quartier: 'Zopah', ville: 'Abomey-Calavi', telephone: '+229 41 18 71 29', whatsapp: null, lat: null, lng: null, horaires: 'Selon programme', maps: 'https://www.google.com/maps/search/?api=1&query=B-Sport+Tennis+Calavi+Zopah' },

  // ── Natation ─────────────────────────────────────────────────
  { id: 21, nom: 'Golden Tulip Le Diplomate Cotonou', activity: 'natation', adresse: 'Boulevard de la Marina', quartier: 'Marina', ville: 'Cotonou', telephone: '+229 01 98 30 02 00', whatsapp: null, lat: null, lng: null, horaires: 'Selon hôtel', maps: 'https://www.google.com/maps/search/?api=1&query=Golden+Tulip+Le+Diplomate+Cotonou' },
  { id: 22, nom: 'El Dorado Beach Club', activity: 'natation', adresse: '46 rue 1143A', quartier: null, ville: 'Cotonou', telephone: '+229 97 42 23 02', whatsapp: null, lat: null, lng: null, horaires: '8h-20h', maps: 'https://www.google.com/maps/search/?api=1&query=El+Dorado+Beach+Club+Cotonou' },
  { id: 23, nom: 'Le Cosy Pool', activity: 'natation', adresse: "Route de l'Aéroport", quartier: null, ville: 'Cotonou', telephone: '+229 66 68 59 60', whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=Le+Cosy+Pool+Cotonou' },
  { id: 24, nom: "L'Adresse Cotonou", activity: 'natation', adresse: null, quartier: "Patte d'Oie", ville: 'Cotonou', telephone: '+229 96 53 79 17', whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=LAdresse+Cotonou+Patte+dOie' },
  { id: 25, nom: 'Myosotis Residence Hôtel', activity: 'natation', adresse: null, quartier: 'Ganhi', ville: 'Cotonou', telephone: '+229 21 31 16 78', whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=Myosotis+Residence+Hotel+Cotonou' },

  // ── Cyclisme ─────────────────────────────────────────────────
  { id: 26, nom: 'Fédération Béninoise de Cyclisme', activity: 'cyclisme_velo', adresse: null, quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 95 05 58 58', whatsapp: null, lat: null, lng: null, horaires: 'Lun-Ven 8h-17h', maps: 'https://www.google.com/maps/search/?api=1&query=Federation+Beninoise+de+Cyclisme+Cotonou' },
  { id: 27, nom: 'Koin Koin Vélo', activity: 'cyclisme_velo', adresse: 'Rue 308', quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 01 61 69 40 14', whatsapp: null, lat: null, lng: null, horaires: 'Selon réservation', maps: 'https://www.google.com/maps/search/?api=1&query=Koin+Koin+Velo+Cotonou' },
  { id: 28, nom: 'Oreka Mobility', activity: 'cyclisme_velo', adresse: null, quartier: 'Cotonou', ville: 'Cotonou', telephone: null, whatsapp: null, lat: null, lng: null, horaires: 'Selon activité', maps: 'https://www.google.com/maps/search/?api=1&query=Oreka+Mobility+Cotonou' },
  { id: 29, nom: 'Rando Vélo Bénin', activity: 'cyclisme_velo', adresse: 'Point de rencontre : Pétank Bar Fidjrossè', quartier: 'Fidjrossè', ville: 'Cotonou', telephone: null, whatsapp: null, lat: null, lng: null, horaires: 'Selon réservation', maps: 'https://www.google.com/maps/search/?api=1&query=Petank+Bar+Fidjrosse+Cotonou' },
  { id: 30, nom: 'Route des Pêches', activity: 'cyclisme_velo', adresse: null, quartier: 'Togbin/Fidjrossè', ville: 'Cotonou', telephone: null, whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=Route+des+Peches+Cotonou' },

  // ── Basketball ───────────────────────────────────────────────
  { id: 31, nom: 'Basket Academy', activity: 'basketball', adresse: 'BP 5531', quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 97 34 58 20', whatsapp: null, lat: null, lng: null, horaires: 'Mer 19h-21h30; Sam 7h-11h; Dim 16h-19h', maps: 'https://www.google.com/maps/search/?api=1&query=Basket+Academy+Cotonou' },
  { id: 32, nom: 'Renaissance BBC', activity: 'basketball', adresse: null, quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 01 61 54 55 61', whatsapp: null, lat: null, lng: null, horaires: 'Selon entraînements', maps: 'https://www.google.com/maps/search/?api=1&query=Renaissance+BBC+Cotonou' },
  { id: 33, nom: 'The Future Basketball', activity: 'basketball', adresse: 'C/SB Gbedokpo', quartier: 'Gbedokpo', ville: 'Cotonou', telephone: '+229 98 34 98 98', whatsapp: null, lat: null, lng: null, horaires: 'Selon programme', maps: 'https://www.google.com/maps/search/?api=1&query=The+Future+Basketball+Gbedokpo+Cotonou' },
  { id: 34, nom: 'Espace Basket-Ball', activity: 'basketball', adresse: 'Complexe Scolaire Protestant', quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 95 98 26 58', whatsapp: null, lat: null, lng: null, horaires: 'Mer & Sam 15h-18h', maps: 'https://www.google.com/maps/search/?api=1&query=Espace+Basketball+Cotonou' },
  { id: 35, nom: 'CEFODEB / Destiny Basket-Ball Club', activity: 'basketball', adresse: null, quartier: null, ville: 'Abomey-Calavi', telephone: '+229 01 97 29 71 00 / 01 60 05 55 35', whatsapp: null, lat: null, lng: null, horaires: 'Selon programme', maps: 'https://www.google.com/maps/search/?api=1&query=CEFODEB+Destiny+Basketball+Club+Calavi' },

  // ── Arts martiaux ────────────────────────────────────────────
  { id: 36, nom: 'Fighting spirit karaté club', activity: 'arts_martiaux', adresse: null, quartier: 'Akpakpa', ville: 'Cotonou', telephone: '+229 96 99 55 58', whatsapp: null, lat: null, lng: null, horaires: 'Mer & Sam 16h-18h', maps: 'https://www.google.com/maps/search/?api=1&query=Fighting+Spirit+Karate+Club+Akpakpa+Cotonou' },
  { id: 37, nom: "Club d'Arts Martiaux", activity: 'arts_martiaux', adresse: null, quartier: 'Cotonou', ville: 'Cotonou', telephone: '+229 53 01 17 27', whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=Club+Arts+Martiaux+Cotonou+Benin' },
  { id: 38, nom: 'Fédération Béninoise de Taekwondo', activity: 'arts_martiaux', adresse: 'SOBEBRA', quartier: 'Akpakpa', ville: 'Cotonou', telephone: '+229 01 66 30 09 27', whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=Federation+Beninoise+Taekwondo+SOBEBRA' },
  { id: 39, nom: 'JKA — Jericho Karate Association', activity: 'arts_martiaux', adresse: 'Av. Codjo Tovalou Quenum', quartier: 'Jéricho', ville: 'Cotonou', telephone: '+229 01 21 32 53 77 / 01 90 90 04 97', whatsapp: null, lat: null, lng: null, horaires: null, maps: 'https://www.google.com/maps/search/?api=1&query=JKA+Jericho+Karate+Association+Cotonou' },
  { id: 40, nom: 'HEVIOXO MMA Club', activity: 'arts_martiaux', adresse: null, quartier: 'Haie Vive', ville: 'Cotonou', telephone: '+229 51 78 55 08 / 96 06 92 58', whatsapp: null, lat: null, lng: null, horaires: 'Selon programme', maps: 'https://www.google.com/maps/search/?api=1&query=HEVIOXO+MMA+Club+Cotonou' },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moment');
  console.log('📦 Connecté à MongoDB');

  let inserted = 0, skipped = 0;
  for (const a of ACTIVITIES) {
    const exists = await ActivityVenue.findOne({ name: a.nom, city: a.ville });
    if (exists) { skipped++; continue; }
    await ActivityVenue.create({
      name: a.nom,
      activity: a.activity,
      address: a.adresse,
      district: a.quartier,
      city: a.ville,
      phone: a.telephone,
      whatsapp: a.whatsapp,
      latitude: a.lat,
      longitude: a.lng,
      horaires: a.horaires,
      googleMapsUrl: a.maps,
      status: 'approved',
      source: 'seed',
    });
    inserted++;
  }
  console.log(`✅ Lieux d'activités insérés : ${inserted} — déjà présents : ${skipped}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
