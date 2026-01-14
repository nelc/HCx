const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const cvTextExtractor = require('../services/cvTextExtractor');
const cvParser = require('../services/cvParser');
const skillMapper = require('../services/skillMapper');
const learnerSkillsApi = require('../services/learnerSkillsApi');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept PDF, DOC, DOCX files
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream', // Some systems send DOC/DOCX as octet-stream
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Also check file extension as fallback
      const ext = file.originalname.split('.').pop().toLowerCase();
      if (['pdf', 'doc', 'docx'].includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'), false);
      }
    }
  },
});

/**
 * POST /api/cv-import/upload
 * Upload CV file and extract data using local parsing with OpenAI
 * Returns preview data (not saved to DB yet)
 */
// Multer error handler middleware
const multerErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.code, err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large', message: 'File size exceeds 5MB limit' });
    }
    return res.status(400).json({ error: 'File upload error', message: err.message });
  }
  if (err) {
    console.error('File upload error:', err.message);
    return res.status(400).json({ error: 'File upload error', message: err.message });
  }
  next();
};

router.post('/upload', authenticate, upload.single('cv'), multerErrorHandler, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please configure OPENAI_API_KEY in your .env file'
      });
    }

    // Step 1: Extract text from CV file
    let cvText;
    try {
      cvText = await cvTextExtractor.extractTextFromCV(fileBuffer, contentType);
      if (!cvText || cvText.trim().length === 0) {
        return res.status(400).json({ 
          error: 'Failed to extract text from CV',
          message: 'The CV file appears to be empty or could not be read'
        });
      }
    } catch (error) {
      console.error('Text extraction error:', error);
      return res.status(500).json({ 
        error: 'Failed to extract text from CV',
        message: error.message || 'Unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }

    // Step 2: Parse CV text using OpenAI
    let extractedData;
    try {
      extractedData = await cvParser.parseCV(cvText);
    } catch (error) {
      console.error('CV parsing error:', error);
      return res.status(500).json({ 
        error: 'Failed to parse CV',
        message: error.message || 'Unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }

    // Step 3: Call Learner Skills API to generate skills from structured CV data
    let apiGeneratedSkills = [];
    let apiSkillsResult = null;
    
    try {
      console.log('📤 Calling Learner Skills API with CV data...');
      
      // Transform CV data to API format
      const apiInput = learnerSkillsApi.transformCVDataForAPI(extractedData);
      
      // Call the API
      apiSkillsResult = await learnerSkillsApi.generateSkills(apiInput);
      
      if (apiSkillsResult.success) {
        // Flatten all skills from the API response
        apiGeneratedSkills = learnerSkillsApi.flattenApiSkills(apiSkillsResult);
        console.log(`✅ Learner Skills API returned ${apiGeneratedSkills.length} skills`);
      } else {
        console.warn('⚠️ Learner Skills API failed:', apiSkillsResult.error?.message);
        // Continue without API skills - graceful degradation
      }
    } catch (error) {
      console.error('❌ Learner Skills API error:', error.message);
      // Continue without API skills - graceful degradation
    }

    // Step 4: Combine skills from OpenAI and Learner Skills API
    const confirmedSkills = extractedData.skills || [];
    const possibleSkills = extractedData.possible_skills || [];
    
    // Merge API-generated skills with OpenAI skills, removing duplicates
    const allSkillsSet = new Set([
      ...confirmedSkills.map(s => s.toLowerCase().trim()),
      ...apiGeneratedSkills.map(s => s.toLowerCase().trim())
    ]);
    
    // Create combined confirmed skills (API skills are treated as confirmed)
    const combinedConfirmedSkills = [
      ...confirmedSkills,
      // Add API skills that aren't already in confirmed skills
      ...apiGeneratedSkills.filter(apiSkill => 
        !confirmedSkills.some(cs => cs.toLowerCase().trim() === apiSkill.toLowerCase().trim())
      )
    ];

    let mappedSkills = [];
    let groupedSkills = [];
    let mappedPossibleSkills = [];
    let groupedPossibleSkills = [];
    let mappedApiSkills = [];
    let groupedApiSkills = [];
    
    try {
      // Map confirmed skills (confidence = 1.0) - includes original + API skills
      mappedSkills = await skillMapper.mapSkills(combinedConfirmedSkills);
      groupedSkills = await skillMapper.groupSkillsByDomain(mappedSkills);
      
      // Map possible skills (confidence = 0.6)
      mappedPossibleSkills = await skillMapper.mapSkills(possibleSkills);
      groupedPossibleSkills = await skillMapper.groupSkillsByDomain(mappedPossibleSkills);
      
      // Map API-generated skills separately for display
      if (apiGeneratedSkills.length > 0) {
        mappedApiSkills = await skillMapper.mapSkills(apiGeneratedSkills);
        groupedApiSkills = await skillMapper.groupSkillsByDomain(mappedApiSkills);
      }
    } catch (error) {
      console.error('Skill mapping error:', error);
      // Continue with empty skills if mapping fails
      console.log('Continuing without skill mapping...');
    }

    // Return preview data (not saved yet)
    res.json({
      extractedData: {
        full_name: extractedData.full_name || '',
        email: extractedData.email || '',
        phone: extractedData.phone || '',
        summary: extractedData.summary || '',
        education: extractedData.education || [],
        experience: extractedData.experience || [],
        certificates: extractedData.certificates || [],
        skills: combinedConfirmedSkills,
        possible_skills: possibleSkills,
        api_generated_skills: apiGeneratedSkills,
        raw_text: cvText || '',
      },
      suggestedSkills: groupedSkills || [],
      matchedSkills: mappedSkills || [],
      suggestedPossibleSkills: groupedPossibleSkills || [],
      matchedPossibleSkills: mappedPossibleSkills || [],
      // New: API-generated skills (for display/transparency)
      apiGeneratedSkills: {
        raw: apiGeneratedSkills,
        mapped: mappedApiSkills,
        grouped: groupedApiSkills,
        tracking_id: apiSkillsResult?.tracking_id || null,
        success: apiSkillsResult?.success || false,
        categorized: apiSkillsResult?.skills || null
      },
      fileName,
      fileSize,
    });
  } catch (error) {
    console.error('CV upload error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process CV',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});


/**
 * POST /api/cv-import/confirm
 * Confirm and save CV import data to database
 */
router.post('/confirm', authenticate, async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const { 
      extractedData, 
      selectedSkills, 
      selectedPossibleSkills, // New: selected possible skills
      fileName, 
      fileSize 
    } = req.body;

    if (!extractedData) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Missing extracted data' });
    }

    // Update user phone if provided
    if (extractedData.phone) {
      await client.query(
        'UPDATE users SET phone = $1 WHERE id = $2',
        [extractedData.phone, userId]
      );
    }

    // Store CV raw text
    if (extractedData.raw_text) {
      await client.query(
        'UPDATE users SET cv_raw_text = $1, cv_imported = true, cv_imported_at = NOW() WHERE id = $2',
        [extractedData.raw_text, userId]
      );
    }

    // Delete existing CV-imported education, experience, and certificates
    await client.query('DELETE FROM user_education WHERE user_id = $1 AND source = $2', [userId, 'cv_import']);
    await client.query('DELETE FROM user_experience WHERE user_id = $1 AND source = $2', [userId, 'cv_import']);
    await client.query('DELETE FROM user_certificates WHERE user_id = $1 AND source = $2', [userId, 'cv_import']);

    // Insert education records
    if (extractedData.education && extractedData.education.length > 0) {
      for (const edu of extractedData.education) {
        await client.query(`
          INSERT INTO user_education (user_id, degree, institution, graduation_year, source)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          userId,
          edu.degree || null,
          edu.institution || null,
          edu.graduation_year || null,
          'cv_import'
        ]);
      }
    }

    // Insert experience records
    if (extractedData.experience && extractedData.experience.length > 0) {
      for (const exp of extractedData.experience) {
        await client.query(`
          INSERT INTO user_experience (user_id, title, company, start_date, end_date, description, source)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          userId,
          exp.title || null,
          exp.company || null,
          exp.start_date || null,
          exp.end_date || null,
          exp.description || null,
          'cv_import'
        ]);
      }
    }

    // Insert certificate records
    if (extractedData.certificates && extractedData.certificates.length > 0) {
      for (const cert of extractedData.certificates) {
        await client.query(`
          INSERT INTO user_certificates (user_id, name, issuer, date, source)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          userId,
          cert.name || null,
          cert.issuer || null,
          cert.date || null,
          'cv_import'
        ]);
      }
    }

    // Insert/update skill profiles for confirmed skills (confidence = 1.0)
    let importedSkillsCount = 0;
    if (selectedSkills && Array.isArray(selectedSkills) && selectedSkills.length > 0) {
      for (const skillId of selectedSkills) {
        // Check if skill profile already exists
        const existing = await client.query(
          'SELECT id FROM employee_skill_profiles WHERE user_id = $1 AND skill_id = $2',
          [userId, skillId]
        );

        if (existing.rows.length > 0) {
          // Update existing profile - upgrade to confirmed if it was possible
          await client.query(`
            UPDATE employee_skill_profiles
            SET source = 'cv_import',
                confidence_score = 1.0,
                verified = false,
                updated_at = NOW()
            WHERE user_id = $1 AND skill_id = $2
          `, [userId, skillId]);
        } else {
          // Create new profile with high confidence (confirmed skill)
          await client.query(`
            INSERT INTO employee_skill_profiles (user_id, skill_id, current_level, source, confidence_score, verified)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [userId, skillId, 'medium', 'cv_import', 1.0, false]);
        }
        importedSkillsCount++;
      }
    }

    // Insert/update skill profiles for possible skills (confidence = 0.6)
    if (selectedPossibleSkills && Array.isArray(selectedPossibleSkills) && selectedPossibleSkills.length > 0) {
      for (const skillId of selectedPossibleSkills) {
        // Check if skill profile already exists
        const existing = await client.query(
          'SELECT id, confidence_score FROM employee_skill_profiles WHERE user_id = $1 AND skill_id = $2',
          [userId, skillId]
        );

        if (existing.rows.length > 0) {
          // Only update if current confidence is lower than 1.0 (don't downgrade confirmed skills)
          if (existing.rows[0].confidence_score < 1.0) {
            await client.query(`
              UPDATE employee_skill_profiles
              SET source = 'cv_import',
                  confidence_score = GREATEST(confidence_score, 0.6),
                  verified = false,
                  updated_at = NOW()
              WHERE user_id = $1 AND skill_id = $2
            `, [userId, skillId]);
          }
        } else {
          // Create new profile with lower confidence (possible skill)
          await client.query(`
            INSERT INTO employee_skill_profiles (user_id, skill_id, current_level, source, confidence_score, verified)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [userId, skillId, 'medium', 'cv_import', 0.6, false]);
        }
        importedSkillsCount++;
      }
    }

    // Create CV import record
    const importRecord = await client.query(`
      INSERT INTO cv_imports (user_id, file_name, file_size, extracted_data, imported_skills_count, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `, [
      userId,
      fileName || 'unknown',
      fileSize || 0,
      JSON.stringify(extractedData),
      importedSkillsCount,
      'completed'
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      importedSkillsCount,
      importId: importRecord.rows[0].id,
      message: `تم استيراد ${importedSkillsCount} مهارة من سيرتك الذاتية بنجاح`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CV import confirmation error:', error);
    res.status(500).json({ 
      error: 'Failed to import CV data',
      message: error.message 
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/cv-import/history
 * Get user's CV import history
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, file_name, file_size, imported_skills_count, status, created_at
      FROM cv_imports
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get CV import history error:', error);
    res.status(500).json({ error: 'Failed to get CV import history' });
  }
});

/**
 * DELETE /api/cv-import/delete
 * Delete CV import data and all associated skills
 */
router.delete('/delete', authenticate, async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');

    const userId = req.user.id;

    // Count skills that will be deleted (for feedback)
    const skillsCountResult = await client.query(
      `SELECT COUNT(*) as count FROM employee_skill_profiles WHERE user_id = $1 AND source = 'cv_import'`,
      [userId]
    );
    const deletedSkillsCount = parseInt(skillsCountResult.rows[0].count) || 0;

    // Delete skills imported from CV
    await client.query(
      `DELETE FROM employee_skill_profiles WHERE user_id = $1 AND source = 'cv_import'`,
      [userId]
    );

    // Delete education records imported from CV
    await client.query(
      `DELETE FROM user_education WHERE user_id = $1 AND source = 'cv_import'`,
      [userId]
    );

    // Delete experience records imported from CV
    await client.query(
      `DELETE FROM user_experience WHERE user_id = $1 AND source = 'cv_import'`,
      [userId]
    );

    // Delete certificates imported from CV
    await client.query(
      `DELETE FROM user_certificates WHERE user_id = $1 AND source = 'cv_import'`,
      [userId]
    );

    // Delete CV import history records
    await client.query(
      `DELETE FROM cv_imports WHERE user_id = $1`,
      [userId]
    );

    // Clear CV-related fields from user record
    await client.query(
      `UPDATE users SET cv_imported = false, cv_imported_at = NULL, cv_raw_text = NULL WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      deletedSkillsCount,
      message: `تم حذف السيرة الذاتية و ${deletedSkillsCount} مهارة مرتبطة بها بنجاح`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CV delete error:', error);
    res.status(500).json({ 
      error: 'Failed to delete CV data',
      message: error.message 
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/cv-import/test-connection
 * Test CV parsing service (for debugging)
 */
router.get('/test-connection', authenticate, async (req, res) => {
  try {
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    
    if (!hasOpenAI) {
      return res.status(500).json({
        error: 'OpenAI API key not configured',
        message: 'OPENAI_API_KEY is required for CV parsing'
      });
    }
    
    // Check Learner Skills API status
    let learnerSkillsStatus = { configured: false, connected: false, message: 'Not checked' };
    try {
      learnerSkillsStatus = await learnerSkillsApi.checkApiStatus();
    } catch (error) {
      learnerSkillsStatus = {
        configured: false,
        connected: false,
        message: `Error checking status: ${error.message}`
      };
    }
    
    res.json({
      success: true,
      message: 'CV parsing service is ready',
      hasOpenAI: hasOpenAI,
      services: {
        textExtractor: 'Available',
        cvParser: 'Available',
        skillMapper: 'Available',
        learnerSkillsApi: learnerSkillsStatus.connected ? 'Available' : 'Unavailable'
      },
      learnerSkillsApi: learnerSkillsStatus
    });
  } catch (error) {
    console.error('CV parsing service test error:', error);
    res.status(500).json({
      error: 'CV parsing service test failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;

