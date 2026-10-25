const axios = require('axios');
const config = require('./config');
const db = require('./db');

/**
 * Sends a rich embed notification to the configured Discord Admin Webhook.
 * @param {Object} payload - { title, description, color, fields, footer }
 */
async function sendDiscordAdminWebhook(payload) {
  const settings = db.getSettings();
  const webhookUrl = (settings.discord_webhook_url || config.DISCORD.ADMIN_WEBHOOK_URL || '').trim();

  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    return; // No webhook configured, silently skip
  }

  try {
    const embed = {
      title: payload.title || 'EsquizoStudios Audit Log',
      description: payload.description || '',
      color: payload.color || 0x9333ea, // Default purple
      fields: payload.fields || [],
      footer: {
        text: payload.footer || 'EsquizoStudios System & Security'
      },
      timestamp: new Date().toISOString()
    };

    await axios.post(webhookUrl, {
      username: 'EsquizoStudios Security',
      avatar_url: 'https://raw.githubusercontent.com/AlexCAC0/esquizolauncher/main/esquizo.png',
      embeds: [embed]
    }, { timeout: 5000 });
  } catch (err) {
    console.error('[Discord Webhook Error]', err.message);
  }
}

module.exports = {
  sendDiscordAdminWebhook
};
