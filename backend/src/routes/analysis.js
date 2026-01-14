const express = require('express');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');
const OpenAI = require('openai');
const { categorizeByTestResult, generateRecommendationReason, generateUserProfile } = require('../services/userCategorizer');
const { generateEnhancedRecommendations, storeRecommendationsWithReasons } = require('../services/recommendationEngine');

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Reusable function to analyze assignment responses
async function analyzeAssignment(assignmentId) {
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
    `, [assignmentId]);
    
    if (assignment.rows.length === 0) {
      throw new Error('Completed assignment not found');
    }
    
    const assignmentData = assignment.rows[0];
    
    // Check if already analyzed
    const existingAnalysis = await db.query(
      'SELECT id FROM analysis_results WHERE assignment_id = $1',
      [assignmentId]
    );
    
    if (existingAnalysis.rows.length > 0) {
      return { already_analyzed: true, analysis_id: existingAnalysis.rows[0].id };
    }
    
    // Get responses with questions (without question-level skills)
    const responses = await db.query(`
      SELECT r.*, 
             q.question_ar, q.question_en, q.question_type, q.options, q.weight
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      WHERE r.assignment_id = $1
      ORDER BY q.order_index
    `, [assignmentId]);
    
    // Get test-level skills (targeted skills for this test)
    const testSkills = await db.query(`
      SELECT s.id as skill_id, s.name_ar as skill_name_ar, s.name_en as skill_name_en, 
             s.weight as skill_weight
      FROM test_skills ts
      JOIN skills s ON ts.skill_id = s.id
      WHERE ts.test_id = $1
    `, [assignmentData.test_id]);
    
    console.log(`Test has ${testSkills.rows.length} targeted skills`);
    
    // Calculate overall test performance first
    let totalScore = 0;
    let totalMaxScore = 0;
    const openTextResponses = [];
    
    // Log for debugging
    console.log(`Processing ${responses.rows.length} responses for assignment ${assignmentId}`);
    
    for (const response of responses.rows) {
      // Calculate score for each response (question)
      let score = 0;
      let maxScore = 10;
      let hasValidScore = false;
        
        // Use stored score if available (calculated when response was saved)
        // Otherwise fall back to calculating from response_value for backward compatibility
        switch (response.question_type) {
          case 'mcq':
            if (response.score !== null && response.score !== undefined) {
              score = parseFloat(response.score) || 0;
              hasValidScore = true;
            } else if (response.response_value) {
              // Fallback: try to find score from options
              if (response.options && Array.isArray(response.options)) {
                const selectedOption = response.options.find(o => o.value === response.response_value);
                if (selectedOption) {
                  score = parseFloat(selectedOption.score) || 0;
                  hasValidScore = true;
                }
              }
            }
            // For MCQ, max score is the highest option score
            if (response.options && Array.isArray(response.options) && response.options.length > 0) {
              const optionScores = response.options.map(o => parseFloat(o.score) || 0);
              maxScore = Math.max(...optionScores, 10);
            } else {
              maxScore = 10;
            }
            break;
          case 'likert_scale':
            // Likert scores are normalized to 0-10 scale when saved
            if (response.score !== null && response.score !== undefined) {
              score = parseFloat(response.score);
              hasValidScore = true;
            } else if (response.response_value) {
              // Fallback: normalize 1-5 to 0-10 scale
              const likertValue = parseInt(response.response_value);
              if (likertValue >= 1 && likertValue <= 5) {
                score = ((likertValue - 1) / 4) * 10;
                hasValidScore = true;
              }
            }
            maxScore = 10; // Normalized max score
            break;
          case 'self_rating':
            // Self-rating scores are stored as 1-10 when saved
            if (response.score !== null && response.score !== undefined) {
              score = parseFloat(response.score);
              hasValidScore = true;
            } else if (response.response_value) {
              // Fallback
              const ratingValue = parseInt(response.response_value);
              if (ratingValue >= 1 && ratingValue <= 10) {
                score = ratingValue;
                hasValidScore = true;
              }
            }
            maxScore = 10;
            break;
          default:
            // For other types, try to use stored score
            if (response.score !== null && response.score !== undefined) {
              score = parseFloat(response.score) || 0;
              hasValidScore = true;
            }
            maxScore = 10;
        }
        
      // Add to overall totals
      if (hasValidScore) {
        const weight = response.weight || 1;
        totalScore += score * weight;
        totalMaxScore += maxScore * weight;
        
        console.log(`Question ${response.question_id} (${response.question_type}): score ${score}/${maxScore} (weight: ${weight})`);
      } else {
        console.warn(`Response ${response.id} for question ${response.question_id} (${response.question_type}) has no valid score`);
      }
      
      if (response.question_type === 'open_text' && response.response_value) {
        openTextResponses.push({
          question_ar: response.question_ar,
          question_en: response.question_en,
          response: response.response_value
        });
      }
    }
    
    // Calculate overall test performance percentage
    const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    const overallScore = Math.round(overallPercentage);
    
    console.log(`Overall test score: ${overallScore}% (${totalScore}/${totalMaxScore})`);
    console.log(`Applying score to ${testSkills.rows.length} test-level skills`);
    
    // Apply the overall test performance to all test-level skills
    const skillResults = {};
    const strengths = [];
    const gaps = [];
    
    if (testSkills.rows.length === 0) {
      console.warn('⚠️ WARNING: Test has no targeted skills linked! Cannot generate skill-based recommendations.');
      console.warn('   Please link skills to this test in test_skills table to enable recommendations.');
    }
    
    for (const testSkill of testSkills.rows) {
      const percentage = overallPercentage; // Apply same percentage to all skills
      // Aligned with PROFICIENCY_LEVELS: Advanced >= 70%, Intermediate 40-69%, Beginner 0-39%
      let level = 'low';
      if (percentage >= 70) level = 'high';
      else if (percentage >= 40) level = 'medium';
      
      skillResults[testSkill.skill_id] = {
        score: Math.round(percentage),
        level,
        gap_percentage: Math.round(100 - percentage)
      };
      
      if (level === 'high') {
        strengths.push({
          skill_id: testSkill.skill_id,
          skill_name_ar: testSkill.skill_name_ar,
          skill_name_en: testSkill.skill_name_en,
          score: Math.round(percentage),
          description_ar: `أداء ممتاز في ${testSkill.skill_name_ar}`,
          description_en: `Excellent performance in ${testSkill.skill_name_en}`
        });
        // Also add to gaps for advanced training recommendations (if not 100%)
        const gapPercentage = Math.round(100 - percentage);
        if (gapPercentage > 0) {
          gaps.push({
            skill_id: testSkill.skill_id,
            skill_name_ar: testSkill.skill_name_ar,
            skill_name_en: testSkill.skill_name_en,
            gap_score: gapPercentage,
            gap_percentage: gapPercentage,
            priority: 3, // Lower priority for advanced skills
            description_ar: `يمكن التخصص أكثر في ${testSkill.skill_name_ar}`,
            description_en: `Can specialize further in ${testSkill.skill_name_en}`
          });
        }
      } else if (level === 'low') {
        gaps.push({
          skill_id: testSkill.skill_id,
          skill_name_ar: testSkill.skill_name_ar,
          skill_name_en: testSkill.skill_name_en,
          gap_score: Math.round(100 - percentage),
          gap_percentage: Math.round(100 - percentage),
          priority: 1,
          description_ar: `يحتاج تطوير في ${testSkill.skill_name_ar}`,
          description_en: `Needs development in ${testSkill.skill_name_en}`
        });
      } else {
        gaps.push({
          skill_id: testSkill.skill_id,
          skill_name_ar: testSkill.skill_name_ar,
          skill_name_en: testSkill.skill_name_en,
          gap_score: Math.round(100 - percentage),
          gap_percentage: Math.round(100 - percentage),
          priority: 2,
          description_ar: `يمكن تحسين ${testSkill.skill_name_ar}`,
          description_en: `Can improve ${testSkill.skill_name_en}`
        });
      }
    }
    
    // Sort gaps by priority
    gaps.sort((a, b) => a.priority - b.priority || b.gap_score - a.gap_score);
    
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

Overall Test Score: ${overallScore}%

Skill Assessment Results (Test-level skills):
${testSkills.rows.map(s => `- ${s.skill_name_en}: ${skillResults[s.skill_id]?.score || 0}% (${skillResults[s.skill_id]?.level || 'N/A'})`).join('\n')}

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
      assignmentId,
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
    
    // Categorize user based on overall score
    const userCategory = categorizeByTestResult(overallScore);
    console.log(`👤 User Categorized as: ${userCategory.label_en} (Score: ${overallScore}%)`);
    
    // Prepare exam context for recommendation reasons
    const examContext = {
      test_id: assignmentData.test_id,
      test_title_ar: assignmentData.title_ar,
      test_title_en: assignmentData.title_en,
      domain_name_ar: assignmentData.domain_name_ar,
      domain_name_en: assignmentData.domain_name_en,
      department: null // Will be fetched if needed
    };
    
    // Generate enhanced training recommendations with exam context
    console.log('🎯 Generating enhanced recommendations with exam context...');
    
    // Try to generate enhanced Neo4j recommendations
    let enhancedRecsGenerated = false;
    try {
      // Prepare analysis result for recommendation engine
      const analysisForRecs = {
        user_id: assignmentData.user_id,
        test_id: assignmentData.test_id,
        overall_score: overallScore,
        gaps: gaps,
        strengths: strengths,
        analyzed_at: new Date().toISOString()
      };
      
      // Generate enhanced recommendations using Neo4j + AI enrichment
      const enhancedRecs = await generateEnhancedRecommendations(
        assignmentData.user_id,
        analysisForRecs,
        examContext,
        5 // Top 5 recommendations
      );
      
      if (enhancedRecs && enhancedRecs.length > 0) {
        // Store enhanced recommendations with reasons
        await storeRecommendationsWithReasons(
          assignmentData.user_id,
          analysisResult.rows[0].id,
          enhancedRecs,
          examContext
        );
        enhancedRecsGenerated = true;
        console.log(`✅ Generated ${enhancedRecs.length} enhanced recommendations with exam context`);
      }
    } catch (enhancedError) {
      console.log('⚠️ Enhanced recommendations not available, falling back to basic:', enhancedError.message);
    }
    
    // Fallback: Generate basic recommendations for priority gaps if enhanced failed
    if (!enhancedRecsGenerated) {
      for (const gap of gaps.filter(g => g.priority === 1)) {
        // Generate recommendation reason
        const reason = generateRecommendationReason({
          exam_name_ar: assignmentData.title_ar,
          exam_name_en: assignmentData.title_en,
          exam_id: assignmentData.test_id,
          analyzed_at: new Date().toISOString(),
          user_category: userCategory,
          matching_skills: [gap.skill_name_ar],
          skill_gap_score: gap.gap_score
        });
        
        await db.query(`
          INSERT INTO training_recommendations (
            analysis_id, user_id, skill_id,
            course_title_ar, course_title_en,
            course_description_ar, course_description_en,
            priority, source, recommendation_reason, source_exam_id, user_proficiency_category
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ai_generated', $9, $10, $11)
        `, [
          analysisResult.rows[0].id,
          assignmentData.user_id,
          gap.skill_id,
          `دورة تطوير ${gap.skill_name_ar}`,
          `${gap.skill_name_en} Development Course`,
          `برنامج تدريبي لتحسين مهارات ${gap.skill_name_ar}`,
          `Training program to improve ${gap.skill_name_en} skills`,
          gap.priority,
          JSON.stringify(reason),
          assignmentData.test_id,
          userCategory.key
        ]);
      }
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
    
    return {
      analysis: analysisResult.rows[0],
      skill_results: skillResults,
      strengths,
      gaps,
      open_text_analysis: openTextAnalysis,
      // NEW: User categorization based on test results
      user_category: userCategory,
      exam_context: examContext
    };
  } catch (error) {
    console.error('Analysis error:', error);
    throw error;
  }
}

// Analyze assignment responses (admin endpoint - kept for backward compatibility)
router.post('/assignment/:assignmentId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await analyzeAssignment(req.params.assignmentId);
    
    if (result.already_analyzed) {
      return res.status(400).json({ error: 'Assignment already analyzed', analysis_id: result.analysis_id });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze responses' });
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
    
    // Get weighted breakdown
    const weightedBreakdown = await db.query(`
      SELECT 
        q.id,
        q.question_ar,
        q.question_en,
        q.question_type,
        q.weight,
        q.options,
        r.score,
        r.is_correct,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      LEFT JOIN skills s ON q.skill_id = s.id
      WHERE r.assignment_id = $1
      ORDER BY q.order_index
    `, [result.rows[0].assignment_id]);
    
    const breakdown = weightedBreakdown.rows.map(q => {
      const weight = parseFloat(q.weight) || 1;
      let maxScore = 10;
      
      if (q.question_type === 'mcq' && q.options && Array.isArray(q.options) && q.options.length > 0) {
        const optionScores = q.options.map(o => parseFloat(o.score) || 0);
        maxScore = Math.max(...optionScores, 10);
      } else if (q.question_type === 'likert_scale' || q.question_type === 'self_rating') {
        maxScore = 10;
      }
      
      const rawScore = parseFloat(q.score) || 0;
      const weightedScore = rawScore * weight;
      const weightedMaxScore = maxScore * weight;
      
      return {
        question_id: q.id,
        question_ar: q.question_ar,
        question_en: q.question_en,
        question_type: q.question_type,
        skill_name_ar: q.skill_name_ar,
        skill_name_en: q.skill_name_en,
        weight: weight,
        raw_score: Math.round(rawScore * 10) / 10,
        max_score: maxScore,
        weighted_score: Math.round(weightedScore * 10) / 10,
        weighted_max_score: Math.round(weightedMaxScore * 10) / 10,
        percentage: maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0,
        is_correct: q.is_correct
      };
    });
    
    // Calculate totals
    const totalWeightedScore = breakdown.reduce((sum, q) => sum + q.weighted_score, 0);
    const totalWeightedMaxScore = breakdown.reduce((sum, q) => sum + q.weighted_max_score, 0);
    const calculatedOverallScore = totalWeightedMaxScore > 0 ? 
      Math.round((totalWeightedScore / totalWeightedMaxScore) * 100) : 0;
    
    res.json({
      ...result.rows[0],
      // Override with recalculated score for consistency
      overall_score: calculatedOverallScore,
      recommendations: recommendations.rows,
      weighted_breakdown: breakdown,
      weighted_totals: {
        total_weighted_score: Math.round(totalWeightedScore * 10) / 10,
        total_weighted_max_score: Math.round(totalWeightedMaxScore * 10) / 10,
        weighted_percentage: calculatedOverallScore
      }
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
    
    // Get weighted breakdown
    const weightedBreakdown = await db.query(`
      SELECT 
        q.id,
        q.question_ar,
        q.question_en,
        q.question_type,
        q.weight,
        q.options,
        r.score,
        r.is_correct,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      LEFT JOIN skills s ON q.skill_id = s.id
      WHERE r.assignment_id = $1
      ORDER BY q.order_index
    `, [req.params.assignmentId]);
    
    const breakdown = weightedBreakdown.rows.map(q => {
      const weight = parseFloat(q.weight) || 1;
      let maxScore = 10;
      
      if (q.question_type === 'mcq' && q.options && Array.isArray(q.options) && q.options.length > 0) {
        const optionScores = q.options.map(o => parseFloat(o.score) || 0);
        maxScore = Math.max(...optionScores, 10);
      } else if (q.question_type === 'likert_scale' || q.question_type === 'self_rating') {
        maxScore = 10;
      }
      
      const rawScore = parseFloat(q.score) || 0;
      const weightedScore = rawScore * weight;
      const weightedMaxScore = maxScore * weight;
      
      return {
        question_id: q.id,
        question_ar: q.question_ar,
        question_en: q.question_en,
        question_type: q.question_type,
        skill_name_ar: q.skill_name_ar,
        skill_name_en: q.skill_name_en,
        weight: weight,
        raw_score: Math.round(rawScore * 10) / 10,
        max_score: maxScore,
        weighted_score: Math.round(weightedScore * 10) / 10,
        weighted_max_score: Math.round(weightedMaxScore * 10) / 10,
        percentage: maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0,
        is_correct: q.is_correct
      };
    });
    
    // Calculate totals
    const totalWeightedScore = breakdown.reduce((sum, q) => sum + q.weighted_score, 0);
    const totalWeightedMaxScore = breakdown.reduce((sum, q) => sum + q.weighted_max_score, 0);
    const calculatedOverallScore = totalWeightedMaxScore > 0 ? 
      Math.round((totalWeightedScore / totalWeightedMaxScore) * 100) : 0;
    
    res.json({
      ...result.rows[0],
      // Override with recalculated score for consistency
      overall_score: calculatedOverallScore,
      recommendations: recommendations.rows,
      weighted_breakdown: breakdown,
      weighted_totals: {
        total_weighted_score: Math.round(totalWeightedScore * 10) / 10,
        total_weighted_max_score: Math.round(totalWeightedMaxScore * 10) / 10,
        weighted_percentage: calculatedOverallScore
      }
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

// Get comprehensive analytics for a user
router.get('/analytics/:userId', authenticate, async (req, res) => {
  try {
    // Check authorization
    if (req.user.role === 'employee' && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const userId = req.params.userId;

    // Get all user's analyses with historical data
    const analyses = await db.query(`
      SELECT ar.*,
             t.title_ar as test_title_ar,
             t.title_en as test_title_en,
             td.id as domain_id,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color
      FROM analysis_results ar
      JOIN tests t ON ar.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ar.user_id = $1
      ORDER BY ar.analyzed_at ASC
    `, [userId]);

    if (analyses.rows.length === 0) {
      return res.json({
        total_assessments: 0,
        overall_average: 0,
        improvement_rate: 0,
        skill_trends: [],
        domain_performance: [],
        strengths_overview: [],
        priority_gaps: [],
        learning_velocity: 0
      });
    }

    // Calculate overall metrics
    const totalAssessments = analyses.rows.length;
    const overallAverage = Math.round(
      analyses.rows.reduce((sum, a) => sum + (a.overall_score || 0), 0) / totalAssessments
    );

    // Calculate improvement rate (comparing first vs last 3 assessments)
    let improvementRate = 0;
    if (totalAssessments >= 2) {
      const firstThree = analyses.rows.slice(0, Math.min(3, totalAssessments));
      const lastThree = analyses.rows.slice(-Math.min(3, totalAssessments));
      const firstAvg = firstThree.reduce((sum, a) => sum + (a.overall_score || 0), 0) / firstThree.length;
      const lastAvg = lastThree.reduce((sum, a) => sum + (a.overall_score || 0), 0) / lastThree.length;
      improvementRate = Math.round(lastAvg - firstAvg);
    }

    // Aggregate skill trends across all assessments
    const skillTrends = {};
    analyses.rows.forEach(analysis => {
      const skillScores = analysis.skill_scores || {};
      Object.entries(skillScores).forEach(([skillId, data]) => {
        if (!skillTrends[skillId]) {
          skillTrends[skillId] = {
            skill_id: skillId,
            name_ar: data.name_ar || 'مهارة',
            name_en: data.name_en || 'Skill',
            scores: [],
            dates: [],
            current_level: data.level,
            trend: 'stable'
          };
        }
        skillTrends[skillId].scores.push(data.score || 0);
        skillTrends[skillId].dates.push(analysis.analyzed_at);
      });
    });

    // Calculate trend direction for each skill
    Object.values(skillTrends).forEach(skill => {
      if (skill.scores.length >= 2) {
        const recent = skill.scores.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, skill.scores.length);
        const older = skill.scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, skill.scores.length);
        const diff = recent - older;
        skill.trend = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
        skill.average_score = Math.round(skill.scores.reduce((a, b) => a + b, 0) / skill.scores.length);
        skill.latest_score = skill.scores[skill.scores.length - 1];
        skill.change = Math.round(diff);
      } else {
        skill.average_score = skill.scores[0] || 0;
        skill.latest_score = skill.scores[0] || 0;
        skill.change = 0;
      }
    });

    // Domain performance aggregation
    const domainPerformance = {};
    analyses.rows.forEach(analysis => {
      const domainId = analysis.domain_id;
      if (domainId) {
        if (!domainPerformance[domainId]) {
          domainPerformance[domainId] = {
            domain_id: domainId,
            name_ar: analysis.domain_name_ar,
            name_en: analysis.domain_name_en,
            color: analysis.domain_color,
            scores: [],
            assessments_count: 0
          };
        }
        domainPerformance[domainId].scores.push(analysis.overall_score || 0);
        domainPerformance[domainId].assessments_count++;
      }
    });

    Object.values(domainPerformance).forEach(domain => {
      domain.average_score = Math.round(
        domain.scores.reduce((a, b) => a + b, 0) / domain.scores.length
      );
      domain.latest_score = domain.scores[domain.scores.length - 1];
      if (domain.scores.length >= 2) {
        const change = domain.scores[domain.scores.length - 1] - domain.scores[0];
        domain.trend = change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable';
      } else {
        domain.trend = 'stable';
      }
    });

    // Aggregate strengths (skills consistently high)
    const strengthsMap = {};
    analyses.rows.forEach(analysis => {
      (analysis.strengths || []).forEach(strength => {
        if (!strengthsMap[strength.skill_id]) {
          strengthsMap[strength.skill_id] = {
            skill_id: strength.skill_id,
            skill_name_ar: strength.skill_name_ar,
            skill_name_en: strength.skill_name_en,
            count: 0,
            avg_score: 0,
            scores: []
          };
        }
        strengthsMap[strength.skill_id].count++;
        strengthsMap[strength.skill_id].scores.push(strength.score || 0);
      });
    });

    const strengthsOverview = Object.values(strengthsMap).map(s => ({
      ...s,
      avg_score: Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length),
      consistency: Math.round((s.count / totalAssessments) * 100)
    })).sort((a, b) => b.consistency - a.consistency);

    // Aggregate priority gaps (skills consistently low or declining)
    const gapsMap = {};
    analyses.rows.forEach(analysis => {
      (analysis.gaps || []).forEach(gap => {
        if (!gapsMap[gap.skill_id]) {
          gapsMap[gap.skill_id] = {
            skill_id: gap.skill_id,
            skill_name_ar: gap.skill_name_ar,
            skill_name_en: gap.skill_name_en,
            count: 0,
            avg_gap: 0,
            gaps: [],
            priority_sum: 0
          };
        }
        gapsMap[gap.skill_id].count++;
        gapsMap[gap.skill_id].gaps.push(gap.gap_score || 0);
        gapsMap[gap.skill_id].priority_sum += gap.priority || 1;
      });
    });

    const priorityGaps = Object.values(gapsMap).map(g => ({
      ...g,
      avg_gap: Math.round(g.gaps.reduce((a, b) => a + b, 0) / g.gaps.length),
      persistence: Math.round((g.count / totalAssessments) * 100),
      priority: g.priority_sum / g.count
    })).sort((a, b) => b.persistence - a.persistence || b.avg_gap - a.avg_gap).slice(0, 10);

    // Calculate learning velocity (improvement over time)
    let learningVelocity = 0;
    if (totalAssessments >= 2) {
      const timeSpan = new Date(analyses.rows[analyses.rows.length - 1].analyzed_at) - 
                       new Date(analyses.rows[0].analyzed_at);
      const months = timeSpan / (1000 * 60 * 60 * 24 * 30);
      learningVelocity = months > 0 ? Math.round((improvementRate / months) * 10) / 10 : 0;
    }

    // Get peer comparison (same department, anonymized)
    let peerComparison = null;
    const user = await db.query('SELECT department_id FROM users WHERE id = $1', [userId]);
    if (user.rows.length > 0 && user.rows[0].department_id) {
      const peerStats = await db.query(`
        SELECT 
          AVG(ar.overall_score) as avg_score,
          COUNT(DISTINCT ar.user_id) as peer_count
        FROM analysis_results ar
        JOIN users u ON ar.user_id = u.id
        WHERE u.department_id = $1 AND ar.user_id != $2
      `, [user.rows[0].department_id, userId]);
      
      if (peerStats.rows[0].peer_count > 0) {
        peerComparison = {
          department_average: Math.round(peerStats.rows[0].avg_score || 0),
          peer_count: parseInt(peerStats.rows[0].peer_count),
          percentile: overallAverage > peerStats.rows[0].avg_score ? 
            Math.min(95, Math.round(60 + (overallAverage - peerStats.rows[0].avg_score))) : 
            Math.max(5, Math.round(50 - (peerStats.rows[0].avg_score - overallAverage)))
        };
      }
    }

    res.json({
      total_assessments: totalAssessments,
      overall_average: overallAverage,
      improvement_rate: improvementRate,
      learning_velocity: learningVelocity,
      skill_trends: Object.values(skillTrends).sort((a, b) => b.latest_score - a.latest_score),
      domain_performance: Object.values(domainPerformance).sort((a, b) => b.average_score - a.average_score),
      strengths_overview: strengthsOverview,
      priority_gaps: priorityGaps,
      peer_comparison: peerComparison,
      timeline: analyses.rows.map(a => ({
        date: a.analyzed_at,
        test_title_ar: a.test_title_ar,
        domain_name_ar: a.domain_name_ar,
        score: a.overall_score,
        domain_color: a.domain_color
      }))
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Get skill progression for a specific skill
router.get('/skill-progression/:userId/:skillId', authenticate, async (req, res) => {
  try {
    // Check authorization
    if (req.user.role === 'employee' && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { userId, skillId } = req.params;

    // Get skill profile
    const skillProfile = await db.query(`
      SELECT esp.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             s.description_ar,
             s.description_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en
      FROM employee_skill_profiles esp
      JOIN skills s ON esp.skill_id = s.id
      LEFT JOIN training_domains td ON s.domain_id = td.id
      WHERE esp.user_id = $1 AND esp.skill_id = $2
    `, [userId, skillId]);

    // Get historical assessments for this skill
    const history = await db.query(`
      SELECT ar.id, ar.analyzed_at, ar.overall_score, ar.skill_scores,
             t.title_ar as test_title_ar,
             td.name_ar as domain_name_ar
      FROM analysis_results ar
      JOIN tests t ON ar.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ar.user_id = $1
      ORDER BY ar.analyzed_at ASC
    `, [userId]);

    const progression = [];
    history.rows.forEach(analysis => {
      const skillScores = analysis.skill_scores || {};
      if (skillScores[skillId]) {
        progression.push({
          date: analysis.analyzed_at,
          score: skillScores[skillId].score,
          level: skillScores[skillId].level,
          test_title_ar: analysis.test_title_ar,
          domain_name_ar: analysis.domain_name_ar
        });
      }
    });

    // Get recommendations for this skill
    const recommendations = await db.query(`
      SELECT tr.*
      FROM training_recommendations tr
      WHERE tr.user_id = $1 AND tr.skill_id = $2 AND tr.status != 'skipped'
      ORDER BY tr.priority, tr.created_at DESC
      LIMIT 5
    `, [userId, skillId]);

    res.json({
      profile: skillProfile.rows[0] || null,
      progression,
      recommendations: recommendations.rows
    });
  } catch (error) {
    console.error('Get skill progression error:', error);
    res.status(500).json({ error: 'Failed to get skill progression' });
  }
});

// Get competency matrix (skills vs proficiency levels)
router.get('/competency-matrix/:userId', authenticate, async (req, res) => {
  try {
    // Check authorization
    if (req.user.role === 'employee' && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const userId = req.params.userId;

    // Get user's department to filter domains
    const userResult = await db.query(
      'SELECT department_id, role FROM users WHERE id = $1',
      [userId]
    );
    
    const userDepartmentId = userResult.rows[0]?.department_id;
    const userRole = userResult.rows[0]?.role;
    
    console.log(`[CompetencyMatrix] User ${userId}, role: ${userRole}, department: ${userDepartmentId}`);

    // STEP 1: Get ALL skills that have been assessed for this user (from test_skills of completed tests)
    // This ensures we show skills even if domain_departments isn't set up
    const assessedSkillsQuery = await db.query(`
      SELECT DISTINCT
        s.id as skill_id,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        s.weight as skill_weight,
        s.domain_id,
        td.id as domain_id,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color
      FROM test_skills ts
      JOIN skills s ON ts.skill_id = s.id
      JOIN training_domains td ON s.domain_id = td.id
      WHERE ts.test_id IN (
        SELECT DISTINCT ta.test_id 
        FROM test_assignments ta 
        WHERE ta.user_id = $1 AND ta.status = 'completed'
      )
      AND td.is_active = true
      ORDER BY td.name_ar, s.name_ar
    `, [userId]);
    
    console.log(`[CompetencyMatrix] Found ${assessedSkillsQuery.rows.length} skills from completed tests`);

    // STEP 2: Get skills from department-linked domains (if employee has a department)
    let departmentSkillsQuery = { rows: [] };
    if (userDepartmentId) {
      departmentSkillsQuery = await db.query(`
        SELECT 
          s.id as skill_id,
          s.name_ar as skill_name_ar,
          s.name_en as skill_name_en,
          s.weight as skill_weight,
          s.domain_id,
          td.id as domain_id,
          td.name_ar as domain_name_ar,
          td.name_en as domain_name_en,
          td.color as domain_color
        FROM training_domains td
        INNER JOIN domain_departments dd ON dd.domain_id = td.id
        LEFT JOIN skills s ON s.domain_id = td.id
        WHERE td.is_active = true AND dd.department_id = $1
        ORDER BY td.name_ar, s.name_ar
      `, [userDepartmentId]);
      
      console.log(`[CompetencyMatrix] Found ${departmentSkillsQuery.rows.length} skills from department-linked domains`);
    }

    // STEP 3: Merge both sources - prioritize assessed skills but include all from department
    const allSkillsMap = new Map();
    const allDomainsMap = new Map();
    
    // Add assessed skills first (these have priority)
    assessedSkillsQuery.rows.forEach(row => {
      if (row.skill_id && !allSkillsMap.has(row.skill_id)) {
        allSkillsMap.set(row.skill_id, row);
      }
      if (row.domain_id && !allDomainsMap.has(row.domain_id)) {
        allDomainsMap.set(row.domain_id, {
          domain_id: row.domain_id,
          domain_name_ar: row.domain_name_ar,
          domain_name_en: row.domain_name_en,
          domain_color: row.domain_color || '#502390'
        });
      }
    });
    
    // Add department skills that aren't already in the map
    departmentSkillsQuery.rows.forEach(row => {
      if (row.skill_id && !allSkillsMap.has(row.skill_id)) {
        allSkillsMap.set(row.skill_id, row);
      }
      if (row.domain_id && !allDomainsMap.has(row.domain_id)) {
        allDomainsMap.set(row.domain_id, {
          domain_id: row.domain_id,
          domain_name_ar: row.domain_name_ar,
          domain_name_en: row.domain_name_en,
          domain_color: row.domain_color || '#502390'
        });
      }
    });
    
    console.log(`[CompetencyMatrix] Total unique skills: ${allSkillsMap.size}, domains: ${allDomainsMap.size}`);

    // STEP 4: Get user's analysis results and RECALCULATE actual scores from responses
    // This ensures consistency with the test results display
    const analyses = await db.query(`
      SELECT 
        ar.id,
        ar.assignment_id,
        ar.test_id,
        ar.analyzed_at,
        ar.overall_score,
        t.title_ar as test_title
      FROM analysis_results ar
      JOIN tests t ON ar.test_id = t.id
      WHERE ar.user_id = $1
      ORDER BY ar.analyzed_at DESC
    `, [userId]);

    // Calculate ACTUAL scores from responses (same logic as test results display)
    const skillScoresMap = {};
    
    console.log(`[CompetencyMatrix] User ${userId}: Found ${analyses.rows.length} test results`);
    
    for (let idx = 0; idx < analyses.rows.length; idx++) {
      const analysis = analyses.rows[idx];
      
      // Get the test's target skills
      const testSkillsResult = await db.query(`
        SELECT s.id as skill_id
        FROM test_skills ts
        JOIN skills s ON ts.skill_id = s.id
        WHERE ts.test_id = $1
      `, [analysis.test_id]);
      
      if (testSkillsResult.rows.length === 0) {
        console.log(`[CompetencyMatrix] Test ${idx + 1} (${analysis.test_title}): No skills linked`);
        continue;
      }
      
      // Recalculate the ACTUAL grade from responses
      const responsesData = await db.query(`
        SELECT r.score, q.question_type, q.options, q.weight
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.assignment_id = $1
      `, [analysis.assignment_id]);
      
      let totalScore = 0;
      let totalMaxScore = 0;
      
      for (const response of responsesData.rows) {
        let maxScore = 10;
        
        if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
          const optionScores = response.options.map(o => parseFloat(o.score) || 0);
          maxScore = Math.max(...optionScores, 10);
        } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
          maxScore = 10;
        } else if (response.question_type === 'open_text') {
          maxScore = 10;
        }
        
        const weight = parseFloat(response.weight) || 1;
        const score = parseFloat(response.score) || 0;
        
        totalScore += score * weight;
        totalMaxScore += maxScore * weight;
      }
      
      const actualGrade = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
      
      // Determine level from actual grade
      // Aligned with PROFICIENCY_LEVELS: Advanced >= 70%, Intermediate 40-69%, Beginner 0-39%
      let level = 'low';
      if (actualGrade >= 70) level = 'high';
      else if (actualGrade >= 40) level = 'medium';
      
      console.log(`[CompetencyMatrix] Test ${idx + 1} (${analysis.test_title}): stored=${analysis.overall_score}%, recalculated=${actualGrade}%`);
      
      // Apply this recalculated grade to all skills in this test
      for (const skillRow of testSkillsResult.rows) {
        const skillId = skillRow.skill_id;
        if (!skillScoresMap[skillId]) {
          skillScoresMap[skillId] = {
            scores: [],
            totalScore: 0,
            count: 0,
            latestLevel: null
          };
        }
        
        skillScoresMap[skillId].scores.push(actualGrade);
        skillScoresMap[skillId].totalScore += actualGrade;
        skillScoresMap[skillId].count += 1;
        
        // Keep the latest level
        if (idx === 0) {
          skillScoresMap[skillId].latestLevel = level;
        }
      }
    }
    
    console.log(`[CompetencyMatrix] Processed ${Object.keys(skillScoresMap).length} unique skills with recalculated scores`);

    // Calculate average for each skill
    Object.keys(skillScoresMap).forEach(skillId => {
      const data = skillScoresMap[skillId];
      skillScoresMap[skillId].averageScore = Math.round(data.totalScore / data.count);
    });

    // STEP 5: Get employee skill profiles for level/trend data
    const profiles = await db.query(`
      SELECT 
        esp.skill_id,
        esp.current_level,
        esp.target_level,
        esp.improvement_trend,
        esp.last_assessment_score
      FROM employee_skill_profiles esp
      WHERE esp.user_id = $1
    `, [userId]);

    // Create a map of skill profiles
    const profilesMap = {};
    profiles.rows.forEach(profile => {
      profilesMap[profile.skill_id] = profile;
    });
    
    console.log(`[CompetencyMatrix] Found ${profiles.rows.length} skill profiles`);

    // STEP 6: Build domains with skills
    const domains = {};
    
    // Initialize domains
    allDomainsMap.forEach((domain, domainId) => {
      domains[domainId] = {
        ...domain,
        skills: []
      };
    });
    
    // Add skills to domains
    allSkillsMap.forEach((row, skillId) => {
      const domainId = row.domain_id;
      if (!domains[domainId]) {
        // Domain not in map yet - add it
        domains[domainId] = {
          domain_id: domainId,
          domain_name_ar: row.domain_name_ar,
          domain_name_en: row.domain_name_en,
          domain_color: row.domain_color || '#502390',
          skills: []
        };
      }
      
      const profile = profilesMap[skillId] || {};
      const scoreData = skillScoresMap[skillId];
      
      // Determine the score to display
      let displayScore = null;
      let displayLevel = null;
      
      if (scoreData) {
        displayScore = scoreData.averageScore;
        displayLevel = scoreData.latestLevel;
      } else if (profile.last_assessment_score !== null && profile.last_assessment_score !== undefined) {
        // Fallback to profile score if no analysis score
        displayScore = Math.round(profile.last_assessment_score);
        displayLevel = profile.current_level;
      }
      
      domains[domainId].skills.push({
        skill_id: skillId,
        name_ar: row.skill_name_ar,
        name_en: row.skill_name_en,
        current_level: profile.current_level || displayLevel || null,
        target_level: profile.target_level || null,
        score: displayScore,
        trend: profile.improvement_trend || null,
        weight: row.skill_weight || 1.0,
        gap: profile.target_level && profile.current_level ? 
          ['low', 'medium', 'high'].indexOf(profile.target_level) - 
          ['low', 'medium', 'high'].indexOf(profile.current_level) : 0
      });
    });

    // STEP 7: Calculate domain-level metrics
    let totalSkillsAssessed = 0;
    Object.values(domains).forEach(domain => {
      const skills = domain.skills;
      const assessedSkills = skills.filter(s => s.score !== null);
      
      // Calculate proficiency (average score) from assessed skills only
      if (assessedSkills.length > 0) {
        domain.proficiency = Math.round(
          assessedSkills.reduce((sum, s) => sum + s.score, 0) / assessedSkills.length
        );
      } else {
        domain.proficiency = 0;
      }
      
      domain.skills_at_target = skills.filter(s => 
        s.current_level === s.target_level || 
        (s.current_level === 'high' && !s.target_level)
      ).length;
      
      domain.total_skills = skills.length;
      domain.assessed_skills = assessedSkills.length;
      
      // Readiness = Average score of assessed skills in the domain (same as proficiency)
      domain.readiness = domain.proficiency;
      
      totalSkillsAssessed += assessedSkills.length;
    });

    // Filter out empty domains (no skills)
    const domainsList = Object.values(domains).filter(d => d.skills.length > 0);
    const totalSkills = domainsList.reduce((sum, d) => sum + d.total_skills, 0);
    const totalDomains = domainsList.length;

    console.log(`[CompetencyMatrix] Final: ${totalDomains} domains, ${totalSkills} total skills, ${totalSkillsAssessed} assessed`);

    res.json({
      domains: domainsList,
      summary: {
        total_domains: totalDomains,
        total_skills: totalSkills,
        skills_assessed: totalSkillsAssessed,
        skills_not_assessed: totalSkills - totalSkillsAssessed,
        skills_at_target: domainsList.reduce((sum, d) => sum + d.skills_at_target, 0),
        overall_readiness: totalDomains > 0 ? Math.round(
          domainsList.reduce((sum, d) => sum + d.readiness, 0) / totalDomains
        ) : 0
      }
    });
  } catch (error) {
    console.error('Get competency matrix error:', error);
    res.status(500).json({ error: 'Failed to get competency matrix' });
  }
});

// Debug endpoint to check competency matrix data
router.get('/debug-competency/:userId', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Check authorization
    if (req.user.role === 'employee' && userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const debug = {};
    
    // Get analyses
    const analyses = await db.query(`
      SELECT 
        ar.id,
        ar.assignment_id,
        ar.overall_score,
        ar.skill_scores,
        t.title_ar
      FROM analysis_results ar
      JOIN tests t ON ar.test_id = t.id
      WHERE ar.user_id = $1
      ORDER BY ar.analyzed_at DESC
      LIMIT 5
    `, [userId]);
    
    debug.analyses_count = analyses.rows.length;
    debug.analyses = analyses.rows.map(a => ({
      id: a.id,
      title: a.title_ar,
      overall_score: a.overall_score,
      skill_count: a.skill_scores ? Object.keys(a.skill_scores).length : 0,
      skill_scores: a.skill_scores
    }));
    
    // Get latest assignment
    if (analyses.rows.length > 0) {
      const latestAnalysis = analyses.rows[0];
      
      const questions = await db.query(`
        SELECT 
          q.id,
          q.question_ar,
          q.skill_id,
          s.name_ar as skill_name,
          r.score
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        LEFT JOIN skills s ON q.skill_id = s.id
        WHERE r.assignment_id = $1
      `, [latestAnalysis.assignment_id]);
      
      debug.latest_test = {
        title: latestAnalysis.title_ar,
        questions_count: questions.rows.length,
        questions_with_skill_id: questions.rows.filter(q => q.skill_id).length,
        questions_without_skill_id: questions.rows.filter(q => !q.skill_id).length,
        questions: questions.rows.map(q => ({
          id: q.id,
          question: q.question_ar.substring(0, 100),
          has_skill_id: !!q.skill_id,
          skill_name: q.skill_name,
          score: q.score
        }))
      };
    }
    
    res.json(debug);
  } catch (error) {
    console.error('Debug competency error:', error);
    res.status(500).json({ error: 'Failed to debug' });
  }
});

module.exports = router;
module.exports.analyzeAssignment = analyzeAssignment;

