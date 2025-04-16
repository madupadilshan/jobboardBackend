const express = require('express');
const Job = require('../models/jobModel');
const protect = require('../middleware/authMiddleware');
const roleAuthorization = require('../middleware/roleMiddleware');

const router = express.Router();

// GET all jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.find().populate('postedBy', 'name email');
    res.json({ 
      success: true,
      jobs 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error fetching jobs',
      error: error.message 
    });
  }
});

// POST a new job (only companies)
router.post('/', 
  protect, 
  roleAuthorization(['company']), 
  async (req, res) => {
    try {
      const job = new Job({
        ...req.body,
        postedBy: req.user.id
      });
      
      await job.save();
      
      res.status(201).json({
        success: true,
        message: 'Job posted successfully',
        job
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error posting job',
        error: error.message
      });
    }
  }
);

// Add this route before your existing routes
router.get('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    const job = await Job.findById(req.params.id)
      .populate('postedBy', 'name email')
      .lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Optionally, verify the user has permission to view this job
    if (req.user.role === 'company' && job.postedBy._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this job'
      });
    }

    res.json({
      success: true,
      job
    });

  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching job',
      error: error.message
    });
  }
});

// GET jobs posted by the logged-in user (only companies)
router.get('/my', protect, roleAuthorization(['company']), async (req, res) => {
  try {
    const jobs = await Job.find({ postedBy: req.user.id });
    res.json({
      success: true,
      jobs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching your jobs',
      error: error.message
    });
  }
});

module.exports = router;
