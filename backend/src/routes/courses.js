const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, query, param, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');
const neo4jApi = require('../services/neo4jApi');
const contentApi = require('../services/contentApi');
const courseEnricher = require('../services/courseEnricher');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// FutureX URL transformation constants and helper
const FUTUREX_BASE_URL = 'https://futurex.nelc.gov.sa/ar/course';

/**
 * Transform course URL to FutureX platform URL format
 * @param {Object} course - Course object with url, nelc_course_id, or course_id
 * @returns {string} FutureX URL or original URL as fallback
 */
function toFuturexUrl(course) {
  // If nelc_course_id exists, use it directly (highest priority)
  if (course.nelc_course_id) {
    return `${FUTUREX_BASE_URL}/${course.nelc_course_id}`;
  }
  
  // Try to extract course ID from existing URL (e.g., futurex URLs)
  const url = course.url || course.course_url || '';
  const match = url.match(/\/course\/(\d+)/);
  if (match) {
    return `${FUTUREX_BASE_URL}/${match[1]}`;
  }
  
  // If course has a course_id and it looks like a numeric NELC ID, use it
  if (course.course_id && /^\d+$/.test(String(course.course_id))) {
    return `${FUTUREX_BASE_URL}/${course.course_id}`;
  }
  
  // Try to extract from id field as well
  if (course.id && /^\d+$/.test(String(course.id))) {
    return `${FUTUREX_BASE_URL}/${course.id}`;
  }
  
  // Return original URL as fallback (courses without NELC/FutureX equivalent)
  return url || '';
}

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

/**
 * GET /api/courses/neo4j/debug-schema
 * TEMPORARY: Debug endpoint to see all Course node properties in Neo4j
 * NOTE: This endpoint does NOT require authentication (for debugging only)
 */
router.get('/neo4j/debug-schema', async (req, res) => {
  try {
    // Query to get all properties of a sample Course node
    const courseQuery = `
      MATCH (c:Course)
      WITH c, keys(c) as allKeys
      RETURN allKeys as course_properties, c as sample_course
      LIMIT 1
    `;
    
    // Query to get Skill node properties
    const skillQuery = `
      MATCH (s:Skill)
      WITH s, keys(s) as allKeys
      RETURN allKeys as skill_properties, s as sample_skill
      LIMIT 1
    `;
    
    // Query to explore Course-Skill relationship
    const relationshipQuery = `
      MATCH (c:Course)-[r]->(s:Skill)
      RETURN type(r) as relationship_type, keys(r) as relationship_properties, r as sample_relationship
      LIMIT 1
    `;
    
    // Query to get a course with its skills
    const courseWithSkillsQuery = `
      MATCH (c:Course)-[r]->(s:Skill)
      WITH c, collect({
        skill: s,
        relationship: r,
        rel_type: type(r)
      }) as skills
      RETURN c.course_id as course_id, c.course_name as course_name, skills
      LIMIT 1
    `;
    
    // Count queries
    const countQuery = `
      MATCH (c:Course) WITH count(c) as courses
      MATCH (s:Skill) WITH courses, count(s) as skills
      MATCH ()-[r]->(:Skill) WITH courses, skills, count(r) as relationships
      RETURN courses, skills, relationships
    `;
    
    const [courseResult, skillResult, relResult, courseWithSkills, counts] = await Promise.all([
      neo4jApi.makeRequest('POST', '/query', { data: { query: courseQuery } }),
      neo4jApi.makeRequest('POST', '/query', { data: { query: skillQuery } }),
      neo4jApi.makeRequest('POST', '/query', { data: { query: relationshipQuery } }),
      neo4jApi.makeRequest('POST', '/query', { data: { query: courseWithSkillsQuery } }),
      neo4jApi.makeRequest('POST', '/query', { data: { query: countQuery } })
    ]);
    
    res.json({
      message: 'Neo4j Schema Debug Info - Courses, Skills & Relationships',
      counts: {
        courses: counts?.courses || counts?.[0]?.courses || 0,
        skills: counts?.skills || counts?.[0]?.skills || 0,
        relationships: counts?.relationships || counts?.[0]?.relationships || 0
      },
      courseNode: {
        properties: Array.isArray(courseResult) ? courseResult[0]?.course_properties : courseResult?.course_properties,
        sample: Array.isArray(courseResult) ? courseResult[0]?.sample_course : courseResult?.sample_course
      },
      skillNode: {
        properties: Array.isArray(skillResult) ? skillResult[0]?.skill_properties : skillResult?.skill_properties,
        sample: Array.isArray(skillResult) ? skillResult[0]?.sample_skill : skillResult?.sample_skill
      },
      relationship: {
        type: Array.isArray(relResult) ? relResult[0]?.relationship_type : relResult?.relationship_type,
        properties: Array.isArray(relResult) ? relResult[0]?.relationship_properties : relResult?.relationship_properties,
        sample: Array.isArray(relResult) ? relResult[0]?.sample_relationship : relResult?.sample_relationship
      },
      courseWithSkills: Array.isArray(courseWithSkills) ? courseWithSkills[0] : courseWithSkills
    });
  } catch (error) {
    console.error('Debug schema error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to get schema debug info',
      message: error.message
    });
  }
});

// All routes below require authentication
router.use(authenticate);

/**
 * GET /api/courses/nelc
 * Fetch courses from NELC's built-in Content API (rh-contents)
 * This returns courses from the national e-learning catalog
 */
