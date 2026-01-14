// Test Neo4j API - Focused query for user's course data
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
    body: JSON.stringify({
      query: query,
      is_prod: true
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    console.log('Error:', data);
    return null;
  }
  
  // Filter out embeddings from the output for readability
  const filteredData = JSON.parse(JSON.stringify(data), (key, value) => {
    if (key === 'embedding' || (Array.isArray(value) && value.length > 50 && typeof value[0] === 'number')) {
      return '[embedding array]';
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
    
    // 1. Find all relationships FROM this user (excluding embeddings)
    await executeQuery(token, 'User outgoing relationships',
      `MATCH (u:User {user_national_id: ${nationalId}})-[r]->(target)
       RETURN type(r) as rel_type, labels(target) as target_type, 
              target.id as target_id, target.name as target_name, target.course_name as course_name
       LIMIT 30`
    );
    
    // 2. Find all relationships TO this user
    await executeQuery(token, 'User incoming relationships',
      `MATCH (source)-[r]->(u:User {user_national_id: ${nationalId}})
       RETURN type(r) as rel_type, labels(source) as source_type,
              source.id as source_id, source.name as source_name
       LIMIT 20`
    );
    
    // 3. Find user's actions with their types
    await executeQuery(token, 'User actions with types',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:OF_TYPE]->(at:ActionType)
       RETURN at.name as action_type, a.id as action_id, a.created_at as action_date
       LIMIT 30`
    );
    
    // 4. Find user's actions on courses
    await executeQuery(token, 'User actions on courses',
      `MATCH (u:User {user_national_id: ${nationalId}})-[:PERFORMED]->(a:Action)-[:ON]->(c:Course)
       OPTIONAL MATCH (a)-[:OF_TYPE]->(at:ActionType)
       RETURN at.name as action_type, c.course_name as course_name, c.id as course_id, 
              a.created_at as action_date
       LIMIT 30`
    );
    
    // 5. Find user's certificates
    await executeQuery(token, 'User certificates',
      `MATCH (u:User {user_national_id: ${nationalId}})-[r]->(cert:Certificate)
       RETURN cert
       LIMIT 10`
    );
    
    // 6. Sample ActionType nodes
    await executeQuery(token, 'Available action types',
      `MATCH (at:ActionType)
       RETURN at.name as action_type, at.id as action_id
       LIMIT 20`
    );
    
    // 7. Check relationship between User and Course (any path)
    await executeQuery(token, 'User to Course paths',
      `MATCH path = (u:User {user_national_id: ${nationalId}})-[*1..2]-(c:Course)
       RETURN [rel in relationships(path) | type(rel)] as rels, c.course_name as course_name, c.id as course_id
       LIMIT 20`
    );
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

