// Test Neo4j API - Get user's COMPLETED courses
require('dotenv').config();

const NEO4J_API_BASE = 'https://api.nelc.gov.sa/neo4j/v1';
const TOKEN_URL = 'https://api.nelc.gov.sa/oauth2/v1/token';

const CLIENT_ID = process.env.NEO4J_CLIENT_ID;
const CLIENT_SECRET = process.env.NEO4J_CLIENT_SECRET;

async function getAccessToken() {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=neo4j'
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Failed to get token');
  return data.access_token;
}

async function executeQuery(token, name, query) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`QUERY: ${name}`);
  console.log(`${'='.repeat(60)}`);
  
  const response = await fetch(`${NEO4J_API_BASE}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, is_prod: true })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    console.log('Error:', data);
    return null;
  }
  
  // Filter out embeddings
  const filteredData = JSON.parse(JSON.stringify(data), (key, value) => {
    if (key === 'embedding' || key.includes('embed') || 
        (Array.isArray(value) && value.length > 50 && typeof value[0] === 'number')) {
      return '[omitted]';
    }
    return value;
  });
  
  console.log('Result count:', Array.isArray(filteredData) ? filteredData.length : 'N/A');
  console.log('Result:', JSON.stringify(filteredData, null, 2));
  return data;
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log('✓ Got access token');
    
    const nationalId = '1056070285';
    
    // Query for COMPLETED courses (action_type_name = 'Complete')
    await executeQuery(token, 'User COMPLETED courses',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
       MATCH (a)-[:OF_TYPE]->(at:ActionType {action_type_name: 'Complete'})
       RETURN c.course_name as course_name, 
              c.course_id as course_id,
              c.course_URL as course_url,
              a.source_created_at as completion_date,
              a.action_score as score
       ORDER BY a.source_created_at DESC`
    );
    
    // Query for ENROLLED courses
    await executeQuery(token, 'User ENROLLED courses',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
       MATCH (a)-[:OF_TYPE]->(at:ActionType {action_type_name: 'Enroll'})
       RETURN c.course_name as course_name, 
              c.course_id as course_id,
              c.course_URL as course_url,
              a.source_created_at as enroll_date
       ORDER BY a.source_created_at DESC`
    );
    
    // Query for all action types for this user
    await executeQuery(token, 'All user actions by type',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:OF_TYPE]->(at:ActionType)
       RETURN at.action_type_name as action_type, count(*) as count
       ORDER BY count DESC`
    );
    
    // Get summary: courses with their highest action type
    await executeQuery(token, 'Courses with status summary',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
       MATCH (a)-[:OF_TYPE]->(at:ActionType)
       WITH c.course_name as course_name, c.course_id as course_id, c.course_URL as course_url,
            collect(DISTINCT at.action_type_name) as actions
       RETURN course_name, course_id, course_url, actions,
              CASE 
                WHEN 'Complete' IN actions THEN 'Completed'
                WHEN 'Progress' IN actions THEN 'In Progress'
                WHEN 'Enroll' IN actions THEN 'Enrolled'
                ELSE 'Unknown'
              END as status
       ORDER BY status`
    );
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

