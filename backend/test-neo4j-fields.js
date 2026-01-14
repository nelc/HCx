require('dotenv').config();
const neo4jApi = require('./src/services/neo4jApi');

async function testFields() {
  try {
    console.log('🔍 Checking what fields courses have...\n');
    
    const query = `
      MATCH (c:Course)
      WITH c, keys(c) as allKeys
      RETURN allKeys as course_properties, c as sample_course
      LIMIT 1
    `;
    
    const result = await neo4jApi.makeRequest('POST', '/query', {
      data: { query }
    });
    
    console.log('✅ Course properties:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  process.exit(0);
}

testFields();
