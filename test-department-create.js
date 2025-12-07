// Quick test script to check department creation
const axios = require('axios');

async function testCreateDepartment() {
  try {
    // You'll need to replace these with actual values
    const token = 'YOUR_TOKEN_HERE'; // Get from browser localStorage
    const baseURL = 'http://localhost:3001';
    
    const testData = {
      name_ar: 'قطاع الاختبار',
      type: 'sector',
      parent_id: null
    };
    
    console.log('Testing department creation with:', testData);
    
    const response = await axios.post(`${baseURL}/api/departments`, testData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Success:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.statusText);
    console.error('Error data:', error.response?.data);
    console.error('Full error:', error.message);
  }
}

// Uncomment to run:
// testCreateDepartment();

