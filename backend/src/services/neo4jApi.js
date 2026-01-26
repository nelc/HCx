const axios = require('axios');

// OAuth2 Token Cache
let tokenCache = {
  token: null,
  expiresAt: null
};

/**
 * Get OAuth2 access token using client credentials flow for Neo4j API
 */
async function getAccessToken() {
  // Check if we have a valid cached token
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  try {
    const clientId = process.env.NEO4J_CLIENT_ID;
    const clientSecret = process.env.NEO4J_CLIENT_SECRET;
    const tokenUrl = process.env.NEO4J_TOKEN_URL || 'https://api.nelc.gov.sa/oauth2/v1/token';

    if (!clientId || !clientSecret) {
      throw new Error('NEO4J_CLIENT_ID and NEO4J_CLIENT_SECRET must be set in environment variables');
    }

    // Prepare form data
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'neo4j');

    const response = await axios.post(
      tokenUrl,
      params.toString(),
      {
        auth: {
          username: clientId,
          password: clientSecret
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in } = response.data;
    
    if (!access_token) {
      throw new Error('No access token received from OAuth2 server');
    }
    
    // Cache the token (expires 5 minutes before actual expiry for safety)
    const expiresInSeconds = expires_in || 3600; // Default to 1 hour if not provided
    tokenCache.token = access_token;
    tokenCache.expiresAt = Date.now() + ((expiresInSeconds - 300) * 1000);

    console.log('✅ Neo4j OAuth2 token obtained successfully');
    return access_token;
  } catch (error) {
    console.error('Failed to get Neo4j OAuth2 token:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    // Check if credentials are missing
    if (!process.env.NEO4J_CLIENT_ID || !process.env.NEO4J_CLIENT_SECRET) {
      throw {
        status: 500,
        message: 'Neo4j API credentials not configured. Please set NEO4J_CLIENT_ID and NEO4J_CLIENT_SECRET in environment variables.',
        code: 'CONFIG_ERROR'
      };
    }
    
    throw {
      status: error.response?.status || 500,
      message: `Failed to authenticate with Neo4j API: ${error.message}`,
      code: 'AUTH_ERROR',
      originalError: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
}

/**
 * Make an authenticated request to the Neo4j API
 */
async function makeRequest(method, endpoint, options = {}) {
  try {
    const token = await getAccessToken();
    const baseUrl = process.env.NEO4J_BASE_URL || 'https://api.nelc.gov.sa/neo4j/v1';
    // Determine is_prod value from env (default to false for non-production)
    const isProdBoolean = process.env.NEO4J_IS_PROD === 'true';
    const isProdString = isProdBoolean ? 'true' : 'false';

    const config = {
      method,
      url: `${baseUrl}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    if (options.data) {
      // For POST body (like /query), use boolean; for /node, /relationship use boolean too
      config.data = { ...options.data, is_prod: isProdBoolean };
    }

    if (options.params) {
      // For GET query params (like /schema, /indexes), use string
      config.params = { ...options.params, is_prod: isProdString };
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Neo4j API request failed (${method} ${endpoint}):`, error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      throw {
        status: error.response.status,
        message: error.response.data?.message || error.message || 'Neo4j API request failed',
        code: error.response.data?.code,
        tracking_id: error.response.data?.tracking_id
      };
    } else if (error.request) {
      console.error('No response received from Neo4j API');
      throw {
        status: 503,
        message: 'Neo4j API is not responding. Please check the service availability.',
        code: 'SERVICE_UNAVAILABLE'
      };
    } else {
      console.error('Error setting up request:', error.message);
      throw {
        status: 500,
        message: error.message || 'Failed to make request to Neo4j API',
        code: 'REQUEST_ERROR'
      };
    }
  }
}

/**
 * Create a Course node in Neo4j
 */
async function createCourseNode(courseData) {
  return await makeRequest('POST', '/node', {
    data: {
      label: 'Course',
      id_key: 'course_id',
      id_value: courseData.id,
      props: {
        name_ar: courseData.name_ar,
        name_en: courseData.name_en || '',
        description_ar: courseData.description_ar || '',
        description_en: courseData.description_en || '',
        url: courseData.url || '',
        provider: courseData.provider || '',
        duration_hours: courseData.duration_hours ? parseFloat(courseData.duration_hours) : 0,
        difficulty_level: courseData.difficulty_level || 'beginner',
        language: courseData.language || 'ar',
        subject: courseData.subject || '',
        subtitle: courseData.subtitle || '',
        university: courseData.university || ''
      }
    }
  });
}

/**
 * Create a Skill node in Neo4j
 */
async function createSkillNode(skillData) {
  return await makeRequest('POST', '/node', {
    data: {
      label: 'Skill',
      id_key: 'skill_id',
      id_value: skillData.id,
      props: {
        name_ar: skillData.name_ar,
        name_en: skillData.name_en || '',
        description_ar: skillData.description_ar || '',
        weight: skillData.weight ? parseFloat(skillData.weight) : 1.0
      }
    }
  });
}

/**
 * Create a User node in Neo4j
 */
async function createUserNode(userData) {
  return await makeRequest('POST', '/node', {
    data: {
      label: 'User',
      id_key: 'user_id',
      id_value: userData.id,
      props: {
        name_ar: userData.name_ar,
        name_en: userData.name_en || '',
        email: userData.email,
        role: userData.role,
        department_id: userData.department_id || ''
      }
    }
  });
}

/**
 * Create relationship between Course and Skill (Course -ALIGNS_TO_SKILL-> Skill)
 */
async function createCourseSkillRelationship(courseId, skillId, relevanceScore = 1.0) {
  return await makeRequest('POST', '/relationship', {
    data: {
      from_label: 'Course',
      from_key: 'course_id',
      from_id: courseId,
      rel_type: 'ALIGNS_TO_SKILL',
      to_label: 'Skill',
      to_key: 'skill_id',
      to_id: skillId,
      props: {
        relevance_score: parseFloat(relevanceScore)
      }
    }
  });
}

/**
 * Create relationship between User and Skill (User -NEEDS-> Skill)
 * Used to represent skill gaps from assessment results
 */
async function createUserSkillGap(userId, skillId, gapScore, priority = null) {
  const calculatedPriority = priority || Math.ceil(gapScore / 20); // 1-5 priority based on gap score
  
  return await makeRequest('POST', '/relationship', {
    data: {
      from_label: 'User',
      from_key: 'user_id',
      from_id: userId,
      rel_type: 'NEEDS',
      to_label: 'Skill',
      to_key: 'skill_id',
      to_id: skillId,
      props: {
        gap_score: parseFloat(gapScore),
        priority: parseInt(calculatedPriority)
      }
    }
  });
}

/**
 * Delete all relationships for a specific node
 */
async function deleteNodeRelationships(label, idKey, idValue) {
  const query = `
    MATCH (n:${label} {${idKey}: '${idValue}'})-[r]-()
    DELETE r
    RETURN count(r) as deleted_count
  `;
  
  return await makeRequest('POST', '/query', {
    data: { query }
  });
}

/**
 * Delete a node from Neo4j
 */
async function deleteNode(label, idKey, idValue) {
  const query = `
    MATCH (n:${label} {${idKey}: '${idValue}'})
    DELETE n
    RETURN count(n) as deleted_count
  `;
  
  return await makeRequest('POST', '/query', {
    data: { query }
  });
}

/**
 * Update a course node (delete and recreate)
 */
async function updateCourseNode(courseData) {
  try {
    // Delete existing node and relationships
    await deleteNodeRelationships('Course', 'course_id', courseData.id);
    await deleteNode('Course', 'course_id', courseData.id);
  } catch (error) {
    // If node doesn't exist, that's fine - we'll create it
    console.log('Node may not exist, creating new one');
  }
  
  // Create new node with updated data
  return await createCourseNode(courseData);
}

/**
 * Get course recommendations for a user using graph traversal
 * Matches User -NEEDS-> Skill <-ALIGNS_TO_SKILL- Course
 * Returns courses ranked by relevance score (gap_score * relevance_score)
 * PRIORITIZES English skill names (s.skill_name) in output
 */
async function getRecommendationsForUser(userId, limit = 10) {
  const query = `
    MATCH (u:User {user_id: '${userId}'})-[n:NEEDS]->(s:Skill)<-[t:ALIGNS_TO_SKILL]-(c:Course)
    WITH c, s, n, t, (n.gap_score * t.relevance_score) as match_score
    WITH c, 
         collect(DISTINCT s.skill_name) as matching_skills,
         SUM(match_score) as base_score,
         count(DISTINCT s) as skill_coverage,
         MAX(n.priority) as max_priority
    WITH c, matching_skills, skill_coverage, max_priority,
         base_score * (1.0 + (skill_coverage - 1) * 0.15) as recommendation_score
    OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
    RETURN 
      c.course_id as course_id,
      c.course_name as name_ar,
      c.course_name_en as name_en,
      c.course_description as description_ar,
      c.course_description_en as description_en,
      c.course_URL as url,
      c.course_language as language,
      matching_skills,
      recommendation_score,
      skill_coverage,
      max_priority,
      src.source_name as platform
    ORDER BY recommendation_score DESC, max_priority DESC, skill_coverage DESC
    LIMIT ${limit}
  `;
  
  return await makeRequest('POST', '/query', {
    data: { query }
  });
}

/**
 * Build domain match conditions for Neo4j query with synonym support
 * @param {string} domainAr - Arabic domain name
 * @param {string} domainEn - English domain name
 * @param {string} domainId - Domain ID for synonym lookup
 * @param {Object} synonymMap - Map of domain_id to array of synonyms
 * @returns {string} Cypher WHERE conditions for domain matching
 */
function buildDomainMatchConditions(domainAr, domainEn, domainId, synonymMap) {
  const allTerms = new Set([domainAr, domainEn]);
  
  // Add synonyms from database
  if (synonymMap && synonymMap[domainId]) {
    synonymMap[domainId].forEach(syn => allTerms.add(syn));
  }
  
  // Build OR conditions for all terms
  const conditions = Array.from(allTerms)
    .filter(term => term && term.trim())
    .map(term => {
      const escaped = term.replace(/'/g, "\\'");
      return `toLower(c.subject) CONTAINS toLower('${escaped}')`;
    })
    .join(' OR ');
  
  return conditions || 'true'; // Fallback to true if no terms
}

/**
 * Get valid difficulty levels for a user's proficiency category
 * Users can take courses at their level or below
 * Aligned with PROFICIENCY_LEVELS in userCategorizer.js
 * @param {string} difficulty - The recommended difficulty level (beginner/intermediate/advanced)
 * @returns {Array} Array of valid difficulty levels
 */
function getValidDifficultyLevels(difficulty) {
  switch (difficulty) {
    case 'advanced':
      return ['advanced', 'intermediate', 'beginner'];
    case 'intermediate':
      return ['intermediate', 'beginner'];
    case 'beginner':
    default:
      return ['beginner'];
  }
}

/**
 * Get enhanced course recommendations for a user using graph traversal
 * Matches User -NEEDS-> Skill <-ALIGNS_TO_SKILL- Course
 * The key matching is through skill relationships - if a course teaches a skill the user needs,
 * it's relevant regardless of the course's subject category.
 * Filters courses by:
 * - Skill match through graph relationships (Course -ALIGNS_TO_SKILL-> Skill <-NEEDS- User)
 * - Difficulty level based on skill proficiency (users can see courses at or below their level)
 * Returns courses ranked by relevance score (gap_score * relevance_score)
 * PRIORITIZES English skill names (s.skill_name) in matching output
 */
async function getEnhancedRecommendationsForUser(userId, skillRequirements, synonymMap = {}, limit = 10) {
  // Build WHERE conditions for each skill with flexible difficulty matching
  // The key matching is through skill relationships: Course -ALIGNS_TO_SKILL-> Skill <-NEEDS- User
  // Domain matching is NOT required - if a course teaches the skill the user needs, it's relevant
  // regardless of the course's subject category
  const skillConditions = Object.entries(skillRequirements).map(([skillId, req]) => {
    // Get all valid difficulty levels for this user's proficiency
    const validLevels = getValidDifficultyLevels(req.difficulty);
    const difficultyCondition = validLevels.map(level => `toLower(c.difficulty_level) = '${level}'`).join(' OR ');
    
    return `(
      s.skill_id = '${skillId}' 
      AND n.gap_score > 0
      AND (${difficultyCondition} OR c.difficulty_level IS NULL OR c.difficulty_level = '')
    )`;
  }).join(' OR ');

  // If no skill conditions, return empty results
  if (!skillConditions || skillConditions === '') {
    return [];
  }

  // Query prioritizes English skill names in output using COALESCE
  const query = `
    MATCH (u:User {user_id: '${userId}'})-[n:NEEDS]->(s:Skill)<-[t:ALIGNS_TO_SKILL]-(c:Course)
    WHERE ${skillConditions}
    WITH c, s, n, t, (n.gap_score * t.relevance_score) as match_score
    WITH c, 
         collect(DISTINCT s.skill_name) as matching_skills,
         SUM(match_score) as base_score,
         count(DISTINCT s) as skill_coverage,
         MAX(n.priority) as max_priority
    WITH c, matching_skills, skill_coverage, max_priority,
         base_score * (1.0 + (skill_coverage - 1) * 0.15) as recommendation_score
    OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
    RETURN 
      c.course_id as course_id,
      c.course_name as name_ar,
      c.course_name_en as name_en,
      c.course_description as description_ar,
      c.course_description_en as description_en,
      c.course_URL as url,
      c.course_language as language,
      matching_skills,
      recommendation_score,
      skill_coverage,
      max_priority,
      src.source_name as platform
    ORDER BY recommendation_score DESC, max_priority DESC, skill_coverage DESC
    LIMIT ${limit}
  `;
  
  console.log('📊 Enhanced Neo4j Query (English-first skills):', query);
  
  return await makeRequest('POST', '/query', {
    data: { query }
  });
}

/**
 * Check if a node exists in Neo4j
 */
async function nodeExists(label, idKey, idValue) {
  const query = `
    MATCH (n:${label} {${idKey}: '${idValue}'})
    RETURN count(n) as count
  `;
  
  try {
    const result = await makeRequest('POST', '/query', {
      data: { query }
    });
    return result && result.count > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Sync all existing skills to Neo4j
 * Useful for initial setup
 */
async function syncAllSkills(skills) {
  const results = {
    total: skills.length,
    success: 0,
    failed: 0,
    errors: []
  };

  for (const skill of skills) {
    try {
      await createSkillNode(skill);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        skill_id: skill.id,
        skill_name: skill.name_ar,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Search and list all courses from Neo4j database
 * @param {Object} filters - Search filters
 * @param {string} filters.search - Search term for name/description
 * @param {string} filters.difficulty_level - Filter by difficulty (beginner/intermediate/advanced)
 * @param {string} filters.language - Filter by language (ar/en)
 * @param {string} filters.subject - Filter by subject/domain
 * @param {string} filters.provider - Filter by provider
 * @param {string} filters.skill - Filter by skill name (courses that teach this skill)
 * @param {number} skip - Number of records to skip (for pagination)
 * @param {number} limit - Maximum number of courses to return
 * @returns {Promise<Object>} Object with courses array and total count
 */
async function searchCourses(filters = {}, skip = 0, limit = 20) {
  const { search, difficulty_level, language, subject, provider, university, domain, skill } = filters;
  
  // Build WHERE conditions
  const conditions = [];
  
  if (search) {
    const escaped = search.replace(/'/g, "\\'");
    conditions.push(`(
      toLower(c.course_name) CONTAINS toLower('${escaped}') OR
      toLower(c.course_name_en) CONTAINS toLower('${escaped}')
    )`);
  }
  
  if (difficulty_level) {
    const escaped = difficulty_level.replace(/'/g, "\\'");
    // Use case-insensitive match
    conditions.push(`toLower(c.difficulty_level) = toLower('${escaped}')`);
  }
  
  if (language) {
    conditions.push(`c.course_language = '${language}'`);
  }
  
  if (subject) {
    const escaped = subject.replace(/'/g, "\\'");
    // Use exact match since values come from database dropdown
    conditions.push(`c.subject = '${escaped}'`);
  }
  
  if (provider) {
    const escaped = provider.replace(/'/g, "\\'");
    conditions.push(`c.provider = '${escaped}'`);
  }
  
  if (university) {
    const escaped = university.replace(/'/g, "\\'");
    conditions.push(`c.university = '${escaped}'`);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Domain filter requires matching through relationship
  const domainFilter = domain ? `
    MATCH (c)-[:BELONGS_TO]->(d:Domain)
    WHERE toLower(d.name_ar) CONTAINS toLower('${domain.replace(/'/g, "\\'")}') OR toLower(d.name_en) CONTAINS toLower('${domain.replace(/'/g, "\\'")}')
  ` : '';
  
  // If filtering by skill or domain, use different query patterns
  // OPTIMIZED: All queries now apply pagination BEFORE expensive skill collection
  let query;
  if (skill && domain) {
    // Both skill and domain filters
    const escapedSkill = skill.replace(/'/g, "\\'");
    const escapedDomain = domain.replace(/'/g, "\\'");
    query = `
      MATCH (c:Course)-[t:ALIGNS_TO_SKILL]->(s:Skill)
      MATCH (c)-[:BELONGS_TO]->(d:Domain)
      WHERE toLower(s.skill_name) CONTAINS toLower('${escapedSkill}')
      AND (toLower(d.name_ar) CONTAINS toLower('${escapedDomain}') OR toLower(d.name_en) CONTAINS toLower('${escapedDomain}'))
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      WITH DISTINCT c ORDER BY c.course_name SKIP ${skip} LIMIT ${limit}
      OPTIONAL MATCH (c)-[t2:ALIGNS_TO_SKILL]->(s2:Skill)
      WITH c, collect(DISTINCT {name_ar: s2.skill_name, name_en: s2.skill_name, relevance: t2.relevance_score}) as skills
      OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
      RETURN 
        c.course_id as course_id,
        c.course_name as name_ar,
        c.course_name_en as name_en,
        c.course_description as description_ar,
        c.course_description_en as description_en,
        c.course_URL as url,
        c.course_language as language,
        skills,
        src.source_name as platform
    `;
  } else if (skill) {
    // Only skill filter
    const escapedSkill = skill.replace(/'/g, "\\'");
    query = `
      MATCH (c:Course)-[t:ALIGNS_TO_SKILL]->(s:Skill)
      WHERE toLower(s.skill_name) CONTAINS toLower('${escapedSkill}')
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      WITH DISTINCT c ORDER BY c.course_name SKIP ${skip} LIMIT ${limit}
      OPTIONAL MATCH (c)-[t2:ALIGNS_TO_SKILL]->(s2:Skill)
      WITH c, collect(DISTINCT {name_ar: s2.skill_name, name_en: s2.skill_name, relevance: t2.relevance_score}) as skills
      OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
      RETURN 
        c.course_id as course_id,
        c.course_name as name_ar,
        c.course_name_en as name_en,
        c.course_description as description_ar,
        c.course_description_en as description_en,
        c.course_URL as url,
        c.course_language as language,
        skills,
        src.source_name as platform
    `;
  } else if (domain) {
    // Only domain filter
    const escapedDomain = domain.replace(/'/g, "\\'");
    query = `
      MATCH (c:Course)-[:BELONGS_TO]->(d:Domain)
      WHERE (toLower(d.name_ar) CONTAINS toLower('${escapedDomain}') OR toLower(d.name_en) CONTAINS toLower('${escapedDomain}'))
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      WITH DISTINCT c ORDER BY c.course_name SKIP ${skip} LIMIT ${limit}
      OPTIONAL MATCH (c)-[t:ALIGNS_TO_SKILL]->(s:Skill)
      WITH c, collect(DISTINCT {name_ar: s.skill_name, name_en: s.skill_name, relevance: t.relevance_score}) as skills
      OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
      RETURN 
        c.course_id as course_id,
        c.course_name as name_ar,
        c.course_name_en as name_en,
        c.course_description as description_ar,
        c.course_description_en as description_en,
        c.course_URL as url,
        c.course_language as language,
        skills,
        src.source_name as platform
    `;
  } else {
    // No skill or domain filter
    // Add condition to only show courses with actual titles (not empty placeholders)
    const titleCondition = `((c.course_name IS NOT NULL AND c.course_name <> '') OR (c.course_name_en IS NOT NULL AND c.course_name_en <> ''))`;
    const fullWhereClause = whereClause 
      ? `${whereClause} AND ${titleCondition}`
      : `WHERE ${titleCondition}`;
    
    // OPTIMIZED: Apply pagination BEFORE expensive skill collection to reduce memory usage
    query = `
      MATCH (c:Course)
      ${fullWhereClause}
      WITH c ORDER BY c.course_name SKIP ${skip} LIMIT ${limit}
      OPTIONAL MATCH (c)-[t:ALIGNS_TO_SKILL]->(s:Skill)
      WITH c, collect(DISTINCT {name_ar: s.skill_name, name_en: s.skill_name, relevance: t.relevance_score}) as skills
      OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
      RETURN 
        c.course_id as course_id,
        c.course_name as name_ar,
        c.course_name_en as name_en,
        c.course_description as description_ar,
        c.course_description_en as description_en,
        c.course_URL as url,
        c.course_language as language,
        skills,
        src.source_name as platform
    `;
  }
  
  console.log('🔍 Neo4j Course Search Query:', query);
  
  const result = await makeRequest('POST', '/query', {
    data: { query }
  });
  
  // Get total count (separate query)
  let countQuery;
  if (skill && domain) {
    const escapedSkill = skill.replace(/'/g, "\\'");
    const escapedDomain = domain.replace(/'/g, "\\'");
    countQuery = `
      MATCH (c:Course)-[t:ALIGNS_TO_SKILL]->(s:Skill)
      MATCH (c)-[:BELONGS_TO]->(d:Domain)
      WHERE toLower(s.skill_name) CONTAINS toLower('${escapedSkill}')
      AND (toLower(d.name_ar) CONTAINS toLower('${escapedDomain}') OR toLower(d.name_en) CONTAINS toLower('${escapedDomain}'))
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      RETURN count(DISTINCT c) as total
    `;
  } else if (skill) {
    countQuery = `
      MATCH (c:Course)-[t:ALIGNS_TO_SKILL]->(s:Skill)
      WHERE toLower(s.skill_name) CONTAINS toLower('${skill.replace(/'/g, "\\'")}')
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      RETURN count(DISTINCT c) as total
    `;
  } else if (domain) {
    const escapedDomain = domain.replace(/'/g, "\\'");
    countQuery = `
      MATCH (c:Course)-[:BELONGS_TO]->(d:Domain)
      WHERE (toLower(d.name_ar) CONTAINS toLower('${escapedDomain}') OR toLower(d.name_en) CONTAINS toLower('${escapedDomain}'))
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      RETURN count(DISTINCT c) as total
    `;
  } else {
    // Add same title filter to count query
    const titleCondition = `((c.course_name IS NOT NULL AND c.course_name <> '') OR (c.course_name_en IS NOT NULL AND c.course_name_en <> ''))`;
    const fullWhereClause = whereClause 
      ? `${whereClause} AND ${titleCondition}`
      : `WHERE ${titleCondition}`;
    
    countQuery = `
      MATCH (c:Course)
      ${fullWhereClause}
      RETURN count(c) as total
    `;
  }
  
  let total = 0;
  try {
    const countResult = await makeRequest('POST', '/query', {
      data: { query: countQuery }
    });
    total = countResult?.total || countResult?.[0]?.total || 0;
  } catch (e) {
    console.log('Count query failed, using result length');
    total = Array.isArray(result) ? result.length : 0;
  }
  
  return {
    courses: Array.isArray(result) ? result : (result ? [result] : []),
    total: total
  };
}

/**
 * Get all unique values for course filters (for dropdowns)
 * Returns distinct values for difficulty_level, language, subject, provider, university, domain
 */
async function getCourseFilterOptions() {
  const queries = {
    levels: `MATCH (c:Course) WHERE c.difficulty_level IS NOT NULL RETURN DISTINCT c.difficulty_level as value ORDER BY value`,
    languages: `MATCH (c:Course) WHERE c.course_language IS NOT NULL RETURN DISTINCT c.course_language as value ORDER BY value`,
    subjects: `MATCH (c:Course) WHERE c.subject IS NOT NULL AND c.subject <> '' RETURN DISTINCT c.subject as value ORDER BY value`,
    platforms: `MATCH (c:Course)-[:DERIVED_FROM]->(s:Source) WHERE s.source_name IS NOT NULL AND s.source_name <> '' RETURN DISTINCT s.source_name as value ORDER BY value`,
    universities: `MATCH (c:Course) WHERE c.university IS NOT NULL AND c.university <> '' RETURN DISTINCT c.university as value ORDER BY value`,
    domains: `MATCH (c:Course)-[:BELONGS_TO]->(d:Domain) RETURN DISTINCT d.name_ar as name_ar, d.name_en as name_en ORDER BY d.name_ar`,
    skills: `MATCH (c:Course)-[:ALIGNS_TO_SKILL]->(s:Skill) RETURN DISTINCT s.skill_name as name_ar, s.skill_name as name_en ORDER BY s.skill_name`
  };
  
  const results = {};
  
  for (const [key, query] of Object.entries(queries)) {
    try {
      const result = await makeRequest('POST', '/query', { data: { query } });
      if (key === 'skills') {
        // Return skill names as simple strings for dropdown
        results[key] = Array.isArray(result) ? result.map(r => r.name_ar || r.name_en).filter(v => v) : [];
      } else if (key === 'domains') {
        // Return domain names as simple strings for dropdown
        results[key] = Array.isArray(result) ? result.map(r => r.name_ar || r.name_en).filter(v => v) : [];
      } else {
        results[key] = Array.isArray(result) ? result.map(r => r.value).filter(v => v) : [];
      }
    } catch (e) {
      console.log(`Failed to get ${key}:`, e.message);
      results[key] = [];
    }
  }
  
  return results;
}

/**
 * Find peers with similar skill gaps for collaborative learning suggestions
 * Matches users who share common skill needs in the same department
 * @param {string} userId - The user ID to find peers for
 * @param {number} limit - Maximum number of peers to return (default: 5)
 * @returns {Promise<Array>} Array of peer objects with common gaps
 */
async function findPeersWithSimilarGaps(userId, limit = 5) {
  const query = `
    MATCH (u1:User {user_id: '${userId}'})-[n1:NEEDS]->(s:Skill)<-[n2:NEEDS]-(u2:User)
    WHERE u1.user_id <> u2.user_id 
      AND u1.department_id = u2.department_id
    WITH u2, 
         collect(DISTINCT s.skill_name) as common_gaps,
         count(DISTINCT s) as similarity_score,
         AVG(n1.gap_score) as avg_gap_score
    WHERE similarity_score >= 2
    RETURN 
      u2.user_id as peer_id,
      u2.name_ar as peer_name,
      u2.email as peer_email,
      common_gaps,
      similarity_score,
      avg_gap_score
    ORDER BY similarity_score DESC, avg_gap_score DESC
    LIMIT ${limit}
  `;
  
  try {
    return await makeRequest('POST', '/query', {
      data: { query }
    });
  } catch (error) {
    console.error('Error finding peers with similar gaps:', error);
    return [];
  }
}

/**
 * Get the database schema from Neo4j
 * Returns information about node labels, relationship types, and properties
 */
async function getSchema() {
  return await makeRequest('GET', '/schema', {});
}

/**
 * List all vector indexes in Neo4j
 * Returns available indexes that can be used for vector search
 */
async function listIndexes() {
  return await makeRequest('GET', '/indexes', {});
}

/**
 * Update course node with AI-enriched metadata
 * @param {string} courseId - Course ID
 * @param {Object} enrichment - Enrichment data from courseEnricher
 * @returns {Promise<Object>} Update result
 */
async function updateCourseEnrichment(courseId, enrichment) {
  // Convert arrays to JSON strings for Neo4j storage
  const extractedSkills = JSON.stringify(enrichment.extracted_skills || []);
  const prerequisiteSkills = JSON.stringify(enrichment.prerequisite_skills || []);
  const learningOutcomes = JSON.stringify(enrichment.learning_outcomes || []);
  const targetAudience = JSON.stringify(enrichment.target_audience || {});
  const careerPaths = JSON.stringify(enrichment.career_paths || []);
  const industryTags = JSON.stringify(enrichment.industry_tags || []);
  const topics = JSON.stringify(enrichment.topics || []);
  const difficultyAssessment = JSON.stringify(enrichment.difficulty_assessment || {});
  const qualityIndicators = JSON.stringify(enrichment.quality_indicators || {});
  const keywordsAr = JSON.stringify(enrichment.keywords_ar || []);
  const keywordsEn = JSON.stringify(enrichment.keywords_en || []);
  
  const query = `
    MATCH (c:Course {course_id: '${courseId}'})
    SET c.extracted_skills = '${extractedSkills.replace(/'/g, "\\'")}',
        c.prerequisite_skills = '${prerequisiteSkills.replace(/'/g, "\\'")}',
        c.learning_outcomes = '${learningOutcomes.replace(/'/g, "\\'")}',
        c.target_audience = '${targetAudience.replace(/'/g, "\\'")}',
        c.career_paths = '${careerPaths.replace(/'/g, "\\'")}',
        c.industry_tags = '${industryTags.replace(/'/g, "\\'")}',
        c.topics = '${topics.replace(/'/g, "\\'")}',
        c.difficulty_assessment = '${difficultyAssessment.replace(/'/g, "\\'")}',
        c.quality_indicators = '${qualityIndicators.replace(/'/g, "\\'")}',
        c.keywords_ar = '${keywordsAr.replace(/'/g, "\\'")}',
        c.keywords_en = '${keywordsEn.replace(/'/g, "\\'")}',
        c.summary_ar = '${(enrichment.summary_ar || '').replace(/'/g, "\\'")}',
        c.summary_en = '${(enrichment.summary_en || '').replace(/'/g, "\\'")}',
        c.enriched_at = '${enrichment.enriched_at || new Date().toISOString()}',
        c.enrichment_version = '${enrichment.enrichment_version || '1.0'}'
    RETURN c.course_id as course_id, c.enriched_at as enriched_at
  `;
  
  console.log(`📝 Updating Neo4j enrichment for course: ${courseId}`);
  
  return await makeRequest('POST', '/query', {
    data: { query }
  });
}

/**
 * Create skill relationships from AI-extracted skills
 * @param {string} courseId - Course ID
 * @param {Array} skills - Array of skill names
 * @returns {Promise<Object>} Creation results
 */
async function createExtractedSkillRelationships(courseId, skills) {
  const results = {
    created: 0,
    existing: 0,
    errors: []
  };
  
  for (const skillName of skills) {
    try {
      // First check if skill exists
      const findQuery = `
        MATCH (s:Skill)
        WHERE toLower(s.skill_name) = toLower('${skillName.replace(/'/g, "\\'")}')
           OR toLower(s.skill_name) = toLower('${skillName.replace(/'/g, "\\'")}')
        RETURN s.skill_id as skill_id
        LIMIT 1
      `;
      
      const existingSkill = await makeRequest('POST', '/query', { data: { query: findQuery } });
      
      if (existingSkill && (existingSkill.skill_id || (Array.isArray(existingSkill) && existingSkill[0]?.skill_id))) {
        // Skill exists, create relationship
        const skillId = existingSkill.skill_id || existingSkill[0].skill_id;
        
        const relQuery = `
          MATCH (c:Course {course_id: '${courseId}'})
          MATCH (s:Skill {skill_id: '${skillId}'})
          MERGE (c)-[t:ALIGNS_TO_SKILL]->(s)
          ON CREATE SET t.relevance_score = 0.8, t.source = 'ai_extracted'
          RETURN type(t) as rel_type
        `;
        
        await makeRequest('POST', '/query', { data: { query: relQuery } });
        results.created++;
      } else {
        results.existing++;
      }
    } catch (error) {
      results.errors.push({ skill: skillName, error: error.message });
    }
  }
  
  return results;
}

/**
 * Get course recommendations based on user interests (skills/topics)
 * Searches courses that teach skills matching the user's interests
 * PRIORITIZES English field matching: c.name_en, c.subject, s.skill_name
 * Falls back to Arabic fields for matching
 * @param {Array} interests - Array of interest strings in format "skillId:skillNameEn" or legacy "subjectId:skillName"
 * @param {number} limit - Maximum courses to return
 * @returns {Promise<Array>} Array of course recommendations
 */
async function getRecommendationsByInterests(interests, limit = 10) {
  if (!interests || interests.length === 0) {
    return [];
  }

  // Extract skill names from interest keys (format: "skillId:skillNameEn" or "subjectId:skillName")
  const skillNames = interests.map(interest => {
    const parts = interest.split(':');
    return parts.length > 1 ? parts.slice(1).join(':') : interest;
  }).filter(name => name && name.trim());

  if (skillNames.length === 0) {
    return [];
  }

  // Build WHERE conditions for skill matching
  // PRIORITIZE English fields: c.course_name_en, s.skill_name
  // Then fallback to Arabic fields
  const skillConditions = skillNames.map(skill => {
    const escaped = skill.replace(/'/g, "\\'");
    return `(
      toLower(c.course_name_en) CONTAINS toLower('${escaped}') OR
      toLower(s.skill_name) CONTAINS toLower('${escaped}') OR
      toLower(c.course_name) CONTAINS toLower('${escaped}') OR
      toLower(s.skill_name) CONTAINS toLower('${escaped}')
    )`;
  }).join(' OR ');

  const query = `
    MATCH (c:Course)
    OPTIONAL MATCH (c)-[t:ALIGNS_TO_SKILL]->(s:Skill)
    WHERE ${skillConditions}
    WITH c, 
         collect(DISTINCT s.skill_name) as matching_skills,
         count(DISTINCT s) as skill_coverage
    OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
    RETURN DISTINCT
      c.course_id as course_id,
      c.course_name as name_ar,
      c.course_name_en as name_en,
      c.course_description as description_ar,
      c.course_description_en as description_en,
      c.course_URL as url,
      c.course_language as language,
      matching_skills,
      skill_coverage,
      src.source_name as platform
    ORDER BY skill_coverage DESC
    LIMIT ${limit}
  `;

  console.log('🎯 Neo4j Interests Query (English-first):', query);

  try {
    return await makeRequest('POST', '/query', {
      data: { query }
    });
  } catch (error) {
    console.error('Error fetching recommendations by interests:', error);
    return [];
  }
}

/**
 * Get course recommendations based on desired domains (career aspirations)
 * Searches courses that belong to or relate to the user's desired career domains
 * PRIORITIZES English domain names for matching against course subject (usually English)
 * @param {Array} domainIds - Array of domain IDs
 * @param {Array} domainNames - Array of domain objects with name_ar and name_en
 * @param {number} limit - Maximum courses to return
 * @returns {Promise<Array>} Array of course recommendations
 */
async function getRecommendationsByDomains(domainIds, domainNames, limit = 10) {
  if ((!domainIds || domainIds.length === 0) && (!domainNames || domainNames.length === 0)) {
    return [];
  }

  // Build WHERE conditions for domain matching using domain names
  // PRIORITIZE English domain names (name_en) for matching against course_name_en
  let domainConditions = 'false'; // Default to false if no conditions
  
  if (domainNames && domainNames.length > 0) {
    const conditions = domainNames.map(domain => {
      // Prioritize English name for matching
      const escapedEn = (domain.name_en || '').replace(/'/g, "\\'");
      const escapedAr = (domain.name_ar || '').replace(/'/g, "\\'");
      
      // Build condition - English matches first (higher priority), then Arabic fallback
      const parts = [];
      
      if (escapedEn) {
        // English domain name matches against English course fields (primary)
        parts.push(`toLower(c.course_name_en) CONTAINS toLower('${escapedEn}')`);
      }
      
      if (escapedAr) {
        // Arabic domain name matches against Arabic course fields (fallback)
        parts.push(`toLower(c.course_name) CONTAINS toLower('${escapedAr}')`);
      }
      
      return parts.length > 0 ? `(${parts.join(' OR ')})` : null;
    }).filter(c => c);
    
    if (conditions.length > 0) {
      domainConditions = conditions.join(' OR ');
    }
  }

  const query = `
    MATCH (c:Course)
    WHERE ${domainConditions}
    OPTIONAL MATCH (c)-[t:ALIGNS_TO_SKILL]->(s:Skill)
    WITH c, 
         collect(DISTINCT s.skill_name) as related_skills,
         count(DISTINCT s) as skill_coverage
    OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
    RETURN DISTINCT
      c.course_id as course_id,
      c.course_name as name_ar,
      c.course_name_en as name_en,
      c.course_description as description_ar,
      c.course_description_en as description_en,
      c.course_URL as url,
      c.course_language as language,
      related_skills as matching_skills,
      skill_coverage,
      src.source_name as platform
    ORDER BY skill_coverage DESC
    LIMIT ${limit}
  `;

  console.log('🚀 Neo4j Career Domains Query (English-first):', query);

  try {
    return await makeRequest('POST', '/query', {
      data: { query }
    });
  } catch (error) {
    console.error('Error fetching recommendations by domains:', error);
    return [];
  }
}

/**
 * Update course metadata (subject, difficulty, description, etc.)
 * @param {string} courseId - Course ID
 * @param {Object} updates - Object with fields to update
 * @returns {Promise<Object>} Update result
 */
async function updateCourseMetadata(courseId, updates) {
  // Map frontend field names to Neo4j property names
  const fieldMapping = {
    'name_ar': 'course_name',
    'name_en': 'course_name_en',
    'url': 'course_URL',
    'language': 'course_language'
  };
  
  const allowedFields = [
    'name_ar', 'name_en', 'url', 'language'
  ];
  
  const setClauses = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      // Map field name to Neo4j property name
      const neo4jField = fieldMapping[key] || key;
      
      if (typeof value === 'number') {
        setClauses.push(`c.${neo4jField} = ${value}`);
      } else if (value === null) {
        setClauses.push(`c.${neo4jField} = null`);
      } else {
        // Escape backslashes first, then single quotes (order matters!)
        const escaped = String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        setClauses.push(`c.${neo4jField} = '${escaped}'`);
      }
    }
  }
  
  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }
  
  // Use ISO string for updated_at since datetime() may not be supported in all Neo4j configurations
  const updatedAt = new Date().toISOString();
  
  const query = `
    MATCH (c:Course {course_id: '${courseId}'})
    SET ${setClauses.join(', ')}, c.updated_at = '${updatedAt}'
    RETURN c.course_id as course_id, c.course_name as name_ar, c.course_name_en as name_en
  `;
  
  console.log(`📝 Updating Neo4j course metadata: ${courseId}`);
  console.log(`📝 Query: ${query}`);
  
  try {
    const result = await makeRequest('POST', '/query', { data: { query } });
    console.log(`✅ Neo4j update successful:`, result);
    return result;
  } catch (error) {
    console.error(`❌ Neo4j update failed:`, error);
    throw error;
  }
}

/**
 * Remove a specific skill relationship from a course
 * @param {string} courseId - Course ID
 * @param {string} skillName - Skill name (Arabic or English)
 * @returns {Promise<Object>} Deletion result
 */
async function removeCourseSkillRelationship(courseId, skillName) {
  const escaped = skillName.replace(/'/g, "\\'");
  const query = `
    MATCH (c:Course {course_id: '${courseId}'})-[t:ALIGNS_TO_SKILL]->(s:Skill)
    WHERE toLower(s.skill_name) = toLower('${escaped}')
    DELETE t
    RETURN count(t) as deleted_count
  `;
  
  console.log(`🗑️ Removing skill relationship: ${courseId} -> ${skillName}`);
  
  return await makeRequest('POST', '/query', { data: { query } });
}

/**
 * Add a skill relationship to a course
 * @param {string} courseId - Course ID  
 * @param {string} skillName - Skill name to link
 * @param {number} relevanceScore - Relevance score (default 0.8)
 * @returns {Promise<Object>} Creation result
 */
async function addCourseSkillByName(courseId, skillName, relevanceScore = 0.8) {
  const escaped = skillName.replace(/'/g, "\\'");
  
  // First find the skill
  const findQuery = `
    MATCH (s:Skill)
    WHERE toLower(s.skill_name) = toLower('${escaped}')
    RETURN s.skill_id as skill_id, s.skill_name as name_ar
    LIMIT 1
  `;
  
  const skillResult = await makeRequest('POST', '/query', { data: { query: findQuery } });
  
  if (!skillResult || (Array.isArray(skillResult) && skillResult.length === 0)) {
    throw new Error(`Skill not found: ${skillName}`);
  }
  
  const skillId = skillResult.skill_id || (Array.isArray(skillResult) ? skillResult[0]?.skill_id : null);
  
  if (!skillId) {
    throw new Error(`Skill ID not found for: ${skillName}`);
  }
  
  // Create the relationship
  const createQuery = `
    MATCH (c:Course {course_id: '${courseId}'})
    MATCH (s:Skill {skill_id: '${skillId}'})
    MERGE (c)-[t:ALIGNS_TO_SKILL]->(s)
    ON CREATE SET t.relevance_score = ${relevanceScore}, t.source = 'admin_added'
    ON MATCH SET t.relevance_score = ${relevanceScore}
    RETURN type(t) as rel_type, s.skill_name as skill_name
  `;
  
  console.log(`➕ Adding skill relationship: ${courseId} -> ${skillName}`);
  
  return await makeRequest('POST', '/query', { data: { query: createQuery } });
}

/**
 * Delete a course completely from Neo4j (with all relationships)
 * @param {string} courseId - Course ID
 * @returns {Promise<Object>} Deletion result
 */
async function deleteCourseComplete(courseId) {
  console.log(`🗑️ Deleting course completely from Neo4j: ${courseId}`);
  
  // First delete all relationships
  await deleteNodeRelationships('Course', 'course_id', courseId);
  
  // Then delete the node
  return await deleteNode('Course', 'course_id', courseId);
}

/**
 * Get a single course from Neo4j by ID
 * @param {string} courseId - Course ID
 * @returns {Promise<Object>} Course data
 */
async function getCourseById(courseId) {
  // Handle both string and integer course_id types
  // Neo4j stores course_id as integer, but we receive it as string from API
  // Use WHERE clause with type-flexible matching instead of property match
  const query = `
    MATCH (c:Course)
    WHERE c.course_id = '${courseId}' OR c.course_id = toInteger('${courseId}') OR toString(c.course_id) = '${courseId}'
    OPTIONAL MATCH (c)-[t:ALIGNS_TO_SKILL]->(s:Skill)
    WITH c, collect(DISTINCT {name_ar: s.skill_name, name_en: s.skill_name, relevance: t.relevance_score}) as skills
    OPTIONAL MATCH (c)-[:DERIVED_FROM]->(src:Source)
    RETURN 
      c.course_id as course_id,
      c.course_name as name_ar,
      c.course_name_en as name_en,
      c.course_description as description_ar,
      c.course_description_en as description_en,
      c.course_URL as url,
      c.course_language as language,
      skills,
      src.source_name as platform
    LIMIT 1
  `;
  
  const result = await makeRequest('POST', '/query', { data: { query } });
  
  if (!result || (Array.isArray(result) && result.length === 0)) {
    return null;
  }
  
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Get all skills available in Neo4j for dropdown selection
 * @returns {Promise<Array>} Array of skill objects
 */
async function getAllSkills() {
  const query = `
    MATCH (s:Skill)
    RETURN s.skill_id as skill_id, s.skill_name as name_ar, s.skill_name as name_en
    ORDER BY s.skill_name
  `;
  
  const result = await makeRequest('POST', '/query', { data: { query } });
  return Array.isArray(result) ? result : (result ? [result] : []);
}

// ============================================
// NELC USER COURSE DATA FUNCTIONS
// These functions query the NELC Neo4j database
// for user course progress and completion data
// ============================================

/**
 * Get a NELC user by their national ID from Neo4j
 * @param {string|number} nationalId - User's national ID
 * @returns {Promise<Object|null>} - User data or null if not found
 */
async function getNelcUserByNationalId(nationalId) {
  try {
    const result = await makeRequest('GET', '/node', {
      params: {
        label: 'User',
        id: nationalId.toString()
      }
    });
    
    if (result && result.data) {
      return result.data;
    }
    return null;
  } catch (error) {
    if (error.status === 422 || error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get all course actions for a NELC user (enrollments, completions, progress)
 * @param {string|number} nationalId - User's national ID
 * @returns {Promise<Array>} - Array of course actions with status
 */
async function getNelcUserCourses(nationalId) {
  const query = `
    MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
    MATCH (a)-[:OF_TYPE]->(at:ActionType)
    WITH c.course_name as course_name, 
         c.course_id as course_id, 
         c.course_URL as course_url,
         collect(DISTINCT at.action_type_name) as actions,
         MAX(a.source_created_at) as last_action_date,
         MAX(a.action_score) as max_score
    RETURN course_name, course_id, course_url, actions, last_action_date, max_score,
           CASE 
             WHEN 'Complete' IN actions THEN 'Completed'
             WHEN 'Progress' IN actions THEN 'In Progress'
             WHEN 'Enroll' IN actions THEN 'Enrolled'
             ELSE 'Unknown'
           END as status
    ORDER BY status, course_name
  `;
  
  try {
    const result = await makeRequest('POST', '/query', {
      data: { query }
    });
    
    return Array.isArray(result) ? result : (result ? [result] : []);
  } catch (error) {
    console.error('Error fetching NELC user courses:', error);
    return [];
  }
}

/**
 * Get only completed courses for a NELC user
 * @param {string|number} nationalId - User's national ID
 * @returns {Promise<Array>} - Array of completed courses
 */
async function getNelcCompletedCourses(nationalId) {
  const query = `
    MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
    MATCH (a)-[:OF_TYPE]->(at:ActionType {action_type_name: 'Complete'})
    RETURN DISTINCT
      c.course_name as course_name,
      c.course_id as course_id,
      c.course_URL as course_url,
      a.source_created_at as completion_date,
      a.action_score as score
    ORDER BY a.source_created_at DESC
  `;
  
  try {
    const result = await makeRequest('POST', '/query', {
      data: { query }
    });
    
    return Array.isArray(result) ? result : (result ? [result] : []);
  } catch (error) {
    console.error('Error fetching NELC completed courses:', error);
    return [];
  }
}

/**
 * Get enrolled courses for a NELC user
 * @param {string|number} nationalId - User's national ID
 * @returns {Promise<Array>} - Array of enrolled courses
 */
async function getNelcEnrolledCourses(nationalId) {
  const query = `
    MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
    MATCH (a)-[:OF_TYPE]->(at:ActionType {action_type_name: 'Enroll'})
    RETURN DISTINCT
      c.course_name as course_name,
      c.course_id as course_id,
      c.course_URL as course_url,
      a.source_created_at as enroll_date
    ORDER BY a.source_created_at DESC
  `;
  
  try {
    const result = await makeRequest('POST', '/query', {
      data: { query }
    });
    
    return Array.isArray(result) ? result : (result ? [result] : []);
  } catch (error) {
    console.error('Error fetching NELC enrolled courses:', error);
    return [];
  }
}

/**
 * Get a summary of user's actions by type
 * @param {string|number} nationalId - User's national ID
 * @returns {Promise<Object>} - Summary with action counts
 */
async function getNelcUserActionSummary(nationalId) {
  const query = `
    MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:OF_TYPE]->(at:ActionType)
    RETURN at.action_type_name as action_type, count(*) as count
    ORDER BY count DESC
  `;
  
  try {
    const result = await makeRequest('POST', '/query', {
      data: { query }
    });
    
    const summary = {
      total_actions: 0,
      completed: 0,
      enrolled: 0,
      in_progress: 0,
      other: 0
    };
    
    if (Array.isArray(result)) {
      result.forEach(row => {
        summary.total_actions += row.count || 0;
        switch (row.action_type) {
          case 'Complete':
            summary.completed = row.count || 0;
            break;
          case 'Enroll':
            summary.enrolled = row.count || 0;
            break;
          case 'Progress':
            summary.in_progress = row.count || 0;
            break;
          default:
            summary.other += row.count || 0;
        }
      });
    }
    
    return summary;
  } catch (error) {
    console.error('Error fetching NELC user action summary:', error);
    return { total_actions: 0, completed: 0, enrolled: 0, in_progress: 0, other: 0 };
  }
}

/**
 * Check if NELC Neo4j API is properly configured and accessible
 * @returns {Promise<Object>} - Status object
 */
async function checkNelcApiStatus() {
  try {
    const clientId = process.env.NEO4J_CLIENT_ID;
    const clientSecret = process.env.NEO4J_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return {
        configured: false,
        connected: false,
        message: 'NEO4J_CLIENT_ID and NEO4J_CLIENT_SECRET must be configured'
      };
    }
    
    // Try to get a token to verify credentials work
    await getAccessToken();
    
    return {
      configured: true,
      connected: true,
      message: 'NELC Neo4j API is configured and accessible'
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      message: `Failed to connect to NELC Neo4j API: ${error.message}`
    };
  }
}

module.exports = {
  getAccessToken,
  makeRequest,
  createCourseNode,
  createSkillNode,
  createUserNode,
  createCourseSkillRelationship,
  createUserSkillGap,
  deleteNodeRelationships,
  deleteNode,
  updateCourseNode,
  getRecommendationsForUser,
  getEnhancedRecommendationsForUser,
  nodeExists,
  syncAllSkills,
  findPeersWithSimilarGaps,
  searchCourses,
  getCourseFilterOptions,
  getSchema,
  listIndexes,
  updateCourseEnrichment,
  createExtractedSkillRelationships,
  getRecommendationsByInterests,
  getRecommendationsByDomains,
  // New admin methods
  updateCourseMetadata,
  removeCourseSkillRelationship,
  addCourseSkillByName,
  deleteCourseComplete,
  getCourseById,
  getAllSkills,
  // NELC User Course Data Functions
  getNelcUserByNationalId,
  getNelcUserCourses,
  getNelcCompletedCourses,
  getNelcEnrolledCourses,
  getNelcUserActionSummary,
  checkNelcApiStatus
};
