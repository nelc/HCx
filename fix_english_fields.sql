-- Fix: Make English fields optional in tests and questions tables
-- Run this with: psql -U postgres -d hrx -f fix_english_fields.sql

-- Make title_en optional in tests table
ALTER TABLE tests ALTER COLUMN title_en DROP NOT NULL;

-- Make question_en optional in questions table  
ALTER TABLE questions ALTER COLUMN question_en DROP NOT NULL;

-- Update any existing NULL or empty values to use Arabic as fallback
UPDATE tests SET title_en = title_ar WHERE title_en IS NULL OR title_en = '';
UPDATE questions SET question_en = question_ar WHERE question_en IS NULL OR question_en = '';

-- Verify the changes
SELECT 'Tests table updated' as status, COUNT(*) as count FROM tests;
SELECT 'Questions table updated' as status, COUNT(*) as count FROM questions;

