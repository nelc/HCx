const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');
const { sendInvitationEmail } = require('../services/emailService');
const neo4jApi = require('../services/neo4jApi');

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

// Configure multer for CSV uploads
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'text/plain',
    ];
    const ext = file.originalname.split('.').pop().toLowerCase();

    if (allowedMimes.includes(file.mimetype) || ext === 'csv') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
    }
  },
});

// Multer error handler middleware for CSV uploads
const csvUploadErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('CSV Multer error:', err.code, err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الملف أكبر من المسموح (٢ ميغابايت)' });
    }
    return res.status(400).json({ error: 'خطأ في رفع الملف', message: err.message });
  }
  if (err) {
    console.error('CSV upload error:', err.message);
    return res.status(400).json({ error: 'خطأ في رفع الملف', message: err.message });
  }
  next();
};

// Get all users
router.get('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { role, department_id, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT u.id, u.email, u.name_ar, u.name_en, u.role, u.department_id,
             u.job_title_ar, u.job_title_en, u.employee_number, u.national_id, u.is_active,
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

// Bulk upload users from CSV (Admin only)
// Expected columns (Arabic headers):
// "الرقم الوظيفي","الاسم بالعربية","الاسم بالإنجليزية","الايميل","رقم الهوية الوطنية","القسم","المسمى الوظيفي"
router.post(
  '/bulk-upload',
  authenticate,
  isAdmin,
  csvUpload.single('file'),
  csvUploadErrorHandler,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'لم يتم تحميل ملف CSV' });
      }

      const csvText = req.file.buffer.toString('utf8');

      let rows;
      try {
        rows = parse(csvText, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } catch (err) {
        console.error('CSV parse error:', err);
        return res.status(400).json({
          error: 'صيغة الملف غير صحيحة',
          message: 'تأكد من أن الملف بصيغة CSV وأن الصف الأول يحتوي على العناوين المطلوبة',
        });
      }

      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: 'الملف لا يحتوي على بيانات' });
      }

      // Load departments once and build lookup by Arabic and English names
      const departmentsResult = await db.query(
        'SELECT id, name_ar, name_en FROM departments'
      );
      const departmentMap = new Map();
      departmentsResult.rows.forEach((dept) => {
        if (dept.name_ar) {
          departmentMap.set(dept.name_ar.trim(), dept.id);
        }
        if (dept.name_en) {
          departmentMap.set(dept.name_en.trim().toLowerCase(), dept.id);
        }
      });

      const created = [];
      const skipped = [];
      const errors = [];
      const invitationsSent = [];
      const invitationsFailed = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2; // +2 to account for header row (row 1)

        const employee_number = (row['الرقم الوظيفي'] || '').toString().trim();
        const name_ar = (row['الاسم بالعربية'] || '').toString().trim();
        const name_en = (row['الاسم بالإنجليزية'] || '').toString().trim();
        const email = (row['الايميل'] || '').toString().trim().toLowerCase();
        const national_id = (row['رقم الهوية الوطنية'] || '').toString().trim();
        const departmentName = (row['القسم'] || '').toString().trim();
        const job_title_ar = (row['المسمى الوظيفي'] || '').toString().trim();

        // Validate required fields
        if (!name_ar || !email || !national_id) {
          skipped.push({
            rowNumber,
            reason: 'الاسم بالعربية والبريد الإلكتروني ورقم الهوية الوطنية حقول مطلوبة',
            email,
            employee_number,
          });
          continue;
        }

        let department_id = null;
        if (departmentName) {
          const normalizedDeptName = departmentName.trim();
          department_id =
            departmentMap.get(normalizedDeptName) ||
            departmentMap.get(normalizedDeptName.toLowerCase()) ||
            null;

          if (!department_id) {
            skipped.push({
              rowNumber,
              reason: `القسم "${departmentName}" غير موجود في النظام`,
              email,
              employee_number,
            });
            continue;
          }
        }

        try {
          // Check duplicate email
          const existingEmail = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
          );
          if (existingEmail.rows.length > 0) {
            skipped.push({
              rowNumber,
              reason: 'البريد الإلكتروني موجود مسبقاً',
              email,
              employee_number,
            });
            continue;
          }

          // Check duplicate employee number if provided
          if (employee_number) {
            const existingEmp = await db.query(
              'SELECT id FROM users WHERE employee_number = $1',
              [employee_number]
            );
            if (existingEmp.rows.length > 0) {
              skipped.push({
                rowNumber,
                reason: 'الرقم الوظيفي موجود مسبقاً',
                email,
                employee_number,
              });
              continue;
            }
          }

          // Check duplicate national_id
          const existingNationalId = await db.query(
            'SELECT id FROM users WHERE national_id = $1',
            [national_id]
          );
          if (existingNationalId.rows.length > 0) {
            skipped.push({
              rowNumber,
              reason: 'رقم الهوية الوطنية موجود مسبقاً',
              email,
              employee_number,
            });
            continue;
          }

          // Create user with is_active=false (will be activated when they accept invitation)
          const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
          const finalNameEn = name_en || name_ar;

          const insertResult = await db.query(
            `
            INSERT INTO users (
              email, password_hash, name_ar, name_en, role,
              department_id, job_title_ar, job_title_en, employee_number, national_id, is_active
            )
            VALUES ($1, $2, $3, $4, 'employee', $5, $6, $7, $8, $9, false)
            RETURNING id, email, name_ar, name_en, department_id, employee_number, national_id
          `,
            [
              email,
              placeholderPassword,
              name_ar,
              finalNameEn,
              department_id,
              job_title_ar || null,
              job_title_ar || null,
              employee_number || null,
              national_id,
            ]
          );

          const user = insertResult.rows[0];

          // Generate invitation token
          const token = generateToken();
          const expiresAt = getExpiryDate();

          // Create invitation record
          await db.query(`
            INSERT INTO invitations (user_id, token, email, expires_at, created_by)
            VALUES ($1, $2, $3, $4, $5)
          `, [user.id, token, email, expiresAt, req.user.id]);

          created.push({
            rowNumber,
            id: user.id,
            email: user.email,
            name_ar,
            department_id,
            employee_number: user.employee_number,
            national_id: user.national_id,
          });

          // Send invitation email
          console.log(`📧 [CSV Upload] Attempting to send invitation email to: ${email} (row ${rowNumber})`);
          try {
            await sendInvitationEmail(email, name_ar, token);
            console.log(`✅ [CSV Upload] Invitation email sent successfully to: ${email}`);
            invitationsSent.push({
              rowNumber,
              email,
              name_ar,
            });
          } catch (emailError) {
            console.error(`❌ [CSV Upload] Failed to send invitation email to ${email}:`, emailError.message);
            invitationsFailed.push({
              rowNumber,
              email,
              name_ar,
              error: emailError.message || 'فشل في إرسال البريد الإلكتروني',
            });
          }

        } catch (err) {
          console.error('Bulk user row error:', err);
          errors.push({
            rowNumber,
            email,
            employee_number,
            error: err.message,
          });
        }
      }

      // Log summary
      console.log(`📊 [CSV Upload] Summary: Total=${rows.length}, Created=${created.length}, Skipped=${skipped.length}, Errors=${errors.length}`);
      console.log(`📧 [CSV Upload] Emails: Sent=${invitationsSent.length}, Failed=${invitationsFailed.length}`);
      
      if (invitationsFailed.length > 0) {
        console.warn(`⚠️ [CSV Upload] Failed email recipients:`, invitationsFailed.map(f => f.email).join(', '));
      }

      res.json({
        totalRows: rows.length,
        createdCount: created.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        invitationsSentCount: invitationsSent.length,
        invitationsFailedCount: invitationsFailed.length,
        created,
        skipped,
        errors,
        invitationsSent,
        invitationsFailed,
      });
    } catch (error) {
      console.error('Bulk upload users error:', error);
      res
        .status(500)
        .json({ error: 'فشل في استيراد المستخدمين من الملف' });
    }
  }
);

