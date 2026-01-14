require('dotenv').config();
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function testCSVUpload() {
  console.log('🧪 Testing CSV Upload...\n');

  try {
    // First, login to get a token (assuming you have an admin account)
    console.log('🔐 Logging in as admin...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@example.com',  // Replace with your admin email
      password: 'admin123'          // Replace with your admin password
    });

    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // Read the CSV file
    const csvPath = './sample-courses.csv';
    if (!fs.existsSync(csvPath)) {
      console.error('❌ CSV file not found:', csvPath);
      process.exit(1);
    }

    console.log('📄 Reading CSV file...');
    const fileStream = fs.createReadStream(csvPath);
    const stats = fs.statSync(csvPath);
    console.log(`   Size: ${stats.size} bytes\n`);

    // Create form data
    const form = new FormData();
    form.append('file', fileStream);

    console.log('📤 Uploading CSV...\n');
    
    const uploadResponse = await axios.post(
      'http://localhost:3001/api/courses/upload-csv',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${token}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    console.log('📊 Upload Results:');
    console.log(`   ✅ Success: ${uploadResponse.data.success}`);
    console.log(`   ❌ Failed: ${uploadResponse.data.failed}`);
    console.log(`   📁 Total: ${uploadResponse.data.total}`);
    console.log(`   ⏱️  Time: ${uploadResponse.data.totalTime}s\n`);

    if (uploadResponse.data.errors && uploadResponse.data.errors.length > 0) {
      console.log('❌ Errors:');
      uploadResponse.data.errors.forEach(err => {
        console.log(`   - ${err.record}: ${err.error}`);
      });
    }

    // Verify courses were inserted
    const db = require('./src/db');
    const countResult = await db.query('SELECT COUNT(*) FROM courses');
    console.log(`\n📊 Courses in database: ${countResult.rows[0].count}`);

    const coursesResult = await db.query('SELECT id, name_ar, provider FROM courses LIMIT 5');
    if (coursesResult.rows.length > 0) {
      console.log('\n📚 Sample courses:');
      coursesResult.rows.forEach(course => {
        console.log(`   - ${course.name_ar} (${course.provider || 'N/A'})`);
      });
    }

    console.log('\n✅ Test completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testCSVUpload();

