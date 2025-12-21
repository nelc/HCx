-- Migration: Add user_badges table for tracking badge history
-- This table stores when badges are awarded and revoked to enable email notifications

CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id VARCHAR(50) NOT NULL,
    title_ar VARCHAR(255) NOT NULL,
    title_en VARCHAR(255),
    description_ar TEXT,
    description_en TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    category VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_reason_ar TEXT,
    revoked_reason_en TEXT,
    notified_award BOOLEAN DEFAULT false,
    notified_revoke BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_status ON user_badges(status);
CREATE INDEX IF NOT EXISTS idx_user_badges_notified ON user_badges(notified_award, notified_revoke);

-- Unique constraint: One active badge of each type per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_active_unique 
ON user_badges(user_id, badge_id) WHERE status = 'active';

-- Add email_reminder_sent column to test_assignments for tracking reminders
ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS email_reminder_sent BOOLEAN DEFAULT false;
ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP;

COMMENT ON TABLE user_badges IS 'Tracks badge awards and revocations for notification emails';
COMMENT ON COLUMN user_badges.badge_id IS 'Unique identifier for badge type (e.g., top_5, high_score)';
COMMENT ON COLUMN user_badges.notified_award IS 'Whether award notification email was sent';
COMMENT ON COLUMN user_badges.notified_revoke IS 'Whether revoke notification email was sent';

