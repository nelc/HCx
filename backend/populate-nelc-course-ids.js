/**
 * Script to populate nelc_course_id for courses by matching with NELC/FutureX database
 * 
 * This script:
 * 1. Queries all courses from our local database
 * 2. Searches for matching courses in NELC Neo4j by name
 * 3. Updates the nelc_course_id field for matched courses
 * 
 * Run: node populate-nelc-course-ids.js
 */

require('dotenv').config();
const db = require('./src/db');
const neo4jApi = require('./src/services/neo4jApi');

const FUTUREX_BASE_URL = 'https://futurex.nelc.gov.sa/ar/course';

async function findNelcCourseByName(courseName) {
  try {
    // Search for course in NELC Neo4j by name
    // Use substring matching since names may differ slightly
    const searchTerm = courseName.replace(/'/g, "\\'").substring(0, 40).trim();
    
    // Skip very short names
    if (searchTerm.length < 5) return null;
    
    const query = `
      MATCH (c:Course)
      WHERE c.course_URL IS NOT NULL 
        AND c.course_URL CONTAINS 'futurex.nelc.gov.sa'
        AND (
          toLower(c.course_name) CONTAINS toLower('${searchTerm}')
        )
      RETURN c.course_id as course_id, c.course_name as course_name, c.course_URL as course_url
      LIMIT 1
    `;
    
    const result = await neo4jApi.makeRequest('POST', '/query', { data: { query } });
    
    if (result && (Array.isArray(result) ? result.length > 0 : result.course_id)) {
      const match = Array.isArray(result) ? result[0] : result;
      // Verify it's a numeric ID (FutureX format)
      if (match.course_id && /^\d+$/.test(String(match.course_id))) {
        return match;
      }
    }
    return null;
  } catch (error) {
    // Silently skip errors for individual searches
    return null;
  }
}

async function extractCourseIdFromUrl(url) {
  // Extract course ID from FutureX URL pattern: /course/{id}
  const match = url?.match(/futurex\.nelc\.gov\.sa\/ar\/course\/(\d+)/);
  return match ? match[1] : null;
}

async function populateNelcCourseIds() {
  console.log('🔄 Starting NELC Course ID population...\n');
  
  try {
    // Get all courses without nelc_course_id
    const coursesResult = await db.query(`
      SELECT id, name_ar, name_en, url
      FROM courses
      WHERE nelc_course_id IS NULL
      ORDER BY name_ar
    `);
    
    const courses = coursesResult.rows;
    console.log(`📊 Found ${courses.length} courses without NELC Course ID\n`);
    
    let updated = 0;
    let notFound = 0;
    let errors = 0;
    const matchedCourses = [];
    
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      
      // Progress indicator
      if ((i + 1) % 50 === 0 || i === courses.length - 1) {
        console.log(`  Progress: ${i + 1}/${courses.length} (Found: ${updated})`);
      }
      
      try {
        // First, check if URL already has a FutureX pattern
        let nelcCourseId = await extractCourseIdFromUrl(course.url);
        
        if (!nelcCourseId) {
          // Try English name first (usually more standard)
          if (course.name_en) {
            const match = await findNelcCourseByName(course.name_en);
            if (match && match.course_id) {
              nelcCourseId = match.course_id.toString();
            }
          }
          
          // Try Arabic name if English didn't match
          if (!nelcCourseId && course.name_ar) {
            const match = await findNelcCourseByName(course.name_ar);
            if (match && match.course_id) {
              nelcCourseId = match.course_id.toString();
            }
          }
        }
        
        if (nelcCourseId && /^\d+$/.test(nelcCourseId)) {
          // Update the course with the NELC course ID
          await db.query(`
            UPDATE courses
            SET nelc_course_id = $1,
                updated_at = NOW()
            WHERE id = $2
          `, [nelcCourseId, course.id]);
          
          updated++;
          matchedCourses.push({
            name: course.name_en || course.name_ar,
            nelc_id: nelcCourseId
          });
        } else {
          notFound++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
        
      } catch (error) {
        errors++;
      }
    }
    
    console.log('\n✅ Population complete!');
    console.log(`   Updated: ${updated} courses`);
    console.log(`   Not found: ${notFound} courses`);
    console.log(`   Errors: ${errors} courses`);
    
    // Show sample of matched courses
    if (matchedCourses.length > 0) {
      console.log('\n📋 Sample matched courses:');
      matchedCourses.slice(0, 10).forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name}`);
        console.log(`      FutureX URL: ${FUTUREX_BASE_URL}/${c.nelc_id}`);
      });
    }
    
    // Verify final state
    const finalResult = await db.query(`
      SELECT 
        COUNT(*) as total_courses,
        COUNT(nelc_course_id) as with_nelc_id
      FROM courses
    `);
    console.log('\n📊 Final database state:');
    console.log(`   Total courses: ${finalResult.rows[0].total_courses}`);
    console.log(`   With NELC ID: ${finalResult.rows[0].with_nelc_id}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

populateNelcCourseIds();
