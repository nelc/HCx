require('dotenv').config();

console.log('\n🔍 Database Configuration Diagnostics\n');
console.log('=' .repeat(60));

// Check what environment variables are set
console.log('\n📋 Environment Variables Status:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? `"${process.env.DATABASE_URL}"` : '❌ Not set');
console.log('INSTANCE_CONNECTION_NAME:', process.env.INSTANCE_CONNECTION_NAME || '❌ Not set');
console.log('DB_HOST:', process.env.DB_HOST || '❌ Not set');
console.log('DB_PORT:', process.env.DB_PORT || '❌ Not set');
console.log('DB_USER:', process.env.DB_USER || '❌ Not set');
console.log('DB_PASS:', process.env.DB_PASS ? '***SET***' : '❌ Not set');
console.log('DB_NAME:', process.env.DB_NAME || '❌ Not set');

console.log('\n' + '='.repeat(60));

// Check for the specific issue
if (process.env.DATABASE_URL !== undefined && !process.env.DATABASE_URL) {
  console.log('\n⚠️  PROBLEM FOUND!');
  console.log('DATABASE_URL is set but empty (empty string).');
  console.log('This causes the pg library to crash when trying to parse it.');
  console.log('\n💡 Solution: Either:');
  console.log('1. Remove DATABASE_URL from your .env file, OR');
  console.log('2. Set it to a valid PostgreSQL connection string like:');
  console.log('   DATABASE_URL=postgresql://username:password@localhost:5432/hrx');
  console.log('\n');
  process.exit(1);
}

// Now try to connect
const { Pool } = require('pg');

const getPoolConfig = () => {
  const config = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (process.env.INSTANCE_CONNECTION_NAME) {
    console.log('\n🔧 Using Cloud SQL configuration');
    config.host = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  } else if (process.env.DATABASE_URL) {
    console.log('\n🔧 Using DATABASE_URL connection string');
    config.connectionString = process.env.DATABASE_URL;
    config.ssl = { rejectUnauthorized: false };
  } else {
    console.log('\n🔧 Using individual DB configuration variables');
    config.host = process.env.DB_HOST || 'localhost';
    config.port = process.env.DB_PORT || 5432;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  }

  return config;
};

async function testConnection() {
  const pool = new Pool(getPoolConfig());

  console.log('\n🔌 Attempting to connect to database...\n');

  try {
    // Test 1: Basic connection
    const client = await pool.connect();
    console.log('✅ Connection established');

    // Test 2: Query execution
    const timeResult = await client.query('SELECT NOW() as current_time');
    console.log('✅ Query executed successfully');
    console.log('   Current database time:', timeResult.rows[0].current_time);

    // Test 3: Database version
    const versionResult = await client.query('SELECT version()');
    console.log('✅ Database version:', versionResult.rows[0].version.split(',')[0]);

    // Test 4: Check tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`✅ Found ${tablesResult.rows.length} tables in database`);
    if (tablesResult.rows.length > 0) {
      console.log('   Tables:', tablesResult.rows.map(r => r.table_name).join(', '));
    } else {
      console.log('   ⚠️  No tables found. You may need to run migrations.');
    }

    client.release();
    console.log('\n🎉 All tests passed! Database connection is working properly.\n');
    
  } catch (err) {
    console.error('\n❌ Database connection failed:');
    console.error('   Error:', err.message);
    console.error('   Code:', err.code);
    
    if (err.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: PostgreSQL is not running or not accepting connections');
      console.error('   - Make sure PostgreSQL is installed and running');
      console.error('   - Check that the host and port are correct');
      console.error('   - Try: brew services start postgresql (on macOS)');
    } else if (err.code === '28P01') {
      console.error('\n💡 Tip: Authentication failed');
      console.error('   - Check your database username and password');
    } else if (err.code === '3D000') {
      console.error('\n💡 Tip: Database does not exist');
      console.error('   - Create the database first: createdb hrx');
    } else if (err.code === 'ENOTFOUND') {
      console.error('\n💡 Tip: Database host not found');
      console.error('   - Check the DB_HOST value');
    }
    
  } finally {
    await pool.end();
  }
}

testConnection();

