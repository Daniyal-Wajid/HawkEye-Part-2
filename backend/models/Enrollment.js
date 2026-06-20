// models/Enrollment.js
import mongoose from "mongoose";

const EnrollmentSchema = new mongoose.Schema({
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Student", 
    required: true 
  },
  subject: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Subject", 
    required: true 
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true, // Teacher who will approve this enrollment
  },
  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected"], 
    default: "pending" 
  },
  requestedAt: { 
    type: Date, 
    default: Date.now 
  },
  reviewedAt: { 
    type: Date 
  },
  reviewedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User" 
  },
}, {
  timestamps: true
});

// Prevent duplicate enrollments: same student, subject, AND teacher
EnrollmentSchema.index({ student: 1, subject: 1, teacher: 1 }, { unique: true });

export default mongoose.model("Enrollment", EnrollmentSchema);
