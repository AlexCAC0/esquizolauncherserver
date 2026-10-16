const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const config = require('../config');
const db = require('../db');

// Client ping & announcement
router.get('/status', (req, res) => {
  const settings = db.getSettings();
  res.json({
    online: true,
    studio: config.STUDIO_NAME,
    version: config.VERSION,
    announcement: settings.announcement
  });
});

// Terms and Conditions
router.get('/tos', (req, res) => {
  const settings = db.getSettings();
  res.json({
    studio: config.STUDIO_NAME,
    tos: settings.tos
  });
});

// Offline account login with Discord linking & duplicate prevention
router.post('/auth/offline', (req, res) => {
  const { username, discord_id, discord_username, discord_avatar } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'El nombre de usuario es obligatorio.' });
  }

  const cleanUsername = username.trim();

  // Validate Minecraft username format
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(cleanUsername)) {
    return res.status(400).json({
      error: 'El nombre de usuario debe contener entre 3 y 16 caracteres alfanuméricos.'
    });
  }

  // Discord is required for offline accounts to prevent duplicate accounts
  if (!discord_id) {
    return res.status(400).json({
      error: 'Debes vincular tu cuenta de Discord para iniciar sesión con una cuenta offline.'
    });
  }

  const cleanDiscordId = String(discord_id).trim();

  // Check if this Discord account is already linked to another username
  const existingWithDiscord = db.getUserByDiscordId(cleanDiscordId);
  if (
    existingWithDiscord &&
    existingWithDiscord.username.toLowerCase() !== cleanUsername.toLowerCase()
  ) {
    return res.status(409).json({
      error: `Esta cuenta de Discord ya está vinculada al usuario '${existingWithDiscord.username}'. Debes usar otra cuenta de Discord o desvincularla desde los Ajustes del launcher.`
    });
  }

  // Check if existing user is banned
  const existingUser = db.getUserByUsername(cleanUsername);
  if (existingUser && existingUser.is_banned) {
    return res.status(403).json({
      error: `Tu cuenta ha sido sancionada por la administración de EsquizoStudios. Motivo: ${existingUser.ban_reason || 'Infracción a los términos de servicio'}`
    });
  }

  // Register or update user
  const user = db.registerOrUpdateUser({
    username: cleanUsername,
    type: 'offline',
    discord_id: cleanDiscordId,
    discord_username: discord_username || null,
    discord_avatar: discord_avatar || null
  });

  res.json({
    success: true,
    user
  });
});

// Microsoft account login check
router.post('/auth/microsoft', (req, res) => {
  const { username } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Nombre de usuario no especificado.' });
  }

  const cleanUsername = username.trim();

  // Check ban
  const existingUser = db.getUserByUsername(cleanUsername);
  if (existingUser && existingUser.is_banned) {
    return res.status(403).json({
      error: `Tu cuenta ha sido sancionada por la administración de EsquizoStudios. Motivo: ${existingUser.ban_reason || 'Infracción a los términos de servicio'}`
    });
  }

  const user = db.registerOrUpdateUser({
    username: cleanUsername,
    type: 'microsoft'
  });

  res.json({
    success: true,
    user
  });
});

// Unlink Discord from settings
router.post('/auth/unlink-discord', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Usuario no especificado' });

  const result = db.unlinkDiscord(username);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// Claim instance with 18-character access code
router.post('/instance/claim', (req, res) => {
  const { access_code } = req.body;

  if (!access_code || typeof access_code !== 'string') {
    return res.status(400).json({ error: 'Debes ingresar un código de acceso válido.' });
  }

  const cleanCode = access_code.trim();
  const instance = db.getInstanceByCode(cleanCode);

  if (!instance) {
    return res.status(404).json({
      error: 'El código de acceso ingresado no es válido o ha expirado. Verifica con el staff de EsquizoStudios.'
    });
  }

  // Return public instance details to client
  res.json({
    success: true,
    instance: {
      id: instance.id,
      name: instance.name,
      description: instance.description,
      logo: instance.logo,
      banner: instance.banner,
      mc_version: instance.mc_version,
      loader: instance.loader,
      updated_at: instance.updated_at
    }
  });
});

// Get instance manifest (file list, loader info, hashes)
router.get('/instance/:id/manifest', (req, res) => {
  const { id } = req.params;
  const instance = db.getInstanceById(id);

  if (!instance) {
    return res.status(404).json({ error: 'Instancia no encontrada' });
  }

  const manifestPath = path.join(config.INSTANCES_DIR, id, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return res.json({
        success: true,
        instance: {
          id: instance.id,
          name: instance.name,
          description: instance.description,
          logo: instance.logo,
          banner: instance.banner,
          updated_at: instance.updated_at
        },
        manifest
      });
    } catch (err) {
      console.error('[Manifest read error]', err);
    }
  }

  // Fallback if no .mrpack uploaded yet
  res.json({
    success: true,
    instance: {
      id: instance.id,
      name: instance.name,
      description: instance.description,
      logo: instance.logo,
      banner: instance.banner,
      updated_at: instance.updated_at
    },
    manifest: {
      formatVersion: 1,
      mc_version: instance.mc_version || '1.20.1',
      loader: instance.loader || { type: 'fabric', version: 'latest' },
      files: [],
      overrides: []
    }
  });
});

// Download instance file (overrides, configs, etc.)
router.get('/instance/:id/file', (req, res) => {
  const { id } = req.params;
  const filePath = req.query.path;

  if (!filePath) {
    return res.status(400).send('Parámetro "path" es obligatorio');
  }

  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  const targetFile = path.join(config.INSTANCES_DIR, id, safePath);

  if (!fs.existsSync(targetFile)) {
    return res.status(404).send('Archivo no encontrado');
  }

  res.sendFile(targetFile);
});

module.exports = router;
