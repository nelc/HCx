const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, query, param, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');
const neo4jApi = require('../services/neo4jApi');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Calculate intelligent relevance score for course-skill relationship
 * Based on how prominently the skill appears in course metadata
 * @param {Object} courseData - Course data with name_ar, name_en, description_ar, description_en, skill_tags
 * @param {Object} skillData - Skill data with name_ar, name_en
 * @returns {number} Relevance score between 0.5 and 1.5
 */
function calculateRelevanceScore(courseData, skillData) {
  let score = 0.5; // Base score
  
  const courseName = `${courseData.name_ar || ''} ${courseData.name_en || ''}`.toLowerCase();
  const courseDesc = `${courseData.description_ar || ''} ${courseData.description_en || ''}`.toLowerCase();
  const skillNameAr = (skillData.name_ar || '').toLowerCase();
  const skillNameEn = (skillData.name_en || '').toLowerCase();
  
  // Check title match (highest relevance)
  if (courseName.includes(skillNameAr) || courseName.includes(skillNameEn)) {
    score += 0.5; // Title match = +0.5 (total: 1.0)
  }
  
  // Check description match (medium relevance)
  if (courseDesc.includes(skillNameAr) || courseDesc.includes(skillNameEn)) {
    score += 0.2; // Description match = +0.2
  }
  
  // Check skill_tags array match (if available)
  if (courseData.skill_tags && Array.isArray(courseData.skill_tags)) {
    const hasTagMatch = courseData.skill_tags.some(tag => 
      tag.toLowerCase().includes(skillNameAr) || 
      tag.toLowerCase().includes(skillNameEn)
    );
    if (hasTagMatch) {
      score += 0.3; // Tag match = +0.3
    }
  }
  
  // Cap at 1.5 maximum
  return Math.min(score, 1.5);
}

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/courses/upload-csv
 * Bulk upload courses from CSV file with progress tracking
 */
