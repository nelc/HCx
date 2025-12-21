const axios = require('axios');

// OAuth2 Token Cache (separate from Neo4j token cache)
let tokenCache = {
  token: null,
  expiresAt: null
};

/**
 * Get OAuth2 access token using client credentials flow for Learner Skills API
 * Uses the same credentials as Neo4j but with a different token URL
 */
async function getAccessToken() {
  // Check if we have a valid cached token
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  try {
    const clientId = process.env.NEO4J_CLIENT_ID;
    const clientSecret = process.env.NEO4J_CLIENT_SECRET;
    const tokenUrl = process.env.LEARNER_SKILLS_TOKEN_URL || 'https://api-test.nelc.gov.sa/oauth2/v1/token';

    if (!clientId || !clientSecret) {
      throw new Error('NEO4J_CLIENT_ID and NEO4J_CLIENT_SECRET must be set in environment variables');
    }

    // Prepare form data
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

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

    console.log('✅ Learner Skills API OAuth2 token obtained successfully');
    return access_token;
  } catch (error) {
    console.error('Failed to get Learner Skills API OAuth2 token:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    throw {
      status: error.response?.status || 500,
      message: `Failed to authenticate with Learner Skills API: ${error.message}`,
      code: 'AUTH_ERROR',
      originalError: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
}

/**
 * Generate skills from CV data using the NELC Learner Skills API
 * @param {Object} cvData - Structured CV data
 * @param {Array} cvData.education - Array of education objects
 * @param {Array} cvData.certificates - Array of certificate objects
 * @param {Array} cvData.courses - Array of course objects (optional)
 * @param {Array} cvData.internships - Array of internship/experience objects (optional)
 * @returns {Promise<Object>} Generated skills by category
 */
async function generateSkills(cvData) {
  try {
    const token = await getAccessToken();
    const baseUrl = process.env.LEARNER_SKILLS_BASE_URL || 'https://api-test.nelc.gov.sa/learner-skills/v1';

    // Prepare request payload
    const payload = {
      education: cvData.education || [],
      certificates: cvData.certificates || [],
      courses: cvData.courses || [],
      internships: cvData.internships || []
    };

    console.log('📤 Calling Learner Skills API with payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${baseUrl}/generate`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const result = response.data;
    console.log('📥 Learner Skills API response:', JSON.stringify(result, null, 2));

    return {
      success: true,
      skills: {
        education: result.education || [],
        courses: result.courses || [],
        certificates: result.certificates || [],
        internships: result.internships || []
      },
      tracking_id: result.tracking_id || null
    };
  } catch (error) {
    console.error('Learner Skills API request failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      return {
        success: false,
        error: {
          status: error.response.status,
          message: error.response.data?.message || error.message,
          code: error.response.data?.code,
          tracking_id: error.response.data?.tracking_id
        }
      };
    } else if (error.request) {
      console.error('No response received from Learner Skills API');
      return {
        success: false,
        error: {
          status: 503,
          message: 'Learner Skills API is not responding. Please check the service availability.',
          code: 'SERVICE_UNAVAILABLE'
        }
      };
    } else {
      console.error('Error setting up request:', error.message);
      return {
        success: false,
        error: {
          status: 500,
          message: error.message || 'Failed to make request to Learner Skills API',
          code: 'REQUEST_ERROR'
        }
      };
    }
  }
}

/**
 * Transform CV parser output to Learner Skills API input format
 * @param {Object} parsedCV - Output from CV parser (OpenAI)
 * @returns {Object} Formatted input for Learner Skills API
 */
function transformCVDataForAPI(parsedCV) {
  return {
    education: (parsedCV.education || []).map(edu => ({
      degree: edu.degree || '',
      institution: edu.institution || '',
      graduation_year: edu.graduation_year || '',
      field_of_study: edu.field_of_study || ''
    })),
    certificates: (parsedCV.certificates || []).map(cert => ({
      name: cert.name || '',
      issuer: cert.issuer || '',
      date: cert.date || ''
    })),
    courses: [], // CV parser doesn't typically extract courses separately
    internships: (parsedCV.experience || []).map(exp => ({
      title: exp.title || '',
      company: exp.company || '',
      start_date: exp.start_date || '',
      end_date: exp.end_date || '',
      description: exp.description || ''
    }))
  };
}

/**
 * Get all unique skills from API response as a flat array
 * @param {Object} apiResult - Result from generateSkills
 * @returns {Array<string>} Flat array of all skills
 */
function flattenApiSkills(apiResult) {
  if (!apiResult.success || !apiResult.skills) {
    return [];
  }

  const allSkills = new Set();
  
  // Collect skills from all categories
  const categories = ['education', 'courses', 'certificates', 'internships'];
  for (const category of categories) {
    const skills = apiResult.skills[category] || [];
    for (const skill of skills) {
      if (skill && typeof skill === 'string' && skill.trim()) {
        allSkills.add(skill.trim());
      }
    }
  }

  return Array.from(allSkills);
}

/**
 * Check if Learner Skills API is properly configured
 * @returns {Promise<Object>} Status object
 */
async function checkApiStatus() {
  try {
    const clientId = process.env.NEO4J_CLIENT_ID;
    const clientSecret = process.env.NEO4J_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return {
        configured: false,
        connected: false,
        message: 'NEO4J_CLIENT_ID and NEO4J_CLIENT_SECRET must be configured (same credentials used for Learner Skills API)'
      };
    }
    
    // Try to get a token to verify credentials work
    await getAccessToken();
    
    return {
      configured: true,
      connected: true,
      message: 'Learner Skills API is configured and accessible'
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      message: `Failed to connect to Learner Skills API: ${error.message}`
    };
  }
}

module.exports = {
  getAccessToken,
  generateSkills,
  transformCVDataForAPI,
  flattenApiSkills,
  checkApiStatus
};

