const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');
const neo4jApi = require('../services/neo4jApi');

const router = express.Router();

// ============================================
// CERTIFICATE UPLOAD CONFIGURATION
// ============================================

// Configure multer for certificate uploads
const certificateStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/certificates');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${req.user.id}_${Date.now()}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const certificateUpload = multer({
  storage: certificateStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع PDF أو صورة'), false);
    }
  }
});

const certificateUploadErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت' });
    }
    return res.status(400).json({ error: 'خطأ في رفع الملف', message: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

// ============================================
// EMPLOYEE ENDPOINTS
// ============================================

/**
 * GET /training-plans/my-requirements
 * Get all domains and skills required for the current employee's department
 * This includes skills from domains linked to employee's department and parent departments
 */
router.get('/my-requirements', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's department and hierarchy
    const userResult = await db.query(`
      SELECT u.department_id, d.name_ar as department_name_ar, d.name_en as department_name_en,
             d.parent_id, d.type as department_type
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    if (!user.department_id) {
      return res.json({
        message: 'لم يتم تحديد القسم للموظف',
        department: null,
        domains: [],
        total_skills: 0,
        hierarchy: []
      });
    }
    
    // Get all department IDs in the hierarchy (current, parent, grandparent)
    // This ensures domains linked to ANY level apply to this employee
    const departmentIds = [user.department_id];
    const hierarchyNames = [user.department_name_ar];
    let currentDeptId = user.department_id;
    
    // Traverse up the hierarchy to include parent departments
    while (currentDeptId) {
      const parentResult = await db.query(
        'SELECT id, parent_id, name_ar FROM departments WHERE id = (SELECT parent_id FROM departments WHERE id = $1)',
        [currentDeptId]
      );
      if (parentResult.rows.length > 0 && parentResult.rows[0].id) {
        departmentIds.push(parentResult.rows[0].id);
        hierarchyNames.push(parentResult.rows[0].name_ar);
        currentDeptId = parentResult.rows[0].id;
      } else {
        break;
      }
    }
    
    console.log(`[TrainingPlan] User ${userId} - Department IDs in hierarchy:`, departmentIds);
    
    // Get domains linked to these departments with their skills
    // Uses DISTINCT to avoid duplicate domains if linked to multiple levels
    const domainsResult = await db.query(`
      SELECT DISTINCT ON (td.id) 
             td.id as domain_id, 
             td.name_ar as domain_name_ar, 
             td.name_en as domain_name_en,
             td.description_ar as domain_description_ar, 
             td.description_en as domain_description_en,
             td.color as domain_color,
             (
               SELECT COALESCE(
                 json_agg(
                   json_build_object(
                     'id', s.id,
                     'name_ar', s.name_ar,
                     'name_en', s.name_en,
                     'description_ar', s.description_ar,
                     'description_en', s.description_en,
                     'weight', s.weight
                   )
                   ORDER BY s.name_ar
                 ),
                 '[]'::json
               )
               FROM skills s
               WHERE s.domain_id = td.id
             ) as skills,
             (
               SELECT COUNT(*) FROM skills s WHERE s.domain_id = td.id
             ) as skills_count,
             (
               SELECT string_agg(dep.name_ar, ', ')
               FROM domain_departments dd2
               JOIN departments dep ON dd2.department_id = dep.id
               WHERE dd2.domain_id = td.id AND dd2.department_id = ANY($1)
             ) as linked_departments
      FROM training_domains td
      INNER JOIN domain_departments dd ON td.id = dd.domain_id
      WHERE dd.department_id = ANY($1)
        AND td.is_active = true
      ORDER BY td.id, td.name_ar
    `, [departmentIds]);
    
    // Sort by Arabic name after distinct
    const sortedDomains = domainsResult.rows.sort((a, b) => 
      (a.domain_name_ar || '').localeCompare(b.domain_name_ar || '', 'ar')
    );
    
    // Calculate total skills count
    let totalSkills = 0;
    sortedDomains.forEach(domain => {
      const skills = domain.skills || [];
      totalSkills += skills.length;
    });
    
    console.log(`[TrainingPlan] Found ${sortedDomains.length} domains with ${totalSkills} total skills for user ${userId}`);
    
    res.json({
      department: {
        id: user.department_id,
        name_ar: user.department_name_ar,
        name_en: user.department_name_en,
        type: user.department_type
      },
      hierarchy: hierarchyNames.reverse(), // From top to bottom
      domains: sortedDomains,
      total_skills: totalSkills,
      total_domains: sortedDomains.length
    });
  } catch (error) {
    console.error('Get my requirements error:', error);
    res.status(500).json({ error: 'Failed to get training requirements' });
  }
});

/**
 * GET /training-plans/my-plan
 * Get the current employee's training plan with all selected courses
 */
router.get('/my-plan', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all plan items for this user with skill, course, and certificate details
    const planResult = await db.query(`
      SELECT etpi.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             s.domain_id,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color,
             c.name_ar as course_name_ar,
             c.name_en as course_name_en,
             c.url as course_url,
             c.provider as course_provider,
             c.duration_hours as course_duration,
             c.difficulty_level as course_difficulty,
             ccc.id as certificate_id,
             ccc.certificate_path as certificate_path,
             ccc.original_filename as certificate_original_filename
      FROM employee_training_plan_items etpi
      JOIN skills s ON etpi.skill_id = s.id
      JOIN training_domains td ON s.domain_id = td.id
      LEFT JOIN courses c ON etpi.course_id = c.id
      LEFT JOIN course_completion_certificates ccc ON etpi.certificate_id = ccc.id
      WHERE etpi.user_id = $1
      ORDER BY td.name_ar, s.name_ar, etpi.created_at
    `, [userId]);
    
    // Group by domain and skill
    const groupedPlan = {};
    planResult.rows.forEach(item => {
      if (!groupedPlan[item.domain_id]) {
        groupedPlan[item.domain_id] = {
          domain_id: item.domain_id,
          domain_name_ar: item.domain_name_ar,
          domain_name_en: item.domain_name_en,
          domain_color: item.domain_color,
          skills: {}
        };
      }
      
      if (!groupedPlan[item.domain_id].skills[item.skill_id]) {
        groupedPlan[item.domain_id].skills[item.skill_id] = {
          skill_id: item.skill_id,
          skill_name_ar: item.skill_name_ar,
          skill_name_en: item.skill_name_en,
          courses: []
        };
      }
      
      groupedPlan[item.domain_id].skills[item.skill_id].courses.push({
        id: item.id,
        plan_type: item.plan_type,
        status: item.status,
        completed_at: item.completed_at,
        notes: item.notes,
        created_at: item.created_at,
        // For recommended courses
        course_id: item.course_id,
        course_name_ar: item.course_name_ar,
        course_name_en: item.course_name_en,
        course_url: item.course_url,
        course_provider: item.course_provider,
        course_duration: item.course_duration,
        course_difficulty: item.course_difficulty,
        // For external courses
        external_course_title: item.external_course_title,
        external_course_url: item.external_course_url,
        external_course_description: item.external_course_description,
        // Certificate info for completed courses
        certificate_id: item.certificate_id,
        certificate_path: item.certificate_path,
        certificate_original_filename: item.certificate_original_filename
      });
    });
    
    // Convert to array format
    const domainsWithPlans = Object.values(groupedPlan).map(domain => ({
      ...domain,
      skills: Object.values(domain.skills)
    }));
    
    // Calculate statistics
    const stats = {
      total_courses: planResult.rows.length,
      pending: planResult.rows.filter(r => r.status === 'pending').length,
      in_progress: planResult.rows.filter(r => r.status === 'in_progress').length,
      completed: planResult.rows.filter(r => r.status === 'completed').length
    };
    
    res.json({
      plan: domainsWithPlans,
      stats,
      raw_items: planResult.rows
    });
  } catch (error) {
    console.error('Get my plan error:', error);
    res.status(500).json({ error: 'Failed to get training plan' });
  }
});

/**
 * POST /training-plans
 * Add a course to the training plan (recommended or external)
 */
router.post('/', authenticate, [
  body('skill_id').notEmpty().withMessage('Skill ID is required'),
  body('plan_type').isIn(['recommended', 'external']).withMessage('Invalid plan type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const userId = req.user.id;
    const {
      skill_id,
      plan_type,
      course_id,
      external_course_title,
      external_course_url,
      external_course_description,
      notes
    } = req.body;
    
    // Validate based on plan type
    if (plan_type === 'recommended' && !course_id) {
      return res.status(400).json({ error: 'Course ID is required for recommended courses' });
    }
    
    if (plan_type === 'external' && !external_course_title) {
      return res.status(400).json({ error: 'Course title is required for external courses' });
    }
    
    // Verify skill exists
    const skillCheck = await db.query('SELECT id FROM skills WHERE id = $1', [skill_id]);
    if (skillCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    // If recommended, verify course exists
    if (plan_type === 'recommended' && course_id) {
      const courseCheck = await db.query('SELECT id FROM courses WHERE id = $1', [course_id]);
      if (courseCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }
      
      // Check if this exact course is already in the plan for this skill
      const duplicateCheck = await db.query(`
        SELECT id FROM employee_training_plan_items 
        WHERE user_id = $1 AND skill_id = $2 AND course_id = $3
      `, [userId, skill_id, course_id]);
      
      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({ error: 'هذه الدورة موجودة بالفعل في خطتك لهذه المهارة' });
      }
    }
    
    // Insert the plan item
    const result = await db.query(`
      INSERT INTO employee_training_plan_items (
        user_id, skill_id, course_id, 
        external_course_title, external_course_url, external_course_description,
        plan_type, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      userId,
      skill_id,
      plan_type === 'recommended' ? course_id : null,
      plan_type === 'external' ? external_course_title : null,
      plan_type === 'external' ? external_course_url : null,
      plan_type === 'external' ? external_course_description : null,
      plan_type,
      notes || null
    ]);
    
    // Fetch full details
    const fullResult = await db.query(`
      SELECT etpi.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             c.name_ar as course_name_ar,
             c.name_en as course_name_en,
             c.url as course_url
      FROM employee_training_plan_items etpi
      JOIN skills s ON etpi.skill_id = s.id
      LEFT JOIN courses c ON etpi.course_id = c.id
      WHERE etpi.id = $1
    `, [result.rows[0].id]);
    
    res.status(201).json({
      message: 'تمت إضافة الدورة إلى خطتك التدريبية',
      item: fullResult.rows[0]
    });
  } catch (error) {
    console.error('Add to plan error:', error);
    res.status(500).json({ error: 'Failed to add to training plan' });
  }
});

