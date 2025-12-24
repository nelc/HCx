-- Add profile_completed field to users table
-- This tracks whether employees have completed their profile setup

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN users.profile_completed IS 'Whether the employee has completed their profile setup (experience and interests)';

-- Set existing users with profile data as completed
UPDATE users 
SET profile_completed = true 
WHERE years_of_experience IS NOT NULL 
  AND specialization_ar IS NOT NULL 
  AND specialization_ar != ''
  AND role = 'employee';

