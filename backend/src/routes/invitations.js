const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin } = require('../middleware/auth');
const { sendInvitationEmail } = require('../services/emailService');

const router = express.Router();

// Generate secure invitation token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Calculate expiry date (7 days from now)
function getExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

// Create invitation (Admin only)
router.post('/', authenticate, isAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('name_ar').notEmpty().trim(),
  body('employee_number').optional().trim(),
  body('national_id').optional().trim(),
  body('department_id').optional().isUUID(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, name_ar, name_en, employee_number, national_id, department_id, job_title_ar, job_title_en } = req.body;

    // Check if email already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
    }

    // Check if employee number exists (if provided)
    if (employee_number) {
      const existingEmployee = await db.query(
        'SELECT id FROM users WHERE employee_number = $1',
        [employee_number]
      );
      if (existingEmployee.rows.length > 0) {
        return res.status(400).json({ error: 'الرقم الوظيفي مسجل مسبقاً' });
      }
    }

    // Check if national_id exists (if provided)
    if (national_id) {
      const existingNationalId = await db.query(
        'SELECT id FROM users WHERE national_id = $1',
        [national_id]
      );
      if (existingNationalId.rows.length > 0) {
        return res.status(400).json({ error: 'رقم الهوية الوطنية مسجل مسبقاً' });
      }
    }

    // Create user with is_active=false and placeholder password
    const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    
    const userResult = await db.query(`
      INSERT INTO users (
        email, password_hash, name_ar, name_en, role, 
        department_id, job_title_ar, job_title_en, employee_number, national_id, is_active
      )
      VALUES ($1, $2, $3, $4, 'employee', $5, $6, $7, $8, $9, false)
      RETURNING id, email, name_ar, name_en, department_id, employee_number, national_id
    `, [
      email,
      placeholderPassword,
      name_ar,
      name_en || name_ar,
      department_id || null,
      job_title_ar || null,
      job_title_en || null,
      employee_number || null,
      national_id || null,
    ]);

    const user = userResult.rows[0];

    // Generate invitation token
    const token = generateToken();
    const expiresAt = getExpiryDate();

    // Create invitation record
    await db.query(`
      INSERT INTO invitations (user_id, token, email, expires_at, created_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [user.id, token, email, expiresAt, req.user.id]);

    // Send invitation email
    try {
      await sendInvitationEmail(email, name_ar, token);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Don't fail the request, but inform the admin
      return res.status(201).json({
        ...user,
        invitation_sent: false,
        message: 'تم إنشاء المستخدم ولكن فشل إرسال البريد الإلكتروني. يمكنك إعادة الإرسال لاحقاً.',
      });
    }

    res.status(201).json({
      ...user,
      invitation_sent: true,
      message: 'تم إرسال الدعوة بنجاح',
    });

  } catch (error) {
    console.error('Create invitation error:', error);
    res.status(500).json({ error: 'فشل في إنشاء الدعوة' });
  }
});

// Verify invitation token (Public)
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await db.query(`
      SELECT i.*, u.name_ar, u.name_en, u.email as user_email
      FROM invitations i
      JOIN users u ON i.user_id = u.id
      WHERE i.token = $1
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'رابط الدعوة غير صالح' });
    }

    const invitation = result.rows[0];

    // Check if already accepted
    if (invitation.status === 'accepted') {
      return res.status(400).json({ error: 'تم قبول هذه الدعوة مسبقاً' });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      // Update status to expired
      await db.query(
        'UPDATE invitations SET status = $1 WHERE id = $2',
        ['expired', invitation.id]
      );
      return res.status(400).json({ error: 'انتهت صلاحية رابط الدعوة' });
    }

    res.json({
      valid: true,
      name_ar: invitation.name_ar,
      name_en: invitation.name_en,
      email: invitation.user_email,
    });

  } catch (error) {
    console.error('Verify invitation error:', error);
    res.status(500).json({ error: 'فشل في التحقق من الدعوة' });
  }
});

