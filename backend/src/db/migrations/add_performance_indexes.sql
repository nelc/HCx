-- Migration: Add Performance Indexes for Recommendations Page
-- Description: Adds indexes to optimize the recommendations endpoint queries
-- Date: 2025-01-21

-- Index on courses.id (if not already primary key index)
-- Note: id is already primary key, but adding explicit index for join performance
CREATE INDEX IF NOT EXISTS idx_courses_id ON courses(id);

-- Index on course_skills for faster joins
CREATE INDEX IF NOT EXISTS idx_course_skills_course_id ON course_skills(course_id);
CREATE INDEX IF NOT EXISTS idx_course_skills_skill_id ON course_skills(skill_id);

-- Index on user_hidden_recommendations for user lookup
CREATE INDEX IF NOT EXISTS idx_user_hidden_recommendations_user_id ON user_hidden_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_hidden_recommendations_course_id ON user_hidden_recommendations(course_id);

-- Index on admin_course_recommendations for user lookup
CREATE INDEX IF NOT EXISTS idx_admin_course_recommendations_user_id ON admin_course_recommendations(user_id);

-- Index on course_completion_certificates for user lookup
CREATE INDEX IF NOT EXISTS idx_course_completion_certificates_user_id ON course_completion_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_course_completion_certificates_course_id ON course_completion_certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_course_completion_certificates_admin_course_id ON course_completion_certificates(admin_course_id);

-- Index on analysis_results for faster user lookups and ordering
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id_analyzed_at ON analysis_results(user_id, analyzed_at DESC);

-- Index on skills for domain joins
CREATE INDEX IF NOT EXISTS idx_skills_domain_id ON skills(domain_id);

-- Index on courses for NELC course ID lookups
CREATE INDEX IF NOT EXISTS idx_courses_nelc_course_id ON courses(nelc_course_id);

-- Index on hidden_courses for course lookup
CREATE INDEX IF NOT EXISTS idx_hidden_courses_course_id ON hidden_courses(course_id);

-- Composite index for users interests/domains lookup
CREATE INDEX IF NOT EXISTS idx_users_interests ON users USING GIN (interests);
CREATE INDEX IF NOT EXISTS idx_users_desired_domains ON users USING GIN (desired_domains);

-- Verify indexes were created
DO $$
BEGIN
    RAISE NOTICE 'Performance indexes migration completed successfully';
END $$;

