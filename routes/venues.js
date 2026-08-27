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

router.put('/:id', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const venue = await Venue.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    res.json({ success: true, venue });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const venue = await Venue.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    res.json({ success: true, message: 'Venue désactivée', venue });
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
