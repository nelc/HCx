const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
             (SELECT COUNT(*) FROM tests WHERE domain_id = td.id) as tests_count,
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
             ) as skills,
             (
               SELECT COALESCE(
                 json_agg(
                   json_build_object(
                     'id', d.id,
                     'name_ar', d.name_ar,
                     'name_en', d.name_en
                   )
                   ORDER BY d.name_ar
                 ),
                 '[]'::json
               )
               FROM departments d
               INNER JOIN domain_departments dd ON d.id = dd.department_id
               WHERE dd.domain_id = td.id
             ) as departments
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
    
    const departmentsResult = await db.query(`
      SELECT d.id, d.name_ar, d.name_en
      FROM departments d
      INNER JOIN domain_departments dd ON d.id = dd.department_id
      WHERE dd.domain_id = $1
      ORDER BY d.name_ar
    `, [req.params.id]);
    
    res.json({
      ...domainResult.rows[0],
      skills: skillsResult.rows,
      departments: departmentsResult.rows
    });
  } catch (error) {
    console.error('Get domain error:', error);
    res.status(500).json({ error: 'Failed to get training domain' });
  }
});

// Create training domain (with optional initial skills and departments)
router.post('/', authenticate, isAdmin, [
  body('name_ar').notEmpty(),
  body('name_en').notEmpty(),
  body('skills').optional().isArray(),
  body('department_ids').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { name_ar, name_en, description_ar, description_en, icon, color, skills = [], department_ids = [] } = req.body;

    // Use a transaction so domain + skills + departments are created together
    await db.query('BEGIN');
    
    const domainResult = await db.query(`
      INSERT INTO training_domains (name_ar, name_en, description_ar, description_en, icon, color, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name_ar, name_en, description_ar, description_en, icon, color, req.user.id]);
    
    const domain = domainResult.rows[0];
    const createdSkills = [];

    if (Array.isArray(skills) && skills.length > 0) {
      for (const skill of skills) {
        // Basic validation per skill object
        if (!skill || !skill.name_ar || !skill.name_en) continue;

        const skillResult = await db.query(`
          INSERT INTO skills (domain_id, name_ar, name_en, description_ar, description_en, weight)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [
          domain.id,
          skill.name_ar,
          skill.name_en,
          skill.description_ar || null,
          skill.description_en || null,
          skill.weight || 1.0
        ]);

        createdSkills.push(skillResult.rows[0]);
      }
    }

    // Create department associations
    if (Array.isArray(department_ids) && department_ids.length > 0) {
      for (const dept_id of department_ids) {
        if (!dept_id) continue;
        
        await db.query(`
          INSERT INTO domain_departments (domain_id, department_id)
          VALUES ($1, $2)
          ON CONFLICT (domain_id, department_id) DO NOTHING
        `, [domain.id, dept_id]);
      }
    }

    await db.query('COMMIT');
    
    res.status(201).json({
      ...domain,
      skills: createdSkills,
      department_ids
    });
  } catch (error) {
    // Ensure transaction is rolled back on error
    try {
      await db.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error (create domain):', rollbackError);
    }

    console.error('Create domain error:', error);
    res.status(500).json({ error: 'Failed to create training domain' });
  }
});

