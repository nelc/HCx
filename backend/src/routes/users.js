const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get all users
router.get('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { role, department_id, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT u.id, u.email, u.name_ar, u.name_en, u.role, u.department_id,
             u.job_title_ar, u.job_title_en, u.employee_number, u.is_active,
             u.last_login, u.created_at,
             d.name_ar as department_name_ar, d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (role) {
      paramCount++;
      query += ` AND u.role = $${paramCount}`;
      params.push(role);
    }
    
    if (department_id) {
      paramCount++;
      query += ` AND u.department_id = $${paramCount}`;
      params.push(department_id);
    }
    
    if (search) {
      paramCount++;
      query += ` AND (u.name_ar ILIKE $${paramCount} OR u.name_en ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY u.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM users WHERE 1=1`;
    const countParams = params.slice(0, -2);
    if (role) countQuery += ` AND role = $1`;
    if (department_id) countQuery += ` AND department_id = $${countParams.length > 1 ? 2 : 1}`;
    if (search) countQuery += ` AND (name_ar ILIKE $${countParams.length} OR name_en ILIKE $${countParams.length} OR email ILIKE $${countParams.length})`;
    
    const countResult = await db.query(countQuery, countParams);
    
    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get single user
router.get('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.email, u.name_ar, u.name_en, u.role, u.department_id,
             u.job_title_ar, u.job_title_en, u.employee_number, u.avatar_url,
             u.is_active, u.last_login, u.created_at,
             d.name_ar as department_name_ar, d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Create user (Admin only)
router.post('/', authenticate, isAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name_ar').notEmpty(),
  body('name_en').notEmpty(),
  body('role').isIn(['admin', 'training_officer', 'employee'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number } = req.body;
    
    // Check if email exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await db.query(`
      INSERT INTO users (email, password_hash, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, email, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number
    `, [email, passwordHash, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, is_active } = req.body;
    
    const result = await db.query(`
      UPDATE users 
      SET name_ar = COALESCE($1, name_ar),
          name_en = COALESCE($2, name_en),
          role = COALESCE($3, role),
          department_id = $4,
          job_title_ar = COALESCE($5, job_title_ar),
          job_title_en = COALESCE($6, job_title_en),
          employee_number = COALESCE($7, employee_number),
          is_active = COALESCE($8, is_active)
      WHERE id = $9
      RETURNING id, email, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, is_active
    `, [name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, is_active, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get employees list (for assignment dropdown)
router.get('/list/employees', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { department_id } = req.query;
    
    let query = `
      SELECT u.id, u.name_ar, u.name_en, u.email, u.employee_number,
             d.name_ar as department_name_ar, d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'employee' AND u.is_active = true
    `;
    const params = [];
    
    if (department_id) {
      query += ' AND u.department_id = $1';
      params.push(department_id);
    }
    
    query += ' ORDER BY u.name_ar';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'Failed to get employees' });
  }
});

// Get employee profile
router.get('/profile/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT years_of_experience, interests, specialization_ar, specialization_en,
             last_qualification_ar, last_qualification_en, willing_to_change_career
      FROM users
      WHERE id = $1
    `, [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update employee profile
router.put('/profile/me', authenticate, [
  body('years_of_experience').optional().isInt({ min: 0, max: 100 }),
  body('interests').optional().isArray(),
  body('specialization_ar').optional().trim(),
  body('specialization_en').optional().trim(),
  body('last_qualification_ar').optional().trim(),
  body('last_qualification_en').optional().trim(),
  body('willing_to_change_career').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { 
      years_of_experience, 
      interests, 
      specialization_ar, 
      specialization_en,
      last_qualification_ar,
      last_qualification_en,
      willing_to_change_career 
    } = req.body;
    
    const result = await db.query(`
      UPDATE users 
      SET years_of_experience = COALESCE($1, years_of_experience),
          interests = COALESCE($2, interests),
          specialization_ar = COALESCE($3, specialization_ar),
          specialization_en = COALESCE($4, specialization_en),
          last_qualification_ar = COALESCE($5, last_qualification_ar),
          last_qualification_en = COALESCE($6, last_qualification_en),
          willing_to_change_career = COALESCE($7, willing_to_change_career)
      WHERE id = $8
      RETURNING years_of_experience, interests, specialization_ar, specialization_en,
                last_qualification_ar, last_qualification_en, willing_to_change_career
    `, [
      years_of_experience, 
      interests ? JSON.stringify(interests) : null,
      specialization_ar, 
      specialization_en,
      last_qualification_ar,
      last_qualification_en,
      willing_to_change_career,
      req.user.id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;

