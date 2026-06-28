-- EDISS Sea admin login repair
-- Run this only if you already executed an older schema.sql
-- and the default admin login is not working.
--
-- Username: admin
-- Password: SeaAdmin@2026!

INSERT INTO sea_users (
  username,
  password_hash,
  password_plain,
  full_name,
  email,
  role,
  profile_id,
  customs_house_code,
  is_active
)
SELECT
  'admin',
  '$2a$10$0G4PrZAdCxaEJu04UfAFWe3kz06.WeFWbBcGFmlJZuhbVNpzbOfDa',
  'SeaAdmin@2026!',
  'System Admin',
  'admin@edisssea.in',
  'master_admin',
  p.id,
  'INNSA1',
  TRUE
FROM sea_profiles p
WHERE p.profile_code = 'SEAADMIN-INNSA1'
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  password_plain = EXCLUDED.password_plain,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  profile_id = EXCLUDED.profile_id,
  customs_house_code = EXCLUDED.customs_house_code,
  is_active = TRUE,
  updated_at = NOW();
