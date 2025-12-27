-- HCx Training Needs Assessment System - Database Schema
-- PostgreSQL Database
-- Updated: Consolidated all migrations into single schema file

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables (in reverse order due to foreign keys)
DROP TABLE IF EXISTS nelc_sync_log CASCADE;
DROP TABLE IF EXISTS course_completion_certificates CASCADE;
DROP TABLE IF EXISTS user_hidden_recommendations CASCADE;
DROP TABLE IF EXISTS admin_course_recommendations CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS course_enrichments CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS development_plan_items CASCADE;
DROP TABLE IF EXISTS development_plans CASCADE;
DROP TABLE IF EXISTS employee_skill_profiles CASCADE;
DROP TABLE IF EXISTS training_recommendations CASCADE;
DROP TABLE IF EXISTS analysis_results CASCADE;
DROP TABLE IF EXISTS responses CASCADE;
DROP TABLE IF EXISTS test_assignments CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS test_skills CASCADE;
DROP TABLE IF EXISTS tests CASCADE;
DROP TABLE IF EXISTS course_skills CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS contents CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS training_domains CASCADE;
DROP TABLE IF EXISTS domain_departments CASCADE;
DROP TABLE IF EXISTS user_badges CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS cv_imports CASCADE;
DROP TABLE IF EXISTS user_experience CASCADE;
DROP TABLE IF EXISTS user_education CASCADE;
DROP TABLE IF EXISTS user_certificates CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- ============================================
-- DEPARTMENTS
-- ============================================

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description_ar TEXT,
    description_en TEXT,
    objective_ar TEXT,
    objective_en TEXT,
    responsibilities JSONB DEFAULT '[]'::jsonb,
    type VARCHAR(20) CHECK (type IN ('sector', 'department', 'section')) DEFAULT 'department',
    parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Ensure sectors have no parent
    CONSTRAINT sectors_no_parent CHECK (
        (type = 'sector' AND parent_id IS NULL) OR 
        (type != 'sector')
    ),
    -- Ensure departments have a parent (sector)
    CONSTRAINT departments_require_parent CHECK (
        (type = 'department' AND parent_id IS NOT NULL) OR 
        (type != 'department')
    ),
    -- Ensure sections have a parent (department)
    CONSTRAINT sections_require_parent CHECK (
        (type = 'section' AND parent_id IS NOT NULL) OR 
        (type != 'section')
    )
);

-- Unique constraint: same name, type, and parent (using partial index for NULL handling)
-- For sectors (parent_id IS NULL), ensure unique name
CREATE UNIQUE INDEX unique_sector_name ON departments (name_ar) 
WHERE type = 'sector' AND parent_id IS NULL;

-- For departments and sections, ensure unique name within parent
CREATE UNIQUE INDEX unique_department_name_parent ON departments (name_ar, type, parent_id) 
WHERE parent_id IS NOT NULL;

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'training_officer', 'employee')),
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    job_title_ar VARCHAR(255),
    job_title_en VARCHAR(255),
    employee_number VARCHAR(50) UNIQUE,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    
    -- Employee profile fields (from add_employee_profile migration)
    years_of_experience INTEGER,
    interests JSONB DEFAULT '[]'::jsonb,
    specialization_ar TEXT,
    specialization_en TEXT,
    last_qualification_ar TEXT,
    last_qualification_en TEXT,
    willing_to_change_career BOOLEAN,
    
    -- Career aspirations (from add_desired_domains migration)
    desired_domains JSONB DEFAULT '[]'::jsonb,
    
    -- National ID (from add_national_id migration)
    national_id VARCHAR(20) UNIQUE,
    
    -- Profile completion tracking (from add_profile_completed migration)
    profile_completed BOOLEAN DEFAULT false,
    
    -- CV import fields (from add_cv_import_features migration)
    phone VARCHAR(50),
    cv_imported BOOLEAN DEFAULT false,
    cv_imported_at TIMESTAMP,
    cv_raw_text TEXT,
    
    -- NELC integration fields (from add_nelc_integration migration)
    nelc_access_token_encrypted TEXT,
    nelc_token_expires_at TIMESTAMP,
    nelc_last_sync_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TRAINING DOMAINS & SKILLS
-- ============================================

