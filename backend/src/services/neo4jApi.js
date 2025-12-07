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
    const isProd = process.env.NEO4J_IS_PROD === 'true';

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
      config.data = { ...options.data, is_prod: isProd };
    }

    if (options.params) {
      config.params = { ...options.params, is_prod: isProd };
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
 * Create relationship between Course and Skill (Course -TEACHES-> Skill)
 */
async function createCourseSkillRelationship(courseId, skillId, relevanceScore = 1.0) {
  return await makeRequest('POST', '/relationship', {
    data: {
      from_label: 'Course',
      from_key: 'course_id',
      from_id: courseId,
      rel_type: 'TEACHES',
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
  
  return await makeRequest('GET', '/query', {
    params: { query }
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
  
  return await makeRequest('GET', '/query', {
    params: { query }
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
 * Matches User -NEEDS-> Skill <-TEACHES- Course
 * Returns courses ranked by relevance score (gap_score * relevance_score)
 */
async function getRecommendationsForUser(userId, limit = 10) {
  const query = `
    MATCH (u:User {user_id: '${userId}'})-[n:NEEDS]->(s:Skill)<-[t:TEACHES]-(c:Course)
    WITH c, s, n, t, (n.gap_score * t.relevance_score) as match_score
    WITH c, 
         collect(DISTINCT s.name_ar) as matching_skills,
         SUM(match_score) as base_score,
         count(DISTINCT s) as skill_coverage,
         MAX(n.priority) as max_priority
    WITH c, matching_skills, skill_coverage, max_priority,
         base_score * (1.0 + (skill_coverage - 1) * 0.15) as recommendation_score
    RETURN 
      c.course_id as course_id,
      c.name_ar as name_ar,
      c.name_en as name_en,
      c.description_ar as description_ar,
      c.url as url,
      c.provider as provider,
      c.duration_hours as duration_hours,
      c.difficulty_level as difficulty_level,
      c.price as price,
      matching_skills,
      recommendation_score,
      skill_coverage,
      max_priority
    ORDER BY recommendation_score DESC, max_priority DESC, skill_coverage DESC
    LIMIT ${limit}
  `;
  
  return await makeRequest('GET', '/query', {
    params: { query }
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
 * Get enhanced course recommendations for a user using graph traversal with domain and difficulty filtering
 * Matches User -NEEDS-> Skill <-TEACHES- Course
 * Filters courses by:
 * - Domain/subject match (course subject contains domain name or vice versa, including synonyms)
 * - Difficulty level based on skill proficiency (gap_score)
 * Returns courses ranked by relevance score (gap_score * relevance_score)
 */
async function getEnhancedRecommendationsForUser(userId, skillRequirements, synonymMap = {}, limit = 10) {
  // Build WHERE conditions for each skill with domain and difficulty matching
  const skillConditions = Object.entries(skillRequirements).map(([skillId, req]) => {
    const domainConditions = buildDomainMatchConditions(
      req.domain_ar, 
      req.domain_en, 
      req.domain_id,
      synonymMap
    );
    
    return `(
      s.skill_id = '${skillId}' 
      AND n.gap_score > 0
      AND (${domainConditions})
      AND c.difficulty_level = '${req.difficulty}'
    )`;
  }).join(' OR ');

  // If no skill conditions, return empty results
  if (!skillConditions || skillConditions === '') {
    return [];
  }

  const query = `
    MATCH (u:User {user_id: '${userId}'})-[n:NEEDS]->(s:Skill)<-[t:TEACHES]-(c:Course)
    WHERE ${skillConditions}
    WITH c, s, n, t, (n.gap_score * t.relevance_score) as match_score
    WITH c, 
         collect(DISTINCT s.name_ar) as matching_skills,
         SUM(match_score) as base_score,
         count(DISTINCT s) as skill_coverage,
         MAX(n.priority) as max_priority
    WITH c, matching_skills, skill_coverage, max_priority,
         base_score * (1.0 + (skill_coverage - 1) * 0.15) as recommendation_score
    RETURN 
      c.course_id as course_id,
      c.name_ar as name_ar,
      c.name_en as name_en,
      c.description_ar as description_ar,
      c.url as url,
      c.provider as provider,
      c.duration_hours as duration_hours,
      c.difficulty_level as difficulty_level,
      c.subject as subject,
      c.price as price,
      matching_skills,
      recommendation_score,
      skill_coverage,
      max_priority
    ORDER BY recommendation_score DESC, max_priority DESC, skill_coverage DESC
    LIMIT ${limit}
  `;
  
  console.log('📊 Enhanced Neo4j Query:', query);
  
  return await makeRequest('GET', '/query', {
    params: { query }
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
    const result = await makeRequest('GET', '/query', {
      params: { query }
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
         collect(DISTINCT s.name_ar) as common_gaps,
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
    return await makeRequest('GET', '/query', {
      params: { query }
    });
  } catch (error) {
    console.error('Error finding peers with similar gaps:', error);
    return [];
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
  findPeersWithSimilarGaps
};
