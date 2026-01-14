const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');
const domainGenerator = require('../services/domainGenerator');

const router = express.Router();

// Helper function to ensure type column exists
async function ensureTypeColumn() {
  try {
    const columnCheck = await db.query(`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'departments' AND column_name = 'type'
    `);
    
    if (columnCheck.rows.length === 0) {
      // Column doesn't exist, add it
      await db.query(`
        ALTER TABLE departments
        ADD COLUMN type VARCHAR(20) DEFAULT 'department'
      `);
      // Add check constraint separately
      try {
        await db.query(`
          ALTER TABLE departments
          ADD CONSTRAINT departments_type_check 
          CHECK (type IN ('sector', 'department', 'section'))
        `);
      } catch (constraintError) {
        // Constraint might already exist or fail, that's okay
        console.warn('Could not add type constraint:', constraintError.message);
      }
      // Update existing records
      await db.query(`UPDATE departments SET type = 'department' WHERE type IS NULL`);
      console.log('✓ Added type column to departments table');
      return true;
    } else {
      // Column exists, ensure existing records have a type
      await db.query(`UPDATE departments SET type = 'department' WHERE type IS NULL`);
      return false;
    }
  } catch (error) {
    console.error('Migration check error:', error.message);
    console.error('Stack:', error.stack);
    // Don't fail the request if migration check fails
    return false;
  }
}

