-- Sea invoice billing plan — mirrors backend/src/schema_v7.sql for air.
-- Exactly ONE of these three should be filled per profile — it determines
-- how that customer's usage is billed (flat monthly charge, per-MBL, or per-HBL).
ALTER TABLE sea_profiles ADD COLUMN IF NOT EXISTS monthly_rate DECIMAL(10,2);
ALTER TABLE sea_profiles ADD COLUMN IF NOT EXISTS per_mbl_rate DECIMAL(10,2);
ALTER TABLE sea_profiles ADD COLUMN IF NOT EXISTS per_hbl_rate DECIMAL(10,2);
