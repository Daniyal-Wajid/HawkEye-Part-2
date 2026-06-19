// Run from backend folder: node scripts/ensureAdminUser.js
// Creates admin@school.com with password admin123 if missing, or resets password to admin123 if they can't log in.

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ADMIN_EMAIL = "admin@school.com";
const ADMIN_PASSWORD = "admin123";

async function ensureAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  try {
    const { data: existing, error: fetchError } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", ADMIN_EMAIL)
      .maybeSingle();

    if (fetchError) {
      console.error("Supabase error (is schema applied?):", fetchError.message);
      process.exit(1);
    }

    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

    if (existing) {
      const { error: updateError } = await supabase
        .from("users")
        .update({ password: hashed, name: "Admin User", role: "admin" })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      console.log("✅ Admin password reset. Login with:", ADMIN_EMAIL, "/", ADMIN_PASSWORD);
    } else {
      const { error: insertError } = await supabase.from("users").insert({
        email: ADMIN_EMAIL,
        password: hashed,
        role: "admin",
        name: "Admin User",
      });
      if (insertError) throw insertError;
      console.log("✅ Admin user created. Login with:", ADMIN_EMAIL, "/", ADMIN_PASSWORD);
    }
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exit(1);
  }
}

ensureAdmin();
