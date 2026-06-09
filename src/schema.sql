-- EDISS Sea database schema
-- FIRST-TIME SETUP:
-- Run only this file on a fresh PostgreSQL database for the sea project.
-- This file creates all required tables, indexes, locations, and one default admin login.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_code VARCHAR(30) UNIQUE,
  company_name VARCHAR(200) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'India',
  phone VARCHAR(20),
  email VARCHAR(200),
  carn_number VARCHAR(30),
  customs_house_code VARCHAR(10),
  icegate_code VARCHAR(20),
  pan_number VARCHAR(16),
  user_prefix VARCHAR(20),
  consol_agent_id VARCHAR(30),
  user_email VARCHAR(200),
  agent_name TEXT,
  address1 TEXT,
  address2 TEXT,
  gstin VARCHAR(20),
  billing_company VARCHAR(200),
  billing_state VARCHAR(100),
  gst_rate DECIMAL(5, 2) DEFAULT 18,
  pan_for_invoice VARCHAR(16),
  air_igm_rate DECIMAL(10, 2),
  sea_consol_lcl_rate DECIMAL(10, 2),
  sea_consol_fcl_rate DECIMAL(10, 2),
  air_manifest_rate DECIMAL(10, 2),
  air_manifest_min_bill DECIMAL(10, 2),
  location_code VARCHAR(10),
  user_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_plain VARCHAR(255),
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  profile_id UUID REFERENCES profiles(id),
  customs_house_code VARCHAR(10),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_user_id_fk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_user_id_location_code_key'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_user_id_location_code_key UNIQUE (user_id, location_code);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  iata_code VARCHAR(10) UNIQUE NOT NULL,
  city_name VARCHAR(150) NOT NULL,
  customs_house_code VARCHAR(10) UNIQUE,
  country VARCHAR(100) DEFAULT 'India',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_locations (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, location_id)
);

CREATE TABLE IF NOT EXISTS file_control_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id),
  user_id UUID REFERENCES users(id),
  location_code VARCHAR(10) NOT NULL,
  control_number INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_control_numbers_user_location
  ON file_control_numbers (user_id, location_code)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sea_mbls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mbl_no VARCHAR(30) UNIQUE NOT NULL,
  mbl_date DATE,
  cargo_move VARCHAR(80),
  port_of_delivery VARCHAR(120),
  dest_cfs VARCHAR(120),
  subline_no VARCHAR(30),
  vessel_voyage_no VARCHAR(120),
  port_of_loading VARCHAR(120),
  port_of_unloading VARCHAR(120),
  cargo_nature VARCHAR(120),
  item_type VARCHAR(120),
  importer_name VARCHAR(200),
  importer_address1 TEXT,
  importer_address2 TEXT,
  importer_address3 TEXT,
  description TEXT,
  marks_numbers TEXT,
  transport VARCHAR(60),
  bond_no VARCHAR(60),
  carrier_name VARCHAR(200),
  carrier_code VARCHAR(60),
  mlo_name VARCHAR(200),
  mlo_code VARCHAR(60),
  total_packages INTEGER NOT NULL DEFAULT 0,
  total_gross_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
  total_volume_cbm DECIMAL(12, 3) NOT NULL DEFAULT 0,
  customs_house_code VARCHAR(10),
  profile_id UUID REFERENCES profiles(id),
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sea_mbls_created_by ON sea_mbls (created_by);
CREATE INDEX IF NOT EXISTS idx_sea_mbls_customs_house_code ON sea_mbls (customs_house_code);

