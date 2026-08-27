const express = require('express');
const Event = require('../models/Event');
const { auth, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { city, category, startDate, endDate, status } = req.query;
    
    const filter = { isActive: true };
    
    if (status) filter.status = status;
    else filter.status = 'published';
    
    if (category) filter.categories = category;
    if (startDate || endDate) {
      filter.startAt = {};
      if (startDate) filter.startAt.$gte = new Date(startDate);
      if (endDate) filter.startAt.$lte = new Date(endDate);
    }

    const events = await Event.find(filter)
      .populate('venueId')
      .populate('organizerId')
      .sort({ startAt: 1 });

    res.json({ success: true, events });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('venueId')
      .populate('organizerId');
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, event });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requireRole('admin', 'super_admin', 'partner_owner'), async (req, res, next) => {
  try {
    const event = await Event.create(req.body);
    res.status(201).json({ success: true, event });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', auth, requireRole('admin', 'super_admin', 'partner_owner'), async (req, res, next) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, event });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
