const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extract text from CV file based on file type
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromCV(fileBuffer, mimeType) {
  try {
    // Handle PDF files
    if (mimeType === 'application/pdf' || mimeType === 'application/octet-stream') {
      const data = await pdfParse(fileBuffer);
      return data.text;
    }
    
    // Handle DOCX files
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        mimeType === 'application/octet-stream') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    }
    
    // Handle DOC files (legacy)
    if (mimeType === 'application/msword') {
      // For .doc files, we'll try mammoth (it may work for some)
      // Otherwise, user should convert to DOCX
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value;
      } catch (error) {
        throw new Error('DOC files are not fully supported. Please convert to PDF or DOCX format.');
      }
    }
    
    throw new Error(`Unsupported file type: ${mimeType}`);
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error(`Failed to extract text from CV: ${error.message}`);
  }
}

module.exports = {
  extractTextFromCV
};

