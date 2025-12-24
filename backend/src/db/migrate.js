const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting database migration...\n');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await client.query(schema);
    
    console.log('✅ Database schema created successfully!\n');
    console.log('📋 Tables created:');
    console.log('   Core Tables:');
    console.log('   - departments');
    console.log('   - users');
    console.log('   - training_domains');
    console.log('   - skills');
    console.log('   - domain_departments');
    console.log('   ');
    console.log('   Courses & Content:');
    console.log('   - courses');
    console.log('   - course_skills');
    console.log('   - contents');
    console.log('   - course_enrichments');
    console.log('   ');
    console.log('   Tests & Assessments:');
    console.log('   - tests');
    console.log('   - test_skills');
    console.log('   - questions');
    console.log('   - test_assignments');
    console.log('   - responses');
    console.log('   ');
    console.log('   Analysis & Recommendations:');
    console.log('   - analysis_results');
    console.log('   - training_recommendations');
    console.log('   - admin_course_recommendations');
    console.log('   - user_hidden_recommendations');
    console.log('   ');
    console.log('   Employee Profiles:');
    console.log('   - employee_skill_profiles');
    console.log('   - development_plans');
    console.log('   - development_plan_items');
    console.log('   - user_badges');
    console.log('   ');
    console.log('   CV Import:');
    console.log('   - cv_imports');
    console.log('   - user_experience');
    console.log('   - user_education');
    console.log('   - user_certificates');
    console.log('   ');
    console.log('   Course Completions & NELC:');
    console.log('   - course_completion_certificates');
    console.log('   - nelc_sync_log');
    console.log('   ');
    console.log('   Auth & System:');
    console.log('   - invitations');
    console.log('   - password_reset_tokens');
    console.log('   - notifications');
    console.log('   - audit_log\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);

