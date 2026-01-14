-- Migration: Add domain-department relationship
-- This allows tracking which departments are trained on which domains

-- Create junction table for many-to-many relationship between domains and departments
CREATE TABLE IF NOT EXISTS domain_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL REFERENCES training_domains(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Prevent duplicate associations
    UNIQUE(domain_id, department_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_domain_departments_domain ON domain_departments(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_departments_department ON domain_departments(department_id);

-- Add comment
COMMENT ON TABLE domain_departments IS 'Junction table linking training domains to departments that are trained on them';

