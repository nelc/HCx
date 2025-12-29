-- Migration: Add visible_courses table for course visibility whitelist
-- This table tracks which courses are visible to employees (whitelist approach)
-- Courses NOT in this table are hidden from employees by default

CREATE TABLE IF NOT EXISTS visible_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id VARCHAR(255) NOT NULL UNIQUE,
    made_visible_by UUID REFERENCES users(id) ON DELETE SET NULL,
    visible_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_visible_courses_course_id ON visible_courses(course_id);

-- Add comment for documentation
COMMENT ON TABLE visible_courses IS 'Whitelist of courses visible to employees. Courses not in this table are hidden.';