router.post('/upload-csv', 
  isAdmin, 
  upload.single('file'), 
  async (req, res) => {
    console.log('📤 Starting CSV upload process...');
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
        updated: 0,
        inserted: 0,
        failed: 0,
        errors: [],
        progress: []
      };

      const startTime = Date.now();

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const progressPercent = Math.round(((i + 1) / records.length) * 100);
        
        console.log(`⚙️  Processing record ${i + 1}/${records.length}: ${record.name_ar || record.course_name}`);
        
        try {
          // Parse skills from comma-separated string
          const skillNames = record.skills ? record.skills.split(',').map(s => s.trim()) : [];
          
          // Normalize difficulty level - handle various formats
          let difficultyLevel = 'beginner'; // default
          if (record.difficulty_level) {
            const level = record.difficulty_level.toLowerCase().trim();
            // Map common variations to valid values
            if (level === 'beginner' || level === 'begin') {
              difficultyLevel = 'beginner';
            } else if (level === 'intermediate' || level === 'intermedia' || level === 'inter' || level === 'medium') {
              difficultyLevel = 'intermediate';
            } else if (level === 'advanced' || level === 'expert') {
              difficultyLevel = 'advanced';
            }
          }
          
          // Check if course already exists (by URL as unique identifier)
          let course;
          let isUpdate = false;
          
          const existingCourse = record.url 
            ? await db.query('SELECT * FROM courses WHERE url = $1', [record.url])
            : { rows: [] };

          if (existingCourse.rows.length > 0) {
            // UPDATE existing course
            const courseResult = await db.query(`
              UPDATE courses SET
                name_ar = $1, name_en = $2, description_ar = $3, description_en = $4,
                provider = $5, duration_hours = $6, difficulty_level = $7,
                language = $8, subject = $9, subtitle = $10, university = $11, 
                skill_tags = $12,
                synced_to_neo4j = false,
                updated_at = CURRENT_TIMESTAMP
              WHERE url = $13
              RETURNING *
            `, [
              record.name_ar || record.course_name,
              record.name_en || null,
              record.description_ar || record.description,
              record.description_en || null,
              record.provider || null,
              record.duration_hours ? parseFloat(record.duration_hours) : null,
              difficultyLevel,
              record.language || 'ar',
              record.subject || null,
              record.subtitle || null,
              record.university || null,
              skillNames.length > 0 ? skillNames : null,
              record.url
            ]);
            
            course = courseResult.rows[0];
            isUpdate = true;
            console.log(`🔄 Updated existing course ${i + 1}: ${record.name_ar || record.course_name}`);
            
            // Clear old skill relationships before adding new ones
            await db.query('DELETE FROM course_skills WHERE course_id = $1', [course.id]);
          } else {
            // INSERT new course
            const courseResult = await db.query(`
              INSERT INTO courses (
                name_ar, name_en, description_ar, description_en, 
                url, provider, duration_hours, difficulty_level,
                language, subject, subtitle, university, skill_tags
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              RETURNING *
            `, [
              record.name_ar || record.course_name,
              record.name_en || null,
              record.description_ar || record.description,
              record.description_en || null,
              record.url,
              record.provider || null,
              record.duration_hours ? parseFloat(record.duration_hours) : null,
              difficultyLevel,
              record.language || 'ar',
              record.subject || null,
              record.subtitle || null,
              record.university || null,
              skillNames.length > 0 ? skillNames : null
            ]);
            
            course = courseResult.rows[0];
            console.log(`✅ Inserted new course ${i + 1}: ${record.name_ar || record.course_name}`);
          }

          // Link to skills if skill names provided
          const skillIds = [];
          if (skillNames.length > 0) {
            // Find matching skills in database
            for (const skillName of skillNames) {
              const skillResult = await db.query(`
                SELECT id, name_ar, name_en FROM skills 
                WHERE name_ar ILIKE $1 OR name_en ILIKE $1
                LIMIT 1
              `, [`%${skillName}%`]);
              
              if (skillResult.rows.length > 0) {
                const skill = skillResult.rows[0];
                const skillId = skill.id;
                skillIds.push(skillId);
                
                // Calculate intelligent relevance score
                const relevanceScore = calculateRelevanceScore(course, skill);
                
                // Insert into course_skills with calculated relevance
                await db.query(`
                  INSERT INTO course_skills (course_id, skill_id, relevance_score)
                  VALUES ($1, $2, $3)
                  ON CONFLICT (course_id, skill_id) DO UPDATE SET relevance_score = $3
                `, [course.id, skillId, relevanceScore]);
              }
            }
          }

          // Sync to Neo4j
          try {
            await neo4jApi.createCourseNode(course);
            
            // Create skill relationships in Neo4j with calculated relevance scores
            for (const skillId of skillIds) {
              // Get relevance score from course_skills table
              const csResult = await db.query(
                'SELECT relevance_score FROM course_skills WHERE course_id = $1 AND skill_id = $2',
                [course.id, skillId]
              );
              const relevanceScore = csResult.rows[0]?.relevance_score || 1.0;
              await neo4jApi.createCourseSkillRelationship(course.id, skillId, relevanceScore);
            }
            
            // Mark as synced
            await db.query(`
              UPDATE courses 
              SET synced_to_neo4j = true, 
                  neo4j_node_id = $1,
                  last_synced_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [course.id, course.id]);
          } catch (neo4jError) {
            console.error('Neo4j sync error for course:', course.id, neo4jError.message);
            // Continue - course is saved in PostgreSQL even if Neo4j sync fails
          }

          results.success++;
          if (isUpdate) {
            results.updated++;
          } else {
            results.inserted++;
          }
          
          // Store progress information
          const elapsed = Date.now() - startTime;
          const avgTimePerRecord = elapsed / (i + 1);
          const estimatedTimeLeft = Math.round((avgTimePerRecord * (records.length - i - 1)) / 1000);
          
          results.progress.push({
            current: i + 1,
            total: records.length,
            percent: progressPercent,
            estimatedTimeLeft
          });
        } catch (error) {
          results.failed++;
          console.error(`❌ Failed to insert record ${i + 1}: ${record.name_ar || record.course_name}`, error.message);
          results.errors.push({
            record: record.name_ar || record.course_name,
            error: error.message
          });
        }
      }

      const totalTime = Math.round((Date.now() - startTime) / 1000);
      results.totalTime = totalTime;

      console.log(`\n📊 Upload Complete:`);
      console.log(`   ✅ Success: ${results.success}`);
      console.log(`      ➕ Inserted: ${results.inserted}`);
      console.log(`      🔄 Updated: ${results.updated}`);
      console.log(`   ❌ Failed: ${results.failed}`);
      console.log(`   📁 Total: ${results.total}`);
      console.log(`   ⏱️  Time: ${totalTime}s\n`);

      res.json(results);
    } catch (error) {
      console.error('❌ Upload CSV error:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ 
        error: 'Failed to upload CSV',
        details: error.message 
      });
    }
  });

/**
 * POST /api/courses
 * Create a single course
 */
router.post('/', 
  isTrainingOfficer,
  [
    body('name_ar').notEmpty().withMessage('Arabic name is required'),
    body('url').optional().isURL(),
    body('duration_hours').optional().isFloat({ min: 0 }),
    body('price').optional().isFloat({ min: 0 }),
    body('rating').optional().isFloat({ min: 0, max: 5 }),
    body('skill_ids').optional().isArray()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        name_ar,
        name_en,
        description_ar,
        description_en,
        url,
        provider,
        duration_hours,
        difficulty_level,
        language,
        subject,
        subtitle,
        university,
        skill_ids,
        skill_tags
      } = req.body;

      // Insert into PostgreSQL
      const courseResult = await db.query(`
        INSERT INTO courses (
          name_ar, name_en, description_ar, description_en, 
          url, provider, duration_hours, difficulty_level,
          language, subject, subtitle, university, skill_tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        name_ar, name_en, description_ar, description_en, 
        url, provider, duration_hours, difficulty_level,
        language, subject, subtitle, university, skill_tags || null
      ]);

      const course = courseResult.rows[0];

      // Link to skills
      if (skill_ids && skill_ids.length > 0) {
        for (const skill_id of skill_ids) {
          // Get skill data to calculate relevance
          const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skill_id]);
          if (skillResult.rows.length > 0) {
            const relevanceScore = calculateRelevanceScore(course, skillResult.rows[0]);
            await db.query(`
              INSERT INTO course_skills (course_id, skill_id, relevance_score)
              VALUES ($1, $2, $3)
              ON CONFLICT (course_id, skill_id) DO NOTHING
            `, [course.id, skill_id, relevanceScore]);
          }
        }
      }

      // Sync to Neo4j
      try {
        await neo4jApi.createCourseNode(course);

        // Create skill relationships in Neo4j with calculated relevance
        if (skill_ids && skill_ids.length > 0) {
          for (const skill_id of skill_ids) {
            // Ensure skill exists in Neo4j first
            const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skill_id]);
            if (skillResult.rows.length > 0) {
              try {
                await neo4jApi.createSkillNode(skillResult.rows[0]);
              } catch (err) {
                // Skill might already exist
                console.log('Skill node may already exist:', skill_id);
              }
              // Get relevance score from course_skills
              const csResult = await db.query(
                'SELECT relevance_score FROM course_skills WHERE course_id = $1 AND skill_id = $2',
                [course.id, skill_id]
              );
              const relevanceScore = csResult.rows[0]?.relevance_score || 1.0;
              await neo4jApi.createCourseSkillRelationship(course.id, skill_id, relevanceScore);
            }
          }
        }

        // Mark as synced
        await db.query(`
          UPDATE courses 
          SET synced_to_neo4j = true, 
              neo4j_node_id = $1,
              last_synced_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [course.id, course.id]);

        course.synced_to_neo4j = true;
      } catch (neo4jError) {
        console.error('Neo4j sync error:', neo4jError);
        // Course is created but not synced
      }

      res.status(201).json(course);
    } catch (error) {
      console.error('Create course error:', error);
      res.status(500).json({ 
        error: 'Failed to create course',
        details: error.message 
      });
    }
});

/**
 * GET /api/courses
 * List courses with filters and pagination
 */
router.get('/', 
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('skill_id').optional().isUUID(),
    query('difficulty_level').optional().isIn(['beginner', 'intermediate', 'advanced']),
    query('search').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { 
        page = 1, 
        limit = 20, 
        skill_id, 
        difficulty_level,
        search 
      } = req.query;
      
      const offset = (page - 1) * limit;

      let query = `
        SELECT c.*,
               c.skill_tags,
               json_agg(
                 json_build_object(
                   'id', s.id,
                   'name_ar', s.name_ar,
                   'name_en', s.name_en
                 )
               ) FILTER (WHERE s.id IS NOT NULL) as skills
        FROM courses c
        LEFT JOIN course_skills cs ON c.id = cs.course_id
        LEFT JOIN skills s ON cs.skill_id = s.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramCount = 0;

      if (skill_id) {
        paramCount++;
        query += ` AND cs.skill_id = $${paramCount}`;
        params.push(skill_id);
      }

      if (difficulty_level) {
        paramCount++;
        query += ` AND c.difficulty_level = $${paramCount}`;
        params.push(difficulty_level);
      }

      if (search) {
        paramCount++;
        query += ` AND (c.name_ar ILIKE $${paramCount} OR c.name_en ILIKE $${paramCount} OR c.description_ar ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }

      query += ` 
        GROUP BY c.id
        ORDER BY c.created_at DESC 
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(DISTINCT c.id) FROM courses c';
      const countParams = [];
      let countParamCount = 0;

      if (skill_id || difficulty_level || search) {
        countQuery += ' LEFT JOIN course_skills cs ON c.id = cs.course_id WHERE 1=1';
        
        if (skill_id) {
          countParamCount++;
          countQuery += ` AND cs.skill_id = $${countParamCount}`;
          countParams.push(skill_id);
        }
        if (difficulty_level) {
          countParamCount++;
          countQuery += ` AND c.difficulty_level = $${countParamCount}`;
          countParams.push(difficulty_level);
        }
        if (search) {
          countParamCount++;
          countQuery += ` AND (c.name_ar ILIKE $${countParamCount} OR c.name_en ILIKE $${countParamCount} OR c.description_ar ILIKE $${countParamCount})`;
          countParams.push(`%${search}%`);
        }
      }

      const countResult = await db.query(countQuery, countParams);

      res.json({
        courses: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count)
        }
      });
    } catch (error) {
      console.error('Get courses error:', error);
      res.status(500).json({ 
        error: 'Failed to get courses',
        details: error.message 
      });
    }
});

