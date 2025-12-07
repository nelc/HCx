-- Add contents table to store content from external API
-- Migration: add_contents_table.sql

CREATE TABLE IF NOT EXISTS contents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_content_id VARCHAR(255) UNIQUE NOT NULL,
    name_ar TEXT,
    name_en TEXT,
    main_url TEXT,
    description_ar TEXT,
    description_en TEXT,
    source VARCHAR(255),
    source_identifier VARCHAR(255),
    goal TEXT,
    level_id INTEGER,
    content_type_id INTEGER,
    access_license_id INTEGER,
    player_id INTEGER,
    major VARCHAR(255),
    sign_language_id INTEGER,
    owned_by_nelc BOOLEAN DEFAULT false,
    price DECIMAL(10, 2),
    estimated_hours DECIMAL(5, 2),
    meta_data JSONB,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contents_external_id ON contents(external_content_id);
CREATE INDEX IF NOT EXISTS idx_contents_level ON contents(level_id);
CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(content_type_id);
CREATE INDEX IF NOT EXISTS idx_contents_synced ON contents(synced_at);

-- Add trigger for updated_at
CREATE TRIGGER update_contents_updated_at 
BEFORE UPDATE ON contents 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE contents IS 'Stores content synced from external rh-contents API';
COMMENT ON COLUMN contents.external_content_id IS 'The content ID from the external API';
COMMENT ON COLUMN contents.synced_at IS 'Last time this content was synced from external API';

