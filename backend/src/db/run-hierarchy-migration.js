const db = require('./index');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    console.log('📋 Running department hierarchy migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', 'enforce_department_hierarchy.sql'),
      'utf8'
    );
    
    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await client.query(statement);
        } catch (error) {
          // Some statements might fail if constraints already exist, which is okay
          if (error.message.includes('already exists')) {
            console.log('⚠️  Constraint already exists, skipping...');
          } else {
            throw error;
          }
        }
      }
    }
    
    await client.query('COMMIT');
    console.log('✅ Department hierarchy migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = runMigration;

