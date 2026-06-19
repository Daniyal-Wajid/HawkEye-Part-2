// scripts/createDefaultUsers.js
// Run once to create default admin and discipline incharge users (Supabase)
// From backend folder: node scripts/createDefaultUsers.js

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createDefaultUsers() {
  try {
    console.log("Using Supabase:", process.env.SUPABASE_URL ? "configured" : "missing env");

    const defaults = [
      { email: "admin@school.com", password: "admin123", role: "admin", name: "Admin User" },
      { email: "discipline@school.com", password: "incharge123", role: "discipline_incharge", name: "Discipline Incharge" },
    ];

    for (const u of defaults) {
      const { data: existing } = await supabase.from("users").select("id").eq("email", u.email).maybeSingle();
      if (existing) {
        console.log(`ℹ️  ${u.email} already exists`);
        continue;
      }
      const hashed = await bcrypt.hash(u.password, 10);
      const { error } = await supabase.from("users").insert({
        email: u.email,
        password: hashed,
        role: u.role,
        name: u.name,
      });
      if (error) throw error;
      console.log(`✅ Created: ${u.email} / ${u.password}`);
    }

    console.log("\n✅ Default users setup complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

createDefaultUsers();

