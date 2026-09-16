const express = require('express');
const ActivityVenue = require('../models/ActivityVenue');
const { auth, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Catégories d'activités affichées dans l'app (étiquettes claires)
const ACTIVITY_CATEGORIES = [
  { id: 'football', label: 'Football', icon: 'Trophy' },
  { id: 'boxe', label: 'Boxe', icon: 'Swords' },
  { id: 'musculation_gym', label: 'Musculation & Fitness', icon: 'Dumbbell' },
  { id: 'tennis_padel', label: 'Tennis & Padel', icon: 'CircleDot' },
  { id: 'natation', label: 'Natation', icon: 'Waves' },
  { id: 'cyclisme_velo', label: 'Cyclisme', icon: 'Bike' },
  { id: 'basketball', label: 'Basketball', icon: 'Volleyball' },
  { id: 'arts_martiaux', label: 'Arts martiaux', icon: 'Shield' },
];

/**
 * GET /api/activities
 * Liste publique des lieux d'activités approuvés (ou filtrés par statut pour l'admin).
 * Filtres : activity, city, search, status (admin).
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { activity, city, search, status } = req.query;
    const isAdmin = req.user && ['admin', 'super_admin'].includes(req.user.role);

    const filter = {};
    // Public : uniquement les approuvés. Admin : peut demander un statut précis.
    if (isAdmin && status) {
      filter.status = status;
    } else {
      filter.status = 'approved';
    }
    if (activity) filter.activity = String(activity).toLowerCase();
    if (city) filter.city = city;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { district: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
      ];
    }

    const items = await ActivityVenue.find(filter).sort({ city: 1, activity: 1, name: 1 });
    res.json({ success: true, activities: items });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/activities/categories
 * Liste des catégories d'activités (pour les onglets du frontend).
 */
router.get('/categories', (req, res) => {
  res.json({ success: true, categories: ACTIVITY_CATEGORIES });
});

/**
 * GET /api/activities/:id
 * Détail d'un lieu d'activité approuvé.
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const item = await ActivityVenue.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Activité non trouvée' });
    }
    if (item.status !== 'approved' && !(req.user && ['admin', 'super_admin'].includes(req.user.role))) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }
    res.json({ success: true, activity: item });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/activities   (admin uniquement)
 * L'admin ajoute un lieu d'activité directement (publié immédiatement).
 * Les partenaires passent par le circuit de demande + paiement, comme pour les lieux détente.
 */
router.post('/', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { name, activity, description, address, district, city, phone, whatsapp, latitude, longitude, horaires, googleMapsUrl } = req.body;

    if (!name || !activity) {
      return res.status(400).json({ success: false, message: 'Le nom et le type d\'activité sont obligatoires' });
    }

    const item = await ActivityVenue.create({
      name: String(name).trim(),
      activity: String(activity).trim().toLowerCase(),
      description,
      address,
      district,
      city: city || 'Cotonou',
      phone,
      whatsapp,
      latitude: latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : undefined,
      longitude: longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : undefined,
      horaires,
      googleMapsUrl,
      submittedBy: req.user._id,
      status: 'approved',
      source: 'admin',
    });

    res.status(201).json({ success: true, activity: item });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/activities/admin/pending
 * Liste des soumissions en attente (admin).
 */
router.get('/admin/pending', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const items = await ActivityVenue.find({ status: 'pending' })
      .populate('submittedBy', 'firstName lastName email phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, activities: items });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/activities/:id/approve   (admin)
 */
router.put('/:id/approve', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const item = await ActivityVenue.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Activité non trouvée' });
    item.status = 'approved';
    item.rejectedReason = undefined;
    await item.save();
    res.json({ success: true, activity: item });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/activities/:id/reject   (admin)
 * Body : { reason }
 */
router.put('/:id/reject', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const item = await ActivityVenue.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Activité non trouvée' });
    item.status = 'rejected';
    item.rejectedReason = req.body.reason || 'Non conforme';
    await item.save();
    res.json({ success: true, activity: item });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/activities/:id   (admin)
 */
router.delete('/:id', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const item = await ActivityVenue.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Activité non trouvée' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
