require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_admin_recommendations.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running admin recommendations migration...');
    await db.query(sql);
    console.log('✓ Migration completed successfully!');
    console.log('✓ Created tables: admin_course_recommendations, user_hidden_recommendations');
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

