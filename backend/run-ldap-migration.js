/**
 * Run LDAP migration to add auth_provider column to users table
 */
const path = require('path');
// Load .env from backend folder first, then from root folder
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs = require('fs');

const getPoolConfig = () => {
  const config = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (process.env.INSTANCE_CONNECTION_NAME) {
    config.host = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  } else if (process.env.DATABASE_URL) {
    config.connectionString = process.env.DATABASE_URL;
    config.ssl = { rejectUnauthorized: false };
  } else {
    config.host = process.env.DB_HOST || 'localhost';
    config.port = process.env.DB_PORT || 5432;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  }

  return config;
};

async function runMigration() {
  const pool = new Pool(getPoolConfig());
  const client = await pool.connect();
  
  console.log('🚀 Running LDAP Authentication Migration\n');
  
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'src/db/migrations/add_auth_provider.sql'),
      'utf8'
    );
    
    await client.query(sql);
    console.log('✅ Migration completed successfully!');
    console.log('   - Added auth_provider column to users table');
    console.log('   - Added ldap_username column to users table');
    console.log('   - Made password_hash nullable for LDAP/SSO users');
    
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Migration already applied (columns already exist)');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
