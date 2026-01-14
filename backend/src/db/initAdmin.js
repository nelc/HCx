const bcrypt = require('bcryptjs');
const db = require('./index');

/**
 * Initialize default admin user if it doesn't exist
 * This runs on every server startup but is idempotent
 */
async function initializeAdmin() {
  const adminEmail = 'hcx@elc.edu.sa';
  const adminPassword = 'user1234';
  
  try {
    // Check if admin already exists
    const existingAdmin = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );
    
    if (existingAdmin.rows.length > 0) {
      console.log(`✅ Admin user (${adminEmail}) already exists`);
      return;
    }
    
    // Hash the password
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    
    // Create the admin user
    await db.query(`
      INSERT INTO users (email, password_hash, name_ar, name_en, role, job_title_ar, job_title_en, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email) DO NOTHING
    `, [
      adminEmail,
      passwordHash,
      'مدير النظام',           // name_ar
      'System Administrator',   // name_en
      'admin',                  // role
      'مدير النظام',           // job_title_ar
      'System Administrator',   // job_title_en
      true                      // is_active
    ]);
    
    console.log(`✅ Admin user created: ${adminEmail}`);
    
  } catch (error) {
    console.error('❌ Failed to initialize admin user:', error.message);
    // Don't throw - allow server to start even if admin creation fails
  }
}

module.exports = { initializeAdmin };

