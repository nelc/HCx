const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting test_skills table migration...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_test_skills_table.sql'),
      'utf8'
    );
    
    await client.query(sql);
    
    console.log('✓ test_skills table created successfully');
    console.log('Migration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

