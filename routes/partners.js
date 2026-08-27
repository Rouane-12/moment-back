const express = require('express');
const Partner = require('../models/Partner');
const Venue = require('../models/Venue');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const partner = await Partner.create({
      ...req.body,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Partner registration submitted for verification',
      partner
    });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', auth, requireRole('partner_owner', 'partner_manager'), async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ 
      $or: [
        { _id: req.user.partnerId },
        { email: req.user.email }
      ]
    }).populate('venues');

    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found' });
    }

    const venues = await Venue.find({ partnerId: partner._id });
    
    res.json({ 
      success: true, 
      partner,
      venues,
      stats: {
        totalVenues: venues.length,
        totalBookings: partner.totalBookings,
        totalRevenue: partner.totalRevenue,
        rating: partner.rating
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { status, city } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (city) filter.city = city;

    const partners = await Partner.find(filter).sort({ createdAt: -1 });

    res.json({ success: true, partners });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/status', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { status } = req.body;

    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    res.json({ success: true, partner });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
