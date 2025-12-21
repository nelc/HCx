// Test script for Neo4j API
require('dotenv').config();

const NEO4J_API_BASE = 'https://api.nelc.gov.sa/neo4j/v1';
const TOKEN_URL = 'https://api.nelc.gov.sa/oauth2/v1/token';

// Use the same credentials
const CLIENT_ID = process.env.NEO4J_CLIENT_ID;
const CLIENT_SECRET = process.env.NEO4J_CLIENT_SECRET;

async function getAccessToken() {
  console.log('=== Getting OAuth Access Token ===');
  console.log('Token URL:', TOKEN_URL);
  console.log('Client ID:', CLIENT_ID?.substring(0, 10) + '...');
  
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
  console.log('Token response status:', response.status);
  
  if (!response.ok) {
    console.error('Token error:', data);
    throw new Error('Failed to get token');
  }
  
  console.log('✓ Got access token');
  return data.access_token;
}

async function getSchema(token) {
  console.log('\n=== Getting Schema ===');
  
  const response = await fetch(`${NEO4J_API_BASE}/schema?is_prod=true`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  console.log('Schema response status:', response.status);
  const data = await response.json();
  
  if (response.ok) {
    console.log('Schema:', JSON.stringify(data, null, 2));
  } else {
    console.error('Schema error:', data);
  }
  
  return data;
}

async function readNode(token, label, id) {
  console.log(`\n=== Reading Node: ${label} / ${id} ===`);
  
  const url = `${NEO4J_API_BASE}/node?label=${encodeURIComponent(label)}&id=${encodeURIComponent(id)}&is_prod=true`;
  console.log('URL:', url);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  console.log('Response status:', response.status);
  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  
  return data;
}

async function executeQuery(token, query) {
  console.log(`\n=== Executing Query ===`);
  console.log('Query:', query);
  
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
  
  console.log('Response status:', response.status);
  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  
  return data;
}

async function main() {
  try {
    // Step 1: Get access token
    const token = await getAccessToken();
    
    // Step 2: Get schema to understand data structure
    await getSchema(token);
    
    // Step 3: Try to find user by national ID using different approaches
    const nationalId = '1056070285';
    
    // Try reading as a User node
    await readNode(token, 'User', nationalId);
    
    // Try reading as a Person node
    await readNode(token, 'Person', nationalId);
    
    // Try reading as a Learner node
    await readNode(token, 'Learner', nationalId);
    
    // Step 4: Try Cypher queries to find the user
    // Query to find any node with this national ID
    await executeQuery(token, `MATCH (n) WHERE n.national_id = '${nationalId}' OR n.nationalId = '${nationalId}' OR n.id = '${nationalId}' RETURN n LIMIT 5`);
    
    // Query to find all node labels (to understand structure)
    await executeQuery(token, `CALL db.labels() YIELD label RETURN label`);
    
    // Query for relationship types
    await executeQuery(token, `CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

