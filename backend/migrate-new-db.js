require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Get pool configuration (supports all connection types)
const getPoolConfig = () => {
  const config = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (process.env.INSTANCE_CONNECTION_NAME) {
    // Cloud SQL with Unix socket
    config.host = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  } else if (process.env.DATABASE_URL) {
    // Connection string
    config.connectionString = process.env.DATABASE_URL;
    config.ssl = { rejectUnauthorized: false };
  } else {
    // Individual parameters
    config.host = process.env.DB_HOST || 'localhost';
    config.port = process.env.DB_PORT || 5432;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  }

  return config;
};

async function runSQLFile(client, filePath, description) {
  console.log(`\n📄 Running: ${description}`);
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    await client.query(sql);
    console.log(`   ✅ Success: ${description}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${description}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function migrate() {
  const pool = new Pool(getPoolConfig());
  
  console.log('\n🚀 Starting Complete Database Migration\n');
  console.log('=' .repeat(60));
  
  const client = await pool.connect();
  
  try {
    // Test connection
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    console.log(`   Database time: ${result.rows[0].now}`);
    
    // Step 1: Create main schema
    console.log('\n' + '='.repeat(60));
    console.log('STEP 1: Creating Main Schema');
    console.log('='.repeat(60));
    
    const schemaPath = path.join(__dirname, 'src/db/schema.sql');
    await runSQLFile(client, schemaPath, 'Main Schema (schema.sql)');
    
    // Step 2: Run additional migrations
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Running Additional Migrations');
    console.log('='.repeat(60));
    
    const migrationsDir = path.join(__dirname, 'src/db/migrations');
    const migrationFiles = [
      'add_department_type.sql',
      'enforce_department_hierarchy.sql',
      'make_english_fields_optional.sql',
      'add_employee_profile.sql',
      'add_domain_synonyms.sql',
      '006_add_domain_departments.sql',
      'add_test_skills_table.sql',
      'add_courses_table.sql',
      'add_course_skill_tags.sql',
      'update_courses_schema.sql',
      'add_contents_table.sql',
      'add_certificates_table.sql',
      'add_cv_import_features.sql'
    ];
    
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        await runSQLFile(client, filePath, file);
      } else {
        console.log(`   ⚠️  Skipped: ${file} (file not found)`);
      }
    }
    
    // Step 3: Verify tables
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Verifying Database Structure');
    console.log('='.repeat(60));
    
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`\n✅ Created ${tables.rows.length} tables:`);
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Migration Completed Successfully!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Run seeding: npm run db:seed');
    console.log('   OR: node seed-new-db.js');
    console.log('2. Start your backend: npm run dev');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);

