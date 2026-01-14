-- Add courses table for course management and Neo4j integration
-- Migration: add_courses_table.sql

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar VARCHAR(500) NOT NULL,
    name_en VARCHAR(500),
    description_ar TEXT,
    description_en TEXT,
    url TEXT,
    provider VARCHAR(255),
    duration_hours DECIMAL(5, 2),
    difficulty_level VARCHAR(50) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    price DECIMAL(10, 2),
    language VARCHAR(50),
    rating DECIMAL(3, 2),
    
    -- Neo4j sync tracking
    neo4j_node_id VARCHAR(255) UNIQUE,
    synced_to_neo4j BOOLEAN DEFAULT false,
    last_synced_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create course_skills junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS course_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    relevance_score DECIMAL(3, 2) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, skill_id)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_courses_neo4j_node ON courses(neo4j_node_id);
CREATE INDEX IF NOT EXISTS idx_courses_synced ON courses(synced_to_neo4j, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_courses_difficulty ON courses(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_courses_provider ON courses(provider);
CREATE INDEX IF NOT EXISTS idx_course_skills_course ON course_skills(course_id);
CREATE INDEX IF NOT EXISTS idx_course_skills_skill ON course_skills(skill_id);

-- Add trigger for updated_at
CREATE TRIGGER update_courses_updated_at 
BEFORE UPDATE ON courses 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE courses IS 'Stores training courses for recommendation system with Neo4j sync tracking';
COMMENT ON TABLE course_skills IS 'Many-to-many relationship between courses and skills';
COMMENT ON COLUMN courses.neo4j_node_id IS 'The node ID from Neo4j graph database';
COMMENT ON COLUMN courses.synced_to_neo4j IS 'Whether this course has been synced to Neo4j';
COMMENT ON COLUMN courses.last_synced_at IS 'Last time this course was synced to Neo4j';
COMMENT ON COLUMN course_skills.relevance_score IS 'How relevant this skill is to the course (0.0-1.0)';
