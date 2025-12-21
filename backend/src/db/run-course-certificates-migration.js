const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  console.log('Running course completion certificates migration...');
  
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_course_completion_certificates.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(migrationSQL);
    
    console.log('✅ Course completion certificates migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

