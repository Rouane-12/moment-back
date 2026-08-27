const express = require('express');
const Review = require('../models/Review');
const Venue = require('../models/Venue');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Create a review
router.post('/', auth, async (req, res, next) => {
  try {
    const { venueId, rating, title, comment, images } = req.body;

    if (!venueId || !rating || !title || !comment) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Check if user already reviewed this venue
    const existingReview = await Review.findOne({
      user: req.user._id,
      venue: venueId
    });

    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this venue' });
    }

    const review = await Review.create({
      user: req.user._id,
      venue: venueId,
      rating,
      title,
      comment,
      images: images || []
    });

    // Update venue rating
    const venueReviews = await Review.find({ venue: venueId });
    const avgRating = venueReviews.reduce((sum, r) => sum + r.rating, 0) / venueReviews.length;
    
    await Venue.findByIdAndUpdate(venueId, {
      rating: Math.round(avgRating * 10) / 10,
      reviewCount: venueReviews.length
    });

    const populatedReview = await Review.findById(review._id)
      .populate('user', 'firstName lastName avatar')
      .populate('venue', 'name category city');

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      review: populatedReview
    });
  } catch (error) {
    next(error);
  }
});

// Get reviews for a venue
router.get('/venue/:venueId', optionalAuth, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;

    const sortOptions = {
      recent: { createdAt: -1 },
      helpful: { helpfulCount: -1 },
      highest: { rating: -1 },
      lowest: { rating: 1 }
    };

    const reviews = await Review.find({ venue: venueId })
      .populate('user', 'firstName lastName avatar')
      .sort(sortOptions[sort] || sortOptions.recent)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({ venue: venueId });

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get reviews by current user
router.get('/my-reviews', auth, async (req, res, next) => {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .populate('venue', 'name category city')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      reviews
    });
  } catch (error) {
    next(error);
  }
});

// Get all reviews (public - for homepage)
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, sort = 'recent', venueId, userId } = req.query;

    const sortOptions = {
      recent: { createdAt: -1 },
      helpful: { helpfulCount: -1 },
      highest: { rating: -1 },
      lowest: { rating: 1 }
    };

    const filter = {};
    if (venueId) filter.venue = venueId;
    if (userId) filter.user = userId;

    const reviews = await Review.find(filter)
      .populate('user', 'firstName lastName avatar')
      .populate('venue', 'name category city')
      .sort(sortOptions[sort] || sortOptions.recent)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(filter);

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update a review
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { rating, title, comment, images } = req.body;

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (review.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (rating) review.rating = rating;
    if (title) review.title = title;
    if (comment) review.comment = comment;
    if (images) review.images = images;

    await review.save();

    // Update venue rating
    const venueReviews = await Review.find({ venue: review.venue });
    const avgRating = venueReviews.reduce((sum, r) => sum + r.rating, 0) / venueReviews.length;
    
    await Venue.findByIdAndUpdate(review.venue, {
      rating: Math.round(avgRating * 10) / 10,
      reviewCount: venueReviews.length
    });

    const populatedReview = await Review.findById(review._id)
      .populate('user', 'firstName lastName avatar')
      .populate('venue', 'name category city');

    res.json({
      success: true,
      message: 'Review updated successfully',
      review: populatedReview
    });
  } catch (error) {
    next(error);
  }
});

// Delete a review
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (review.user.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin' && 
        req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const venueId = review.venue;
    await Review.findByIdAndDelete(req.params.id);

    // Update venue rating
    const venueReviews = await Review.find({ venue: venueId });
    const avgRating = venueReviews.length > 0 
      ? venueReviews.reduce((sum, r) => sum + r.rating, 0) / venueReviews.length 
      : 0;
    
    await Venue.findByIdAndUpdate(venueId, {
      rating: Math.round(avgRating * 10) / 10,
      reviewCount: venueReviews.length
    });

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Mark review as helpful
router.post('/:id/helpful', optionalAuth, async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    review.helpfulCount += 1;
    await review.save();

    res.json({
      success: true,
      message: 'Review marked as helpful',
      helpfulCount: review.helpfulCount
    });
  } catch (error) {
    next(error);
  }
});

// Reply to a review (admin/partner only)
router.post('/:id/reply', auth, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    review.reply = {
      text,
      repliedAt: new Date(),
      repliedBy: req.user._id
    };

    await review.save();

    const populatedReview = await Review.findById(review._id)
      .populate('user', 'firstName lastName avatar')
      .populate('venue', 'name category city')
      .populate('reply.repliedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'Reply added successfully',
      review: populatedReview
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
