require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigration() {
  console.log('Running invitations table migration...');
  
  try {
    const sqlPath = path.join(__dirname, 'migrations/add_invitations_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await db.query(sql);
    
    console.log('✅ Invitations table migration completed successfully!');
    
    // Verify the table was created
    const result = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'invitations'
      ORDER BY ordinal_position
    `);
    
    console.log('\nInvitations table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
