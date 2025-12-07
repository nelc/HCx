/**
 * Debug script to check competency matrix data flow
 * Run with: node backend/debug-competency-matrix.js <user_id>
 */

const db = require('./src/db');

async function debugCompetencyMatrix(userId) {
  console.log('='.repeat(80));
  console.log('COMPETENCY MATRIX DEBUG');
  console.log('='.repeat(80));
  console.log(`User ID: ${userId}\n`);

  try {
    // 1. Check active domains and skills
    console.log('1. ACTIVE DOMAINS AND SKILLS:');
    console.log('-'.repeat(80));
    const domains = await db.query(`
      SELECT 
        td.id as domain_id,
        td.name_ar as domain_name,
        COUNT(s.id) as skill_count
      FROM training_domains td
      LEFT JOIN skills s ON s.domain_id = td.id
      WHERE td.is_active = true
      GROUP BY td.id, td.name_ar
      ORDER BY td.name_ar
    `);
    
    console.log(`Found ${domains.rows.length} active domains:`);
    domains.rows.forEach(d => {
      console.log(`  - ${d.domain_name}: ${d.skill_count} skills`);
    });
    console.log();

    // 2. Check user's completed assignments
    console.log('2. USER\'S COMPLETED TESTS:');
    console.log('-'.repeat(80));
    const assignments = await db.query(`
      SELECT 
        ta.id as assignment_id,
        t.title_ar,
        td.name_ar as domain_name,
        ta.completed_at,
        ta.status
      FROM test_assignments ta
      JOIN tests t ON ta.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ta.user_id = $1
      ORDER BY ta.completed_at DESC
    `, [userId]);
    
    console.log(`Found ${assignments.rows.length} test assignments:`);
    assignments.rows.forEach(a => {
      console.log(`  - ${a.title_ar} (${a.domain_name})`);
      console.log(`    Status: ${a.status}, Completed: ${a.completed_at || 'N/A'}`);
      console.log(`    Assignment ID: ${a.assignment_id}`);
    });
    console.log();

    // 3. Check analysis results
    console.log('3. ANALYSIS RESULTS:');
    console.log('-'.repeat(80));
    const analyses = await db.query(`
      SELECT 
        ar.id,
        ar.assignment_id,
        ar.overall_score,
        ar.skill_scores,
        ar.analyzed_at,
        t.title_ar
      FROM analysis_results ar
      JOIN tests t ON ar.test_id = t.id
      WHERE ar.user_id = $1
      ORDER BY ar.analyzed_at DESC
    `, [userId]);
    
    console.log(`Found ${analyses.rows.length} analysis results:`);
    analyses.rows.forEach((a, idx) => {
      console.log(`\n  Analysis ${idx + 1}: ${a.title_ar}`);
      console.log(`    Overall Score: ${a.overall_score}%`);
      console.log(`    Analyzed At: ${a.analyzed_at}`);
      console.log(`    Assignment ID: ${a.assignment_id}`);
      
      if (a.skill_scores) {
        const skills = Object.entries(a.skill_scores);
        console.log(`    Skill Scores (${skills.length} skills):`);
        skills.forEach(([skillId, data]) => {
          console.log(`      - Skill ${skillId}: ${data.score}% (${data.level})`);
        });
      } else {
        console.log(`    ❌ NO SKILL_SCORES FOUND!`);
      }
    });
    console.log();

    // 4. Check if questions have skill_id
    if (assignments.rows.length > 0) {
      const latestAssignment = assignments.rows[0];
      console.log('4. CHECKING QUESTIONS FOR LATEST TEST:');
      console.log('-'.repeat(80));
      
      const responses = await db.query(`
        SELECT 
          q.id as question_id,
          q.question_ar,
          q.skill_id,
          s.name_ar as skill_name,
          r.score as response_score
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        LEFT JOIN skills s ON q.skill_id = s.id
        WHERE r.assignment_id = $1
      `, [latestAssignment.assignment_id]);
      
      console.log(`Test: ${latestAssignment.title_ar}`);
      console.log(`Questions: ${responses.rows.length}`);
      
      const questionsWithSkills = responses.rows.filter(r => r.skill_id);
      const questionsWithoutSkills = responses.rows.filter(r => !r.skill_id);
      
      console.log(`  ✓ With skill_id: ${questionsWithSkills.length}`);
      console.log(`  ✗ Without skill_id: ${questionsWithoutSkills.length}`);
      
      if (questionsWithoutSkills.length > 0) {
        console.log('\n  ⚠️  Questions WITHOUT skill_id:');
        questionsWithoutSkills.forEach(q => {
          console.log(`    - ${q.question_ar.substring(0, 60)}...`);
        });
      }
      
      if (questionsWithSkills.length > 0) {
        console.log('\n  ✓ Questions WITH skill_id:');
        questionsWithSkills.forEach(q => {
          console.log(`    - ${q.skill_name}: score=${q.response_score}`);
        });
      }
      console.log();
    }

    // 5. Check employee_skill_profiles
    console.log('5. EMPLOYEE SKILL PROFILES:');
    console.log('-'.repeat(80));
    const profiles = await db.query(`
      SELECT 
        s.name_ar as skill_name,
        esp.current_level,
        esp.last_assessment_score,
        esp.last_assessment_date
      FROM employee_skill_profiles esp
      JOIN skills s ON esp.skill_id = s.id
      WHERE esp.user_id = $1
      ORDER BY esp.last_assessment_date DESC
    `, [userId]);
    
    console.log(`Found ${profiles.rows.length} skill profiles:`);
    profiles.rows.forEach(p => {
      console.log(`  - ${p.skill_name}: ${p.last_assessment_score}% (${p.current_level})`);
      console.log(`    Last assessed: ${p.last_assessment_date}`);
    });
    console.log();

    // 6. Summary
    console.log('6. SUMMARY:');
    console.log('-'.repeat(80));
    console.log(`✓ Active domains: ${domains.rows.length}`);
    console.log(`✓ Completed tests: ${assignments.rows.filter(a => a.status === 'completed').length}`);
    console.log(`✓ Analysis results: ${analyses.rows.length}`);
    console.log(`✓ Skill profiles: ${profiles.rows.length}`);
    
    if (analyses.rows.length === 0 && assignments.rows.filter(a => a.status === 'completed').length > 0) {
      console.log('\n⚠️  WARNING: Tests completed but no analysis results found!');
      console.log('   The analysis may have failed. Check backend logs.');
    }
    
    if (analyses.rows.length > 0 && analyses.rows.some(a => !a.skill_scores || Object.keys(a.skill_scores).length === 0)) {
      console.log('\n⚠️  WARNING: Analysis exists but skill_scores is empty!');
      console.log('   Questions may not have skill_id assigned.');
    }
    
    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node backend/debug-competency-matrix.js <user_id>');
  process.exit(1);
}

debugCompetencyMatrix(userId);

