-- Migration: Add domain_synonyms table for flexible synonym matching
-- This table allows storing multiple synonyms for each training domain
-- to improve course recommendation matching

CREATE TABLE IF NOT EXISTS domain_synonyms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID REFERENCES training_domains(id) ON DELETE CASCADE,
    synonym_ar VARCHAR(255) NOT NULL,
    synonym_en VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain_id, synonym_ar)
);

-- Create indexes for faster lookups
CREATE INDEX idx_domain_synonyms_domain ON domain_synonyms(domain_id);
CREATE INDEX idx_domain_synonyms_ar ON domain_synonyms(synonym_ar);
CREATE INDEX idx_domain_synonyms_en ON domain_synonyms(synonym_en);

-- Seed common domain synonyms
-- Programming / البرمجة
INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'تطوير البرمجيات', 'Software Development'
FROM training_domains WHERE name_en = 'Programming' OR name_ar = 'البرمجة'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'هندسة البرمجيات', 'Software Engineering'
FROM training_domains WHERE name_en = 'Programming' OR name_ar = 'البرمجة'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'تطوير التطبيقات', 'Application Development'
FROM training_domains WHERE name_en = 'Programming' OR name_ar = 'البرمجة'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'البرمجة', 'Coding'
FROM training_domains WHERE name_en = 'Programming' OR name_ar = 'البرمجة'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

-- Business Management / إدارة الأعمال
INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'إدارة', 'Management'
FROM training_domains WHERE name_en ILIKE '%Business%' OR name_ar ILIKE '%أعمال%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'أعمال', 'Business'
FROM training_domains WHERE name_en ILIKE '%Business%' OR name_ar ILIKE '%أعمال%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'ريادة الأعمال', 'Entrepreneurship'
FROM training_domains WHERE name_en ILIKE '%Business%' OR name_ar ILIKE '%أعمال%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

-- Data Science / علم البيانات
INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'تحليل البيانات', 'Data Analysis'
FROM training_domains WHERE name_en ILIKE '%Data%' OR name_ar ILIKE '%بيانات%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'الذكاء الاصطناعي', 'Artificial Intelligence'
FROM training_domains WHERE name_en ILIKE '%Data%' OR name_ar ILIKE '%بيانات%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'التعلم الآلي', 'Machine Learning'
FROM training_domains WHERE name_en ILIKE '%Data%' OR name_ar ILIKE '%بيانات%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

-- Marketing / التسويق
INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'التسويق الرقمي', 'Digital Marketing'
FROM training_domains WHERE name_en ILIKE '%Marketing%' OR name_ar ILIKE '%تسويق%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'التسويق الإلكتروني', 'E-Marketing'
FROM training_domains WHERE name_en ILIKE '%Marketing%' OR name_ar ILIKE '%تسويق%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

-- Design / التصميم
INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'التصميم الجرافيكي', 'Graphic Design'
FROM training_domains WHERE name_en ILIKE '%Design%' OR name_ar ILIKE '%تصميم%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'تصميم واجهات المستخدم', 'UI Design'
FROM training_domains WHERE name_en ILIKE '%Design%' OR name_ar ILIKE '%تصميم%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'تجربة المستخدم', 'User Experience'
FROM training_domains WHERE name_en ILIKE '%Design%' OR name_ar ILIKE '%تصميم%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

-- Human Resources / الموارد البشرية
INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'إدارة الموارد البشرية', 'HR Management'
FROM training_domains WHERE name_en ILIKE '%Human Resources%' OR name_ar ILIKE '%موارد بشرية%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

INSERT INTO domain_synonyms (domain_id, synonym_ar, synonym_en)
SELECT id, 'التوظيف', 'Recruitment'
FROM training_domains WHERE name_en ILIKE '%Human Resources%' OR name_ar ILIKE '%موارد بشرية%'
ON CONFLICT (domain_id, synonym_ar) DO NOTHING;

COMMENT ON TABLE domain_synonyms IS 'Stores alternative names and synonyms for training domains to improve course matching accuracy';