/**
 * PUT /training-plans/:id
 * Update a plan item (status, notes)
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.id;
    
    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id FROM employee_training_plan_items WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Plan item not found or access denied' });
    }
    
    // Validate status if provided
    if (status && !['pending', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    
    // Update the item
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;
    
    if (status !== undefined) {
      paramCount++;
      updateFields.push(`status = $${paramCount}`);
      updateValues.push(status);
      
      // Set completed_at if status is completed
      if (status === 'completed') {
        paramCount++;
        updateFields.push(`completed_at = $${paramCount}`);
        updateValues.push(new Date());
      } else if (status !== 'completed') {
        paramCount++;
        updateFields.push(`completed_at = $${paramCount}`);
        updateValues.push(null);
      }
    }
    
    if (notes !== undefined) {
      paramCount++;
      updateFields.push(`notes = $${paramCount}`);
      updateValues.push(notes);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    paramCount++;
    updateValues.push(id);
    
    const result = await db.query(`
      UPDATE employee_training_plan_items
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, updateValues);
    
    res.json({
      message: 'تم تحديث حالة الدورة',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Update plan item error:', error);
    res.status(500).json({ error: 'Failed to update plan item' });
  }
});

/**
 * DELETE /training-plans/:id
 * Remove a course from the training plan
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const result = await db.query(
      'DELETE FROM employee_training_plan_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plan item not found or access denied' });
    }
    
    res.json({ message: 'تم حذف الدورة من خطتك التدريبية' });
  } catch (error) {
    console.error('Delete plan item error:', error);
    res.status(500).json({ error: 'Failed to delete plan item' });
  }
});

// ============================================
// HR/ADMIN ENDPOINTS
// ============================================

/**
 * GET /training-plans/user/:userId
 * Get a specific employee's training plan (HR only)
 * Shows ALL domains and skills assigned to the employee (based on department), not just ones with courses
 */
