const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  try {
    console.log('🚀 Running performance indexes migration...');
    
    const migrationPath = path.join(__dirname, 'migrations', 'add_performance_indexes.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(sql);
    
    console.log('✅ Performance indexes migration completed successfully!');
    console.log('');
    console.log('Indexes created:');
    console.log('  - idx_courses_id');
    console.log('  - idx_course_skills_course_id');
    console.log('  - idx_course_skills_skill_id');
    console.log('  - idx_user_hidden_recommendations_user_id');
    console.log('  - idx_user_hidden_recommendations_course_id');
    console.log('  - idx_admin_course_recommendations_user_id');
    console.log('  - idx_course_completion_certificates_user_id');
    console.log('  - idx_course_completion_certificates_course_id');
    console.log('  - idx_course_completion_certificates_admin_course_id');
    console.log('  - idx_analysis_results_user_id_analyzed_at');
    console.log('  - idx_skills_domain_id');
    console.log('  - idx_courses_nelc_course_id');
    console.log('  - idx_hidden_courses_course_id');
    console.log('  - idx_users_interests (GIN)');
    console.log('  - idx_users_desired_domains (GIN)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

