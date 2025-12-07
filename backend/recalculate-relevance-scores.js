require('dotenv').config();
const db = require('./src/db');

/**
 * Calculate intelligent relevance score for course-skill relationship
 * Based on how prominently the skill appears in course metadata
 * @param {Object} courseData - Course data with name_ar, name_en, description_ar, description_en, skill_tags
 * @param {Object} skillData - Skill data with name_ar, name_en
 * @returns {number} Relevance score between 0.5 and 1.5
 */
function calculateRelevanceScore(courseData, skillData) {
  let score = 0.5; // Base score
  
  const courseName = `${courseData.name_ar || ''} ${courseData.name_en || ''}`.toLowerCase();
  const courseDesc = `${courseData.description_ar || ''} ${courseData.description_en || ''}`.toLowerCase();
  const skillNameAr = (skillData.name_ar || '').toLowerCase();
  const skillNameEn = (skillData.name_en || '').toLowerCase();
  
  // Check title match (highest relevance)
  if (courseName.includes(skillNameAr) || courseName.includes(skillNameEn)) {
    score += 0.5; // Title match = +0.5 (total: 1.0)
  }
  
  // Check description match (medium relevance)
  if (courseDesc.includes(skillNameAr) || courseDesc.includes(skillNameEn)) {
    score += 0.2; // Description match = +0.2
  }
  
  // Check skill_tags array match (if available)
  if (courseData.skill_tags && Array.isArray(courseData.skill_tags)) {
    const hasTagMatch = courseData.skill_tags.some(tag => 
      tag.toLowerCase().includes(skillNameAr) || 
      tag.toLowerCase().includes(skillNameEn)
    );
    if (hasTagMatch) {
      score += 0.3; // Tag match = +0.3
    }
  }
  
  // Cap at 1.5 maximum
  return Math.min(score, 1.5);
}

async function recalculateAllRelevanceScores() {
  console.log('🔄 Starting relevance score recalculation for all existing course-skill relationships...\n');
  
  try {
    // Get all course-skill relationships with full course and skill data
    const result = await db.query(`
      SELECT 
        cs.course_id, 
        cs.skill_id, 
        cs.relevance_score as old_score,
        c.name_ar as course_name_ar, 
        c.name_en as course_name_en,
        c.description_ar as course_description_ar,
        c.description_en as course_description_en,
        c.skill_tags as course_skill_tags,
        s.name_ar as skill_name_ar, 
        s.name_en as skill_name_en
      FROM course_skills cs
      JOIN courses c ON cs.course_id = c.id
      JOIN skills s ON cs.skill_id = s.id
      ORDER BY c.name_ar
    `);
    
    if (result.rows.length === 0) {
      console.log('⚠️  No course-skill relationships found. Nothing to update.');
      process.exit(0);
    }
    
    console.log(`📊 Found ${result.rows.length} course-skill relationships to recalculate.\n`);
    
    let updated = 0;
    let unchanged = 0;
    const changes = [];
    
    for (const row of result.rows) {
      const course = { 
        name_ar: row.course_name_ar, 
        name_en: row.course_name_en,
        description_ar: row.course_description_ar,
        description_en: row.course_description_en,
        skill_tags: row.course_skill_tags
      };
      const skill = {
        name_ar: row.skill_name_ar,
        name_en: row.skill_name_en
      };
      
      const oldScore = parseFloat(row.old_score) || 1.0;
      const newScore = calculateRelevanceScore(course, skill);
      
      // Update in database
      await db.query(
        'UPDATE course_skills SET relevance_score = $1 WHERE course_id = $2 AND skill_id = $3',
        [newScore, row.course_id, row.skill_id]
      );
      
      if (Math.abs(newScore - oldScore) > 0.01) {
        updated++;
        changes.push({
          course: row.course_name_ar || row.course_name_en,
          skill: row.skill_name_ar || row.skill_name_en,
          old: oldScore.toFixed(2),
          new: newScore.toFixed(2)
        });
      } else {
        unchanged++;
      }
      
      // Progress indicator
      if ((updated + unchanged) % 25 === 0) {
        console.log(`   Processed ${updated + unchanged}/${result.rows.length} relationships...`);
      }
    }
    
    console.log(`\n✅ Recalculation complete!`);
    console.log(`   📈 Updated: ${updated} relationships`);
    console.log(`   ⏸️  Unchanged: ${unchanged} relationships`);
    console.log(`   📊 Total: ${result.rows.length} relationships\n`);
    
    if (changes.length > 0) {
      console.log('📋 Sample of significant changes (first 10):');
      changes.slice(0, 10).forEach(change => {
        console.log(`   • ${change.course} ← ${change.skill}: ${change.old} → ${change.new}`);
      });
      
      if (changes.length > 10) {
        console.log(`   ... and ${changes.length - 10} more changes`);
      }
    }
    
    console.log('\n🎯 Next steps:');
    console.log('   1. Review the changes above');
    console.log('   2. Run: node backend/src/db/migrations/add_domain_synonyms.sql (if not done)');
    console.log('   3. Consider re-syncing courses to Neo4j with new scores');
    console.log('      POST /api/courses/sync-all\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error recalculating relevance scores:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the migration
recalculateAllRelevanceScores();

