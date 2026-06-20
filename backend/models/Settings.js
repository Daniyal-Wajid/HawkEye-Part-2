// models/Settings.js
import mongoose from "mongoose";

const SettingsSchema = new mongoose.Schema({
  allowManualAttendance: { type: Boolean, default: false },
});

export default mongoose.model("Settings", SettingsSchema);

