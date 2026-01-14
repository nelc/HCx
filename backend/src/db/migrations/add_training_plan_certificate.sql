-- Migration: Add certificate_id column to employee_training_plan_items
-- This links training plan completions to uploaded certificates

-- Add certificate_id column
ALTER TABLE employee_training_plan_items 
ADD COLUMN IF NOT EXISTS certificate_id UUID REFERENCES course_completion_certificates(id) ON DELETE SET NULL;

-- Add index for certificate lookups
CREATE INDEX IF NOT EXISTS idx_training_plan_items_certificate ON employee_training_plan_items(certificate_id);

-- Comment
COMMENT ON COLUMN employee_training_plan_items.certificate_id IS 'Reference to uploaded completion certificate';

