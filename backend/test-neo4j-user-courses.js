// Test Neo4j API - Find user's course activities
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

async function executeQuery(token, query) {
  console.log(`\n=== Query ===`);
  console.log(query);
  
  const response = await fetch(`${NEO4J_API_BASE}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: query,
      is_prod: true
    })
  });
  
  console.log('Status:', response.status);
  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log('✓ Got access token');
    
    const nationalId = '1056070285';
    
    // 1. Find all relationships FROM this user
    await executeQuery(token, `
      MATCH (u:User {user_national_id: ${nationalId}})-[r]->(target)
      RETURN type(r) as relationship, labels(target) as target_labels, target
      LIMIT 20
    `);
    
    // 2. Find all relationships TO this user
    await executeQuery(token, `
      MATCH (source)-[r]->(u:User {user_national_id: ${nationalId}})
      RETURN type(r) as relationship, labels(source) as source_labels, source
      LIMIT 20
    `);
    
    // 3. Find user's actions (enrollments, completions, etc.)
    await executeQuery(token, `
      MATCH (u:User {user_national_id: ${nationalId}})-[r:PERFORMED]->(a:Action)
      RETURN a
      LIMIT 20
    `);
    
    // 4. Find user's certificates
    await executeQuery(token, `
      MATCH (u:User {user_national_id: ${nationalId}})-[r]->(c:Certificate)
      RETURN c
      LIMIT 20
    `);
    
    // 5. Find any course-related data for this user
    await executeQuery(token, `
      MATCH path = (u:User {user_national_id: ${nationalId}})-[*1..3]-(c:Course)
      RETURN path
      LIMIT 10
    `);
    
    // 6. Sample some ActionType nodes to understand what actions exist
    await executeQuery(token, `
      MATCH (at:ActionType)
      RETURN at
      LIMIT 10
    `);
    
    // 7. Sample some Course nodes to understand structure
    await executeQuery(token, `
      MATCH (c:Course)
      RETURN c
      LIMIT 3
    `);
    
    // 8. Check if there's any Action with course relationship
    await executeQuery(token, `
      MATCH (a:Action)-[r]->(c:Course)
      RETURN type(r), a, c
      LIMIT 5
    `);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

