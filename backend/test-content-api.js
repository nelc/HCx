require('dotenv').config();
const axios = require('axios');

async function testOAuth2() {
  console.log('Testing OAuth2 Authentication...\n');
  
  const clientId = process.env.RH_CONTENTS_CLIENT_ID;
  const clientSecret = process.env.RH_CONTENTS_CLIENT_SECRET;
  const tokenUrl = process.env.RH_CONTENTS_TOKEN_URL || 'https://api-test.nelc.gov.sa/oauth2/v1/token';
  const baseUrl = process.env.RH_CONTENTS_BASE_URL || 'https://api-test.nelc.gov.sa/rh-contents/v1';

  console.log('Configuration:');
  console.log('- Client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET');
  console.log('- Client Secret:', clientSecret ? 'SET' : 'NOT SET');
  console.log('- Token URL:', tokenUrl);
  console.log('- Base URL:', baseUrl);
  console.log('');

  if (!clientId || !clientSecret) {
    console.error('❌ Missing credentials!');
    return;
  }

  try {
    console.log('Step 1: Requesting OAuth2 token...');
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'rh-contents');

    const tokenResponse = await axios.post(
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

    console.log('✅ Token received!');
    console.log('- Response status:', tokenResponse.status);
    console.log('- Response data keys:', Object.keys(tokenResponse.data));
    console.log('- Access token:', tokenResponse.data.access_token ? `${tokenResponse.data.access_token.substring(0, 20)}...` : 'NOT FOUND');
    console.log('- Expires in:', tokenResponse.data.expires_in || 'N/A', 'seconds');
    console.log('');

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      console.error('❌ No access token in response!');
      console.log('Full response:', JSON.stringify(tokenResponse.data, null, 2));
      return;
    }

    console.log('Step 2: Testing API request to /contents...');
    try {
      // Try with page parameter
      const apiResponse = await axios.get(`${baseUrl}/contents`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'accept_language': 'ar',
          'Content-Type': 'application/json'
        },
        params: {
          page: 1
        }
      });

      console.log('✅ API request successful!');
      console.log('- Response status:', apiResponse.status);
      console.log('- Response data type:', Array.isArray(apiResponse.data) ? 'Array' : typeof apiResponse.data);
      if (Array.isArray(apiResponse.data)) {
        console.log('- Number of contents:', apiResponse.data.length);
      } else if (apiResponse.data.data) {
        console.log('- Number of contents:', apiResponse.data.data.length);
      }
      console.log('');
    } catch (apiError) {
      console.error('❌ API request failed!');
      console.error('- Status:', apiError.response?.status || 'N/A');
      console.error('- Message:', apiError.response?.data?.message || apiError.message);
      console.error('- Code:', apiError.response?.data?.code || 'N/A');
      console.error('- Tracking ID:', apiError.response?.data?.tracking_id || 'N/A');
      if (apiError.response?.data) {
        console.error('- Full response:', JSON.stringify(apiError.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ OAuth2 token request failed!');
    console.error('- Error message:', error.message);
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('- No response received');
      console.error('- Request config:', {
        url: error.config?.url,
        method: error.config?.method
      });
    } else {
      console.error('- Error:', error);
    }
  }
}

testOAuth2().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

