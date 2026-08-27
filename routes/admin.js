const express = require('express');
const Venue = require('../models/Venue');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Partner = require('../models/Partner');
const User = require('../models/User');
const Commission = require('../models/Commission');
const Payout = require('../models/Payout');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalVenues,
      totalBookings,
      totalRevenue,
      pendingPartners,
      reports
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Venue.countDocuments({ isActive: true }),
      Booking.countDocuments({ status: { $in: ['paid', 'confirmed'] } }),
      Booking.aggregate([
        { $match: { status: { $in: ['paid', 'confirmed'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Partner.countDocuments({ status: 'pending' }),
      0 // TODO: Implement reports model
    ]);

    res.json({
      success: true,
      stats: {
        users: totalUsers,
        venues: totalVenues,
        bookings: totalBookings,
        revenue: totalRevenue[0]?.total || 0,
        pendingRequests: pendingPartners,
        reports
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/bookings', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { status, startDate, endDate } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const bookings = await Booking.find(filter)
      .populate('userId', 'firstName lastName email phone')
      .populate('itineraryId')
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    next(error);
  }
});

router.get('/commissions', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { status, partnerId } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (partnerId) filter.partnerId = partnerId;

    const commissions = await Commission.find(filter)
      .populate('partnerId', 'name email')
      .populate('bookingId')
      .sort({ createdAt: -1 });

    res.json({ success: true, commissions });
  } catch (error) {
    next(error);
  }
});

router.post('/payouts', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { partnerId, amount, method, destination } = req.body;

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    const pendingCommissions = await Commission.find({
      partnerId,
      status: 'available'
    });

    if (pendingCommissions.length === 0) {
      return res.status(400).json({ success: false, message: 'No available commissions for payout' });
    }

    const totalAvailable = pendingCommissions.reduce((sum, c) => sum + c.commissionAmount, 0);
    if (amount > totalAvailable) {
      return res.status(400).json({ success: false, message: 'Insufficient available commissions' });
    }

    const payout = await Payout.create({
      partnerId,
      amount,
      method,
      destination,
      status: 'requested',
      commissionIds: pendingCommissions.map(c => c._id)
    });

    await Commission.updateMany(
      { _id: { $in: pendingCommissions.map(c => c._id) } },
      { status: 'paid_out', payoutId: payout._id }
    );

    res.status(201).json({ success: true, payout });
  } catch (error) {
    next(error);
  }
});

router.get('/payouts', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { status } = req.query;
    
    const filter = {};
    if (status) filter.status = status;

    const payouts = await Payout.find(filter)
      .populate('partnerId', 'name email')
      .sort({ requestedAt: -1 });

    res.json({ success: true, payouts });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
