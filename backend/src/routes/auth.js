const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const nelcApi = require('../services/nelcApi');

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
      SELECT u.*, d.name_ar as department_name_ar, d.name_en as department_name_en
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
        avatar_url: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.email, u.name_ar, u.name_en, u.role, u.department_id, 
             u.job_title_ar, u.job_title_en, u.avatar_url, u.employee_number, u.national_id,
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
      name_en: names.name_en
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

module.exports = router;

