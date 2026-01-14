const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const fs = require('fs');
const db = require('./index');

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_cv_import_features.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🚀 Running CV import features migration...\n');
    
    // Execute the migration
    await db.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    console.log('📋 Created/Modified:');
    console.log('   - cv_imports table');
    console.log('   - user_education table');
    console.log('   - user_experience table');
    console.log('   - users table (added phone, cv_imported, cv_imported_at, cv_raw_text)');
    console.log('   - employee_skill_profiles table (added source, confidence_score, verified)');
    console.log('   - Indexes created\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === '42P07') {
      console.log('\n⚠️  Some tables/columns may already exist. This is normal if running migration multiple times.');
      console.log('   The migration uses IF NOT EXISTS, so it should be safe to run again.\n');
    }
    process.exit(1);
  }
}

runMigration();

