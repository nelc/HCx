const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting database seeding...\n');
    
    // Create departments
    console.log('📁 Creating departments...');
    const departments = await client.query(`
      INSERT INTO departments (name_ar, name_en, description_ar, description_en)
      VALUES 
        ('الموارد البشرية', 'Human Resources', 'إدارة شؤون الموظفين والتطوير', 'Employee affairs and development management'),
        ('تقنية المعلومات', 'Information Technology', 'إدارة الأنظمة والبنية التحتية التقنية', 'Systems and IT infrastructure management'),
        ('المالية', 'Finance', 'إدارة الشؤون المالية والميزانيات', 'Financial affairs and budgets management'),
        ('التسويق', 'Marketing', 'إدارة التسويق والعلاقات العامة', 'Marketing and public relations management'),
        ('العمليات', 'Operations', 'إدارة العمليات التشغيلية', 'Operational management')
      RETURNING id, name_en
    `);
    
    const hrDeptId = departments.rows[0].id;
    const itDeptId = departments.rows[1].id;
    const financeDeptId = departments.rows[2].id;
    
    // Create users
    console.log('👥 Creating users...');
    const passwordHash = await bcrypt.hash('password123', 10);
    
    const users = await client.query(`
      INSERT INTO users (email, password_hash, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number)
      VALUES 
        ('admin@hrx.com', $1, 'مدير النظام', 'System Administrator', 'admin', $2, 'مدير نظام', 'System Administrator', 'EMP001'),
        ('training@hrx.com', $1, 'مسؤول التدريب', 'Training Officer', 'training_officer', $2, 'مسؤول التدريب والتطوير', 'Training & Development Officer', 'EMP002'),
        ('ahmed@hrx.com', $1, 'أحمد محمد', 'Ahmed Mohammed', 'employee', $3, 'مطور برمجيات', 'Software Developer', 'EMP003'),
        ('sara@hrx.com', $1, 'سارة علي', 'Sara Ali', 'employee', $4, 'محلل مالي', 'Financial Analyst', 'EMP004'),
        ('omar@hrx.com', $1, 'عمر خالد', 'Omar Khaled', 'employee', $3, 'مهندس بيانات', 'Data Engineer', 'EMP005'),
        ('fatima@hrx.com', $1, 'فاطمة أحمد', 'Fatima Ahmed', 'employee', $2, 'أخصائي موارد بشرية', 'HR Specialist', 'EMP006')
      RETURNING id, email, role
    `, [passwordHash, hrDeptId, itDeptId, financeDeptId]);
    
    const adminId = users.rows.find(u => u.role === 'admin').id;
    const officerId = users.rows.find(u => u.role === 'training_officer').id;
    const employeeIds = users.rows.filter(u => u.role === 'employee').map(u => u.id);
    
    // Create training domains
    console.log('🎯 Creating training domains...');
    const domains = await client.query(`
      INSERT INTO training_domains (name_ar, name_en, description_ar, description_en, icon, color, created_by)
      VALUES 
        ('إدارة المشاريع', 'Project Management', 'مهارات التخطيط والتنفيذ وإدارة المشاريع', 'Planning, execution and project management skills', 'clipboard-list', '#3B82F6', $1),
        ('تحليل البيانات', 'Data Analytics', 'مهارات تحليل واستخراج الرؤى من البيانات', 'Data analysis and insights extraction skills', 'chart-bar', '#10B981', $1),
        ('المهارات الرقمية', 'Digital Skills', 'مهارات التعامل مع الأدوات والمنصات الرقمية', 'Digital tools and platforms proficiency', 'desktop-computer', '#8B5CF6', $1),
        ('المهارات القيادية', 'Leadership Skills', 'مهارات القيادة والإدارة والتأثير', 'Leadership, management and influence skills', 'users', '#F59E0B', $1),
        ('التواصل الفعال', 'Effective Communication', 'مهارات التواصل والعرض والتفاوض', 'Communication, presentation and negotiation skills', 'chat', '#EC4899', $1)
      RETURNING id, name_en
    `, [adminId]);
    
    const pmDomainId = domains.rows[0].id;
    const analyticsDomainId = domains.rows[1].id;
    const digitalDomainId = domains.rows[2].id;
    const leadershipDomainId = domains.rows[3].id;
    
    // Create skills
    console.log('⚡ Creating skills...');
    const skills = await client.query(`
      INSERT INTO skills (domain_id, name_ar, name_en, description_ar, description_en, weight)
      VALUES 
        -- Project Management Skills
        ($1, 'تخطيط المشاريع', 'Project Planning', 'القدرة على وضع خطط مشاريع شاملة', 'Ability to create comprehensive project plans', 1.2),
        ($1, 'إدارة المخاطر', 'Risk Management', 'تحديد وتقييم وإدارة مخاطر المشروع', 'Identifying, assessing and managing project risks', 1.0),
        ($1, 'إدارة أصحاب المصلحة', 'Stakeholder Management', 'إدارة توقعات وتواصل أصحاب المصلحة', 'Managing stakeholder expectations and communication', 1.1),
        
        -- Data Analytics Skills
        ($2, 'تحليل البيانات الإحصائي', 'Statistical Analysis', 'استخدام الأساليب الإحصائية لتحليل البيانات', 'Using statistical methods for data analysis', 1.2),
        ($2, 'تصور البيانات', 'Data Visualization', 'إنشاء تصورات بيانية فعالة ومفهومة', 'Creating effective and understandable visualizations', 1.0),
        ($2, 'استخراج الرؤى', 'Insights Extraction', 'استخلاص رؤى قابلة للتنفيذ من البيانات', 'Extracting actionable insights from data', 1.3),
        
        -- Digital Skills
        ($3, 'استخدام الأدوات السحابية', 'Cloud Tools Proficiency', 'إتقان استخدام الخدمات السحابية', 'Proficiency in using cloud services', 1.0),
        ($3, 'الأمن السيبراني', 'Cybersecurity Awareness', 'الوعي بممارسات الأمان الرقمي', 'Awareness of digital security practices', 1.2),
        ($3, 'أتمتة العمليات', 'Process Automation', 'استخدام أدوات الأتمتة لتحسين الكفاءة', 'Using automation tools to improve efficiency', 1.1),
        
        -- Leadership Skills
        ($4, 'اتخاذ القرار', 'Decision Making', 'القدرة على اتخاذ قرارات فعالة', 'Ability to make effective decisions', 1.3),
        ($4, 'إدارة الفرق', 'Team Management', 'قيادة وتحفيز فرق العمل', 'Leading and motivating work teams', 1.2),
        ($4, 'التفكير الاستراتيجي', 'Strategic Thinking', 'التفكير على المستوى الاستراتيجي', 'Thinking at a strategic level', 1.4)
      RETURNING id, name_en, domain_id
    `, [pmDomainId, analyticsDomainId, digitalDomainId, leadershipDomainId]);
    
    const pmSkills = skills.rows.filter(s => s.domain_id === pmDomainId);
    const analyticsSkills = skills.rows.filter(s => s.domain_id === analyticsDomainId);
    
    // Create a sample test
    console.log('📝 Creating sample test...');
    const tests = await client.query(`
      INSERT INTO tests (domain_id, title_ar, title_en, description_ar, description_en, instructions_ar, instructions_en, 
                        duration_minutes, is_timed, status, start_date, end_date, created_by)
      VALUES 
        ($1, 'تقييم مهارات إدارة المشاريع', 'Project Management Skills Assessment', 
         'تقييم شامل لمهارات إدارة المشاريع', 'Comprehensive assessment of project management skills',
         'أجب على جميع الأسئلة بصدق. لا توجد إجابات صحيحة أو خاطئة في أسئلة التقييم الذاتي.',
         'Answer all questions honestly. There are no right or wrong answers in self-assessment questions.',
         45, true, 'published', NOW(), NOW() + INTERVAL '30 days', $2)
      RETURNING id
    `, [pmDomainId, officerId]);
    
    const testId = tests.rows[0].id;
    
    // Create sample questions
    console.log('❓ Creating sample questions...');
    await client.query(`
      INSERT INTO questions (test_id, skill_id, question_type, question_ar, question_en, options, required, weight, order_index)
      VALUES 
        -- MCQ Question
        ($1, $2, 'mcq', 
         'ما هو أول شيء يجب فعله عند بدء مشروع جديد؟',
         'What is the first thing to do when starting a new project?',
         '[
           {"value": "a", "text_ar": "البدء فوراً في التنفيذ", "text_en": "Start implementation immediately", "is_correct": false, "score": 0},
           {"value": "b", "text_ar": "تحديد نطاق المشروع وأهدافه", "text_en": "Define project scope and objectives", "is_correct": true, "score": 10},
           {"value": "c", "text_ar": "توظيف فريق العمل", "text_en": "Hire the team", "is_correct": false, "score": 3},
           {"value": "d", "text_ar": "شراء الأدوات والمعدات", "text_en": "Purchase tools and equipment", "is_correct": false, "score": 0}
         ]'::jsonb,
         true, 1.0, 1),
        
        -- Likert Scale Question
        ($1, $3, 'likert_scale',
         'أشعر بالثقة في قدرتي على تحديد وتقييم مخاطر المشروع',
         'I feel confident in my ability to identify and assess project risks',
         null,
         true, 1.0, 2),
        
        -- Self Rating Question
        ($1, $4, 'self_rating',
         'قيّم مستوى مهاراتك في إدارة توقعات أصحاب المصلحة',
         'Rate your skill level in managing stakeholder expectations',
         null,
         true, 1.0, 3),
        
        -- Open Text Question
        ($1, $2, 'open_text',
         'صف موقفاً صعباً واجهته في إدارة مشروع وكيف تعاملت معه',
         'Describe a difficult situation you faced in project management and how you handled it',
         null,
         true, 1.5, 4)
    `, [testId, pmSkills[0].id, pmSkills[1].id, pmSkills[2].id]);
    
    // Set Likert scale labels
    await client.query(`
      UPDATE questions 
      SET likert_labels = '{"min_label_ar": "لا أوافق بشدة", "min_label_en": "Strongly Disagree", "max_label_ar": "أوافق بشدة", "max_label_en": "Strongly Agree", "scale": 5}'::jsonb
      WHERE question_type = 'likert_scale' AND test_id = $1
    `, [testId]);
    
    // Set self-rating config
    await client.query(`
      UPDATE questions 
      SET self_rating_config = '{"min": 1, "max": 10, "labels": [{"value": 1, "ar": "مبتدئ", "en": "Beginner"}, {"value": 5, "ar": "متوسط", "en": "Intermediate"}, {"value": 10, "ar": "خبير", "en": "Expert"}]}'::jsonb
      WHERE question_type = 'self_rating' AND test_id = $1
    `, [testId]);
    
    // Assign test to employees
    console.log('📨 Assigning test to employees...');
    for (const empId of employeeIds) {
      await client.query(`
        INSERT INTO test_assignments (test_id, user_id, assigned_by, due_date, status)
        VALUES ($1, $2, $3, NOW() + INTERVAL '14 days', 'pending')
      `, [testId, empId, officerId]);
      
      // Create notification
      await client.query(`
        INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link)
        VALUES ($1, 'test_assigned', 
                'تقييم جديد متاح', 'New Assessment Available',
                'تم تعيين تقييم جديد لك: تقييم مهارات إدارة المشاريع',
                'A new assessment has been assigned to you: Project Management Skills Assessment',
                '/assessments')
      `, [empId]);
    }
    
    console.log('\n✅ Database seeded successfully!\n');
    console.log('📊 Summary:');
    console.log('   - 5 Departments');
    console.log('   - 6 Users (1 admin, 1 officer, 4 employees)');
    console.log('   - 5 Training Domains');
    console.log('   - 12 Skills');
    console.log('   - 1 Sample Test with 4 Questions');
    console.log('   - 4 Test Assignments\n');
    console.log('🔑 Login Credentials:');
    console.log('   Admin: admin@hrx.com / password123');
    console.log('   Training Officer: training@hrx.com / password123');
    console.log('   Employees: ahmed@hrx.com, sara@hrx.com, omar@hrx.com, fatima@hrx.com / password123\n');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);

