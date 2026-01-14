const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  console.log('🚀 Running course enrichment migration...');
  
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_course_enrichment.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(sql);
    
    console.log('✅ Course enrichment table created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
