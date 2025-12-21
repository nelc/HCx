-- Add desired_domains field to users table
-- Migration: Add Desired Domains Field for Career Aspirations

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS desired_domains JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN users.desired_domains IS 'Array of domain IDs representing career aspirations - roles the employee wishes to occupy in the future';
