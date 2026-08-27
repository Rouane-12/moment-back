const express = require('express');
const GuestUsage = require('../models/GuestUsage');

const router = express.Router();
const GUEST_LIMIT = 20;

// Check guest usage
router.post('/check', async (req, res, next) => {
  try {
    const { fingerprint } = req.body;
    if (!fingerprint) {
      return res.json({ success: true, allowed: true, remaining: GUEST_LIMIT });
    }

    const usage = await GuestUsage.findOne({ fingerprint });
    const count = usage ? usage.count : 0;

    res.json({
      success: true,
      allowed: count < GUEST_LIMIT,
      count,
      remaining: Math.max(0, GUEST_LIMIT - count),
      limit: GUEST_LIMIT,
    });
  } catch (error) {
    next(error);
  }
});

// Increment guest usage (called after successful moment generation)
router.post('/increment', async (req, res, next) => {
  try {
    const { fingerprint } = req.body;
    if (!fingerprint) {
      return res.json({ success: true });
    }

    const usage = await GuestUsage.findOneAndUpdate(
      { fingerprint },
      { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      count: usage.count,
      remaining: Math.max(0, GUEST_LIMIT - usage.count),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
