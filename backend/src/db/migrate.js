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
    console.log('   - departments');
    console.log('   - users');
    console.log('   - training_domains');
    console.log('   - skills');
    console.log('   - tests');
    console.log('   - questions');
    console.log('   - test_assignments');
    console.log('   - responses');
    console.log('   - analysis_results');
    console.log('   - training_recommendations');
    console.log('   - employee_skill_profiles');
    console.log('   - development_plans');
    console.log('   - development_plan_items');
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

