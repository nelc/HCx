/**
 * LDAP Authentication Service
 * Handles LDAP authentication against Active Directory
 * Uses direct user bind approach (no service account needed)
 */

const ldap = require('ldapjs');

// LDAP Configuration - function to get config at runtime (for env vars loaded later)
function getLdapConfig() {
  return {
    url: `ldap://${process.env.LDAP_HOST || '10.4.25.15'}:${process.env.LDAP_PORT || 389}`,
    baseDN: process.env.LDAP_BASE_DN || 'DC=elc,DC=local',
    domain: process.env.LDAP_DOMAIN || 'elc.local',
    timeout: parseInt(process.env.LDAP_TIMEOUT) || 10000,
    connectTimeout: parseInt(process.env.LDAP_CONNECT_TIMEOUT) || 10000,
  };
}

/**
 * Create LDAP client with configuration
 */
function createClient() {
  const config = getLdapConfig();
  return ldap.createClient({
    url: config.url,
    timeout: config.timeout,
    connectTimeout: config.connectTimeout,
    reconnect: false,
  });
}

/**
 * Authenticate user against LDAP/Active Directory using direct bind
 * @param {string} username - Username (sAMAccountName)
 * @param {string} password - User's password
 * @returns {Promise<object>} - User information from LDAP
 */
async function authenticateUser(username, password) {
  return new Promise((resolve, reject) => {
    const config = getLdapConfig();
    const client = createClient();
    
    // Handle connection errors
    client.on('error', (err) => {
      console.error('LDAP connection error:', err);
      reject(new Error('فشل الاتصال بخادم LDAP'));
    });

    console.log('LDAP connecting to:', config.url);
    console.log('LDAP domain:', config.domain);
    
    // For Active Directory, we can bind directly with username@domain
    const userPrincipalName = `${username}@${config.domain}`;
    console.log('LDAP attempting direct bind with:', userPrincipalName);
    
    // Direct bind with user credentials
    client.bind(userPrincipalName, password, (bindErr) => {
      if (bindErr) {
        console.error('LDAP user bind failed:', bindErr.message);
        client.unbind();
        
        if (bindErr.message.includes('Invalid Credentials')) {
          reject(new Error('اسم المستخدم أو كلمة المرور غير صحيحة'));
        } else {
          reject(new Error('فشل تسجيل الدخول - ' + bindErr.message));
        }
        return;
      }
      
      console.log('LDAP user bind successful, now searching for user details...');

      // Now search for user details
      const escapedUsername = username.replace(/([\\*\(\)\0])/g, '\\$1');
      const searchFilter = `(sAMAccountName=${escapedUsername})`;
      
      console.log('LDAP searching with filter:', searchFilter, 'in base:', config.baseDN);
      
      const searchOptions = {
        filter: searchFilter,
        scope: 'sub',
        attributes: ['dn', 'sAMAccountName', 'mail', 'displayName', 'givenName', 'sn', 'cn', 'department', 'title', 'employeeID', 'employeeNumber', 'userPrincipalName'],
      };

      client.search(config.baseDN, searchOptions, (searchErr, searchRes) => {
        if (searchErr) {
          console.error('LDAP search error:', searchErr);
          client.unbind();
          // Even if search fails, user is authenticated - return basic info
          resolve({
            username: username,
            email: `${username}@${config.domain}`,
            displayName: username,
            authenticated: true,
          });
          return;
        }

        let userEntry = null;

        searchRes.on('searchEntry', (entry) => {
          console.log('LDAP found user entry');
          userEntry = {
            dn: entry.dn ? entry.dn.toString() : null,
            username: getAttributeValue(entry, 'sAMAccountName') || username,
            email: getAttributeValue(entry, 'mail') || getAttributeValue(entry, 'userPrincipalName') || `${username}@${config.domain}`,
            displayName: getAttributeValue(entry, 'displayName') || getAttributeValue(entry, 'cn') || username,
            firstName: getAttributeValue(entry, 'givenName'),
            lastName: getAttributeValue(entry, 'sn'),
            cn: getAttributeValue(entry, 'cn'),
            department: getAttributeValue(entry, 'department'),
            title: getAttributeValue(entry, 'title'),
            employeeId: getAttributeValue(entry, 'employeeID') || getAttributeValue(entry, 'employeeNumber'),
          };
        });

        searchRes.on('error', (err) => {
          console.error('LDAP search result error:', err);
          client.unbind();
          // Even if search fails, user is authenticated - return basic info
          resolve({
            username: username,
            email: `${username}@${config.domain}`,
            displayName: username,
            authenticated: true,
          });
        });

        searchRes.on('end', (result) => {
          client.unbind();
          
          if (userEntry) {
            console.log('LDAP authentication successful with user details');
            resolve(userEntry);
          } else {
            // User authenticated but no details found - return basic info
            console.log('LDAP authentication successful (no details found)');
            resolve({
              username: username,
              email: `${username}@${config.domain}`,
              displayName: username,
              authenticated: true,
            });
          }
        });
      });
    });
  });
}

/**
 * Helper function to safely get attribute value from LDAP entry
 */
function getAttributeValue(entry, attributeName) {
  try {
    // ldapjs 3.x uses pojo or attributes property
    if (entry.pojo && entry.pojo.attributes) {
      const attrs = entry.pojo.attributes;
      for (const attr of attrs) {
        if (attr.type === attributeName && attr.values && attr.values.length > 0) {
          return attr.values[0];
        }
      }
    }
    
    // Try accessing via attributes array (ldapjs format)
    if (entry.attributes && Array.isArray(entry.attributes)) {
      const attr = entry.attributes.find(a => a.type === attributeName);
      if (attr && attr.values && attr.values.length > 0) {
        return attr.values[0];
      }
    }
    
    // Try direct object access (varies by ldapjs version)
    if (entry.object && entry.object[attributeName]) {
      return entry.object[attributeName];
    }
    
    return null;
  } catch (e) {
    console.error('Error getting attribute:', attributeName, e.message);
    return null;
  }
}

/**
 * Test LDAP connection
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  return new Promise((resolve, reject) => {
    const config = getLdapConfig();
    const client = createClient();
    
    client.on('error', (err) => {
      console.error('LDAP connection test failed:', err);
      reject(err);
    });

    client.on('connect', () => {
      console.log('LDAP connection test successful');
      client.unbind();
      resolve(true);
    });

    // Set a timeout for the connection test
    setTimeout(() => {
      client.unbind();
      reject(new Error('LDAP connection timeout'));
    }, config.connectTimeout);
  });
}

/**
 * Get LDAP configuration (without sensitive data)
 */
function getConfig() {
  const config = getLdapConfig();
  return {
    host: process.env.LDAP_HOST || '10.4.25.15',
    port: process.env.LDAP_PORT || 389,
    baseDN: config.baseDN,
    domain: config.domain,
  };
}

module.exports = {
  authenticateUser,
  testConnection,
  getConfig,
  getLdapConfig,
};
