import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load .env from backend folder so env is set before createClient (works even when run from project root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
}

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseServiceKey || "placeholder", {
  auth: { persistSession: false },
});