CREATE TABLE IF NOT EXISTS sea_hbls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mbl_id UUID NOT NULL REFERENCES sea_mbls(id) ON DELETE CASCADE,
  hbl_no VARCHAR(30) UNIQUE NOT NULL,
  hbl_date DATE,
  container_no VARCHAR(40),
  seal_no VARCHAR(40),
  container_size VARCHAR(20),
  container_type VARCHAR(50),
  soc_flag VARCHAR(10),
  agent_code VARCHAR(40),
  package_count INTEGER NOT NULL DEFAULT 0,
  gross_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
  cargo_net_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
  volume_cbm DECIMAL(12, 3) NOT NULL DEFAULT 0,
  package_type VARCHAR(80),
  cargo_description TEXT,
  marks_numbers TEXT,
  hs_code VARCHAR(30),
  imo_code VARCHAR(30),
  item_type VARCHAR(120),
  invoice_value_currency VARCHAR(80),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sea_hbls_mbl_id_sort_order ON sea_hbls (mbl_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS sea_mlos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mlo_name VARCHAR(200) NOT NULL,
  mlo_code VARCHAR(60) NOT NULL,
  agent_code VARCHAR(40),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sea_carriers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carrier_name VARCHAR(200) NOT NULL,
  carrier_code VARCHAR(60) NOT NULL,
  bond_number VARCHAR(60),
  transport VARCHAR(60),
  dest VARCHAR(120),
  address VARCHAR(35),
  description VARCHAR(150),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sea_transmissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sea_mbl_id UUID REFERENCES sea_mbls(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_content TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'placeholder',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- New MBL columns (v2 form)
ALTER TABLE sea_mbls ADD COLUMN IF NOT EXISTS igm_no VARCHAR(30);
ALTER TABLE sea_mbls ADD COLUMN IF NOT EXISTS igm_date DATE;
ALTER TABLE sea_mbls ADD COLUMN IF NOT EXISTS vessel_date DATE;
ALTER TABLE sea_mbls ADD COLUMN IF NOT EXISTS vessel_code VARCHAR(30);
ALTER TABLE sea_mbls ADD COLUMN IF NOT EXISTS vessel_name VARCHAR(120);
ALTER TABLE sea_mbls ADD COLUMN IF NOT EXISTS line_no VARCHAR(30);
ALTER TABLE sea_mbls ADD COLUMN IF NOT EXISTS shipping_line VARCHAR(200);
ALTER TABLE sea_mbls ADD COLUMN IF NOT EXISTS imo_code VARCHAR(30);

-- New HBL columns (fields moved from MBL to HBL in v2 form)
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS cargo_move VARCHAR(80);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS port_of_delivery VARCHAR(120);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS dest_cfs VARCHAR(120);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS subline_no VARCHAR(30);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS cargo_nature VARCHAR(120);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS importer_name VARCHAR(200);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS importer_address1 TEXT;
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS importer_address2 TEXT;
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS importer_address3 TEXT;
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(200);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS carrier_code VARCHAR(60);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS bond_no VARCHAR(60);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS transport VARCHAR(60);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS mlo_name VARCHAR(200);
ALTER TABLE sea_hbls ADD COLUMN IF NOT EXISTS mlo_code VARCHAR(60);

INSERT INTO locations (iata_code, city_name, customs_house_code, country) VALUES
  ('NSA1', 'Nhava Sheva Port', 'INNSA1', 'India'),
  ('PAV1', 'Pipavav Port', 'INPAV1', 'India'),
  ('MUN1', 'Mundra Port', 'INMUN1', 'India'),
  ('MAA1', 'Chennai Port', 'INMAA1', 'India'),
  ('COK1', 'Cochin Port', 'INCOK1', 'India'),
  ('CCU1', 'Kolkata Sea', 'INCCU1', 'India'),
  ('MRM1', 'Goa Port', 'INMRM1', 'India'),
  ('HZA1', 'Hazira Port', 'INHZA1', 'India'),
  ('NML1', 'Mangalore Port', 'INNML1', 'India'),
  ('TUT1', 'Tuticorin Port', 'INTUT1', 'India'),
  ('VTZ1', 'Vizag Port', 'INVTZ1', 'India'),
  ('IXY1', 'Kandla Port', 'INIXY1', 'India'),
  ('KAT1', 'Kattupalli Port', 'INKAT1', 'India'),
  ('KRI1', 'Krishnapatnam Port', 'INKRI1', 'India'),
  ('ENR1', 'Ennore Port', 'INENR1', 'India'),
  ('BOM1', 'Mumbai Customs', 'INBOM1', 'India')
ON CONFLICT (iata_code) DO NOTHING;

-- Default admin profile for first login
INSERT INTO profiles (
  profile_code,
  company_name,
  city,
  state,
  country,
  customs_house_code,
  location_code,
  email
) VALUES (
  'SEAADMIN-INNSA1',
  'EDISS Sea Default Admin',
  'Navi Mumbai',
  'Maharashtra',
  'India',
  'INNSA1',
  'INNSA1',
  'admin@edisssea.in'
)
ON CONFLICT (profile_code) DO NOTHING;

-- Default first-time admin user
-- Username: admin
-- Password: SeaAdmin@2026!
INSERT INTO users (
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
FROM profiles p
WHERE p.profile_code = 'SEAADMIN-INNSA1'
ON CONFLICT (username) DO NOTHING;
