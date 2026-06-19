-- Run this in Supabase SQL Editor if you have the schema with role 'teacher'.
-- It renames the role to 'discipline_incharge' and updates the constraint.

-- 1) Drop the existing role check constraint (works whatever its name is)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 2) Update existing users from teacher to discipline_incharge
UPDATE users SET role = 'discipline_incharge' WHERE role = 'teacher';

-- 3) Add new check constraint
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'discipline_incharge', 'student'));
