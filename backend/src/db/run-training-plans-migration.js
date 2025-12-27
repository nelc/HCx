require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  console.log('🚀 Starting employee training plans migration...');
  
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_employee_training_plans.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(migrationSQL);
    
    console.log('✅ Employee training plans migration completed successfully!');
    
    // Verify the table was created
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'employee_training_plan_items'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ Table employee_training_plan_items exists');
      
      // Show table structure
      const columns = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'employee_training_plan_items'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📋 Table structure:');
      columns.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

