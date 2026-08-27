const express = require('express');
const User = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { role, city, isActive } = req.query;
    
    const filter = {};
    if (role) filter.role = role;
    if (city) filter.city = city;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ success: true, users });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', auth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
