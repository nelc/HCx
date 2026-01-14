require('dotenv').config();
const db = require('./src/db');

async function checkCourses() {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM courses');
    const count = result.rows[0].count;
    
    console.log(`\n📊 Total courses in database: ${count}\n`);
    
    if (count > 0) {
      // Show some samples
      const samples = await db.query(`
        SELECT name_ar, name_en, provider, difficulty_level 
        FROM courses 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      console.log('📚 Latest courses:');
      samples.rows.forEach((course, i) => {
        console.log(`   ${i+1}. ${course.name_ar || course.name_en}`);
        console.log(`      Provider: ${course.provider || 'N/A'}`);
        console.log(`      Level: ${course.difficulty_level}`);
      });
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkCourses();

