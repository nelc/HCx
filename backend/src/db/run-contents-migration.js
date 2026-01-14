const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('./index');

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_contents_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running contents table migration...');
    await db.query(sql);
    console.log('✓ Migration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

