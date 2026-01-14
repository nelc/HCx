-- CV Import Features Migration
-- Adds tables and columns to support CV import functionality

-- Store CV import history
CREATE TABLE IF NOT EXISTS cv_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255),
    file_size INTEGER,
    extracted_data JSONB, -- Full CV data from local parsing
    imported_skills_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store work experience extracted from CV
CREATE TABLE IF NOT EXISTS user_experience (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    company VARCHAR(255),
    start_date VARCHAR(50),
    end_date VARCHAR(50),
    description TEXT,
    source VARCHAR(50) DEFAULT 'cv_import',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store education history
CREATE TABLE IF NOT EXISTS user_education (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    degree VARCHAR(255),
    institution VARCHAR(255),
    graduation_year VARCHAR(50),
    source VARCHAR(50) DEFAULT 'cv_import',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store certificates
CREATE TABLE IF NOT EXISTS user_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    issuer VARCHAR(255),
    date VARCHAR(50),
    source VARCHAR(50) DEFAULT 'cv_import',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add CV-related fields to users table (if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone') THEN
        ALTER TABLE users ADD COLUMN phone VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='cv_imported') THEN
        ALTER TABLE users ADD COLUMN cv_imported BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='cv_imported_at') THEN
        ALTER TABLE users ADD COLUMN cv_imported_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='cv_raw_text') THEN
        ALTER TABLE users ADD COLUMN cv_raw_text TEXT;
    END IF;
END $$;

-- Add source tracking to employee_skill_profiles (if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_skill_profiles' AND column_name='source') THEN
        ALTER TABLE employee_skill_profiles 
        ADD COLUMN source VARCHAR(50) DEFAULT 'assessment' CHECK (source IN ('assessment', 'cv_import', 'credentials', 'manual'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_skill_profiles' AND column_name='confidence_score') THEN
        ALTER TABLE employee_skill_profiles 
        ADD COLUMN confidence_score DECIMAL(3,2) DEFAULT 1.0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_skill_profiles' AND column_name='verified') THEN
        ALTER TABLE employee_skill_profiles 
        ADD COLUMN verified BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cv_imports_user_id ON cv_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_cv_imports_created_at ON cv_imports(created_at);
CREATE INDEX IF NOT EXISTS idx_user_experience_user_id ON user_experience(user_id);
CREATE INDEX IF NOT EXISTS idx_user_education_user_id ON user_education(user_id);
CREATE INDEX IF NOT EXISTS idx_user_certificates_user_id ON user_certificates(user_id);