// Get single user
router.get('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.email, u.name_ar, u.name_en, u.role, u.department_id,
             u.job_title_ar, u.job_title_en, u.employee_number, u.national_id, u.avatar_url,
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
  body('role').isIn(['admin', 'training_officer', 'employee']),
  body('national_id').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, national_id } = req.body;
    
    // Check if email exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Check if national_id exists (if provided)
    if (national_id) {
      const existingNationalId = await db.query('SELECT id FROM users WHERE national_id = $1', [national_id]);
      if (existingNationalId.rows.length > 0) {
        return res.status(400).json({ error: 'رقم الهوية الوطنية مسجل مسبقاً' });
      }
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await db.query(`
      INSERT INTO users (email, password_hash, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, national_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, email, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, national_id
    `, [email, passwordHash, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, national_id || null]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (Admin only - includes national_id which users cannot edit themselves)
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, national_id, is_active } = req.body;
    
    // Check if national_id is being updated and verify uniqueness
    if (national_id !== undefined && national_id !== null && national_id !== '') {
      const existingNationalId = await db.query(
        'SELECT id FROM users WHERE national_id = $1 AND id != $2',
        [national_id, req.params.id]
      );
      if (existingNationalId.rows.length > 0) {
        return res.status(400).json({ error: 'رقم الهوية الوطنية مسجل مسبقاً' });
      }
    }
    
    const result = await db.query(`
      UPDATE users 
      SET name_ar = COALESCE($1, name_ar),
          name_en = COALESCE($2, name_en),
          role = COALESCE($3, role),
          department_id = $4,
          job_title_ar = COALESCE($5, job_title_ar),
          job_title_en = COALESCE($6, job_title_en),
          employee_number = COALESCE($7, employee_number),
          national_id = COALESCE($8, national_id),
          is_active = COALESCE($9, is_active)
      WHERE id = $10
      RETURNING id, email, name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, national_id, is_active
    `, [name_ar, name_en, role, department_id, job_title_ar, job_title_en, employee_number, national_id, is_active, req.params.id]);
    
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
      SELECT u.id, u.name_ar, u.name_en, u.email, u.employee_number, u.national_id,
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
             last_qualification_ar, last_qualification_en, willing_to_change_career,
             desired_domains
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
  body('willing_to_change_career').optional().isBoolean(),
  body('desired_domains').optional().isArray()
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
      willing_to_change_career,
      desired_domains
    } = req.body;
    
    const result = await db.query(`
      UPDATE users 
      SET years_of_experience = COALESCE($1, years_of_experience),
          interests = COALESCE($2, interests),
          specialization_ar = COALESCE($3, specialization_ar),
          specialization_en = COALESCE($4, specialization_en),
          last_qualification_ar = COALESCE($5, last_qualification_ar),
          last_qualification_en = COALESCE($6, last_qualification_en),
          willing_to_change_career = COALESCE($7, willing_to_change_career),
          desired_domains = COALESCE($8, desired_domains),
          profile_completed = true
      WHERE id = $9
      RETURNING years_of_experience, interests, specialization_ar, specialization_en,
                last_qualification_ar, last_qualification_en, willing_to_change_career,
                desired_domains, profile_completed
    `, [
      years_of_experience, 
      interests ? JSON.stringify(interests) : null,
      specialization_ar, 
      specialization_en,
      last_qualification_ar,
      last_qualification_en,
      willing_to_change_career,
      desired_domains ? JSON.stringify(desired_domains) : null,
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

// Get full user profile with all data (Admin/Training Officer - for Reports page)
router.get('/:id/full-profile', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Get basic user info with department
    const userResult = await db.query(`
      SELECT u.id, u.email, u.name_ar, u.name_en, u.role, u.department_id,
             u.job_title_ar, u.job_title_en, u.employee_number, u.national_id, u.is_active,
             u.last_login, u.created_at,
             u.years_of_experience, u.interests, u.specialization_ar, u.specialization_en,
             u.last_qualification_ar, u.last_qualification_en, u.willing_to_change_career,
             u.desired_domains,
             d.name_ar as department_name_ar, d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Get desired domains details if user has selected any
    let desiredDomainsDetails = [];
    if (user.desired_domains && user.desired_domains.length > 0) {
      const domainsResult = await db.query(`
        SELECT id, name_ar, name_en, color, description_ar
        FROM training_domains
        WHERE id = ANY($1)
      `, [user.desired_domains]);
      desiredDomainsDetails = domainsResult.rows;
    }
    
    // Get test assignments and their results
    const assignmentsResult = await db.query(`
      SELECT 
        ta.id as assignment_id,
        ta.status,
        ta.created_at as assigned_at,
        ta.completed_at,
        ta.due_date,
        t.id as test_id,
        t.title_ar as test_title_ar,
        t.title_en as test_title_en,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color,
        ar.id as analysis_id,
        ar.overall_score,
        ar.strengths,
        ar.gaps,
        ar.analyzed_at,
        -- Check for open_text questions needing grading
        (
          SELECT COUNT(*) FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = ta.id
          AND q.question_type = 'open_text'
          AND r.score IS NULL
        ) as ungraded_open_questions,
        -- Get total open_text questions
        (
          SELECT COUNT(*) FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = ta.id
          AND q.question_type = 'open_text'
        ) as total_open_questions
      FROM test_assignments ta
      JOIN tests t ON ta.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      LEFT JOIN analysis_results ar ON ar.assignment_id = ta.id
      WHERE ta.user_id = $1
      ORDER BY ta.created_at DESC
    `, [userId]);
    
    // Calculate actual grades for completed assignments
    const assignmentsWithGrades = await Promise.all(assignmentsResult.rows.map(async (row) => {
      if (row.status !== 'completed') {
        return row;
      }
      
      // Get weighted score breakdown
      const responsesData = await db.query(`
        SELECT 
          r.score,
          q.question_type,
          q.options,
          q.weight
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.assignment_id = $1
      `, [row.assignment_id]);
      
      let totalScore = 0;
      let totalMaxScore = 0;
      
      for (const response of responsesData.rows) {
        let maxScore = 10;
        
        if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
          const optionScores = response.options.map(o => parseFloat(o.score) || 0);
          maxScore = Math.max(...optionScores, 10);
        } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
          maxScore = 10;
        } else if (response.question_type === 'open_text') {
          maxScore = 10;
        }
        
        const weight = parseFloat(response.weight) || 1;
        const score = parseFloat(response.score) || 0;
        
        totalScore += score * weight;
        totalMaxScore += maxScore * weight;
      }
      
      const calculatedGrade = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
      
      return {
        ...row,
        calculated_grade: calculatedGrade,
        needs_grading: parseInt(row.ungraded_open_questions) > 0,
        ungraded_count: parseInt(row.ungraded_open_questions),
        total_open_questions: parseInt(row.total_open_questions)
      };
    }));
    
    // Get competency matrix data (domains and skills for user's department)
    let competencyMatrix = { domains: [], summary: {} };
    
    if (user.department_id) {
      // Get domains linked to user's department and their skills
      const skillsResult = await db.query(`
        SELECT 
          td.id as domain_id,
          td.name_ar as domain_name_ar,
          td.name_en as domain_name_en,
          td.color as domain_color,
          s.id as skill_id,
          s.name_ar as skill_name_ar,
          s.name_en as skill_name_en,
          s.weight as skill_weight
        FROM training_domains td
        INNER JOIN domain_departments dd ON dd.domain_id = td.id
        LEFT JOIN skills s ON s.domain_id = td.id
        WHERE td.is_active = true AND dd.department_id = $1
        ORDER BY td.name_ar, s.name_ar
      `, [user.department_id]);
      
      // Get user's analysis results with assignment details for recalculation
      const analysesResult = await db.query(`
        SELECT ar.id, ar.assignment_id, ar.test_id, ar.skill_scores, ar.analyzed_at
        FROM analysis_results ar
        WHERE ar.user_id = $1
        ORDER BY ar.analyzed_at DESC
      `, [userId]);
      
      // Calculate ACTUAL scores from responses (to match test results display)
      const skillScoresMap = {};
      
      for (const analysis of analysesResult.rows) {
        // Get the test's target skills
        const testSkillsResult = await db.query(`
          SELECT s.id as skill_id
          FROM test_skills ts
          JOIN skills s ON ts.skill_id = s.id
          WHERE ts.test_id = $1
        `, [analysis.test_id]);
        
        if (testSkillsResult.rows.length === 0) continue;
        
        // Recalculate the ACTUAL grade from responses (same logic as calculated_grade above)
        const responsesData = await db.query(`
          SELECT r.score, q.question_type, q.options, q.weight
          FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = $1
        `, [analysis.assignment_id]);
        
        let totalScore = 0;
        let totalMaxScore = 0;
        
        for (const response of responsesData.rows) {
          let maxScore = 10;
          
          if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
            const optionScores = response.options.map(o => parseFloat(o.score) || 0);
            maxScore = Math.max(...optionScores, 10);
          } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
            maxScore = 10;
          } else if (response.question_type === 'open_text') {
            maxScore = 10;
          }
          
          const weight = parseFloat(response.weight) || 1;
          const score = parseFloat(response.score) || 0;
          
          totalScore += score * weight;
          totalMaxScore += maxScore * weight;
        }
        
        const actualGrade = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
        
        // Apply this recalculated grade to all skills in this test
        for (const skillRow of testSkillsResult.rows) {
          const skillId = skillRow.skill_id;
          if (!skillScoresMap[skillId]) {
            skillScoresMap[skillId] = { scores: [], totalScore: 0, count: 0 };
          }
          skillScoresMap[skillId].scores.push(actualGrade);
          skillScoresMap[skillId].totalScore += actualGrade;
          skillScoresMap[skillId].count += 1;
        }
      }
      
      // Calculate averages
      Object.keys(skillScoresMap).forEach(skillId => {
        const data = skillScoresMap[skillId];
        skillScoresMap[skillId].averageScore = Math.round(data.totalScore / data.count);
      });
      
      // Get employee skill profiles
      const profilesResult = await db.query(`
        SELECT skill_id, current_level, target_level, improvement_trend
        FROM employee_skill_profiles
        WHERE user_id = $1
      `, [userId]);
      
      const profilesMap = {};
      profilesResult.rows.forEach(profile => {
        profilesMap[profile.skill_id] = profile;
      });
      
      // Group skills by domain
      const domains = {};
      skillsResult.rows.forEach(row => {
        const domainId = row.domain_id;
        
        if (!domains[domainId]) {
          domains[domainId] = {
            domain_id: domainId,
            domain_name_ar: row.domain_name_ar,
            domain_name_en: row.domain_name_en,
            domain_color: row.domain_color || '#502390',
            skills: []
          };
        }
        
        if (row.skill_id) {
          const skillId = row.skill_id;
          const profile = profilesMap[skillId] || {};
          const scoreData = skillScoresMap[skillId];
          
          domains[domainId].skills.push({
            skill_id: skillId,
            name_ar: row.skill_name_ar,
            name_en: row.skill_name_en,
            current_level: profile.current_level || null,
            target_level: profile.target_level || null,
            score: scoreData ? scoreData.averageScore : null,
            trend: profile.improvement_trend || null,
            weight: row.skill_weight || 1.0
          });
        }
      });
      
      // Calculate domain-level metrics
      let totalSkillsAssessed = 0;
      const domainsList = Object.values(domains);
      
      domainsList.forEach(domain => {
        const assessedSkills = domain.skills.filter(s => s.score !== null);
        domain.proficiency = assessedSkills.length > 0 
          ? Math.round(assessedSkills.reduce((sum, s) => sum + s.score, 0) / assessedSkills.length)
          : 0;
        domain.total_skills = domain.skills.length;
        domain.assessed_skills = assessedSkills.length;
        totalSkillsAssessed += assessedSkills.length;
      });
      
      const totalSkills = domainsList.reduce((sum, d) => sum + d.total_skills, 0);
      
      competencyMatrix = {
        domains: domainsList,
        summary: {
          total_domains: domainsList.length,
          total_skills: totalSkills,
          skills_assessed: totalSkillsAssessed,
          overall_readiness: domainsList.length > 0 
            ? Math.round(domainsList.reduce((sum, d) => sum + d.proficiency, 0) / domainsList.length)
            : 0
        }
      };
    }
    
    // Get CV-imported skills for this user
    const cvSkillsResult = await db.query(`
      SELECT 
        esp.skill_id,
        esp.current_level,
        esp.confidence_score,
        esp.source,
        esp.created_at as imported_at,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        td.id as domain_id,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color
      FROM employee_skill_profiles esp
      JOIN skills s ON esp.skill_id = s.id
      JOIN training_domains td ON s.domain_id = td.id
      WHERE esp.user_id = $1 AND esp.source = 'cv_import'
      ORDER BY td.name_ar, s.name_ar
    `, [userId]);
    
    // Group CV skills by domain
    const cvSkillsByDomain = {};
    cvSkillsResult.rows.forEach(skill => {
      if (!cvSkillsByDomain[skill.domain_id]) {
        cvSkillsByDomain[skill.domain_id] = {
          domain_id: skill.domain_id,
          domain_name_ar: skill.domain_name_ar,
          domain_name_en: skill.domain_name_en,
          domain_color: skill.domain_color,
          skills: []
        };
      }
      cvSkillsByDomain[skill.domain_id].skills.push({
        skill_id: skill.skill_id,
        name_ar: skill.skill_name_ar,
        name_en: skill.skill_name_en,
        current_level: skill.current_level,
        confidence_score: skill.confidence_score,
        imported_at: skill.imported_at
      });
    });
    
    // Get CV import info (last import date, etc.)
    const cvImportResult = await db.query(`
      SELECT id, file_name, imported_skills_count, status, created_at
      FROM cv_imports
      WHERE user_id = $1 AND status = 'completed'
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);
    
    const lastCvImport = cvImportResult.rows[0] || null;
    
    // Build response
    const response = {
      user: {
        id: user.id,
        email: user.email,
        name_ar: user.name_ar,
        name_en: user.name_en,
        role: user.role,
        department_id: user.department_id,
        department_name_ar: user.department_name_ar,
        department_name_en: user.department_name_en,
        job_title_ar: user.job_title_ar,
        job_title_en: user.job_title_en,
        employee_number: user.employee_number,
        national_id: user.national_id,
        is_active: user.is_active,
        last_login: user.last_login,
        created_at: user.created_at
      },
      profile: {
        years_of_experience: user.years_of_experience,
        interests: user.interests || [],
        specialization_ar: user.specialization_ar,
        specialization_en: user.specialization_en,
        last_qualification_ar: user.last_qualification_ar,
        last_qualification_en: user.last_qualification_en,
        willing_to_change_career: user.willing_to_change_career,
        desired_domains: desiredDomainsDetails
      },
      cv_skills: {
        has_cv_import: lastCvImport !== null,
        last_import: lastCvImport ? {
          file_name: lastCvImport.file_name,
          skills_count: lastCvImport.imported_skills_count,
          imported_at: lastCvImport.created_at
        } : null,
        skills_by_domain: Object.values(cvSkillsByDomain),
        total_skills: cvSkillsResult.rows.length
      },
      competency_matrix: competencyMatrix,
      test_assignments: assignmentsWithGrades.map(row => ({
        assignment_id: row.assignment_id,
        status: row.status,
        assigned_at: row.assigned_at,
        completed_at: row.completed_at,
        due_date: row.due_date,
        needs_grading: row.needs_grading || false,
        ungraded_count: row.ungraded_count || 0,
        total_open_questions: row.total_open_questions || 0,
        test: {
          id: row.test_id,
          title_ar: row.test_title_ar,
          title_en: row.test_title_en,
          domain_name_ar: row.domain_name_ar,
          domain_name_en: row.domain_name_en,
          domain_color: row.domain_color
        },
        result: row.analysis_id ? {
          analysis_id: row.analysis_id,
          overall_score: row.calculated_grade !== undefined ? row.calculated_grade : row.overall_score,
          strengths: row.strengths || [],
          gaps: row.gaps || [],
          analyzed_at: row.analyzed_at
        } : null
      }))
    };
    
    res.json(response);
  } catch (error) {
    console.error('Get full profile error:', error);
    res.status(500).json({ error: 'Failed to get full profile' });
  }
});

