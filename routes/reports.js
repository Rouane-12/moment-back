const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const { auth, requireRole } = require('../middleware/auth');

// Get report statistics (admin only) — MUST be before /:id to avoid being caught by param route
router.get('/stats/overview', auth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const [stats, typeStats, categoryStats, total, pending] = await Promise.all([
      Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Report.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
      Report.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Report.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
    ]);

    res.json({
      success: true,
      total,
      pending,
      byStatus: stats,
      byType: typeStats,
      byCategory: categoryStats,
    });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des statistiques' });
  }
});

// Get all reports (admin only)
router.get('/', auth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (type) filter.type = type;

    const reports = await Report.find(filter)
      .populate('user', 'firstName lastName email')
      .populate('venue', 'name')
      .populate('review', 'title rating')
      .populate('resolvedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Report.countDocuments(filter);

    res.json({
      success: true,
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des signalements' });
  }
});

// Get single report (admin only)
router.get('/:id', auth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('user', 'firstName lastName email phone')
      .populate('venue', 'name category district address')
      .populate('review', 'title rating comment user')
      .populate('resolvedBy', 'firstName lastName');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Signalement non trouvé' });
    }

    res.json({ success: true, report });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération du signalement' });
  }
});

// Create report (authenticated users)
router.post('/', auth, async (req, res) => {
  try {
    const { venueId, reviewId, type, category, description } = req.body;

    if (!type || !category || !description) {
      return res.status(400).json({ success: false, message: 'Type, catégorie et description requis' });
    }

    const report = new Report({
      user: req.user._id,
      venue: venueId || null,
      review: reviewId || null,
      type,
      category,
      description,
    });

    await report.save();

    const populatedReport = await Report.findById(report._id)
      .populate('user', 'firstName lastName')
      .populate('venue', 'name')
      .populate('review', 'title');

    res.status(201).json({ success: true, report: populatedReport });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la création du signalement' });
  }
});

// Update report status (admin only)
router.patch('/:id/status', auth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Statut requis' });
    }

    const updateData = { status };
    if (adminNotes) updateData.adminNotes = adminNotes;
    
    if (status === 'resolved' || status === 'dismissed') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = req.user._id;
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('resolvedBy', 'firstName lastName');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Signalement non trouvé' });
    }

    res.json({ success: true, report });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du statut' });
  }
});

module.exports = router;
