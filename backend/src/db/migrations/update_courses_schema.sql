-- Update courses table schema: add subject, subtitle, university
-- Remove price and rating (keeping them nullable for backwards compatibility)
-- Migration: update_courses_schema.sql

-- Add new columns
ALTER TABLE courses ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS university VARCHAR(255);

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_courses_subject ON courses(subject);
CREATE INDEX IF NOT EXISTS idx_courses_university ON courses(university);

-- Add comments for new columns
COMMENT ON COLUMN courses.subject IS 'Course subject/category';
COMMENT ON COLUMN courses.subtitle IS 'Course subtitle or tagline';
COMMENT ON COLUMN courses.university IS 'University or institution offering the course';
