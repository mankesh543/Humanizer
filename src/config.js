const path = require('path');

const rootDir = path.resolve(__dirname, '..');

module.exports = {
  port: Number(process.env.PORT || 3000),
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
  uploadDir: path.join(rootDir, 'uploads'),
  generatedDir: path.join(rootDir, 'generated'),
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiry: process.env.JWT_EXPIRY || '30d',
};
