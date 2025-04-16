const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: [100, 'Job title cannot exceed 100 characters']
  },
  company: { 
    type: String, 
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [100, 'Company name cannot exceed 100 characters']
  },
  salary: { 
    type: String, 
    required: [true, 'Salary information is required'],
    trim: true
  },
  location: { 
    type: String, 
    required: [true, 'Location is required'],
    trim: true
  },
  description: { 
    type: String, 
    required: [true, 'Job description is required'],
    trim: true
  },
  postedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  applicationCount: {
    type: Number,
    default: 0
  },
  skillsRequired: {
    type: [String],
    default: []
  },
  jobType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'internship', 'remote'],
    default: 'full-time'
  }
}, { 
  timestamps: true 
});

// Update application count when applications are deleted
jobSchema.pre('remove', async function(next) {
  await this.model('Application').deleteMany({ job: this._id });
  next();
});

module.exports = mongoose.model('Job', jobSchema);