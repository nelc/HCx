require('dotenv').config();
const db = require('./src/db');

async function diagnose() {
  try {
    // 1. Get a sample assessment
    const assessment = await db.query(`
      SELECT ar.*, u.name_ar, t.title_ar as test_name
      FROM analysis_results ar
      JOIN users u ON ar.user_id = u.id
      JOIN tests t ON ar.test_id = t.id
      LIMIT 1
    `);
    
    if (assessment.rows.length === 0) {
      console.log('No assessments found');
      await db.pool.end();
      return;
    }
    
    const result = assessment.rows[0];
    console.log('📊 Assessment Details:\n');
    console.log(`User: ${result.name_ar}`);
    console.log(`Test: ${result.test_name}`);
    console.log(`Score: ${result.overall_score}%`);
    console.log(`Skill Scores:`, result.skill_scores);
    console.log(`Gaps:`, result.gaps);
    console.log();
    
    // 2. Check if test has questions
    const questionCount = await db.query(`
      SELECT COUNT(*) FROM test_questions WHERE test_id = $1
    `, [result.test_id]);
    
    console.log(`Questions in test: ${questionCount.rows[0].count}`);
    
    // 3. Check if questions have skills
    const questionsWithSkills = await db.query(`
      SELECT 
        COUNT(DISTINCT tq.question_id) as total_questions,
        COUNT(DISTINCT CASE WHEN qs.skill_id IS NOT NULL THEN tq.question_id END) as questions_with_skills
      FROM test_questions tq
      LEFT JOIN question_skills qs ON tq.question_id = qs.question_id
      WHERE tq.test_id = $1
    `, [result.test_id]);
    
    const stats = questionsWithSkills.rows[0];
    console.log(`Questions with skills: ${stats.questions_with_skills} / ${stats.total_questions}`);
    console.log();
    
    // 4. Sample questions with their skills
    const sampleQuestions = await db.query(`
      SELECT q.id, q.text_ar, 
             json_agg(json_build_object('id', s.id, 'name', s.name_ar)) as skills
      FROM test_questions tq
      JOIN questions q ON tq.question_id = q.id
      LEFT JOIN question_skills qs ON q.id = qs.question_id
      LEFT JOIN skills s ON qs.skill_id = s.id
      WHERE tq.test_id = $1
      GROUP BY q.id, q.text_ar
      LIMIT 3
    `, [result.test_id]);
    
    console.log('Sample questions:');
    sampleQuestions.rows.forEach((q, i) => {
      console.log(`\n${i+1}. ${q.text_ar?.substring(0, 80)}...`);
      const validSkills = q.skills.filter(s => s.id !== null);
      console.log(`   Skills: ${validSkills.length > 0 ? validSkills.map(s => s.name).join(', ') : 'NONE ❌'}`);
    });
    
    console.log();
    console.log('=== DIAGNOSIS ===');
    
    if (stats.questions_with_skills === '0') {
      console.log('❌ PROBLEM: Questions don\'t have skills linked!');
      console.log('   Solution: When creating tests, link questions to skills');
      console.log('   OR: Regenerate questions with skills using AI');
    } else if (Object.keys(result.skill_scores).length === 0) {
      console.log('❌ PROBLEM: User didn\'t answer questions OR answers weren\'t recorded');
      console.log('   Check responses table for this assignment');
    } else {
      console.log('✅ Questions have skills');
      console.log('⚠️  But gaps array is empty - check gap calculation logic');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.pool.end();
  }
}

diagnose();