router.get('/nelc',
  [
    query('page').optional().isInt({ min: 1 }),
    query('name').optional().isString(),
    query('levels').optional(),
    query('skills').optional(),
    query('occupation_domains').optional(),
    query('content_types').optional(),
    query('estimated_hours').optional()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        page = 1,
        name,
        levels,
        skills,
        occupation_domains,
        content_types,
        estimated_hours
      } = req.query;

      // Build filters for Content API
      const filters = { page: parseInt(page) };
      
      if (name) filters.name = name;
      
      // Parse array parameters (they come as comma-separated strings)
      if (levels) {
        filters.levels = Array.isArray(levels) ? levels : levels.split(',');
      }
      if (skills) {
        filters.skills = Array.isArray(skills) ? skills : skills.split(',');
      }
      if (occupation_domains) {
        filters.occupation_domains = Array.isArray(occupation_domains) 
          ? occupation_domains 
          : occupation_domains.split(',');
      }
      if (content_types) {
        filters.content_types = Array.isArray(content_types) 
          ? content_types 
          : content_types.split(',');
      }
      if (estimated_hours) {
        filters.estimated_hours = Array.isArray(estimated_hours) 
          ? estimated_hours 
          : estimated_hours.split(',');
      }

      console.log('📚 Fetching NELC courses with filters:', filters);

      // Fetch from Content API
      const response = await contentApi.listContents(filters, 'ar');
      
      // Transform response to match our course format
      // The Content API returns data in a specific format
      let courses = [];
      let total = 0;
      
      if (Array.isArray(response)) {
        courses = response;
        total = response.length;
      } else if (response && response.data) {
        courses = response.data;
        total = response.total || response.data.length;
      } else if (response && response.contents) {
        courses = response.contents;
        total = response.total || response.contents.length;
      }

      // Map NELC content format to our course format
      const mappedCourses = courses.map(content => {
        const contentId = content.id || content.content_id;
        const rawUrl = content.url || content.link || '';
        
        return {
          id: contentId,
          name_ar: content.name || content.title || content.name_ar,
          name_en: content.name_en || content.title_en || '',
          description_ar: content.description || content.description_ar || '',
          description_en: content.description_en || '',
          url: toFuturexUrl({ url: rawUrl, course_id: contentId, nelc_course_id: contentId }),
          provider: content.entity || content.provider || 'NELC',
          duration_hours: content.estimated_hours || content.duration_hours || null,
          difficulty_level: mapNelcLevel(content.level || content.difficulty_level),
          language: content.translation || content.language || 'ar',
          subject: content.occupation_domain || content.subject || '',
          skills: content.skills || [],
          content_type: content.content_type || 'course',
          source: 'nelc', // Mark as NELC course
          // Additional NELC-specific fields
          nelc_id: content.id || content.content_id,
          image_url: content.image_url || content.thumbnail || null,
          rating: content.rating || null,
          reviews_count: content.reviews_count || null
        };
      });

      console.log(`✅ Found ${mappedCourses.length} NELC courses`);

      res.json({
        courses: mappedCourses,
        pagination: {
          page: parseInt(page),
          total: total,
          hasMore: mappedCourses.length >= 20 // Assume more pages if we got full page
        },
        source: 'nelc'
      });
    } catch (error) {
      console.error('❌ Fetch NELC courses error:', error);
      
      // Check if credentials are missing (most common issue)
      const isMissingCredentials = 
        error.message?.includes('RH_CONTENTS_CLIENT_ID') ||
        error.message?.includes('RH_CONTENTS_CLIENT_SECRET') ||
        error.code === 'CONFIG_ERROR';
      
      if (isMissingCredentials) {
        return res.status(503).json({
          error: 'خدمة NELC غير مُعدّة',
          message: 'يرجى تكوين بيانات اعتماد Content API في ملف .env',
          code: 'CONFIG_ERROR',
          hint: 'Set RH_CONTENTS_CLIENT_ID and RH_CONTENTS_CLIENT_SECRET in .env file'
        });
      }
      
      if (error.code === 'AUTH_ERROR') {
        return res.status(401).json({
          error: 'فشل في المصادقة مع خدمة المحتوى',
          message: error.message,
          code: error.code
        });
      }
      
      if (error.code === 'SERVICE_UNAVAILABLE') {
        return res.status(503).json({
          error: 'خدمة NELC غير متاحة حالياً',
          message: 'يرجى المحاولة لاحقاً',
          code: error.code
        });
      }
      
      res.status(error.status || 500).json({
        error: 'فشل في تحميل دورات NELC',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }
);

/**
 * GET /api/courses/nelc/range-hours
 * Get available hour ranges for filtering NELC courses
 */
router.get('/nelc/range-hours', async (req, res) => {
  try {
    const rangeHours = await contentApi.getRangeHours('ar');
    res.json(rangeHours);
  } catch (error) {
    console.error('Get range hours error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to get range hours',
      message: error.message
    });
  }
});

/**
 * GET /api/courses/neo4j
 * Search and list courses from Neo4j graph database
 * This searches the actual Neo4j database for Course nodes
 */