router.get('/user/:userId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user info including department
    const userResult = await db.query(`
      SELECT u.id, u.name_ar, u.name_en, u.email, u.employee_number, u.department_id,
             d.name_ar as department_name_ar, d.name_en as department_name_en,
             d.parent_id
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Get all department IDs in the hierarchy (current, parent, grandparent)
    const departmentIds = [];
    if (user.department_id) {
      departmentIds.push(user.department_id);
      let currentDeptId = user.department_id;
      
      // Traverse up the hierarchy to include parent departments
      while (currentDeptId) {
        const parentResult = await db.query(
          'SELECT id, parent_id FROM departments WHERE id = (SELECT parent_id FROM departments WHERE id = $1)',
          [currentDeptId]
        );
        if (parentResult.rows.length > 0 && parentResult.rows[0].id) {
          departmentIds.push(parentResult.rows[0].id);
          currentDeptId = parentResult.rows[0].id;
        } else {
          break;
        }
      }
    }
    
    // Get ALL domains and skills required for this employee's department hierarchy
    let allDomainsWithSkills = [];
    if (departmentIds.length > 0) {
      const domainsResult = await db.query(`
        SELECT DISTINCT ON (td.id) 
               td.id as domain_id, 
               td.name_ar as domain_name_ar, 
               td.name_en as domain_name_en,
               td.color as domain_color,
               (
                 SELECT COALESCE(
                   json_agg(
                     json_build_object(
                       'skill_id', s.id,
                       'skill_name_ar', s.name_ar,
                       'skill_name_en', s.name_en
                     )
                     ORDER BY s.name_ar
                   ),
                   '[]'::json
                 )
                 FROM skills s
                 WHERE s.domain_id = td.id
               ) as skills
        FROM training_domains td
        INNER JOIN domain_departments dd ON td.id = dd.domain_id
        WHERE dd.department_id = ANY($1)
          AND td.is_active = true
        ORDER BY td.id, td.name_ar
      `, [departmentIds]);
      
      allDomainsWithSkills = domainsResult.rows.sort((a, b) => 
        (a.domain_name_ar || '').localeCompare(b.domain_name_ar || '', 'ar')
      );
    }
    
    // Get plan items (courses added by employee) with certificate info
    const planResult = await db.query(`
      SELECT etpi.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             s.domain_id,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color,
             c.name_ar as course_name_ar,
             c.name_en as course_name_en,
             c.url as course_url,
             c.provider as course_provider,
             c.duration_hours as course_duration,
             ccc.id as certificate_id,
             ccc.certificate_path as certificate_path,
             ccc.original_filename as certificate_original_filename
      FROM employee_training_plan_items etpi
      JOIN skills s ON etpi.skill_id = s.id
      JOIN training_domains td ON s.domain_id = td.id
      LEFT JOIN courses c ON etpi.course_id = c.id
      LEFT JOIN course_completion_certificates ccc ON etpi.certificate_id = ccc.id
      WHERE etpi.user_id = $1
      ORDER BY td.name_ar, s.name_ar, etpi.created_at
    `, [userId]);
    
    // Create a map of courses by skill_id for quick lookup
    const coursesBySkill = {};
    planResult.rows.forEach(item => {
      if (!coursesBySkill[item.skill_id]) {
        coursesBySkill[item.skill_id] = [];
      }
      coursesBySkill[item.skill_id].push({
        id: item.id,
        plan_type: item.plan_type,
        status: item.status,
        completed_at: item.completed_at,
        notes: item.notes,
        created_at: item.created_at,
        course_id: item.course_id,
        course_name_ar: item.course_name_ar,
        course_name_en: item.course_name_en,
        course_url: item.course_url,
        course_provider: item.course_provider,
        course_duration: item.course_duration,
        external_course_title: item.external_course_title,
        external_course_url: item.external_course_url,
        external_course_description: item.external_course_description,
        // Certificate info for completed courses
        certificate_id: item.certificate_id,
        certificate_path: item.certificate_path,
        certificate_original_filename: item.certificate_original_filename
      });
    });
    
    // Build the complete plan with ALL domains and skills
    const domainsWithPlans = allDomainsWithSkills.map(domain => {
      const skills = (domain.skills || []).map(skill => ({
        skill_id: skill.skill_id,
        skill_name_ar: skill.skill_name_ar,
        skill_name_en: skill.skill_name_en,
        courses: coursesBySkill[skill.skill_id] || []
      }));
      
      return {
        domain_id: domain.domain_id,
        domain_name_ar: domain.domain_name_ar,
        domain_name_en: domain.domain_name_en,
        domain_color: domain.domain_color,
        skills
      };
    });
    
    // Calculate total required skills
    let totalRequiredSkills = 0;
    allDomainsWithSkills.forEach(domain => {
      totalRequiredSkills += (domain.skills || []).length;
    });
    
    // Calculate statistics
    const stats = {
      total_courses: planResult.rows.length,
      pending: planResult.rows.filter(r => r.status === 'pending').length,
      in_progress: planResult.rows.filter(r => r.status === 'in_progress').length,
      completed: planResult.rows.filter(r => r.status === 'completed').length,
      total_required_skills: totalRequiredSkills,
      skills_with_plans: new Set(planResult.rows.map(r => r.skill_id)).size
    };
    
    // Calculate completion percentage (skills covered / total required skills)
    stats.completion_percentage = totalRequiredSkills > 0 
      ? Math.round((stats.skills_with_plans / totalRequiredSkills) * 100)
      : 0;
    
    res.json({
      user: {
        id: user.id,
        name_ar: user.name_ar,
        name_en: user.name_en,
        email: user.email,
        employee_number: user.employee_number,
        department_name_ar: user.department_name_ar,
        department_name_en: user.department_name_en
      },
      plan: domainsWithPlans,
      stats
    });
  } catch (error) {
    console.error('Get user plan error:', error);
    res.status(500).json({ error: 'Failed to get user training plan' });
  }
});

/**
 * GET /training-plans/summary
 * Get summary statistics for all employees (HR only)
 */
router.get('/summary', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { department_id } = req.query;
    
    let whereClause = "WHERE u.role = 'employee'";
    const params = [];
    
    if (department_id) {
      params.push(department_id);
      whereClause += ` AND u.department_id = $${params.length}`;
    }
    
    // Get employees with their plan stats
    const result = await db.query(`
      SELECT 
        u.id,
        u.name_ar,
        u.name_en,
        u.email,
        u.employee_number,
        d.name_ar as department_name_ar,
        d.name_en as department_name_en,
        COALESCE(plan_stats.total_courses, 0) as total_courses,
        COALESCE(plan_stats.pending_count, 0) as pending_count,
        COALESCE(plan_stats.in_progress_count, 0) as in_progress_count,
        COALESCE(plan_stats.completed_count, 0) as completed_count,
        COALESCE(plan_stats.skills_covered, 0) as skills_covered
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN (
        SELECT 
          user_id,
          COUNT(*) as total_courses,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
          COUNT(DISTINCT skill_id) as skills_covered
        FROM employee_training_plan_items
        GROUP BY user_id
      ) plan_stats ON u.id = plan_stats.user_id
      ${whereClause}
      ORDER BY u.name_ar
    `, params);
    
    // Calculate overall stats
    const overallStats = {
      total_employees: result.rows.length,
      employees_with_plans: result.rows.filter(r => r.total_courses > 0).length,
      total_courses_in_plans: result.rows.reduce((sum, r) => sum + parseInt(r.total_courses), 0),
      total_completed: result.rows.reduce((sum, r) => sum + parseInt(r.completed_count), 0)
    };
    
    res.json({
      employees: result.rows,
      overall_stats: overallStats
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to get training plans summary' });
  }
});

/**
 * GET /training-plans/skill/:skillId/recommended-courses
 * Get recommended courses for a specific skill
 */
router.get('/skill/:skillId/recommended-courses', authenticate, async (req, res) => {
  try {
    const { skillId } = req.params;
    const { limit = 20 } = req.query;
    
    // Get skill info
    const skillResult = await db.query(`
      SELECT s.*, td.name_ar as domain_name_ar, td.name_en as domain_name_en
      FROM skills s
      JOIN training_domains td ON s.domain_id = td.id
      WHERE s.id = $1
    `, [skillId]);
    
    if (skillResult.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    const skill = skillResult.rows[0];
    
    // Get courses linked to this skill via course_skills
    const coursesResult = await db.query(`
      SELECT c.*, cs.relevance_score,
             ce.extracted_skills, ce.summary_ar, ce.summary_en
      FROM courses c
      JOIN course_skills cs ON c.id = cs.course_id
      LEFT JOIN course_enrichments ce ON c.id::text = ce.course_id
      WHERE cs.skill_id = $1
      ORDER BY cs.relevance_score DESC, c.rating DESC NULLS LAST
      LIMIT $2
    `, [skillId, parseInt(limit)]);
    
    // If no direct links, try to find courses by skill name matching in enrichments
    if (coursesResult.rows.length === 0) {
      const enrichedCoursesResult = await db.query(`
        SELECT c.*, ce.extracted_skills, ce.summary_ar, ce.summary_en
        FROM courses c
        LEFT JOIN course_enrichments ce ON c.id::text = ce.course_id
        WHERE 
          c.name_ar ILIKE $1 OR c.name_en ILIKE $1 OR
          c.description_ar ILIKE $1 OR c.description_en ILIKE $1 OR
          ce.extracted_skills::text ILIKE $1
        ORDER BY c.rating DESC NULLS LAST
        LIMIT $2
      `, [`%${skill.name_ar}%`, parseInt(limit)]);
      
      return res.json({
        skill,
        courses: enrichedCoursesResult.rows,
        source: 'name_matching'
      });
    }
    
    res.json({
      skill,
      courses: coursesResult.rows,
      source: 'skill_link'
    });
  } catch (error) {
    console.error('Get recommended courses error:', error);
    res.status(500).json({ error: 'Failed to get recommended courses' });
  }
});

// ============================================
// CERTIFICATE UPLOAD & COMPLETION ENDPOINTS
// ============================================

/**
 * POST /training-plans/:id/complete-with-certificate
 * Complete a training plan item with certificate upload
 */
router.post('/:id/complete-with-certificate', authenticate, certificateUpload.single('certificate'), certificateUploadErrorHandler, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user.id;
    
    // Verify ownership and get plan item details
    const planItemResult = await db.query(`
      SELECT etpi.*, c.name_ar as course_name_ar, c.name_en as course_name_en
      FROM employee_training_plan_items etpi
      LEFT JOIN courses c ON etpi.course_id = c.id
      WHERE etpi.id = $1 AND etpi.user_id = $2
    `, [id, userId]);
    
    if (planItemResult.rows.length === 0) {
      // Clean up uploaded file if exists
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Plan item not found or access denied' });
    }
    
    const planItem = planItemResult.rows[0];
    
    // Check if already completed
    if (planItem.status === 'completed') {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'هذه الدورة مكتملة بالفعل' });
    }
    
    // Certificate file is required
    if (!req.file) {
      return res.status(400).json({ error: 'يرجى رفع شهادة أو إثبات إكمال الدورة' });
    }
    
    const relativePath = `certificates/${path.basename(req.file.path)}`;
    
    // Insert certificate record
    const certResult = await db.query(`
      INSERT INTO course_completion_certificates 
        (user_id, course_id, certificate_path, original_filename, file_size, mime_type, completion_source)
      VALUES ($1, $2, $3, $4, $5, $6, 'certificate')
      RETURNING *
    `, [
      userId,
      planItem.course_id, // Can be null for external courses
      relativePath,
      req.file.originalname,
      req.file.size,
      req.file.mimetype
    ]);
    
    const certificate = certResult.rows[0];
    
    // Update the training plan item
    const updateResult = await db.query(`
      UPDATE employee_training_plan_items
      SET status = 'completed',
          completed_at = NOW(),
          certificate_id = $1,
          notes = COALESCE($2, notes)
      WHERE id = $3
      RETURNING *
    `, [certificate.id, notes || null, id]);
    
    res.json({
      message: 'تم إكمال الدورة بنجاح',
      item: updateResult.rows[0],
      certificate: {
        id: certificate.id,
        original_filename: certificate.original_filename,
        completed_at: certificate.completed_at
      }
    });
  } catch (error) {
    console.error('Complete with certificate error:', error);
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to complete course with certificate' });
  }
});

/**
 * GET /training-plans/neo4j-progress
 * Get Neo4j course progress for the current employee
 * Returns progress for all recommended courses in the employee's training plan
 */
router.get('/neo4j-progress', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's national ID
    const userResult = await db.query(
      'SELECT national_id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const nationalId = userResult.rows[0].national_id;
    
    if (!nationalId) {
      return res.json({
        message: 'لم يتم تسجيل رقم الهوية الوطنية',
        has_national_id: false,
        progress: []
      });
    }
    
    // Get all recommended courses from the user's training plan
    const planCoursesResult = await db.query(`
      SELECT etpi.id as plan_item_id, etpi.course_id, etpi.status,
             c.name_ar as course_name_ar, c.name_en as course_name_en,
             c.nelc_course_id
      FROM employee_training_plan_items etpi
      JOIN courses c ON etpi.course_id = c.id
      WHERE etpi.user_id = $1 AND etpi.plan_type = 'recommended'
    `, [userId]);
    
    if (planCoursesResult.rows.length === 0) {
      return res.json({
        has_national_id: true,
        message: 'لا توجد دورات مقترحة في الخطة',
        progress: []
      });
    }
    
    // Fetch progress from Neo4j
    let neo4jCourses = [];
    try {
      neo4jCourses = await neo4jApi.getNelcUserCourses(nationalId);
      console.log(`[TrainingPlan] Neo4j returned ${neo4jCourses.length} courses for national ID ${nationalId}`);
    } catch (neo4jError) {
      console.error('Neo4j fetch error:', neo4jError);
      // Continue without Neo4j data
    }
    
    // Create a map of Neo4j courses by course_id for quick lookup
    const neo4jMap = new Map();
    neo4jCourses.forEach(course => {
      if (course.course_id) {
        neo4jMap.set(course.course_id.toString(), course);
      }
    });
    
    // Match plan courses with Neo4j progress
    const progressResults = planCoursesResult.rows.map(planCourse => {
      const neo4jMatch = planCourse.nelc_course_id 
        ? neo4jMap.get(planCourse.nelc_course_id.toString())
        : null;
      
      return {
        plan_item_id: planCourse.plan_item_id,
        course_id: planCourse.course_id,
        course_name_ar: planCourse.course_name_ar,
        course_name_en: planCourse.course_name_en,
        current_status: planCourse.status,
        nelc_course_id: planCourse.nelc_course_id,
        neo4j_status: neo4jMatch?.status || null,
        neo4j_actions: neo4jMatch?.actions || [],
        neo4j_last_action_date: neo4jMatch?.last_action_date || null,
        neo4j_score: neo4jMatch?.max_score || null,
        is_completed_in_neo4j: neo4jMatch?.status === 'Completed',
        can_auto_complete: neo4jMatch?.status === 'Completed' && planCourse.status !== 'completed'
      };
    });
    
    res.json({
      has_national_id: true,
      national_id: nationalId,
      total_plan_courses: planCoursesResult.rows.length,
      neo4j_courses_found: neo4jCourses.length,
      progress: progressResults
    });
  } catch (error) {
    console.error('Get Neo4j progress error:', error);
    res.status(500).json({ error: 'Failed to get Neo4j progress' });
  }
});

/**
 * POST /training-plans/:id/auto-complete-from-neo4j
 * Auto-complete a course based on Neo4j completion data
 */
router.post('/:id/auto-complete-from-neo4j', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Verify ownership and get details
    const planItemResult = await db.query(`
      SELECT etpi.*, c.nelc_course_id, c.name_ar as course_name_ar
      FROM employee_training_plan_items etpi
      LEFT JOIN courses c ON etpi.course_id = c.id
      WHERE etpi.id = $1 AND etpi.user_id = $2
    `, [id, userId]);
    
    if (planItemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Plan item not found' });
    }
    
    const planItem = planItemResult.rows[0];
    
    if (planItem.status === 'completed') {
      return res.status(400).json({ error: 'هذه الدورة مكتملة بالفعل' });
    }
    
    if (planItem.plan_type !== 'recommended') {
      return res.status(400).json({ error: 'الإكمال التلقائي متاح فقط للدورات المقترحة' });
    }
    
    // Get user's national ID
    const userResult = await db.query(
      'SELECT national_id FROM users WHERE id = $1',
      [userId]
    );
    
    const nationalId = userResult.rows[0]?.national_id;
    if (!nationalId) {
      return res.status(400).json({ error: 'لم يتم تسجيل رقم الهوية الوطنية' });
    }
    
    // Verify completion in Neo4j
    let neo4jCourses = [];
    try {
      neo4jCourses = await neo4jApi.getNelcUserCourses(nationalId);
    } catch (neo4jError) {
      console.error('Neo4j fetch error:', neo4jError);
      return res.status(500).json({ error: 'فشل في الاتصال بنظام NELC' });
    }
    
    // Find matching course
    const neo4jMatch = neo4jCourses.find(c => 
      c.course_id && planItem.nelc_course_id && 
      c.course_id.toString() === planItem.nelc_course_id.toString()
    );
    
    if (!neo4jMatch || neo4jMatch.status !== 'Completed') {
      return res.status(400).json({ 
        error: 'لم يتم العثور على إكمال لهذه الدورة في سجلات NELC',
        neo4j_status: neo4jMatch?.status || 'not_found'
      });
    }
    
    // Create a certificate record for Neo4j completion
    const certResult = await db.query(`
      INSERT INTO course_completion_certificates 
        (user_id, course_id, completion_source, nelc_completion_date, nelc_progress_percentage)
      VALUES ($1, $2, 'nelc', $3, 100)
      RETURNING *
    `, [
      userId,
      planItem.course_id,
      neo4jMatch.last_action_date || new Date()
    ]);
    
    const certificate = certResult.rows[0];
    
    // Update the training plan item
    const updateResult = await db.query(`
      UPDATE employee_training_plan_items
      SET status = 'completed',
          completed_at = NOW(),
          certificate_id = $1,
          notes = 'تم الإكمال تلقائياً من سجلات NELC'
      WHERE id = $2
      RETURNING *
    `, [certificate.id, id]);
    
    res.json({
      message: 'تم إكمال الدورة تلقائياً بناءً على سجلات NELC',
      item: updateResult.rows[0],
      neo4j_data: {
        status: neo4jMatch.status,
        completion_date: neo4jMatch.last_action_date,
        score: neo4jMatch.max_score
      }
    });
  } catch (error) {
    console.error('Auto-complete from Neo4j error:', error);
    res.status(500).json({ error: 'Failed to auto-complete from Neo4j' });
  }
});

module.exports = router;

