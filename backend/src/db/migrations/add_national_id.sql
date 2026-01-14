-- Migration: Add national_id field to users table
-- The national_id serves as the main learner identifier and can only be set/modified by admins

-- Add national_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(20) UNIQUE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_national_id ON users(national_id) WHERE national_id IS NOT NULL;

-- Add a comment explaining the purpose of the field
COMMENT ON COLUMN users.national_id IS 'National ID number - main learner identifier, can only be set by admins';