router.get('/neo4j',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('difficulty_level').optional().isString(), // Allow any value from database
    query('language').optional().isString(),
    query('subject').optional().isString(),
    query('provider').optional().isString(),
    query('university').optional().isString(),
    query('domain').optional().isString(),
    query('skill').optional().isString()
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
        search,
        difficulty_level,
        language,
        subject,
        provider,
        university,
        domain,
        skill
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      console.log('🔍 Searching Neo4j courses with filters:', {
        search, difficulty_level, language, subject, provider, university, domain, skill,
        page, limit, skip
      });

      // Search courses in Neo4j
      const result = await neo4jApi.searchCourses(
        { search, difficulty_level, language, subject, provider, university, domain, skill },
        skip,
        parseInt(limit)
      );

      // Get enrichment data from PostgreSQL for these courses
      // Convert to strings for consistent comparison with PostgreSQL VARCHAR
      const courseIds = result.courses.map(c => String(c.course_id)).filter(Boolean);
      let enrichmentMap = {};
      
      if (courseIds.length > 0) {
        try {
          const enrichmentResult = await db.query(
            `SELECT * FROM course_enrichments WHERE course_id = ANY($1)`,
            [courseIds]
          );
          enrichmentResult.rows.forEach(e => {
            enrichmentMap[e.course_id] = e;
          });
        } catch (e) {
          console.log('Note: course_enrichments table may not exist yet');
        }
      }

      // Get local overrides from PostgreSQL for these courses
      let overridesMap = {};
      let skillOverridesMap = {};
      let visibleCoursesSet = new Set();
      const isAdminOrOfficer = req.user?.role === 'admin' || req.user?.role === 'training_officer';
      
      if (courseIds.length > 0) {
        try {
          const overridesResult = await db.query(
            `SELECT course_id, overrides FROM course_overrides WHERE course_id = ANY($1)`,
            [courseIds]
          );
          overridesResult.rows.forEach(o => {
            overridesMap[o.course_id] = typeof o.overrides === 'string' ? JSON.parse(o.overrides) : o.overrides;
          });
        } catch (e) {
          console.log('Note: course_overrides table may not exist yet');
        }

        // Get skill overrides
        try {
          const skillOverridesResult = await db.query(
            `SELECT course_id, skill_name, action FROM course_skill_overrides WHERE course_id = ANY($1)`,
            [courseIds]
          );
          skillOverridesResult.rows.forEach(so => {
            if (!skillOverridesMap[so.course_id]) {
              skillOverridesMap[so.course_id] = { add: [], remove: [] };
            }
            if (so.action === 'add') {
              skillOverridesMap[so.course_id].add.push(so.skill_name);
            } else if (so.action === 'remove') {
              skillOverridesMap[so.course_id].remove.push(so.skill_name);
            }
          });
        } catch (e) {
          console.log('Note: course_skill_overrides table may not exist yet');
        }

        // Get visible courses (whitelist - courses visible to employees)
        try {
          const visibleResult = await db.query(
            `SELECT course_id FROM visible_courses WHERE course_id = ANY($1)`,
            [courseIds]
          );
          visibleResult.rows.forEach(v => {
            visibleCoursesSet.add(v.course_id);
          });
        } catch (e) {
          console.log('Note: visible_courses table may not exist yet');
        }
      }
      
      // Get nelc_course_id from local courses table for FutureX URL transformation
      let nelcIdMap = {};
      if (courseIds.length > 0) {
        try {
          const nelcResult = await db.query(
            `SELECT id, nelc_course_id FROM courses WHERE id = ANY($1) AND nelc_course_id IS NOT NULL`,
            [courseIds]
          );
          nelcResult.rows.forEach(c => {
            nelcIdMap[c.id] = c.nelc_course_id;
          });
          console.log(`📎 Found ${nelcResult.rows.length} courses with nelc_course_id in local DB`);
        } catch (e) {
          console.log('Note: courses table query for nelc_course_id failed:', e.message);
        }
      }

      // Map the results to our standard course format
      const mappedCourses = result.courses.map(course => {
        // Get enrichment from PostgreSQL
        const enrichment = enrichmentMap[course.course_id];
        // Get local overrides
        const overrides = overridesMap[course.course_id] || {};
        // Get skill overrides
        const skillOverrides = skillOverridesMap[course.course_id] || { add: [], remove: [] };
        // Get NELC course ID from local database for FutureX URL
        const nelcCourseId = nelcIdMap[course.course_id];
        
        // Apply skill overrides
        let skills = (course.skills || []).filter(s => s && s.name_ar);
        // Remove skills marked for removal
        skills = skills.filter(s => !skillOverrides.remove.includes(s.name_ar) && !skillOverrides.remove.includes(s.name_en));
        // Add skills marked for addition
        skillOverrides.add.forEach(skillName => {
          if (!skills.some(s => s.name_ar === skillName || s.name_en === skillName)) {
            skills.push({ name_ar: skillName, name_en: skillName });
          }
        });
        
        // Handle domains - support both array and single subject
        let courseDomains = overrides.domains || [];
        if (courseDomains.length === 0 && (overrides.subject || course.subject)) {
          courseDomains = [overrides.subject || course.subject];
        }
        
        // Build the raw URL first, then transform to FutureX format
        const rawUrl = overrides.url || course.url || '';
        
        // Get name values with fallback chain
        const nameAr = overrides.name_ar || course.name_ar || '';
        const nameEn = overrides.name_en || course.name_en || '';
        const descAr = overrides.description_ar || course.description_ar || '';
        const descEn = overrides.description_en || course.description_en || '';
        
        // Generate a fallback name from course_id if no name exists
        // This handles NELC placeholder courses that only have IDs
        let fallbackName = '';
        let generatedUrl = '';
        if (!nameAr && !nameEn) {
          const courseIdStr = String(course.course_id || '');
          // Check if this is a numeric NELC course ID
          if (/^\d+$/.test(courseIdStr)) {
            fallbackName = `دورة NELC رقم ${courseIdStr}`;
            // Generate FutureX URL if missing
            if (!course.url) {
              generatedUrl = `${FUTUREX_BASE_URL}/${courseIdStr}`;
            }
          } else {
            // For UUID-style IDs, try to extract from URL
            const courseIdFromUrl = course.url?.match(/\/course\/(\d+)/)?.[1];
            fallbackName = courseIdFromUrl 
              ? `دورة NELC رقم ${courseIdFromUrl}` 
              : `Course ${courseIdStr.substring(0, 8) || 'Unknown'}`;
          }
        }
        
        return {
          id: course.course_id,
          // Provide fallback to English if Arabic is empty, then to generated name
          name_ar: nameAr || nameEn || fallbackName,
          name_en: nameEn || nameAr || fallbackName,
          description_ar: descAr || descEn,
          description_en: descEn || descAr,
          url: generatedUrl || toFuturexUrl({ url: rawUrl, course_id: course.course_id, nelc_course_id: nelcCourseId }),
          platform: course.platform || overrides.provider || course.provider || '', // Platform from Neo4j ON_PLATFORM relationship
          provider: overrides.provider || course.provider || '', // Keep for backward compatibility
          duration_hours: overrides.duration_hours || course.duration_hours || null,
          difficulty_level: overrides.difficulty_level || course.difficulty_level || 'beginner',
          language: overrides.language || course.language || 'ar',
          subject: overrides.subject || course.subject || '',
          domains: courseDomains,
          subtitle: course.subtitle || '',
          university: overrides.university || course.university || '',
          price: course.price || null,
          skills: skills,
          source: 'neo4j',
          is_visible: visibleCoursesSet.has(String(course.course_id)),
          has_local_overrides: Object.keys(overrides).length > 0 || skillOverrides.add.length > 0 || skillOverrides.remove.length > 0,
          // AI-enriched fields from PostgreSQL
          extracted_skills: enrichment?.extracted_skills || [],
          learning_outcomes: enrichment?.learning_outcomes || [],
          target_audience: enrichment?.target_audience || null,
          career_paths: enrichment?.career_paths || [],
          industry_tags: enrichment?.industry_tags || [],
          summary_ar: enrichment?.summary_ar || '',
          summary_en: enrichment?.summary_en || '',
          quality_indicators: enrichment?.quality_indicators || null,
          is_enriched: !!enrichment,
          enriched_at: enrichment?.enriched_at || null
        };
      });

      // For employees, filter to only show visible courses (whitelist approach)
      // Admins and training officers see all courses, but visible courses first
      let finalCourses = mappedCourses;
      let finalTotal = result.total;
      
      if (!isAdminOrOfficer) {
        // Employees only see visible courses
        finalCourses = mappedCourses.filter(c => c.is_visible);
        finalTotal = finalCourses.length;
        console.log(`👁️ Employee view: filtered to ${finalCourses.length} visible courses`);
      } else {
        // Admins/Training Officers: sort to show visible (non-hidden) courses first
        finalCourses = mappedCourses.sort((a, b) => {
          // Visible courses first (is_visible: true comes before false)
          if (a.is_visible && !b.is_visible) return -1;
          if (!a.is_visible && b.is_visible) return 1;
          return 0; // Maintain original order for same visibility status
        });
        console.log(`👁️ Admin view: sorted ${finalCourses.length} courses (visible first)`);
      }

      console.log(`✅ Found ${finalCourses.length} courses in Neo4j (total: ${finalTotal})`);

      res.json({
        courses: finalCourses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: finalTotal,
          totalPages: Math.ceil(finalTotal / parseInt(limit))
        },
        source: 'neo4j'
      });
    } catch (error) {
      console.error('❌ Search Neo4j courses error:', error);

      // Check if credentials are missing
      const isMissingCredentials = 
        error.message?.includes('NEO4J_CLIENT_ID') ||
        error.message?.includes('NEO4J_CLIENT_SECRET') ||
        error.code === 'CONFIG_ERROR';

      if (isMissingCredentials) {
        return res.status(503).json({
          error: 'خدمة Neo4j غير مُعدّة',
          message: 'يرجى تكوين بيانات اعتماد Neo4j API في ملف .env',
          code: 'CONFIG_ERROR',
          hint: 'Set NEO4J_CLIENT_ID and NEO4J_CLIENT_SECRET in .env file'
        });
      }

      if (error.code === 'SERVICE_UNAVAILABLE') {
        return res.status(503).json({
          error: 'خدمة Neo4j غير متاحة حالياً',
          message: 'يرجى المحاولة لاحقاً',
          code: error.code
        });
      }

      res.status(error.status || 500).json({
        error: 'فشل في البحث عن دورات Neo4j',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }
);

/**
 * GET /api/courses/neo4j/filters
 * Get available filter options for Neo4j courses (dropdown values)
 */
router.get('/neo4j/filters', async (req, res) => {
  try {
    const filters = await neo4jApi.getCourseFilterOptions();
    res.json(filters);
  } catch (error) {
    console.error('Get Neo4j filter options error:', error);
    
    // Check if credentials are missing
    const isMissingCredentials = 
      error.message?.includes('NEO4J_CLIENT_ID') ||
      error.message?.includes('NEO4J_CLIENT_SECRET') ||
      error.code === 'CONFIG_ERROR';

    if (isMissingCredentials) {
      return res.status(503).json({
        error: 'خدمة Neo4j غير مُعدّة',
        code: 'CONFIG_ERROR'
      });
    }

    res.status(error.status || 500).json({
      error: 'Failed to get filter options',
      message: error.message
    });
  }
});

/**
 * GET /api/courses/neo4j/skills
 * Get all available skills from Neo4j for dropdown selection
 */
router.get('/neo4j/skills', async (req, res) => {
  try {
    const skills = await neo4jApi.getAllSkills();
    res.json(skills);
  } catch (error) {
    console.error('Get Neo4j skills error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to get skills',
      message: error.message
    });
  }
});

