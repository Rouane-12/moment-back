const express = require('express');
const Booking = require('../models/Booking');
const Itinerary = require('../models/Itinerary');
const Payment = require('../models/Payment');
const Commission = require('../models/Commission');
const { auth } = require('../middleware/auth');
const kkiapay = require('../services/kkiapay');

const router = express.Router();

router.post('/', auth, async (req, res, next) => {
  try {
    const { itineraryId, notes } = req.body;

    const itinerary = await Itinerary.findById(itineraryId).populate('steps.venueId');
    
    if (!itinerary) {
      return res.status(404).json({ success: false, message: 'Itinerary not found' });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (itinerary.status !== 'generated') {
      return res.status(400).json({ success: false, message: 'Itinerary already booked or cancelled' });
    }

    const subtotal = itinerary.totalPrice;
    const commission = Math.round(subtotal * 0.05);
    const fees = Math.round(subtotal * 0.02);
    const total = subtotal + fees;

    const qrCode = `MOM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const booking = await Booking.create({
      userId: req.user._id,
      itineraryId,
      subtotal,
      commission,
      fees,
      total,
      qrCode,
      status: 'pending',
      notes,
      heldAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    itinerary.status = 'booked';
    await itinerary.save();

    res.status(201).json({
      success: true,
      booking: {
        id: booking._id,
        subtotal,
        commission,
        fees,
        total,
        qrCode,
        expiresAt: booking.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get current user's bookings
router.get('/mine', auth, async (req, res, next) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate({
        path: 'itineraryId',
        populate: { path: 'steps.venueId', select: 'name category media district' }
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('itineraryId')
      .populate('userId', 'firstName lastName phone email');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/payment', auth, async (req, res, next) => {
  try {
    const { phone, email } = req.body;

    const booking = await Booking.findById(req.params.id).populate('itineraryId');
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (booking.status !== 'pending' && booking.status !== 'held') {
      return res.status(400).json({ success: false, message: 'Booking cannot be paid' });
    }

    if (booking.expiresAt < new Date()) {
      booking.status = 'expired';
      await booking.save();
      return res.status(400).json({ success: false, message: 'Booking has expired' });
    }

    const paymentData = await kkiapay.createPayment({
      amount: booking.total,
      phone: phone || req.user.phone,
      email: email || req.user.email,
      name: `${req.user.firstName} ${req.user.lastName}`,
      description: `MOMENT - ${booking.itineraryId.title}`,
      callbackUrl: `${process.env.FRONTEND_URL}/booking/${booking._id}/success`
    });

    res.json({
      success: true,
      payment: paymentData
    });
  } catch (error) {
    next(error);
  }
});

router.post('/webhook/kkiapay', async (req, res, next) => {
  try {
    const signature = req.headers['x-kkiapay-signature'];
    const payload = JSON.stringify(req.body);

    if (!kkiapay.verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    const { transaction_id, status, amount } = req.body;

    if (status === 'success') {
      const payment = await Payment.findOneAndUpdate(
        { providerTransactionId: transaction_id },
        {
          status: 'success',
          paidAt: new Date(),
          webhookReceived: true,
          webhookData: req.body
        }
      );

      if (payment) {
        const booking = await Booking.findById(payment.bookingId);
        if (booking) {
          booking.status = 'paid';
          booking.paidAt = new Date();
          booking.paymentStatus = 'paid';
          await booking.save();

          const itinerary = await Itinerary.findById(booking.itineraryId);
          if (itinerary) {
            itinerary.status = 'confirmed';
            await itinerary.save();
          }
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/verify', auth, async (req, res, next) => {
  try {
    const { transactionId } = req.body;

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const transaction = await kkiapay.verifyTransaction(transactionId);

    if (transaction.status === 'success') {
      let payment = await Payment.findOne({ providerTransactionId: transactionId });
      
      if (!payment) {
        payment = await Payment.create({
          bookingId: booking._id,
          provider: 'kkiapay',
          providerTransactionId: transactionId,
          amount: booking.total,
          fees: booking.fees,
          method: transaction.method,
          status: 'success',
          paidAt: new Date()
        });
      }

      booking.status = 'paid';
      booking.paidAt = new Date();
      booking.paymentStatus = 'paid';
      await booking.save();

      const itinerary = await Itinerary.findById(booking.itineraryId);
      if (itinerary) {
        itinerary.status = 'confirmed';
        await itinerary.save();
      }

      res.json({ success: true, booking, payment });
    } else {
      res.status(400).json({ success: false, message: 'Payment not successful' });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
