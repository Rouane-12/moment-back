require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // Delete existing admin if exists
    await User.deleteOne({ email: 'admin@moment.bj' });
    await User.deleteOne({ phone: '+229 90 00 00 00' });

    // Create admin user
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'System',
      email: 'admin@moment.bj',
      phone: '+229 90 00 00 00',
      password: 'Admin123!',
      role: 'admin',
      city: 'Cotonou',
      isVerified: true,
      isActive: true
    });

    console.log('Admin créé avec succès:');
    console.log('Email:', admin.email);
    console.log('Téléphone:', admin.phone);
    console.log('Mot de passe: Admin123!');
    console.log('Rôle:', admin.role);
    console.log('');
    console.log('IMPORTANT: Changez le mot de passe après la première connexion!');

    process.exit(0);
  } catch (error) {
    console.error('Erreur lors de la création de l\'admin:', error);
    process.exit(1);
  }
}

createAdmin();
