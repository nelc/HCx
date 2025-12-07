const express = require('express');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');
const neo4jApi = require('../services/neo4jApi');

const router = express.Router();

// Get all recommendations (for training officer)
router.get('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { user_id, skill_id, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT tr.*,
             u.name_ar as user_name_ar,
             u.name_en as user_name_en,
             u.email as user_email,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             d.name_ar as department_name_ar,
             d.name_en as department_name_en
      FROM training_recommendations tr
      JOIN users u ON tr.user_id = u.id
      LEFT JOIN skills s ON tr.skill_id = s.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (user_id) {
      paramCount++;
      query += ` AND tr.user_id = $${paramCount}`;
      params.push(user_id);
    }
    
    if (skill_id) {
      paramCount++;
      query += ` AND tr.skill_id = $${paramCount}`;
      params.push(skill_id);
    }
    
    if (status) {
      paramCount++;
      query += ` AND tr.status = $${paramCount}`;
      params.push(status);
    }
    
    query += ` ORDER BY tr.priority, tr.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    res.json({
      recommendations: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Get Neo4j-powered recommendations for a specific user
router.get('/neo4j/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;

    // Check authorization - only allow users to see their own or if training officer/admin
    if (req.user.role === 'employee' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get user's latest skill gaps from analysis_results
    const gapsResult = await db.query(`
      SELECT gaps, analyzed_at
      FROM analysis_results 
      WHERE user_id = $1 
      ORDER BY analyzed_at DESC 
      LIMIT 1
    `, [userId]);

    if (gapsResult.rows.length === 0) {
      return res.json({ 
        message: 'No assessment results found. Complete an assessment first to get personalized recommendations.',
        recommendations: [],
        source: 'neo4j'
      });
    }

    const gaps = gapsResult.rows[0].gaps;
    const analyzedAt = gapsResult.rows[0].analyzed_at;

    // Sync user node to Neo4j if not exists
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
      try {
        await neo4jApi.createUserNode(userResult.rows[0]);
      } catch (error) {
        // User node might already exist
        console.log('User node may already exist:', userId);
      }
    }

    // Fetch skills with their domains for enhanced matching
    let skillRequirements = {};
    let synonymMap = {}; // Declare at function scope
    
    if (gaps && gaps.length > 0) {
      const skillIds = gaps.map(g => g.skill_id);
      
      const skillsWithDomains = await db.query(`
        SELECT s.id, s.name_ar, s.name_en, 
               td.id as domain_id,
               td.name_ar as domain_name_ar, 
               td.name_en as domain_name_en
        FROM skills s
        JOIN training_domains td ON s.domain_id = td.id
        WHERE s.id = ANY($1)
      `, [skillIds]);

      // Fetch synonyms for all domains (with error handling if table doesn't exist yet)
      const domainIds = [...new Set(skillsWithDomains.rows.map(s => s.domain_id))].filter(id => id);
      
      if (domainIds.length > 0) {
        try {
          const synonymsResult = await db.query(`
            SELECT domain_id, synonym_ar, synonym_en
            FROM domain_synonyms
            WHERE domain_id = ANY($1)
          `, [domainIds]);

          // Build synonym map: domain_id -> [synonym_ar, synonym_en, ...]
          synonymsResult.rows.forEach(row => {
            if (!synonymMap[row.domain_id]) synonymMap[row.domain_id] = [];
            if (row.synonym_ar) synonymMap[row.domain_id].push(row.synonym_ar);
            if (row.synonym_en) synonymMap[row.domain_id].push(row.synonym_en);
          });
        } catch (synonymError) {
          // If domain_synonyms table doesn't exist yet, continue without synonyms
          console.log('⚠️  Domain synonyms table not found. Run migration: backend/src/db/migrations/add_domain_synonyms.sql');
          // synonymMap remains empty, which is fine - it will just use base domain names
        }
      }

      // Map skill IDs to domain info and calculate required difficulty level
      for (const gap of gaps) {
        const skillInfo = skillsWithDomains.rows.find(s => s.id === gap.skill_id);
        if (skillInfo) {
          const gapScore = gap.gap_score || gap.gap_percentage || 0;
          const proficiency = 100 - gapScore;
          
          // Determine difficulty level based on proficiency:
          // 0-49% proficiency (51-100% gap) = beginner
          // 50-89% proficiency (11-50% gap) = intermediate
          // 90-99% proficiency (1-10% gap) = advanced
          // 100% proficiency (0% gap) = skip (no recommendations needed)
          let difficulty = 'beginner';
          if (proficiency >= 90) {
            difficulty = 'advanced';
          } else if (proficiency >= 50) {
            difficulty = 'intermediate';
          }
          
          // Skip skills with 100% proficiency (0% gap)
          if (gapScore > 0) {
            skillRequirements[gap.skill_id] = {
              domain_id: skillInfo.domain_id,
              domain_ar: skillInfo.domain_name_ar,
              domain_en: skillInfo.domain_name_en,
              gap_score: gapScore,
              difficulty: difficulty,
              proficiency: proficiency
            };
          }
        }
      }
    }

    // Sync user's skill gaps to Neo4j
    if (Object.keys(skillRequirements).length > 0) {
      // First, delete existing NEEDS relationships for this user
      try {
        await neo4jApi.deleteNodeRelationships('User', 'user_id', userId);
      } catch (error) {
        console.log('No existing relationships to delete');
      }

      // Create new NEEDS relationships based on latest gaps
      for (const [skillId, req] of Object.entries(skillRequirements)) {
        try {
          // Ensure skill exists in Neo4j
          const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skillId]);
          if (skillResult.rows.length > 0) {
            try {
              await neo4jApi.createSkillNode(skillResult.rows[0]);
            } catch (err) {
              // Skill might already exist
              console.log('Skill node may already exist:', skillId);
            }

            // Create NEEDS relationship
            await neo4jApi.createUserSkillGap(
              userId,
              skillId,
              req.gap_score,
              gaps.find(g => g.skill_id === skillId)?.priority
            );
          }
        } catch (error) {
          console.error('Error syncing skill gap:', error.message);
        }
      }
    }

    console.log('🎯 Skill Requirements for Recommendations:', JSON.stringify(skillRequirements, null, 2));

    // Get enhanced recommendations from Neo4j graph with domain and difficulty filtering
    let neo4jRecommendations = [];
    if (Object.keys(skillRequirements).length > 0) {
      try {
        neo4jRecommendations = await neo4jApi.getEnhancedRecommendationsForUser(userId, skillRequirements, synonymMap, parseInt(limit));
        console.log('📊 Neo4j Enhanced Query Results:', neo4jRecommendations ? neo4jRecommendations.length : 0, 'courses');
        
        // Fallback to basic query if enhanced returns nothing
        if (!neo4jRecommendations || neo4jRecommendations.length === 0) {
          console.log('⚠️ Enhanced query returned 0 results, trying basic query...');
          neo4jRecommendations = await neo4jApi.getRecommendationsForUser(userId, parseInt(limit));
          console.log('📊 Neo4j Basic Query Results:', neo4jRecommendations ? neo4jRecommendations.length : 0, 'courses');
        }
      } catch (neo4jError) {
        console.error('❌ Neo4j API Error:', neo4jError);
        console.error('Error details:', {
          message: neo4jError.message,
          status: neo4jError.status,
          code: neo4jError.code
        });
        neo4jRecommendations = [];
      }
    }

    // Enrich recommendations with course details from PostgreSQL
    const enrichedRecommendations = [];
    if (neo4jRecommendations && Array.isArray(neo4jRecommendations)) {
      for (const rec of neo4jRecommendations) {
        try {
          const courseResult = await db.query(`
            SELECT c.*,
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
            WHERE c.id = $1
            GROUP BY c.id
          `, [rec.course_id]);

          if (courseResult.rows.length > 0) {
            enrichedRecommendations.push({
              ...courseResult.rows[0],
              recommendation_score: rec.recommendation_score,
              matching_skills: rec.matching_skills,
              max_priority: rec.max_priority,
              source: 'neo4j'
            });
          }
        } catch (error) {
          console.error('Error enriching recommendation:', error.message);
        }
      }
    }
    
    console.log('✅ Enriched Recommendations:', enrichedRecommendations.length);

    res.json({
      recommendations: enrichedRecommendations,
      total: enrichedRecommendations.length,
      analyzed_at: analyzedAt,
      source: 'neo4j',
      user_id: userId,
      filtering_criteria: Object.entries(skillRequirements).map(([skillId, req]) => ({
        skill_id: skillId,
        domain: req.domain_ar,
        proficiency: `${req.proficiency}%`,
        gap_score: `${req.gap_score}%`,
        recommended_difficulty: req.difficulty
      }))
    });
  } catch (error) {
    console.error('Get Neo4j recommendations error:', error);
    res.status(500).json({ 
      error: 'Failed to get recommendations',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get my recommendations (for employee) - Enhanced with Neo4j option
router.get('/my', authenticate, async (req, res) => {
  try {
    const { status, source = 'traditional' } = req.query;
    
    // If requesting Neo4j recommendations, redirect to Neo4j endpoint
    if (source === 'neo4j') {
      return res.redirect(307, `/api/recommendations/neo4j/${req.user.id}`);
    }
    
    let query = `
      SELECT tr.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color
      FROM training_recommendations tr
      LEFT JOIN skills s ON tr.skill_id = s.id
      LEFT JOIN training_domains td ON s.domain_id = td.id
      WHERE tr.user_id = $1
    `;
    const params = [req.user.id];
    
    if (status) {
      query += ' AND tr.status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY tr.priority, tr.created_at DESC';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get my recommendations error:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Get single recommendation
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT tr.*,
             u.name_ar as user_name_ar,
             u.name_en as user_name_en,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en
      FROM training_recommendations tr
      JOIN users u ON tr.user_id = u.id
      LEFT JOIN skills s ON tr.skill_id = s.id
      LEFT JOIN training_domains td ON s.domain_id = td.id
      WHERE tr.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    // Check authorization
    if (req.user.role === 'employee' && result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get recommendation error:', error);
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
});

// Update recommendation status
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['recommended', 'enrolled', 'in_progress', 'completed', 'skipped'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Verify ownership for employees
    if (req.user.role === 'employee') {
      const check = await db.query('SELECT user_id FROM training_recommendations WHERE id = $1', [req.params.id]);
      if (check.rows.length === 0 || check.rows[0].user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const result = await db.query(`
      UPDATE training_recommendations
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update recommendation status error:', error);
    res.status(500).json({ error: 'Failed to update recommendation' });
  }
});