CREATE TABLE training_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    icon VARCHAR(100),
    color VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID REFERENCES training_domains(id) ON DELETE CASCADE,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    weight DECIMAL(3,2) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DOMAIN-DEPARTMENT RELATIONSHIPS
-- ============================================

CREATE TABLE domain_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL REFERENCES training_domains(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain_id, department_id)
);

-- ============================================
-- COURSES (from add_courses_table migration)
-- ============================================

CREATE TABLE courses (
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
    
    -- Additional fields (from update_courses_schema migration)
    subject VARCHAR(255),
    subtitle TEXT,
    university VARCHAR(255),
    
    -- NELC integration (from add_nelc_integration migration)
    nelc_course_id VARCHAR(100),
    
    -- Neo4j sync tracking
    neo4j_node_id VARCHAR(255) UNIQUE,
    synced_to_neo4j BOOLEAN DEFAULT false,
    last_synced_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Course-Skills junction table (many-to-many relationship)
CREATE TABLE course_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    relevance_score DECIMAL(3, 2) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, skill_id)
);

-- ============================================
-- CONTENTS (from add_contents_table migration)
-- ============================================

CREATE TABLE contents (
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

-- ============================================
-- TESTS & QUESTIONNAIRES
-- ============================================

CREATE TABLE tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID REFERENCES training_domains(id) ON DELETE CASCADE,
    title_ar VARCHAR(500) NOT NULL,
    title_en VARCHAR(500),
    description_ar TEXT,
    description_en TEXT,
    instructions_ar TEXT,
    instructions_en TEXT,
    duration_minutes INTEGER,
    passing_score DECIMAL(5,2),
    is_timed BOOLEAN DEFAULT false,
    is_randomized BOOLEAN DEFAULT false,
    show_results_immediately BOOLEAN DEFAULT true,
    confidentiality_level VARCHAR(50) DEFAULT 'standard' CHECK (confidentiality_level IN ('public', 'standard', 'confidential', 'highly_confidential')),
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test-Skills junction table (from add_test_skills_table migration)
CREATE TABLE test_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, skill_id)
);

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
    question_type VARCHAR(50) NOT NULL CHECK (question_type IN ('mcq', 'open_text', 'likert_scale', 'self_rating')),
    question_ar TEXT NOT NULL,
    question_en TEXT,
    options JSONB, -- For MCQ: [{value: 'a', text_ar: '', text_en: '', is_correct: bool, score: num}]
    likert_labels JSONB, -- For Likert: {min_label_ar, min_label_en, max_label_ar, max_label_en, scale: 5|7}
    self_rating_config JSONB, -- For self-rating: {min: 1, max: 10, labels: [...]}
    required BOOLEAN DEFAULT true,
    weight DECIMAL(5,2) DEFAULT 1.0,
    order_index INTEGER DEFAULT 0,
    
    -- AI assessment metadata (from add_assessment_metadata migration)
    assessment_metadata JSONB DEFAULT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TEST ASSIGNMENTS & RESPONSES
-- ============================================

CREATE TABLE test_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    due_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    time_spent_seconds INTEGER,
    notification_sent BOOLEAN DEFAULT false,
    reminder_count INTEGER DEFAULT 0,
    
    -- Email reminder tracking (from add_user_badges_table migration)
    email_reminder_sent BOOLEAN DEFAULT false,
    last_reminder_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, user_id)
);

CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES test_assignments(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    response_value TEXT, -- For MCQ: selected option, for others: the response
    response_data JSONB, -- Additional structured data
    score DECIMAL(5,2),
    is_correct BOOLEAN,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assignment_id, question_id)
);

-- ============================================
-- AI ANALYSIS & RESULTS
-- ============================================

CREATE TABLE analysis_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES test_assignments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    overall_score DECIMAL(5,2),
    skill_scores JSONB, -- {skill_id: {score, level: 'low'|'medium'|'high', gap_percentage}}
    strengths JSONB, -- [{skill_id, skill_name_ar, skill_name_en, score, description_ar, description_en}]
    gaps JSONB, -- [{skill_id, skill_name_ar, skill_name_en, gap_score, priority, description_ar, description_en}]
    open_text_analysis JSONB, -- {themes: [], sentiments: [], key_insights: [], concerns: []}
    ai_summary_ar TEXT,
    ai_summary_en TEXT,
    ai_recommendations_ar TEXT,
    ai_recommendations_en TEXT,
    raw_ai_response JSONB,
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assignment_id)
);

