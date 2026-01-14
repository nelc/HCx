require('dotenv').config();
const neo4jApi = require('./src/services/neo4jApi');

async function testSearch() {
  try {
    console.log('🔍 Testing searchCourses with name filter...\n');
    
    // This should only return courses with names due to the filter
    const result = await neo4jApi.searchCourses({}, 0, 5);
    
    console.log(`✅ Total courses (with names): ${result.total}`);
    console.log(`✅ Courses returned: ${result.courses.length}\n`);
    
    if (result.courses.length > 0) {
      console.log('📚 Sample courses:');
      result.courses.forEach((course, i) => {
        console.log(`\n${i + 1}. ID: ${course.course_id}`);
        console.log(`   Name AR: ${course.name_ar || 'N/A'}`);
        console.log(`   Name EN: ${course.name_en || 'N/A'}`);
        console.log(`   Language: ${course.language || 'N/A'}`);
      });
    } else {
      console.log('❌ No courses returned - this is the problem!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  process.exit(0);
}

testSearch();
