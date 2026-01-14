const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');
const neo4jApi = require('../services/neo4jApi');
const { categorizeByTestResult, generateRecommendationReason, getValidDifficultyLevels } = require('../services/userCategorizer');
const { fetchCourseEnrichment, calculateRecommendationScore, getSkillBasedRecommendations, generateTestBasedRecommendations } = require('../services/recommendationEngine');
const { sendCourseCompletedEmail } = require('../services/emailService');
const { updateUserBadges } = require('../services/badgeService');

const router = express.Router();

// FutureX URL transformation constants and helper
const FUTUREX_BASE_URL = 'https://futurex.nelc.gov.sa/ar/course';

/**
 * Transform course URL to FutureX platform URL format
 * @param {Object} course - Course object with url, nelc_course_id, or course_id
 * @returns {string} FutureX URL or original URL as fallback
 */
function toFuturexUrl(course) {
  // If nelc_course_id exists, use it directly
  if (course.nelc_course_id) {
    return `${FUTUREX_BASE_URL}/${course.nelc_course_id}`;
  }
  
  // Try to extract course ID from existing URL
  const url = course.url || course.course_url || '';
  const match = url.match(/\/course\/(\d+)/);
  if (match) {
    return `${FUTUREX_BASE_URL}/${match[1]}`;
  }
  
  // If course has a course_id and it looks like a numeric NELC ID, use it
  if (course.course_id && /^\d+$/.test(String(course.course_id))) {
    return `${FUTUREX_BASE_URL}/${course.course_id}`;
  }
  
  // Return original URL as fallback
  return url;
}

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
    // Generate unique filename: userId_timestamp_originalname
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
    // Accept PDF and image files
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp',
    ];
    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    const ext = path.extname(file.originalname).toLowerCase().slice(1);

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع ملف PDF أو صورة (JPG, PNG)'), false);
    }
  },
});

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