// Update training domain
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name_ar, name_en, description_ar, description_en, icon, color, is_active, department_ids } = req.body;
    
    await db.query('BEGIN');
    
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
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Training domain not found' });
    }
    
    // Update department associations if provided
    if (Array.isArray(department_ids)) {
      // Delete existing associations
      await db.query(`DELETE FROM domain_departments WHERE domain_id = $1`, [req.params.id]);
      
      // Create new associations
      if (department_ids.length > 0) {
        for (const dept_id of department_ids) {
          if (!dept_id) continue;
          
          await db.query(`
            INSERT INTO domain_departments (domain_id, department_id)
            VALUES ($1, $2)
            ON CONFLICT (domain_id, department_id) DO NOTHING
          `, [req.params.id, dept_id]);
        }
      }
    }
    
    await db.query('COMMIT');
    
    res.json(result.rows[0]);
  } catch (error) {
    try {
      await db.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error (update domain):', rollbackError);
    }
    
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

// Bulk upload domains with skills from CSV
router.post('/upload-csv', authenticate, isAdmin, upload.single('file'), async (req, res) => {
  console.log('📤 Starting domains CSV upload process...');
  try {
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📄 File received: ${req.file.originalname}, Size: ${req.file.size} bytes`);

    // Parse CSV
    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    console.log(`📊 Parsed ${records.length} records from CSV`);

    const results = {
      total: records.length,
      success: 0,
      inserted: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    // Group records by domain (since multiple rows can have same domain but different skills)
    const domainMap = new Map();
    
    for (const record of records) {
      const domainKey = `${record.domain_ar}_${record.domain_en}`;
      
      if (!domainMap.has(domainKey)) {
        domainMap.set(domainKey, {
          domain_ar: record.domain_ar,
          domain_en: record.domain_en,
          description: record.description || '',
          color_code: record.color_code || '#502390',
          skills: []
        });
      }
      
      // Add skill to this domain if provided
      if (record.skill_ar && record.skill_en) {
        domainMap.get(domainKey).skills.push({
          name_ar: record.skill_ar,
          name_en: record.skill_en
        });
      }
    }

    console.log(`📋 Found ${domainMap.size} unique domains with skills`);

    // Process each domain with its skills
    for (const [domainKey, domainData] of domainMap.entries()) {
      console.log(`⚙️  Processing domain: ${domainData.domain_ar}`);
      
      try {
        // Check if domain already exists
        const existingDomain = await db.query(
          'SELECT id FROM training_domains WHERE name_ar = $1 AND name_en = $2',
          [domainData.domain_ar, domainData.domain_en]
        );

        let domainId;
        let isUpdate = false;

        await db.query('BEGIN');

        if (existingDomain.rows.length > 0) {
          // Update existing domain
          domainId = existingDomain.rows[0].id;
          isUpdate = true;

          await db.query(`
            UPDATE training_domains
            SET description_ar = $1, color = $2
            WHERE id = $3
          `, [domainData.description, domainData.color_code, domainId]);

          console.log(`✅ Updated existing domain: ${domainData.domain_ar}`);
          results.updated++;
        } else {
          // Insert new domain
          const newDomain = await db.query(`
            INSERT INTO training_domains (name_ar, name_en, description_ar, color, created_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `, [
            domainData.domain_ar,
            domainData.domain_en,
            domainData.description,
            domainData.color_code,
            req.user.id
          ]);

          domainId = newDomain.rows[0].id;
          console.log(`✅ Created new domain: ${domainData.domain_ar}`);
          results.inserted++;
        }

        // Insert skills for this domain
        let skillsAdded = 0;
        for (const skill of domainData.skills) {
          // Check if skill already exists for this domain
          const existingSkill = await db.query(
            'SELECT id FROM skills WHERE domain_id = $1 AND name_ar = $2 AND name_en = $3',
            [domainId, skill.name_ar, skill.name_en]
          );

          if (existingSkill.rows.length === 0) {
            await db.query(`
              INSERT INTO skills (domain_id, name_ar, name_en, weight)
              VALUES ($1, $2, $3, 1.0)
            `, [domainId, skill.name_ar, skill.name_en]);
            
            skillsAdded++;
          }
        }

        await db.query('COMMIT');
        
        console.log(`   ↳ Added ${skillsAdded} new skills to domain`);
        results.success++;

      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        console.error(`❌ Failed to process domain ${domainData.domain_ar}:`, error);
        results.failed++;
        results.errors.push({
          domain: domainData.domain_ar,
          error: error.message
        });
      }
    }

    console.log(`✅ CSV upload complete: ${results.success} successful, ${results.failed} failed`);

    res.json(results);
  } catch (error) {
    console.error('❌ CSV upload error:', error);
    res.status(500).json({ 
      error: 'Failed to process CSV file',
      details: error.message 
    });
  }
});

module.exports = router;

