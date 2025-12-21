-- Migration: Add recommendation reasons and exam context
-- This tracks WHY each course was recommended and links to the source exam

-- Add recommendation_reason column (JSONB for flexible structure)
ALTER TABLE training_recommendations ADD COLUMN IF NOT EXISTS 
  recommendation_reason JSONB DEFAULT '{}'::jsonb;

-- Add source_exam_id to link recommendations to specific tests
ALTER TABLE training_recommendations ADD COLUMN IF NOT EXISTS 
  source_exam_id UUID REFERENCES tests(id) ON DELETE SET NULL;

-- Add user_proficiency_category to store the user's level at time of recommendation
ALTER TABLE training_recommendations ADD COLUMN IF NOT EXISTS 
  user_proficiency_category VARCHAR(50);

-- Add index for faster lookups by source exam
CREATE INDEX IF NOT EXISTS idx_training_recommendations_source_exam 
  ON training_recommendations(source_exam_id);

-- Add index for filtering by proficiency category
CREATE INDEX IF NOT EXISTS idx_training_recommendations_category 
  ON training_recommendations(user_proficiency_category);

-- Add comment for documentation
COMMENT ON COLUMN training_recommendations.recommendation_reason IS 
  'JSON containing exam name, matched skills, and explanation text for why course was recommended';

COMMENT ON COLUMN training_recommendations.source_exam_id IS 
  'Reference to the test/exam that triggered this recommendation';

COMMENT ON COLUMN training_recommendations.user_proficiency_category IS 
  'User proficiency level at time of recommendation: beginner, intermediate, or advanced';
