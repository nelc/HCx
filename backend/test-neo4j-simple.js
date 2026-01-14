require('dotenv').config();
const neo4jApi = require('./src/services/neo4jApi');

async function testNeo4j() {
  try {
    console.log('🔍 Testing Neo4j API...');
    console.log('NEO4J_IS_PROD:', process.env.NEO4J_IS_PROD);
    
    // Simple count query
    const countQuery = `MATCH (c:Course) RETURN count(c) as total`;
    
    console.log('\n📊 Executing count query...');
    const result = await neo4jApi.makeRequest('POST', '/query', {
      data: { query: countQuery }
    });
    
    console.log('\n✅ Result:', JSON.stringify(result, null, 2));
    
    // Try to get a few courses
    const coursesQuery = `
      MATCH (c:Course)
      RETURN c.course_id as id, c.course_name as name_ar, c.course_name_en as name_en
      LIMIT 3
    `;
    
    console.log('\n📚 Fetching sample courses...');
    const courses = await neo4jApi.makeRequest('POST', '/query', {
      data: { query: coursesQuery }
    });
    
    console.log('\n✅ Courses:', JSON.stringify(courses, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
  process.exit(0);
}

testNeo4j();
