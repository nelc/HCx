const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const nelcApi = require('../services/nelcApi');
const { sendPasswordResetEmail } = require('../services/emailService');
const ldapService = require('../services/ldapService');

const router = express.Router();

/**
 * Helper function to get user's name, preferring NELC data if available
 * @param {object} user - User object from database
 * @returns {Promise<object>} - Updated name fields
 */
async function getUserNameWithNelc(user) {
  const names = {
    name_ar: user.name_ar,
    name_en: user.name_en
  };
  
  // If user has a national ID, try to get name from NELC
  if (user.national_id) {
    try {
      const nelcName = await nelcApi.getUserNameByNationalId(user.national_id);
      if (nelcName) {
        // Use NELC name if available, fallback to database name
        if (nelcName.name_ar) {
          names.name_ar = nelcName.name_ar;
        }
        if (nelcName.name_en) {
          names.name_en = nelcName.name_en;
        }
      }
    } catch (error) {
      // If NELC API fails, silently use database values
      console.error('NELC name lookup failed:', error.message);
    }
  }
  
  return names;
}

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    const result = await db.query(`
      SELECT u.*, d.name_ar as department_name_ar, d.name_en as department_name_en,
             u.profile_completed
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.email = $1
    `, [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = result.rows[0];
    
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Update last login
    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Remove password hash from response
    delete user.password_hash;
    
    // Get name from NELC if user has national_id, fallback to database
    const names = await getUserNameWithNelc(user);
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name_ar: names.name_ar,
        name_en: names.name_en,
        role: user.role,
        department_id: user.department_id,
        department_name_ar: user.department_name_ar,
        department_name_en: user.department_name_en,
        job_title_ar: user.job_title_ar,
        job_title_en: user.job_title_en,
        employee_number: user.employee_number,
        national_id: user.national_id,
        avatar_url: user.avatar_url,
        profile_completed: user.profile_completed || false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// LDAP Login
router.post('/login/ldap', [
  body('username').notEmpty().withMessage('اسم المستخدم مطلوب'),
  body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { username, password } = req.body;
    
    // Authenticate against LDAP
    let ldapUser;
    try {
      ldapUser = await ldapService.authenticateUser(username, password);
    } catch (ldapError) {
      console.error('LDAP authentication failed:', ldapError.message);
      return res.status(401).json({ error: ldapError.message || 'فشل تسجيل الدخول' });
    }
    
    // Check if user exists in database by ldap_username or email
    let result = await db.query(`
      SELECT u.*, d.name_ar as department_name_ar, d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.ldap_username = $1 OR u.email = $2
    `, [username, ldapUser.email]);
    
    let user;
    
    if (result.rows.length === 0) {
      // Create new user from LDAP data
      const insertResult = await db.query(`
        INSERT INTO users (
          email, name_ar, name_en, role, auth_provider, ldap_username,
          job_title_ar, job_title_en, employee_number, is_active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
        RETURNING *
      `, [
        ldapUser.email,
        ldapUser.displayName || ldapUser.cn || username,
        ldapUser.displayName || ldapUser.cn || username,
        'employee', // Default role for LDAP users
        'ldap',
        username,
        ldapUser.title || null,
        ldapUser.title || null,
        ldapUser.employeeId || null
      ]);
      
      user = insertResult.rows[0];
      console.log('Created new LDAP user:', user.email);
    } else {
      user = result.rows[0];
      
      // Update auth_provider and ldap_username if not already set
      if (user.auth_provider !== 'ldap' || !user.ldap_username) {
        await db.query(`
          UPDATE users SET auth_provider = 'ldap', ldap_username = $1, updated_at = NOW()
          WHERE id = $2
        `, [username, user.id]);
        user.auth_provider = 'ldap';
        user.ldap_username = username;
      }
    }
    
    if (!user.is_active) {
      return res.status(403).json({ error: 'الحساب معطل' });
    }
    
    // Update last login
    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Get name from NELC if user has national_id
    const names = await getUserNameWithNelc(user);
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name_ar: names.name_ar,
        name_en: names.name_en,
        role: user.role,
        department_id: user.department_id,
        department_name_ar: user.department_name_ar,
        department_name_en: user.department_name_en,
        job_title_ar: user.job_title_ar,
        job_title_en: user.job_title_en,
        employee_number: user.employee_number,
        national_id: user.national_id,
        avatar_url: user.avatar_url,
        profile_completed: user.profile_completed || false,
        auth_provider: 'ldap'
      }
    });
  } catch (error) {
    console.error('LDAP Login error:', error);
    res.status(500).json({ error: 'فشل تسجيل الدخول' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.email, u.name_ar, u.name_en, u.role, u.department_id, 
             u.job_title_ar, u.job_title_en, u.avatar_url, u.employee_number, u.national_id,
             u.profile_completed,
             d.name_ar as department_name_ar, d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `, [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Get name from NELC if user has national_id, fallback to database
    const names = await getUserNameWithNelc(user);
    
    res.json({
      ...user,
      name_ar: names.name_ar,
      name_en: names.name_en,
      profile_completed: user.profile_completed || false
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Change password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Forgot password - send reset link
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email } = req.body;
    
    // Find user by email
    const userResult = await db.query(
      'SELECT id, email, name_ar, name_en, is_active FROM users WHERE email = $1',
      [email]
    );
    
    // Always return success to prevent email enumeration attacks
    if (userResult.rows.length === 0) {
      console.log('Password reset requested for non-existent email:', email);
      return res.json({ 
        message: 'إذا كان البريد الإلكتروني مسجلاً، سيتم إرسال رابط إعادة تعيين كلمة المرور' 
      });
    }
    
    const user = userResult.rows[0];
    
    // Allow password reset even for inactive users - they might need to reset before being reactivated
    
    // Generate secure reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    // Invalidate any existing tokens for this user
    await db.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );
    
    // Save the new token
    await db.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );
    
    // Send email
    try {
      await sendPasswordResetEmail(user.email, user.name_ar || user.name_en, token);
      console.log('Password reset email sent to:', user.email);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
      // Still return success to prevent email enumeration
    }
    
    res.json({ 
      message: 'إذا كان البريد الإلكتروني مسجلاً، سيتم إرسال رابط إعادة تعيين كلمة المرور' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'حدث خطأ. يرجى المحاولة مرة أخرى' });
  }
});

// Verify reset token
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const result = await db.query(
      `SELECT prt.*, u.email, u.name_ar, u.name_en 
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        valid: false, 
        error: 'الرابط غير صالح أو منتهي الصلاحية' 
      });
    }
    
    res.json({ 
      valid: true, 
      email: result.rows[0].email 
    });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ error: 'حدث خطأ. يرجى المحاولة مرة أخرى' });
  }
});

// Reset password with token
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { token, password } = req.body;
    
    // Find valid token
    const tokenResult = await db.query(
      `SELECT prt.*, u.id as user_id 
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL`,
      [token]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'الرابط غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد' 
      });
    }
    
    const resetToken = tokenResult.rows[0];
    
    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Update user password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, resetToken.user_id]
    );
    
    // Mark token as used
    await db.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [resetToken.id]
    );
    
    console.log('Password reset successful for user:', resetToken.user_id);
    
    res.json({ message: 'تم إعادة تعيين كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'حدث خطأ. يرجى المحاولة مرة أخرى' });
  }
});

module.exports = router;

