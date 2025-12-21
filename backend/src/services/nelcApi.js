/**
 * NELC User Management API v2 Service
 * 
 * This service provides methods to interact with the NELC User Management API.
 * 
 * API Base URL: https://api.nelc.gov.sa/user-management/v2
 * Authentication: Requires both API Key (header) and Bearer Token (JWT)
 * 
 * IMPORTANT: The API requires user-level authentication (JWT bearer token).
 * Server-to-server fetching by national ID alone is NOT supported.
 * Users must provide their NELC access token for course sync to work.
 */

const crypto = require('crypto');

// Configuration
const NELC_API_BASE_URL = process.env.NELC_API_BASE_URL || 'https://api.nelc.gov.sa/user-management/v2';
const NELC_API_KEY = process.env.NELC_API_KEY;
const NELC_TOKEN_URL = process.env.NEO4J_TOKEN_URL || 'https://api.nelc.gov.sa/oauth2/v1/token';
const CLIENT_ID = process.env.NEO4J_CLIENT_ID;
const CLIENT_SECRET = process.env.NEO4J_CLIENT_SECRET;
const ENCRYPTION_KEY = process.env.NELC_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;

// Cache for OAuth tokens
let cachedOAuthToken = null;
let tokenExpiresAt = null;

/**
 * Encrypt a token for secure storage
 * @param {string} token - Plain text token
 * @returns {string} - Encrypted token (base64)
 */
function encryptToken(token) {
  if (!token) return null;
  if (!ENCRYPTION_KEY) {
    console.warn('⚠️ No encryption key configured for NELC tokens');
    return token; // Fallback to plain text (not recommended for production)
  }
  
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  // Return iv:authTag:encrypted as base64
  return Buffer.from(`${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`).toString('base64');
}

/**
 * Decrypt a stored token
 * @param {string} encryptedToken - Encrypted token (base64)
 * @returns {string} - Plain text token
 */
function decryptToken(encryptedToken) {
  if (!encryptedToken) return null;
  if (!ENCRYPTION_KEY) {
    return encryptedToken; // Assume plain text if no key
  }
  
  try {
    const decoded = Buffer.from(encryptedToken, 'base64').toString('utf8');
    const [ivHex, authTagHex, encrypted] = decoded.split(':');
    
    const algorithm = 'aes-256-gcm';
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt NELC token:', error.message);
    return null;
  }
}

/**
 * Get OAuth access token for server-to-server API calls
 * Caches token until expiry
 * @returns {Promise<string|null>} - OAuth access token
 */
async function getOAuthToken() {
  // Return cached token if still valid
  if (cachedOAuthToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
    return cachedOAuthToken;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('⚠️ NELC OAuth credentials not configured (NEO4J_CLIENT_ID, NEO4J_CLIENT_SECRET)');
    return null;
  }

  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch(NELC_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Failed to get NELC OAuth token:', data);
      return null;
    }
    
    // Cache the token (with 60-second buffer before expiry)
    cachedOAuthToken = data.access_token;
    tokenExpiresAt = Date.now() + ((data.expires_in - 60) * 1000);
    
    return cachedOAuthToken;
  } catch (error) {
    console.error('Failed to get NELC OAuth token:', error.message);
    return null;
  }
}

/**
 * Make an authenticated request to NELC API
 * @param {string} endpoint - API endpoint (e.g., '/user/courses')
 * @param {string} userToken - User's JWT bearer token
 * @param {object} options - Fetch options
 * @returns {Promise<object>} - API response
 */
async function makeRequest(endpoint, userToken, options = {}) {
  if (!NELC_API_KEY) {
    throw new Error('NELC_API_KEY environment variable is not configured');
  }
  
  if (!userToken) {
    throw new Error('User bearer token is required for NELC API calls');
  }
  
  const url = `${NELC_API_BASE_URL}${endpoint}`;
  
  const headers = {
    'apikey': NELC_API_KEY,
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      const error = new Error(data.message || `NELC API error: ${response.status}`);
      error.status = response.status;
      error.code = data.code;
      error.tracking_id = data.tracking_id;
      throw error;
    }
    
    return data;
  } catch (error) {
    if (error.status) {
      throw error; // Re-throw NELC API errors
    }
    // Network or other errors
    throw new Error(`Failed to connect to NELC API: ${error.message}`);
  }
}

/**
 * NELC API Service Class
 */
