const express = require('express');
const Venue = require('../models/Venue');
const { auth, optionalAuth, requireRole } = require('../middleware/auth');
const googlePlaces = require('../services/googlePlaces');
const { cloudinary, isConfigured } = require('../config/cloudinary');

const router = express.Router();

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { city, category, search, lat, lng, radius } = req.query;
    
    const filter = { isActive: true };
    
    if (city) filter.city = city;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    let venues = await Venue.find(filter).sort({ rating: -1 });

    if (lat && lng && radius) {
      venues = venues.filter(v => {
        const distance = calculateDistance(
          parseFloat(lat), parseFloat(lng),
          v.latitude, v.longitude
        );
        return distance <= parseFloat(radius);
      });
    }

    res.json({ success: true, venues });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/venues/admin/all   (admin)
 * TOUS les lieux de détente, y compris inactifs — page « Tous les lieux »
 * de l'admin. À déclarer AVANT /:id (sinon 'admin' est avalé par le paramètre).
 */
router.get('/admin/all', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { search, category, city } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (city) filter.city = city;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    const venues = await Venue.find(filter)
      .sort({ createdAt: -1 })
      .select('name description category city district address phone status isActive rating reviewCount media priceRange offers partnerId createdAt updatedAt');
    res.json({ success: true, venues });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/venues/mine   (partenaire)
 * Les lieux du partenaire connecté (nés de ses demandes validées).
 * ⚠️ Avant /:id.
 */
router.get('/mine', auth, requireRole('partner_owner', 'partner_manager'), async (req, res, next) => {
  try {
    const venues = await Venue.find({ partnerId: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ success: true, venues });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    res.json({ success: true, venue });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const venue = await Venue.create(req.body);
    res.status(201).json({ success: true, venue });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/venues/:id
 * - Admin : modification complète.
 * - Partenaire : peut modifier SES lieux (ceux nés d'une demande qu'il a
 *   soumise et que l'admin a validée → venue.partnerId = son userId).
 *   Champs sensibles réservés à l'admin (status, partnerId, verification…).
 */
const PARTNER_EDITABLE_FIELDS = [
  'name', 'description', 'address', 'district', 'city', 'phone', 'website',
  'category', 'categories', 'tags', 'idealFor', 'capacity', 'openingHours',
  'priceRange', 'offers', 'durationMinutes', 'bookingRequired', 'indoorOutdoor',
  'paymentMethods', 'indoorOutdoor',
];

router.put('/:id', auth, async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const role = req.user.role;
    const isAdmin = ['admin', 'super_admin'].includes(role);
    const isOwner = ['partner_owner', 'partner_manager'].includes(role)
      && venue.partnerId
      && String(venue.partnerId) === String(req.user._id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    if (isAdmin) {
      Object.assign(venue, req.body);
    } else {
      // Partenaire : uniquement les champs métier, jamais le statut ni la
      // validation, ni la latitude/longitude (risque de « déplacer » le lieu).
      for (const key of PARTNER_EDITABLE_FIELDS) {
        if (req.body[key] !== undefined) venue[key] = req.body[key];
      }
    }

    await venue.save({ validateBeforeSave: true });
    res.json({ success: true, venue });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/venues/:id
 * - Admin : supprime réellement le lieu.
 * - Partenaire propriétaire : désactive son lieu (isActive=false) — réversible,
 *   l'admin reste le seul à pouvoir détruire définitivement.
 */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const role = req.user.role;
    const isAdmin = ['admin', 'super_admin'].includes(role);
    const isOwner = ['partner_owner', 'partner_manager'].includes(role)
      && venue.partnerId
      && String(venue.partnerId) === String(req.user._id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    if (isAdmin) {
      await venue.deleteOne();
      return res.json({ success: true, message: 'Lieu supprimé définitivement' });
    }

    venue.isActive = false;
    await venue.save();
    res.json({ success: true, message: 'Lieu désactivé (masqué de l\'app)', venue });
  } catch (error) {
    next(error);
  }
});

router.post('/import/google', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { location, radius, type } = req.body;

    const results = await googlePlaces.searchNearby(location, radius, type);

    const imported = [];
    for (const place of results.results || []) {
      const venueData = googlePlaces.mapToVenue({ result: place }, type);
      if (venueData) {
        const existing = await Venue.findOne({ googlePlaceId: venueData.googlePlaceId });
        if (!existing) {
          const venue = await Venue.create(venueData);
          imported.push(venue);
        }
      }
    }

    res.json({ success: true, imported, count: imported.length });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/upload-image', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { image, isPrimary = false } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, message: 'Image URL is required' });
    }

    const venue = await Venue.findById(req.params.id);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    let mediaItem;
    if (isConfigured) {
      // Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(image, {
        folder: 'moment-venues',
        transformation: [
          { width: 1200, height: 800, crop: 'limit', quality: 'auto' }
        ]
      });
      mediaItem = {
        url: uploadResult.secure_url,
        type: 'image',
        sortOrder: venue.media.length
      };
    } else {
      // Base64 fallback — store directly
      mediaItem = {
        url: image,
        type: 'image',
        sortOrder: venue.media.length
      };
    }

    if (isPrimary || venue.media.length === 0) {
      venue.media = venue.media.map(m => ({ ...m, sortOrder: m.sortOrder + 1 }));
      mediaItem.sortOrder = 0;
    }

    venue.media.push(mediaItem);
    await venue.save();

    res.json({ success: true, venue, media: mediaItem });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/media/:mediaId', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const mediaItem = venue.media.id(req.params.mediaId);
    if (!mediaItem) {
      return res.status(404).json({ success: false, message: 'Media not found' });
    }

    // Delete from Cloudinary if it has a public ID
    if (mediaItem.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(mediaItem.cloudinaryPublicId);
    }

    venue.media.pull(req.params.mediaId);
    await venue.save();

    res.json({ success: true, venue });
  } catch (error) {
    next(error);
  }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

module.exports = router;
