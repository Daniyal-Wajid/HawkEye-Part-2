// models/Attendance.js
import mongoose from "mongoose";

const AttendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  date: { type: Date, required: true },
  markedBy: { type: String, enum: ["auto", "manual"], default: "auto" },
  status: { type: String, enum: ["present", "absent", "leave"], default: "present" },
});

export default mongoose.model("Attendance", AttendanceSchema);
