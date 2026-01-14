require('dotenv').config();
const db = require('./src/db');

async function check() {
  try {
    const testId = '5298e0cf-7331-4468-a237-0dae23170ab7';
    
    // Check questions and their skills
    const questions = await db.query(`
      SELECT q.id, q.question_ar, q.skill_id, s.name_ar as skill_name
      FROM questions q
      LEFT JOIN skills s ON q.skill_id = s.id
      WHERE q.test_id = $1
      ORDER BY q.order_index
      LIMIT 10
    `, [testId]);
    
    console.log('=== TEST QUESTIONS ===\n');
    questions.rows.forEach((q, i) => {
      console.log(`${i+1}. ${q.question_ar.substring(0, 70)}...`);
      console.log(`   Skill ID: ${q.skill_id || '❌ NONE'}`);
      console.log(`   Skill: ${q.skill_name || '❌ NOT LINKED'}`);
      console.log();
    });
    
    // Count stats
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_questions,
        COUNT(skill_id) as questions_with_skills
      FROM questions
      WHERE test_id = $1
    `, [testId]);
    
    console.log(`\n=== STATS ===`);
    console.log(`Total questions: ${stats.rows[0].total_questions}`);
    console.log(`Questions with skills: ${stats.rows[0].questions_with_skills}`);
    console.log();
    
    if (stats.rows[0].questions_with_skills === '0') {
      console.log('❌ PROBLEM FOUND: NO questions have skills linked!');
      console.log('\nThis is why you have no recommendations:');
      console.log('1. Questions have no skills → No skill scores calculated');
      console.log('2. No skill scores → No skill gaps');
      console.log('3. No skill gaps → No recommendations');
      console.log('\nSOLUTION:');
      console.log('- Edit the test and link questions to skills');
      console.log('- OR regenerate the test with AI (will auto-link skills)');
      console.log('- Then have users retake the assessment');
    } else {
      console.log('✅ Questions have skills linked');
      console.log('The issue might be in the analysis/gap calculation logic');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.pool.end();
  }
}

check();

