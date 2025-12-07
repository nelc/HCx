/**
 * Test Recommendations System
 * Run from backend folder: node test-recommendations-system.js
 */

require('dotenv').config();
const db = require('./src/db');
const neo4jApi = require('./src/services/neo4jApi');

async function testSystem() {
  console.log('🔍 Testing Recommendations System...\n');
  
  try {
    // 1. Test Database Connection
    console.log('=== 1. DATABASE CONNECTION ===');
    const dbTest = await db.query('SELECT NOW()');
    console.log('✅ Database connected:', dbTest.rows[0].now);
    console.log();
    
    // 2. Test Neo4j Configuration
    console.log('=== 2. NEO4J CONFIGURATION ===');
    console.log(`CLIENT_ID configured: ${process.env.NEO4J_CLIENT_ID ? 'Yes ✅' : 'No ❌'}`);
    console.log(`CLIENT_SECRET configured: ${process.env.NEO4J_CLIENT_SECRET ? 'Yes ✅' : 'No ❌'}`);
    console.log(`BASE_URL: ${process.env.NEO4J_BASE_URL}`);
    console.log();
    
    // 3. Test Neo4j Connection
    console.log('=== 3. NEO4J CONNECTION TEST ===');
    try {
      const token = await neo4jApi.getAccessToken();
      console.log('✅ Neo4j OAuth2 token obtained successfully!');
      console.log(`   Token starts with: ${token.substring(0, 20)}...`);
    } catch (error) {
      console.log('❌ Neo4j connection failed:', error.message);
    }
    console.log();
    
    // 4. Check Data
    console.log('=== 4. DATA CHECK ===');
    
    const users = await db.query('SELECT COUNT(*) FROM users WHERE role = \'employee\'');
    console.log(`Employees: ${users.rows[0].count}`);
    
    const assessments = await db.query('SELECT COUNT(*) FROM analysis_results');
    console.log(`Assessments completed: ${assessments.rows[0].count}`);
    
    const courses = await db.query('SELECT COUNT(*) FROM courses');
    console.log(`Courses: ${courses.rows[0].count}`);
    
    const coursesSync = await db.query('SELECT COUNT(*) FROM courses WHERE synced_to_neo4j = true');
    console.log(`Courses synced to Neo4j: ${coursesSync.rows[0].count}`);
    
    const courseSkills = await db.query('SELECT COUNT(*) FROM course_skills');
    console.log(`Course-skill links: ${courseSkills.rows[0].count}`);
    console.log();
    
    // 5. Find a user with assessments
    console.log('=== 5. SAMPLE USER WITH ASSESSMENT ===');
    const userWithAssessment = await db.query(`
      SELECT u.id, u.name_ar, u.email, ar.analyzed_at, 
             jsonb_array_length(ar.gaps) as gap_count
      FROM analysis_results ar
      JOIN users u ON ar.user_id = u.id
      ORDER BY ar.analyzed_at DESC
      LIMIT 1
    `);
    
    if (userWithAssessment.rows.length > 0) {
      const user = userWithAssessment.rows[0];
      console.log(`User: ${user.name_ar} (${user.email})`);
      console.log(`Assessment date: ${user.analyzed_at}`);
      console.log(`Skill gaps: ${user.gap_count}`);
      console.log();
      
      // 6. Try to get recommendations for this user
      console.log('=== 6. TESTING RECOMMENDATIONS ENDPOINT ===');
      console.log(`Testing Neo4j recommendations for user ID: ${user.id}`);
      
      // Get the user's gaps
      const gapsResult = await db.query(`
        SELECT gaps FROM analysis_results 
        WHERE user_id = $1 
        ORDER BY analyzed_at DESC 
        LIMIT 1
      `, [user.id]);
      
      const gaps = gapsResult.rows[0].gaps;
      console.log(`\nSkill gaps (first 3):`);
      gaps.slice(0, 3).forEach(gap => {
        console.log(`  - Skill ID ${gap.skill_id}: ${gap.gap_score}% gap`);
      });
      
      // Check if these skills have courses
      const skillIds = gaps.map(g => g.skill_id);
      const coursesForSkills = await db.query(`
        SELECT s.id, s.name_ar, COUNT(cs.course_id) as course_count
        FROM skills s
        LEFT JOIN course_skills cs ON s.id = cs.skill_id
        WHERE s.id = ANY($1)
        GROUP BY s.id, s.name_ar
        ORDER BY course_count DESC
      `, [skillIds]);
      
      console.log(`\nCourses available for these skills:`);
      coursesForSkills.rows.forEach(skill => {
        const status = skill.course_count > 0 ? '✅' : '❌';
        console.log(`  ${status} ${skill.name_ar}: ${skill.course_count} courses`);
      });
      
    } else {
      console.log('❌ No users have completed assessments yet');
      console.log('   Solution: Complete a test as an employee to get recommendations');
    }
    
    console.log();
    console.log('=== SUMMARY ===');
    
    const issues = [];
    const hasNeo4j = process.env.NEO4J_CLIENT_ID && process.env.NEO4J_CLIENT_SECRET;
    const hasCourses = parseInt(courses.rows[0].count) > 0;
    const hasSyncedCourses = parseInt(coursesSync.rows[0].count) > 0;
    const hasAssessments = parseInt(assessments.rows[0].count) > 0;
    const hasLinks = parseInt(courseSkills.rows[0].count) > 0;
    
    if (!hasNeo4j) issues.push('Neo4j credentials missing');
    if (!hasCourses) issues.push('No courses uploaded');
    if (!hasSyncedCourses && hasCourses) issues.push('Courses not synced to Neo4j');
    if (!hasAssessments) issues.push('No assessments completed');
    if (!hasLinks && hasCourses) issues.push('No course-skill relationships');
    
    if (issues.length === 0) {
      console.log('🎉 Everything looks good! Recommendations should work.');
    } else {
      console.log('⚠️  Issues found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
    process.exit(0);
  }
}

testSystem();

