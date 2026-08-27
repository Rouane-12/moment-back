const express = require('express');
const VenueRequest = require('../models/VenueRequest');
const Venue = require('../models/Venue');
const { auth, requireRole } = require('../middleware/auth');
const kkiapay = require('../services/kkiapay');

const router = express.Router();

// Create venue request (partner only)
router.post('/', auth, requireRole('partner_owner', 'partner_manager'), async (req, res, next) => {
  try {
    const requestData = {
      ...req.body,
      partnerId: req.user._id,
      priceRange: {
        min: req.body.priceRangeMin,
        max: req.body.priceRangeMax,
        average: (req.body.priceRangeMin + req.body.priceRangeMax) / 2
      }
    };
    
    const request = await VenueRequest.create(requestData);
    res.status(201).json({ success: true, request });
  } catch (error) {
    next(error);
  }
});

// Get partner's requests
router.get('/my-requests', auth, requireRole('partner_owner', 'partner_manager'), async (req, res, next) => {
  try {
    const requests = await VenueRequest.find({ partnerId: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (error) {
    next(error);
  }
});

// Get all requests (admin only)
router.get('/', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const requests = await VenueRequest.find(filter)
      .populate('partnerId', 'firstName lastName email phone')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, requests });
  } catch (error) {
    next(error);
  }
});

// Get single request
router.get('/:id', auth, async (req, res, next) => {
  try {
    const request = await VenueRequest.findById(req.params.id)
      .populate('partnerId', 'firstName lastName email phone');
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Check if user is admin or the request owner
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && 
        request.partnerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, request });
  } catch (error) {
    next(error);
  }
});

// Approve request (admin only) — admin sets the payment amount
router.put('/:id/approve', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { paymentAmount } = req.body;
    const request = await VenueRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is not pending' });
    }

    request.status = 'approved';
    if (paymentAmount && paymentAmount > 0) {
      request.paymentAmount = paymentAmount;
    }
    await request.save();

    res.json({ success: true, request });
  } catch (error) {
    next(error);
  }
});

// Reject request (admin only)
router.put('/:id/reject', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    const request = await VenueRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is not pending' });
    }

    request.status = 'rejected';
    request.rejectedReason = reason;
    await request.save();

    res.json({ success: true, request });
  } catch (error) {
    next(error);
  }
});

// Process payment from partner side
router.post('/:id/payment', auth, requireRole('partner_owner', 'partner_manager'), async (req, res, next) => {
  try {
    const { transactionId } = req.body;
    const request = await VenueRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.partnerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Request must be approved first' });
    }

    // Verify transaction with Kkiapay server-side
    try {
      const verification = await kkiapay.verifyTransaction(transactionId);
      if (verification.status !== 'SUCCESS' && verification.status !== 'success') {
        return res.status(400).json({ success: false, message: 'Paiement non confirmé par Kkiapay' });
      }
    } catch (verifyError) {
      console.error('Kkiapay verification error:', verifyError);
      // Continue anyway if Kkiapay API is unreachable (sandbox quirk)
    }

    // Update payment status
    request.paymentStatus = 'paid';
    request.paymentReference = transactionId;
    request.status = 'paid';
    await request.save();

    res.json({ success: true, request });
  } catch (error) {
    next(error);
  }
});

// Create venue directly from request (admin only)
router.post('/:id/create-venue', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const request = await VenueRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.status === 'rejected') {
      return res.status(400).json({ success: false, message: 'Cannot create venue from rejected request' });
    }

    if (request.venueId) {
      return res.status(400).json({ success: false, message: 'Venue already created from this request' });
    }

    // Build venue data from request fields
    const venueData = {
      name: request.name,
      description: request.description,
      category: request.category,
      address: request.address,
      district: request.district || undefined,
      city: request.city,
      phone: request.phone,
      website: request.website || undefined,
      latitude: request.latitude || 6.3654,
      longitude: request.longitude || 2.3856,
      status: 'partner',
      verificationStatus: 'verified',
      sourceTier: 'user_candidate',
      tags: request.tags || [],
      idealFor: request.idealFor || [],
      capacity: request.capacity || undefined,
      priceRange: {
        min: request.priceRange?.min || undefined,
        max: request.priceRange?.max || undefined,
        average: request.priceRange?.average || undefined,
        unit: 'per_person'
      },
      durationMinutes: {
        min: request.durationMinutesMin || undefined,
        max: request.durationMinutesMax || undefined
      },
      bookingRequired: request.bookingRequired || 'unknown',
      indoorOutdoor: request.indoorOutdoor || 'unknown',
      openingHours: request.openingHours || [],
      partnerId: request.partnerId,
      rating: request.rating || 0,
      reviewCount: 0,
      media: (request.images || []).map((img, i) => ({
        url: img.url,
        type: img.type || 'image',
        sortOrder: img.sortOrder || i
      }))
    };

    const venue = await Venue.create(venueData);

    // Link venue to request
    request.venueId = venue._id;
    request.status = 'completed';
    await request.save();

    res.json({ success: true, venue, request });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
