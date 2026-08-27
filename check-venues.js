require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('./models/Venue');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moment-app').then(async () => {
  console.log('Connected to MongoDB');
  
  const venues = await Venue.find({ city: 'Cotonou', isActive: true, status: { $in: ['verified', 'partner', 'partner_premium'] } });
  console.log('Cotonou venues with correct status:', venues.length);
  
  const allCotonou = await Venue.find({ city: 'Cotonou' });
  console.log('All Cotonou venues:', allCotonou.length);
  
  if (allCotonou.length > 0) {
    const sample = allCotonou[0];
    console.log('Sample venue:', {
      name: sample.name,
      category: sample.category,
      status: sample.status,
      isActive: sample.isActive
    });
  }
  
  const allVenues = await Venue.find({});
  console.log('Total venues in database:', allVenues.length);
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
