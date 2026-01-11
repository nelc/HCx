const OpenAI = require('openai');

class CourseEnricherService {
  constructor() {
    // Lazy initialization - only create OpenAI client when actually needed
    this._openai = null;
  }

  get openai() {
    if (!this._openai) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }
      this._openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    return this._openai;
  }

  /**
   * Enrich a single course with AI-extracted metadata
   * @param {Object} course - Course object with name_ar, name_en, description_ar, etc.
   * @returns {Promise<Object>} Enriched course data
   */
  async enrichCourse(course) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    const courseName = course.name_ar || course.name_en || 'Unknown Course';
    const courseDescription = course.description_ar || course.description_en || '';
    const existingSubject = course.subject || '';
    const existingProvider = course.provider || '';
    const existingDifficulty = course.difficulty_level || '';

    const prompt = `You are an expert course analyst. Analyze this course and extract detailed metadata to improve course recommendations.

COURSE INFORMATION:
- Name (Arabic): ${course.name_ar || 'N/A'}
- Name (English): ${course.name_en || 'N/A'}
- Description (Arabic): ${course.description_ar || 'N/A'}
- Description (English): ${course.description_en || 'N/A'}
- Subject/Category: ${existingSubject || 'N/A'}
- Provider: ${existingProvider || 'N/A'}
- Current Difficulty: ${existingDifficulty || 'N/A'}
- Duration: ${course.duration_hours || 'N/A'} hours

INSTRUCTIONS:
Extract the following information. Be specific and practical. If information cannot be determined, use null.

Return a JSON object with this exact structure:
{
  "suggested_domains": [
    // Array of EXACTLY 2 domains/subjects this course belongs to
    // Choose from common domains like: "Technology", "Business", "Data Science", "Marketing", 
    // "Finance", "Healthcare", "Engineering", "Design", "Leadership", "Communication",
    // "Project Management", "Human Resources", "Agriculture", "Education", "Law", etc.
    // First domain is primary, second is secondary
    // Examples: ["Data Science", "Business Analytics"] or ["Marketing", "Communication"]
  ],
  "extracted_skills": [
    // Array of 5-15 specific, actionable skills taught in this course
    // Examples: "Python Programming", "Data Visualization", "Machine Learning", "SQL Queries"
    // Be specific - not "programming" but "Python Programming"
    // Include both technical and soft skills if applicable
  ],
  "prerequisite_skills": [
    // Array of 0-5 skills required BEFORE taking this course
    // Examples: "Basic Math", "Excel Basics", "HTML Fundamentals"
    // Leave empty [] if suitable for absolute beginners
  ],
  "learning_outcomes": [
    // Array of 3-5 specific outcomes learners will achieve
    // Start with action verbs: "Build...", "Analyze...", "Create...", "Understand..."
    // Be concrete and measurable
  ],
  "target_audience": {
    "level": "beginner" | "intermediate" | "advanced" | "all-levels",
    "roles": [
      // Array of 2-5 job roles this course is ideal for
      // Examples: "Data Analyst", "Software Developer", "Project Manager"
    ],
    "description_ar": "وصف قصير للفئة المستهدفة بالعربية",
    "description_en": "Short description of target audience in English"
  },
  "career_paths": [
    // Array of 2-5 career paths this course helps with
    // Examples: "Data Science", "Web Development", "Digital Marketing"
  ],
  "industry_tags": [
    // Array of 1-5 industries where these skills are valuable
    // Examples: "Technology", "Finance", "Healthcare", "Education", "E-commerce"
  ],
  "topics": [
    // Array of 5-10 main topics covered in the course
    // More granular than skills - the actual curriculum topics
  ],
  "difficulty_assessment": {
    "suggested_level": "beginner" | "intermediate" | "advanced",
    "reasoning": "Brief explanation of why this difficulty level",
    "time_commitment": "low" | "medium" | "high",
    "practical_percentage": 0-100  // Estimated % of hands-on vs theoretical content
  },
  "quality_indicators": {
    "content_clarity": 1-5,  // How clear is the course description
    "skill_specificity": 1-5,  // How specific are the skills taught
    "practical_applicability": 1-5,  // How applicable to real-world work
    "overall_score": 1-5
  },
  "keywords_ar": [
    // Arabic keywords for search optimization (5-10 keywords)
  ],
  "keywords_en": [
    // English keywords for search optimization (5-10 keywords)
  ],
  "summary_ar": "ملخص قصير للدورة في جملة أو جملتين بالعربية",
  "summary_en": "Short course summary in 1-2 sentences in English"
}

IMPORTANT:
- Return ONLY valid JSON, no markdown or extra text
- Be specific and practical, not generic
- Skills should be searchable terms (1-3 words each)
- If the course is in Arabic, prioritize Arabic content but include English equivalents
- Quality scores should be honest - not everything is 5/5`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a course analysis expert. Extract structured metadata from course information. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for consistent extraction
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });

      const responseText = completion.choices[0].message.content.trim();
      
      let enrichedData;
      try {
        enrichedData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        // Try to extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          enrichedData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(`Failed to parse AI response: ${parseError.message}`);
        }
      }

      // Validate and clean the response
      return this.validateAndCleanEnrichment(enrichedData, course);

    } catch (error) {
      console.error('Course enrichment error:', error);
      throw new Error(`Failed to enrich course: ${error.message}`);
    }
  }

  /**
   * Validate and clean enrichment data
   */
  validateAndCleanEnrichment(data, originalCourse) {
    const cleaned = {
      // Original course reference
      course_id: originalCourse.course_id || originalCourse.id,
      
      // Suggested domains (2 domains for better recommendations)
      suggested_domains: Array.isArray(data.suggested_domains) 
        ? data.suggested_domains.slice(0, 2).map(s => String(s).trim()).filter(s => s.length > 0)
        : [],
      
      // Extracted skills (ensure array, limit to 15, clean strings)
      extracted_skills: this.cleanSkillsArray(data.extracted_skills, 15),
      
      // Prerequisites
      prerequisite_skills: this.cleanSkillsArray(data.prerequisite_skills, 5),
      
      // Learning outcomes
      learning_outcomes: Array.isArray(data.learning_outcomes) 
        ? data.learning_outcomes.slice(0, 5).map(s => String(s).trim())
        : [],
      
      // Target audience
      target_audience: {
        level: this.validateLevel(data.target_audience?.level),
        roles: Array.isArray(data.target_audience?.roles) 
          ? data.target_audience.roles.slice(0, 5).map(s => String(s).trim())
          : [],
        description_ar: data.target_audience?.description_ar || '',
        description_en: data.target_audience?.description_en || ''
      },
      
      // Career paths
      career_paths: Array.isArray(data.career_paths) 
        ? data.career_paths.slice(0, 5).map(s => String(s).trim())
        : [],
      
      // Industry tags
      industry_tags: Array.isArray(data.industry_tags) 
        ? data.industry_tags.slice(0, 5).map(s => String(s).trim())
        : [],
      
      // Topics
      topics: Array.isArray(data.topics) 
        ? data.topics.slice(0, 10).map(s => String(s).trim())
        : [],
      
      // Difficulty assessment
      difficulty_assessment: {
        suggested_level: this.validateLevel(data.difficulty_assessment?.suggested_level),
        reasoning: data.difficulty_assessment?.reasoning || '',
        time_commitment: ['low', 'medium', 'high'].includes(data.difficulty_assessment?.time_commitment) 
          ? data.difficulty_assessment.time_commitment 
          : 'medium',
        practical_percentage: Math.min(100, Math.max(0, parseInt(data.difficulty_assessment?.practical_percentage) || 50))
      },
      
      // Quality indicators
      quality_indicators: {
        content_clarity: Math.min(5, Math.max(1, parseInt(data.quality_indicators?.content_clarity) || 3)),
        skill_specificity: Math.min(5, Math.max(1, parseInt(data.quality_indicators?.skill_specificity) || 3)),
        practical_applicability: Math.min(5, Math.max(1, parseInt(data.quality_indicators?.practical_applicability) || 3)),
        overall_score: Math.min(5, Math.max(1, parseInt(data.quality_indicators?.overall_score) || 3))
      },
      
      // Keywords
      keywords_ar: Array.isArray(data.keywords_ar) 
        ? data.keywords_ar.slice(0, 10).map(s => String(s).trim())
        : [],
      keywords_en: Array.isArray(data.keywords_en) 
        ? data.keywords_en.slice(0, 10).map(s => String(s).trim())
        : [],
      
      // Summaries
      summary_ar: data.summary_ar || '',
      summary_en: data.summary_en || '',
      
      // Metadata
      enriched_at: new Date().toISOString(),
      enrichment_version: '1.0'
    };

    return cleaned;
  }

  /**
   * Clean and validate skills array
   */
  cleanSkillsArray(skills, maxLength) {
    if (!Array.isArray(skills)) return [];
    
    return skills
      .slice(0, maxLength)
      .map(skill => {
        if (typeof skill !== 'string') return null;
        // Clean the skill string
        let cleaned = skill.trim();
        // Remove extra whitespace
        cleaned = cleaned.replace(/\s+/g, ' ');
        // Limit length
        if (cleaned.length > 50) {
          cleaned = cleaned.substring(0, 50);
        }
        return cleaned;
      })
      .filter(skill => skill && skill.length > 0);
  }

  /**
   * Validate difficulty level
   */
  validateLevel(level) {
    const validLevels = ['beginner', 'intermediate', 'advanced', 'all-levels'];
    return validLevels.includes(level) ? level : 'intermediate';
  }

  /**
   * Enrich multiple courses in batch with rate limiting
   * @param {Array} courses - Array of course objects
   * @param {Object} options - Batch options
   * @returns {Promise<Object>} Batch enrichment results
   */
  async enrichBatch(courses, options = {}) {
    const {
      batchSize = 5,           // Process 5 at a time
      delayBetweenBatches = 1000, // 1 second between batches
      onProgress = null,      // Progress callback
      stopOnError = false     // Whether to stop on first error
    } = options;

    const results = {
      total: courses.length,
      success: 0,
      failed: 0,
      enriched: [],
      errors: []
    };

    // Process in batches
    for (let i = 0; i < courses.length; i += batchSize) {
      const batch = courses.slice(i, i + batchSize);
      
      // Process batch concurrently
      const batchPromises = batch.map(async (course, idx) => {
        try {
          const enriched = await this.enrichCourse(course);
          results.success++;
          results.enriched.push(enriched);
          return { success: true, data: enriched };
        } catch (error) {
          results.failed++;
          const errorInfo = {
            course_id: course.course_id || course.id,
            course_name: course.name_ar || course.name_en,
            error: error.message
          };
          results.errors.push(errorInfo);
          
          if (stopOnError) {
            throw error;
          }
          return { success: false, error: errorInfo };
        }
      });

      await Promise.all(batchPromises);

      // Report progress
      if (onProgress) {
        const processed = Math.min(i + batchSize, courses.length);
        onProgress({
          processed,
          total: courses.length,
          percent: Math.round((processed / courses.length) * 100),
          success: results.success,
          failed: results.failed
        });
      }

      // Delay before next batch (rate limiting)
      if (i + batchSize < courses.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }

  /**
   * Generate OpenAI embedding for a course (for vector search)
   * @param {Object} course - Course object
   * @returns {Promise<Array>} Embedding vector (1536 dimensions)
   */
  async generateEmbedding(course) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    // Combine course information for embedding
    const textForEmbedding = [
      course.name_ar,
      course.name_en,
      course.description_ar,
      course.description_en,
      course.subject,
      ...(course.extracted_skills || []),
      ...(course.topics || [])
    ].filter(Boolean).join(' ');

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: textForEmbedding,
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Quick skill extraction (lighter version for bulk processing)
   * @param {Object} course - Course object
   * @returns {Promise<Array>} Array of extracted skills
   */
  async extractSkillsOnly(course) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = `Extract 5-10 specific, actionable skills taught in this course.

Course: ${course.name_ar || course.name_en}
Description: ${course.description_ar || course.description_en || 'No description'}
Subject: ${course.subject || 'N/A'}

Return JSON: {"skills": ["Skill1", "Skill2", ...]}

Rules:
- Be specific (not "programming" but "Python Programming")
- Include both Arabic and English skill names if relevant
- Skills should be 1-3 words each
- Only return skills actually taught, not prerequisites`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Extract skills from course info. Return only JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" }
      });

      const data = JSON.parse(completion.choices[0].message.content);
      return this.cleanSkillsArray(data.skills || [], 10);
    } catch (error) {
      console.error('Skill extraction error:', error);
      return [];
    }
  }
}

module.exports = new CourseEnricherService();
