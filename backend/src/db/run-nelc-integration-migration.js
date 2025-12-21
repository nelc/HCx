/**
 * Migration script to add NELC integration fields
 * Run with: node backend/src/db/run-nelc-integration-migration.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  try {
    console.log('Starting NELC integration migration...');
    
    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrations', 'add_nelc_integration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await db.query(migrationSQL);
    
    console.log('✅ Successfully added NELC integration fields');
    
    // Verify the changes
    const coursesCheck = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'courses' AND column_name = 'nelc_course_id'
    `);
    
    const usersCheck = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name IN ('nelc_access_token_encrypted', 'nelc_token_expires_at', 'nelc_last_sync_at')
    `);
    
    const certificatesCheck = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'course_completion_certificates' AND column_name IN ('completion_source', 'nelc_completion_id')
    `);
    
    const syncLogCheck = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'nelc_sync_log'
    `);
    
    console.log('\n📊 Migration verification:');
    
    if (coursesCheck.rows.length > 0) {
      console.log('  ✅ courses.nelc_course_id column exists');
    } else {
      console.log('  ⚠️  courses.nelc_course_id column not found');
    }
    
    if (usersCheck.rows.length >= 3) {
      console.log('  ✅ users NELC token columns exist');
    } else {
      console.log('  ⚠️  Some users NELC columns not found');
    }
    
    if (certificatesCheck.rows.length >= 2) {
      console.log('  ✅ course_completion_certificates NELC columns exist');
    } else {
      console.log('  ⚠️  Some certificate NELC columns not found');
    }
    
    if (syncLogCheck.rows.length > 0) {
      console.log('  ✅ nelc_sync_log table exists');
    } else {
      console.log('  ⚠️  nelc_sync_log table not found');
    }
    
    console.log('\n✅ NELC integration migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();