/**
 * GET /api/courses/:id
 * Get single course details
 */
router.get('/:id', 
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const result = await db.query(`
        SELECT c.*,
               json_agg(
                 json_build_object(
                   'id', s.id,
                   'name_ar', s.name_ar,
                   'name_en', s.name_en,
                   'relevance_score', cs.relevance_score
                 )
               ) FILTER (WHERE s.id IS NOT NULL) as skills
        FROM courses c
        LEFT JOIN course_skills cs ON c.id = cs.course_id
        LEFT JOIN skills s ON cs.skill_id = s.id
        WHERE c.id = $1
        GROUP BY c.id
      `, [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Get course error:', error);
      res.status(500).json({ 
        error: 'Failed to get course',
        details: error.message 
      });
    }
});

/**
 * PATCH /api/courses/:id
 * Update a course
 */
router.patch('/:id', 
  isTrainingOfficer,
  [
    param('id').isUUID(),
    body('name_ar').optional().notEmpty(),
    body('url').optional().isURL(),
    body('duration_hours').optional().isFloat({ min: 0 }),
    body('price').optional().isFloat({ min: 0 }),
    body('rating').optional().isFloat({ min: 0, max: 5 }),
    body('skill_ids').optional().isArray()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const updates = req.body;

      // Build dynamic update query
      const fields = [];
      const values = [];
      let paramCount = 0;

      const allowedFields = [
        'name_ar', 'name_en', 'description_ar', 'description_en',
        'url', 'provider', 'duration_hours', 'difficulty_level',
        'language', 'subject', 'subtitle', 'university', 'skill_tags'
      ];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          paramCount++;
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
        }
      }

      if (fields.length > 0) {
        paramCount++;
        const query = `
          UPDATE courses 
          SET ${fields.join(', ')}, 
              synced_to_neo4j = false,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $${paramCount}
          RETURNING *
        `;
        values.push(id);

        const result = await db.query(query, values);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Course not found' });
        }

        // Update skills if provided
        if (updates.skill_ids) {
          const course = result.rows[0];
          
          // Remove old skills
          await db.query('DELETE FROM course_skills WHERE course_id = $1', [id]);
          
          // Add new skills with calculated relevance
          for (const skill_id of updates.skill_ids) {
            const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skill_id]);
            if (skillResult.rows.length > 0) {
              const relevanceScore = calculateRelevanceScore(course, skillResult.rows[0]);
              await db.query(`
                INSERT INTO course_skills (course_id, skill_id, relevance_score)
                VALUES ($1, $2, $3)
              `, [id, skill_id, relevanceScore]);
            }
          }
        }

        res.json(result.rows[0]);
      } else {
        res.status(400).json({ error: 'No fields to update' });
      }
    } catch (error) {
      console.error('Update course error:', error);
      res.status(500).json({ 
        error: 'Failed to update course',
        details: error.message 
      });
    }
});