// Get comprehensive report for all employees (CSV export)
router.get('/reports/comprehensive-csv', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { department_id } = req.query;
    
    // Build base query to get all employees (including last_login)
    let baseQuery = `
      SELECT u.id, u.email, u.name_ar, u.name_en, u.department_id,
             u.job_title_ar, u.job_title_en, u.employee_number, u.national_id,
             u.last_login, u.created_at, u.years_of_experience, u.interests,
             u.specialization_ar, u.specialization_en,
             u.last_qualification_ar, u.last_qualification_en,
             u.willing_to_change_career, u.desired_domains,
             d.name_ar as department_name_ar, d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'employee'
    `;
    const params = [];
    
    if (department_id) {
      params.push(department_id);
      baseQuery += ` AND u.department_id = $${params.length}`;
    }
    
    baseQuery += ' ORDER BY u.name_ar';
    
    const usersResult = await db.query(baseQuery, params);
    const users = usersResult.rows;
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'لا يوجد موظفين' });
    }
    
    // Get all domains for desired domains lookup
    const allDomainsResult = await db.query('SELECT id, name_ar FROM training_domains');
    const domainsMap = {};
    allDomainsResult.rows.forEach(d => { domainsMap[d.id] = d.name_ar; });
    
    // Get all courses for recommendations (with linked skills via course_skills junction)
    const allCoursesResult = await db.query(`
      SELECT c.id, c.name_ar, c.subject,
             ARRAY_AGG(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL) as skill_ids,
             ARRAY_AGG(DISTINCT s.name_ar) FILTER (WHERE s.name_ar IS NOT NULL) as skill_names,
             ARRAY_AGG(DISTINCT s.domain_id) FILTER (WHERE s.domain_id IS NOT NULL) as domain_ids
      FROM courses c
      LEFT JOIN course_skills cs ON cs.course_id = c.id
      LEFT JOIN skills s ON s.id = cs.skill_id
      GROUP BY c.id, c.name_ar, c.subject
    `);
    const allCourses = allCoursesResult.rows;
    
    // Get all skills for mapping
    const allSkillsResult = await db.query('SELECT id, name_ar, domain_id FROM skills');
    const skillsMap = {};
    allSkillsResult.rows.forEach(s => { skillsMap[s.id] = s; });
    
    // Build comprehensive data for each user
    const reportData = [];
    
    for (const user of users) {
      // Get desired domains names
      let desiredDomainsNames = [];
      if (user.desired_domains && Array.isArray(user.desired_domains)) {
        desiredDomainsNames = user.desired_domains.map(id => domainsMap[id] || '').filter(Boolean);
      }
      
      // Get domains and skills linked to user's department
      let domainsNames = [];
      let skillsNames = [];
      let assessedSkillNames = [];
      let overallReadiness = 0;
      let skillsAssessed = 0;
      let totalSkills = 0;
      let userDomainIds = [];
      let userSkillIds = [];
      
      if (user.department_id) {
        // Get domains and skills for user's department
        const skillsQuery = await db.query(`
          SELECT 
            td.id as domain_id,
            td.name_ar as domain_name_ar,
            s.id as skill_id,
            s.name_ar as skill_name_ar
          FROM training_domains td
          INNER JOIN domain_departments dd ON dd.domain_id = td.id
          LEFT JOIN skills s ON s.domain_id = td.id
          WHERE td.is_active = true AND dd.department_id = $1
          ORDER BY td.name_ar, s.name_ar
        `, [user.department_id]);
        
        const uniqueDomains = new Set();
        const uniqueSkills = new Set();
        const uniqueDomainIds = new Set();
        const uniqueSkillIds = new Set();
        
        skillsQuery.rows.forEach(row => {
          if (row.domain_name_ar) {
            uniqueDomains.add(row.domain_name_ar);
            uniqueDomainIds.add(row.domain_id);
          }
          if (row.skill_name_ar) {
            uniqueSkills.add(row.skill_name_ar);
            uniqueSkillIds.add(row.skill_id);
          }
        });
        
        domainsNames = Array.from(uniqueDomains);
        skillsNames = Array.from(uniqueSkills);
        userDomainIds = Array.from(uniqueDomainIds);
        userSkillIds = Array.from(uniqueSkillIds);
        totalSkills = skillsNames.length;
        
        // Get analysis results for readiness calculation
        const analysesResult = await db.query(`
          SELECT skill_scores
          FROM analysis_results
          WHERE user_id = $1
          ORDER BY analyzed_at DESC
        `, [user.id]);
        
        // Calculate average scores for each skill and track assessed skills
        const skillScoresMap = {};
        analysesResult.rows.forEach(analysis => {
          if (analysis.skill_scores) {
            const skillScoresObj = typeof analysis.skill_scores === 'string' 
              ? JSON.parse(analysis.skill_scores) 
              : analysis.skill_scores;
            
            Object.entries(skillScoresObj).forEach(([skillId, scoreData]) => {
              if (!skillScoresMap[skillId]) {
                skillScoresMap[skillId] = { totalScore: 0, count: 0 };
              }
              const score = typeof scoreData === 'object' ? (scoreData.score || 0) : 0;
              skillScoresMap[skillId].totalScore += score;
              skillScoresMap[skillId].count += 1;
            });
          }
        });
        
        // Calculate overall readiness and get assessed skill names
        const assessedSkillIds = Object.keys(skillScoresMap);
        skillsAssessed = assessedSkillIds.length;
        
        // Get names of assessed skills
        assessedSkillNames = assessedSkillIds
          .map(id => skillsMap[id]?.name_ar)
          .filter(Boolean);
        
        if (skillsAssessed > 0) {
          let totalScore = 0;
          assessedSkillIds.forEach(skillId => {
            const data = skillScoresMap[skillId];
            totalScore += data.totalScore / data.count;
          });
          overallReadiness = Math.round(totalScore / skillsAssessed);
        }
      }
      
      // Get test assignments and results
      const testsResult = await db.query(`
        SELECT 
          t.title_ar as test_title,
          ta.status,
          ar.overall_score
        FROM test_assignments ta
        JOIN tests t ON ta.test_id = t.id
        LEFT JOIN analysis_results ar ON ar.assignment_id = ta.id
        WHERE ta.user_id = $1
        ORDER BY ta.created_at DESC
      `, [user.id]);
      
      // Format tests and results
      const testsAndResults = testsResult.rows.map(t => {
        const status = t.status === 'completed' ? 'مكتمل' : 
                       t.status === 'in_progress' ? 'قيد التنفيذ' : 
                       t.status === 'pending' ? 'قيد الانتظار' : t.status;
        const score = t.overall_score !== null ? `${t.overall_score}%` : '-';
        return `${t.test_title} (${status}: ${score})`;
      }).join(' | ');
      
      // Parse interests
      let interestsText = '';
      let userInterests = [];
      if (user.interests && Array.isArray(user.interests)) {
        userInterests = user.interests.map(interest => {
          const parts = interest.split(':');
          return parts.length > 1 ? parts.slice(1).join(':') : interest;
        });
        interestsText = userInterests.join('، ');
      }
      
      // ========== RECOMMENDATIONS SECTIONS ==========
      
      // 1. Learning Map (خريطة التعلم) - Courses matching user's department domains/skills
      let learningMapCourses = [];
      if (userDomainIds.length > 0) {
        // Get courses that match user's department domains (via course_skills -> skills -> domain)
        learningMapCourses = allCourses
          .filter(course => {
            const courseDomainIds = course.domain_ids || [];
            return courseDomainIds.some(domainId => userDomainIds.includes(domainId));
          })
          .slice(0, 10)
          .map(c => c.name_ar);
      }
      
      // 2. Learning Favorites (مفضلات التعلم) - Courses matching user's interests
      let learningFavoritesCourses = [];
      if (userInterests.length > 0) {
        // Match courses by interest keywords in name or skills
        learningFavoritesCourses = allCourses
          .filter(course => {
            const courseNameLower = (course.name_ar || '').toLowerCase();
            const courseSubjectLower = (course.subject || '').toLowerCase();
            const courseSkillNames = Array.isArray(course.skill_names) 
              ? course.skill_names.join(' ').toLowerCase() 
              : '';
            return userInterests.some(interest => 
              courseNameLower.includes(interest.toLowerCase()) ||
              courseSubjectLower.includes(interest.toLowerCase()) ||
              courseSkillNames.includes(interest.toLowerCase())
            );
          })
          .slice(0, 10)
          .map(c => c.name_ar);
      }
      
      // 3. Future Path (مسار المستقبل) - Courses matching desired career domains
      let futurePathCourses = [];
      if (user.desired_domains && Array.isArray(user.desired_domains) && user.desired_domains.length > 0) {
        futurePathCourses = allCourses
          .filter(course => {
            const courseDomainIds = course.domain_ids || [];
            return courseDomainIds.some(domainId => user.desired_domains.includes(domainId));
          })
          .slice(0, 10)
          .map(c => c.name_ar);
      }
      
      // 4. Custom Recommendations (توصيات مخصصة) - Admin-added courses
      const adminCoursesResult = await db.query(`
        SELECT course_name_ar
        FROM admin_course_recommendations
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [user.id]);
      const customRecommendations = adminCoursesResult.rows.map(c => c.course_name_ar);
      
      // 5. FutureX Completed Courses (دورات FutureX المكتملة) - From NELC via Neo4j
      let futurexCompletedCourses = [];
      if (user.national_id) {
        try {
          const futurexCoursesResult = await neo4jApi.getNelcUserCourses(user.national_id);
          if (futurexCoursesResult && futurexCoursesResult.length > 0) {
            // Filter only completed courses and extract names
            futurexCompletedCourses = futurexCoursesResult
              .filter(course => course.status === 'Completed')
              .map(course => course.course_name)
              .filter(Boolean);
          }
        } catch (futurexError) {
          // Silently handle FutureX fetch errors - not critical for CSV export
          console.log(`FutureX fetch error for user ${user.id}:`, futurexError.message);
        }
      }
      
      // Build report row with all fields in the specified order
      reportData.push({
        'الاسم': user.name_ar || '',
        'البريد الإلكتروني': user.email || '',
        'الرقم الوظيفي': user.employee_number || '',
        'رقم الهوية الوطنية': user.national_id || '',
        'القسم': user.department_name_ar || '',
        'المسمى الوظيفي': user.job_title_ar || '',
        'آخر دخول': user.last_login ? new Date(user.last_login).toLocaleDateString('ar-SA') : 'لم يسجل الدخول بعد',
        'تاريخ الإنشاء': user.created_at ? new Date(user.created_at).toLocaleDateString('ar-SA') : '',
        'سنوات الخبرة': user.years_of_experience !== null ? user.years_of_experience : '',
        'التخصص': user.specialization_ar || '',
        'آخر مؤهل علمي': user.last_qualification_ar || '',
        'هل ينوي تغيير مساره الوظيفي؟': user.willing_to_change_career === true ? 'نعم' : 
                                         user.willing_to_change_career === false ? 'لا' : '',
        'المجالات الوظيفية المستقبلية': desiredDomainsNames.join('، '),
        'الاهتمامات': interestsText,
        'المجالات (العدد)': domainsNames.length,
        'المجالات (القائمة)': domainsNames.join('، '),
        'المهارات (العدد)': totalSkills,
        'المهارات (القائمة)': skillsNames.join('، '),
        'تم تقييمها (العدد)': skillsAssessed,
        'تم تقييمها (القائمة)': assessedSkillNames.join('، '),
        'نسبة الجاهزية (%)': overallReadiness,
        'الاختبارات والنتائج': testsAndResults,
        'خريطة التعلم': learningMapCourses.join('، '),
        'مفضلات التعلم': learningFavoritesCourses.join('، '),
        'مسار المستقبل': futurePathCourses.join('، '),
        'توصيات مخصصة': customRecommendations.join('، '),
        'دورات FutureX المكتملة': futurexCompletedCourses.join('، ')
      });
    }
    
    // Generate CSV content
    if (reportData.length === 0) {
      return res.status(404).json({ error: 'لا توجد بيانات للتصدير' });
    }
    
    const headers = Object.keys(reportData[0]);
    
    // Escape CSV values
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    // Build CSV
    let csvContent = '\uFEFF'; // BOM for UTF-8
    csvContent += headers.map(escapeCSV).join(',') + '\r\n';
    
    reportData.forEach(row => {
      const values = headers.map(header => escapeCSV(row[header]));
      csvContent += values.join(',') + '\r\n';
    });
    
    // Set headers for file download
    const filename = `comprehensive-report-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csvContent);
  } catch (error) {
    console.error('Get comprehensive report error:', error);
    res.status(500).json({ error: 'فشل في إنشاء التقرير' });
  }
});

module.exports = router;