CREATE TABLE training_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID REFERENCES analysis_results(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
    course_title_ar VARCHAR(500),
    course_title_en VARCHAR(500),
    course_description_ar TEXT,
    course_description_en TEXT,
    course_url TEXT,
    provider VARCHAR(255),
    duration_hours INTEGER,
    difficulty_level VARCHAR(50),
    priority INTEGER DEFAULT 1,
    source VARCHAR(100) DEFAULT 'ai_generated', -- 'ai_generated', 'national_repository', 'manual'
    external_course_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'recommended' CHECK (status IN ('recommended', 'enrolled', 'in_progress', 'completed', 'skipped')),
    
    -- Recommendation context (from add_recommendation_reasons migration)
    recommendation_reason JSONB DEFAULT '{}'::jsonb,
    source_exam_id UUID REFERENCES tests(id) ON DELETE SET NULL,
    user_proficiency_category VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- EMPLOYEE PROFILES & DEVELOPMENT PLANS
-- ============================================

CREATE TABLE employee_skill_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    current_level VARCHAR(20) CHECK (current_level IN ('low', 'medium', 'high')),
    target_level VARCHAR(20) CHECK (target_level IN ('low', 'medium', 'high')),
    last_assessment_score DECIMAL(5,2),
    last_assessment_date TIMESTAMP,
    improvement_trend VARCHAR(20), -- 'improving', 'stable', 'declining'
    
    -- CV import tracking (from add_cv_import_features migration)
    source VARCHAR(50) DEFAULT 'assessment' CHECK (source IN ('assessment', 'cv_import', 'credentials', 'manual')),
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    verified BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, skill_id)
);

CREATE TABLE development_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title_ar VARCHAR(500),
    title_en VARCHAR(500),
    description_ar TEXT,
    description_en TEXT,
    start_date DATE,
    target_date DATE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE development_plan_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES development_plans(id) ON DELETE CASCADE,
    recommendation_id UUID REFERENCES training_recommendations(id) ON DELETE SET NULL,
    skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
    item_type VARCHAR(50) DEFAULT 'training', -- 'training', 'project', 'mentoring', 'certification'
    title_ar VARCHAR(500),
    title_en VARCHAR(500),
    description_ar TEXT,
    description_en TEXT,
    due_date DATE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    completion_date DATE,
    notes TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- EMPLOYEE TRAINING PLAN ITEMS
-- ============================================