/**
 * DELETE /api/courses/:id
 * Delete course from PostgreSQL and Neo4j
 */
router.delete('/:id', 
  isAdmin,
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      // Check if course exists
      const checkResult = await db.query(
        'SELECT * FROM courses WHERE id = $1', 
        [id]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const course = checkResult.rows[0];

      // Delete from Neo4j first
      if (course.synced_to_neo4j) {
        try {
          await neo4jApi.deleteNodeRelationships('Course', 'course_id', id);
          await neo4jApi.deleteNode('Course', 'course_id', id);
        } catch (neo4jError) {
          console.error('Neo4j deletion error:', neo4jError);
          // Continue with PostgreSQL deletion even if Neo4j fails
        }
      }

      // Delete from PostgreSQL (cascade deletes course_skills)
      await db.query('DELETE FROM courses WHERE id = $1', [id]);

      res.json({ 
        message: 'Course deleted successfully',
        id: id,
        deleted_from_neo4j: course.synced_to_neo4j
      });
    } catch (error) {
      console.error('Delete course error:', error);
      res.status(500).json({ 
        error: 'Failed to delete course',
        details: error.message 
      });
    }
});

/**
 * POST /api/courses/:id/sync-neo4j
 * Manually sync a single course to Neo4j
 */
router.post('/:id/sync-neo4j', 
  isAdmin,
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      // Get course with skills
      const result = await db.query(`
        SELECT c.*, 
               array_agg(cs.skill_id) FILTER (WHERE cs.skill_id IS NOT NULL) as skill_ids
        FROM courses c
        LEFT JOIN course_skills cs ON c.id = cs.course_id
        WHERE c.id = $1
        GROUP BY c.id
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const course = result.rows[0];

      // Update node in Neo4j (delete and recreate)
      await neo4jApi.updateCourseNode(course);

      // Create skill relationships with calculated relevance
      if (course.skill_ids && course.skill_ids.length > 0) {
        for (const skill_id of course.skill_ids) {
          // Ensure skill exists in Neo4j
          const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skill_id]);
          if (skillResult.rows.length > 0) {
            try {
              await neo4jApi.createSkillNode(skillResult.rows[0]);
            } catch (err) {
              // Skill might already exist
              console.log('Skill node may already exist:', skill_id);
            }
            // Get relevance score from course_skills
            const csResult = await db.query(
              'SELECT relevance_score FROM course_skills WHERE course_id = $1 AND skill_id = $2',
              [course.id, skill_id]
            );
            const relevanceScore = csResult.rows[0]?.relevance_score || 1.0;
            await neo4jApi.createCourseSkillRelationship(course.id, skill_id, relevanceScore);
          }
        }
      }

      // Mark as synced
      await db.query(`
        UPDATE courses 
        SET synced_to_neo4j = true,
            neo4j_node_id = $1,
            last_synced_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [course.id, id]);

      res.json({ 
        message: 'Course synced to Neo4j successfully',
        course_id: id 
      });
    } catch (error) {
      console.error('Sync course error:', error);
      res.status(500).json({ 
        error: 'Failed to sync course to Neo4j',
        details: error.message 
      });
    }
});