/**
 * GET /api/courses/neo4j/:courseId
 * Get a single course from Neo4j by ID
 */
router.get('/neo4j/:courseId',
  async (req, res) => {
    try {
      const { courseId } = req.params;
      
      const course = await neo4jApi.getCourseById(courseId);
      
      if (!course) {
        return res.status(404).json({ error: 'Course not found in Neo4j' });
      }
      
      // Transform URL to FutureX format
      res.json({
        ...course,
        url: toFuturexUrl({ url: course.url, course_id: course.course_id })
      });
    } catch (error) {
      console.error('Get Neo4j course error:', error);
      res.status(error.status || 500).json({
        error: 'Failed to get course',
        message: error.message
      });
    }
  }
);

/**
 * PATCH /api/courses/neo4j/:courseId
 * Update course metadata in Neo4j (admin only)
 * NOTE: Neo4j NELC API is READ-ONLY. This endpoint now stores overrides in PostgreSQL.
 */
router.patch('/neo4j/:courseId',
  isTrainingOfficer,
  [
    body('subject').optional().isString(),
    body('domains').optional().isArray({ max: 2 }),
    body('domains.*').optional().isString(),
    body('difficulty_level').optional().isString(),
    body('name_ar').optional().isString(),
    body('name_en').optional().isString(),
    body('description_ar').optional().isString(),
    body('description_en').optional().isString(),
    body('provider').optional().isString(),
    body('university').optional().isString(),
    body('duration_hours').optional().isFloat({ min: 0 }),
    body('language').optional().isString(),
    body('url').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { courseId } = req.params;
      const updates = req.body;

      // Remove empty fields
      const cleanUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && value !== '') {
          cleanUpdates[key] = value;
        }
      }

      if (Object.keys(cleanUpdates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      console.log(`📝 Admin updating Neo4j course (storing in PostgreSQL): ${courseId}`, cleanUpdates);

      // Neo4j API is READ-ONLY, so we store overrides in PostgreSQL instead
      // First, check if course_overrides table exists, create if not
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS course_overrides (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            course_id VARCHAR(255) NOT NULL UNIQUE,
            overrides JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch (tableError) {
        console.log('Table may already exist:', tableError.message);
      }

      // Upsert the override
      const result = await db.query(`
        INSERT INTO course_overrides (course_id, overrides, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (course_id) DO UPDATE SET
          overrides = course_overrides.overrides || $2,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [courseId, JSON.stringify(cleanUpdates)]);

      console.log(`✅ Course overrides saved to PostgreSQL for: ${courseId}`);

      res.json({
        success: true,
        message: 'تم حفظ التعديلات محلياً (قاعدة بيانات Neo4j للقراءة فقط)',
        course_id: courseId,
        updated_fields: Object.keys(cleanUpdates),
        stored_locally: true,
        override: result.rows[0]
      });
    } catch (error) {
      console.error('Update Neo4j course error:', error);
      res.status(error.status || 500).json({
        error: 'Failed to update course',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/courses/neo4j/:courseId
 * Delete a course - handles both Neo4j courses (hide) and locally-added courses (delete from PostgreSQL)
 * Admin only
 */
router.delete('/neo4j/:courseId',
  isTrainingOfficer,
  async (req, res) => {
    try {
      const { courseId } = req.params;

      console.log(`🗑️ Admin deleting course: ${courseId}`);

      // Helper function to check if a string is a valid UUID
      const isValidUUID = (str) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
      };

      // Only check PostgreSQL if courseId is a valid UUID (locally added courses use UUIDs)
      if (isValidUUID(courseId)) {
        // Check if course exists in PostgreSQL (locally added course)
        const pgCourse = await db.query('SELECT * FROM courses WHERE id = $1', [courseId]);
        
        if (pgCourse.rows.length > 0) {
          // This is a locally-added course - delete from PostgreSQL
          console.log(`📝 Course found in PostgreSQL, deleting locally...`);
          
          // Delete course skills first
          await db.query('DELETE FROM course_skills WHERE course_id = $1', [courseId]);
          
          // Delete the course
          await db.query('DELETE FROM courses WHERE id = $1', [courseId]);
          
          // Also clean up any enrichments/overrides
          try {
            await db.query('DELETE FROM course_enrichments WHERE course_id = $1', [courseId]);
            await db.query('DELETE FROM course_overrides WHERE course_id = $1', [courseId]);
            await db.query('DELETE FROM course_skill_overrides WHERE course_id = $1', [courseId]);
            await db.query('DELETE FROM visible_courses WHERE course_id = $1', [courseId]);
          } catch (cleanupError) {
            console.log('Note: Some cleanup tables may not exist:', cleanupError.message);
          }

          return res.json({
            success: true,
            message: 'تم حذف الدورة بنجاح',
            course_id: courseId,
            course_name: pgCourse.rows[0].name_ar,
            deleted_from: 'postgresql'
          });
        }
      } else {
        console.log(`📌 Non-UUID course ID detected (Neo4j course): ${courseId}`);
      }

      // Check if course exists in Neo4j
      let neo4jCourse = null;
      try {
        neo4jCourse = await neo4jApi.getCourseById(courseId);
      } catch (neo4jError) {
        console.log('Note: Could not check Neo4j:', neo4jError.message);
      }

      if (!neo4jCourse) {
        return res.status(404).json({ error: 'الدورة غير موجودة' });
      }

      // Neo4j is READ-ONLY - we cannot delete courses from it
      // Instead, we'll hide the course by removing it from visible_courses and adding to a hidden list
      console.log(`⚠️ Neo4j is read-only. Hiding course instead of deleting: ${courseId}`);
      
      // Remove from visible courses if it was visible
      try {
        await db.query('DELETE FROM visible_courses WHERE course_id = $1', [courseId]);
      } catch (e) {
        console.log('Note: visible_courses table may not exist');
      }

      // Clean up any local data associated with this course
      try {
        await db.query('DELETE FROM course_enrichments WHERE course_id = $1', [courseId]);
        await db.query('DELETE FROM course_overrides WHERE course_id = $1', [courseId]);
        await db.query('DELETE FROM course_skill_overrides WHERE course_id = $1', [courseId]);
      } catch (cleanupError) {
        console.log('Note: Some cleanup failed:', cleanupError.message);
      }

      res.json({
        success: true,
        message: 'تم إخفاء الدورة بنجاح (دورات Neo4j للقراءة فقط)',
        course_id: courseId,
        course_name: neo4jCourse.name_ar,
        hidden: true,
        note: 'دورات كتالوج Neo4j لا يمكن حذفها نهائياً، تم إخفاؤها من قائمة الدورات المتاحة'
      });
    } catch (error) {
      console.error('Delete course error:', error);
      res.status(error.status || 500).json({
        error: 'فشل في حذف الدورة',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/courses/neo4j/:courseId/skills
 * Add a skill relationship to a course (admin only)
 * NOTE: Neo4j is READ-ONLY. Skill changes are stored locally in PostgreSQL.
 */
router.post('/neo4j/:courseId/skills',
  isTrainingOfficer,
  [
    body('skill_name').notEmpty().withMessage('Skill name is required'),
    body('relevance_score').optional().isFloat({ min: 0, max: 1 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { courseId } = req.params;
      const { skill_name, relevance_score = 0.8 } = req.body;

      console.log(`➕ Admin adding skill to course (storing locally): ${courseId} -> ${skill_name}`);

      // Neo4j is READ-ONLY, store skill changes in PostgreSQL
      // Ensure table exists
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS course_skill_overrides (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            course_id VARCHAR(255) NOT NULL,
            skill_name VARCHAR(255) NOT NULL,
            action VARCHAR(20) NOT NULL DEFAULT 'add',
            relevance_score FLOAT DEFAULT 0.8,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(course_id, skill_name)
          )
        `);
      } catch (tableError) {
        console.log('Table may already exist');
      }

      // Insert or update skill override (add)
      await db.query(`
        INSERT INTO course_skill_overrides (course_id, skill_name, action, relevance_score)
        VALUES ($1, $2, 'add', $3)
        ON CONFLICT (course_id, skill_name) DO UPDATE SET
          action = 'add',
          relevance_score = $3,
          created_at = CURRENT_TIMESTAMP
      `, [courseId, skill_name, relevance_score]);

      console.log(`✅ Skill override saved locally: ${courseId} -> ${skill_name}`);

      res.json({
        success: true,
        message: 'تمت إضافة المهارة محلياً',
        course_id: courseId,
        skill_name: skill_name,
        stored_locally: true
      });
    } catch (error) {
      console.error('Add skill to course error:', error);
      res.status(error.status || 500).json({
        error: 'Failed to add skill to course',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/courses/neo4j/:courseId/skills/:skillName
 * Remove a skill relationship from a course (admin only)
 * NOTE: Neo4j is READ-ONLY. Skill changes are stored locally in PostgreSQL.
 */
router.delete('/neo4j/:courseId/skills/:skillName',
  isTrainingOfficer,
  async (req, res) => {
    try {
      const { courseId, skillName } = req.params;
      const decodedSkillName = decodeURIComponent(skillName);

      console.log(`🗑️ Admin removing skill from course (storing locally): ${courseId} -> ${decodedSkillName}`);

      // Neo4j is READ-ONLY, store skill removal in PostgreSQL
      // Ensure table exists
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS course_skill_overrides (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            course_id VARCHAR(255) NOT NULL,
            skill_name VARCHAR(255) NOT NULL,
            action VARCHAR(20) NOT NULL DEFAULT 'add',
            relevance_score FLOAT DEFAULT 0.8,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(course_id, skill_name)
          )
        `);
      } catch (tableError) {
        console.log('Table may already exist');
      }

      // Insert or update skill override (remove)
      await db.query(`
        INSERT INTO course_skill_overrides (course_id, skill_name, action)
        VALUES ($1, $2, 'remove')
        ON CONFLICT (course_id, skill_name) DO UPDATE SET
          action = 'remove',
          created_at = CURRENT_TIMESTAMP
      `, [courseId, decodedSkillName]);

      console.log(`✅ Skill removal saved locally: ${courseId} -> ${decodedSkillName}`);

      res.json({
        success: true,
        message: 'تمت إزالة المهارة محلياً',
        course_id: courseId,
        skill_name: decodedSkillName,
        stored_locally: true
      });
    } catch (error) {
      console.error('Remove skill from course error:', error);
      res.status(error.status || 500).json({
        error: 'Failed to remove skill from course',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/courses/neo4j/:courseId/toggle-visibility
 * Toggle course visibility for employees (whitelist approach)
 * Courses are hidden by default - add to visible_courses to make visible
 * Admin only
 */
router.post('/neo4j/:courseId/toggle-hidden',
  isTrainingOfficer,
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const { visible } = req.body; // Optional: explicitly set visibility status

      console.log(`👁️ Admin toggling course visibility: ${courseId}`);

      // Ensure visible_courses table exists (whitelist of courses visible to employees)
      await db.query(`
        CREATE TABLE IF NOT EXISTS visible_courses (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          course_id VARCHAR(255) NOT NULL UNIQUE,
          made_visible_by UUID,
          visible_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Check current visibility status
      const existingResult = await db.query(
        'SELECT * FROM visible_courses WHERE course_id = $1',
        [courseId]
      );
      
      const isCurrentlyVisible = existingResult.rows.length > 0;
      const shouldMakeVisible = visible !== undefined ? visible : !isCurrentlyVisible;

      if (shouldMakeVisible && !isCurrentlyVisible) {
        // Make course visible to employees (add to whitelist)
        await db.query(
          'INSERT INTO visible_courses (course_id, made_visible_by) VALUES ($1, $2)',
          [courseId, req.user?.id]
        );
        console.log(`👁️ Course made visible to employees: ${courseId}`);
        
        res.json({
          success: true,
          message: 'تم إظهار الدورة للموظفين',
          course_id: courseId,
          visible: true
        });
      } else if (!shouldMakeVisible && isCurrentlyVisible) {
        // Hide course from employees (remove from whitelist)
        await db.query(
          'DELETE FROM visible_courses WHERE course_id = $1',
          [courseId]
        );
        console.log(`🙈 Course hidden from employees: ${courseId}`);
        
        res.json({
          success: true,
          message: 'تم إخفاء الدورة عن الموظفين',
          course_id: courseId,
          visible: false
        });
      } else {
        res.json({
          success: true,
          message: shouldMakeVisible ? 'الدورة ظاهرة للموظفين بالفعل' : 'الدورة مخفية عن الموظفين بالفعل',
          course_id: courseId,
          visible: shouldMakeVisible
        });
      }
    } catch (error) {
      console.error('Toggle course visibility error:', error);
      res.status(error.status || 500).json({
        error: 'Failed to toggle course visibility',
        message: error.message
      });
    }
  }
);

/**
 * Helper function to map NELC level to our difficulty format
 */
function mapNelcLevel(level) {
  if (!level) return 'beginner';
  
  const levelLower = level.toLowerCase();
  if (levelLower.includes('beginner') || levelLower.includes('مبتدئ') || levelLower === '1') {
    return 'beginner';
  }
  if (levelLower.includes('intermediate') || levelLower.includes('متوسط') || levelLower === '2') {
    return 'intermediate';
  }
  if (levelLower.includes('advanced') || levelLower.includes('متقدم') || levelLower === '3') {
    return 'advanced';
  }
  return 'beginner';
}

/**
 * POST /api/courses/upload-csv
 * Bulk upload courses from CSV file with progress tracking
 */
router.post('/upload-csv', 
  isTrainingOfficer, 
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
 * Supports both skill_ids (UUIDs) and skill_tags (skill names as strings)
 */
router.post('/', 
  isTrainingOfficer,
  [
    body('name_ar').notEmpty().withMessage('Arabic name is required'),
    body('url').optional({ nullable: true }),
    body('duration_hours').optional({ nullable: true }).isFloat({ min: 0 }),
    body('price').optional({ nullable: true }).isFloat({ min: 0 }),
    body('rating').optional({ nullable: true }).isFloat({ min: 0, max: 5 }),
    body('skill_ids').optional().isArray(),
    body('skill_tags').optional().isArray() // Support skill names as strings
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

      console.log('📝 Creating new course:', { name_ar, subject, skill_tags });

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
        name_ar, name_en || null, description_ar || null, description_en || null, 
        url || null, provider || null, duration_hours || null, difficulty_level || null,
        language || 'ar', subject || null, subtitle || null, university || null, skill_tags || null
      ]);

      const course = courseResult.rows[0];
      const linkedSkillIds = [];

      // Link to skills by UUID (skill_ids)
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
            linkedSkillIds.push(skill_id);
          }
        }
      }

      // Link to skills by name (skill_tags) - lookup by name_ar or name_en
      if (skill_tags && skill_tags.length > 0) {
        for (const skillName of skill_tags) {
          if (!skillName || !skillName.trim()) continue;
          
          // Find skill by name (try both Arabic and English)
          const skillResult = await db.query(`
            SELECT * FROM skills 
            WHERE name_ar ILIKE $1 OR name_en ILIKE $1
            LIMIT 1
          `, [skillName.trim()]);
          
          if (skillResult.rows.length > 0) {
            const skill = skillResult.rows[0];
            // Avoid duplicate links
            if (!linkedSkillIds.includes(skill.id)) {
              const relevanceScore = calculateRelevanceScore(course, skill);
              await db.query(`
                INSERT INTO course_skills (course_id, skill_id, relevance_score)
                VALUES ($1, $2, $3)
                ON CONFLICT (course_id, skill_id) DO NOTHING
              `, [course.id, skill.id, relevanceScore]);
              linkedSkillIds.push(skill.id);
              console.log(`✅ Linked skill by name: ${skillName} -> ${skill.id}`);
            }
          } else {
            console.log(`⚠️ Skill not found by name: ${skillName} (will be stored in skill_tags)`);
          }
        }
      }

      // Sync to Neo4j
      try {
        await neo4jApi.createCourseNode(course);

        // Create skill relationships in Neo4j with calculated relevance
        if (linkedSkillIds.length > 0) {
          for (const skill_id of linkedSkillIds) {
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
        console.log(`✅ Course created and synced to Neo4j: ${course.id}`);
      } catch (neo4jError) {
        console.error('Neo4j sync error:', neo4jError);
        // Course is created but not synced
      }

      // Mark as locally added course
      course.source = 'local';
      course.is_local = true;

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

      // Transform URLs to FutureX format and add platform field
      const coursesWithFuturexUrls = result.rows.map(course => ({
        ...course,
        url: toFuturexUrl({ url: course.url, nelc_course_id: course.nelc_course_id, course_id: course.id }),
        platform: course.provider || '' // Use provider as platform for local courses
      }));

      res.json({
        courses: coursesWithFuturexUrls,
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

      // Transform URL to FutureX format
      const course = result.rows[0];
      res.json({
        ...course,
        url: toFuturexUrl({ url: course.url, nelc_course_id: course.nelc_course_id, course_id: course.id })
      });
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
  isTrainingOfficer,
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
  isTrainingOfficer,
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
  isTrainingOfficer,
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

/**
 * POST /api/courses/enrich/:courseId
 * Enrich a single course from Neo4j with AI-extracted metadata
 * Stores enrichment in PostgreSQL (since Neo4j is read-only)
 */
router.post('/enrich/:courseId',
  isTrainingOfficer,
  async (req, res) => {
    try {
      const { courseId } = req.params;
      
      console.log(`🤖 Starting AI enrichment for course: ${courseId}`);
      
      // Fetch course from Neo4j
      const query = `
        MATCH (c:Course {course_id: '${courseId}'})
        RETURN c.course_id as course_id, c.name_ar as name_ar, c.name_en as name_en,
               c.description_ar as description_ar, c.description_en as description_en,
               c.subject as subject, c.provider as provider, c.difficulty_level as difficulty_level,
               c.duration_hours as duration_hours
      `;
      
      const courseData = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
      
      if (!courseData || (Array.isArray(courseData) && courseData.length === 0)) {
        return res.status(404).json({ error: 'Course not found in Neo4j' });
      }
      
      const course = Array.isArray(courseData) ? courseData[0] : courseData;
      
      // Enrich with AI
      const enrichedData = await courseEnricher.enrichCourse(course);
      
      // Store enrichment in PostgreSQL (Neo4j is read-only)
      const upsertResult = await db.query(`
        INSERT INTO course_enrichments (
          course_id, extracted_skills, prerequisite_skills, learning_outcomes,
          target_audience, career_paths, industry_tags, topics,
          difficulty_assessment, quality_indicators, keywords_ar, keywords_en,
          summary_ar, summary_en, enrichment_version, course_name_ar, course_name_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (course_id) DO UPDATE SET
          extracted_skills = $2,
          prerequisite_skills = $3,
          learning_outcomes = $4,
          target_audience = $5,
          career_paths = $6,
          industry_tags = $7,
          topics = $8,
          difficulty_assessment = $9,
          quality_indicators = $10,
          keywords_ar = $11,
          keywords_en = $12,
          summary_ar = $13,
          summary_en = $14,
          enrichment_version = $15,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [
        courseId,
        JSON.stringify(enrichedData.extracted_skills || []),
        JSON.stringify(enrichedData.prerequisite_skills || []),
        JSON.stringify(enrichedData.learning_outcomes || []),
        JSON.stringify(enrichedData.target_audience || {}),
        JSON.stringify(enrichedData.career_paths || []),
        JSON.stringify(enrichedData.industry_tags || []),
        JSON.stringify(enrichedData.topics || []),
        JSON.stringify(enrichedData.difficulty_assessment || {}),
        JSON.stringify(enrichedData.quality_indicators || {}),
        JSON.stringify(enrichedData.keywords_ar || []),
        JSON.stringify(enrichedData.keywords_en || []),
        enrichedData.summary_ar || '',
        enrichedData.summary_en || '',
        enrichedData.enrichment_version || '1.0',
        course.name_ar || '',
        course.name_en || ''
      ]);
      
      console.log(`✅ Course enriched and saved to PostgreSQL: ${courseId}`);
      
      // Also save suggested domains to course_overrides for immediate use
      if (enrichedData.suggested_domains && enrichedData.suggested_domains.length > 0) {
        try {
          await db.query(`
            CREATE TABLE IF NOT EXISTS course_overrides (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              course_id VARCHAR(255) NOT NULL UNIQUE,
              overrides JSONB NOT NULL DEFAULT '{}',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          const domainsOverride = {
            domains: enrichedData.suggested_domains,
            subject: enrichedData.suggested_domains[0] || course.subject
          };
          
          await db.query(`
            INSERT INTO course_overrides (course_id, overrides, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (course_id) DO UPDATE SET
              overrides = course_overrides.overrides || $2,
              updated_at = CURRENT_TIMESTAMP
          `, [courseId, JSON.stringify(domainsOverride)]);
          
          console.log(`✅ Domains saved to course_overrides: ${enrichedData.suggested_domains.join(', ')}`);
        } catch (domainError) {
          console.log('Note: Could not save domains to overrides:', domainError.message);
        }
      }
      
      res.json({
        success: true,
        course_id: courseId,
        enrichment: enrichedData,
        stored_in: 'postgresql'
      });
    } catch (error) {
      console.error('❌ Course enrichment error:', error);
      
      if (error.message?.includes('OPENAI_API_KEY')) {
        return res.status(503).json({
          error: 'OpenAI API not configured',
          message: 'Please set OPENAI_API_KEY in environment variables',
          code: 'CONFIG_ERROR'
        });
      }
      
      res.status(500).json({
        error: 'Failed to enrich course',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/courses/enrich-batch
 * Enrich multiple courses from Neo4j with AI
 * Supports pagination and rate limiting
 */
router.post('/enrich-batch',
  isTrainingOfficer,
  [
    body('skip').optional().isInt({ min: 0 }),
    body('limit').optional().isInt({ min: 1, max: 50 }),
    body('filter').optional().isObject()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { skip = 0, limit = 10, filter = {} } = req.body;
      
      console.log(`🤖 Starting batch enrichment: skip=${skip}, limit=${limit}`);
      
      // Build filter conditions
      const conditions = [];
      if (filter.difficulty_level) {
        conditions.push(`c.difficulty_level = '${filter.difficulty_level}'`);
      }
      if (filter.provider) {
        conditions.push(`c.provider CONTAINS '${filter.provider}'`);
      }
      if (filter.subject) {
        conditions.push(`c.subject CONTAINS '${filter.subject}'`);
      }
      // Only enrich courses that haven't been enriched yet
      if (filter.not_enriched) {
        conditions.push(`c.enriched_at IS NULL`);
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Fetch courses from Neo4j
      const query = `
        MATCH (c:Course)
        ${whereClause}
        RETURN c.course_id as course_id, c.name_ar as name_ar, c.name_en as name_en,
               c.description_ar as description_ar, c.description_en as description_en,
               c.subject as subject, c.provider as provider, c.difficulty_level as difficulty_level,
               c.duration_hours as duration_hours
        ORDER BY c.name_ar
        SKIP ${skip}
        LIMIT ${limit}
      `;
      
      const courses = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
      
      if (!courses || courses.length === 0) {
        return res.json({
          success: true,
          message: 'No courses to enrich',
          processed: 0
        });
      }
      
      console.log(`📚 Found ${courses.length} courses to enrich`);
      
      // Enrich batch with progress tracking
      const results = await courseEnricher.enrichBatch(courses, {
        batchSize: 3,
        delayBetweenBatches: 1500,
        onProgress: (progress) => {
          console.log(`⏳ Progress: ${progress.percent}% (${progress.processed}/${progress.total})`);
        }
      });
      
      // Update Neo4j with enriched data
      let neo4jUpdated = 0;
      for (const enriched of results.enriched) {
        try {
          await neo4jApi.updateCourseEnrichment(enriched.course_id, enriched);
          neo4jUpdated++;
        } catch (err) {
          console.error(`Failed to update Neo4j for course ${enriched.course_id}:`, err.message);
        }
      }
      
      console.log(`✅ Batch enrichment complete: ${results.success} success, ${results.failed} failed`);
      
      res.json({
        success: true,
        total: results.total,
        enriched: results.success,
        failed: results.failed,
        neo4j_updated: neo4jUpdated,
        errors: results.errors.slice(0, 10), // Limit errors in response
        sample_enrichment: results.enriched[0] || null
      });
    } catch (error) {
      console.error('❌ Batch enrichment error:', error);
      
      if (error.message?.includes('OPENAI_API_KEY')) {
        return res.status(503).json({
          error: 'OpenAI API not configured',
          message: 'Please set OPENAI_API_KEY in environment variables',
          code: 'CONFIG_ERROR'
        });
      }
      
      res.status(500).json({
        error: 'Failed to enrich courses',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/courses/extract-skills/:courseId
 * Quick skill extraction for a single course (lighter than full enrichment)
 */
router.post('/extract-skills/:courseId',
  isTrainingOfficer,
  async (req, res) => {
    try {
      const { courseId } = req.params;
      
      console.log(`🔍 Extracting skills for course: ${courseId}`);
      
      // Fetch course from Neo4j
      const query = `
        MATCH (c:Course {course_id: '${courseId}'})
        RETURN c.course_id as course_id, c.name_ar as name_ar, c.name_en as name_en,
               c.description_ar as description_ar, c.description_en as description_en,
               c.subject as subject
      `;
      
      const courseData = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
      
      if (!courseData || (Array.isArray(courseData) && courseData.length === 0)) {
        return res.status(404).json({ error: 'Course not found in Neo4j' });
      }
      
      const course = Array.isArray(courseData) ? courseData[0] : courseData;
      
      // Extract skills only (quick operation)
      const skills = await courseEnricher.extractSkillsOnly(course);
      
      console.log(`✅ Extracted ${skills.length} skills for course: ${courseId}`);
      
      res.json({
        success: true,
        course_id: courseId,
        course_name: course.name_ar || course.name_en,
        extracted_skills: skills
      });
    } catch (error) {
      console.error('❌ Skill extraction error:', error);
      res.status(500).json({
        error: 'Failed to extract skills',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/courses/enrichment-stats
 * Get statistics about enrichment progress
 */
router.get('/enrichment-stats',
  isTrainingOfficer,
  async (req, res) => {
    try {
      // Count total courses from Neo4j
      const totalQuery = `MATCH (c:Course) RETURN count(c) as total`;
      const totalResult = await neo4jApi.makeRequest('POST', '/query', { data: { query: totalQuery } });
      
      // Count enriched courses from PostgreSQL
      const enrichedResult = await db.query('SELECT COUNT(*) as count FROM course_enrichments');
      
      // Count courses with extracted skills from PostgreSQL
      const withSkillsResult = await db.query(
        "SELECT COUNT(*) as count FROM course_enrichments WHERE extracted_skills IS NOT NULL AND extracted_skills != '[]'::jsonb"
      );
      
      const total = totalResult?.total || totalResult?.[0]?.total || 0;
      const enriched = parseInt(enrichedResult.rows[0]?.count || 0);
      const withSkills = parseInt(withSkillsResult.rows[0]?.count || 0);
      
      res.json({
        total_courses: total,
        enriched_courses: enriched,
        courses_with_extracted_skills: withSkills,
        enrichment_percentage: total > 0 ? Math.round((enriched / total) * 100) : 0,
        remaining: total - enriched
      });
    } catch (error) {
      console.error('❌ Get enrichment stats error:', error);
      res.status(500).json({
        error: 'Failed to get enrichment stats',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/courses/neo4j/:courseId/enrichment
 * Get enrichment data for a specific course
 */
router.get('/neo4j/:courseId/enrichment',
  async (req, res) => {
    try {
      const { courseId } = req.params;
      
      const query = `
        MATCH (c:Course {course_id: '${courseId}'})
        RETURN c.course_id as course_id,
               c.extracted_skills as extracted_skills,
               c.prerequisite_skills as prerequisite_skills,
               c.learning_outcomes as learning_outcomes,
               c.target_audience as target_audience,
               c.career_paths as career_paths,
               c.industry_tags as industry_tags,
               c.topics as topics,
               c.difficulty_assessment as difficulty_assessment,
               c.quality_indicators as quality_indicators,
               c.keywords_ar as keywords_ar,
               c.keywords_en as keywords_en,
               c.summary_ar as summary_ar,
               c.summary_en as summary_en,
               c.enriched_at as enriched_at,
               c.enrichment_version as enrichment_version
      `;
      
      const result = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
      
      if (!result || (Array.isArray(result) && result.length === 0)) {
        return res.status(404).json({ error: 'Course not found' });
      }
      
      const enrichment = Array.isArray(result) ? result[0] : result;
      
      res.json({
        course_id: courseId,
        is_enriched: !!enrichment.enriched_at,
        enrichment: enrichment
      });
    } catch (error) {
      console.error('Get course enrichment error:', error);
      res.status(500).json({
        error: 'Failed to get course enrichment',
        message: error.message
      });
    }
  }
);

module.exports = router;
