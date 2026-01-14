const OpenAI = require('openai');

class CVParserService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Parse CV text using OpenAI to extract structured data
   * @param {string} cvText - Raw text extracted from CV
   * @returns {Promise<Object>} Parsed CV data with confirmed and possible skills
   */
  async parseCV(cvText) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    // First pass: Extract confirmed skills (explicitly mentioned)
    const confirmedPrompt = `You are a CV parser. Extract structured information from the following CV text.

CRITICAL: Extract ONLY skills that are EXPLICITLY MENTIONED or DIRECTLY STATED in the CV.
- Skills must be DIRECTLY visible in the text (mentioned by name, tool, technology, or certification)
- DO NOT infer or assume skills that are not clearly stated
- Extract from ALL sections: Education, Certificates, Experience, Skills section, Projects, Training

RULES FOR CONFIRMED SKILLS:
- Extract SPECIFIC, TECHNICAL skills only (1-2 words max, compound skills with "&" allowed)
- Must be DIRECTLY mentioned in the CV text
- Examples: If CV says "Python developer" → extract "Python"
- Examples: If CV says "AWS Certified" → extract "AWS"
- Examples: If CV says "worked with React" → extract "React"
- Examples: If CV says "Quality & Assurance" → extract "Quality & Assurance" (complete phrase)
- Examples: If CV says "Research and Development" → extract "Research & Development"
- DO NOT extract skills that are only implied or assumed
- DO NOT truncate compound skills - keep them complete (e.g., "Quality & Assurance", not "Quality &")

Extract the following information and return as JSON:
{
  "full_name": "Full name if found",
  "email": "Email address if found",
  "phone": "Phone number if found",
  "summary": "Professional summary if available",
  "education": [
    {
      "degree": "Degree name",
      "institution": "Institution name",
      "graduation_year": "Year (as string)"
    }
  ],
  "experience": [
    {
      "title": "Job title",
      "company": "Company name",
      "start_date": "Start date (format: YYYY-MM or YYYY)",
      "end_date": "End date (format: YYYY-MM or YYYY or 'Present')",
      "description": "Brief job description"
    }
  ],
  "certificates": [
    {
      "name": "Certificate name",
      "issuer": "Issuing organization",
      "date": "Date (format: YYYY-MM or YYYY)"
    }
  ],
  "skills": [
    "Skill1",
    "Skill2"
  ]
}

CV Text:
${cvText}

IMPORTANT: Return a valid JSON object with the exact structure shown above. Do not include any markdown, code blocks, or additional text.`;

    // Second pass: Suggest possible skills (inferred from context)
    const possibleSkillsPrompt = `Based on the following CV content, suggest skills that are LIKELY but NOT EXPLICITLY MENTIONED.

RULES:
- Suggest skills that are COMMONLY ASSOCIATED with the person's background but not directly stated
- Base suggestions on: job titles, education, certificates, experience descriptions, and industry standards
- Skills must be RELEVANT and LOGICAL inferences
- Return SHORT TERMS (1-2 words max, compound skills with "&" allowed)
- Keep compound skills complete (e.g., "Quality & Assurance", not "Quality &")
- Return as a simple array of skill strings

Examples:
- If CV shows "Software Engineer" with "Java" experience → suggest "Object-Oriented Programming", "Software Design"
- If CV shows "Data Analyst" with "Excel" → suggest "Data Visualization", "Statistical Analysis"
- If CV shows "AWS Certified" → suggest "Cloud Architecture", "DevOps"
- If CV shows "Computer Science degree" → suggest "Algorithms", "Data Structures"

CV Text:
${cvText}

IMPORTANT: Return a valid JSON object with this exact structure:
{
  "possible_skills": ["Skill1", "Skill2", "Skill3"]
}

Do not include any markdown, code blocks, or additional text.`;

    try {
      // First pass: Extract confirmed skills
      const confirmedCompletion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a CV parser. Extract structured information and return ONLY valid JSON. No explanations, no markdown, just JSON.'
          },
          {
            role: 'user',
            content: confirmedPrompt
          }
        ],
        temperature: 0.2, // Lower temperature for more accurate extraction
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });

      const confirmedResponseText = confirmedCompletion.choices[0].message.content.trim();
      
      // Parse confirmed skills response
      let parsedData;
      try {
        let jsonText = confirmedResponseText;
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        parsedData = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('JSON parse error (confirmed):', parseError);
        console.error('Response text:', confirmedResponseText);
        const jsonMatch = confirmedResponseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedData = JSON.parse(jsonMatch[0]);
          } catch (e) {
            throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
          }
        } else {
          throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
        }
      }

      // Second pass: Get possible skills (inferred)
      let possibleSkills = [];
      try {
        const possibleCompletion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a skill inference engine. Suggest relevant skills based on CV context. Return ONLY valid JSON.'
            },
            {
              role: 'user',
              content: possibleSkillsPrompt
            }
          ],
          temperature: 0.4, // Slightly higher for inference
          max_tokens: 1000,
          response_format: { type: "json_object" }
        });

        const possibleResponseText = possibleCompletion.choices[0].message.content.trim();
        try {
          let possibleJsonText = possibleResponseText;
          if (possibleJsonText.startsWith('```json')) {
            possibleJsonText = possibleJsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (possibleJsonText.startsWith('```')) {
            possibleJsonText = possibleJsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }
          
          const possibleData = JSON.parse(possibleJsonText);
          possibleSkills = possibleData.possible_skills || [];
        } catch (possibleParseError) {
          console.error('Error parsing possible skills:', possibleParseError);
          // Continue without possible skills if parsing fails
          possibleSkills = [];
        }
      } catch (possibleError) {
        console.error('Error getting possible skills:', possibleError);
        // Continue without possible skills if API call fails
        possibleSkills = [];
      }

      // Clean and validate skills - ensure they are short terms (1-2 words max) and specific
      if (parsedData.skills && Array.isArray(parsedData.skills)) {
        // List of generic terms to filter out
        const genericTerms = [
          'licensing', 'platforms', 'partnerships', 'initiatives', 'education', 
          'development', 'management', 'coordination', 'planning', 'strategy',
          'innovation', 'communication', 'collaboration', 'leadership', 'teamwork',
          'organization', 'administration', 'operations', 'implementation', 'execution',
          'cooperation', 'interaction', 'engagement', 'participation', 'contribution'
        ];
        
        parsedData.skills = parsedData.skills
          .map(skill => {
            if (typeof skill === 'string') {
              // Remove extra whitespace
              let cleaned = skill.trim();
              
              // Remove common prefixes/suffixes that make skills too long
              cleaned = cleaned
                .replace(/^(experience with|proficient in|skilled in|knowledge of|expertise in|working with|using)\s+/i, '')
                .replace(/\s+(skills?|experience|knowledge|expertise|tools?|technologies?|frameworks?)$/i, '')
                .trim();
              
              // Normalize "&" and "and" - treat them as part of the skill name, not separators
              cleaned = cleaned.replace(/\s*&\s*/g, ' & ').replace(/\s+and\s+/gi, ' & ');
              
              // Split into words, but preserve "&" as part of meaningful phrases
              const words = cleaned.split(/\s+/).filter(w => w.length > 0);
              
              // Smart truncation: take up to 2 meaningful words, but include "&" if it's part of a compound skill
              let shortSkill = '';
              let wordCount = 0;
              let includeAmpersand = false;
              
              for (let i = 0; i < words.length && wordCount < 2; i++) {
                const word = words[i];
                
                // If we encounter "&", include it and the next word as one unit
                if (word === '&' || word === '&amp;') {
                  includeAmpersand = true;
                  if (i + 1 < words.length) {
                    // Include "&" and the next word together
                    shortSkill = (shortSkill ? shortSkill + ' ' : '') + word + ' ' + words[i + 1];
                    wordCount += 2; // Count as 2 words but keep together
                    i++; // Skip next word as we already included it
                  } else {
                    // "&" at the end, just add it
                    shortSkill = (shortSkill ? shortSkill + ' ' : '') + word;
                    wordCount++;
                  }
                } else {
                  // Regular word
                  shortSkill = (shortSkill ? shortSkill + ' ' : '') + word;
                  wordCount++;
                }
                
                // Stop if we've reached meaningful length (2 words or compound with &)
                if (wordCount >= 2 && !includeAmpersand) {
                  break;
                }
                // If we have "&", we can take one more word after it
                if (includeAmpersand && wordCount >= 3) {
                  break;
                }
              }
              
              shortSkill = shortSkill.trim();
              
              // Check if it's a generic term (case-insensitive)
              const lowerSkill = shortSkill.toLowerCase();
              if (genericTerms.includes(lowerSkill)) {
                return null; // Filter out generic terms
              }
              
              // Filter out if too long (more than 40 chars to allow for compound skills) or empty
              if (shortSkill.length > 0 && shortSkill.length <= 40) {
                return shortSkill;
              }
            }
            return null;
          })
          .filter(skill => skill && skill.length > 0 && skill.length <= 40)
          .filter((skill, index, self) => self.indexOf(skill) === index) // Remove duplicates
          .filter(skill => {
            // Additional filtering: skip if it's too generic (single word that's too abstract)
            const lowerSkill = skill.toLowerCase();
            const singleWordGeneric = ['automation', 'development', 'education', 'leadership'];
            if (singleWordGeneric.includes(lowerSkill) && skill.split(/\s+/).length === 1) {
              // Only filter if it's standalone and generic
              return false;
            }
            return true;
          });
      } else {
        parsedData.skills = [];
      }

      // Ensure all arrays exist
      parsedData.education = parsedData.education || [];
      parsedData.experience = parsedData.experience || [];
      parsedData.certificates = parsedData.certificates || [];
      parsedData.full_name = parsedData.full_name || '';
      parsedData.email = parsedData.email || '';
      parsedData.phone = parsedData.phone || '';
      parsedData.summary = parsedData.summary || '';

      // Extract additional skills from education and certificates if not already in skills array
      const additionalSkills = [];
      
      // Extract skills from education degrees
      if (parsedData.education && Array.isArray(parsedData.education)) {
        parsedData.education.forEach(edu => {
          if (edu.degree) {
            const degreeLower = edu.degree.toLowerCase();
            // Map common degrees to skills
            if (degreeLower.includes('computer') || degreeLower.includes('software') || degreeLower.includes('programming')) {
              additionalSkills.push('Programming', 'Software Development');
            }
            if (degreeLower.includes('engineering')) {
              additionalSkills.push('Engineering');
            }
            if (degreeLower.includes('business') || degreeLower.includes('management')) {
              additionalSkills.push('Business Management');
            }
            if (degreeLower.includes('data') || degreeLower.includes('analytics')) {
              additionalSkills.push('Data Analysis');
            }
            if (degreeLower.includes('network') || degreeLower.includes('cyber')) {
              additionalSkills.push('Networking', 'Cybersecurity');
            }
          }
        });
      }
      
      // Extract skills from certificates
      if (parsedData.certificates && Array.isArray(parsedData.certificates)) {
        parsedData.certificates.forEach(cert => {
          if (cert.name) {
            const certLower = cert.name.toLowerCase();
            // Extract technology/tool names from certificates
            if (certLower.includes('aws')) additionalSkills.push('AWS');
            if (certLower.includes('azure')) additionalSkills.push('Azure');
            if (certLower.includes('gcp') || certLower.includes('google cloud')) additionalSkills.push('GCP');
            if (certLower.includes('pmp') || certLower.includes('project management')) additionalSkills.push('PMP', 'Project Management');
            if (certLower.includes('scrum')) additionalSkills.push('Scrum');
            if (certLower.includes('agile')) additionalSkills.push('Agile');
            if (certLower.includes('itil')) additionalSkills.push('ITIL');
            if (certLower.includes('cisco')) additionalSkills.push('Cisco');
            if (certLower.includes('microsoft')) additionalSkills.push('Microsoft');
            if (certLower.includes('oracle')) additionalSkills.push('Oracle');
            if (certLower.includes('salesforce')) additionalSkills.push('Salesforce');
            if (certLower.includes('python')) additionalSkills.push('Python');
            if (certLower.includes('java')) additionalSkills.push('Java');
            if (certLower.includes('security') || certLower.includes('cyber')) additionalSkills.push('Cybersecurity');
            if (certLower.includes('network')) additionalSkills.push('Networking');
            if (certLower.includes('cloud')) additionalSkills.push('Cloud Computing');
          }
        });
      }
      
      // Merge additional skills with existing skills, remove duplicates
      if (additionalSkills.length > 0) {
        const allSkills = [...(parsedData.skills || []), ...additionalSkills];
        parsedData.skills = [...new Set(allSkills.map(s => s.trim()).filter(s => s.length > 0))];
      }

      // Clean and validate possible skills (same logic as confirmed skills)
      if (possibleSkills && Array.isArray(possibleSkills)) {
        possibleSkills = possibleSkills
          .map(skill => {
            if (typeof skill === 'string') {
              let cleaned = skill.trim();
              
              // Normalize "&" and "and"
              cleaned = cleaned.replace(/\s*&\s*/g, ' & ').replace(/\s+and\s+/gi, ' & ');
              
              // Smart truncation for possible skills too
              const words = cleaned.split(/\s+/).filter(w => w.length > 0);
              let shortSkill = '';
              let wordCount = 0;
              let includeAmpersand = false;
              
              for (let i = 0; i < words.length && wordCount < 2; i++) {
                const word = words[i];
                
                if (word === '&' || word === '&amp;') {
                  includeAmpersand = true;
                  if (i + 1 < words.length) {
                    shortSkill = (shortSkill ? shortSkill + ' ' : '') + word + ' ' + words[i + 1];
                    wordCount += 2;
                    i++;
                  } else {
                    shortSkill = (shortSkill ? shortSkill + ' ' : '') + word;
                    wordCount++;
                  }
                } else {
                  shortSkill = (shortSkill ? shortSkill + ' ' : '') + word;
                  wordCount++;
                }
                
                if (wordCount >= 2 && !includeAmpersand) {
                  break;
                }
                if (includeAmpersand && wordCount >= 3) {
                  break;
                }
              }
              
              shortSkill = shortSkill.trim();
              
              if (shortSkill.length > 0 && shortSkill.length <= 40) {
                return shortSkill;
              }
            }
            return null;
          })
          .filter(skill => skill !== null)
          .filter((skill, index, self) => self.indexOf(skill) === index) // Remove duplicates
          // Remove possible skills that are already in confirmed skills
          .filter(skill => !parsedData.skills.some(confirmed => 
            confirmed.toLowerCase() === skill.toLowerCase()
          ));
      } else {
        possibleSkills = [];
      }

      // Add possible skills to response
      parsedData.possible_skills = possibleSkills;

      return parsedData;
    } catch (error) {
      console.error('CV parsing error:', error);
      throw new Error(`Failed to parse CV: ${error.message}`);
    }
  }
}

module.exports = new CVParserService();