/**
 * POST /api/courses/sync-all
 * Bulk sync all unsynced courses to Neo4j
 */
router.post('/sync-all', 
  isAdmin,
  async (req, res) => {
    try {
      const result = await db.query(`
        SELECT c.*, 
               array_agg(cs.skill_id) FILTER (WHERE cs.skill_id IS NOT NULL) as skill_ids
        FROM courses c
        LEFT JOIN course_skills cs ON c.id = cs.course_id
        WHERE c.synced_to_neo4j = false OR c.synced_to_neo4j IS NULL
        GROUP BY c.id
      `);

      const results = {
        total: result.rows.length,
        success: 0,
        failed: 0,
        errors: []
      };

      for (const course of result.rows) {
        try {
          await neo4jApi.createCourseNode(course);

          // Create skill relationships with calculated relevance
          if (course.skill_ids && course.skill_ids.length > 0) {
            for (const skill_id of course.skill_ids) {
              const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skill_id]);
              if (skillResult.rows.length > 0) {
                try {
                  await neo4jApi.createSkillNode(skillResult.rows[0]);
                } catch (err) {
                  // Skill might already exist
                }
                // Get relevance score from course_skills
                const csResult = await db.query(
                  'SELECT relevance_score FROM course_skills WHERE course_id = $1 AND skill_id = $2',
                  [course.id, skill_id]
                );
                const relevanceScore = csResult.rows[0]?.relevance_score || 1.0;
                await neo4jApi.createCourseSkillRelationship(course.id, skill_id, relevanceScore);
              }
            }
          }

          await db.query(`
            UPDATE courses 
            SET synced_to_neo4j = true,
                neo4j_node_id = $1,
                last_synced_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [course.id, course.id]);

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            course_id: course.id,
            course_name: course.name_ar,
            error: error.message
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Sync all courses error:', error);
      res.status(500).json({ 
        error: 'Failed to sync courses',
        details: error.message 
      });
    }
});

module.exports = router;
