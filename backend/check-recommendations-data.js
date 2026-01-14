/**
 * Check recommendations data without Neo4j connection
 * Run with: node backend/check-recommendations-data.js
 */

require('dotenv').config();
const { Pool } = require('pg');

// Create a simple pool for this script
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function checkData() {
  console.log('🔍 Checking Recommendations Data...\n');
  
  try {
    // 1. Check users
    console.log('=== 1. USERS ===');
    const usersResult = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN role = 'employee' THEN 1 END) as employees,
             COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as with_department
      FROM users
    `);
    console.log(`Total users: ${usersResult.rows[0].total}`);
    console.log(`Employees: ${usersResult.rows[0].employees}`);
    console.log(`With department: ${usersResult.rows[0].with_department}`);
    console.log();
    
    // 2. Check departments and skills
    console.log('=== 2. DEPARTMENTS & SKILLS ===');
    const deptResult = await pool.query(`SELECT COUNT(*) as count FROM departments`);
    const skillsResult = await pool.query(`SELECT COUNT(*) as count FROM skills`);
    const deptSkillsResult = await pool.query(`SELECT COUNT(*) as count FROM department_skills`);
    
    console.log(`Departments: ${deptResult.rows[0].count}`);
    console.log(`Skills: ${skillsResult.rows[0].count}`);
    console.log(`Department-Skill links: ${deptSkillsResult.rows[0].count}`);
    console.log();
    
    // 3. Check assessments
    console.log('=== 3. ASSESSMENTS ===');
    const assessmentsResult = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as users_with_assessments,
             COUNT(*) as total_assessments
      FROM analysis_results
    `);
    console.log(`Users with assessments: ${assessmentsResult.rows[0].users_with_assessments}`);
    console.log(`Total assessments: ${assessmentsResult.rows[0].total_assessments}`);
    
    if (assessmentsResult.rows[0].users_with_assessments > 0) {
      const sampleAssessment = await pool.query(`
        SELECT u.name_ar, u.email, ar.analyzed_at, 
               jsonb_array_length(ar.gaps) as gap_count
        FROM analysis_results ar
        JOIN users u ON ar.user_id = u.id
        ORDER BY ar.analyzed_at DESC
        LIMIT 3
      `);
      console.log('\nRecent assessments:');
      sampleAssessment.rows.forEach(row => {
        console.log(`  - ${row.name_ar} (${row.email}): ${row.gap_count} skill gaps on ${new Date(row.analyzed_at).toLocaleDateString()}`);
      });
    }
    console.log();
    
    // 4. Check courses
    console.log('=== 4. COURSES ===');
    const coursesResult = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN synced_to_neo4j = true THEN 1 END) as synced,
             COUNT(DISTINCT difficulty_level) as difficulty_levels
      FROM courses
    `);
    console.log(`Total courses: ${coursesResult.rows[0].total}`);
    console.log(`Synced to Neo4j: ${coursesResult.rows[0].synced}`);
    console.log(`Difficulty levels: ${coursesResult.rows[0].difficulty_levels}`);
    
    if (coursesResult.rows[0].total > 0) {
      const difficultyBreakdown = await pool.query(`
        SELECT difficulty_level, COUNT(*) as count
        FROM courses
        GROUP BY difficulty_level
        ORDER BY count DESC
      `);
      console.log('\nCourses by difficulty:');
      difficultyBreakdown.rows.forEach(row => {
        console.log(`  - ${row.difficulty_level}: ${row.count} courses`);
      });
    }
    console.log();
    
    // 5. Check course-skill relationships
    console.log('=== 5. COURSE-SKILL RELATIONSHIPS ===');
    const courseSkillsResult = await pool.query(`
      SELECT COUNT(*) as total_links,
             COUNT(DISTINCT course_id) as courses_with_skills,
             COUNT(DISTINCT skill_id) as skills_with_courses
      FROM course_skills
    `);
    console.log(`Total course-skill links: ${courseSkillsResult.rows[0].total_links}`);
    console.log(`Courses with skills: ${courseSkillsResult.rows[0].courses_with_skills}`);
    console.log(`Skills with courses: ${courseSkillsResult.rows[0].skills_with_courses}`);
    
    if (courseSkillsResult.rows[0].total_links > 0) {
      const topSkills = await pool.query(`
        SELECT s.name_ar, COUNT(cs.course_id) as course_count
        FROM course_skills cs
        JOIN skills s ON cs.skill_id = s.id
        GROUP BY s.id, s.name_ar
        ORDER BY course_count DESC
        LIMIT 5
      `);
      console.log('\nTop skills with most courses:');
      topSkills.rows.forEach(row => {
        console.log(`  - ${row.name_ar}: ${row.course_count} courses`);
      });
    }
    console.log();
    
    // 6. Check Neo4j configuration
    console.log('=== 6. NEO4J CONFIGURATION ===');
    const hasClientId = !!process.env.NEO4J_CLIENT_ID;
    const hasClientSecret = !!process.env.NEO4J_CLIENT_SECRET;
    const baseUrl = process.env.NEO4J_BASE_URL || 'https://api.nelc.gov.sa/neo4j/v1';
    const isProd = process.env.NEO4J_IS_PROD === 'true';
    
    console.log(`NEO4J_CLIENT_ID: ${hasClientId ? '✅ Set' : '❌ Missing'}`);
    console.log(`NEO4J_CLIENT_SECRET: ${hasClientSecret ? '✅ Set' : '❌ Missing'}`);
    console.log(`NEO4J_BASE_URL: ${baseUrl}`);
    console.log(`NEO4J_IS_PROD: ${isProd}`);
    console.log();
    
    // 7. Summary and recommendations
    console.log('=== 7. SUMMARY & RECOMMENDATIONS ===');
    
    const issues = [];
    const successes = [];
    
    if (!hasClientId || !hasClientSecret) {
      issues.push('❌ Neo4j credentials not configured - Add NEO4J_CLIENT_ID and NEO4J_CLIENT_SECRET to .env');
    } else {
      successes.push('✅ Neo4j credentials configured');
    }
    
    if (coursesResult.rows[0].total === 0) {
      issues.push('❌ No courses in database - Upload courses via CSV');
    } else {
      successes.push(`✅ ${coursesResult.rows[0].total} courses in database`);
    }
    
    if (courseSkillsResult.rows[0].total_links === 0) {
      issues.push('❌ No course-skill relationships - Ensure courses CSV has skills column');
    } else {
      successes.push(`✅ ${courseSkillsResult.rows[0].total_links} course-skill relationships`);
    }
    
    if (coursesResult.rows[0].synced === 0 && coursesResult.rows[0].total > 0) {
      issues.push('⚠️  Courses not synced to Neo4j - Run: POST /api/courses/bulk-sync-neo4j');
    } else if (coursesResult.rows[0].synced > 0) {
      successes.push(`✅ ${coursesResult.rows[0].synced} courses synced to Neo4j`);
    }
    
    if (assessmentsResult.rows[0].users_with_assessments === 0) {
      issues.push('❌ No users have completed assessments - Complete a test to get recommendations');
    } else {
      successes.push(`✅ ${assessmentsResult.rows[0].users_with_assessments} users with assessments`);
    }
    
    if (deptSkillsResult.rows[0].count === 0) {
      issues.push('⚠️  No department-skill links - Link skills to departments');
    } else {
      successes.push(`✅ ${deptSkillsResult.rows[0].count} department-skill links`);
    }
    
    console.log('\n✅ What\'s Working:');
    successes.forEach(s => console.log(`  ${s}`));
    
    if (issues.length > 0) {
      console.log('\n🚨 Issues to Fix:');
      issues.forEach(i => console.log(`  ${i}`));
    } else {
      console.log('\n🎉 Everything looks good! Recommendations should work.');
    }
    
    console.log('\n📖 For detailed troubleshooting, see: NEO4J_RECOMMENDATIONS_TROUBLESHOOTING.md');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkData();

