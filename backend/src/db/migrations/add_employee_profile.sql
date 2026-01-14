-- Add employee profile fields to users table
-- Migration: Add Employee Profile Fields

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
ADD COLUMN IF NOT EXISTS interests JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS specialization_ar TEXT,
ADD COLUMN IF NOT EXISTS specialization_en TEXT,
ADD COLUMN IF NOT EXISTS last_qualification_ar TEXT,
ADD COLUMN IF NOT EXISTS last_qualification_en TEXT,
ADD COLUMN IF NOT EXISTS willing_to_change_career BOOLEAN;

-- Add comment for documentation
COMMENT ON COLUMN users.years_of_experience IS 'Number of years of work experience';
COMMENT ON COLUMN users.interests IS 'Array of skill IDs representing employee interests';
COMMENT ON COLUMN users.specialization_ar IS 'Employee specialization in Arabic';
COMMENT ON COLUMN users.specialization_en IS 'Employee specialization in English';
COMMENT ON COLUMN users.last_qualification_ar IS 'Last educational qualification in Arabic';
COMMENT ON COLUMN users.last_qualification_en IS 'Last educational qualification in English';
COMMENT ON COLUMN users.willing_to_change_career IS 'Whether employee is willing to change career path';