CREATE TABLE employee_training_plan_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    
    -- For recommended courses (from system courses)
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    
    -- For external courses (added manually by employee)
    external_course_title VARCHAR(500),
    external_course_url TEXT,
    external_course_description TEXT,
    
    -- Plan metadata
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('recommended', 'external')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    completed_at TIMESTAMP,
    notes TEXT,
    
    -- Certificate reference for completion proof
    certificate_id UUID REFERENCES course_completion_certificates(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- 'test_assigned', 'test_reminder', 'results_ready', 'recommendation_new'
    title_ar VARCHAR(500),
    title_en VARCHAR(500),
    message_ar TEXT,
    message_en TEXT,
    link VARCHAR(500),
    metadata JSONB,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- USER BADGES (from add_user_badges_table migration)
-- ============================================

CREATE TABLE user_badges (
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

-- ============================================
-- INVITATIONS (from add_invitations_table migration)
-- ============================================

CREATE TABLE invitations (
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

-- ============================================
-- CV IMPORT TABLES (from add_cv_import_features migration)
-- ============================================

CREATE TABLE cv_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255),
    file_size INTEGER,
    extracted_data JSONB,
    imported_skills_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_experience (
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

CREATE TABLE user_education (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    degree VARCHAR(255),
    institution VARCHAR(255),
    graduation_year VARCHAR(50),
    source VARCHAR(50) DEFAULT 'cv_import',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    issuer VARCHAR(255),
    date VARCHAR(50),
    source VARCHAR(50) DEFAULT 'cv_import',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- COURSE COMPLETION CERTIFICATES (from add_nelc_integration migration)
-- ============================================

CREATE TABLE course_completion_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    admin_course_id UUID,
    certificate_path TEXT,
    original_filename TEXT,
    file_size INTEGER,
    mime_type VARCHAR(100),
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Source tracking
    completion_source VARCHAR(50) DEFAULT 'certificate_upload',
    
    -- NELC-specific fields
    nelc_completion_id VARCHAR(100),
    nelc_completion_date TIMESTAMP,
    nelc_progress_percentage DECIMAL(5,2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_completion_source CHECK (completion_source IN ('certificate_upload', 'certificate', 'nelc_sync', 'nelc', 'manual'))
);

-- ============================================
-- NELC SYNC LOG (from add_nelc_integration migration)
-- ============================================

CREATE TABLE nelc_sync_log (
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

-- ============================================
-- COURSE ENRICHMENTS (from add_course_enrichment migration)
-- ============================================

CREATE TABLE course_enrichments (
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
    
    -- Original course data snapshot
    course_name_ar VARCHAR(500),
    course_name_en VARCHAR(500)
);

-- ============================================
-- PASSWORD RESET TOKENS (from 027_password_reset_tokens migration)
-- ============================================

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ADMIN RECOMMENDATIONS (from add_admin_recommendations migration)
-- ============================================

CREATE TABLE admin_course_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_name_ar VARCHAR(500) NOT NULL,
    course_name_en VARCHAR(500),
    course_url TEXT,
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_hidden_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    hidden_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
);

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_national_id ON users(national_id) WHERE national_id IS NOT NULL;

-- Departments indexes
CREATE INDEX idx_departments_type ON departments(type);

-- Tests indexes
CREATE INDEX idx_tests_domain ON tests(domain_id);
CREATE INDEX idx_tests_status ON tests(status);

-- Questions indexes
CREATE INDEX idx_questions_test ON questions(test_id);
CREATE INDEX idx_questions_skill ON questions(skill_id);
CREATE INDEX idx_questions_cognitive_level ON questions ((assessment_metadata->>'cognitive_level')) WHERE assessment_metadata IS NOT NULL;
CREATE INDEX idx_questions_competency ON questions ((assessment_metadata->>'competency_measured')) WHERE assessment_metadata IS NOT NULL;

-- Test assignments indexes
CREATE INDEX idx_test_assignments_user ON test_assignments(user_id);
CREATE INDEX idx_test_assignments_test ON test_assignments(test_id);
CREATE INDEX idx_test_assignments_status ON test_assignments(status);

-- Responses indexes
CREATE INDEX idx_responses_assignment ON responses(assignment_id);

-- Analysis results indexes
CREATE INDEX idx_analysis_results_user ON analysis_results(user_id);

-- Training recommendations indexes
CREATE INDEX idx_training_recommendations_user ON training_recommendations(user_id);
CREATE INDEX idx_training_recommendations_source_exam ON training_recommendations(source_exam_id);
CREATE INDEX idx_training_recommendations_category ON training_recommendations(user_proficiency_category);

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- Audit log indexes
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- Domain departments indexes
CREATE INDEX idx_domain_departments_domain ON domain_departments(domain_id);
CREATE INDEX idx_domain_departments_department ON domain_departments(department_id);

-- Courses indexes
CREATE INDEX idx_courses_neo4j_node ON courses(neo4j_node_id);
CREATE INDEX idx_courses_synced ON courses(synced_to_neo4j, last_synced_at);
CREATE INDEX idx_courses_difficulty ON courses(difficulty_level);
CREATE INDEX idx_courses_provider ON courses(provider);
CREATE INDEX idx_courses_nelc_id ON courses(nelc_course_id) WHERE nelc_course_id IS NOT NULL;
CREATE INDEX idx_courses_subject ON courses(subject);
CREATE INDEX idx_courses_university ON courses(university);

-- Course skills indexes
CREATE INDEX idx_course_skills_course ON course_skills(course_id);
CREATE INDEX idx_course_skills_skill ON course_skills(skill_id);

-- Contents indexes
CREATE INDEX idx_contents_external_id ON contents(external_content_id);
CREATE INDEX idx_contents_level ON contents(level_id);
CREATE INDEX idx_contents_type ON contents(content_type_id);
CREATE INDEX idx_contents_synced ON contents(synced_at);

-- Test skills indexes
CREATE INDEX idx_test_skills_test ON test_skills(test_id);
CREATE INDEX idx_test_skills_skill ON test_skills(skill_id);

-- User badges indexes
CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX idx_user_badges_status ON user_badges(status);
CREATE INDEX idx_user_badges_notified ON user_badges(notified_award, notified_revoke);
CREATE UNIQUE INDEX idx_user_badges_active_unique ON user_badges(user_id, badge_id) WHERE status = 'active';

-- Invitations indexes
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_user ON invitations(user_id);
CREATE INDEX idx_invitations_status ON invitations(status);
CREATE INDEX idx_invitations_expires ON invitations(expires_at);

-- CV import indexes
CREATE INDEX idx_cv_imports_user_id ON cv_imports(user_id);
CREATE INDEX idx_cv_imports_created_at ON cv_imports(created_at);
CREATE INDEX idx_user_experience_user_id ON user_experience(user_id);
CREATE INDEX idx_user_education_user_id ON user_education(user_id);
CREATE INDEX idx_user_certificates_user_id ON user_certificates(user_id);

-- Course completion certificates indexes
CREATE INDEX idx_certificates_user ON course_completion_certificates(user_id);
CREATE INDEX idx_certificates_course ON course_completion_certificates(course_id);
CREATE INDEX idx_certificates_nelc_id ON course_completion_certificates(nelc_completion_id) WHERE nelc_completion_id IS NOT NULL;

-- NELC sync log indexes
CREATE INDEX idx_nelc_sync_log_user ON nelc_sync_log(user_id);
CREATE INDEX idx_nelc_sync_log_created ON nelc_sync_log(created_at DESC);

-- Course enrichments indexes
CREATE INDEX idx_course_enrichments_course_id ON course_enrichments(course_id);
CREATE INDEX idx_course_enrichments_enriched_at ON course_enrichments(enriched_at);

-- Password reset tokens indexes
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Admin recommendations indexes
CREATE INDEX idx_admin_course_recommendations_user_id ON admin_course_recommendations(user_id);
CREATE INDEX idx_user_hidden_recommendations_user_id ON user_hidden_recommendations(user_id);
CREATE INDEX idx_user_hidden_recommendations_course_id ON user_hidden_recommendations(course_id);

CREATE INDEX idx_training_plan_items_user ON employee_training_plan_items(user_id);
CREATE INDEX idx_training_plan_items_skill ON employee_training_plan_items(skill_id);
CREATE INDEX idx_training_plan_items_course ON employee_training_plan_items(course_id);
CREATE INDEX idx_training_plan_items_status ON employee_training_plan_items(status);
CREATE INDEX idx_training_plan_items_user_skill ON employee_training_plan_items(user_id, skill_id);
CREATE INDEX idx_training_plan_items_certificate ON employee_training_plan_items(certificate_id);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_training_domains_updated_at BEFORE UPDATE ON training_domains FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_assignments_updated_at BEFORE UPDATE ON test_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_responses_updated_at BEFORE UPDATE ON responses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_analysis_results_updated_at BEFORE UPDATE ON analysis_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_training_recommendations_updated_at BEFORE UPDATE ON training_recommendations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_employee_skill_profiles_updated_at BEFORE UPDATE ON employee_skill_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_development_plans_updated_at BEFORE UPDATE ON development_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_development_plan_items_updated_at BEFORE UPDATE ON development_plan_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contents_updated_at BEFORE UPDATE ON contents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_badges_updated_at BEFORE UPDATE ON user_badges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_employee_training_plan_items_updated_at BEFORE UPDATE ON employee_training_plan_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE COMMENTS
-- ============================================

COMMENT ON TABLE courses IS 'Stores training courses for recommendation system with Neo4j sync tracking';
COMMENT ON TABLE course_skills IS 'Many-to-many relationship between courses and skills';
COMMENT ON TABLE contents IS 'Stores content synced from external rh-contents API';
COMMENT ON TABLE test_skills IS 'Junction table linking tests to specific skills they target';
COMMENT ON TABLE user_badges IS 'Tracks badge awards and revocations for notification emails';
COMMENT ON TABLE course_enrichments IS 'Stores AI-enriched metadata for Neo4j courses (since Neo4j is read-only)';
COMMENT ON TABLE nelc_sync_log IS 'Audit log for NELC course sync operations';
COMMENT ON TABLE admin_course_recommendations IS 'Custom course recommendations added by admins for specific users';
COMMENT ON TABLE user_hidden_recommendations IS 'Courses hidden by admins from specific user recommendations';

-- Column comments
COMMENT ON COLUMN users.national_id IS 'National ID number - main learner identifier, can only be set by admins';
COMMENT ON COLUMN users.years_of_experience IS 'Number of years of work experience';
COMMENT ON COLUMN users.interests IS 'Array of skill IDs representing employee interests';
COMMENT ON COLUMN users.specialization_ar IS 'Employee specialization in Arabic';
COMMENT ON COLUMN users.specialization_en IS 'Employee specialization in English';
COMMENT ON COLUMN users.last_qualification_ar IS 'Last educational qualification in Arabic';
COMMENT ON COLUMN users.last_qualification_en IS 'Last educational qualification in English';
COMMENT ON COLUMN users.willing_to_change_career IS 'Whether employee is willing to change career path';
COMMENT ON COLUMN users.desired_domains IS 'Array of domain IDs representing career aspirations';
COMMENT ON COLUMN users.profile_completed IS 'Whether the employee has completed their profile setup';
COMMENT ON COLUMN users.nelc_access_token_encrypted IS 'Encrypted NELC API access token for user-initiated course sync';
COMMENT ON COLUMN users.nelc_token_expires_at IS 'Expiration timestamp for the stored NELC access token';
COMMENT ON COLUMN users.nelc_last_sync_at IS 'Timestamp of last successful course sync from NELC';

COMMENT ON COLUMN courses.neo4j_node_id IS 'The node ID from Neo4j graph database';
COMMENT ON COLUMN courses.synced_to_neo4j IS 'Whether this course has been synced to Neo4j';
COMMENT ON COLUMN courses.last_synced_at IS 'Last time this course was synced to Neo4j';
COMMENT ON COLUMN courses.nelc_course_id IS 'NELC platform course ID for matching with NELC User Management API';
COMMENT ON COLUMN courses.subject IS 'Course subject/category';
COMMENT ON COLUMN courses.subtitle IS 'Course subtitle or tagline';
COMMENT ON COLUMN courses.university IS 'University or institution offering the course';

COMMENT ON COLUMN course_skills.relevance_score IS 'How relevant this skill is to the course (0.0-1.0)';

COMMENT ON COLUMN contents.external_content_id IS 'The content ID from the external API';
COMMENT ON COLUMN contents.synced_at IS 'Last time this content was synced from external API';

COMMENT ON COLUMN questions.assessment_metadata IS 'AI-generated assessment metadata including rationale, common errors, competency, cognitive level, and rubric';

COMMENT ON COLUMN training_recommendations.recommendation_reason IS 'JSON containing exam name, matched skills, and explanation text for why course was recommended';
COMMENT ON COLUMN training_recommendations.source_exam_id IS 'Reference to the test/exam that triggered this recommendation';
COMMENT ON COLUMN training_recommendations.user_proficiency_category IS 'User proficiency level at time of recommendation: beginner, intermediate, or advanced';

COMMENT ON COLUMN user_badges.badge_id IS 'Unique identifier for badge type (e.g., top_5, high_score)';
COMMENT ON COLUMN user_badges.notified_award IS 'Whether award notification email was sent';
COMMENT ON COLUMN user_badges.notified_revoke IS 'Whether revoke notification email was sent';

COMMENT ON COLUMN course_completion_certificates.completion_source IS 'Source of completion: certificate_upload/certificate (user uploaded), nelc_sync/nelc (from NELC), or manual';
COMMENT ON COLUMN course_completion_certificates.nelc_completion_id IS 'NELC API completion record ID';
COMMENT ON COLUMN course_completion_certificates.nelc_completion_date IS 'Completion date from NELC API';
COMMENT ON COLUMN course_completion_certificates.nelc_progress_percentage IS 'Progress percentage from NELC API';
