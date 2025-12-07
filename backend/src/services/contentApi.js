const axios = require('axios');

// OAuth2 Token Cache
let tokenCache = {
  token: null,
  expiresAt: null
};

/**
 * Get OAuth2 access token using client credentials flow
 */
async function getAccessToken() {
  // Check if we have a valid cached token
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  try {
    const clientId = process.env.RH_CONTENTS_CLIENT_ID;
    const clientSecret = process.env.RH_CONTENTS_CLIENT_SECRET;
    const tokenUrl = process.env.RH_CONTENTS_TOKEN_URL || 'https://api-test.nelc.gov.sa/oauth2/v1/token';

    if (!clientId || !clientSecret) {
      throw new Error('RH_CONTENTS_CLIENT_ID and RH_CONTENTS_CLIENT_SECRET must be set in environment variables');
    }

    // Prepare form data
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'rh-contents');

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

    return access_token;
  } catch (error) {
    console.error('Failed to get OAuth2 token:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received:', error.request);
    }
    console.error('Full error:', error);
    
    // Check if credentials are missing
    if (!process.env.RH_CONTENTS_CLIENT_ID || !process.env.RH_CONTENTS_CLIENT_SECRET) {
      throw {
        status: 500,
        message: 'Content API credentials not configured. Please set RH_CONTENTS_CLIENT_ID and RH_CONTENTS_CLIENT_SECRET in environment variables.',
        code: 'CONFIG_ERROR'
      };
    }
    
    throw {
      status: error.response?.status || 500,
      message: `Failed to authenticate with content API: ${error.message}`,
      code: 'AUTH_ERROR',
      originalError: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
}

/**
 * Make an authenticated request to the content API
 */
async function makeRequest(method, endpoint, options = {}) {
  try {
    const token = await getAccessToken();
    const baseUrl = process.env.RH_CONTENTS_BASE_URL || 'https://api-test.nelc.gov.sa/rh-contents/v1';
    const acceptLanguage = options.acceptLanguage || 'ar';

    const config = {
      method,
      url: `${baseUrl}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept_language': acceptLanguage,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    if (options.data) {
      config.data = options.data;
    }

    if (options.params) {
      config.params = options.params;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Content API request failed (${method} ${endpoint}):`, error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      throw {
        status: error.response.status,
        message: error.response.data?.message || error.message || 'Content API request failed',
        code: error.response.data?.code,
        tracking_id: error.response.data?.tracking_id
      };
    } else if (error.request) {
      console.error('No response received from content API');
      console.error('Request config:', {
        url: error.config?.url,
        method: error.config?.method
      });
      throw {
        status: 503,
        message: 'Content API is not responding. Please check the service availability.',
        code: 'SERVICE_UNAVAILABLE'
      };
    } else {
      console.error('Error setting up request:', error.message);
      throw {
        status: 500,
        message: error.message || 'Failed to make request to content API',
        code: 'REQUEST_ERROR'
      };
    }
  }
}

/**
 * List all contents with optional filters
 */
async function listContents(filters = {}, acceptLanguage = 'ar') {
  const params = {};
  
  if (filters.page) params.page = filters.page;
  if (filters.occupation_domains && filters.occupation_domains.length > 0) {
    // Use plain key; axios will serialize arrays as occupation_domains[]
    params.occupation_domains = filters.occupation_domains;
  }
  if (filters.skills && filters.skills.length > 0) {
    params.skills = filters.skills;
  }
  if (filters.levels && filters.levels.length > 0) {
    params.levels = filters.levels;
  }
  if (filters.translations && filters.translations.length > 0) {
    params.translations = filters.translations;
  }
  if (filters.content_types && filters.content_types.length > 0) {
    params.content_types = filters.content_types;
  }
  if (filters.entities && filters.entities.length > 0) {
    params.entities = filters.entities;
  }
  if (filters.estimated_hours && filters.estimated_hours.length > 0) {
    params.estimated_hours = filters.estimated_hours;
  }
  if (filters.name) params.name = filters.name;

  return await makeRequest('GET', '/contents', {
    params,
    acceptLanguage
  });
}

/**
 * Get content by ID
 */
async function getContent(contentId, acceptLanguage = 'ar') {
  return await makeRequest('GET', `/contents/${contentId}`, {
    acceptLanguage
  });
}

/**
 * Create new content
 */
async function createContent(contentData, acceptLanguage = 'ar') {
  return await makeRequest('POST', '/contents', {
    data: contentData,
    acceptLanguage
  });
}

/**
 * Update content
 */
async function updateContent(contentId, contentData, acceptLanguage = 'ar') {
  return await makeRequest('PATCH', `/contents/${contentId}`, {
    data: contentData,
    acceptLanguage
  });
}

/**
 * Delete content
 */
async function deleteContent(contentId, acceptLanguage = 'ar') {
  return await makeRequest('DELETE', `/contents/${contentId}`, {
    acceptLanguage
  });
}

/**
 * Get range hours
 */
async function getRangeHours(acceptLanguage = 'ar') {
  return await makeRequest('GET', '/range-hours', {
    acceptLanguage
  });
}

module.exports = {
  listContents,
  getContent,
  createContent,
  updateContent,
  deleteContent,
  getRangeHours
};

