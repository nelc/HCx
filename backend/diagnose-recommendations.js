// Diagnostic script to check why recommendations aren't appearing
require('dotenv').config();

const db = require('./src/db');
const neo4jApi = require('./src/services/neo4jApi');

async function diagnose() {
  try {
    console.log('=== Recommendation Diagnostic ===\n');

    // 1. Get a user with test results
    const usersResult = await db.query(`
      SELECT ar.user_id, ar.gaps, ar.overall_score, ar.test_id,
             t.title_ar as test_title, u.name_ar as user_name
      FROM analysis_results ar
      JOIN users u ON ar.user_id = u.id
      JOIN tests t ON ar.test_id = t.id
      ORDER BY ar.analyzed_at DESC
      LIMIT 1
    `);

    if (usersResult.rows.length === 0) {
      console.log('❌ No analysis results found');
      return;
    }

    const user = usersResult.rows[0];
    console.log('📊 User:', user.user_name);
    console.log('📝 Test:', user.test_title);
    console.log('📈 Overall Score:', user.overall_score + '%');
    console.log('🎯 Gap Skills:');
    
    const gaps = user.gaps || [];
    for (const gap of gaps) {
      console.log(`   - Skill ID: ${gap.skill_id}`);
      console.log(`     Name: ${gap.skill_name_ar || gap.skill_name_en}`);
      console.log(`     Gap Score: ${gap.gap_score || gap.gap_percentage}%`);
    }

    // 2. Get skill details from PostgreSQL
    console.log('\n=== PostgreSQL Skills ===');
    const skillIds = gaps.map(g => g.skill_id);
    if (skillIds.length > 0) {
      const skillsResult = await db.query(`
        SELECT s.id, s.name_ar, s.name_en, td.name_ar as domain_ar
        FROM skills s
        LEFT JOIN training_domains td ON s.domain_id = td.id
        WHERE s.id = ANY($1)
      `, [skillIds]);
      
      for (const skill of skillsResult.rows) {
        console.log(`   - ${skill.name_ar} (${skill.name_en})`);
        console.log(`     ID: ${skill.id}`);
        console.log(`     Domain: ${skill.domain_ar}`);
      }
    }

    // 3. Check if skills exist in Neo4j
    console.log('\n=== Neo4j Skills Check ===');
    for (const skillId of skillIds) {
      try {
        const query = `
          MATCH (s:Skill {skill_id: '${skillId}'})
          RETURN s.skill_id as id, s.name_ar as name_ar, s.name_en as name_en
        `;
        const result = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
        if (result && (result.id || (Array.isArray(result) && result.length > 0))) {
          console.log(`   ✅ Skill ${skillId} exists in Neo4j`);
        } else {
          console.log(`   ❌ Skill ${skillId} NOT FOUND in Neo4j`);
        }
      } catch (e) {
        console.log(`   ❌ Error checking skill ${skillId}:`, e.message);
      }
    }

    // 4. Check if any courses TEACH these skills
    console.log('\n=== Courses Teaching These Skills ===');
    for (const skillId of skillIds) {
      try {
        const query = `
          MATCH (c:Course)-[t:TEACHES]->(s:Skill {skill_id: '${skillId}'})
          RETURN c.course_id as course_id, c.name_ar as name_ar, c.difficulty_level as difficulty
          LIMIT 5
        `;
        const result = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
        if (result && Array.isArray(result) && result.length > 0) {
          console.log(`   ✅ Skill ${skillId} - ${result.length} courses found:`);
          for (const course of result) {
            console.log(`      - ${course.name_ar} (${course.difficulty})`);
          }
        } else {
          console.log(`   ❌ Skill ${skillId} - NO courses teach this skill in Neo4j`);
        }
      } catch (e) {
        console.log(`   ❌ Error checking courses for skill ${skillId}:`, e.message);
      }
    }

    // 5. Check all TEACHES relationships
    console.log('\n=== Total TEACHES Relationships ===');
    try {
      const query = `
        MATCH (c:Course)-[t:TEACHES]->(s:Skill)
        RETURN count(t) as total, count(DISTINCT c) as courses, count(DISTINCT s) as skills
      `;
      const result = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
      console.log('   Total TEACHES relationships:', result?.total || result?.[0]?.total || 0);
      console.log('   Unique courses:', result?.courses || result?.[0]?.courses || 0);
      console.log('   Unique skills:', result?.skills || result?.[0]?.skills || 0);
    } catch (e) {
      console.log('   ❌ Error:', e.message);
    }

    // 6. Check if the course "Advanced Models for Decision Making" exists and what skills it teaches
    console.log('\n=== Looking for "Decision Making" Course ===');
    try {
      const query = `
        MATCH (c:Course)
        WHERE toLower(c.name_en) CONTAINS 'decision' OR toLower(c.name_ar) CONTAINS 'قرار'
        OPTIONAL MATCH (c)-[t:TEACHES]->(s:Skill)
        RETURN c.course_id as course_id, c.name_ar as name_ar, c.name_en as name_en, 
               c.difficulty_level as difficulty,
               collect({skill_id: s.skill_id, name_ar: s.name_ar}) as skills
        LIMIT 5
      `;
      const result = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
      if (result && Array.isArray(result) && result.length > 0) {
        for (const course of result) {
          console.log(`   📚 Course: ${course.name_ar || course.name_en}`);
          console.log(`      ID: ${course.course_id}`);
          console.log(`      Difficulty: ${course.difficulty}`);
          console.log(`      TEACHES skills:`);
          if (course.skills && course.skills.length > 0) {
            for (const skill of course.skills) {
              if (skill.skill_id) {
                console.log(`         - ${skill.name_ar} (${skill.skill_id})`);
              }
            }
          } else {
            console.log(`         ❌ No TEACHES relationships found!`);
          }
        }
      } else {
        console.log('   ❌ No courses found with "decision" in name');
      }
    } catch (e) {
      console.log('   ❌ Error:', e.message);
    }

    // 7. Check all skills in Neo4j
    console.log('\n=== All Skills in Neo4j ===');
    try {
      const query = `
        MATCH (s:Skill)
        RETURN s.skill_id as skill_id, s.name_ar as name_ar, s.name_en as name_en
        LIMIT 20
      `;
      const result = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
      if (result && Array.isArray(result)) {
        console.log(`   Found ${result.length} skills:`);
        for (const skill of result) {
          console.log(`   - ${skill.name_ar || skill.name_en} (ID: ${skill.skill_id})`);
        }
      }
    } catch (e) {
      console.log('   ❌ Error:', e.message);
    }

    console.log('\n=== Diagnosis Complete ===');
  } catch (error) {
    console.error('Diagnostic error:', error);
  } finally {
    process.exit(0);
  }
}

diagnose();

