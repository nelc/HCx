/**
 * Enhanced Recommendation Engine
 * 
 * Generates intelligent course recommendations using:
 * - Neo4j graph database for course relationships
 * - AI-enriched course metadata for better matching
 * - User proficiency categorization
 * - Exam-specific context for recommendation reasons
 */

const db = require('../db');
const neo4jApi = require('./neo4jApi');
const {
  categorizeByTestResult,
  categorizeSkillGaps,
  generateUserProfile,
  generateRecommendationReason,
  getValidDifficultyLevels
} = require('./userCategorizer');

// Scoring weights for recommendation algorithm
const SCORING_WEIGHTS = {
  SKILL_GAP_MATCH: 0.40,      // 40% - Direct skill gap match
  DIFFICULTY_ALIGNMENT: 0.20,  // 20% - Course difficulty vs user level
  LEARNING_OUTCOMES: 0.20,     // 20% - Learning outcomes relevance
  QUALITY_SCORE: 0.10,         // 10% - Course quality indicators
  CAREER_PATH: 0.10            // 10% - Career path relevance
};

/**
 * Fetch AI enrichment data for a course from PostgreSQL
 * @param {string} courseId - The course ID
 * @returns {Object|null} Enrichment data or null
 */
async function fetchCourseEnrichment(courseId) {
  try {
    const result = await db.query(`
      SELECT 
        extracted_skills,
        prerequisite_skills,
        learning_outcomes,
        target_audience,
        career_paths,
        industry_tags,
        topics,
        difficulty_assessment,
        quality_indicators,
        keywords_ar,
        keywords_en,
        summary_ar,
        summary_en
      FROM course_enrichments 
      WHERE course_id = $1
    `, [courseId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.log(`No enrichment data found for course ${courseId}`);
    return null;
  }
}

/**
 * Calculate skill match score between user gaps and course skills
 * @param {Array} userGaps - User's skill gaps
 * @param {Array} courseSkills - Course's extracted skills
 * @param {Array} courseNativeSkills - Skills from Neo4j relationship
 * @returns {Object} Match score and matched skills
 */
function calculateSkillMatchScore(userGaps, courseSkills = [], courseNativeSkills = []) {
  if (!userGaps || userGaps.length === 0) return { score: 0, matchedSkills: [] };
  
  const matchedSkills = [];
  let totalScore = 0;
  
  // Combine AI-extracted skills with native Neo4j skills
  const allCourseSkills = [
    ...courseSkills.map(s => typeof s === 'string' ? s.toLowerCase() : ''),
    ...courseNativeSkills.map(s => (s.name_ar || s.name_en || s || '').toLowerCase())
  ];
  
  // Check each user gap against course skills
  for (const gap of userGaps) {
    const gapSkillName = (gap.skill_name_ar || gap.skill_name_en || '').toLowerCase();
    const gapScore = gap.gap_score || gap.gap_percentage || 0;
    
    // Check for matches
    for (const courseSkill of allCourseSkills) {
      if (courseSkill && gapSkillName && (
        courseSkill.includes(gapSkillName) || 
        gapSkillName.includes(courseSkill) ||
        calculateStringSimilarity(courseSkill, gapSkillName) > 0.6
      )) {
        matchedSkills.push(gap.skill_name_ar || gap.skill_name_en);
        // Higher gap score = higher priority = higher weight
        totalScore += (gapScore / 100) * (1 / (gap.priority || 1));
        break;
      }
    }
  }
  
  // Normalize score to 0-100
  const normalizedScore = userGaps.length > 0 
    ? Math.min(100, (matchedSkills.length / userGaps.length) * 100 + totalScore * 20)
    : 0;
  
  return {
    score: normalizedScore,
    matchedSkills: [...new Set(matchedSkills)] // Remove duplicates
  };
}

/**
 * Calculate string similarity (simple Jaccard-like similarity)
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const set1 = new Set(str1.split(/\s+/));
  const set2 = new Set(str2.split(/\s+/));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Calculate difficulty alignment score
 * @param {string} userCategory - User's proficiency category key
 * @param {string} courseDifficulty - Course difficulty level
 * @param {Object} targetAudience - AI-enriched target audience info
 * @returns {number} Score 0-100
 */
function calculateDifficultyScore(userCategory, courseDifficulty, targetAudience = {}) {
  const validLevels = getValidDifficultyLevels(userCategory);
  
  // Check direct difficulty match
  if (!courseDifficulty) return 50; // Neutral if unknown
  
  const difficultyLower = courseDifficulty.toLowerCase();
  
  // Check against AI target audience level
  const aiLevel = targetAudience?.level?.toLowerCase();
  
  // Perfect match with user's recommended level
  if (difficultyLower === userCategory) return 100;
  
  // Course is in valid levels for user
  if (validLevels.includes(difficultyLower)) {
    // Slight penalty for not being exact match
    const levelIndex = validLevels.indexOf(difficultyLower);
    return 100 - (levelIndex * 15);
  }
  
  // Course is too advanced for user
  if (!validLevels.includes(difficultyLower)) {
    return 20; // Low but not zero - might still be useful
  }
  
  return 50;
}

/**
 * Calculate learning outcomes relevance score
 * @param {Array} userGaps - User's skill gaps
 * @param {Array} learningOutcomes - Course learning outcomes
 * @returns {number} Score 0-100
 */
function calculateOutcomesScore(userGaps, learningOutcomes = []) {
  if (!learningOutcomes || learningOutcomes.length === 0) return 50;
  if (!userGaps || userGaps.length === 0) return 50;
  
  let matchCount = 0;
  const gapKeywords = userGaps.flatMap(g => [
    g.skill_name_ar,
    g.skill_name_en,
    g.description_ar,
    g.description_en
  ].filter(Boolean).join(' ').toLowerCase().split(/\s+/));
  
  for (const outcome of learningOutcomes) {
    const outcomeWords = (outcome || '').toLowerCase().split(/\s+/);
    const hasMatch = outcomeWords.some(word => 
      word.length > 3 && gapKeywords.some(gw => gw.includes(word) || word.includes(gw))
    );
    if (hasMatch) matchCount++;
  }
  
  return Math.min(100, (matchCount / learningOutcomes.length) * 100 + 30);
}

/**
 * Calculate quality score from AI enrichment
 * @param {Object} qualityIndicators - Quality indicators from enrichment
 * @returns {number} Score 0-100
 */
function calculateQualityScore(qualityIndicators = {}) {
  if (!qualityIndicators || Object.keys(qualityIndicators).length === 0) {
    return 60; // Default neutral score
  }
  
  const overallScore = qualityIndicators.overall_score || 3;
  const contentClarity = qualityIndicators.content_clarity || 3;
  const practicalApplicability = qualityIndicators.practical_applicability || 3;
  
  // Convert 1-5 scale to 0-100
  const avgScore = (overallScore + contentClarity + practicalApplicability) / 3;
  return (avgScore / 5) * 100;
}

/**
 * Calculate career path relevance
 * @param {string} userDepartment - User's department
 * @param {Array} careerPaths - Course career paths
 * @param {Array} industryTags - Course industry tags
 * @returns {number} Score 0-100
 */
function calculateCareerScore(userDepartment, careerPaths = [], industryTags = []) {
  // Basic implementation - can be enhanced with department-career mapping
  if (!careerPaths || careerPaths.length === 0) return 60;
  
  // For now, return a good score if career paths exist
  // In future, this can match against user's role/department
  return 70 + Math.min(30, careerPaths.length * 10);
}

/**
 * Calculate overall recommendation score for a course
 * @param {Object} course - Course object from Neo4j
 * @param {Object} enrichment - AI enrichment data
 * @param {Object} userProfile - User profile with categorization
 * @returns {Object} Score and breakdown
 */
function calculateRecommendationScore(course, enrichment, userProfile) {
  const skillMatch = calculateSkillMatchScore(
    userProfile.priority_gaps,
    enrichment?.extracted_skills || [],
    course.matching_skills || []
  );
  
  const difficultyScore = calculateDifficultyScore(
    userProfile.category.key,
    course.difficulty_level,
    enrichment?.target_audience
  );
  
  const outcomesScore = calculateOutcomesScore(
    userProfile.priority_gaps,
    enrichment?.learning_outcomes
  );
  
  const qualityScore = calculateQualityScore(enrichment?.quality_indicators);
  
  const careerScore = calculateCareerScore(
    userProfile.department,
    enrichment?.career_paths,
    enrichment?.industry_tags
  );
  
  // Calculate weighted total
  const totalScore = 
    (skillMatch.score * SCORING_WEIGHTS.SKILL_GAP_MATCH) +
    (difficultyScore * SCORING_WEIGHTS.DIFFICULTY_ALIGNMENT) +
    (outcomesScore * SCORING_WEIGHTS.LEARNING_OUTCOMES) +
    (qualityScore * SCORING_WEIGHTS.QUALITY_SCORE) +
    (careerScore * SCORING_WEIGHTS.CAREER_PATH);
  
  return {
    total_score: Math.round(totalScore),
    matched_skills: skillMatch.matchedSkills,
    breakdown: {
      skill_match: Math.round(skillMatch.score),
      difficulty_alignment: Math.round(difficultyScore),
      learning_outcomes: Math.round(outcomesScore),
      quality: Math.round(qualityScore),
      career_relevance: Math.round(careerScore)
    }
  };
}

/**
 * Generate enhanced recommendations with AI enrichment data
 * @param {string} userId - User ID
 * @param {Object} analysisResult - Analysis result with gaps and scores
 * @param {Object} examContext - Test/exam context for recommendation reasons
 * @param {number} limit - Maximum recommendations to return
 * @returns {Promise<Array>} Enhanced recommendations with reasons
 */
async function generateEnhancedRecommendations(userId, analysisResult, examContext, limit = 10) {
  try {
    // Generate user profile with categorization
    const userProfile = generateUserProfile(analysisResult);
    userProfile.department = examContext.department || null;
    
    console.log(`🎯 Generating recommendations for user ${userId}`);
    console.log(`   Category: ${userProfile.category.label_en} (${userProfile.overall_score}%)`);
    console.log(`   Priority gaps: ${userProfile.priority_gaps.length}`);
    
    // Build skill requirements for Neo4j query
    const skillRequirements = {};
    for (const gap of userProfile.priority_gaps) {
      skillRequirements[gap.skill_id] = {
        domain_id: gap.domain_id,
        domain_ar: gap.domain_name_ar || gap.skill_name_ar,
        domain_en: gap.domain_name_en || gap.skill_name_en,
        gap_score: gap.gap_score || gap.gap_percentage,
        difficulty: userProfile.category.recommended_difficulty,
        proficiency: 100 - (gap.gap_score || gap.gap_percentage || 0)
      };
    }
    
    // Sync user's skill gaps to Neo4j
    if (Object.keys(skillRequirements).length > 0) {
      try {
        await neo4jApi.deleteNodeRelationships('User', 'user_id', userId);
      } catch (e) {
        console.log('No existing relationships to delete');
      }
      
      for (const [skillId, req] of Object.entries(skillRequirements)) {
        try {
          const gap = userProfile.priority_gaps.find(g => g.skill_id === skillId);
          await neo4jApi.createUserSkillGap(
            userId,
            skillId,
            req.gap_score,
            gap?.priority
          );
        } catch (e) {
          console.log(`Error syncing skill gap ${skillId}:`, e.message);
        }
      }
    }
    
    // Get base recommendations from Neo4j
    let neo4jRecommendations = [];
    try {
      neo4jRecommendations = await neo4jApi.getEnhancedRecommendationsForUser(
        userId,
        skillRequirements,
        {}, // synonymMap
        limit * 2 // Get more than needed for scoring
      );
      
      if (!neo4jRecommendations || neo4jRecommendations.length === 0) {
        neo4jRecommendations = await neo4jApi.getRecommendationsForUser(userId, limit * 2);
      }
    } catch (error) {
      console.error('Neo4j query error:', error.message);
      neo4jRecommendations = [];
    }
    
    console.log(`📊 Got ${neo4jRecommendations?.length || 0} base recommendations from Neo4j`);
    
    // Enhance each recommendation with AI enrichment and scoring
    const enhancedRecommendations = [];
    
    for (const rec of (neo4jRecommendations || [])) {
      try {
        // Fetch AI enrichment data
        const enrichment = await fetchCourseEnrichment(rec.course_id);
        
        // Calculate enhanced recommendation score
        const scoring = calculateRecommendationScore(rec, enrichment, userProfile);
        
        // Generate recommendation reason
        const reason = generateRecommendationReason({
          exam_name_ar: examContext.test_title_ar,
          exam_name_en: examContext.test_title_en,
          exam_id: examContext.test_id,
          analyzed_at: analysisResult.analyzed_at,
          user_category: userProfile.category,
          matching_skills: scoring.matched_skills,
          skill_gap_score: userProfile.priority_gaps[0]?.gap_score,
          course_difficulty: rec.difficulty_level
        });
        
        // Get course details from PostgreSQL for enrichment
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
        
        const courseDetails = courseResult.rows[0] || {};
        
        enhancedRecommendations.push({
          // Course basic info
          course_id: rec.course_id,
          name_ar: rec.name_ar || courseDetails.name_ar,
          name_en: rec.name_en || courseDetails.name_en,
          description_ar: rec.description_ar || courseDetails.description_ar,
          description_en: rec.description_en || courseDetails.description_en,
          url: rec.url || courseDetails.url,
          provider: rec.provider || courseDetails.provider,
          duration_hours: rec.duration_hours || courseDetails.duration_hours,
          difficulty_level: rec.difficulty_level || courseDetails.difficulty_level,
          subject: rec.subject || courseDetails.subject,
          
          // Recommendation scoring
          recommendation_score: scoring.total_score,
          score_breakdown: scoring.breakdown,
          matching_skills: scoring.matched_skills,
          
          // AI enrichment data
          enrichment: enrichment ? {
            extracted_skills: enrichment.extracted_skills,
            learning_outcomes: enrichment.learning_outcomes,
            target_audience: enrichment.target_audience,
            career_paths: enrichment.career_paths,
            quality_indicators: enrichment.quality_indicators,
            summary_ar: enrichment.summary_ar,
            summary_en: enrichment.summary_en
          } : null,
          
          // Recommendation reason (key feature)
          recommendation_reason: reason,
          
          // User context
          user_category: userProfile.category.key,
          user_category_label_ar: userProfile.category.label_ar,
          user_category_label_en: userProfile.category.label_en,
          
          // Metadata
          source: 'neo4j_enhanced',
          status: 'recommended'
        });
      } catch (error) {
        console.error(`Error enhancing recommendation for course ${rec.course_id}:`, error.message);
      }
    }
    
    // Sort by recommendation score and return top results
    enhancedRecommendations.sort((a, b) => b.recommendation_score - a.recommendation_score);
    
    const topRecommendations = enhancedRecommendations.slice(0, limit);
    
    console.log(`✅ Generated ${topRecommendations.length} enhanced recommendations`);
    
    return topRecommendations;
  } catch (error) {
    console.error('Error generating enhanced recommendations:', error);
    throw error;
  }
}

/**
 * Store recommendations with reasons in the database
 * @param {string} userId - User ID
 * @param {string} analysisId - Analysis result ID
 * @param {Array} recommendations - Enhanced recommendations
 * @param {Object} examContext - Exam context
 * @returns {Promise<Array>} Stored recommendation records
 */
async function storeRecommendationsWithReasons(userId, analysisId, recommendations, examContext) {
  const storedRecommendations = [];
  
  for (const rec of recommendations) {
    try {
      // Check if recommendation already exists
      const existing = await db.query(`
        SELECT id FROM training_recommendations 
        WHERE user_id = $1 AND course_url = $2
      `, [userId, rec.url]);
      
      if (existing.rows.length > 0) {
        // Update existing
        await db.query(`
          UPDATE training_recommendations
          SET recommendation_reason = $1,
              source_exam_id = $2,
              user_proficiency_category = $3,
              updated_at = NOW()
          WHERE id = $4
        `, [
          JSON.stringify(rec.recommendation_reason),
          examContext.test_id,
          rec.user_category,
          existing.rows[0].id
        ]);
        storedRecommendations.push({ id: existing.rows[0].id, action: 'updated' });
      } else {
        // Get skill ID from matching skills
        let skillId = null;
        if (rec.matching_skills && rec.matching_skills.length > 0) {
          const skillResult = await db.query(`
            SELECT id FROM skills 
            WHERE name_ar = $1 OR name_en = $1
            LIMIT 1
          `, [rec.matching_skills[0]]);
          skillId = skillResult.rows[0]?.id || null;
        }
        
        // Insert new recommendation
        const result = await db.query(`
          INSERT INTO training_recommendations (
            analysis_id, user_id, skill_id,
            course_title_ar, course_title_en,
            course_description_ar, course_description_en,
            course_url, provider, duration_hours, difficulty_level,
            priority, source, status,
            recommendation_reason, source_exam_id, user_proficiency_category
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id
        `, [
          analysisId,
          userId,
          skillId,
          rec.name_ar,
          rec.name_en,
          rec.description_ar,
          rec.description_en,
          rec.url,
          rec.provider,
          rec.duration_hours,
          rec.difficulty_level,
          1, // priority
          'neo4j_enhanced',
          'recommended',
          JSON.stringify(rec.recommendation_reason),
          examContext.test_id,
          rec.user_category
        ]);
        
        storedRecommendations.push({ id: result.rows[0].id, action: 'created' });
      }
    } catch (error) {
      console.error(`Error storing recommendation for course ${rec.course_id}:`, error.message);
    }
  }
  
  return storedRecommendations;
}

/**
 * Get skill-based course recommendations from PostgreSQL
 * This does NOT rely on Neo4j graph relationships - it directly matches
 * skills from:
 * 1. course_skills table (PostgreSQL skill relationships)
 * 2. course_enrichments table (AI-extracted skills)
 * 
 * Matching is based on skill names and levels, not graph traversal
 * 
 * @param {Array} userGaps - User's skill gaps from analysis_results
 * @param {string} userCategoryKey - User's proficiency category (beginner/intermediate/advanced)
 * @param {number} limit - Maximum courses to return
 * @returns {Promise<Array>} Recommended courses
 */
async function getSkillBasedRecommendations(userGaps, userCategoryKey, limit = 20) {
  if (!userGaps || userGaps.length === 0) {
    return [];
  }

  // Get valid difficulty levels for this user (ensure lowercase for comparison)
  const validLevels = getValidDifficultyLevels(userCategoryKey).map(l => l.toLowerCase());
  
  // Build skill matching criteria
  const skillIds = userGaps.map(g => g.skill_id).filter(Boolean);
  const skillNames = userGaps.flatMap(g => [
    g.skill_name_ar,
    g.skill_name_en
  ]).filter(Boolean).map(s => s.toLowerCase());

  console.log(`🔍 Searching courses for ${skillIds.length} skill IDs and ${skillNames.length} skill names`);
  console.log(`📊 Valid difficulty levels: ${validLevels.join(', ')}`);
  console.log(`🎯 Skill IDs: ${skillIds.slice(0, 3).join(', ')}${skillIds.length > 3 ? '...' : ''}`);
  console.log(`🎯 Skill names: ${skillNames.slice(0, 5).join(', ')}${skillNames.length > 5 ? '...' : ''}`);

  // Query 1: Get courses that have matching skills via course_skills table
  // Match by skill ID OR by skill name (more flexible matching)
  const coursesWithSkillsQuery = `
    SELECT DISTINCT 
      c.id as course_id,
      c.name_ar,
      c.name_en,
      c.description_ar,
      c.description_en,
      c.url,
      c.provider,
      c.duration_hours,
      c.difficulty_level,
      c.subject,
      c.university,
      c.price,
      c.language,
      cs.relevance_score,
      s.id as matched_skill_id,
      s.name_ar as matched_skill_name_ar,
      s.name_en as matched_skill_name_en
    FROM courses c
    INNER JOIN course_skills cs ON c.id = cs.course_id
    INNER JOIN skills s ON cs.skill_id = s.id
    WHERE (
      cs.skill_id = ANY($1)
      OR LOWER(s.name_ar) = ANY($3)
      OR LOWER(s.name_en) = ANY($3)
    )
    AND (c.difficulty_level IS NULL OR c.difficulty_level = '' OR LOWER(c.difficulty_level) = ANY($2))
    ORDER BY cs.relevance_score DESC
  `;

  // Query 2: Get courses with AI-extracted skills matching user's gaps
  // Also query courses by name/description matching skill names
  const coursesWithAISkillsQuery = `
    SELECT 
      c.id as course_id,
      c.name_ar,
      c.name_en,
      c.description_ar,
      c.description_en,
      c.url,
      c.provider,
      c.duration_hours,
      c.difficulty_level,
      c.subject,
      c.university,
      c.price,
      c.language,
      ce.extracted_skills,
      ce.learning_outcomes,
      ce.target_audience,
      ce.career_paths,
      ce.quality_indicators,
      ce.summary_ar,
      ce.summary_en
    FROM courses c
    LEFT JOIN course_enrichments ce ON c.id::text = ce.course_id
    WHERE (c.difficulty_level IS NULL OR c.difficulty_level = '' OR LOWER(c.difficulty_level) = ANY($1))
  `;

  try {
    // Execute both queries in parallel
    const [skillMatchResult, aiSkillResult] = await Promise.all([
      db.query(coursesWithSkillsQuery, [skillIds, validLevels, skillNames]),
      db.query(coursesWithAISkillsQuery, [validLevels])
    ]);

    console.log(`📚 Found ${skillMatchResult.rows.length} courses with direct skill match`);
    console.log(`🤖 Found ${aiSkillResult.rows.length} courses with AI enrichment`);

    // Build a map of courses with their matched skills
    const courseMap = new Map();

    // Process direct skill matches (higher priority)
    for (const row of skillMatchResult.rows) {
      if (!courseMap.has(row.course_id)) {
        courseMap.set(row.course_id, {
          course_id: row.course_id,
          name_ar: row.name_ar,
          name_en: row.name_en,
          description_ar: row.description_ar,
          description_en: row.description_en,
          url: row.url,
          provider: row.provider,
          duration_hours: row.duration_hours,
          difficulty_level: row.difficulty_level,
          subject: row.subject,
          university: row.university,
          price: row.price,
          language: row.language,
          matched_skills: [],
          skill_match_source: 'postgresql',
          total_relevance: 0,
          ai_extracted_skills: [],
          enrichment: null
        });
      }
      
      const course = courseMap.get(row.course_id);
      course.matched_skills.push({
        skill_id: row.matched_skill_id,
        skill_name_ar: row.matched_skill_name_ar,
        skill_name_en: row.matched_skill_name_en,
        relevance_score: row.relevance_score
      });
      course.total_relevance += parseFloat(row.relevance_score || 0);
    }

    // Process AI-enriched courses and match against user skill names
    // Also match on course name/description if no AI skills
    for (const row of aiSkillResult.rows) {
      // Skip if already matched by direct skill match
      if (courseMap.has(row.course_id)) {
        // Just add enrichment data if available
        const course = courseMap.get(row.course_id);
        const extractedSkills = row.extracted_skills || [];
        if (extractedSkills.length > 0) {
          course.enrichment = {
            extracted_skills: extractedSkills,
            learning_outcomes: row.learning_outcomes,
            target_audience: row.target_audience,
            career_paths: row.career_paths,
            quality_indicators: row.quality_indicators,
            summary_ar: row.summary_ar,
            summary_en: row.summary_en
          };
        }
        continue;
      }

      const extractedSkills = row.extracted_skills || [];
      const matchedAISkills = [];
      
      // Check if any AI-extracted skills match user's gaps
      for (const aiSkill of extractedSkills) {
        const aiSkillLower = (typeof aiSkill === 'string' ? aiSkill : '').toLowerCase();
        
        for (const skillName of skillNames) {
          if (aiSkillLower && skillName && (
            aiSkillLower.includes(skillName) ||
            skillName.includes(aiSkillLower) ||
            calculateStringSimilarity(aiSkillLower, skillName) > 0.5
          )) {
            matchedAISkills.push(aiSkill);
            break;
          }
        }
      }
      
      // Also check course name and description for skill matches
      const courseNameAr = (row.name_ar || '').toLowerCase();
      const courseNameEn = (row.name_en || '').toLowerCase();
      const courseDescAr = (row.description_ar || '').toLowerCase();
      const courseSubject = (row.subject || '').toLowerCase();
      
      const nameDescMatches = [];
      for (const skillName of skillNames) {
        if (skillName && (
          courseNameAr.includes(skillName) ||
          courseNameEn.includes(skillName) ||
          courseDescAr.includes(skillName) ||
          courseSubject.includes(skillName)
        )) {
          // Extract original skill name for this match
          const originalSkill = userGaps.find(g => 
            (g.skill_name_ar || '').toLowerCase() === skillName ||
            (g.skill_name_en || '').toLowerCase() === skillName
          );
          if (originalSkill) {
            nameDescMatches.push(originalSkill.skill_name_ar || originalSkill.skill_name_en);
          }
        }
      }

      // Include course if it has any matches
      const allMatches = [...new Set([...matchedAISkills, ...nameDescMatches])];
      if (allMatches.length > 0) {
        courseMap.set(row.course_id, {
          course_id: row.course_id,
          name_ar: row.name_ar,
          name_en: row.name_en,
          description_ar: row.description_ar,
          description_en: row.description_en,
          url: row.url,
          provider: row.provider,
          duration_hours: row.duration_hours,
          difficulty_level: row.difficulty_level,
          subject: row.subject,
          university: row.university,
          price: row.price,
          language: row.language,
          matched_skills: [],
          skill_match_source: matchedAISkills.length > 0 ? 'ai_extracted' : 'name_description_match',
          total_relevance: 0,
          ai_extracted_skills: allMatches,
          enrichment: extractedSkills.length > 0 ? {
            extracted_skills: extractedSkills,
            learning_outcomes: row.learning_outcomes,
            target_audience: row.target_audience,
            career_paths: row.career_paths,
            quality_indicators: row.quality_indicators,
            summary_ar: row.summary_ar,
            summary_en: row.summary_en
          } : null
        });
      }
    }

    // Convert map to array and calculate final scores
    const recommendations = Array.from(courseMap.values()).map(course => {
      // Calculate recommendation score
      const directSkillMatchCount = course.matched_skills.length;
      const aiSkillMatchCount = course.ai_extracted_skills.length;
      const totalSkillMatch = directSkillMatchCount + aiSkillMatchCount;
      
      // Score based on:
      // - Number of matched skills (40%)
      // - Relevance scores from course_skills (30%)
      // - AI skill matches (20%)
      // - Difficulty alignment (10%)
      const skillMatchScore = Math.min(100, (totalSkillMatch / Math.max(1, userGaps.length)) * 100);
      const relevanceScore = Math.min(100, course.total_relevance * 50);
      const aiMatchScore = aiSkillMatchCount > 0 ? Math.min(100, aiSkillMatchCount * 25) : 0;
      
      // Difficulty alignment score
      let difficultyScore = 50;
      if (course.difficulty_level) {
        if (course.difficulty_level === userCategoryKey) {
          difficultyScore = 100;
        } else if (validLevels.includes(course.difficulty_level)) {
          difficultyScore = 80;
        }
      }

      const recommendationScore = (
        skillMatchScore * 0.40 +
        relevanceScore * 0.30 +
        aiMatchScore * 0.20 +
        difficultyScore * 0.10
      );

      return {
        ...course,
        recommendation_score: Math.round(recommendationScore),
        score_breakdown: {
          skill_match: Math.round(skillMatchScore),
          relevance: Math.round(relevanceScore),
          ai_match: Math.round(aiMatchScore),
          difficulty_alignment: Math.round(difficultyScore)
        },
        matching_skills: [
          ...course.matched_skills.map(s => s.skill_name_ar || s.skill_name_en),
          ...course.ai_extracted_skills
        ],
        source: 'skill_based_postgresql'
      };
    });

    // Sort by recommendation score and limit
    recommendations.sort((a, b) => b.recommendation_score - a.recommendation_score);
    
    console.log(`✅ Generated ${recommendations.length} skill-based recommendations`);
    
    return recommendations.slice(0, limit);
  } catch (error) {
    console.error('Error getting skill-based recommendations:', error);
    throw error;
  }
}

/**
 * Generate test-based recommendations that rely on skill + level matching
 * This is the main function for test result recommendations
 * Does NOT rely on Neo4j graph relationships
 * 
 * @param {string} userId - User ID
 * @param {Object} analysisResult - Analysis result with gaps and scores
 * @param {Object} examContext - Test/exam context for recommendation reasons
 * @param {number} limit - Maximum recommendations to return
 * @returns {Promise<Array>} Enhanced recommendations with reasons
 */
async function generateTestBasedRecommendations(userId, analysisResult, examContext, limit = 10) {
  try {
    // Generate user profile with categorization
    const userProfile = generateUserProfile(analysisResult);
    userProfile.department = examContext.department || null;
    
    console.log(`🎯 Generating skill-based recommendations for user ${userId}`);
    console.log(`   Category: ${userProfile.category.label_en} (${userProfile.overall_score}%)`);
    console.log(`   Priority gaps: ${userProfile.priority_gaps.length}`);
    
    // Get skill-based recommendations from PostgreSQL
    // This matches skills directly without Neo4j graph traversal
    const skillBasedRecs = await getSkillBasedRecommendations(
      userProfile.priority_gaps,
      userProfile.category.key,
      limit * 2 // Get more than needed for filtering
    );
    
    console.log(`📊 Got ${skillBasedRecs.length} skill-based recommendations`);
    
    // Enhance each recommendation with reasons
    const enhancedRecommendations = skillBasedRecs.map(rec => {
      // Generate recommendation reason
      const reason = generateRecommendationReason({
        exam_name_ar: examContext.test_title_ar,
        exam_name_en: examContext.test_title_en,
        exam_id: examContext.test_id,
        analyzed_at: analysisResult.analyzed_at,
        user_category: userProfile.category,
        matching_skills: rec.matching_skills,
        skill_gap_score: userProfile.priority_gaps[0]?.gap_score,
        course_difficulty: rec.difficulty_level
      });
      
      return {
        ...rec,
        recommendation_reason: reason,
        user_category: userProfile.category.key,
        user_category_label_ar: userProfile.category.label_ar,
        user_category_label_en: userProfile.category.label_en,
        status: 'recommended'
      };
    });
    
    // Return top recommendations
    const topRecommendations = enhancedRecommendations.slice(0, limit);
    
    console.log(`✅ Generated ${topRecommendations.length} enhanced skill-based recommendations`);
    
    return topRecommendations;
  } catch (error) {
    console.error('Error generating test-based recommendations:', error);
    throw error;
  }
}

module.exports = {
  fetchCourseEnrichment,
  calculateSkillMatchScore,
  calculateDifficultyScore,
  calculateOutcomesScore,
  calculateQualityScore,
  calculateCareerScore,
  calculateRecommendationScore,
  generateEnhancedRecommendations,
  storeRecommendationsWithReasons,
  getSkillBasedRecommendations,
  generateTestBasedRecommendations,
  SCORING_WEIGHTS
};
