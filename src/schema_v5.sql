-- EDISS Schema Migration v5: File control numbers per user+location
-- Run these statements on your existing database

-- Add user_id column to file_control_numbers (nullable to avoid breaking existing rows)
ALTER TABLE file_control_numbers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Drop old profile-based unique constraint (if it exists)
ALTER TABLE file_control_numbers DROP CONSTRAINT IF EXISTS file_control_numbers_profile_id_location_code_key;

-- Drop partial index if it was created previously
DROP INDEX IF EXISTS file_control_numbers_user_loc;

-- Make profile_id nullable (no longer required, replaced by user_id)
ALTER TABLE file_control_numbers ALTER COLUMN profile_id DROP NOT NULL;
