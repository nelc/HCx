-- Migration: Add Course Completion Certificates Table
-- This enables employees to upload certificates when marking courses as completed

-- Create table for storing course completion certificates
CREATE TABLE IF NOT EXISTS course_completion_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    admin_course_id UUID REFERENCES admin_course_recommendations(id) ON DELETE SET NULL,
    certificate_path VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Ensure at least one of course_id or admin_course_id is set
    CONSTRAINT at_least_one_course CHECK (course_id IS NOT NULL OR admin_course_id IS NOT NULL)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_course_completion_certificates_user_id ON course_completion_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_course_completion_certificates_course_id ON course_completion_certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_course_completion_certificates_admin_course_id ON course_completion_certificates(admin_course_id);

-- Add comments for documentation
COMMENT ON TABLE course_completion_certificates IS 'Stores certificate files uploaded by employees when completing courses';
COMMENT ON COLUMN course_completion_certificates.course_id IS 'Reference to regular courses table (nullable if admin_course_id is set)';
COMMENT ON COLUMN course_completion_certificates.admin_course_id IS 'Reference to admin-added custom courses (nullable if course_id is set)';
COMMENT ON COLUMN course_completion_certificates.certificate_path IS 'Relative path to the certificate file in uploads/certificates/';

