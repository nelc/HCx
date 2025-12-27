-- Migration: Add Employee Training Plan Items table
-- This table stores individual course selections per skill for employee training plans

-- Create the employee_training_plan_items table
CREATE TABLE IF NOT EXISTS employee_training_plan_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    
    -- For recommended courses (from system courses)
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    
    -- For external courses (added manually by employee)
    external_course_title VARCHAR(500),
    external_course_url TEXT,
    external_course_description TEXT,
    
    -- Plan metadata
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('recommended', 'external')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    completed_at TIMESTAMP,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_training_plan_items_user ON employee_training_plan_items(user_id);
CREATE INDEX IF NOT EXISTS idx_training_plan_items_skill ON employee_training_plan_items(skill_id);
CREATE INDEX IF NOT EXISTS idx_training_plan_items_course ON employee_training_plan_items(course_id);
CREATE INDEX IF NOT EXISTS idx_training_plan_items_status ON employee_training_plan_items(status);
CREATE INDEX IF NOT EXISTS idx_training_plan_items_user_skill ON employee_training_plan_items(user_id, skill_id);

-- Add updated_at trigger
CREATE TRIGGER update_employee_training_plan_items_updated_at 
    BEFORE UPDATE ON employee_training_plan_items 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE employee_training_plan_items IS 'Stores individual course selections for employee training plans per skill';
COMMENT ON COLUMN employee_training_plan_items.plan_type IS 'Type of course: recommended (system course) or external (manually added)';
COMMENT ON COLUMN employee_training_plan_items.status IS 'Progress status: pending, in_progress, or completed';

