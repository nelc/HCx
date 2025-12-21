const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🚀 Starting desired_domains migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations/add_desired_domains.sql'),
      'utf8'
    );

    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('   Added desired_domains column to users table');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
