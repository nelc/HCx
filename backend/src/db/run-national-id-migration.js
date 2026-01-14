/**
 * Migration script to add national_id field to users table
 * Run with: node src/db/run-national-id-migration.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  try {
    console.log('Starting national_id migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', 'add_national_id.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await db.query(migrationSQL);
    
    console.log('✅ Successfully added national_id column to users table');
    
    // Verify the column was added
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'national_id'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Verified: national_id column exists');
      console.log('   Type:', result.rows[0].data_type);
      console.log('   Nullable:', result.rows[0].is_nullable);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

