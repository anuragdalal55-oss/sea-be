-- EDISS Sea: drop all tables (sea_ prefixed and old unprefixed)
-- Run this if you cannot drop the whole database.
-- After this, run schema.sql to recreate everything cleanly.

-- Drop new sea_ prefixed tables (children first)
DROP TABLE IF EXISTS sea_transmissions CASCADE;
DROP TABLE IF EXISTS sea_hbls CASCADE;
DROP TABLE IF EXISTS sea_mbls CASCADE;
DROP TABLE IF EXISTS sea_mlos CASCADE;
DROP TABLE IF EXISTS sea_carriers CASCADE;
DROP TABLE IF EXISTS sea_file_control_numbers CASCADE;
DROP TABLE IF EXISTS sea_user_locations CASCADE;
DROP TABLE IF EXISTS sea_users CASCADE;
DROP TABLE IF EXISTS sea_profiles CASCADE;
DROP TABLE IF EXISTS sea_locations CASCADE;

-- Drop old unprefixed tables left from the original schema (if they exist)
DROP TABLE IF EXISTS transmissions CASCADE;
DROP TABLE IF EXISTS file_control_numbers CASCADE;
DROP TABLE IF EXISTS user_locations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
