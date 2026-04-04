-- EDISS Schema Migration v4: User location access control
-- Run these statements on your existing database

-- User-to-location access mapping
-- If a user has NO rows here, they can access ALL locations (no restriction).
-- If a user HAS rows here, they can ONLY access those locations.
CREATE TABLE IF NOT EXISTS user_locations (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, location_id)
);

-- Add customs_house_code column to locations if missing
ALTER TABLE locations ADD COLUMN IF NOT EXISTS customs_house_code VARCHAR(10);

-- Auto-populate customs_house_code from iata_code (IN{IATA}4)
UPDATE locations
SET customs_house_code = 'IN' || iata_code || '4'
WHERE customs_house_code IS NULL AND LENGTH(iata_code) = 3;
