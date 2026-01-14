-- Migration: Add assessment_metadata column to questions table
-- Description: Stores AI-generated assessment metadata including rationale, 
--              common errors, competency measured, cognitive level, and rubric
-- Date: 2024-12-24

-- Add assessment_metadata JSONB column to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS assessment_metadata JSONB DEFAULT NULL;

-- Add comment to document the column structure
COMMENT ON COLUMN questions.assessment_metadata IS 'AI-generated assessment metadata. Structure:
{
  "rationale": "Why the correct answer is correct (MCQ only)",
  "common_errors": "What incorrect answers reveal about knowledge gaps (MCQ only)",
  "competency_measured": "Specific skill/knowledge being assessed",
  "cognitive_level": "Bloom taxonomy level: knowledge|application|analysis|evaluation|self_assessment",
  "rubric": [{"criterion": "...", "points": N, "description": "..."}] (Open text only)
}';

-- Create an index on cognitive_level for filtering questions by level
CREATE INDEX IF NOT EXISTS idx_questions_cognitive_level 
ON questions ((assessment_metadata->>'cognitive_level'))
WHERE assessment_metadata IS NOT NULL;

-- Create an index on competency_measured for filtering by competency
CREATE INDEX IF NOT EXISTS idx_questions_competency 
ON questions ((assessment_metadata->>'competency_measured'))
WHERE assessment_metadata IS NOT NULL;

