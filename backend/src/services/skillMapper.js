const db = require('../db');

class SkillMapperService {
  /**
   * Map skill strings to database skills
   * IMPORTANT: Only maps to EXISTING skills.
   * Does NOT create new skills automatically.
   * @param {Array<string>} skillNames - Array of skill name strings (from CV parsing)
   * @returns {Promise<Array<Object>>} Array of {skill_id, name_ar, name_en, domain_id, is_new}
   */
  async mapSkills(skillNames) {
    if (!skillNames || skillNames.length === 0) {
      return [];
    }

    const mappedSkills = [];

    for (const skillName of skillNames) {
      if (!skillName || typeof skillName !== 'string') {
        continue;
      }

      // Try to find existing skill (case-insensitive, both Arabic and English)
      const existingSkill = await this.findExistingSkill(skillName);
      
      if (existingSkill) {
        mappedSkills.push({
          skill_id: existingSkill.id,
          name_ar: existingSkill.name_ar,
          name_en: existingSkill.name_en,
          domain_id: existingSkill.domain_id,
          is_new: false,
        });
      } else {
        // If no existing skill is found, we SKIP creating a new one.
        // Skills must be created manually by admins in the domains/skills management screens.
        continue;
      }
    }

    return mappedSkills;
  }

  /**
   * Find existing skill by name (checks both Arabic and English)
   */
  async findExistingSkill(skillName) {
    const trimmedName = (skillName || '').trim();
    if (!trimmedName) {
      return null;
    }

    const normalized = trimmedName.toLowerCase();
    
    // 1) Exact, case-insensitive match on Arabic or English names
    let result = await db.query(`
      SELECT id, name_ar, name_en, domain_id
      FROM skills
      WHERE LOWER(TRIM(name_ar)) = $1
         OR LOWER(TRIM(name_en)) = $1
      LIMIT 1
    `, [normalized]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // 2) Relaxed match: try to find a skill where the stored name contains
    //    the extracted skill name (e.g. "Microsoft Excel" ≈ "Excel").
    //    This helps reuse existing skills instead of creating new, similar ones.
    if (normalized.length >= 3) {
      result = await db.query(`
        SELECT id, name_ar, name_en, domain_id
        FROM skills
        WHERE LOWER(name_ar) LIKE $1
           OR LOWER(name_en) LIKE $1
        ORDER BY
          -- Prefer closer matches (shorter names) first
          LEAST(char_length(COALESCE(name_ar, '')), char_length(COALESCE(name_en, ''))) ASC
        LIMIT 1
      `, [`%${normalized}%`]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }
    }

    return null;
  }

  /**
   * Create a new skill in the database
   */
  async createSkill(skillName, domainId) {
    const trimmedName = skillName.trim();
    
    // Try to determine if it's Arabic or English
    // Simple heuristic: if contains Arabic characters, treat as Arabic
    const isArabic = /[\u0600-\u06FF]/.test(trimmedName);
    
    try {
      // Skills table requires both name_ar and name_en, so use the same value for both if we can't determine
      const result = await db.query(`
        INSERT INTO skills (domain_id, name_ar, name_en, weight)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name_ar, name_en, domain_id
      `, [
        domainId,
        isArabic ? trimmedName : trimmedName, // Use same value for both if English
        isArabic ? trimmedName : trimmedName, // Use same value for both if Arabic
        1.0
      ]);

      return result.rows[0];
    } catch (error) {
      console.error(`Failed to create skill "${trimmedName}":`, error.message);
      return null;
    }
  }

  /**
   * Get or create default "General Skills" domain
   */
  async getDefaultDomainId() {
    // Try to find existing "General Skills" or "مهارات عامة" domain
    let result = await db.query(`
      SELECT id FROM training_domains
      WHERE LOWER(name_ar) LIKE '%عام%' 
         OR LOWER(name_en) LIKE '%general%'
         OR LOWER(name_en) LIKE '%other%'
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    // If no general domain exists, get the first available domain
    result = await db.query(`
      SELECT id FROM training_domains
      WHERE is_active = true
      ORDER BY created_at ASC
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    // Last resort: create a general domain
    try {
      result = await db.query(`
        INSERT INTO training_domains (name_ar, name_en, description_ar, description_en, color, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        'مهارات عامة',
        'General Skills',
        'المهارات العامة المستخرجة من السيرة الذاتية',
        'General skills extracted from CV',
        '#6B7280',
        true
      ]);

      return result.rows[0].id;
    } catch (error) {
      console.error('Failed to create default domain:', error.message);
      console.error('Domain creation error details:', error);
      // Instead of throwing, return null and handle it in mapSkills
      return null;
    }
  }

  /**
   * Group skills by domain for better organization
   */
  async groupSkillsByDomain(skills) {
    const domainMap = new Map();

    for (const skill of skills) {
      if (!domainMap.has(skill.domain_id)) {
        // Get domain info
        const domainResult = await db.query(`
          SELECT id, name_ar, name_en, color
          FROM training_domains
          WHERE id = $1
        `, [skill.domain_id]);

        if (domainResult.rows.length > 0) {
          domainMap.set(skill.domain_id, {
            domain_id: skill.domain_id,
            domain_name_ar: domainResult.rows[0].name_ar,
            domain_name_en: domainResult.rows[0].name_en,
            domain_color: domainResult.rows[0].color,
            skills: [],
          });
        }
      }

      const domainGroup = domainMap.get(skill.domain_id);
      if (domainGroup) {
        domainGroup.skills.push(skill);
      }
    }

    return Array.from(domainMap.values());
  }
}

module.exports = new SkillMapperService();