// Accept invitation (Public)
router.post('/accept', [
  body('token').notEmpty(),
  body('password').isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('كلمات المرور غير متطابقة');
    }
    return true;
  }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    // Get invitation
    const invResult = await db.query(`
      SELECT i.*, u.id as user_id
      FROM invitations i
      JOIN users u ON i.user_id = u.id
      WHERE i.token = $1
    `, [token]);

    if (invResult.rows.length === 0) {
      return res.status(404).json({ error: 'رابط الدعوة غير صالح' });
    }

    const invitation = invResult.rows[0];

    // Check if already accepted
    if (invitation.status === 'accepted') {
      return res.status(400).json({ error: 'تم قبول هذه الدعوة مسبقاً' });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      await db.query(
        'UPDATE invitations SET status = $1 WHERE id = $2',
        ['expired', invitation.id]
      );
      return res.status(400).json({ error: 'انتهت صلاحية رابط الدعوة' });
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user: set password and activate
    await db.query(`
      UPDATE users 
      SET password_hash = $1, is_active = true, updated_at = NOW()
      WHERE id = $2
    `, [passwordHash, invitation.user_id]);

    // Mark invitation as accepted
    await db.query(`
      UPDATE invitations 
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = $1
    `, [invitation.id]);

    res.json({ 
      success: true, 
      message: 'تم قبول الدعوة بنجاح. يمكنك الآن تسجيل الدخول.' 
    });

  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'فشل في قبول الدعوة' });
  }
});

// List all invitations (Admin only)
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        i.*,
        u.name_ar, u.name_en, u.employee_number, u.national_id,
        d.name_ar as department_name_ar, d.name_en as department_name_en,
        creator.name_ar as created_by_name
      FROM invitations i
      JOIN users u ON i.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users creator ON i.created_by = creator.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND i.status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM invitations WHERE 1=1';
    const countParams = status ? [status] : [];
    if (status) countQuery += ' AND status = $1';

    const countResult = await db.query(countQuery, countParams);

    res.json({
      invitations: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });

  } catch (error) {
    console.error('List invitations error:', error);
    res.status(500).json({ error: 'فشل في تحميل الدعوات' });
  }
});

// Resend invitation email (Admin only)
router.post('/:id/resend', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get invitation with user info
    const result = await db.query(`
      SELECT i.*, u.name_ar, u.email
      FROM invitations i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'الدعوة غير موجودة' });
    }

    const invitation = result.rows[0];

    // Check if already accepted
    if (invitation.status === 'accepted') {
      return res.status(400).json({ error: 'تم قبول هذه الدعوة مسبقاً' });
    }

    // Generate new token and extend expiry
    const newToken = generateToken();
    const newExpiry = getExpiryDate();

    await db.query(`
      UPDATE invitations 
      SET token = $1, expires_at = $2, status = 'pending'
      WHERE id = $3
    `, [newToken, newExpiry, id]);

    // Send new email
    try {
      await sendInvitationEmail(invitation.email, invitation.name_ar, newToken);
    } catch (emailError) {
      console.error('Failed to resend invitation email:', emailError);
      return res.status(500).json({ error: 'فشل في إرسال البريد الإلكتروني' });
    }

    res.json({ 
      success: true, 
      message: 'تم إعادة إرسال الدعوة بنجاح' 
    });

  } catch (error) {
    console.error('Resend invitation error:', error);
    res.status(500).json({ error: 'فشل في إعادة إرسال الدعوة' });
  }
});

// Delete/Cancel invitation (Admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get invitation
    const invResult = await db.query(
      'SELECT user_id, status FROM invitations WHERE id = $1',
      [id]
    );

    if (invResult.rows.length === 0) {
      return res.status(404).json({ error: 'الدعوة غير موجودة' });
    }

    const invitation = invResult.rows[0];

    // Can't delete accepted invitations
    if (invitation.status === 'accepted') {
      return res.status(400).json({ error: 'لا يمكن حذف دعوة تم قبولها' });
    }

    // Delete invitation
    await db.query('DELETE FROM invitations WHERE id = $1', [id]);

    // Delete the pending user
    await db.query('DELETE FROM users WHERE id = $1 AND is_active = false', [invitation.user_id]);

    res.json({ 
      success: true, 
      message: 'تم حذف الدعوة بنجاح' 
    });

  } catch (error) {
    console.error('Delete invitation error:', error);
    res.status(500).json({ error: 'فشل في حذف الدعوة' });
  }
});

module.exports = router;
