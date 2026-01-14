-- Add test_skills junction table to link tests with specific skills
-- This allows admins to select which skills a test targets

CREATE TABLE IF NOT EXISTS test_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, skill_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_test_skills_test ON test_skills(test_id);
CREATE INDEX IF NOT EXISTS idx_test_skills_skill ON test_skills(skill_id);

-- Add comment for documentation
COMMENT ON TABLE test_skills IS 'Junction table linking tests to specific skills they target';

