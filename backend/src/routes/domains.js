const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get all training domains
router.get('/', authenticate, async (req, res) => {
  try {
    const { include_stats } = req.query;
    
    let query = `
      SELECT td.*,
             u.name_ar as created_by_name_ar,
             u.name_en as created_by_name_en
    `;
    
    if (include_stats === 'true') {
      query += `,
             (SELECT COUNT(*) FROM skills WHERE domain_id = td.id) as skills_count,
             (SELECT COUNT(*) FROM tests WHERE domain_id = td.id) as tests_count
      `;
    }
    
    query += `
      FROM training_domains td
      LEFT JOIN users u ON td.created_by = u.id
      WHERE td.is_active = true
      ORDER BY td.name_ar
    `;
    
    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Get domains error:', error);
    res.status(500).json({ error: 'Failed to get training domains' });
  }
});

// Get single domain with skills
router.get('/:id', authenticate, async (req, res) => {
  try {
    const domainResult = await db.query(`
      SELECT td.*,
             u.name_ar as created_by_name_ar,
             u.name_en as created_by_name_en
      FROM training_domains td
      LEFT JOIN users u ON td.created_by = u.id
      WHERE td.id = $1
    `, [req.params.id]);
    
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Training domain not found' });
    }
    
    const skillsResult = await db.query(`
      SELECT * FROM skills WHERE domain_id = $1 ORDER BY name_ar
    `, [req.params.id]);
    
    res.json({
      ...domainResult.rows[0],
      skills: skillsResult.rows
    });
  } catch (error) {
    console.error('Get domain error:', error);
    res.status(500).json({ error: 'Failed to get training domain' });
  }
});

// Create training domain
router.post('/', authenticate, isAdmin, [
  body('name_ar').notEmpty(),
  body('name_en').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { name_ar, name_en, description_ar, description_en, icon, color } = req.body;
    
    const result = await db.query(`
      INSERT INTO training_domains (name_ar, name_en, description_ar, description_en, icon, color, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name_ar, name_en, description_ar, description_en, icon, color, req.user.id]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create domain error:', error);
    res.status(500).json({ error: 'Failed to create training domain' });
  }
});

// Update training domain
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name_ar, name_en, description_ar, description_en, icon, color, is_active } = req.body;
    
    const result = await db.query(`
      UPDATE training_domains
      SET name_ar = COALESCE($1, name_ar),
          name_en = COALESCE($2, name_en),
          description_ar = COALESCE($3, description_ar),
          description_en = COALESCE($4, description_en),
          icon = COALESCE($5, icon),
          color = COALESCE($6, color),
          is_active = COALESCE($7, is_active)
      WHERE id = $8
      RETURNING *
    `, [name_ar, name_en, description_ar, description_en, icon, color, is_active, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Training domain not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update domain error:', error);
    res.status(500).json({ error: 'Failed to update training domain' });
  }
});

// Delete training domain
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    // Check if domain has tests
    const testCheck = await db.query('SELECT id FROM tests WHERE domain_id = $1 LIMIT 1', [req.params.id]);
    if (testCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete domain with associated tests' });
    }
    
    const result = await db.query('DELETE FROM training_domains WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Training domain not found' });
    }
    
    res.json({ message: 'Training domain deleted successfully' });
  } catch (error) {
    console.error('Delete domain error:', error);
    res.status(500).json({ error: 'Failed to delete training domain' });
  }
});

module.exports = router;

