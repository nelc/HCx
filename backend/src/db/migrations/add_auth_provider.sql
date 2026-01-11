-- Migration: Add auth_provider field to users table
-- This field tracks how the user authenticates (local, ldap, sso)

-- Add auth_provider column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local' CHECK (auth_provider IN ('local', 'ldap', 'sso'));

-- Add ldap_username column for LDAP users (sAMAccountName)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ldap_username VARCHAR(255) UNIQUE;

-- Make password_hash nullable for LDAP/SSO users who don't have local passwords
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Add index for auth_provider lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);

-- Add index for ldap_username lookups
CREATE INDEX IF NOT EXISTS idx_users_ldap_username ON users(ldap_username) WHERE ldap_username IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN users.auth_provider IS 'Authentication provider: local (email/password), ldap (Active Directory), sso (Single Sign-On)';
COMMENT ON COLUMN users.ldap_username IS 'LDAP username (sAMAccountName) for LDAP-authenticated users';
