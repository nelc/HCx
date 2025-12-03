const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get all departments
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT d.*, 
             p.name_ar as parent_name_ar, 
             p.name_en as parent_name_en,
             (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
      FROM departments d
      LEFT JOIN departments p ON d.parent_id = p.id
      ORDER BY d.name_ar
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to get departments' });
  }
});

// Get single department
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT d.*, 
             p.name_ar as parent_name_ar, 
             p.name_en as parent_name_en,
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
    res.status(500).json({ error: 'Failed to get department' });
  }
});

// Create department
router.post('/', authenticate, isAdmin, [
  body('name_ar').notEmpty(),
  body('name_en').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { name_ar, name_en, description_ar, description_en, parent_id } = req.body;
    
    const result = await db.query(`
      INSERT INTO departments (name_ar, name_en, description_ar, description_en, parent_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name_ar, name_en, description_ar, description_en, parent_id]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// Update department
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name_ar, name_en, description_ar, description_en, parent_id } = req.body;
    
    const result = await db.query(`
      UPDATE departments
      SET name_ar = COALESCE($1, name_ar),
          name_en = COALESCE($2, name_en),
          description_ar = COALESCE($3, description_ar),
          description_en = COALESCE($4, description_en),
          parent_id = $5
      WHERE id = $6
      RETURNING *
    `, [name_ar, name_en, description_ar, description_en, parent_id, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// Delete department
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    // Check if department has users
    const userCheck = await db.query('SELECT id FROM users WHERE department_id = $1 LIMIT 1', [req.params.id]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete department with assigned users' });
    }
    
    const result = await db.query('DELETE FROM departments WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

module.exports = router;

