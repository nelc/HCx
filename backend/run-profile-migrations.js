/**
 * Run employee profile and desired domains migrations
 * Usage: cd backend && node run-profile-migrations.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const getPoolConfig = () => {
  const config = {
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  if (process.env.DATABASE_URL) {
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

async function runMigrations() {
  const pool = new Pool(getPoolConfig());
  
  try {
    console.log('🔌 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');

    // Run employee profile migration
    console.log('\n📦 Running employee profile migration...');
    const profileSql = fs.readFileSync(
      path.join(__dirname, 'src/db/migrations/add_employee_profile.sql'),
      'utf8'
    );
    await pool.query(profileSql);
    console.log('✅ Employee profile migration completed');

    // Run desired domains migration
    console.log('\n📦 Running desired domains migration...');
    const domainsSql = fs.readFileSync(
      path.join(__dirname, 'src/db/migrations/add_desired_domains.sql'),
      'utf8'
    );
    await pool.query(domainsSql);
    console.log('✅ Desired domains migration completed');

    console.log('\n🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Details:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigrations();
