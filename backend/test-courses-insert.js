require('dotenv').config();
const db = require('./src/db');

async function testCoursesTable() {
  console.log('🔍 Testing courses table...\n');

  try {
    // Check if table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'courses'
      );
    `);
    
    console.log('✅ Courses table exists:', tableCheck.rows[0].exists);

    // Check table structure
    const columns = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'courses'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 Table structure:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? '* Required' : ''}`);
    });

    // Count existing courses
    const count = await db.query('SELECT COUNT(*) FROM courses');
    console.log(`\n📊 Current courses count: ${count.rows[0].count}`);

    // Try inserting a test course
    console.log('\n🧪 Testing insert...');
    const testResult = await db.query(`
      INSERT INTO courses (
        name_ar, name_en, description_ar, description_en, 
        url, provider, duration_hours, difficulty_level,
        language, subject, subtitle, university
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, name_ar, created_at
    `, [
      'دورة تجريبية',
      'Test Course',
      'هذه دورة تجريبية',
      'This is a test course',
      'https://example.com/test',
      'Test Provider',
      10,
      'beginner',
      'ar',
      'Testing',
      'Test Subtitle',
      'Test University'
    ]);

    console.log('✅ Test insert successful!');
    console.log('   ID:', testResult.rows[0].id);
    console.log('   Name:', testResult.rows[0].name_ar);
    console.log('   Created:', testResult.rows[0].created_at);

    // Delete test course
    await db.query('DELETE FROM courses WHERE id = $1', [testResult.rows[0].id]);
    console.log('🗑️  Test course deleted\n');

    // Show all courses if any
    const allCourses = await db.query('SELECT id, name_ar, provider, created_at FROM courses ORDER BY created_at DESC LIMIT 5');
    if (allCourses.rows.length > 0) {
      console.log('📚 Latest courses:');
      allCourses.rows.forEach(course => {
        console.log(`   - ${course.name_ar} (${course.provider}) - ${course.created_at}`);
      });
    } else {
      console.log('📚 No courses in database');
    }

    console.log('\n✅ All tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testCoursesTable();

