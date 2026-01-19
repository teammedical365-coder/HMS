const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  phone: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'administrator', 'doctor', 'lab', 'pharmacy', 'reception'],
    default: 'user'
  },
  patientId: {
    type: String,
    unique: true,
    sparse: true, // Allows null/undefined for non-patient roles
    trim: true
  },
  services: {
    type: [String],
    default: [],
    validate: {
      validator: function(services) {
        // Only validate services if role is doctor
        if (this.role !== 'doctor') return true;
        const validServices = ['ivf', 'iui', 'icsi', 'egg-freezing', 'genetic-testing', 'donor-program', 'male-fertility', 'surrogacy', 'fertility-surgery'];
        return services.every(service => validServices.includes(service));
      },
      message: 'Invalid service provided'
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Add indexes for better query performance
userSchema.index({ email: 1 }); 
userSchema.index({ role: 1 }); 
userSchema.index({ patientId: 1 });

const User = mongoose.model('User', userSchema);

// Drop old username index if it exists (migration fix)
if (mongoose.connection.readyState === 1) {
  dropOldUsernameIndex();
} else {
  mongoose.connection.once('open', () => {
    dropOldUsernameIndex();
  });
}

async function dropOldUsernameIndex() {
  try {
    const indexes = await User.collection.getIndexes();
    if (indexes.username_1) {
      await User.collection.dropIndex('username_1');
      console.log('✓ Dropped old username_1 index successfully');
    }
  } catch (err) {
    if (err.code !== 27 && err.code !== 26 && err.codeName !== 'IndexNotFound' && err.codeName !== 'NamespaceNotFound') {
      console.error('Error checking/dropping username index:', err.message);
    }
  }
}

module.exports = User;