class NelcApiService {
  /**
   * Check if a user exists by national ID and get their info
   * Uses OAuth2 client credentials for authentication
   * @param {string} nationalId - User's national ID
   * @returns {Promise<object>} - User check result including name if found
   */
  async checkUser(nationalId) {
    if (!nationalId) {
      return { exists: false, national_id: nationalId };
    }
    
    try {
      const accessToken = await getOAuthToken();
      if (!accessToken) {
        console.warn('Could not get NELC OAuth token, skipping user check');
        return { exists: false, national_id: nationalId, error: 'no_token' };
      }
      
      const url = `${NELC_API_BASE_URL}/user/check/${nationalId}`;
      
      // Try with OAuth token and apikey header
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': CLIENT_ID,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          return { exists: false, national_id: nationalId };
        }
        // Try alternative auth method
        const altResponse = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });
        
        if (!altResponse.ok) {
          if (altResponse.status === 404) {
            return { exists: false, national_id: nationalId };
          }
          console.error(`NELC user check failed for ${nationalId}: ${altResponse.status}`);
          return { exists: false, national_id: nationalId, error: 'api_error' };
        }
        
        const altData = await altResponse.json();
        return { exists: true, ...altData };
      }
      
      const data = await response.json();
      return { exists: true, ...data };
      
    } catch (error) {
      console.error(`NELC user check error for ${nationalId}:`, error.message);
      return { exists: false, national_id: nationalId, error: error.message };
    }
  }
  
  /**
   * Get user's name from NELC by national ID
   * Returns the Arabic and English names if user is found in NELC
   * @param {string} nationalId - User's national ID
   * @returns {Promise<object|null>} - { name_ar, name_en } or null if not found
   */
  async getUserNameByNationalId(nationalId) {
    if (!nationalId) {
      return null;
    }
    
    try {
      const result = await this.checkUser(nationalId);
      
      if (!result.exists || result.error) {
        return null;
      }
      
      // Extract name from NELC response
      // The API might return name in different formats, handle common cases
      const nameAr = result.name_ar || result.nameAr || result.arabicName || 
                     result.arabic_name || result.fullNameAr || result.full_name_ar || null;
      const nameEn = result.name_en || result.nameEn || result.englishName || 
                     result.english_name || result.fullNameEn || result.full_name_en || 
                     result.name || null;
      
      if (nameAr || nameEn) {
        return {
          name_ar: nameAr,
          name_en: nameEn,
          nelc_data: result // Include full NELC response for debugging
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to get NELC name for ${nationalId}:`, error.message);
      return null;
    }
  }
  
  /**
   * Get user's courses from NELC
   * Requires user's bearer token
   * @param {string} userToken - User's NELC JWT token
   * @returns {Promise<Array>} - List of user's courses
   */
  async getUserCourses(userToken) {
    const data = await makeRequest('/user/courses', userToken, {
      method: 'GET'
    });
    
    // Return courses array (structure depends on actual API response)
    return data.courses || data.data || data || [];
  }
  
  /**
   * Get specific course details for user
   * @param {string} userToken - User's NELC JWT token
   * @param {string} courseId - NELC course ID
   * @returns {Promise<object>} - Course details
   */
  async getUserCourse(userToken, courseId) {
    const data = await makeRequest(`/user/courses/${courseId}`, userToken, {
      method: 'GET'
    });
    
    return data;
  }
  
  /**
   * Get user's learning paths
   * @param {string} userToken - User's NELC JWT token
   * @returns {Promise<Array>} - List of learning paths
   */
  async getUserPaths(userToken) {
    const data = await makeRequest('/user/paths', userToken, {
      method: 'GET'
    });
    
    return data.paths || data.data || data || [];
  }
  
  /**
   * Get user's achievements
   * @param {string} userToken - User's NELC JWT token
   * @returns {Promise<Array>} - List of achievements
   */
  async getUserAchievements(userToken) {
    const data = await makeRequest('/user/achievements', userToken, {
      method: 'GET'
    });
    
    return data.achievements || data.data || data || [];
  }
  
  /**
   * Get user's monthly activity
   * @param {string} userToken - User's NELC JWT token
   * @returns {Promise<object>} - Monthly activity data
   */
  async getUserMonthlyActivity(userToken) {
    const data = await makeRequest('/user/monthly-activity', userToken, {
      method: 'GET'
    });
    
    return data;
  }
  
  /**
   * Get user profile from NELC
   * @param {string} userToken - User's NELC JWT token
   * @returns {Promise<object>} - User profile data
   */
  async getUserProfile(userToken) {
    const data = await makeRequest('/user/profile', userToken, {
      method: 'GET'
    });
    
    return data;
  }
  
  /**
   * Get user info from NELC
   * @param {string} userToken - User's NELC JWT token
   * @returns {Promise<object>} - User info
   */
  async getUserInfo(userToken) {
    const data = await makeRequest('/user/info', userToken, {
      method: 'GET'
    });
    
    return data;
  }
  
  /**
   * Get course suggestions for user
   * @param {string} userToken - User's NELC JWT token
   * @returns {Promise<Array>} - Course suggestions
   */
  async getCourseSuggestions(userToken) {
    const data = await makeRequest('/user/courses/suggestions', userToken, {
      method: 'GET'
    });
    
    return data.suggestions || data.data || data || [];
  }
  
  /**
   * Encrypt a token for secure storage in database
   * @param {string} token - Plain text token
   * @returns {string} - Encrypted token
   */
  encryptToken(token) {
    return encryptToken(token);
  }
  
  /**
   * Decrypt a stored token
   * @param {string} encryptedToken - Encrypted token from database
   * @returns {string} - Plain text token
   */
  decryptToken(encryptedToken) {
    return decryptToken(encryptedToken);
  }
  
  /**
   * Validate if a token is properly formatted (basic check)
   * @param {string} token - Token to validate
   * @returns {boolean} - Whether token looks valid
   */
  isValidTokenFormat(token) {
    if (!token || typeof token !== 'string') return false;
    // JWT tokens have 3 parts separated by dots
    const parts = token.split('.');
    return parts.length === 3;
  }
  
  /**
   * Check if NELC API integration is properly configured
   * @returns {object} - Configuration status
   */
  getConfigStatus() {
    return {
      apiKeyConfigured: !!NELC_API_KEY,
      encryptionKeyConfigured: !!ENCRYPTION_KEY,
      baseUrl: NELC_API_BASE_URL,
      ready: !!NELC_API_KEY
    };
  }
}

// Export singleton instance
module.exports = new NelcApiService();

