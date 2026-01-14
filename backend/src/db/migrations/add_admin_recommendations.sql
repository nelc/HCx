-- Migration: Add Admin Recommendations Management Tables
-- This enables admins to add custom course recommendations and hide specific courses for users

-- Admin-added custom course recommendations for users
CREATE TABLE IF NOT EXISTS admin_course_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_name_ar VARCHAR(500) NOT NULL,
    course_name_en VARCHAR(500),
    course_url TEXT,
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses hidden by admin for specific users
CREATE TABLE IF NOT EXISTS user_hidden_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    hidden_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_admin_course_recommendations_user_id ON admin_course_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_hidden_recommendations_user_id ON user_hidden_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_hidden_recommendations_course_id ON user_hidden_recommendations(course_id);

-- Add comments for documentation
COMMENT ON TABLE admin_course_recommendations IS 'Custom course recommendations added by admins for specific users';
COMMENT ON TABLE user_hidden_recommendations IS 'Courses hidden by admins from specific user recommendations';