// Get all recommendations organized in sections (test results, interests, career aspirations)
// OPTIMIZED: Batch queries, parallel Neo4j calls, parallel DB queries
router.get('/neo4j/:userId/sections', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    const parsedLimit = parseInt(limit);

    // Check authorization
    if (req.user.role === 'employee' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // ============ PHASE 1: Parallel fetch of user data and initial queries ============
    // Run independent queries in parallel
    const [userProfileResult, gapsResult, hiddenCoursesResults, adminCoursesResult, certificatesResult] = await Promise.all([
      // User profile with interests and desired domains
      db.query(`
        SELECT u.id, u.name_ar, u.national_id,
               COALESCE(u.interests, '[]'::jsonb) as interests, 
               COALESCE(u.desired_domains, '[]'::jsonb) as desired_domains,
               u.years_of_experience, u.specialization_ar, u.nelc_last_sync_at
        FROM users u
        WHERE u.id = $1
      `, [userId]).catch(() => ({ rows: [] })),
      
      // User's latest skill gaps from analysis_results
      db.query(`
        SELECT ar.gaps, ar.analyzed_at, ar.overall_score, ar.test_id,
               t.title_ar as test_title_ar, t.title_en as test_title_en,
               td.name_ar as domain_name_ar, td.name_en as domain_name_en
        FROM analysis_results ar
        JOIN tests t ON ar.test_id = t.id
        LEFT JOIN training_domains td ON t.domain_id = td.id
        WHERE ar.user_id = $1 
        ORDER BY ar.analyzed_at DESC 
        LIMIT 1
      `, [userId]),
      
      // Visible courses (whitelist - courses allowed for employees) and user-hidden recommendations
      Promise.all([
        db.query('SELECT course_id FROM user_hidden_recommendations WHERE user_id = $1', [userId]).catch(() => ({ rows: [] })),
        db.query('SELECT course_id FROM visible_courses').catch(() => ({ rows: [] }))
      ]),
      
      // Admin-added custom courses
      db.query(`
        SELECT acr.*, u.name_ar as added_by_name
        FROM admin_course_recommendations acr
        LEFT JOIN users u ON acr.added_by = u.id
        WHERE acr.user_id = $1
        ORDER BY acr.created_at DESC
      `, [userId]).catch(() => ({ rows: [] })),
      
      // User certificates
      db.query(`
        SELECT ccc.*, 
               c.name_ar as cert_course_name_ar,
               acr.course_name_ar as cert_admin_course_name_ar
        FROM course_completion_certificates ccc
        LEFT JOIN courses c ON ccc.course_id = c.id
        LEFT JOIN admin_course_recommendations acr ON ccc.admin_course_id = acr.id
        WHERE ccc.user_id = $1
      `, [userId]).catch(() => ({ rows: [] }))
    ]);

    // Process user profile
    let user = { id: userId, interests: [], desired_domains: [], national_id: null };
    if (userProfileResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    user = userProfileResult.rows[0];

    const interests = user.interests || [];
    const desiredDomainIds = user.desired_domains || [];

    // Process visibility: visible_courses is a WHITELIST of courses allowed for employees
    // user_hidden_recommendations is courses the user has personally hidden
    const [userHiddenResult, visibleCoursesResult] = hiddenCoursesResults;
    const userHiddenCourseIds = new Set(userHiddenResult.rows.map(h => h.course_id));
    const visibleCourseIds = new Set(visibleCoursesResult.rows.map(v => v.course_id));

    // Process certificates into maps for quick lookup
    const courseCertificateMap = new Map();
    const adminCourseCertificateMap = new Map();
    certificatesResult.rows.forEach(cert => {
      if (cert.course_id) courseCertificateMap.set(cert.course_id, cert);
      if (cert.admin_course_id) adminCourseCertificateMap.set(cert.admin_course_id, cert);
    });

    // Process admin courses
    const adminAddedCourses = adminCoursesResult.rows.map(course => ({
      id: course.id,
      course_id: course.id,
      name_ar: course.course_name_ar,
      name_en: course.course_name_en,
      url: toFuturexUrl({ url: course.course_url, course_url: course.course_url }),
      source: 'admin_added',
      section: 'admin_added',
      added_by_name: course.added_by_name,
      created_at: course.created_at
    }));

    // ============ PHASE 2: Build skill requirements and fetch domains in parallel ============
    let userCategory = null;
    let examContext = null;
    let skillRequirements = {};
    let desiredDomains = [];

    const phase2Promises = [];

    // Fetch desired domains if needed
    if (desiredDomainIds.length > 0) {
      phase2Promises.push(
        db.query(`
          SELECT id, name_ar, name_en, description_ar, color
          FROM training_domains
          WHERE id = ANY($1)
        `, [desiredDomainIds]).then(result => {
          desiredDomains = result.rows;
        })
      );
    }

    // Build skill requirements if gaps exist
    if (gapsResult.rows.length > 0) {
      const analysisData = gapsResult.rows[0];
      const gaps = analysisData.gaps || [];
      const overallScore = analysisData.overall_score || 0;

      userCategory = categorizeByTestResult(overallScore);
      examContext = {
        test_id: analysisData.test_id,
        test_title_ar: analysisData.test_title_ar,
        test_title_en: analysisData.test_title_en,
        domain_name_ar: analysisData.domain_name_ar,
        domain_name_en: analysisData.domain_name_en,
        analyzed_at: analysisData.analyzed_at
      };

      if (gaps && gaps.length > 0) {
        const skillIds = gaps.map(g => g.skill_id);
        phase2Promises.push(
          db.query(`
            SELECT s.id, s.name_ar, s.name_en, 
                   td.id as domain_id,
                   td.name_ar as domain_name_ar, 
                   td.name_en as domain_name_en
            FROM skills s
            JOIN training_domains td ON s.domain_id = td.id
            WHERE s.id = ANY($1)
          `, [skillIds]).then(result => {
            for (const gap of gaps) {
              const skillInfo = result.rows.find(s => s.id === gap.skill_id);
              if (skillInfo) {
                const gapScore = gap.gap_score || gap.gap_percentage || 0;
                const proficiency = 100 - gapScore;
                
                // Aligned with PROFICIENCY_LEVELS in userCategorizer.js
                // Advanced: >= 70%, Intermediate: 40-69%, Beginner: 0-39%
                let difficulty = 'beginner';
                if (proficiency >= 70) difficulty = 'advanced';
                else if (proficiency >= 40) difficulty = 'intermediate';
                
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
          })
        );
      }
    }

    await Promise.all(phase2Promises);

    // ============ PHASE 2.5: Sync user's skill gaps to Neo4j (required for graph queries) ============
    if (Object.keys(skillRequirements).length > 0) {
      try {
        // Delete existing NEEDS relationships for this user
        await neo4jApi.deleteNodeRelationships('User', 'user_id', userId);
      } catch (error) {
        console.log('No existing relationships to delete');
      }

      // Create new NEEDS relationships based on latest gaps
      const gapsData = gapsResult.rows[0]?.gaps || [];
      for (const [skillId, req] of Object.entries(skillRequirements)) {
        try {
          await neo4jApi.createUserSkillGap(
            userId,
            skillId,
            req.gap_score,
            gapsData.find(g => g.skill_id === skillId)?.priority || 1
          );
        } catch (error) {
          console.log(`Error syncing skill gap ${skillId}:`, error.message);
        }
      }
      console.log(`✅ Synced ${Object.keys(skillRequirements).length} skill gaps to Neo4j for user ${userId}`);
    }

    // ============ PHASE 3: Get recommendations using skill-based matching ============
    // For test-based recommendations, use skill + level matching (NOT Neo4j graph relationships)
    // For interests and career, still use Neo4j content-based queries (no graph traversal)
    
    // Build priority gaps array with full skill info for skill-based matching
    const priorityGaps = [];
    if (gapsResult.rows.length > 0) {
      const gapsData = gapsResult.rows[0]?.gaps || [];
      const skillIds = gapsData.map(g => g.skill_id);
      
      if (skillIds.length > 0) {
        const skillsInfo = await db.query(`
          SELECT s.id, s.name_ar, s.name_en, s.domain_id,
                 td.name_ar as domain_name_ar, td.name_en as domain_name_en
          FROM skills s
          LEFT JOIN training_domains td ON s.domain_id = td.id
          WHERE s.id = ANY($1)
        `, [skillIds]);
        
        for (const gap of gapsData) {
          const skillInfo = skillsInfo.rows.find(s => s.id === gap.skill_id);
          if (skillInfo) {
            priorityGaps.push({
              skill_id: gap.skill_id,
              skill_name_ar: skillInfo.name_ar,
              skill_name_en: skillInfo.name_en,
              domain_id: skillInfo.domain_id,
              domain_name_ar: skillInfo.domain_name_ar,
              domain_name_en: skillInfo.domain_name_en,
              gap_score: gap.gap_score || gap.gap_percentage || 0,
              priority: gap.priority || 1
            });
          }
        }
      }
    }
    
    const [testRecs, interestRecs, careerRecs] = await Promise.all([
      // Test-based recommendations using SKILL + LEVEL matching (NOT Neo4j graph)
      // This directly matches skills from PostgreSQL course_skills + AI-extracted skills
      // Pass null for userCategoryKey when no exam data - shows all levels with beginner/intermediate priority
      priorityGaps.length > 0
        ? getSkillBasedRecommendations(
            priorityGaps,
            userCategory?.key || null,  // null = no level, show all difficulties
            parsedLimit * 2  // Get more for better filtering
          ).catch(err => {
            console.error('Skill-based recommendations error:', err);
            return [];
          })
        : Promise.resolve([]),
      
      // Interest-based recommendations (content matching, not graph traversal)
      interests && interests.length > 0
        ? neo4jApi.getRecommendationsByInterests(interests, parsedLimit)
            .catch(err => {
              console.error('Interest recommendations error:', err);
              return [];
            })
        : Promise.resolve([]),
      
      // Career-based recommendations (content matching, not graph traversal)
      desiredDomains && desiredDomains.length > 0
        ? neo4jApi.getRecommendationsByDomains(desiredDomainIds, desiredDomains, parsedLimit)
            .catch(err => {
              console.error('Career recommendations error:', err);
              return [];
            })
        : Promise.resolve([])
    ]);

    // ============ PHASE 4: Process skill-based test recommendations ============
    // Test recommendations now come directly from PostgreSQL with full course details
    // We only need to fetch course details for interest and career recommendations from Neo4j
    
    const neo4jOnlyRecs = [
      ...(interestRecs || []).map(r => ({ ...r, source: 'interests', section: 'learning_favorites' })),
      ...(careerRecs || []).map(r => ({ ...r, source: 'career_aspirations', section: 'future_path' }))
    ];
    
    const neo4jCourseIds = [...new Set(neo4jOnlyRecs.map(r => r.course_id).filter(Boolean))];
    
    // Batch fetch courses for Neo4j recommendations only
    let courseMap = new Map();
    if (neo4jCourseIds.length > 0) {
      const coursesResult = await db.query(`
        SELECT c.*, json_agg(
          json_build_object('id', s.id, 'name_ar', s.name_ar, 'name_en', s.name_en)
        ) FILTER (WHERE s.id IS NOT NULL) as skills
        FROM courses c
        LEFT JOIN course_skills cs ON c.id = cs.course_id
        LEFT JOIN skills s ON cs.skill_id = s.id
        WHERE c.id = ANY($1)
        GROUP BY c.id
      `, [neo4jCourseIds]);
      
      courseMap = new Map(coursesResult.rows.map(c => [c.id, c]));
    }

    // ============ PHASE 5: Build enriched recommendations ============
    // For Neo4j recommendations (interests/career)
    const enrichNeo4jRecommendation = (rec, source, section) => {
      const course = courseMap.get(rec.course_id);
      if (!course) return null;
      
      // Parse JSON strings from Neo4j if they exist
      let extractedSkills = [];
      let learningOutcomes = [];
      try {
        if (rec.extracted_skills) {
          extractedSkills = typeof rec.extracted_skills === 'string' 
            ? JSON.parse(rec.extracted_skills) 
            : rec.extracted_skills;
        }
        if (rec.learning_outcomes) {
          learningOutcomes = typeof rec.learning_outcomes === 'string' 
            ? JSON.parse(rec.learning_outcomes) 
            : rec.learning_outcomes;
        }
      } catch (e) {
        console.log('Error parsing Neo4j enrichment data:', e.message);
      }
      
      return {
        ...course,
        course_id: course.id,
        url: toFuturexUrl(course),
        recommendation_score: rec.recommendation_score || (rec.skill_coverage ? rec.skill_coverage * 10 : 0),
        matching_skills: rec.matching_skills,
        source: source,
        section: section,
        extracted_skills: extractedSkills,
        learning_outcomes: learningOutcomes,
        summary_ar: rec.summary_ar || null,
        summary_en: rec.summary_en || null,
        first_domain: rec.subject || course.subject || null,
        second_domain: course.university || null
      };
    };

    // For skill-based test recommendations (already have full course details from PostgreSQL)
    const enrichTestRecommendation = (rec) => {
      return {
        ...rec,
        course_id: rec.course_id,
        url: toFuturexUrl(rec),
        source: 'test_results',
        section: 'learning_map',
        extracted_skills: rec.enrichment?.extracted_skills || rec.ai_extracted_skills || [],
        learning_outcomes: rec.enrichment?.learning_outcomes || [],
        summary_ar: rec.enrichment?.summary_ar || null,
        summary_en: rec.enrichment?.summary_en || null,
        first_domain: rec.subject || null,
        second_domain: rec.university || null,
        // Include score breakdown for transparency
        score_breakdown: rec.score_breakdown || null
      };
    };

    // Build section arrays
    // Test recommendations come from skill-based PostgreSQL query (NOT Neo4j graph)
    let testBasedRecommendations = (testRecs || [])
      .map(rec => enrichTestRecommendation(rec))
      .filter(Boolean)
      .slice(0, parsedLimit);
    
    // Interest and career recommendations still use Neo4j content-based queries
    let interestBasedRecommendations = (interestRecs || [])
      .map(rec => enrichNeo4jRecommendation(rec, 'interests', 'learning_favorites'))
      .filter(Boolean);
    
    let careerBasedRecommendations = (careerRecs || [])
      .map(rec => enrichNeo4jRecommendation(rec, 'career_aspirations', 'future_path'))
      .filter(Boolean);

    // ============ PHASE 6: Remove duplicates and hidden courses ============
    const testCourseIds = new Set(testBasedRecommendations.map(r => r.course_id));
    const interestCourseIds = new Set(interestBasedRecommendations.map(r => r.course_id));
    
    interestBasedRecommendations = interestBasedRecommendations.filter(r => !testCourseIds.has(r.course_id));
    careerBasedRecommendations = careerBasedRecommendations.filter(r => 
      !testCourseIds.has(r.course_id) && !interestCourseIds.has(r.course_id)
    );

    // Filter recommendations:
    // 1. Only show courses in the visible_courses whitelist (if whitelist exists)
    // 2. Exclude courses the user has personally hidden
    const filterRecommendations = (recs) => {
      return recs.filter(r => {
        // Exclude user-hidden courses
        if (userHiddenCourseIds.has(r.course_id)) return false;
        // Only include if in visible_courses whitelist (or whitelist is empty for backwards compat)
        if (visibleCourseIds.size > 0 && !visibleCourseIds.has(r.course_id)) return false;
        return true;
      });
    };
    
    testBasedRecommendations = filterRecommendations(testBasedRecommendations);
    interestBasedRecommendations = filterRecommendations(interestBasedRecommendations);
    careerBasedRecommendations = filterRecommendations(careerBasedRecommendations);

    // ============ PHASE 7: Add completion info to all recommendations ============
    const addCompletionInfo = (recommendations, isAdminCourse = false) => {
      return recommendations.map(rec => {
        const certificate = isAdminCourse 
          ? adminCourseCertificateMap.get(rec.id)
          : courseCertificateMap.get(rec.course_id);
        
        return {
          ...rec,
          is_completed: !!certificate,
          completion_certificate: certificate ? {
            id: certificate.id,
            original_filename: certificate.original_filename,
            completed_at: certificate.completed_at,
            certificate_path: certificate.certificate_path,
            completion_source: certificate.completion_source,
            nelc_progress_percentage: certificate.nelc_progress_percentage
          } : null
        };
      });
    };

    testBasedRecommendations = addCompletionInfo(testBasedRecommendations);
    interestBasedRecommendations = addCompletionInfo(interestBasedRecommendations);
    careerBasedRecommendations = addCompletionInfo(careerBasedRecommendations);
    const enrichedAdminCourses = addCompletionInfo(adminAddedCourses, true);

    // ============ PHASE 7.5: Mark and prioritize locally added courses ============
    // Fetch all locally added course IDs from PostgreSQL
    const allRecCourseIds = [
      ...testBasedRecommendations.map(r => r.course_id),
      ...interestBasedRecommendations.map(r => r.course_id),
      ...careerBasedRecommendations.map(r => r.course_id)
    ].filter(Boolean);

    let localCourseIds = new Set();
    if (allRecCourseIds.length > 0) {
      try {
        const localCoursesResult = await db.query(
          'SELECT id FROM courses WHERE id = ANY($1)',
          [allRecCourseIds]
        );
        localCourseIds = new Set(localCoursesResult.rows.map(c => c.id));
      } catch (e) {
        console.log('Error fetching local course IDs:', e.message);
      }
    }

    // Helper to mark local courses and sort them to top
    const markAndSortLocalCourses = (recommendations) => {
      return recommendations
        .map(rec => ({
          ...rec,
          is_local: localCourseIds.has(rec.course_id),
          source: localCourseIds.has(rec.course_id) ? 'local' : rec.source
        }))
        .sort((a, b) => {
          // Local courses first
          if (a.is_local && !b.is_local) return -1;
          if (!a.is_local && b.is_local) return 1;
          // Then by recommendation score (if available)
          return (b.recommendation_score || 0) - (a.recommendation_score || 0);
        });
    };

    testBasedRecommendations = markAndSortLocalCourses(testBasedRecommendations);
    interestBasedRecommendations = markAndSortLocalCourses(interestBasedRecommendations);
    careerBasedRecommendations = markAndSortLocalCourses(careerBasedRecommendations);

    // ============ PHASE 8: Fetch NELC/FutureX data in parallel (for combined response) ============
    let nelcStatus = null;
    let futurexCourses = null;
    
    // Collect all course IDs for NELC matching
    const allRecommendedCourseIds = [
      ...testBasedRecommendations.map(r => r.course_id),
      ...interestBasedRecommendations.map(r => r.course_id),
      ...careerBasedRecommendations.map(r => r.course_id)
    ].filter(Boolean);
    
    // Build a course map from all recommendations for NELC matching
    const allCoursesMap = new Map();
    [...testBasedRecommendations, ...interestBasedRecommendations, ...careerBasedRecommendations].forEach(rec => {
      if (rec.course_id) {
        allCoursesMap.set(rec.course_id, rec);
      }
    });
    
    if (user.national_id) {
      try {
        const [nelcStatusResult, futurexCoursesResult] = await Promise.all([
          neo4jApi.checkNelcApiStatus().catch(() => ({ configured: false, connected: false })),
          neo4jApi.getNelcUserCourses(user.national_id).catch(() => [])
        ]);
        
        nelcStatus = {
          ...nelcStatusResult,
          has_national_id: true,
          last_sync: user.nelc_last_sync_at
        };
        
        if (futurexCoursesResult && futurexCoursesResult.length > 0) {
          futurexCourses = {
            total: futurexCoursesResult.length,
            completed_in_nelc: futurexCoursesResult.filter(c => c.status === 'Completed').length,
            courses: futurexCoursesResult.map(course => ({
              nelc_course: {
                id: course.course_id,
                name: course.course_name,
                url: course.course_url,
                status: course.status,
                actions: course.actions
              },
              has_match: allRecommendedCourseIds.some(id => {
                const localCourse = allCoursesMap.get(id) || courseMap.get(id);
                return localCourse && (
                  localCourse.nelc_course_id === String(course.course_id) ||
                  (localCourse.name_ar && course.course_name && 
                   localCourse.name_ar.toLowerCase().includes(course.course_name.toLowerCase().substring(0, 20)))
                );
              })
            }))
          };
          futurexCourses.matched = futurexCourses.courses.filter(c => c.has_match).length;
          futurexCourses.unmatched = futurexCourses.courses.filter(c => !c.has_match).length;
        }
      } catch (nelcError) {
        console.log('NELC data fetch error (non-critical):', nelcError.message);
      }
    } else {
      nelcStatus = {
        configured: false,
        connected: false,
        has_national_id: false,
        message: 'يرجى إضافة رقم الهوية الوطنية في الإعدادات لمزامنة الدورات من NELC.'
      };
    }

    // ============ FINAL: Return combined response ============
    res.json({
      sections: {
        learning_map: {
          title_ar: 'خريطة التعلم',
          title_en: 'Learning Map',
          description_ar: 'توصيات مبنية على نتائج اختباراتك ومطابقة المهارات والمستويات المطلوبة',
          description_en: 'Recommendations based on your test results with skill and level matching',
          recommendations: testBasedRecommendations,
          count: testBasedRecommendations.length,
          user_category: userCategory,
          exam_context: examContext,
          // Indicate skill-based matching is used (not graph relationships)
          matching_method: 'skill_level_based',
          matching_description_ar: 'المطابقة مبنية على المهارات من قاعدة البيانات + المهارات المستخرجة بالذكاء الاصطناعي',
          matching_description_en: 'Matching based on database skills + AI-extracted skills'
        },
        learning_favorites: {
          title_ar: 'مفضلات التعلم',
          title_en: 'Learning Favorites',
          description_ar: 'توصيات مبنية على اهتماماتك والمهارات والمواضيع التي اخترتها في الإعدادات',
          description_en: 'Recommendations based on your interests and selected skills/topics from settings',
          recommendations: interestBasedRecommendations,
          count: interestBasedRecommendations.length,
          selected_interests: interests
        },
        future_path: {
          title_ar: 'مسار المستقبل',
          title_en: 'Future Path',
          description_ar: 'توصيات مبنية على الأدوار الوظيفية التي تتطلع إليها في مستقبلك المهني',
          description_en: 'Recommendations based on your desired career roles and professional aspirations',
          recommendations: careerBasedRecommendations,
          count: careerBasedRecommendations.length,
          desired_domains: desiredDomains
        },
        admin_added: {
          title_ar: 'توصيات مخصصة',
          title_en: 'Custom Recommendations',
          description_ar: 'دورات تدريبية تم إضافتها خصيصاً لك من قبل المسؤول',
          description_en: 'Training courses specifically added for you by the administrator',
          recommendations: enrichedAdminCourses,
          count: enrichedAdminCourses.length
        }
      },
      total: testBasedRecommendations.length + interestBasedRecommendations.length + careerBasedRecommendations.length + enrichedAdminCourses.length,
      user_id: userId,
      source: 'skill_based_postgresql',
      hidden_course_ids: Array.from(userHiddenCourseIds),
      // Include NELC data in main response (eliminates extra API calls)
      nelc_status: nelcStatus,
      futurex_courses: futurexCourses
    });
  } catch (error) {
    console.error('Get sectioned recommendations error:', error);
    res.status(500).json({ 
      error: 'Failed to get recommendations',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

    // Get user's latest skill gaps from analysis_results with test context
    const gapsResult = await db.query(`
      SELECT ar.gaps, ar.analyzed_at, ar.overall_score, ar.test_id,
             t.title_ar as test_title_ar, t.title_en as test_title_en,
             td.name_ar as domain_name_ar, td.name_en as domain_name_en
      FROM analysis_results ar
      JOIN tests t ON ar.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ar.user_id = $1 
      ORDER BY ar.analyzed_at DESC 
      LIMIT 1
    `, [userId]);

    if (gapsResult.rows.length === 0) {
      return res.json({ 
        message: 'No assessment results found. Complete an assessment first to get personalized recommendations.',
        recommendations: [],
        source: 'neo4j'
      });
    }

    const analysisData = gapsResult.rows[0];
    const gaps = analysisData.gaps;
    const analyzedAt = analysisData.analyzed_at;
    const overallScore = analysisData.overall_score || 0;
    
    // Categorize user based on test results
    const userCategory = categorizeByTestResult(overallScore);
    console.log(`👤 User Category: ${userCategory.label_en} (${overallScore}%)`);
    
    // Exam context for recommendation reasons
    const examContext = {
      test_id: analysisData.test_id,
      test_title_ar: analysisData.test_title_ar,
      test_title_en: analysisData.test_title_en,
      domain_name_ar: analysisData.domain_name_ar,
      domain_name_en: analysisData.domain_name_en,
      analyzed_at: analyzedAt
    };

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
          // Aligned with PROFICIENCY_LEVELS in userCategorizer.js
          // 0-39% proficiency (61-100% gap) = beginner
          // 40-69% proficiency (31-60% gap) = intermediate
          // 70-100% proficiency (0-30% gap) = advanced
          // 100% proficiency (0% gap) = skip (no recommendations needed)
          let difficulty = 'beginner';
          if (proficiency >= 70) {
            difficulty = 'advanced';
          } else if (proficiency >= 40) {
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

    // Build priority gaps array for skill-based matching
    const priorityGaps = [];
    if (gaps && gaps.length > 0) {
      const skillIds = gaps.map(g => g.skill_id);
      const skillsInfo = await db.query(`
        SELECT s.id, s.name_ar, s.name_en, s.domain_id,
               td.name_ar as domain_name_ar, td.name_en as domain_name_en
        FROM skills s
        LEFT JOIN training_domains td ON s.domain_id = td.id
        WHERE s.id = ANY($1)
      `, [skillIds]);
      
      for (const gap of gaps) {
        const skillInfo = skillsInfo.rows.find(s => s.id === gap.skill_id);
        if (skillInfo) {
          priorityGaps.push({
            skill_id: gap.skill_id,
            skill_name_ar: skillInfo.name_ar,
            skill_name_en: skillInfo.name_en,
            domain_id: skillInfo.domain_id,
            domain_name_ar: skillInfo.domain_name_ar,
            domain_name_en: skillInfo.domain_name_en,
            gap_score: gap.gap_score || gap.gap_percentage || 0,
            priority: gap.priority || 1
          });
        }
      }
    }

    // Get skill-based recommendations from PostgreSQL (NOT Neo4j graph relationships)
    // This matches courses by skill names + AI-extracted skills + difficulty level
    // Pass null for userCategoryKey when no exam data - shows all levels with beginner/intermediate priority
    let skillBasedRecommendations = [];
    if (priorityGaps.length > 0) {
      try {
        skillBasedRecommendations = await getSkillBasedRecommendations(
          priorityGaps,
          userCategory?.key || null,  // null = no level, show all difficulties
          parseInt(limit) * 2
        );
        console.log('📊 Skill-Based Query Results:', skillBasedRecommendations.length, 'courses');
      } catch (error) {
        console.error('❌ Skill-based recommendations error:', error);
        skillBasedRecommendations = [];
      }
    }

    // Enrich recommendations with additional context and reasons
    const enrichedRecommendations = [];
    for (const rec of skillBasedRecommendations) {
      try {
        // Check if user already has a training_recommendation for this course
        const existingRec = await db.query(`
          SELECT id, status, recommendation_reason
          FROM training_recommendations 
          WHERE user_id = $1 AND course_url = $2
        `, [userId, rec.url]);
        
        // Generate recommendation reason with exam context
        const recommendationReason = generateRecommendationReason({
          exam_name_ar: examContext.test_title_ar,
          exam_name_en: examContext.test_title_en,
          exam_id: examContext.test_id,
          analyzed_at: examContext.analyzed_at,
          user_category: userCategory,
          matching_skills: rec.matching_skills || [],
          skill_gap_score: gaps?.[0]?.gap_score,
          course_difficulty: rec.difficulty_level
        });
        
        enrichedRecommendations.push({
          ...rec,
          recommendation_id: existingRec.rows[0]?.id || null,
          status: existingRec.rows[0]?.status || 'recommended',
          source: 'skill_based_postgresql',
          
          // Recommendation reason with exam context
          recommendation_reason: recommendationReason,
          
          // User category context
          user_category: userCategory.key,
          user_category_label_ar: userCategory.label_ar,
          user_category_label_en: userCategory.label_en
        });
      } catch (error) {
        console.error('Error enriching recommendation:', error.message);
      }
    }
    
    // Sort by recommendation score
    enrichedRecommendations.sort((a, b) => (b.recommendation_score || 0) - (a.recommendation_score || 0));
    
    // Filter to only include visible courses (whitelist approach)
    // Courses are hidden by default - only show courses that are in visible_courses table
    let visibleCourseIds = new Set();
    try {
      const visibleResult = await db.query('SELECT course_id FROM visible_courses');
      visibleResult.rows.forEach(v => visibleCourseIds.add(v.course_id));
    } catch (e) {
      console.log('Note: visible_courses table may not exist yet');
    }

    // Only include courses that are in the visible_courses whitelist
    const filteredRecommendations = visibleCourseIds.size > 0 
      ? enrichedRecommendations.filter(r => visibleCourseIds.has(r.course_id))
      : []; // If no courses are whitelisted, show none
    
    console.log(`✅ Filtered Recommendations: ${filteredRecommendations.length} visible out of ${enrichedRecommendations.length} total`);

    res.json({
      recommendations: filteredRecommendations,
      total: filteredRecommendations.length,
      analyzed_at: analyzedAt,
      source: 'skill_based_postgresql',
      user_id: userId,
      
      // User proficiency category
      user_category: {
        key: userCategory.key,
        label_ar: userCategory.label_ar,
        label_en: userCategory.label_en,
        description_ar: userCategory.description_ar,
        description_en: userCategory.description_en,
        score: overallScore
      },
      
      // Exam context
      exam_context: examContext,
      
      // Skill-based matching info (not graph-based)
      matching_method: 'skill_level_based',
      matching_description_ar: 'المطابقة مبنية على المهارات من قاعدة البيانات + المهارات المستخرجة بالذكاء الاصطناعي',
      matching_description_en: 'Matching based on database skills + AI-extracted skills',
      
      filtering_criteria: priorityGaps.map(gap => ({
        skill_id: gap.skill_id,
        skill_name_ar: gap.skill_name_ar,
        skill_name_en: gap.skill_name_en,
        domain_ar: gap.domain_name_ar,
        domain_en: gap.domain_name_en,
        gap_score: `${gap.gap_score}%`,
        priority: gap.priority
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

// Create a tracking record from a Neo4j recommendation (for employees)
router.post('/track-course', authenticate, async (req, res) => {
  try {
    const { course_id, status = 'in_progress' } = req.body;
    
    if (!course_id) {
      return res.status(400).json({ error: 'course_id is required' });
    }
    
    if (!['recommended', 'enrolled', 'in_progress', 'completed', 'skipped'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Get course details
    const courseResult = await db.query('SELECT * FROM courses WHERE id = $1', [course_id]);
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const course = courseResult.rows[0];
    
    // Check if already tracking this course
    const existing = await db.query(
      'SELECT id, status FROM training_recommendations WHERE user_id = $1 AND course_url = $2',
      [req.user.id, course.url]
    );
    
    if (existing.rows.length > 0) {
      // Update existing record
      const result = await db.query(`
        UPDATE training_recommendations
        SET status = $1
        WHERE id = $2
        RETURNING *
      `, [status, existing.rows[0].id]);
      
      return res.json(result.rows[0]);
    }
    
    // Get the first skill associated with this course (for skill_id field)
    const skillResult = await db.query(`
      SELECT skill_id FROM course_skills WHERE course_id = $1 LIMIT 1
    `, [course_id]);
    
    // Create new tracking record
    const result = await db.query(`
      INSERT INTO training_recommendations (
        user_id, skill_id, course_title_ar, course_title_en,
        course_description_ar, course_description_en, course_url,
        provider, duration_hours, difficulty_level, priority, source, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'neo4j', $12)
      RETURNING *
    `, [
      req.user.id,
      skillResult.rows[0]?.skill_id || null,
      course.name_ar,
      course.name_en,
      course.description_ar,
      course.description_en,
      course.url,
      course.provider,
      course.duration_hours,
      course.difficulty_level,
      1, // Default priority
      status
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Track course error:', error);
    res.status(500).json({ error: 'Failed to track course' });
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

// ============================================
// ADMIN RECOMMENDATION MANAGEMENT ENDPOINTS
// ============================================

// Get admin-added custom courses for a user (Admin only)
router.get('/admin/:userId/custom', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await db.query(`
      SELECT acr.*, u.name_ar as added_by_name
      FROM admin_course_recommendations acr
      LEFT JOIN users u ON acr.added_by = u.id
      WHERE acr.user_id = $1
      ORDER BY acr.created_at DESC
    `, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get admin custom courses error:', error);
    res.status(500).json({ error: 'Failed to get custom courses' });
  }
});

// Add custom course recommendation for a user (Admin only)
router.post('/admin/:userId/custom', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { userId } = req.params;
    const { course_name_ar, course_name_en, course_url } = req.body;
    
    if (!course_name_ar || course_name_ar.trim() === '') {
      return res.status(400).json({ error: 'Course name (Arabic) is required' });
    }
    
    // Verify user exists
    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const result = await db.query(`
      INSERT INTO admin_course_recommendations (user_id, course_name_ar, course_name_en, course_url, added_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, course_name_ar.trim(), course_name_en?.trim() || null, course_url?.trim() || null, req.user.id]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add custom course error:', error);
    res.status(500).json({ error: 'Failed to add custom course' });
  }
});

// Delete custom course recommendation (Admin only)
router.delete('/admin/:userId/custom/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { userId, id } = req.params;
    
    const result = await db.query(
      'DELETE FROM admin_course_recommendations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Custom course not found' });
    }
    
    res.json({ message: 'Custom course deleted successfully' });
  } catch (error) {
    console.error('Delete custom course error:', error);
    res.status(500).json({ error: 'Failed to delete custom course' });
  }
});

// Get hidden courses for a user (Admin only)
router.get('/admin/:userId/hidden', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await db.query(`
      SELECT uhr.*, c.name_ar as course_name_ar, c.name_en as course_name_en
      FROM user_hidden_recommendations uhr
      JOIN courses c ON uhr.course_id = c.id
      WHERE uhr.user_id = $1
      ORDER BY uhr.created_at DESC
    `, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get hidden courses error:', error);
    res.status(500).json({ error: 'Failed to get hidden courses' });
  }
});

// Hide a course for a user (Admin only)
router.post('/admin/:userId/hide/:courseId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    
    // Verify user exists
    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify course exists
    const courseCheck = await db.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    // Check if already hidden
    const existing = await db.query(
      'SELECT id FROM user_hidden_recommendations WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Course is already hidden for this user' });
    }
    
    const result = await db.query(`
      INSERT INTO user_hidden_recommendations (user_id, course_id, hidden_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [userId, courseId, req.user.id]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Hide course error:', error);
    res.status(500).json({ error: 'Failed to hide course' });
  }
});

// Unhide a course for a user (Admin only)
router.delete('/admin/:userId/unhide/:courseId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    
    const result = await db.query(
      'DELETE FROM user_hidden_recommendations WHERE user_id = $1 AND course_id = $2 RETURNING id',
      [userId, courseId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hidden course record not found' });
    }
    
    res.json({ message: 'Course unhidden successfully' });
  } catch (error) {
    console.error('Unhide course error:', error);
    res.status(500).json({ error: 'Failed to unhide course' });
  }
});

// ============================================
// COURSE COMPLETION WITH CERTIFICATE ENDPOINTS
// ============================================

// Multer error handler middleware
const certificateUploadErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.code, err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الملف كبير جداً', message: 'الحد الأقصى 10 ميجابايت' });
    }
    return res.status(400).json({ error: 'خطأ في رفع الملف', message: err.message });
  }
  if (err) {
    console.error('File upload error:', err.message);
    return res.status(400).json({ error: 'خطأ في رفع الملف', message: err.message });
  }
  next();
};

// Complete a course with certificate upload (Employee)
router.post('/complete-with-certificate', authenticate, certificateUpload.single('certificate'), certificateUploadErrorHandler, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'يرجى رفع شهادة الإتمام' });
    }

    const { course_id, admin_course_id } = req.body;
    const userId = req.user.id;

    if (!course_id && !admin_course_id) {
      // Delete the uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'يرجى تحديد الدورة' });
    }

    // Verify the course exists
    if (course_id) {
      const courseCheck = await db.query('SELECT id FROM courses WHERE id = $1', [course_id]);
      if (courseCheck.rows.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'الدورة غير موجودة' });
      }
    }

    if (admin_course_id) {
      const adminCourseCheck = await db.query(
        'SELECT id FROM admin_course_recommendations WHERE id = $1 AND user_id = $2',
        [admin_course_id, userId]
      );
      if (adminCourseCheck.rows.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'الدورة المخصصة غير موجودة' });
      }
    }

    // Check if certificate already exists for this course
    let existingCheck;
    if (course_id) {
      existingCheck = await db.query(
        'SELECT id FROM course_completion_certificates WHERE user_id = $1 AND course_id = $2',
        [userId, course_id]
      );
    } else {
      existingCheck = await db.query(
        'SELECT id FROM course_completion_certificates WHERE user_id = $1 AND admin_course_id = $2',
        [userId, admin_course_id]
      );
    }

    if (existingCheck.rows.length > 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'تم رفع شهادة لهذه الدورة مسبقاً' });
    }

    // Store relative path for portability
    const relativePath = `certificates/${path.basename(req.file.path)}`;

    // Insert certificate record
    const result = await db.query(`
      INSERT INTO course_completion_certificates 
        (user_id, course_id, admin_course_id, certificate_path, original_filename, file_size, mime_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      userId,
      course_id || null,
      admin_course_id || null,
      relativePath,
      req.file.originalname,
      req.file.size,
      req.file.mimetype
    ]);

    // Update training_recommendations status to completed if exists
    let courseName = null;
    let courseProvider = null;
    if (course_id) {
      // Get course URL to find training recommendation
      const courseResult = await db.query('SELECT url, name_ar, name_en, provider FROM courses WHERE id = $1', [course_id]);
      if (courseResult.rows.length > 0) {
        await db.query(`
          UPDATE training_recommendations
          SET status = 'completed'
          WHERE user_id = $1 AND course_url = $2
        `, [userId, courseResult.rows[0].url]);
        courseName = { name_ar: courseResult.rows[0].name_ar, name_en: courseResult.rows[0].name_en };
        courseProvider = courseResult.rows[0].provider;
      }
    } else if (admin_course_id) {
      // Get admin course name
      const adminCourseResult = await db.query('SELECT course_name_ar, course_name_en, provider FROM admin_course_recommendations WHERE id = $1', [admin_course_id]);
      if (adminCourseResult.rows.length > 0) {
        courseName = { name_ar: adminCourseResult.rows[0].course_name_ar, name_en: adminCourseResult.rows[0].course_name_en };
        courseProvider = adminCourseResult.rows[0].provider;
      }
    }

    // Send course completion congratulation email
    if (courseName) {
      const userResult = await db.query('SELECT email, name_ar FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        sendCourseCompletedEmail(user.email, user.name_ar, {
          name_ar: courseName.name_ar,
          name_en: courseName.name_en,
          provider: courseProvider
        }).catch(err => console.error('Failed to send course completed email:', err));
      }
    }

    // Update user badges after course completion
    updateUserBadges(userId)
      .then(badgeResult => {
        if (badgeResult.awarded?.length > 0) {
          console.log(`Badges awarded to user ${userId} after course completion:`, badgeResult.awarded);
        }
      })
      .catch(err => console.error('Failed to update user badges:', err));

    res.status(201).json({
      message: 'تم رفع الشهادة بنجاح وتمييز الدورة كمكتملة',
      certificate: result.rows[0]
    });
  } catch (error) {
    console.error('Complete with certificate error:', error);
    // Clean up file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'فشل في رفع الشهادة' });
  }
});

// Get certificate info for a course (Employee - own certificates, Admin - any user)
router.get('/certificate/:certificateId', authenticate, async (req, res) => {
  try {
    const { certificateId } = req.params;

    const result = await db.query(`
      SELECT ccc.*, u.name_ar as user_name_ar, u.name_en as user_name_en,
             c.name_ar as course_name_ar, c.name_en as course_name_en,
             acr.course_name_ar as admin_course_name_ar, acr.course_name_en as admin_course_name_en
      FROM course_completion_certificates ccc
      JOIN users u ON ccc.user_id = u.id
      LEFT JOIN courses c ON ccc.course_id = c.id
      LEFT JOIN admin_course_recommendations acr ON ccc.admin_course_id = acr.id
      WHERE ccc.id = $1
    `, [certificateId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'الشهادة غير موجودة' });
    }

    const certificate = result.rows[0];

    // Check authorization - employees can only see their own certificates
    if (req.user.role === 'employee' && certificate.user_id !== req.user.id) {
      return res.status(403).json({ error: 'غير مصرح' });
    }

    res.json(certificate);
  } catch (error) {
    console.error('Get certificate error:', error);
    res.status(500).json({ error: 'فشل في جلب معلومات الشهادة' });
  }
});

// Download certificate file
router.get('/certificate/:certificateId/download', authenticate, async (req, res) => {
  try {
    const { certificateId } = req.params;

    const result = await db.query(`
      SELECT * FROM course_completion_certificates WHERE id = $1
    `, [certificateId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'الشهادة غير موجودة' });
    }

    const certificate = result.rows[0];

    // Check authorization - employees can only download their own certificates
    if (req.user.role === 'employee' && certificate.user_id !== req.user.id) {
      return res.status(403).json({ error: 'غير مصرح' });
    }

    const filePath = path.join(__dirname, '../../uploads', certificate.certificate_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'ملف الشهادة غير موجود' });
    }

    res.download(filePath, certificate.original_filename);
  } catch (error) {
    console.error('Download certificate error:', error);
    res.status(500).json({ error: 'فشل في تحميل الشهادة' });
  }
});

// Get all certificates for a user (Admin or own)
router.get('/certificates/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check authorization
    if (req.user.role === 'employee' && req.user.id !== userId) {
      return res.status(403).json({ error: 'غير مصرح' });
    }

    const result = await db.query(`
      SELECT ccc.*, 
             c.name_ar as course_name_ar, c.name_en as course_name_en, c.url as course_url, c.nelc_course_id,
             acr.course_name_ar as admin_course_name_ar, acr.course_name_en as admin_course_name_en, acr.course_url as admin_course_url
      FROM course_completion_certificates ccc
      LEFT JOIN courses c ON ccc.course_id = c.id
      LEFT JOIN admin_course_recommendations acr ON ccc.admin_course_id = acr.id
      WHERE ccc.user_id = $1
      ORDER BY ccc.completed_at DESC
    `, [userId]);

    // Transform course URLs to FutureX format
    const transformedResults = result.rows.map(row => ({
      ...row,
      course_url: row.course_url ? toFuturexUrl({ url: row.course_url, nelc_course_id: row.nelc_course_id }) : null,
      admin_course_url: row.admin_course_url ? toFuturexUrl({ url: row.admin_course_url }) : null
    }));

    res.json(transformedResults);
  } catch (error) {
    console.error('Get user certificates error:', error);
    res.status(500).json({ error: 'فشل في جلب الشهادات' });
  }
});

// Check if a course is completed by user (has certificate)
router.get('/completion-status', authenticate, async (req, res) => {
  try {
    const { course_id, admin_course_id } = req.query;
    const userId = req.user.id;

    if (!course_id && !admin_course_id) {
      return res.status(400).json({ error: 'يرجى تحديد الدورة' });
    }

    let result;
    if (course_id) {
      result = await db.query(`
        SELECT * FROM course_completion_certificates 
        WHERE user_id = $1 AND course_id = $2
      `, [userId, course_id]);
    } else {
      result = await db.query(`
        SELECT * FROM course_completion_certificates 
        WHERE user_id = $1 AND admin_course_id = $2
      `, [userId, admin_course_id]);
    }

    res.json({
      is_completed: result.rows.length > 0,
      certificate: result.rows[0] || null
    });
  } catch (error) {
    console.error('Check completion status error:', error);
    res.status(500).json({ error: 'فشل في التحقق من حالة الإكمال' });
  }
});

// ============================================
// NELC API INTEGRATION ENDPOINTS (via Neo4j)
// ============================================

// Get NELC integration status and configuration
router.get('/nelc/status', authenticate, async (req, res) => {
  try {
    // Check if Neo4j API is configured and accessible
    const apiStatus = await neo4jApi.checkNelcApiStatus();
    
    // Check user's national ID availability
    const userResult = await db.query(`
      SELECT national_id, nelc_last_sync_at FROM users WHERE id = $1
    `, [req.user.id]);
    
    const user = userResult.rows[0] || {};
    const hasNationalId = !!user.national_id;
    
    // If user has national ID, check if they exist in NELC
    let nelcUserExists = false;
    let nelcUserData = null;
    
    if (hasNationalId && apiStatus.connected) {
      try {
        nelcUserData = await neo4jApi.getNelcUserByNationalId(user.national_id);
        nelcUserExists = !!nelcUserData;
      } catch (e) {
        console.log('Could not verify NELC user:', e.message);
      }
    }
    
    res.json({
      api_configured: apiStatus.configured,
      api_connected: apiStatus.connected,
      has_national_id: hasNationalId,
      nelc_user_exists: nelcUserExists,
      nelc_user_data: nelcUserData ? {
        name_ar: nelcUserData.user_name_ar,
        name_en: nelcUserData.user_name_en,
        email: nelcUserData.user_email
      } : null,
      last_sync: user.nelc_last_sync_at,
      message: !apiStatus.configured 
        ? 'NELC API credentials are not configured. Contact administrator.'
        : !apiStatus.connected
        ? 'Cannot connect to NELC API. Please try again later.'
        : !hasNationalId
        ? 'يرجى إضافة رقم الهوية الوطنية في الإعدادات لمزامنة الدورات من NELC.'
        : !nelcUserExists
        ? 'لم يتم العثور على حسابك في منصة NELC. تأكد من صحة رقم الهوية.'
        : 'NELC integration is ready. You can sync your courses.'
    });
  } catch (error) {
    console.error('Get NELC status error:', error);
    res.status(500).json({ error: 'فشل في جلب حالة التكامل مع NELC' });
  }
});

// Sync courses from NELC (via Neo4j API using national ID)
router.post('/nelc/sync', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const syncStartedAt = new Date();
    
    // Get user's national ID
    const userResult = await db.query(`
      SELECT national_id FROM users WHERE id = $1
    `, [userId]);
    
    const user = userResult.rows[0];
    
    if (!user || !user.national_id) {
      return res.status(400).json({ 
        error: 'رقم الهوية الوطنية غير موجود',
        message: 'يرجى إضافة رقم الهوية الوطنية في الإعدادات أولاً'
      });
    }
    
    const nationalId = user.national_id;
    
    let syncStatus = 'success';
    let errorMessage = null;
    let coursesFromNelc = [];
    let coursesMatched = 0;
    let coursesUnmatched = 0;
    let completedCoursesMarked = 0;
    
    try {
      // Verify user exists in NELC
      const nelcUser = await neo4jApi.getNelcUserByNationalId(nationalId);
      
      if (!nelcUser) {
        return res.status(404).json({
          error: 'المستخدم غير موجود في NELC',
          message: 'لم يتم العثور على حسابك في منصة NELC. تأكد من صحة رقم الهوية.'
        });
      }
      
      // Fetch all courses from NELC Neo4j
      coursesFromNelc = await neo4jApi.getNelcUserCourses(nationalId);
      
      if (!Array.isArray(coursesFromNelc)) {
        coursesFromNelc = [];
      }
      
      console.log(`📊 Found ${coursesFromNelc.length} courses for user ${nationalId} in NELC`);
      
      // Process each course and try to match with local courses
      for (const nelcCourse of coursesFromNelc) {
        try {
          let localCourse = null;
          const courseName = nelcCourse.course_name;
          const nelcCourseId = nelcCourse.course_id;
          const courseUrl = nelcCourse.course_url;
          
          // Try to match by NELC course ID first
          if (nelcCourseId) {
            const matchByNelcId = await db.query(
              'SELECT id FROM courses WHERE nelc_course_id = $1',
              [nelcCourseId.toString()]
            );
            if (matchByNelcId.rows.length > 0) {
              localCourse = matchByNelcId.rows[0];
            }
          }
          
          // Try to match by URL pattern
          if (!localCourse && courseUrl) {
            // Extract course ID from URL (e.g., https://futurex.nelc.gov.sa/ar/course/102406)
            const urlMatch = courseUrl.match(/\/course\/(\d+)/);
            if (urlMatch) {
              const urlCourseId = urlMatch[1];
              const matchByUrl = await db.query(
                `SELECT id FROM courses WHERE url LIKE $1 OR nelc_course_id = $2`,
                [`%/course/${urlCourseId}%`, urlCourseId]
              );
              if (matchByUrl.rows.length > 0) {
                localCourse = matchByUrl.rows[0];
              }
            }
          }
          
          // Try to match by course name (exact and fuzzy)
          if (!localCourse && courseName) {
            // Exact match first
            let matchByName = await db.query(`
              SELECT id FROM courses 
              WHERE LOWER(TRIM(name_ar)) = LOWER(TRIM($1)) 
                 OR LOWER(TRIM(name_en)) = LOWER(TRIM($1))
              LIMIT 1
            `, [courseName]);
            
            // Fuzzy match if exact fails
            if (matchByName.rows.length === 0) {
              matchByName = await db.query(`
                SELECT id FROM courses 
                WHERE LOWER(name_ar) LIKE LOWER($1)
                   OR LOWER(name_en) LIKE LOWER($1)
                LIMIT 1
              `, [`%${courseName.substring(0, 30)}%`]);
            }
            
            if (matchByName.rows.length > 0) {
              localCourse = matchByName.rows[0];
            }
          }
          
          // If course is completed in NELC, create/update completion record
          const isCompleted = nelcCourse.status === 'Completed';
          
          if (localCourse) {
            coursesMatched++;
            
            if (isCompleted) {
              // Check if already has a completion record
              const existingCompletion = await db.query(`
                SELECT id, completion_source FROM course_completion_certificates
                WHERE user_id = $1 AND course_id = $2
              `, [userId, localCourse.id]);
              
              if (existingCompletion.rows.length === 0) {
                // Create new completion record from NELC
                await db.query(`
                  INSERT INTO course_completion_certificates 
                    (user_id, course_id, completion_source, nelc_completion_id, nelc_completion_date, nelc_progress_percentage)
                  VALUES ($1, $2, 'nelc', $3, CURRENT_TIMESTAMP, 100)
                `, [
                  userId,
                  localCourse.id,
                  nelcCourseId ? nelcCourseId.toString() : null
                ]);
                completedCoursesMarked++;
              } else if (existingCompletion.rows[0].completion_source !== 'certificate') {
                // Update existing record with NELC data (don't overwrite certificate uploads)
                await db.query(`
                  UPDATE course_completion_certificates
                  SET nelc_completion_id = $1,
                      nelc_completion_date = CURRENT_TIMESTAMP,
                      nelc_progress_percentage = 100
                  WHERE user_id = $2 AND course_id = $3
                `, [
                  nelcCourseId ? nelcCourseId.toString() : null,
                  userId,
                  localCourse.id
                ]);
              }
            }
          } else {
            coursesUnmatched++;
          }
        } catch (courseError) {
          console.error('Error processing NELC course:', courseError.message);
          coursesUnmatched++;
        }
      }
      
    } catch (nelcError) {
      console.error('NELC Neo4j API error during sync:', nelcError);
      syncStatus = 'failed';
      errorMessage = nelcError.message;
    }
    
    // Update user's last sync timestamp
    await db.query(`
      UPDATE users SET nelc_last_sync_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [userId]);
    
    // Log the sync operation
    try {
      await db.query(`
        INSERT INTO nelc_sync_log 
          (user_id, sync_type, status, courses_synced, courses_matched, courses_unmatched, error_message, sync_started_at, sync_completed_at)
        VALUES ($1, 'courses', $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `, [userId, syncStatus, coursesFromNelc.length, coursesMatched, coursesUnmatched, errorMessage, syncStartedAt]);
    } catch (logError) {
      console.log('Could not log sync operation:', logError.message);
    }
    
    res.json({
      success: syncStatus === 'success',
      status: syncStatus,
      message: syncStatus === 'success' 
        ? `تم مزامنة ${coursesMatched} دورة من أصل ${coursesFromNelc.length} دورة. تم تمييز ${completedCoursesMarked} دورة كمكتملة.`
        : `فشلت المزامنة: ${errorMessage}`,
      summary: {
        total_from_nelc: coursesFromNelc.length,
        matched: coursesMatched,
        unmatched: coursesUnmatched,
        completed_marked: completedCoursesMarked
      },
      synced_at: new Date()
    });
    
  } catch (error) {
    console.error('NELC sync error:', error);
    res.status(500).json({ error: 'فشل في مزامنة الدورات من NELC' });
  }
});

// Get NELC sync history for current user
router.get('/nelc/sync-history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;
    
    try {
      const result = await db.query(`
        SELECT * FROM nelc_sync_log
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, parseInt(limit)]);
      
      res.json(result.rows);
    } catch (dbError) {
      // Table might not exist yet
      res.json([]);
    }
  } catch (error) {
    console.error('Get NELC sync history error:', error);
    res.status(500).json({ error: 'فشل في جلب سجل المزامنة' });
  }
});

// Get user's NELC courses directly (preview without syncing)
router.get('/nelc/courses', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's national ID
    const userResult = await db.query(`
      SELECT national_id FROM users WHERE id = $1
    `, [userId]);
    
    const user = userResult.rows[0];
    
    if (!user || !user.national_id) {
      return res.status(400).json({ 
        error: 'رقم الهوية الوطنية غير موجود',
        message: 'يرجى إضافة رقم الهوية الوطنية في الإعدادات'
      });
    }
    
    const nationalId = user.national_id;
    
    // Verify user exists in NELC
    const nelcUser = await neo4jApi.getNelcUserByNationalId(nationalId);
    
    if (!nelcUser) {
      return res.status(404).json({
        error: 'المستخدم غير موجود في NELC',
        message: 'لم يتم العثور على حسابك في منصة NELC'
      });
    }
    
    // Fetch courses from NELC
    const coursesFromNelc = await neo4jApi.getNelcUserCourses(nationalId);
    
    // Get action summary
    const actionSummary = await neo4jApi.getNelcUserActionSummary(nationalId);
    
    // For each course, check if we have a local match and completion record
    const enrichedCourses = await Promise.all(coursesFromNelc.map(async (nelcCourse) => {
      let localMatch = null;
      let completionRecord = null;
      const nelcCourseId = nelcCourse.course_id;
      const courseName = nelcCourse.course_name;
      const courseUrl = nelcCourse.course_url;
      
      // Try to find local match
      if (nelcCourseId) {
        const matchByNelcId = await db.query(
          'SELECT id, name_ar, name_en, url, nelc_course_id FROM courses WHERE nelc_course_id = $1',
          [nelcCourseId.toString()]
        );
        if (matchByNelcId.rows.length > 0) {
          localMatch = matchByNelcId.rows[0];
        }
      }
      
      // Try URL match
      if (!localMatch && courseUrl) {
        const urlMatch = courseUrl.match(/\/course\/(\d+)/);
        if (urlMatch) {
          const matchByUrl = await db.query(
            'SELECT id, name_ar, name_en, url, nelc_course_id FROM courses WHERE url LIKE $1',
            [`%/course/${urlMatch[1]}%`]
          );
          if (matchByUrl.rows.length > 0) {
            localMatch = matchByUrl.rows[0];
          }
        }
      }
      
      // Try name match
      if (!localMatch && courseName) {
        const matchByName = await db.query(`
          SELECT id, name_ar, name_en, url, nelc_course_id FROM courses 
          WHERE LOWER(TRIM(name_ar)) = LOWER(TRIM($1)) 
             OR LOWER(TRIM(name_en)) = LOWER(TRIM($1))
          LIMIT 1
        `, [courseName]);
        
        if (matchByName.rows.length > 0) {
          localMatch = matchByName.rows[0];
        }
      }
      
      // Check if we have a completion record
      if (localMatch) {
        const completionResult = await db.query(`
          SELECT id, completion_source, completed_at, certificate_path
          FROM course_completion_certificates
          WHERE user_id = $1 AND course_id = $2
        `, [userId, localMatch.id]);
        
        if (completionResult.rows.length > 0) {
          completionRecord = completionResult.rows[0];
        }
      }
      
      return {
        nelc_course: {
          id: nelcCourseId,
          name: courseName,
          url: courseUrl, // Already in FutureX format from NELC Neo4j
          status: nelcCourse.status,
          actions: nelcCourse.actions
        },
        local_match: localMatch ? {
          id: localMatch.id,
          name_ar: localMatch.name_ar,
          name_en: localMatch.name_en,
          url: toFuturexUrl(localMatch) // Transform to FutureX URL
        } : null,
        has_match: !!localMatch,
        is_completed_locally: !!completionRecord,
        completion_source: completionRecord?.completion_source || null
      };
    }));
    
    res.json({
      nelc_user: {
        name_ar: nelcUser.user_name_ar,
        name_en: nelcUser.user_name_en,
        email: nelcUser.user_email
      },
      summary: actionSummary,
      total: enrichedCourses.length,
      matched: enrichedCourses.filter(c => c.has_match).length,
      unmatched: enrichedCourses.filter(c => !c.has_match).length,
      completed_in_nelc: enrichedCourses.filter(c => c.nelc_course.status === 'Completed').length,
      courses: enrichedCourses
    });
    
  } catch (error) {
    console.error('Get NELC courses error:', error);
    res.status(500).json({ error: 'فشل في جلب الدورات من NELC' });
  }
});

// Get user's NELC action summary
router.get('/nelc/summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's national ID
    const userResult = await db.query(`
      SELECT national_id, nelc_last_sync_at FROM users WHERE id = $1
    `, [userId]);
    
    const user = userResult.rows[0];
    
    if (!user || !user.national_id) {
      return res.json({
        has_national_id: false,
        message: 'يرجى إضافة رقم الهوية الوطنية في الإعدادات'
      });
    }
    
    // Get summary from NELC
    const summary = await neo4jApi.getNelcUserActionSummary(user.national_id);
    
    res.json({
      has_national_id: true,
      national_id: user.national_id,
      last_sync: user.nelc_last_sync_at,
      ...summary
    });
    
  } catch (error) {
    console.error('Get NELC summary error:', error);
    res.status(500).json({ error: 'فشل في جلب ملخص NELC' });
  }
});

module.exports = router;

