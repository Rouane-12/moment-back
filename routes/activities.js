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
 * GET /api/activities/my-requests   (partenaire)
 * Les lieux d'activité du partenaire : ses demandes (pending/rejected)
 * ET ses lieux publiés — pour la page « Mes lieux ».
 * ⚠️ Déclaré AVANT /:id, sinon 'my-requests' est avalé par le paramètre.
 */
router.get('/my-requests', auth, requireRole('partner_owner', 'partner_manager'), async (req, res, next) => {
  try {
    const items = await ActivityVenue.find({ submittedBy: req.user._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, activities: items });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/activities/admin/pending
 * Liste des soumissions en attente (admin). Idem : avant /:id.
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
 * GET /api/activities/:id
 * Détail d'un lieu d'activité approuvé.
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const item = await ActivityVenue.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Activité non trouvée' });
    }
    const isAdmin = req.user && ['admin', 'super_admin'].includes(req.user.role);
    const isOwner = req.user && ['partner_owner', 'partner_manager'].includes(req.user.role)
      && item.submittedBy
      && String(item.submittedBy) === String(req.user._id);
    if (item.status !== 'approved' && !isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }
    res.json({ success: true, activity: item });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/activities
 * - Admin : ajoute le lieu directement (publié immédiatement).
 * - Partenaire : crée une DEMANDE de lieu d'activité (statut pending) — l'admin la
 *   valide ensuite, comme pour les lieux détente. Utilisateurs simples : refusé.
 */
router.post('/', auth, requireRole('admin', 'super_admin', 'partner_owner', 'partner_manager'), async (req, res, next) => {
  try {
    const { name, activity, description, address, district, city, phone, whatsapp, latitude, longitude, horaires, priceIndication, googleMapsUrl } = req.body;

    if (!name || !activity) {
      return res.status(400).json({ success: false, message: 'Le nom et le type d\'activité sont obligatoires' });
    }

    const role = req.user.role;
    const isAdmin = ['admin', 'super_admin'].includes(role);

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
      priceIndication: priceIndication ? String(priceIndication).trim().slice(0, 200) : undefined,
      googleMapsUrl,
      submittedBy: req.user._id,
      status: isAdmin ? 'approved' : 'pending',
      source: isAdmin ? 'admin' : 'partner',
    });

    res.status(201).json({ success: true, activity: item });
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
 * PUT /api/activities/:id
 * - Admin : modification complète.
 * - Partenaire : peut modifier les lieux QU'IL a soumis (même publiés).
 *   Champs sensibles réservés à l'admin (status, source, submittedBy).
 */
const ACTIVITY_PARTNER_FIELDS = [
  'name', 'activity', 'description', 'address', 'district', 'city',
  'phone', 'whatsapp', 'horaires', 'priceIndication', 'googleMapsUrl',
  'latitude', 'longitude',
];

router.put('/:id', auth, async (req, res, next) => {
  try {
    const item = await ActivityVenue.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Activité non trouvée' });

    const role = req.user.role;
    const isAdmin = ['admin', 'super_admin'].includes(role);
    const isOwner = ['partner_owner', 'partner_manager'].includes(role)
      && item.submittedBy
      && String(item.submittedBy) === String(req.user._id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    if (isAdmin) {
      for (const key of Object.keys(req.body)) {
        if (key === 'latitude' || key === 'longitude') {
          item[key] = req.body[key] === null || req.body[key] === '' ? undefined : Number(req.body[key]);
        } else if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
          item[key] = req.body[key];
        }
      }
    } else {
      for (const key of ACTIVITY_PARTNER_FIELDS) {
        if (req.body[key] !== undefined) {
          item[key] = key === 'latitude' || key === 'longitude'
            ? (req.body[key] === null || req.body[key] === '' ? undefined : Number(req.body[key]))
            : req.body[key];
        }
      }
    }

    await item.save({ validateBeforeSave: true });
    res.json({ success: true, activity: item });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/activities/:id
 * - Admin : suppression définitive.
 * - Partenaire soumetteur : retire son lieu (suppression réelle — un lieu
 *   d'activité est léger, pas d'historique de réservation lié).
 */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const item = await ActivityVenue.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Activité non trouvée' });

    const role = req.user.role;
    const isAdmin = ['admin', 'super_admin'].includes(role);
    const isOwner = ['partner_owner', 'partner_manager'].includes(role)
      && item.submittedBy
      && String(item.submittedBy) === String(req.user._id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    await item.deleteOne();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
