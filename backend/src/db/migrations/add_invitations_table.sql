-- Invitations table for user invitation system
-- Allows admins to invite users via email

CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(user_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- Index for expiry check
CREATE INDEX IF NOT EXISTS idx_invitations_expires ON invitations(expires_at);
