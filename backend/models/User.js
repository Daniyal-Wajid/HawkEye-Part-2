// models/User.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "teacher", "student"], required: true },
  name: String,
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" }, // For students
  assignedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }], // For teachers
});

export default mongoose.model("User", UserSchema);

