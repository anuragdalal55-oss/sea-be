-- ============================================================
-- EDISS GO-LIVE RESET MIGRATION
-- Cleans all operational data, keeps locations, creates one
-- master_admin user.
-- Credentials after running:
--   Username : admin
--   Password : Admin@1234
-- ============================================================

-- 1. Wipe all operational / test data (order respects FK constraints)
TRUNCATE TABLE
  invoices,
  can_do,
  egm_hawbs,
  egm_mawbs,
  egm_flights,
  igm_mawbs,
  igm_flights,
  transmissions,
  file_control_numbers,
  hawbs,
  mawbs,
  user_locations,
  profiles
CASCADE;

-- 2. Wipe all users
TRUNCATE TABLE users CASCADE;

-- 3. Insert master admin
--    Password hash below = bcrypt("Admin@1234", rounds=10)
--    Generate fresh with: node -e "const b=require('bcryptjs');b.hash('Admin@1234',10).then(console.log)"
INSERT INTO users (
  id, username, password_hash, password_plain,
  full_name, email, role, is_active
) VALUES (
  uuid_generate_v4(),
  'admin',
  '$2a$10$OmcjAwtjaL2z0A0rd4twwecJUwHup08Z1hZ.JaLICKj7AvAohZ3bi', -- Admin@1234
  'Admin@1234',
  'System Admin',
  'admin@ediss.in',
  'master_admin',
  TRUE
);

-- 4. Give admin access to ALL locations (user_locations empty = unrestricted)
--    Nothing to insert — empty user_locations means full access.

-- 5. Verify
SELECT id, username, role, is_active FROM users;
SELECT COUNT(*) as location_count FROM locations;
