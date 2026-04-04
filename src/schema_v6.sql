-- EDISS Schema Migration v6: Profile user_id column + unique per user+location
-- Run these statements on your existing database

-- Add user_id column to profiles (links profile directly to a user)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Unique constraint: one profile per user per location
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_location_code_key;
ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_location_code_key
  UNIQUE (user_id, location_code);

-- Make profile_code nullable (no longer the primary business key)
ALTER TABLE profiles ALTER COLUMN profile_code DROP NOT NULL;
