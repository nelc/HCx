const { Pool } = require('pg');

// Configuration for Cloud SQL connection
// Supports both Cloud Run (with Unix socket) and local development
const getPoolConfig = () => {
  const config = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  // Check if running on Cloud Run with Cloud SQL
  if (process.env.INSTANCE_CONNECTION_NAME) {
    // Cloud Run with Cloud SQL - use Unix socket
    config.host = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  } else if (process.env.DATABASE_URL) {
    // Use connection string (for local development or external DB)
    config.connectionString = process.env.DATABASE_URL;
    config.ssl = {
      rejectUnauthorized: false
    };
  } else {
    // Fallback configuration
    config.host = process.env.DB_HOST || 'localhost';
    config.port = process.env.DB_PORT || 5432;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASS;
    config.database = process.env.DB_NAME || 'hrx';
  }

  return config;
};

const pool = new Pool(getPoolConfig());

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully at', res.rows[0].now);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};