// Get all departments with hierarchy
router.get('/', authenticate, async (req, res) => {
  try {
    await ensureTypeColumn();

    const result = await db.query(`
      SELECT d.*, 
             p.name_ar as parent_name_ar,
             p.type as parent_type,
             (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
      FROM departments d
      LEFT JOIN departments p ON d.parent_id = p.id
      ORDER BY COALESCE(d.type, 'department'), d.name_ar
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get departments error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to get departments',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get department info for employees (their own department)
// NOTE: This route MUST be before /:id to avoid "my-department" being treated as an ID
router.get('/my-department/info', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's department_id
    const userResult = await db.query('SELECT department_id FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const departmentId = userResult.rows[0].department_id;
    
    if (!departmentId) {
      return res.status(404).json({ error: 'User is not assigned to any department' });
    }
    
    // Get department with full hierarchy info
    const result = await db.query(`
      SELECT d.id, d.name_ar, d.name_en, d.type, d.objective_ar, d.objective_en, d.responsibilities,
             p.name_ar as parent_name_ar, p.name_en as parent_name_en, p.type as parent_type,
             gp.name_ar as grandparent_name_ar, gp.name_en as grandparent_name_en,
             (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
      FROM departments d
      LEFT JOIN departments p ON d.parent_id = p.id
      LEFT JOIN departments gp ON p.parent_id = gp.id
      WHERE d.id = $1
    `, [departmentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    // Also get related domains for this department
    const domainsResult = await db.query(`
      SELECT td.id, td.name_ar, td.name_en, td.description_ar, td.description_en, td.color,
             (
               SELECT COALESCE(
                 json_agg(
                   json_build_object(
                     'id', s.id,
                     'name_ar', s.name_ar,
                     'name_en', s.name_en
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
      WHERE dd.department_id = $1 AND td.is_active = true
      ORDER BY td.name_ar
    `, [departmentId]);
    
    res.json({
      ...result.rows[0],
      domains: domainsResult.rows
    });
  } catch (error) {
    console.error('Get my department info error:', error);
    res.status(500).json({ 
      error: 'Failed to get department info',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get single department
router.get('/:id', authenticate, async (req, res) => {
  try {
    await ensureTypeColumn();

    const result = await db.query(`
      SELECT d.*, 
             p.name_ar as parent_name_ar,
             p.type as parent_type,
             (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
      FROM departments d
      LEFT JOIN departments p ON d.parent_id = p.id
      WHERE d.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get department error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to get department',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create department
router.post('/', authenticate, isTrainingOfficer, [
  body('name_ar').notEmpty().withMessage('Arabic name is required').trim(),
  body('type').isIn(['sector', 'department', 'section']).withMessage('Invalid type')
], async (req, res) => {
  try {
    console.log('Create department request received:', {
      name_ar: req.body.name_ar,
      type: req.body.type,
      parent_id: req.body.parent_id,
      user: req.user?.email
    });

    // Ensure type column exists
    try {
      const typeColumnAdded = await ensureTypeColumn();
      if (typeColumnAdded) {
        console.log('Type column was added to departments table');
      }
    } catch (migrationError) {
      console.error('Warning: Type column migration failed:', migrationError.message);
      // Continue anyway - column might already exist
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ 
        error: errors.array()[0].msg || 'Validation failed',
        errors: errors.array()
      });
    }
    
    let { name_ar, type, parent_id } = req.body;
    
    // Validate type
    if (!type || !['sector', 'department', 'section'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be sector, department, or section' });
    }
    
    // Normalize parent_id: convert empty string to null
    if (parent_id === '' || parent_id === undefined || parent_id === null) {
      parent_id = null;
    } else if (typeof parent_id === 'string' && parent_id.trim() === '') {
      parent_id = null;
    }
    
    // Validate parent_id format if provided (should be UUID)
    if (parent_id !== null) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(parent_id)) {
        return res.status(400).json({ error: 'Invalid parent ID format' });
      }
    }
    
    // Trim name_ar
    if (!name_ar || typeof name_ar !== 'string') {
      return res.status(400).json({ error: 'Arabic name is required and must be a string' });
    }
    name_ar = name_ar.trim();
    if (!name_ar) {
      return res.status(400).json({ error: 'Arabic name cannot be empty' });
    }
    
    // Validate hierarchy rules
    if (type === 'sector') {
      if (parent_id) {
        return res.status(400).json({ error: 'Sector cannot have a parent' });
      }
    } else if (type === 'department') {
      if (!parent_id) {
        return res.status(400).json({ error: 'Department must be assigned to a sector' });
      }
      // Verify parent exists and is a sector
      const parent = await db.query('SELECT type, name_ar FROM departments WHERE id = $1', [parent_id]);
      if (parent.rows.length === 0) {
        return res.status(400).json({ error: 'Parent sector not found' });
      }
      const parentType = parent.rows[0].type;
      // Handle case where type might be NULL (old records)
      if (!parentType) {
        // If type is NULL, we can't verify, so we'll allow it but log a warning
        console.warn(`Parent department ${parent_id} has NULL type. Allowing creation but this should be fixed.`);
      } else if (parentType !== 'sector') {
        return res.status(400).json({ 
          error: `Department must be assigned to a sector. Selected parent is a ${parentType}.` 
        });
      }
    } else if (type === 'section') {
      if (!parent_id) {
        return res.status(400).json({ error: 'Section must be assigned to a department' });
      }
      // Verify parent exists and is a department
      const parent = await db.query('SELECT type, name_ar FROM departments WHERE id = $1', [parent_id]);
      if (parent.rows.length === 0) {
        return res.status(400).json({ error: 'Parent department not found' });
      }
      const parentType = parent.rows[0].type;
      // Handle case where type might be NULL (old records)
      if (!parentType) {
        // If type is NULL, we can't verify, so we'll allow it but log a warning
        console.warn(`Parent department ${parent_id} has NULL type. Allowing creation but this should be fixed.`);
      } else if (parentType !== 'department') {
        return res.status(400).json({ 
          error: `Section must be assigned to a department. Selected parent is a ${parentType}.` 
        });
      }
    }
    
    // Check for duplicate name in same parent
    let duplicateCheck;
    if (type === 'sector') {
      duplicateCheck = await db.query(
        'SELECT id FROM departments WHERE name_ar = $1 AND type = $2 AND parent_id IS NULL',
        [name_ar, type]
      );
    } else {
      duplicateCheck = await db.query(
        'SELECT id FROM departments WHERE name_ar = $1 AND type = $2 AND parent_id = $3',
        [name_ar, type, parent_id]
      );
    }
    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Item with this name already exists in the same parent' });
    }
    
    // Insert the department
    let result;
    try {
      console.log('Attempting to insert department:', { name_ar, type, parent_id });
      
      // Verify table structure exists (at minimum we need name_ar, type is optional but preferred)
      const tableCheck = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'departments' 
        AND column_name IN ('name_ar', 'type', 'parent_id')
      `);
      
      const foundColumns = tableCheck.rows.map(r => r.column_name);
      console.log('Found columns in departments table:', foundColumns);
      
      if (!foundColumns.includes('name_ar')) {
        console.error('Table structure issue. Missing name_ar column. Found columns:', foundColumns);
        return res.status(500).json({ 
          error: 'Database table structure issue. Missing name_ar column.',
          message: 'Please run database migrations to update the table structure'
        });
      }
      
      // If type column doesn't exist, it will be added by ensureTypeColumn, but let's handle it gracefully
      if (!foundColumns.includes('type')) {
        console.warn('Type column not found, but should have been added by ensureTypeColumn');
      }
      
      // Simple INSERT - type column should exist after ensureTypeColumn
      result = await db.query(`
        INSERT INTO departments (name_ar, type, parent_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [name_ar, type, parent_id]);
      console.log('Department created successfully:', result.rows[0].id);
    } catch (dbError) {
      console.error('Database error during insert:', {
        code: dbError.code,
        message: dbError.message,
        detail: dbError.detail,
        hint: dbError.hint,
        constraint: dbError.constraint,
        table: dbError.table,
        column: dbError.column,
        stack: dbError.stack
      });
      
      // Handle database constraint errors
      if (dbError.code === '23505') { // Unique violation
        return res.status(400).json({ error: 'Item with this name already exists in the same parent' });
      }
      if (dbError.code === '23503') { // Foreign key violation
        return res.status(400).json({ error: 'Invalid parent reference' });
      }
      if (dbError.code === '23514') { // Check constraint violation
        const constraintName = dbError.constraint;
        if (constraintName === 'sectors_no_parent') {
          return res.status(400).json({ error: 'Sector cannot have a parent' });
        }
        if (constraintName === 'departments_require_parent') {
          return res.status(400).json({ error: 'Department must be assigned to a sector' });
        }
        if (constraintName === 'sections_require_parent') {
          return res.status(400).json({ error: 'Section must be assigned to a department' });
        }
        return res.status(400).json({ 
          error: 'Invalid hierarchy: ' + (dbError.message || 'Constraint violation'),
          constraint: constraintName,
          detail: dbError.detail
        });
      }
      // Handle column doesn't exist error
      if (dbError.code === '42703') { // Undefined column
        return res.status(500).json({ 
          error: 'Database schema issue: Column does not exist',
          message: dbError.message,
          hint: 'Please run database migrations to update the table structure'
        });
      }
      // Re-throw if it's not a constraint error
      throw dbError;
    }
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create department error:', error);
    console.error('Error code:', error.code);
    console.error('Error details:', error.message);
    console.error('Error constraint:', error.constraint);
    console.error('Error stack:', error.stack);
    
    // Handle database constraint errors (fallback)
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Item with this name already exists' });
    }
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ error: 'Invalid parent reference' });
    }
    if (error.code === '23514') { // Check constraint violation
      return res.status(400).json({ error: 'Invalid hierarchy structure' });
    }
    
    // Always return detailed error in development
    const isDevelopment = process.env.NODE_ENV !== 'production';
    res.status(500).json({ 
      error: 'Failed to create department',
      message: isDevelopment ? error.message : 'An error occurred while creating the department',
      code: isDevelopment ? error.code : undefined,
      constraint: isDevelopment ? error.constraint : undefined,
      detail: isDevelopment ? error.detail : undefined,
      hint: isDevelopment ? error.hint : undefined
    });
  }
});

// Update department
router.put('/:id', authenticate, isTrainingOfficer, [
  body('name_ar').optional().trim().notEmpty().withMessage('Arabic name cannot be empty')
], async (req, res) => {
  try {
    await ensureTypeColumn();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: errors.array()[0].msg || 'Validation failed',
        errors: errors.array()
      });
    }

    let { name_ar, type, parent_id, objective_ar, objective_en, responsibilities } = req.body;
    
    // Get current department
    const current = await db.query('SELECT * FROM departments WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    const currentType = type || current.rows[0].type || 'department';
    
    // Normalize parent_id: convert empty string to null
    let currentParentId;
    if (parent_id !== undefined) {
      currentParentId = (parent_id === '' || parent_id === null) ? null : parent_id;
    } else {
      currentParentId = current.rows[0].parent_id;
    }
    
    // Trim name_ar if provided
    if (name_ar !== undefined) {
      name_ar = name_ar.trim();
      if (!name_ar) {
        return res.status(400).json({ error: 'Arabic name cannot be empty' });
      }
    } else {
      name_ar = current.rows[0].name_ar;
    }
    
    // Handle objective fields - use existing values if not provided
    const finalObjectiveAr = objective_ar !== undefined ? objective_ar : current.rows[0].objective_ar;
    const finalObjectiveEn = objective_en !== undefined ? objective_en : current.rows[0].objective_en;
    
    // Handle responsibilities - validate it's an array if provided
    let finalResponsibilities = current.rows[0].responsibilities || [];
    if (responsibilities !== undefined) {
      if (!Array.isArray(responsibilities)) {
        return res.status(400).json({ error: 'Responsibilities must be an array' });
      }
      finalResponsibilities = responsibilities;
    }
    
    // Validate hierarchy rules
    if (currentType === 'sector') {
      if (currentParentId) {
        return res.status(400).json({ error: 'Sector cannot have a parent' });
      }
    } else if (currentType === 'department') {
      if (!currentParentId) {
        return res.status(400).json({ error: 'Department must be assigned to a sector' });
      }
      // Verify parent is a sector
      const parent = await db.query('SELECT type FROM departments WHERE id = $1', [currentParentId]);
      if (parent.rows.length === 0) {
        return res.status(400).json({ error: 'Parent sector not found' });
      }
      const parentType = parent.rows[0].type;
      if (!parentType || parentType !== 'sector') {
        return res.status(400).json({ error: 'Department must be assigned to a sector' });
      }
    } else if (currentType === 'section') {
      if (!currentParentId) {
        return res.status(400).json({ error: 'Section must be assigned to a department' });
      }
      // Verify parent is a department
      const parent = await db.query('SELECT type FROM departments WHERE id = $1', [currentParentId]);
      if (parent.rows.length === 0) {
        return res.status(400).json({ error: 'Parent department not found' });
      }
      const parentType = parent.rows[0].type;
      if (!parentType || parentType !== 'department') {
        return res.status(400).json({ error: 'Section must be assigned to a department' });
      }
    }
    
    // Check for duplicate name (excluding current item)
    let duplicateCheck;
    if (currentType === 'sector') {
      duplicateCheck = await db.query(
        'SELECT id FROM departments WHERE name_ar = $1 AND type = $2 AND parent_id IS NULL AND id != $3',
        [name_ar, currentType, req.params.id]
      );
    } else {
      duplicateCheck = await db.query(
        'SELECT id FROM departments WHERE name_ar = $1 AND type = $2 AND parent_id = $3 AND id != $4',
        [name_ar, currentType, currentParentId, req.params.id]
      );
    }
    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Item with this name already exists in the same parent' });
    }
    
    const result = await db.query(`
      UPDATE departments
      SET name_ar = $1,
          type = $2,
          parent_id = $3,
          objective_ar = $4,
          objective_en = $5,
          responsibilities = $6
      WHERE id = $7
      RETURNING *
    `, [name_ar, currentType, currentParentId, finalObjectiveAr, finalObjectiveEn, JSON.stringify(finalResponsibilities), req.params.id]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update department error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle database constraint errors
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Item with this name already exists' });
    }
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ error: 'Invalid parent reference' });
    }
    
    res.status(500).json({ 
      error: 'Failed to update department',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete department
router.delete('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Check if department has users
    const userCheck = await db.query('SELECT id FROM users WHERE department_id = $1 LIMIT 1', [req.params.id]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete with assigned users' });
    }
    
    // Check if department has children
    const childCheck = await db.query('SELECT id FROM departments WHERE parent_id = $1 LIMIT 1', [req.params.id]);
    if (childCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete with child items' });
    }
    
    const result = await db.query('DELETE FROM departments WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Generate domains and skills for a department using AI
router.post('/:id/generate-domains', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const departmentId = req.params.id;
    
    // Get department with objective and responsibilities
    const deptResult = await db.query(`
      SELECT id, name_ar, name_en, type, objective_ar, objective_en, responsibilities
      FROM departments
      WHERE id = $1
    `, [departmentId]);
    
    if (deptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    const department = deptResult.rows[0];
    
    // Check if department has objective or responsibilities
    if (!department.objective_ar && !department.objective_en && 
        (!department.responsibilities || department.responsibilities.length === 0)) {
      return res.status(400).json({ 
        error: 'Department must have objective or responsibilities defined before generating domains',
        error_ar: 'يجب تحديد الهدف أو المسؤوليات للإدارة قبل توليد المجالات'
      });
    }
    
    // Generate domains using AI
    console.log(`🚀 Generating domains for department: ${department.name_ar}`);
    const result = await domainGenerator.generateDomainsForDepartment(department);
    
    res.json(result);
  } catch (error) {
    console.error('Generate domains error:', error);
    res.status(500).json({ 
      error: 'Failed to generate domains',
      message: error.message
    });
  }
});

// Save generated domains for a department
router.post('/:id/save-domains', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const departmentId = req.params.id;
    const { domains } = req.body;
    
    // Validate department exists
    const deptResult = await db.query('SELECT id, name_ar FROM departments WHERE id = $1', [departmentId]);
    if (deptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    // Validate domains structure
    const validation = domainGenerator.validateDomains(domains);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Invalid domains data',
        errors: validation.errors
      });
    }
    
    const savedDomains = [];
    const errors = [];
    
    await db.query('BEGIN');
    
    try {
      for (const domainData of domains) {
        // Create or update domain
        let domainId;
        
        // Check if domain with same name already exists
        const existingDomain = await db.query(`
          SELECT id FROM training_domains 
          WHERE (name_ar = $1 OR name_en = $2) AND is_active = true
        `, [domainData.name_ar, domainData.name_en]);
        
        if (existingDomain.rows.length > 0) {
          // Update existing domain
          domainId = existingDomain.rows[0].id;
          await db.query(`
            UPDATE training_domains
            SET description_ar = COALESCE($1, description_ar),
                description_en = COALESCE($2, description_en),
                color = COALESCE($3, color)
            WHERE id = $4
          `, [domainData.description_ar, domainData.description_en, domainData.color, domainId]);
        } else {
          // Create new domain
          const newDomain = await db.query(`
            INSERT INTO training_domains (name_ar, name_en, description_ar, description_en, color, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `, [
            domainData.name_ar,
            domainData.name_en,
            domainData.description_ar || '',
            domainData.description_en || '',
            domainData.color || '#502390',
            req.user.id
          ]);
          domainId = newDomain.rows[0].id;
        }
        
        // Link domain to department
        await db.query(`
          INSERT INTO domain_departments (domain_id, department_id)
          VALUES ($1, $2)
          ON CONFLICT (domain_id, department_id) DO NOTHING
        `, [domainId, departmentId]);
        
        // Add skills to domain
        const savedSkills = [];
        for (const skillData of (domainData.skills || [])) {
          // Check if skill already exists in this domain
          const existingSkill = await db.query(`
            SELECT id FROM skills
            WHERE domain_id = $1 AND (name_ar = $2 OR name_en = $3)
          `, [domainId, skillData.name_ar, skillData.name_en]);
          
          if (existingSkill.rows.length === 0) {
            const newSkill = await db.query(`
              INSERT INTO skills (domain_id, name_ar, name_en, description_ar, description_en, weight)
              VALUES ($1, $2, $3, $4, $5, 1.0)
              RETURNING id, name_ar, name_en
            `, [
              domainId,
              skillData.name_ar,
              skillData.name_en,
              skillData.description_ar || '',
              skillData.description_en || ''
            ]);
            savedSkills.push(newSkill.rows[0]);
          } else {
            // Skill already exists, just include it
            savedSkills.push({
              id: existingSkill.rows[0].id,
              name_ar: skillData.name_ar,
              name_en: skillData.name_en,
              existing: true
            });
          }
        }
        
        savedDomains.push({
          id: domainId,
          name_ar: domainData.name_ar,
          name_en: domainData.name_en,
          skills: savedSkills
        });
      }
      
      await db.query('COMMIT');
      
      console.log(`✅ Saved ${savedDomains.length} domains for department ${departmentId}`);
      
      res.json({
        success: true,
        message: 'Domains saved successfully',
        message_ar: 'تم حفظ المجالات بنجاح',
        domains: savedDomains,
        department_id: departmentId
      });
    } catch (dbError) {
      await db.query('ROLLBACK');
      throw dbError;
    }
  } catch (error) {
    console.error('Save domains error:', error);
    res.status(500).json({ 
      error: 'Failed to save domains',
      message: error.message
    });
  }
});

module.exports = router;

