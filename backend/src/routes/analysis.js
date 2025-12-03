const express = require('express');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');
const OpenAI = require('openai');

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Analyze assignment responses
router.post('/assignment/:assignmentId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Get assignment details
    const assignment = await db.query(`
      SELECT ta.*, t.id as test_id, t.title_ar, t.title_en,
             u.id as user_id, u.name_ar as user_name_ar, u.name_en as user_name_en,
             td.name_ar as domain_name_ar, td.name_en as domain_name_en
      FROM test_assignments ta
      JOIN tests t ON ta.test_id = t.id
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ta.id = $1 AND ta.status = 'completed'
    `, [req.params.assignmentId]);
    
    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Completed assignment not found' });
    }
    
    const assignmentData = assignment.rows[0];
    
    // Check if already analyzed
    const existingAnalysis = await db.query(
      'SELECT id FROM analysis_results WHERE assignment_id = $1',
      [req.params.assignmentId]
    );
    
    if (existingAnalysis.rows.length > 0) {
      return res.status(400).json({ error: 'Assignment already analyzed', analysis_id: existingAnalysis.rows[0].id });
    }
    
    // Get responses with questions and skills
    const responses = await db.query(`
      SELECT r.*, 
             q.question_ar, q.question_en, q.question_type, q.options, q.weight,
             s.id as skill_id, s.name_ar as skill_name_ar, s.name_en as skill_name_en, s.weight as skill_weight
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      LEFT JOIN skills s ON q.skill_id = s.id
      WHERE r.assignment_id = $1
      ORDER BY q.order_index
    `, [req.params.assignmentId]);
    
    // Calculate skill scores
    const skillScores = {};
    const openTextResponses = [];
    
    for (const response of responses.rows) {
      if (response.skill_id) {
        if (!skillScores[response.skill_id]) {
          skillScores[response.skill_id] = {
            skill_id: response.skill_id,
            name_ar: response.skill_name_ar,
            name_en: response.skill_name_en,
            total_score: 0,
            max_score: 0,
            count: 0,
            weight: response.skill_weight || 1
          };
        }
        
        let score = 0;
        let maxScore = 10;
        
        switch (response.question_type) {
          case 'mcq':
            score = response.score || 0;
            maxScore = Math.max(...(response.options || []).map(o => o.score || 0)) || 10;
            break;
          case 'likert_scale':
            score = parseInt(response.response_value) || 0;
            maxScore = 5;
            break;
          case 'self_rating':
            score = parseInt(response.response_value) || 0;
            maxScore = 10;
            break;
        }
        
        skillScores[response.skill_id].total_score += score * (response.weight || 1);
        skillScores[response.skill_id].max_score += maxScore * (response.weight || 1);
        skillScores[response.skill_id].count++;
      }
      
      if (response.question_type === 'open_text' && response.response_value) {
        openTextResponses.push({
          question_ar: response.question_ar,
          question_en: response.question_en,
          response: response.response_value
        });
      }
    }
    
    // Calculate final skill levels
    const skillResults = {};
    const strengths = [];
    const gaps = [];
    
    for (const [skillId, data] of Object.entries(skillScores)) {
      const percentage = data.max_score > 0 ? (data.total_score / data.max_score) * 100 : 0;
      let level = 'low';
      if (percentage >= 70) level = 'high';
      else if (percentage >= 40) level = 'medium';
      
      skillResults[skillId] = {
        score: Math.round(percentage),
        level,
        gap_percentage: Math.round(100 - percentage)
      };
      
      if (level === 'high') {
        strengths.push({
          skill_id: skillId,
          skill_name_ar: data.name_ar,
          skill_name_en: data.name_en,
          score: Math.round(percentage),
          description_ar: `أداء ممتاز في ${data.name_ar}`,
          description_en: `Excellent performance in ${data.name_en}`
        });
      } else if (level === 'low') {
        gaps.push({
          skill_id: skillId,
          skill_name_ar: data.name_ar,
          skill_name_en: data.name_en,
          gap_score: Math.round(100 - percentage),
          priority: 1,
          description_ar: `يحتاج تطوير في ${data.name_ar}`,
          description_en: `Needs development in ${data.name_en}`
        });
      } else {
        gaps.push({
          skill_id: skillId,
          skill_name_ar: data.name_ar,
          skill_name_en: data.name_en,
          gap_score: Math.round(100 - percentage),
          priority: 2,
          description_ar: `يمكن تحسين ${data.name_ar}`,
          description_en: `Can improve ${data.name_en}`
        });
      }
    }
    
    // Sort gaps by priority
    gaps.sort((a, b) => a.priority - b.priority || b.gap_score - a.gap_score);
    
    // Calculate overall score
    const overallScore = Object.values(skillResults).length > 0
      ? Math.round(Object.values(skillResults).reduce((sum, s) => sum + s.score, 0) / Object.values(skillResults).length)
      : 0;
    
    // AI Analysis for open text responses
    let openTextAnalysis = { themes: [], sentiments: [], key_insights: [], concerns: [] };
    let aiSummary = { ar: '', en: '' };
    let aiRecommendations = { ar: '', en: '' };
    let rawAiResponse = null;
    
    if (openTextResponses.length > 0 && process.env.OPENAI_API_KEY) {
      try {
        const prompt = `Analyze the following employee assessment responses. Provide analysis in both Arabic and English.

Employee: ${assignmentData.user_name_en}
Assessment: ${assignmentData.title_en}
Domain: ${assignmentData.domain_name_en}

Open-text responses:
${openTextResponses.map((r, i) => `Q${i+1}: ${r.question_en}\nA: ${r.response}`).join('\n\n')}

Skill Assessment Results:
${Object.entries(skillScores).map(([id, s]) => `- ${s.name_en}: ${skillResults[id]?.score || 0}% (${skillResults[id]?.level || 'N/A'})`).join('\n')}

Please provide:
1. Key themes from open-text responses
2. Sentiment analysis
3. Key insights and concerns
4. Summary of the employee's performance
5. Specific training recommendations

Format response as JSON with this structure:
{
  "themes": ["theme1", "theme2"],
  "sentiments": ["positive aspects", "areas of concern"],
  "key_insights": ["insight1", "insight2"],
  "concerns": ["concern1", "concern2"],
  "summary_ar": "Arabic summary",
  "summary_en": "English summary",
  "recommendations_ar": "Arabic recommendations",
  "recommendations_en": "English recommendations"
}`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        });
        
        const aiResult = JSON.parse(completion.choices[0].message.content);
        rawAiResponse = aiResult;
        
        openTextAnalysis = {
          themes: aiResult.themes || [],
          sentiments: aiResult.sentiments || [],
          key_insights: aiResult.key_insights || [],
          concerns: aiResult.concerns || []
        };
        
        aiSummary = {
          ar: aiResult.summary_ar || '',
          en: aiResult.summary_en || ''
        };
        
        aiRecommendations = {
          ar: aiResult.recommendations_ar || '',
          en: aiResult.recommendations_en || ''
        };
      } catch (aiError) {
        console.error('AI analysis error:', aiError);
        // Continue without AI analysis
      }
    }
    
    // Save analysis results
    const analysisResult = await db.query(`
      INSERT INTO analysis_results (
        assignment_id, user_id, test_id, overall_score,
        skill_scores, strengths, gaps, open_text_analysis,
        ai_summary_ar, ai_summary_en, ai_recommendations_ar, ai_recommendations_en,
        raw_ai_response
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      req.params.assignmentId,
      assignmentData.user_id,
      assignmentData.test_id,
      overallScore,
      JSON.stringify(skillResults),
      JSON.stringify(strengths),
      JSON.stringify(gaps),
      JSON.stringify(openTextAnalysis),
      aiSummary.ar,
      aiSummary.en,
      aiRecommendations.ar,
      aiRecommendations.en,
      rawAiResponse ? JSON.stringify(rawAiResponse) : null
    ]);
    
    // Generate training recommendations for gaps
    for (const gap of gaps.filter(g => g.priority === 1)) {
      await db.query(`
        INSERT INTO training_recommendations (
          analysis_id, user_id, skill_id,
          course_title_ar, course_title_en,
          course_description_ar, course_description_en,
          priority, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ai_generated')
      `, [
        analysisResult.rows[0].id,
        assignmentData.user_id,
        gap.skill_id,
        `دورة تطوير ${gap.skill_name_ar}`,
        `${gap.skill_name_en} Development Course`,
        `برنامج تدريبي لتحسين مهارات ${gap.skill_name_ar}`,
        `Training program to improve ${gap.skill_name_en} skills`,
        gap.priority
      ]);
    }
    
    // Update employee skill profiles
    for (const [skillId, data] of Object.entries(skillResults)) {
      await db.query(`
        INSERT INTO employee_skill_profiles (user_id, skill_id, current_level, last_assessment_score, last_assessment_date)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, skill_id)
        DO UPDATE SET 
          current_level = $3, 
          last_assessment_score = $4, 
          last_assessment_date = NOW(),
          improvement_trend = CASE 
            WHEN employee_skill_profiles.last_assessment_score < $4 THEN 'improving'
            WHEN employee_skill_profiles.last_assessment_score > $4 THEN 'declining'
            ELSE 'stable'
          END
      `, [assignmentData.user_id, skillId, data.level, data.score]);
    }
    
    // Create notification for employee
    await db.query(`
      INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link)
      VALUES ($1, 'results_ready', 'نتائج التقييم جاهزة', 'Assessment Results Ready',
              'نتائج تقييمك جاهزة للمشاهدة', 'Your assessment results are ready to view',
              '/my-results')
    `, [assignmentData.user_id]);
    
    res.json({
      analysis: analysisResult.rows[0],
      skill_results: skillResults,
      strengths,
      gaps,
      open_text_analysis: openTextAnalysis
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze responses' });
  }
});

// Get analysis result
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ar.*,
             u.name_ar as user_name_ar,
             u.name_en as user_name_en,
             t.title_ar as test_title_ar,
             t.title_en as test_title_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en
      FROM analysis_results ar
      JOIN users u ON ar.user_id = u.id
      JOIN tests t ON ar.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ar.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    // Check authorization
    if (req.user.role === 'employee' && result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get recommendations
    const recommendations = await db.query(`
      SELECT tr.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en
      FROM training_recommendations tr
      LEFT JOIN skills s ON tr.skill_id = s.id
      WHERE tr.analysis_id = $1
      ORDER BY tr.priority
    `, [req.params.id]);
    
    res.json({
      ...result.rows[0],
      recommendations: recommendations.rows
    });
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
});

// Get analysis by assignment
router.get('/assignment/:assignmentId', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ar.*,
             u.name_ar as user_name_ar,
             u.name_en as user_name_en,
             t.title_ar as test_title_ar,
             t.title_en as test_title_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en
      FROM analysis_results ar
      JOIN users u ON ar.user_id = u.id
      JOIN tests t ON ar.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ar.assignment_id = $1
    `, [req.params.assignmentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    // Check authorization
    if (req.user.role === 'employee' && result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const recommendations = await db.query(`
      SELECT tr.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en
      FROM training_recommendations tr
      LEFT JOIN skills s ON tr.skill_id = s.id
      WHERE tr.analysis_id = $1
      ORDER BY tr.priority
    `, [result.rows[0].id]);
    
    res.json({
      ...result.rows[0],
      recommendations: recommendations.rows
    });
  } catch (error) {
    console.error('Get analysis by assignment error:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
});

// Get user's analyses
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    // Check authorization
    if (req.user.role === 'employee' && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await db.query(`
      SELECT ar.*,
             t.title_ar as test_title_ar,
             t.title_en as test_title_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color
      FROM analysis_results ar
      JOIN tests t ON ar.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ar.user_id = $1
      ORDER BY ar.analyzed_at DESC
    `, [req.params.userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get user analyses error:', error);
    res.status(500).json({ error: 'Failed to get analyses' });
  }
});

module.exports = router;

