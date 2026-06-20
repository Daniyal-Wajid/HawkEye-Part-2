// models/Subject.js
import mongoose from "mongoose";

const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
});

export default mongoose.model("Subject", SubjectSchema);

