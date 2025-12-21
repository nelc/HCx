-- Migration: Add department objectives and responsibilities
-- Description: Adds objective_ar, objective_en, and responsibilities columns to departments table

-- Add objective columns
ALTER TABLE departments
ADD COLUMN IF NOT EXISTS objective_ar TEXT,
ADD COLUMN IF NOT EXISTS objective_en TEXT;

-- Add responsibilities column (JSONB array of {text_ar, text_en} objects)
ALTER TABLE departments
ADD COLUMN IF NOT EXISTS responsibilities JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN departments.objective_ar IS 'Department main objective in Arabic';
COMMENT ON COLUMN departments.objective_en IS 'Department main objective in English';
COMMENT ON COLUMN departments.responsibilities IS 'JSON array of responsibilities: [{text_ar: string, text_en: string}]';

-- Create index for better query performance on departments with objectives
CREATE INDEX IF NOT EXISTS idx_departments_has_objectives 
ON departments ((objective_ar IS NOT NULL OR objective_en IS NOT NULL));

