const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  try {
    console.log('🚀 Running user_badges migration...');
    
    const migrationPath = path.join(__dirname, 'migrations', 'add_user_badges_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('   - Created user_badges table');
    console.log('   - Added email_reminder_sent column to test_assignments');
    console.log('   - Added indexes for performance');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

