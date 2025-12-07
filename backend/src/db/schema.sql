-- HCx Training Needs Assessment System - Database Schema
-- PostgreSQL Database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables (in reverse order due to foreign keys)
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
DROP TABLE IF EXISTS tests CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS training_domains CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description_ar TEXT,
    description_en TEXT,
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

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_departments_type ON departments(type);
CREATE INDEX idx_tests_domain ON tests(domain_id);
CREATE INDEX idx_tests_status ON tests(status);
CREATE INDEX idx_questions_test ON questions(test_id);
CREATE INDEX idx_questions_skill ON questions(skill_id);
CREATE INDEX idx_test_assignments_user ON test_assignments(user_id);
CREATE INDEX idx_test_assignments_test ON test_assignments(test_id);
CREATE INDEX idx_test_assignments_status ON test_assignments(status);
CREATE INDEX idx_responses_assignment ON responses(assignment_id);
CREATE INDEX idx_analysis_results_user ON analysis_results(user_id);
CREATE INDEX idx_training_recommendations_user ON training_recommendations(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_domain_departments_domain ON domain_departments(domain_id);
CREATE INDEX idx_domain_departments_department ON domain_departments(department_id);

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

