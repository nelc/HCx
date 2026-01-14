/**
 * Debug script to check why Neo4j recommendations are not showing
 * Run with: node backend/debug-recommendations.js
 */

require('dotenv').config();
const db = require('./src/db');
const neo4jApi = require('./src/services/neo4jApi');

async function debugRecommendations() {
  console.log('🔍 Starting Recommendations Debug...\n');
  
  try {
    // Step 1: Check current user (assuming first employee or specific user)
    console.log('=== STEP 1: Checking User ===');
    const userResult = await db.query(`
      SELECT u.id, u.name_ar, u.email, u.role, u.department_id, d.name_ar as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'employee'
      LIMIT 1
    `);
    
    if (userResult.rows.length === 0) {
      console.log('❌ No employees found in database');
      return;
    }
    
    const user = userResult.rows[0];
    console.log(`✅ User: ${user.name_ar} (${user.email})`);
    console.log(`   Department: ${user.department_name || 'Not assigned'}`);
    console.log(`   User ID: ${user.id}`);
    console.log();
    
    // Step 2: Check if user has assessment results
    console.log('=== STEP 2: Checking Assessment Results ===');
    const analysisResult = await db.query(`
      SELECT id, user_id, gaps, analyzed_at
      FROM analysis_results
      WHERE user_id = $1
      ORDER BY analyzed_at DESC
      LIMIT 1
    `, [user.id]);
    
    if (analysisResult.rows.length === 0) {
      console.log('❌ User has NOT completed any assessments!');
      console.log('   Solution: User needs to complete a test to get skill gaps analyzed');
      console.log();
    } else {
      const analysis = analysisResult.rows[0];
      console.log(`✅ Latest assessment: ${analysis.analyzed_at}`);
      console.log(`   Skill gaps found: ${analysis.gaps?.length || 0}`);
      
      if (analysis.gaps && analysis.gaps.length > 0) {
        console.log('\n   Gap details:');
        for (const gap of analysis.gaps.slice(0, 5)) {
          console.log(`   - Skill ID ${gap.skill_id}: ${gap.gap_score}% gap (${gap.gap_percentage}%)`);
        }
      }
      console.log();
    }
    
    // Step 3: Check department skills
    console.log('=== STEP 3: Checking Department Skills ===');
    if (!user.department_id) {
      console.log('⚠️  User is not assigned to any department');
    } else {
      const deptSkillsResult = await db.query(`
        SELECT ds.skill_id, s.name_ar, s.name_en, td.name_ar as domain_name
        FROM department_skills ds
        JOIN skills s ON ds.skill_id = s.id
        LEFT JOIN training_domains td ON s.domain_id = td.id
        WHERE ds.department_id = $1
      `, [user.department_id]);
      
      console.log(`✅ Department has ${deptSkillsResult.rows.length} linked skills:`);
      for (const skill of deptSkillsResult.rows.slice(0, 5)) {
        console.log(`   - ${skill.name_ar} (ID: ${skill.skill_id}, Domain: ${skill.domain_name})`);
      }
      if (deptSkillsResult.rows.length > 5) {
        console.log(`   ... and ${deptSkillsResult.rows.length - 5} more`);
      }
      console.log();
    }
    
    // Step 4: Check courses in PostgreSQL
    console.log('=== STEP 4: Checking Courses in PostgreSQL ===');
    const coursesResult = await db.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN synced_to_neo4j = true THEN 1 END) as synced,
             COUNT(CASE WHEN synced_to_neo4j = false OR synced_to_neo4j IS NULL THEN 1 END) as not_synced
      FROM courses
    `);
    
    const coursesStats = coursesResult.rows[0];
    console.log(`✅ Total courses: ${coursesStats.total}`);
    console.log(`   Synced to Neo4j: ${coursesStats.synced}`);
    console.log(`   Not synced: ${coursesStats.not_synced}`);
    
    if (coursesStats.not_synced > 0) {
      console.log(`   ⚠️  ${coursesStats.not_synced} courses need to be synced to Neo4j`);
    }
    console.log();
    
    // Step 5: Check course-skill relationships
    console.log('=== STEP 5: Checking Course-Skill Relationships ===');
    const courseSkillsResult = await db.query(`
      SELECT COUNT(DISTINCT course_id) as courses_with_skills,
             COUNT(*) as total_relationships
      FROM course_skills
    `);
    
    const courseSkillsStats = courseSkillsResult.rows[0];
    console.log(`✅ Courses with skills linked: ${courseSkillsStats.courses_with_skills}`);
    console.log(`   Total course-skill relationships: ${courseSkillsStats.total_relationships}`);
    console.log();
    
    // Step 6: Check specific skill-course matches
    if (analysisResult.rows.length > 0 && analysisResult.rows[0].gaps) {
      console.log('=== STEP 6: Checking Skill-Course Matches ===');
      const gaps = analysisResult.rows[0].gaps;
      const skillIds = gaps.map(g => g.skill_id).slice(0, 3);
      
      for (const skillId of skillIds) {
        const matchesResult = await db.query(`
          SELECT c.id, c.name_ar, c.difficulty_level, c.subject, c.synced_to_neo4j, s.name_ar as skill_name
          FROM courses c
          JOIN course_skills cs ON c.id = cs.course_id
          JOIN skills s ON cs.skill_id = s.id
          WHERE cs.skill_id = $1
          LIMIT 3
        `, [skillId]);
        
        if (matchesResult.rows.length > 0) {
          const skillName = matchesResult.rows[0].skill_name;
          console.log(`✅ Skill "${skillName}" (ID: ${skillId}) has ${matchesResult.rows.length} courses:`);
          for (const course of matchesResult.rows) {
            console.log(`   - ${course.name_ar} (${course.difficulty_level}, synced: ${course.synced_to_neo4j})`);
          }
        } else {
          console.log(`❌ Skill ID ${skillId} has NO courses linked!`);
        }
      }
      console.log();
    }
    
    // Step 7: Test Neo4j connectivity
    console.log('=== STEP 7: Testing Neo4j Connection ===');
    try {
      await neo4jApi.getAccessToken();
      console.log('✅ Neo4j API connection successful');
      console.log(`   Base URL: ${process.env.NEO4J_BASE_URL || 'https://api.nelc.gov.sa/neo4j/v1'}`);
      console.log(`   Is Production: ${process.env.NEO4J_IS_PROD === 'true'}`);
    } catch (error) {
      console.log('❌ Neo4j API connection failed!');
      console.log(`   Error: ${error.message}`);
    }
    console.log();
    
    // Step 8: Try to get recommendations
    if (analysisResult.rows.length > 0 && analysisResult.rows[0].gaps) {
      console.log('=== STEP 8: Testing Recommendations Query ===');
      const gaps = analysisResult.rows[0].gaps;
      
      // Build skill requirements
      let skillRequirements = {};
      const skillIds = gaps.map(g => g.skill_id);
      
      const skillsWithDomains = await db.query(`
        SELECT s.id, s.name_ar, s.name_en, 
               td.name_ar as domain_name_ar, 
               td.name_en as domain_name_en
        FROM skills s
        JOIN training_domains td ON s.domain_id = td.id
        WHERE s.id = ANY($1)
      `, [skillIds]);
      
      for (const gap of gaps) {
        const skillInfo = skillsWithDomains.rows.find(s => s.id === gap.skill_id);
        if (skillInfo) {
          const gapScore = gap.gap_score || gap.gap_percentage || 0;
          const proficiency = 100 - gapScore;
          
          let difficulty = 'beginner';
          if (proficiency >= 90) {
            difficulty = 'advanced';
          } else if (proficiency >= 50) {
            difficulty = 'intermediate';
          }
          
          if (gapScore > 0) {
            skillRequirements[gap.skill_id] = {
              domain_ar: skillInfo.domain_name_ar,
              domain_en: skillInfo.domain_name_en,
              gap_score: gapScore,
              difficulty: difficulty,
              proficiency: proficiency
            };
          }
        }
      }
      
      console.log(`   Skill requirements prepared: ${Object.keys(skillRequirements).length} skills`);
      console.log('   Attempting to fetch Neo4j recommendations...');
      
      try {
        const recommendations = await neo4jApi.getEnhancedRecommendationsForUser(
          user.id,
          skillRequirements,
          10
        );
        
        console.log(`✅ Retrieved ${recommendations?.length || 0} recommendations from Neo4j`);
        
        if (recommendations && recommendations.length > 0) {
          console.log('\n   Sample recommendations:');
          for (const rec of recommendations.slice(0, 3)) {
            console.log(`   - ${rec.name_ar}`);
            console.log(`     Score: ${rec.recommendation_score}, Skills: ${rec.matching_skills?.join(', ')}`);
          }
        } else {
          console.log('   ⚠️  No recommendations returned');
          console.log('\n   Possible reasons:');
          console.log('   1. Courses not synced to Neo4j');
          console.log('   2. No TEACHES relationships created in Neo4j');
          console.log('   3. Domain/difficulty filters too strict');
          console.log('   4. User node or NEEDS relationships not created');
        }
      } catch (error) {
        console.log(`❌ Failed to get recommendations from Neo4j`);
        console.log(`   Error: ${error.message}`);
      }
    }
    
    console.log('\n=== SUMMARY & RECOMMENDATIONS ===');
    console.log('To fix recommendations, ensure:');
    console.log('1. User has completed at least one assessment');
    console.log('2. Courses are uploaded and synced to Neo4j');
    console.log('3. Skills are properly linked to courses (course_skills table)');
    console.log('4. Run bulk sync: POST /api/courses/bulk-sync-neo4j');
    console.log('5. Domain names in courses match domain names in skills');
    console.log('6. Course difficulty levels match user proficiency levels');
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    await db.pool.end();
    process.exit(0);
  }
}

// Run the debug
debugRecommendations();

