/**
 * Run the department objectives migration
 * Adds objective_ar, objective_en, and responsibilities columns to departments table
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  console.log('🚀 Starting department objectives migration...\n');
  
  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrations/018_add_department_objectives.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Executing migration...\n');
    
    // Execute migration
    await db.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('\nAdded columns to departments table:');
    console.log('  - objective_ar (TEXT)');
    console.log('  - objective_en (TEXT)');
    console.log('  - responsibilities (JSONB)');
    
    // Verify columns exist
    const verifyResult = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'departments' 
      AND column_name IN ('objective_ar', 'objective_en', 'responsibilities')
      ORDER BY column_name
    `);
    
    console.log('\n📋 Verification - Columns found:');
    verifyResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.end();
    process.exit(0);
  }
}

runMigration();

