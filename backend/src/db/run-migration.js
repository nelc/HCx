const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_employee_profile.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running employee profile migration...');
    await db.query(sql);
    console.log('✓ Migration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

