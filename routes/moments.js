const express = require('express');
const Itinerary = require('../models/Itinerary');
const ActivityVenue = require('../models/ActivityVenue');
const ActivityBooking = require('../models/ActivityBooking');
const { composeMoment } = require('../services/momentEngine');
const { auth, optionalAuth, requireRole } = require('../middleware/auth');
const kkiapay = require('../services/kkiapay');

const router = express.Router();

// Frais de mise en relation : 100 FCFA/personne, plafonné à 1 000 FCFA.
// Ce frais rémunère l'organisation (génération du moment, sélection du lieu,
// message pré-rempli) — PAS une réservation garantie (le prix et la
// disponibilité se négocient en direct avec le partenaire sur WhatsApp).
const LEAD_FEE_PER_PERSON = 100;
const LEAD_FEE_MAX = 1000;
const leadFee = (people) => Math.min(LEAD_FEE_MAX, Math.max(1, people) * LEAD_FEE_PER_PERSON);

/**
 * POST /api/moments/activity
 * Crée un « moment d'activité » : une sortie planifiée à un lieu d'activité
 * (académie de foot, salle de boxe, piscine…). Contrairement au moment détente,
 * il n'y a pas de parcours généré — c'est une sortie unique, datée.
 * Body : { activityVenueId, date, startTime, peopleCount }
 */
