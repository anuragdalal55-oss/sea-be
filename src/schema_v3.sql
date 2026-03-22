-- EDISS Schema Migration v3: CONSOL Manifest enhancements
-- Run these ALTER statements on your existing database

-- Add message_type to mawbs (F=Final/Fresh, A=Amendment, D=Delete)
ALTER TABLE mawbs ADD COLUMN IF NOT EXISTS message_type CHAR(1) DEFAULT 'F';

-- Add parent tracking for amend/part/delete chains
ALTER TABLE mawbs ADD COLUMN IF NOT EXISTS parent_mawb_id UUID REFERENCES mawbs(id);
ALTER TABLE mawbs ADD COLUMN IF NOT EXISTS amendment_seq INTEGER DEFAULT 0;

-- Add message_type and parent tracking to hawbs
ALTER TABLE hawbs ADD COLUMN IF NOT EXISTS message_type CHAR(1) DEFAULT 'F';
ALTER TABLE hawbs ADD COLUMN IF NOT EXISTS parent_hawb_id UUID REFERENCES hawbs(id);

-- Extend profiles with new fields for CGM file generation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pan_number VARCHAR(16);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_prefix VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consol_agent_id VARCHAR(30);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_email VARCHAR(200);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address1 TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address2 TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gstin VARCHAR(15);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_company VARCHAR(200);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_state VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pan_for_invoice VARCHAR(10);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS air_igm_rate DECIMAL(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sea_consol_lcl_rate DECIMAL(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sea_consol_fcl_rate DECIMAL(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS air_manifest_rate DECIMAL(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS air_manifest_min_bill DECIMAL(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_code VARCHAR(10);

-- File control number tracking (per profile per location)
CREATE TABLE IF NOT EXISTS file_control_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  location_code VARCHAR(10) NOT NULL,
  control_number INTEGER NOT NULL DEFAULT 0,
  UNIQUE(profile_id, location_code)
);

-- Add customs_house_code to users if not exists (for session location override)
ALTER TABLE users ADD COLUMN IF NOT EXISTS customs_house_code VARCHAR(10);
