/**
 * Test script to check NELC API for a specific national ID
 * Run with: node backend/test-nelc-api.js
 */

require('dotenv').config();

const NELC_API_BASE_URL = process.env.NELC_API_BASE_URL || 'https://api.nelc.gov.sa/user-management/v2';
const NELC_TOKEN_URL = process.env.NEO4J_TOKEN_URL || 'https://api.nelc.gov.sa/oauth2/v1/token';
const CLIENT_ID = process.env.NEO4J_CLIENT_ID;
const CLIENT_SECRET = process.env.NEO4J_CLIENT_SECRET;

const nationalId = '1056070285';

// Get OAuth access token with scope
async function getAccessToken(scope = '') {
  console.log('\n🔐 Getting OAuth access token...');
  console.log(`Token URL: ${NELC_TOKEN_URL}`);
  if (scope) console.log(`Scope: ${scope}`);
  
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  let body = 'grant_type=client_credentials';
  if (scope) {
    body += `&scope=${encodeURIComponent(scope)}`;
  }
  
  const response = await fetch(NELC_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error('❌ Failed to get token:', data);
    throw new Error(`Token request failed: ${response.status}`);
  }
  
  console.log('✅ Got access token:', data.access_token?.substring(0, 20) + '...');
  console.log('   Token type:', data.token_type);
  console.log('   Expires in:', data.expires_in, 'seconds');
  if (data.scope) console.log('   Scope:', data.scope);
  
  return data.access_token;
}

// Try different header combinations
async function tryApiCall(url, accessToken, headerVariant) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  
  switch(headerVariant) {
    case 1:
      headers['Authorization'] = `Bearer ${accessToken}`;
      headers['apikey'] = CLIENT_ID;
      break;
    case 2:
      headers['Authorization'] = `Bearer ${accessToken}`;
      headers['x-api-key'] = CLIENT_ID;
      break;
    case 3:
      headers['Authorization'] = `Bearer ${accessToken}`;
      break;
    case 4:
      headers['apikey'] = CLIENT_ID;
      break;
    case 5:
      headers['Authorization'] = `Bearer ${accessToken}`;
      headers['client_id'] = CLIENT_ID;
      break;
  }
  
  console.log(`\n--- Attempt ${headerVariant} ---`);
  console.log('Headers:', Object.keys(headers).filter(k => k !== 'Accept' && k !== 'Content-Type').join(', '));
  
  const response = await fetch(url, { method: 'GET', headers });
  const data = await response.json().catch(() => response.text());
  
  console.log(`Status: ${response.status}`);
  if (typeof data === 'object') {
    console.log('Response:', JSON.stringify(data, null, 2));
  } else {
    console.log('Response:', data);
  }
  
  return { status: response.status, data, ok: response.ok };
}

async function checkUser(nationalId) {
  console.log('='.repeat(60));
  console.log('NELC API User Check Test');
  console.log('='.repeat(60));
  console.log(`\nAPI Base URL: ${NELC_API_BASE_URL}`);
  console.log(`Client ID: ${CLIENT_ID ? CLIENT_ID.substring(0, 8) + '...' : 'Not set'}`);
  console.log(`Client Secret: ${CLIENT_SECRET ? '****' + CLIENT_SECRET.slice(-4) : 'Not set'}`);
  console.log(`National ID: ${nationalId}`);
  console.log('\n' + '-'.repeat(60));

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('\n❌ ERROR: Client credentials not configured!');
    process.exit(1);
  }

  try {
    // Step 1: Get OAuth token
    const accessToken = await getAccessToken();
    
    // Step 2: Try different header combinations
    const url = `${NELC_API_BASE_URL}/user/check/${nationalId}`;
    console.log(`\n📡 Testing URL: ${url}`);
    console.log('\nTrying different authentication header combinations...');
    
    let success = false;
    for (let variant = 1; variant <= 5; variant++) {
      const result = await tryApiCall(url, accessToken, variant);
      if (result.ok) {
        console.log('\n✅ SUCCESS with variant', variant);
        success = true;
        return result.data;
      }
      // Small delay between attempts
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (!success) {
      console.log('\n⚠️ All authentication variants failed');
      console.log('\nThis API likely requires:');
      console.log('1. A user-specific JWT token (not client credentials)');
      console.log('2. Or special permissions/scopes for user-management API');
      return { error: true, message: 'All auth variants failed' };
    }

  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
    return { error: true, message: error.message };
  }
}

// Run the test
checkUser(nationalId).then(result => {
  console.log('\n' + '='.repeat(60));
  console.log('Test completed');
  console.log('='.repeat(60));
  process.exit(result.error ? 1 : 0);
});

