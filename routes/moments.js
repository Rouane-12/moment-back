const express = require('express');
const Itinerary = require('../models/Itinerary');
const ActivityVenue = require('../models/ActivityVenue');
const { composeMoment } = require('../services/momentEngine');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/moments/activity
 * Crée un « moment d'activité » : une sortie planifiée à un lieu d'activité
 * (académie de foot, salle de boxe, piscine…). Contrairement au moment détente,
 * il n'y a pas de parcours généré — c'est une sortie unique, datée.
 * Body : { activityVenueId, date, startTime, peopleCount }
 */
router.post('/activity', auth, async (req, res, next) => {
  try {
    const { activityVenueId, date, startTime, peopleCount } = req.body;
    const people = Math.max(1, parseInt(peopleCount) || 1);

    const venue = await ActivityVenue.findById(activityVenueId);
    if (!venue || venue.status !== 'approved') {
      return res.status(404).json({ success: false, message: 'Lieu d\'activité non trouvé' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'La date est obligatoire' });
    }

    const start = startTime || '16:00';
    const itinerary = await Itinerary.create({
      userId: req.user._id,
      city: venue.city || 'Cotonou',
      date,
      startTime: start,
      endTime: start,
      peopleCount: people,
      budget: 0,
      totalPrice: 0,
      momentType: 'activite',
      title: venue.name,
      theme: { key: 'activite', label: 'Activité', emoji: '⚽' },
      steps: [{
        activityVenueId: venue._id,
        type: 'activity_venue',
        startTime: start,
        endTime: start,
        price: 0,
        distanceKm: 0,
        order: 0
      }],
      status: 'generated'
    });

    res.status(201).json({
      success: true,
      moment: {
        id: itinerary._id,
        title: itinerary.title,
        date: itinerary.date,
        startTime: itinerary.startTime,
        peopleCount: itinerary.peopleCount,
        momentType: 'activite'
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/generate', optionalAuth, async (req, res, next) => {
  try {
    const { city, people, budget, when, start, vibes, transport, roll, date } = req.body;

    if (!city || !people || !budget || !roll) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const params = {
      city,
      people: parseInt(people),
      budgetPerPerson: parseInt(budget),
      when,
      startTime: start || '19:00',
      vibes: vibes ? vibes.split(',') : [],
      transport,
      roll: parseInt(roll),
      date: date || new Date().toISOString().split('T')[0]
    };

    console.log('=== MOMENT GENERATION REQUEST ===');
    console.log('Request body:', req.body);
    console.log('Parsed params:', params);

    const moment = await composeMoment(params);

    const itinerary = await Itinerary.create({
      userId: req.user?._id || null,
      city: params.city,
      date: params.date,
      startTime: params.startTime,
      endTime: moment.steps[moment.steps.length - 1]?.end || '00:00',
      peopleCount: params.people,
      budget: params.budgetPerPerson * params.people,
      totalPrice: moment.total,
      score: moment.score,
      theme: moment.theme,
      title: moment.title,
      roll: params.roll,
      vibes: params.vibes,
      transport: params.transport,
      distanceKm: moment.distanceKm,
      adapted: moment.adapted,
      steps: moment.steps.map((step, i) => ({
        venueId: step.venue.id,
        type: 'venue',
        startTime: step.start,
        endTime: step.end,
        price: step.price,
        distanceKm: step.distanceKm,
        order: i
      })),
      status: 'generated',
      isGuest: !req.user
    });

    res.json({
      success: true,
      moment: {
        id: itinerary._id,
        ...moment
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    
    // Check if id is a valid ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid moment ID format' });
    }
    
    const itinerary = await Itinerary.findById(id)
      .populate('steps.venueId')
      .populate('userId', 'firstName lastName avatar');

    if (!itinerary) {
      return res.status(404).json({ success: false, message: 'Moment not found' });
    }

    if (itinerary.userId && !itinerary.isGuest) {
      if (!req.user || req.user._id.toString() !== itinerary.userId._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const moment = {
      id: itinerary._id,
      title: itinerary.title,
      theme: itinerary.theme,
      steps: itinerary.steps.map(step => ({
        venue: {
          id: step.venueId._id,
          name: step.venueId.name,
          category: step.venueId.category,
          district: step.venueId.district,
          rating: step.venueId.rating,
          reviewCount: step.venueId.reviewCount,
          latitude: step.venueId.latitude,
          longitude: step.venueId.longitude,
          address: step.venueId.address,
          image: step.venueId.media?.[0]?.url || ''
        },
        start: step.startTime,
        end: step.endTime,
        price: step.price,
        distanceKm: step.distanceKm
      })),
      total: itinerary.totalPrice,
      perPerson: Math.round(itinerary.totalPrice / itinerary.peopleCount),
      score: itinerary.score,
      distanceKm: itinerary.distanceKm,
      adapted: itinerary.adapted,
      params: {
        city: itinerary.city,
        people: itinerary.peopleCount,
        budgetPerPerson: Math.round(itinerary.budget / itinerary.peopleCount),
        when: itinerary.date,
        startTime: itinerary.startTime,
        vibes: itinerary.vibes,
        transport: itinerary.transport,
        roll: itinerary.roll
      }
    };

    res.json({ success: true, moment });
  } catch (error) {
    next(error);
  }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const { status, type } = req.query;

    const filter = { userId: req.user._id };
    if (status) filter.status = status;
    if (type) filter.momentType = type;

    const itineraries = await Itinerary.find(filter)
      .populate('steps.venueId')
      .populate('steps.activityVenueId')
      .sort({ createdAt: -1 });

    const moments = itineraries.map(it => ({
      _id: it._id,
      title: it.title,
      theme: it.theme,
      momentType: it.momentType || 'detente',
      date: it.date,
      startTime: it.startTime,
      peopleCount: it.peopleCount,
      totalPrice: it.totalPrice,
      score: it.score,
      status: it.status,
      createdAt: it.createdAt,
      steps: it.steps.map(step => ({
        venue: {
          media: step.venueId?.media || []
        },
        activityVenue: step.activityVenueId ? {
          id: step.activityVenueId._id,
          name: step.activityVenueId.name,
          activity: step.activityVenueId.activity,
          city: step.activityVenueId.city,
          district: step.activityVenueId.district
        } : null
      }))
    }));

    res.json({ success: true, moments });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
