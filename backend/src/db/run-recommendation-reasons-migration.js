/**
 * Run the recommendation reasons migration
 * Adds columns for tracking why courses were recommended and linking to exams
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

async function runMigration() {
  console.log('🚀 Running recommendation reasons migration...\n');
  
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', 'add_recommendation_reasons.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await db.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify the columns were added
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'training_recommendations'
      AND column_name IN ('recommendation_reason', 'source_exam_id', 'user_proficiency_category')
      ORDER BY column_name
    `);
    
    console.log('📋 New columns added:');
    result.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    });
    
    // Check indexes
    const indexResult = await db.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'training_recommendations'
      AND indexname LIKE '%source_exam%' OR indexname LIKE '%category%'
    `);
    
    if (indexResult.rows.length > 0) {
      console.log('\n📊 New indexes created:');
      indexResult.rows.forEach(row => {
        console.log(`   - ${row.indexname}`);
      });
    }
    
    console.log('\n✨ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
