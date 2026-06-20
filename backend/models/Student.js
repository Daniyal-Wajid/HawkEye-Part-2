// models/Student.js
import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema({
  name: String,
  rollNumber: String,
  email: String,
  videoPath: String,
});

export default mongoose.model("Student", StudentSchema);
