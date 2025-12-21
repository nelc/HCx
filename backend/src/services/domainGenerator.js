/**
 * Domain Generator Service
 * 
 * Uses OpenAI to generate training domains and skills based on department
 * objectives and responsibilities.
 */

const OpenAI = require('openai');

class DomainGeneratorService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Generate training domains and skills based on department information
   * @param {Object} department - Department object with objective and responsibilities
   * @returns {Promise<Object>} Generated domains with skills
   */
  async generateDomainsForDepartment(department) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    const departmentName = department.name_ar || department.name_en || 'Unknown Department';
    const objectiveAr = department.objective_ar || '';
    const objectiveEn = department.objective_en || '';
    const responsibilities = department.responsibilities || [];

    // Format responsibilities for the prompt
    const responsibilitiesText = responsibilities
      .map((r, i) => `${i + 1}. ${r.text_ar || r.text_en || ''}`)
      .filter(r => r.length > 3)
      .join('\n');

    const prompt = `You are an expert in organizational development and training needs analysis. Based on the following department information, generate relevant training domains and skills that employees in this department should develop.

DEPARTMENT INFORMATION:
- Department Name: ${departmentName}
- Main Objective (Arabic): ${objectiveAr || 'Not specified'}
- Main Objective (English): ${objectiveEn || 'Not specified'}
- Responsibilities:
${responsibilitiesText || 'Not specified'}

INSTRUCTIONS:
Generate 3-6 training domains that are most relevant to this department's work. For each domain, provide 4-8 specific skills that employees should develop.

Consider:
1. Core competencies needed for the department's main objective
2. Technical skills required for the responsibilities
3. Soft skills that support effective work
4. Leadership and management skills if applicable
5. Industry-specific knowledge areas

Return a JSON object with this exact structure:
{
  "domains": [
    {
      "name_ar": "اسم المجال بالعربية",
      "name_en": "Domain Name in English",
      "description_ar": "وصف موجز للمجال بالعربية",
      "description_en": "Brief description of the domain in English",
      "color": "#hex_color",
      "skills": [
        {
          "name_ar": "اسم المهارة بالعربية",
          "name_en": "Skill Name in English",
          "description_ar": "وصف موجز للمهارة",
          "description_en": "Brief skill description"
        }
      ]
    }
  ],
  "analysis": {
    "key_competency_areas": ["list of main competency areas identified"],
    "priority_focus": "brief explanation of the main training priorities",
    "recommendations_ar": "توصيات إضافية بالعربية",
    "recommendations_en": "Additional recommendations in English"
  }
}

Use appropriate colors for each domain (choose from: #502390, #3B82F6, #10B981, #8B5CF6, #F59E0B, #EC4899, #EF4444, #14B8A6).

Ensure all Arabic text is properly written and grammatically correct.
Return ONLY valid JSON without any markdown formatting or code blocks.`;

    try {
      console.log(`🤖 Generating domains for department: ${departmentName}`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert HR consultant specializing in organizational development and training needs analysis. You provide structured, actionable recommendations in both Arabic and English.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse the JSON response
      let result;
      try {
        result = JSON.parse(content);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response:', content);
        throw new Error('Invalid JSON response from OpenAI');
      }

      // Validate the structure
      if (!result.domains || !Array.isArray(result.domains)) {
        throw new Error('Invalid response structure: missing domains array');
      }

      // Ensure each domain has required fields
      result.domains = result.domains.map((domain, index) => ({
        name_ar: domain.name_ar || `مجال ${index + 1}`,
        name_en: domain.name_en || `Domain ${index + 1}`,
        description_ar: domain.description_ar || '',
        description_en: domain.description_en || '',
        color: domain.color || this.getDefaultColor(index),
        skills: (domain.skills || []).map((skill, skillIndex) => ({
          name_ar: skill.name_ar || `مهارة ${skillIndex + 1}`,
          name_en: skill.name_en || `Skill ${skillIndex + 1}`,
          description_ar: skill.description_ar || '',
          description_en: skill.description_en || ''
        }))
      }));

      console.log(`✅ Generated ${result.domains.length} domains with ${result.domains.reduce((sum, d) => sum + d.skills.length, 0)} total skills`);

      return {
        success: true,
        department_id: department.id,
        department_name: departmentName,
        ...result
      };
    } catch (error) {
      console.error('Domain generation error:', error);
      throw new Error(`Failed to generate domains: ${error.message}`);
    }
  }

  /**
   * Get default color for domain by index
   */
  getDefaultColor(index) {
    const colors = ['#502390', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6'];
    return colors[index % colors.length];
  }

  /**
   * Validate generated domains before saving
   * @param {Array} domains - Array of domain objects
   * @returns {Object} Validation result
   */
  validateDomains(domains) {
    const errors = [];
    
    if (!Array.isArray(domains) || domains.length === 0) {
      errors.push('At least one domain is required');
      return { valid: false, errors };
    }

    domains.forEach((domain, dIndex) => {
      if (!domain.name_ar || !domain.name_ar.trim()) {
        errors.push(`Domain ${dIndex + 1}: Arabic name is required`);
      }
      if (!domain.name_en || !domain.name_en.trim()) {
        errors.push(`Domain ${dIndex + 1}: English name is required`);
      }
      
      if (!domain.skills || !Array.isArray(domain.skills) || domain.skills.length === 0) {
        errors.push(`Domain "${domain.name_ar || domain.name_en}": At least one skill is required`);
      } else {
        domain.skills.forEach((skill, sIndex) => {
          if (!skill.name_ar || !skill.name_ar.trim()) {
            errors.push(`Domain "${domain.name_ar}": Skill ${sIndex + 1} Arabic name is required`);
          }
          if (!skill.name_en || !skill.name_en.trim()) {
            errors.push(`Domain "${domain.name_ar}": Skill ${sIndex + 1} English name is required`);
          }
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
module.exports = new DomainGeneratorService();

