require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting assessment_metadata column migration...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_assessment_metadata.sql'),
      'utf8'
    );
    
    await client.query(sql);
    
    console.log('✓ assessment_metadata column added successfully');
    console.log('✓ Indexes created for cognitive_level and competency_measured');
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

