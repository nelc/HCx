/**
 * Test recommendations after fixing test skills
 * Run: node backend/test-recommendations-final.js
 */

require('dotenv').config();
const db = require('./src/db');
const neo4jApi = require('./src/services/neo4jApi');

async function testRecommendations() {
  try {
    console.log('🧪 Testing Recommendations System (Final)...\n');
    
    // Get the assessment that was cleared
    const assignment = await db.query(`
      SELECT ta.id, ta.user_id, ta.test_id, u.name_ar, t.title_ar
      FROM test_assignments ta
      JOIN users u ON ta.user_id = u.id
      JOIN tests t ON ta.test_id = t.id
      WHERE ta.status = 'completed'
      AND ta.test_id = '5298e0cf-7331-4468-a237-0dae23170ab7'
      LIMIT 1
    `);
    
    if (assignment.rows.length === 0) {
      console.log('❌ No completed assignment found');
      return;
    }
    
    const assign = assignment.rows[0];
    console.log(`📝 Assignment: ${assign.name_ar} - ${assign.title_ar}`);
    console.log(`   Assignment ID: ${assign.id}`);
    console.log(`   User ID: ${assign.user_id}`);
    console.log();
    
    // Trigger re-analysis by calling the internal analyze function
    console.log('🔄 Re-analyzing assignment...');
    
    // Import and call the analyze function
    const { analyzeAssignment } = require('./src/routes/analysis.js');
    
    // Since we can't easily access the internal function, let's do it manually
    // Get responses
    const responses = await db.query(`
      SELECT r.*, q.question_type, q.options, q.weight
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      WHERE r.assignment_id = $1
    `, [assign.id]);
    
    console.log(`   Found ${responses.rows.length} responses`);
    
    // Calculate score
    let totalScore = 0;
    let totalMaxScore = 0;
    
    for (const r of responses.rows) {
      let score = r.score || 0;
      let maxScore = 10;
      
      if (r.question_type === 'mcq' && r.options) {
        const optionScores = r.options.map(o => parseFloat(o.score) || 0);
        maxScore = Math.max(...optionScores, 10);
      }
      
      const weight = r.weight || 1;
      totalScore += score * weight;
      totalMaxScore += maxScore * weight;
    }
    
    const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    console.log(`   Overall score: ${Math.round(overallPercentage)}%`);
    
    // Get test skills
    const testSkills = await db.query(`
      SELECT s.id, s.name_ar, s.name_en
      FROM test_skills ts
      JOIN skills s ON ts.skill_id = s.id
      WHERE ts.test_id = $1
    `, [assign.test_id]);
    
    console.log(`   Test has ${testSkills.rows.length} skills`);
    
    // Create gaps
    const gaps = [];
    for (const skill of testSkills.rows) {
      const gapScore = 100 - overallPercentage;
      if (gapScore > 0) {
        gaps.push({
          skill_id: skill.id,
          skill_name_ar: skill.name_ar,
          skill_name_en: skill.name_en,
          gap_score: Math.round(gapScore),
          gap_percentage: Math.round(gapScore),
          priority: overallPercentage < 40 ? 1 : 2
        });
      }
    }
    
    console.log(`   Generated ${gaps.length} gaps`);
    gaps.forEach(g => {
      console.log(`     - ${g.skill_name_ar}: ${g.gap_score}% gap (priority ${g.priority})`);
    });
    console.log();
    
    // Save analysis results
    console.log('💾 Saving analysis results...');
    await db.query(`
      INSERT INTO analysis_results (
        assignment_id, user_id, test_id, overall_score, 
        skill_scores, gaps, strengths, open_text_analysis, analyzed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (assignment_id) DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        skill_scores = EXCLUDED.skill_scores,
        gaps = EXCLUDED.gaps,
        analyzed_at = CURRENT_TIMESTAMP
    `, [
      assign.id,
      assign.user_id,
      assign.test_id,
      Math.round(overallPercentage),
      JSON.stringify({}),
      JSON.stringify(gaps),
      JSON.stringify([]),
      JSON.stringify({themes: [], sentiments: [], key_insights: [], concerns: []})
    ]);
    
    console.log('✅ Analysis saved!\\n');
    
    // Now test Neo4j recommendations
    console.log('=== TESTING NEO4J RECOMMENDATIONS ===\\n');
    
    // Test Neo4j connection
    const token = await neo4jApi.getAccessToken();
    console.log('✅ Neo4j connected');
    
    // Check courses
    const coursesCount = await db.query('SELECT COUNT(*) FROM courses WHERE synced_to_neo4j = true');
    console.log(`✅ ${coursesCount.rows[0].count} courses synced to Neo4j`);
    
    // Check course-skill links for our gaps
    for (const gap of gaps.slice(0, 2)) {
      const coursesForSkill = await db.query(`
        SELECT COUNT(*) 
        FROM course_skills cs
        JOIN courses c ON cs.course_id = c.id
        WHERE cs.skill_id = $1 AND c.synced_to_neo4j = true
      `, [gap.skill_id]);
      
      console.log(`✅ Skill "${gap.skill_name_ar}": ${coursesForSkill.rows[0].count} courses available`);
    }
    
    console.log();
    console.log('🎯 Ready to test! Try this:');
    console.log(`   GET http://localhost:3001/api/recommendations/neo4j/${assign.user_id}`);
    console.log();
    console.log('Or login as: ahmed@hrx.com and view التوصيات الذكية');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

testRecommendations();

