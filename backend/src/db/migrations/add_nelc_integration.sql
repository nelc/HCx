-- Migration: Add NELC Integration Fields
-- This migration adds fields for NELC course ID mapping and user token storage
-- to support future integration with NELC User Management API v2

-- ============================================
-- COURSES TABLE: Add NELC Course ID
-- ============================================

-- Add nelc_course_id column to courses table for matching with NELC API
ALTER TABLE courses ADD COLUMN IF NOT EXISTS nelc_course_id VARCHAR(100);

-- Create index for efficient lookups by NELC course ID
CREATE INDEX IF NOT EXISTS idx_courses_nelc_id ON courses(nelc_course_id) WHERE nelc_course_id IS NOT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN courses.nelc_course_id IS 'NELC platform course ID for matching with NELC User Management API';

-- ============================================
-- USERS TABLE: Add NELC Token Storage
-- ============================================

-- Add encrypted token storage for NELC API access
-- Note: Tokens should be encrypted at application level before storage
ALTER TABLE users ADD COLUMN IF NOT EXISTS nelc_access_token_encrypted TEXT;

-- Add token expiration timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS nelc_token_expires_at TIMESTAMP;

-- Add timestamp for last successful NELC sync
ALTER TABLE users ADD COLUMN IF NOT EXISTS nelc_last_sync_at TIMESTAMP;

-- Add comments explaining the fields
COMMENT ON COLUMN users.nelc_access_token_encrypted IS 'Encrypted NELC API access token for user-initiated course sync';
COMMENT ON COLUMN users.nelc_token_expires_at IS 'Expiration timestamp for the stored NELC access token';
COMMENT ON COLUMN users.nelc_last_sync_at IS 'Timestamp of last successful course sync from NELC';

-- ============================================
-- COURSE COMPLETION CERTIFICATES TABLE
-- ============================================

-- Create the course_completion_certificates table if it doesn't exist
CREATE TABLE IF NOT EXISTS course_completion_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    admin_course_id UUID,
    certificate_path TEXT,
    original_filename TEXT,
    file_size INTEGER,
    mime_type VARCHAR(100),
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes if table was just created
CREATE INDEX IF NOT EXISTS idx_certificates_user ON course_completion_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course ON course_completion_certificates(course_id);

-- ============================================
-- COURSE COMPLETION CERTIFICATES: Add NELC Source
-- ============================================

-- Add source field to track where completion data came from
ALTER TABLE course_completion_certificates ADD COLUMN IF NOT EXISTS completion_source VARCHAR(50) DEFAULT 'certificate_upload';

-- Add NELC-specific fields for API-sourced completions
ALTER TABLE course_completion_certificates ADD COLUMN IF NOT EXISTS nelc_completion_id VARCHAR(100);
ALTER TABLE course_completion_certificates ADD COLUMN IF NOT EXISTS nelc_completion_date TIMESTAMP;
ALTER TABLE course_completion_certificates ADD COLUMN IF NOT EXISTS nelc_progress_percentage DECIMAL(5,2);

-- Create index for NELC completion lookups
CREATE INDEX IF NOT EXISTS idx_certificates_nelc_id ON course_completion_certificates(nelc_completion_id) WHERE nelc_completion_id IS NOT NULL;

-- Add constraint to validate completion_source values
ALTER TABLE course_completion_certificates DROP CONSTRAINT IF EXISTS valid_completion_source;
ALTER TABLE course_completion_certificates ADD CONSTRAINT valid_completion_source 
    CHECK (completion_source IN ('certificate_upload', 'certificate', 'nelc_sync', 'nelc', 'manual'));

-- Add comments
COMMENT ON COLUMN course_completion_certificates.completion_source IS 'Source of completion: certificate_upload/certificate (user uploaded), nelc_sync/nelc (from NELC), or manual';
COMMENT ON COLUMN course_completion_certificates.nelc_completion_id IS 'NELC API completion record ID';
COMMENT ON COLUMN course_completion_certificates.nelc_completion_date IS 'Completion date from NELC API';
COMMENT ON COLUMN course_completion_certificates.nelc_progress_percentage IS 'Progress percentage from NELC API';

-- ============================================
-- NELC COURSE SYNC LOG TABLE
-- ============================================

-- Create table to track NELC sync history for audit purposes
CREATE TABLE IF NOT EXISTS nelc_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL, -- 'courses', 'progress', 'full'
    status VARCHAR(50) NOT NULL, -- 'success', 'partial', 'failed'
    courses_synced INTEGER DEFAULT 0,
    courses_matched INTEGER DEFAULT 0,
    courses_unmatched INTEGER DEFAULT 0,
    error_message TEXT,
    sync_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for user sync history lookups
CREATE INDEX IF NOT EXISTS idx_nelc_sync_log_user ON nelc_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_nelc_sync_log_created ON nelc_sync_log(created_at DESC);

-- Add comments
COMMENT ON TABLE nelc_sync_log IS 'Audit log for NELC course sync operations';

