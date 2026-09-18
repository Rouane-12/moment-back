const express = require('express');
const GuestUsage = require('../models/GuestUsage');

const router = express.Router();
const GUEST_LIMIT = 20;

/**
 * Quota invité durci : on combine l'empreinte navigateur (fingerprint) ET
 * l'adresse IP. Une navigation privée ou un changement de navigateur ne
 * réinitialise plus le compteur tant que l'IP reste la même — il faudrait
 * changer les deux à la fois pour repartir de zéro.
 *
 * Chaque usage est enregistré individuellement (usage log) : on peut
 * détecter les pics anormaux sur une même IP et bloquer si nécessaire.
 */
const IP_HARD_LIMIT = 100; // même IP : max 100 générations invitées cumulées

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function getUsage(fingerprint, ip) {
  // Un usage matche si même fingerprint OU (IP + fingerprint absent)
  return GuestUsage.findOne({ $or: [{ fingerprint }, { ip }] });
}

// Check guest usage
router.post('/check', async (req, res, next) => {
  try {
    const { fingerprint } = req.body;
    const ip = clientIp(req);

    if (!fingerprint) {
      return res.json({ success: true, allowed: true, remaining: GUEST_LIMIT });
    }

    const usage = await getUsage(String(fingerprint), ip);
    const count = usage ? usage.count : 0;
    const ipBlocked = (usage?.ipCount || 0) >= IP_HARD_LIMIT;

    res.json({
      success: true,
      allowed: count < GUEST_LIMIT && !ipBlocked,
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
    const ip = clientIp(req);

    if (!fingerprint) {
      return res.json({ success: true });
    }

    // Incrémente le compteur du couple fingerprint+IP existant, sinon crée.
    const usage = await GuestUsage.findOneAndUpdate(
      { $or: [{ fingerprint: String(fingerprint) }, { ip }] },
      {
        $inc: { count: 1, ipCount: 1 },
        $set: { lastUsedAt: new Date(), ip, fingerprint: String(fingerprint) },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
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
