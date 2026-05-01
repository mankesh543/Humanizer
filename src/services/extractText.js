const fs = require('fs/promises');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

async function extractTextFromFile(filePath, originalName) {
  const extension = path.extname(originalName).toLowerCase();

  if (extension === '.txt') {
    return fs.readFile(filePath, 'utf8');
  }

  if (extension === '.docx') {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value;
  }

  if (extension === '.pdf') {
    const fileBuffer = await fs.readFile(filePath);
    const parsed = await pdfParse(fileBuffer);
    return parsed.text;
  }

  throw new Error('Unsupported file type. Please upload DOCX, PDF, or TXT.');
}

module.exports = {
  extractTextFromFile,
};
