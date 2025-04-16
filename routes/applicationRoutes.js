const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const roleAuthorization = require('../middleware/roleMiddleware');
const Application = require('../models/applicationModel');
const Job = require('../models/jobModel');
const User = require('../models/userModel');
const upload = require('../middleware/fileUpload');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const multer = require('multer');

// @desc    Apply for a job
// @route   POST /api/applications
// @access  Private (jobSeeker)
router.post('/', 
  protect, 
  roleAuthorization(['jobSeeker']), 
  (req, res, next) => {
    upload.single('resume')(req, res, function(err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ 
          success: false, 
          message: err.message 
        });
      } else if (err) {
        return res.status(400).json({ 
          success: false, 
          message: err.message 
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { jobId, coverLetter } = req.body;
      
      // Validate required fields
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'Resume file is required' 
        });
      }

      if (!jobId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Job ID is required' 
        });
      }

      // Validate job ID format
      if (!mongoose.Types.ObjectId.isValid(jobId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid job ID format' 
        });
      }

      // Check if job exists
      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          message: 'Job not found' 
        });
      }

      // Check for existing application
      const existingApplication = await Application.findOne({ 
        job: jobId, 
        user: req.user.id 
      });
      
      if (existingApplication) {
        return res.status(400).json({ 
          success: false, 
          message: 'You have already applied for this job' 
        });
      }

      // Create new application
      const application = new Application({
        job: jobId,
        user: req.user.id,
        resume: req.file.filename,
        coverLetter: coverLetter || '',
        status: 'pending'
      });

      await application.save();
      
      // Increment application count on the job
      await Job.findByIdAndUpdate(jobId, { $inc: { applicationCount: 1 } });

      // Populate job details for response
      const populatedApplication = await Application.findById(application._id)
        .populate('job', 'title company')
        .populate('user', 'name email');

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        application: {
          _id: populatedApplication._id,
          resume: populatedApplication.resume,
          job: populatedApplication.job,
          user: populatedApplication.user,
          status: populatedApplication.status,
          createdAt: populatedApplication.createdAt
        }
      });

    } catch (error) {
      console.error('Application submission error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during application submission',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @desc    Get resume file
// @route   GET /api/applications/resume/:filename
// @access  Private (owner or company)
router.get('/resume/:filename', protect, async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../uploads', filename);

    // Verify user has permission to access this file
    const application = await Application.findOne({ 
      resume: filename,
      $or: [
        { user: req.user.id }, // Applicant can view their own resume
        { 
          job: { 
            $in: await Job.find({ postedBy: req.user.id }).distinct('_id') 
          } 
        } // Company can view resumes for their jobs
      ]
    }).populate('job', 'postedBy');

    if (!application) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to access this file' 
      });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Resume file not found' 
      });
    }

    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.doc') {
      contentType = 'application/msword';
    } else if (ext === '.docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Set proper headers and send file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(filePath);

  } catch (error) {
    console.error('Resume download error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during resume download',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get applications for jobs posted by company
// @route   GET /api/applications/company
// @access  Private (company)
router.get('/company', 
  protect, 
  roleAuthorization(['company']), 
  async (req, res) => {
    try {
      // Find all jobs posted by this company
      const jobs = await Job.find({ postedBy: req.user.id }).lean();
      const jobIds = jobs.map(job => job._id);
      
      // Find all applications for these jobs
      const applications = await Application.find({ job: { $in: jobIds } })
        .populate('job', 'title company location')
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        count: applications.length,
        applications
      });
    } catch (error) {
      console.error('Error fetching company applications:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching applications',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @desc    Get applications for a specific job
// @route   GET /api/applications/job/:jobId
// @access  Private (company)
router.get('/job/:jobId', 
  protect, 
  roleAuthorization(['company']), 
  async (req, res) => {
    try {
      const { jobId } = req.params;

      // Validate job ID format
      if (!mongoose.Types.ObjectId.isValid(jobId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid job ID format' 
        });
      }

      // Verify job exists and belongs to this company
      const job = await Job.findOne({ 
        _id: jobId, 
        postedBy: req.user.id 
      }).lean();

      if (!job) {
        return res.status(404).json({ 
          success: false, 
          message: 'Job not found or not authorized' 
        });
      }

      // Find all applications for this job
      const applications = await Application.find({ job: jobId })
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        job: {
          _id: job._id,
          title: job.title,
          company: job.company
        },
        count: applications.length,
        applications
      });
    } catch (error) {
      console.error('Error fetching job applications:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching applications',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @desc    Get user's own applications
// @route   GET /api/applications/my
// @access  Private (jobSeeker)
router.get('/my', 
  protect, 
  roleAuthorization(['jobSeeker']), 
  async (req, res) => {
    try {
      const applications = await Application.find({ user: req.user.id })
        .populate({
          path: 'job',
          select: 'title company location salary postedBy',
          populate: {
            path: 'postedBy',
            select: 'name'
          }
        })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        count: applications.length,
        applications: applications.map(app => ({
          _id: app._id,
          job: app.job,
          status: app.status,
          resume: app.resume,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt
        }))
      });
    } catch (error) {
      console.error('Error fetching user applications:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching your applications',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @desc    Update application status
// @route   PUT /api/applications/:id/status
// @access  Private (company)
router.put('/:id/status', 
  protect, 
  roleAuthorization(['company']), 
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const validStatuses = ['pending', 'reviewed', 'rejected', 'accepted'];
      
      // Validate status value
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid status value' 
        });
      }

      // Validate application ID format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid application ID format' 
        });
      }

      // Find application and verify it belongs to a job posted by this company
      const application = await Application.findById(id)
        .populate('job', 'postedBy');

      if (!application) {
        return res.status(404).json({ 
          success: false, 
          message: 'Application not found' 
        });
      }

      if (application.job.postedBy.toString() !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Not authorized to update this application' 
        });
      }

      // Update status
      application.status = status;
      await application.save();

      res.json({
        success: true,
        message: 'Application status updated',
        application: {
          _id: application._id,
          status: application.status,
          job: {
            _id: application.job._id,
            title: application.job.title
          },
          user: application.user
        }
      });
    } catch (error) {
      console.error('Error updating application status:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating application status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;