router.post('/activity', auth, async (req, res, next) => {
  try {
    const { activityVenueId, date, startTime, peopleCount, budgetPerPerson } = req.body;
    const people = Math.max(1, parseInt(peopleCount) || 1);
    const budgetPp = Math.max(0, parseInt(budgetPerPerson) || 0);

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
      budget: budgetPp * people,
      totalPrice: budgetPp * people,
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

/**
 * POST /api/moments/activity/:itineraryId/lead-fee
 * Crée (ou renvoie) l'ActivityBooking d'un moment d'activité : le client doit
 * payer le frais de mise en relation pour débloquer le contact WhatsApp.
 * Si un paiement 'paid' existe déjà pour ce moment, il est renvoyé tel quel
 * (le client ne paie jamais deux fois le même moment).
 */
router.post('/activity/:itineraryId/lead-fee', auth, async (req, res, next) => {
  try {
    const itinerary = await Itinerary.findById(req.params.itineraryId);
    if (!itinerary || itinerary.momentType !== 'activite') {
      return res.status(404).json({ success: false, message: "Moment d'activité non trouvé" });
    }
    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const venueId = itinerary.steps.find((s) => s.activityVenueId)?.activityVenueId;
    if (!venueId) {
      return res.status(400).json({ success: false, message: 'Lieu introuvable sur ce moment' });
    }

    // Déjà payé ? On renvoie l'existant — pas de double facturation.
    const existingPaid = await ActivityBooking.findOne({
      itineraryId: itinerary._id,
      status: 'paid',
    });
    if (existingPaid) {
      return res.json({ success: true, alreadyPaid: true, activityBooking: existingPaid });
    }

    const amount = leadFee(itinerary.peopleCount || 1);
    let booking = await ActivityBooking.findOne({
      itineraryId: itinerary._id,
      status: 'pending',
    });
    if (!booking) {
      booking = await ActivityBooking.create({
        userId: req.user._id,
        itineraryId: itinerary._id,
        activityVenueId: venueId,
        amount,
        peopleCount: itinerary.peopleCount || 1,
        status: 'pending',
        paymentStatus: 'pending',
      });
    }

    res.status(201).json({ success: true, activityBooking: booking });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/moments/activity/lead-fee/:bookingId/verify
 * Vérifie la transaction Kkiapay et débloque le contact WhatsApp.
 */
router.post('/activity/lead-fee/:bookingId/verify', auth, async (req, res, next) => {
  try {
    const { transactionId } = req.body;
    const booking = await ActivityBooking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Paiement non trouvé' });
    }
    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }
    if (booking.status === 'paid') {
      return res.json({ success: true, alreadyPaid: true, activityBooking: booking });
    }
    if (!transactionId) {
      return res.status(400).json({ success: false, message: 'Transaction manquante' });
    }

    const transaction = await kkiapay.verifyTransaction(transactionId);
    if (transaction.status !== 'success') {
      booking.paymentStatus = 'failed';
      await booking.save();
      return res.status(400).json({ success: false, message: 'Paiement non confirmé' });
    }

    booking.status = 'paid';
    booking.paymentStatus = 'paid';
    booking.providerTransactionId = transactionId;
    booking.paidAt = new Date();
    await booking.save();

    res.json({ success: true, activityBooking: booking });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/moments/activity/lead-fee/:bookingId/whatsapp-sent
 * Traçage : le client a réellement cliqué sur le bouton WhatsApp. Sert à la
 * politique de remboursement (partenaire injoignable → remboursement possible).
 */
router.post('/activity/lead-fee/:bookingId/whatsapp-sent', auth, async (req, res, next) => {
  try {
    const booking = await ActivityBooking.findById(req.params.bookingId);
    if (!booking || booking.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Paiement non trouvé' });
    }
    if (!booking.whatsappSentAt) {
      booking.whatsappSentAt = new Date();
      await booking.save();
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/moments/activity/lead-fee/status/:itineraryId
 * Le client demande si son moment activité est déjà débloqué.
 */
router.get('/activity/lead-fee/status/:itineraryId', auth, async (req, res, next) => {
  try {
    const booking = await ActivityBooking.findOne({
      itineraryId: req.params.itineraryId,
      userId: req.user._id,
    }).sort({ createdAt: -1 });
    res.json({
      success: true,
      paid: !!booking && booking.status === 'paid',
      activityBooking: booking || null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/moments/activity/lead-fee/:bookingId/refund   (admin)
 * Remboursement manuel : partenaire injoignable, litige. Appelle Kkiapay si
 * la transaction est connue, marque remboursé dans tous les cas (traçable).
 */
router.post('/activity/lead-fee/:bookingId/refund', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const booking = await ActivityBooking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Paiement non trouvé' });
    }
    if (booking.status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Seul un paiement payé peut être remboursé' });
    }
    const reason = req.body.reason || 'Partenaire injoignable';
    if (booking.providerTransactionId) {
      try {
        await kkiapay.refundTransaction(booking.providerTransactionId, booking.amount);
      } catch (e) {
        console.error('Remboursement Kkiapay échoué :', e.message);
        // On marque remboursé quand même : le litige est tracé, l'admin
        // rebasculera manuellement si Kkiapay refuse.
      }
    }
    booking.status = 'refunded';
    booking.paymentStatus = 'refunded';
    booking.refundedAt = new Date();
    booking.refundedBy = req.user._id;
    booking.refundReason = reason;
    await booking.save();
    res.json({ success: true, activityBooking: booking });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/moments/activity/lead-fee/admin/all   (admin)
 */
router.get('/activity/lead-fee/admin/all', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const bookings = await ActivityBooking.find({})
      .populate('userId', 'firstName lastName phone email')
      .populate('activityVenueId', 'name activity city phone')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, bookings });
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
      momentType: itinerary.momentType || 'detente',
      steps: itinerary.steps.map(step => ({
        venue: step.venueId ? {
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
        } : null,
        activityVenue: step.activityVenueId ? {
          id: step.activityVenueId._id,
          name: step.activityVenueId.name,
          activity: step.activityVenueId.activity,
          district: step.activityVenueId.district,
          city: step.activityVenueId.city,
          address: step.activityVenueId.address,
          phone: step.activityVenueId.phone,
          whatsapp: step.activityVenueId.whatsapp,
          horaires: step.activityVenueId.horaires,
          googleMapsUrl: step.activityVenueId.googleMapsUrl
        } : null,
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
