const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  PORT: process.env.PORT || 3001,
  SESSION_SECRET: process.env.SESSION_SECRET || 'esquizo-studios-super-secret-key-2026',
  
  // Discord OAuth2 for Admin Panel
  DISCORD: {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || '',
    REDIRECT_URI: process.env.DISCORD_REDIRECT_URI || 'http://localhost:3001/auth/discord/callback',
    BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
    DEFAULT_ADMIN_IDS: (process.env.DEFAULT_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  },

  // Storage
  DATA_DIR: path.join(__dirname, '..', 'data'),
  UPLOADS_DIR: path.join(__dirname, '..', 'public', 'uploads'),
  INSTANCES_DIR: path.join(__dirname, '..', 'public', 'uploads', 'instances'),

  STUDIO_NAME: 'EsquizoStudios',
  VERSION: '1.0.0'
};
