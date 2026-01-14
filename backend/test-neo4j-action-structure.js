// Test Neo4j API - Explore Action node structure
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
    if (key === 'embedding' || (Array.isArray(value) && value.length > 50 && typeof value[0] === 'number')) {
      return '[embedding - omitted]';
    }
    return value;
  });
  
  console.log('Result:', JSON.stringify(filteredData, null, 2));
  return data;
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log('✓ Got access token');
    
    const nationalId = '1056070285';
    
    // 1. Get raw Action nodes to see all properties
    await executeQuery(token, 'Raw Action node properties',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)
       RETURN a
       LIMIT 3`
    );
    
    // 2. Get Action node property keys
    await executeQuery(token, 'Action node keys',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)
       RETURN keys(a) as properties
       LIMIT 1`
    );
    
    // 3. Get ActionType node properties
    await executeQuery(token, 'ActionType nodes',
      `MATCH (at:ActionType)
       RETURN at
       LIMIT 10`
    );
    
    // 4. Get ActionType keys
    await executeQuery(token, 'ActionType node keys',
      `MATCH (at:ActionType)
       RETURN keys(at) as properties
       LIMIT 1`
    );
    
    // 5. Full Action with Course and Type relationship
    await executeQuery(token, 'Full Action details',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
       OPTIONAL MATCH (a)-[:OF_TYPE]->(at:ActionType)
       RETURN a, at, c.course_name as course_name
       LIMIT 5`
    );
    
    // 6. Try to find completion status via different property names
    await executeQuery(token, 'Action properties exploration',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
       RETURN c.course_name as course_name, 
              a.action_type as action_type,
              a.type as type,
              a.status as status,
              a.completion_status as completion_status,
              a.progress as progress,
              a.completed as completed
       LIMIT 10`
    );
    
    // 7. Check Course node structure
    await executeQuery(token, 'Course node structure',
      `MATCH (c:Course)
       RETURN keys(c) as properties
       LIMIT 1`
    );
    
    // 8. Get a sample course with all properties
    await executeQuery(token, 'Sample Course node',
      `MATCH (c:Course)
       RETURN c.course_name as name, c.id as id, c.course_url as url, c.platform as platform
       LIMIT 5`
    );
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

