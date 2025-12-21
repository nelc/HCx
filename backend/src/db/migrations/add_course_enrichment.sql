-- Migration: Add course enrichment table for AI-generated metadata
-- This stores AI-enriched data for Neo4j courses locally since Neo4j is read-only

CREATE TABLE IF NOT EXISTS course_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id VARCHAR(255) NOT NULL UNIQUE, -- Neo4j course_id
  
  -- AI-extracted data
  extracted_skills JSONB DEFAULT '[]'::jsonb,
  prerequisite_skills JSONB DEFAULT '[]'::jsonb,
  learning_outcomes JSONB DEFAULT '[]'::jsonb,
  target_audience JSONB DEFAULT '{}'::jsonb,
  career_paths JSONB DEFAULT '[]'::jsonb,
  industry_tags JSONB DEFAULT '[]'::jsonb,
  topics JSONB DEFAULT '[]'::jsonb,
  difficulty_assessment JSONB DEFAULT '{}'::jsonb,
  quality_indicators JSONB DEFAULT '{}'::jsonb,
  keywords_ar JSONB DEFAULT '[]'::jsonb,
  keywords_en JSONB DEFAULT '[]'::jsonb,
  summary_ar TEXT,
  summary_en TEXT,
  
  -- Metadata
  enrichment_version VARCHAR(10) DEFAULT '1.0',
  enriched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Original course data snapshot (for reference)
  course_name_ar VARCHAR(500),
  course_name_en VARCHAR(500)
);

-- Index for fast lookup by course_id
CREATE INDEX IF NOT EXISTS idx_course_enrichments_course_id ON course_enrichments(course_id);

-- Index for finding enriched courses
CREATE INDEX IF NOT EXISTS idx_course_enrichments_enriched_at ON course_enrichments(enriched_at);

-- Comment
COMMENT ON TABLE course_enrichments IS 'Stores AI-enriched metadata for Neo4j courses (since Neo4j is read-only)';
