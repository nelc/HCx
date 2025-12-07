-- Add type field to departments table to support hierarchy: sector -> department -> section
-- Migration: add_department_type.sql

ALTER TABLE departments
ADD COLUMN IF NOT EXISTS type VARCHAR(20) CHECK (type IN ('sector', 'department', 'section')) DEFAULT 'department';

-- Update existing records to be departments (if any exist)
UPDATE departments SET type = 'department' WHERE type IS NULL;

-- Add index for better performance on type queries
CREATE INDEX IF NOT EXISTS idx_departments_type ON departments(type);

-- Add comment for documentation
COMMENT ON COLUMN departments.type IS 'Hierarchy type: sector (top) -> department (middle) -> section (bottom)';

