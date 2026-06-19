# Supabase setup

1. In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**, run the contents of `schema.sql`.
2. **If you already had the old schema** with role `'teacher'`, run `migration_teacher_to_discipline_incharge.sql` to rename it to `discipline_incharge`.
3. (Optional) Run `seed.sql` once to insert default cameras and policy rules.
4. Create default users from the **backend** folder:
   ```bash
   cd backend
   node scripts/createDefaultUsers.js
   ```
   This creates **admin@school.com** / **admin123** and **discipline@school.com** / **incharge123**.

   If login still fails with "Invalid credentials", run:
   ```bash
   node scripts/ensureAdminUser.js
   ```
   This creates or resets the admin user so you can log in with **admin@school.com** / **admin123**.

Store `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in backend `.env` (see `.env.example`).
