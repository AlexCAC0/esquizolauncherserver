const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const config = require('../config');
const db = require('../db');
const { pingMinecraftServer } = require('../ping');

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

  // Check code expiration date
  if (instance.expires_at) {
    const expDate = new Date(instance.expires_at);
    if (!isNaN(expDate.getTime()) && expDate.getTime() < Date.now()) {
      return res.status(403).json({
        error: `El código de acceso para '${instance.name}' ha expirado el ${expDate.toLocaleDateString()}.`
      });
    }
  }

  // Check maximum claims limit
  if (instance.max_uses && typeof instance.max_uses === 'number' && instance.max_uses > 0) {
    const currentClaims = instance.claimed_count || 0;
    if (currentClaims >= instance.max_uses) {
      return res.status(403).json({
        error: `Este código de acceso ha alcanzado el límite máximo permitido de jugadores (${instance.max_uses}).`
      });
    }
  }

  // Increment claim count
  db.incrementInstanceClaim(instance.id);

  // Return public instance details to client
  res.json({
    success: true,
    instance: {
      id: instance.id,
      name: instance.name,
      description: instance.description,
      logo: instance.logo,
      banner: instance.banner,
      server_ip: instance.server_ip || null,
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

// Ping Minecraft Server for live status (Ping, Players Online, MOTD)
router.get('/instance/:id/server-status', async (req, res) => {
  const { id } = req.params;
  const instance = db.getInstanceById(id);

  if (!instance) {
    return res.status(404).json({ error: 'Instancia no encontrada' });
  }

  const serverIp = (instance.server_ip || '').trim();
  if (!serverIp) {
    return res.json({ has_server: false, online: false });
  }

  let host = serverIp;
  let port = 25565;
  if (serverIp.includes(':')) {
    const parts = serverIp.split(':');
    host = parts[0];
    port = parseInt(parts[1], 10) || 25565;
  }

  const status = await pingMinecraftServer(host, port, 3000);
  res.json({
    has_server: true,
    server_ip: serverIp,
    ...status
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

// Check client updates
router.get('/updates/check', (req, res) => {
  const currentVersion = (req.query.version || '1.0.0').trim().replace(/^v/i, '');
  const latest = db.getLatestUpdate();

  if (!latest) {
    return res.json({ has_update: false, current_version: currentVersion });
  }

  // Compare semantic versions (or fallback to string/int comparison)
  function isNewer(latestVer, currentVer) {
    const p1 = latestVer.split('.').map(n => parseInt(n, 10) || 0);
    const p2 = currentVer.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return false;
  }

  const hasUpdate = isNewer(latest.version, currentVersion);

  res.json({
    has_update: hasUpdate,
    current_version: currentVersion,
    latest_version: latest.version,
    notes: latest.notes || '',
    is_mandatory: !!latest.is_mandatory,
    download_url: latest.download_url,
    file_size: latest.file_size || 0,
    published_at: latest.created_at
  });
});

module.exports = router;
