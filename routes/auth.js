const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const emailService = require('../services/email');

const router = express.Router();

// Only configure Google OAuth if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `${process.env.BACKEND_URL}/api/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ email: profile.emails[0].value });

      if (!user) {
        user = await User.create({
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          email: profile.emails[0].value,
          avatar: profile.photos[0]?.value,
          isVerified: true,
          city: 'Cotonou'
        });
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));
}

router.post('/register', async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, city, role } = req.body;

    if (!email || !phone) {
      return res.status(400).json({ success: false, message: 'Email et téléphone sont requis' });
    }

    if (password && password.length < 6) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Un utilisateur avec cet email ou ce téléphone existe déjà' });
    }

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

    // Only allow partner_owner or user role from registration
    const userRole = role === 'partner_owner' ? 'partner_owner' : 'user';

    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      password,
      city: city || 'Cotonou',
      role: userRole,
      otpCode,
      otpExpires
    });

    // Send OTP by email
    emailService.sendOtpEmail(email, firstName, otpCode, 'verification').catch(err => {
      console.error('Failed to send OTP email:', err);
    });

    res.status(201).json({
      success: true,
      message: 'Code de vérification envoyé par email',
      requiresOtp: true,
      userId: user._id
    });
  } catch (error) {
    next(error);
  }
});

router.post('/verify-otp', async (req, res, next) => {
  try {
    const { userId, otpCode } = req.body;

    if (!userId || !otpCode) {
      return res.status(400).json({ success: false, message: 'User ID et code OTP requis' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    if (user.otpCode !== otpCode || user.otpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'Code OTP invalide ou expiré' });
    }

    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Vérification réussie',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        city: user.city,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/resend-otp', async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID requis' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'Utilisateur déjà vérifié' });
    }

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

    user.otpCode = otpCode;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP by email
    emailService.sendOtpEmail(user.email, user.firstName, otpCode, 'verification').catch(err => {
      console.error('Failed to resend OTP email:', err);
    });

    res.json({
      success: true,
      message: 'Code de vérification renvoyé par email'
    });
  } catch (error) {
    next(error);
  }
});

// Create admin user (protected route)
router.post('/create-admin', auth, async (req, res, next) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const adminUser = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: 'admin',
      isVerified: true,
      city: 'Cotonou'
    });

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      user: {
        id: adminUser._id,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// Promote user to admin (protected route)
router.post('/promote-admin', auth, async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.role = 'admin';
    await user.save();

    res.json({
      success: true,
      message: 'User promoted to admin successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email requis' });
    }

    if (!password) {
      return res.status(400).json({ success: false, message: 'Mot de passe requis' });
    }

    const user = email
      ? await User.findOne({ email }).select('+password')
      : await User.findOne({ phone }).select('+password');
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Compte inactif' });
    }

    if (!user.isVerified) {
      return res.status(401).json({ success: false, message: 'Compte non vérifié. Vérifie ton email.' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Connexion réussie',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        city: user.city,
        role: user.role,
        preferences: user.preferences
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }
    // Map _id to id for frontend consistency
    const userData = user.toObject();
    userData.id = userData._id.toString();
    res.json({ success: true, user: userData });
  } catch (error) {
    next(error);
  }
});

router.put('/me', auth, async (req, res, next) => {
  try {
    const { firstName, lastName, city, dateOfBirth, preferences } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, city, dateOfBirth, preferences },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email ou téléphone requis' });
    }

    const user = await User.findOne(email ? { email } : { phone });

    if (!user) {
      return res.json({ success: true, message: 'Si le compte existe, un code a été envoyé' });
    }

    const resetCode = crypto.randomInt(100000, 999999).toString();
    const resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000);

    user.resetCode = resetCode;
    user.resetCodeExpires = resetCodeExpires;
    await user.save();

    // Send reset code by email if email is available
    if (user.email) {
      emailService.sendOtpEmail(user.email, user.firstName, resetCode, 'reset').catch(err => {
        console.error('Failed to send reset email:', err);
      });
    }

    res.json({
      success: true,
      message: 'Code de réinitialisation envoyé'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, phone, resetCode, newPassword } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email ou téléphone requis' });
    }

    if (!resetCode || !newPassword) {
      return res.status(400).json({ success: false, message: 'Code et nouveau mot de passe requis' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const user = await User.findOne({
      $or: [{ email }, { phone }],
      resetCode,
      resetCodeExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré' });
    }

    user.password = newPassword;
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: false }), async (req, res) => {
  const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  res.redirect(`${process.env.FRONTEND_URL}?auth=success`);
});

module.exports = router;
