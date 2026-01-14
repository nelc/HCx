-- Add a column to store raw skill names/tags from CSV
-- This allows us to display all skills mentioned in the CSV,
-- not just those that exist in the skills table with domains

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS skill_tags TEXT[];

-- Add index for searching skill tags
CREATE INDEX IF NOT EXISTS idx_courses_skill_tags ON courses USING GIN(skill_tags);

COMMENT ON COLUMN courses.skill_tags IS 'Raw skill names/tags from CSV upload, displayed alongside domain skills';