// Add manual recommendation (training officer)
router.post('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const {
      user_id, skill_id, course_title_ar, course_title_en,
      course_description_ar, course_description_en, course_url,
      provider, duration_hours, difficulty_level, priority
    } = req.body;
    
    const result = await db.query(`
      INSERT INTO training_recommendations (
        user_id, skill_id, course_title_ar, course_title_en,
        course_description_ar, course_description_en, course_url,
        provider, duration_hours, difficulty_level, priority, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual')
      RETURNING *
    `, [
      user_id, skill_id, course_title_ar, course_title_en,
      course_description_ar, course_description_en, course_url,
      provider, duration_hours, difficulty_level, priority || 1
    ]);
    
    // Create notification for employee
    await db.query(`
      INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link)
      VALUES ($1, 'recommendation_new', 'توصية تدريبية جديدة', 'New Training Recommendation',
              $2, $3, '/my-recommendations')
    `, [
      user_id,
      `تمت إضافة توصية تدريبية جديدة: ${course_title_ar}`,
      `A new training recommendation has been added: ${course_title_en}`
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create recommendation error:', error);
    res.status(500).json({ error: 'Failed to create recommendation' });
  }
});

// Delete recommendation
router.delete('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM training_recommendations WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    res.json({ message: 'Recommendation deleted successfully' });
  } catch (error) {
    console.error('Delete recommendation error:', error);
    res.status(500).json({ error: 'Failed to delete recommendation' });
  }
});

// Get recommendations summary by skill
router.get('/summary/by-skill', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.id as skill_id,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        COUNT(tr.id) as total_recommendations,
        COUNT(CASE WHEN tr.status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN tr.status = 'in_progress' THEN 1 END) as in_progress_count
      FROM skills s
      LEFT JOIN training_recommendations tr ON s.id = tr.skill_id
      LEFT JOIN training_domains td ON s.domain_id = td.id
      GROUP BY s.id, s.name_ar, s.name_en, td.name_ar, td.name_en
      HAVING COUNT(tr.id) > 0
      ORDER BY total_recommendations DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get recommendations summary error:', error);
    res.status(500).json({ error: 'Failed to get recommendations summary' });
  }
});

module.exports = router;

