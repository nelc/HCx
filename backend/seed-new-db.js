require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Get pool configuration (supports all connection types)
const getPoolConfig = () => {
  const config = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (process.env.INSTANCE_CONNECTION_NAME) {
    config.host = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  } else if (process.env.DATABASE_URL) {
    config.connectionString = process.env.DATABASE_URL;
    config.ssl = { rejectUnauthorized: false };
  } else {
    config.host = process.env.DB_HOST || 'localhost';
    config.port = process.env.DB_PORT || 5432;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  }

  return config;
};

async function seed() {
  const pool = new Pool(getPoolConfig());
  const client = await pool.connect();
  
  try {
    console.log('\n🌱 Starting Database Seeding\n');
    console.log('=' .repeat(60));
    
    // Create departments
    console.log('📁 Creating departments...');
    const departments = await client.query(`
      INSERT INTO departments (name_ar, name_en, description_ar, description_en, type, parent_id)
      VALUES 
        ('الموارد البشرية', 'Human Resources', 'إدارة شؤون الموظفين والتطوير', 'Employee affairs and development management', 'sector', NULL),
        ('تقنية المعلومات', 'Information Technology', 'إدارة الأنظمة والبنية التحتية التقنية', 'Systems and IT infrastructure management', 'sector', NULL),
        ('المالية', 'Finance', 'إدارة الشؤون المالية والميزانيات', 'Financial affairs and budgets management', 'sector', NULL),
        ('التسويق', 'Marketing', 'إدارة التسويق والعلاقات العامة', 'Marketing and public relations management', 'sector', NULL),
        ('العمليات', 'Operations', 'إدارة العمليات التشغيلية', 'Operational management', 'sector', NULL)
      RETURNING id, name_en
    `);
    console.log(`   ✅ Created ${departments.rows.length} departments/sectors`);
    
    const hrDeptId = departments.rows[0].id;
    const itDeptId = departments.rows[1].id;
    const financeDeptId = departments.rows[2].id;
    
    // Create users with default password: password123
    console.log('\n👥 Creating users...');
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
    console.log(`   ✅ Created ${users.rows.length} users`);
    
    const adminId = users.rows[0].id;
    
    // Create training domains
    console.log('\n🎯 Creating training domains...');
    const domains = await client.query(`
      INSERT INTO training_domains (name_ar, name_en, description_ar, description_en, icon, color, created_by)
      VALUES 
        ('المهارات التقنية', 'Technical Skills', 'مهارات البرمجة والتقنية', 'Programming and technical skills', 'code', '#3B82F6', $1),
        ('مهارات الاتصال', 'Communication Skills', 'مهارات التواصل الفعال', 'Effective communication skills', 'chat', '#10B981', $1),
        ('القيادة والإدارة', 'Leadership & Management', 'مهارات القيادة وإدارة الفرق', 'Leadership and team management skills', 'users', '#8B5CF6', $1),
        ('التحليل المالي', 'Financial Analysis', 'مهارات التحليل المالي والمحاسبة', 'Financial analysis and accounting skills', 'chart', '#F59E0B', $1),
        ('التسويق الرقمي', 'Digital Marketing', 'مهارات التسويق الرقمي ووسائل التواصل', 'Digital marketing and social media skills', 'megaphone', '#EC4899', $1)
      RETURNING id, name_en
    `, [adminId]);
    console.log(`   ✅ Created ${domains.rows.length} training domains`);
    
    // Create skills
    console.log('\n⚡ Creating skills...');
    const techDomainId = domains.rows[0].id;
    const commDomainId = domains.rows[1].id;
    const leaderDomainId = domains.rows[2].id;
    
    const skills = await client.query(`
      INSERT INTO skills (name_ar, name_en, description_ar, description_en, domain_id, proficiency_levels, created_by)
      VALUES 
        ('JavaScript', 'JavaScript', 'لغة برمجة للويب', 'Web programming language', $1, $4, $5),
        ('React', 'React', 'مكتبة JavaScript للواجهات', 'JavaScript library for UI', $1, $4, $5),
        ('Node.js', 'Node.js', 'بيئة تشغيل JavaScript', 'JavaScript runtime', $1, $4, $5),
        ('SQL', 'SQL', 'لغة استعلام قواعد البيانات', 'Database query language', $1, $4, $5),
        ('العرض التقديمي', 'Presentation Skills', 'مهارات العرض والتقديم', 'Presentation and pitching skills', $2, $4, $5),
        ('الكتابة الفعالة', 'Effective Writing', 'مهارات الكتابة الاحترافية', 'Professional writing skills', $2, $4, $5),
        ('إدارة الفريق', 'Team Management', 'إدارة وقيادة الفرق', 'Team management and leadership', $3, $4, $5),
        ('التخطيط الاستراتيجي', 'Strategic Planning', 'التخطيط والتفكير الاستراتيجي', 'Strategic planning and thinking', $3, $4, $5)
      RETURNING id, name_en
    `, [techDomainId, commDomainId, leaderDomainId, ['مبتدئ', 'متوسط', 'متقدم', 'خبير'], adminId]);
    console.log(`   ✅ Created ${skills.rows.length} skills`);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Database Seeding Completed Successfully!');
    console.log('='.repeat(60));
    console.log('\n📋 Summary:');
    console.log(`   Departments: ${departments.rows.length}`);
    console.log(`   Users: ${users.rows.length}`);
    console.log(`   Training Domains: ${domains.rows.length}`);
    console.log(`   Skills: ${skills.rows.length}`);
    
    console.log('\n👥 Default Login Credentials:');
    console.log('   Admin:');
    console.log('     Email: admin@hrx.com');
    console.log('     Password: password123');
    console.log('   Training Officer:');
    console.log('     Email: training@hrx.com');
    console.log('     Password: password123');
    console.log('   Employee:');
    console.log('     Email: ahmed@hrx.com');
    console.log('     Password: password123');
    console.log('\n✨ You can now start your backend: npm run dev\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);

