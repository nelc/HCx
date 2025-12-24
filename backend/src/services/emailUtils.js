/**
 * Email utility functions
 * Handles email address normalization to prevent Punycode encoding issues
 */

const { domainToUnicode } = require('url');

/**
 * Normalizes an email address by decoding any Punycode-encoded domain parts
 * This prevents issues where email addresses with international characters
 * or incorrectly encoded domains fail to send
 * 
 * @param {string} email - The email address to normalize
 * @param {boolean} verbose - Whether to log debug information
 * @returns {string} The normalized email address
 */
function normalizeEmailAddress(email, verbose = false) {
  if (!email || typeof email !== 'string') {
    return email;
  }

  try {
    const parts = email.split('@');
    if (parts.length !== 2) {
      return email;
    }

    const [localPart, domain] = parts;
    const domainParts = domain.split('.');
    
    const normalizedParts = domainParts.map((part) => {
      // Check if this is a Punycode-encoded domain part
      if (part.startsWith('xn--')) {
        try {
          const decoded = domainToUnicode(part);
          
          if (!decoded || decoded.length === 0) {
            // Fallback: try to extract readable part
            const withoutPrefix = part.substring(4);
            const extracted = withoutPrefix.split('-')[0];
            if (/^[a-z0-9]+$/i.test(extracted)) {
              return extracted;
            }
          }
          
          if (decoded && /^[a-z0-9-]+$/i.test(decoded)) {
            if (verbose) {
              console.log(`📧 Decoded Punycode domain: ${part} -> ${decoded}`);
            }
            return decoded;
          }
        } catch (e) {
          // Keep original if decoding fails
          if (verbose) {
            console.log(`📧 Could not decode Punycode: ${part}`);
          }
        }
      }
      return part;
    });

    const normalizedDomain = normalizedParts.join('.');
    const normalizedEmail = `${localPart}@${normalizedDomain}`;
    
    if (verbose && normalizedEmail !== email) {
      console.log(`📧 Email normalized: ${email} -> ${normalizedEmail}`);
    }
    
    return normalizedEmail;
  } catch (error) {
    console.error('Error normalizing email address:', error);
    return email;
  }
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} Whether the email is valid
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  normalizeEmailAddress,
  isValidEmail,
};

