const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const config = require('../config');
const db = require('../db');
const { processMrpack, packInstanceToMrpack } = require('../mrpack');
const { sendDiscordAdminWebhook } = require('../webhook');

// Storage engine for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(config.DATA_DIR, 'tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 } // 300MB max for modpacks
});

// Auth Guard Middleware: Only authenticated staff can use these endpoints
function requireStaff(req, res, next) {
  if (!req.session || !req.session.staffUser || !db.isStaff(req.session.staffUser.id)) {
    return res.status(403).json({ error: 'Acceso no autorizado al panel administrativo' });
  }
  next();
}

router.use(requireStaff);

// --- INSTANCE MANAGEMENT ---

// List all instances with their access codes
router.get('/api/instances', (req, res) => {
  res.json({ instances: db.getInstances() });
});

// Create new instance
router.post(
  '/api/instances',
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'mrpack', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { id, name, description, server_ip, expires_at, max_uses } = req.body;

      if (!id || !name) {
        return res.status(400).json({ error: 'El ID y el nombre público son obligatorios.' });
      }

      // ID VALIDATION RULE: strictly lowercase letters only (no numbers, uppercase, spaces, symbols)
      const cleanId = id.trim();
      const idRegex = /^[a-z]+$/;
      if (!idRegex.test(cleanId)) {
        return res.status(400).json({
          error: 'Formato de ID inválido: Solo se permiten letras minúsculas (sin números, mayúsculas, espacios ni símbolos).'
        });
      }

      // Check if instance already exists
      if (db.getInstanceById(cleanId)) {
        return res.status(400).json({ error: `La instancia con ID '${cleanId}' ya existe.` });
      }

      // Target directory for this instance
      const instanceDir = path.join(config.INSTANCES_DIR, cleanId);
      if (!fs.existsSync(instanceDir)) {
        fs.mkdirSync(instanceDir, { recursive: true });
      }

      let logoUrl = null;
      let bannerUrl = null;

      // Handle logo
      if (req.files['logo'] && req.files['logo'][0]) {
        const logoFile = req.files['logo'][0];
        const destName = 'logo' + path.extname(logoFile.originalname);
        const destPath = path.join(instanceDir, destName);
        fs.copyFileSync(logoFile.path, destPath);
        fs.unlinkSync(logoFile.path);
        logoUrl = `/uploads/instances/${cleanId}/${destName}`;
      }

      // Handle banner
      if (req.files['banner'] && req.files['banner'][0]) {
        const bannerFile = req.files['banner'][0];
        const destName = 'banner' + path.extname(bannerFile.originalname);
        const destPath = path.join(instanceDir, destName);
        fs.copyFileSync(bannerFile.path, destPath);
        fs.unlinkSync(bannerFile.path);
        bannerUrl = `/uploads/instances/${cleanId}/${destName}`;
      }

      // Handle .mrpack file
      let manifestData = null;
      if (req.files['mrpack'] && req.files['mrpack'][0]) {
        const mrpackFile = req.files['mrpack'][0];
        try {
          manifestData = processMrpack(mrpackFile.path, instanceDir);
          fs.copyFileSync(mrpackFile.path, path.join(instanceDir, 'modpack.mrpack'));
        } finally {
          if (fs.existsSync(mrpackFile.path)) {
            fs.unlinkSync(mrpackFile.path);
          }
        }
      }

      // Auto-generate 18-character access code
      const accessCode = db.generateAccessCode();

      const newInstance = db.saveInstance({
        id: cleanId,
        name: name.trim(),
        description: (description || '').trim(),
        server_ip: (server_ip || '').trim(),
        expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        max_uses: max_uses ? parseInt(max_uses, 10) : null,
        logo: logoUrl,
        banner: bannerUrl,
        access_code: accessCode,
        mc_version: manifestData ? manifestData.mc_version : '1.20.1',
        loader: manifestData ? manifestData.loader : { type: 'fabric', version: 'latest' },
        stats: manifestData ? manifestData.stats : { total_files: 0, total_mods: 0, total_size: 0 }
      });

      sendDiscordAdminWebhook({
        title: '✨ Nueva Instancia Creada',
        description: `Se ha configurado y registrado una nueva instancia para eventos.`,
        color: 0x10b981, // Verde
        fields: [
          { name: 'Instancia', value: `**${newInstance.name}** (\`${newInstance.id}\`)`, inline: true },
          { name: 'Código de Acceso', value: `\`${newInstance.access_code}\``, inline: true },
          { name: 'Staff', value: req.session.staffUser ? `@${req.session.staffUser.username}` : 'Admin', inline: true },
          { name: 'IP del Servidor', value: newInstance.server_ip || 'No asignada', inline: true },
          { name: 'Límite de Usos', value: newInstance.max_uses ? `${newInstance.max_uses} jugadores` : 'Ilimitado', inline: true }
        ]
      });

      res.status(201).json({
        success: true,
        instance: newInstance,
        message: 'Instancia creada exitosamente'
      });
    } catch (err) {
      console.error('[Admin Create Instance Error]', err);
      res.status(500).json({ error: 'Error al procesar y crear la instancia: ' + err.message });
    }
  }
);

// Update instance
router.put(
  '/api/instances/:id',
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'mrpack', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const inst = db.getInstanceById(id);
      if (!inst) {
        return res.status(404).json({ error: 'Instancia no encontrada' });
      }

      const { name, description, server_ip, expires_at, max_uses } = req.body;
      const instanceDir = path.join(config.INSTANCES_DIR, id);

      if (name) inst.name = name.trim();
      if (description !== undefined) inst.description = description.trim();
      if (server_ip !== undefined) inst.server_ip = server_ip.trim();
      if (expires_at !== undefined) inst.expires_at = expires_at ? new Date(expires_at).toISOString() : null;
      if (max_uses !== undefined) inst.max_uses = max_uses ? parseInt(max_uses, 10) : null;

      if (req.files['logo'] && req.files['logo'][0]) {
        const logoFile = req.files['logo'][0];
        const destName = 'logo' + path.extname(logoFile.originalname);
        const destPath = path.join(instanceDir, destName);
        fs.copyFileSync(logoFile.path, destPath);
        fs.unlinkSync(logoFile.path);
        inst.logo = `/uploads/instances/${id}/${destName}?t=${Date.now()}`;
      }

      if (req.files['banner'] && req.files['banner'][0]) {
        const bannerFile = req.files['banner'][0];
        const destName = 'banner' + path.extname(bannerFile.originalname);
        const destPath = path.join(instanceDir, destName);
        fs.copyFileSync(bannerFile.path, destPath);
        fs.unlinkSync(bannerFile.path);
        inst.banner = `/uploads/instances/${id}/${destName}?t=${Date.now()}`;
      }

      if (req.files['mrpack'] && req.files['mrpack'][0]) {
        const mrpackFile = req.files['mrpack'][0];
        try {
          const manifestData = processMrpack(mrpackFile.path, instanceDir);
          fs.copyFileSync(mrpackFile.path, path.join(instanceDir, 'modpack.mrpack'));
          inst.mc_version = manifestData.mc_version;
          inst.loader = manifestData.loader;
          inst.stats = manifestData.stats;
        } finally {
          if (fs.existsSync(mrpackFile.path)) {
            fs.unlinkSync(mrpackFile.path);
          }
        }
      }

      const updated = db.saveInstance(inst);
      res.json({ success: true, instance: updated });
    } catch (err) {
      console.error('[Admin Update Instance Error]', err);
      res.status(500).json({ error: 'Error al actualizar instancia: ' + err.message });
    }
  }
);

// Download .mrpack for instance
router.get('/api/instances/:id/download-mrpack', (req, res) => {
  try {
    const { id } = req.params;
    const instance = db.getInstanceById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Instancia no encontrada' });
    }

    const instanceDir = path.join(config.INSTANCES_DIR, id);
    if (!fs.existsSync(instanceDir)) {
      return res.status(404).json({ error: 'Directorio de instancia no encontrado' });
    }

    const mrpackFile = path.join(instanceDir, 'modpack.mrpack');
    if (fs.existsSync(mrpackFile)) {
      return res.download(mrpackFile, `${instance.id}.mrpack`);
    }

    // Generate .mrpack dynamically from manifest.json and overrides
    const buffer = packInstanceToMrpack(instanceDir);
    res.setHeader('Content-Type', 'application/x-modrinth-modpack+zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(instance.id)}.mrpack"`);
    res.send(buffer);
  } catch (err) {
    console.error('[Download Mrpack Error]', err);
    res.status(500).json({ error: 'Error al generar la descarga del .mrpack: ' + err.message });
  }
});

// Regenerate 18-char access code
router.post('/api/instances/:id/regenerate-code', (req, res) => {
  const { id } = req.params;
  const newCode = db.regenerateInstanceCode(id);
  if (!newCode) {
    return res.status(404).json({ error: 'Instancia no encontrada' });
  }
  res.json({ success: true, access_code: newCode });
});

// Delete instance
router.delete('/api/instances/:id', (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteInstance(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Instancia no encontrada' });
  }

  // Remove instance files
  const instanceDir = path.join(config.INSTANCES_DIR, id);
  if (fs.existsSync(instanceDir)) {
    fs.rmSync(instanceDir, { recursive: true, force: true });
  }

  res.json({ success: true, message: 'Instancia eliminada correctamente' });
});

// --- USER MANAGEMENT ---

router.get('/api/users', (req, res) => {
  res.json({ users: db.getUsers() });
});

router.post('/api/users/:username/ban', (req, res) => {
  const { username } = req.params;
  const { reason } = req.body;
  const user = db.setUserBan(username, true, reason);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  sendDiscordAdminWebhook({
    title: '🚨 Usuario Sancionado (Baneado)',
    description: `Un jugador ha recibido una sanción administrativa en EsquizoLauncher.`,
    color: 0xef4444, // Rojo
    fields: [
      { name: 'Jugador', value: `\`${user.username}\``, inline: true },
      { name: 'Discord ID', value: user.discord_id ? `\`${user.discord_id}\`` : 'N/A', inline: true },
      { name: 'Staff Ejecutor', value: req.session.staffUser ? `@${req.session.staffUser.username}` : 'Admin', inline: true },
      { name: 'Motivo', value: user.ban_reason || 'Infracción a los términos de servicio' }
    ]
  });

  res.json({ success: true, user });
});

router.post('/api/users/:username/unban', (req, res) => {
  const { username } = req.params;
  const user = db.setUserBan(username, false);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ success: true, user });
});

router.post('/api/users/:username/unlink-discord', (req, res) => {
  const { username } = req.params;
  const result = db.unlinkDiscord(username);
  if (!result.success) return res.status(404).json(result);
  res.json(result);
});

// --- STAFF WHITELIST MANAGEMENT ---

router.get('/api/staff', (req, res) => {
  res.json({ staff: db.getStaff() });
});

router.post('/api/staff', (req, res) => {
  const { discord_id, tag, role } = req.body;
  if (!discord_id) return res.status(400).json({ error: 'El Discord ID es requerido' });

  const cleanId = String(discord_id).trim();
  const staff = db.addStaff(cleanId, tag, role || 'moderator');
  res.status(201).json({ success: true, staff });
});

router.delete('/api/staff/:discord_id', (req, res) => {
  const { discord_id } = req.params;
  // Prevent removing own access if desired
  if (req.session.staffUser.id === discord_id) {
    return res.status(400).json({ error: 'No puedes revocar tus propios permisos administrativos.' });
  }
  const removed = db.removeStaff(discord_id);
  if (!removed) return res.status(404).json({ error: 'Staff no encontrado' });
  res.json({ success: true, message: 'Permiso revocado exitosamente' });
});

// --- SETTINGS MANAGEMENT ---

router.get('/api/settings', (req, res) => {
  res.json({ settings: db.getSettings() });
});

router.put('/api/settings', (req, res) => {
  const { tos, announcement, discord_webhook_url } = req.body;
  const updated = db.updateSettings({ tos, announcement, discord_webhook_url });
  res.json({ success: true, settings: updated });
});

// --- CLIENT UPDATES MANAGEMENT ---

router.get('/api/updates', (req, res) => {
  res.json({ updates: db.getUpdates() });
});

router.post(
  '/api/updates',
  upload.fields([{ name: 'installer', maxCount: 1 }]),
  (req, res) => {
    try {
      const { version, notes, is_mandatory } = req.body;

      if (!version || !version.trim()) {
        return res.status(400).json({ error: 'La versión (ej: 1.0.1) es obligatoria.' });
      }

      const cleanVersion = version.trim().replace(/^v/i, '');
      const updatesDir = config.UPDATES_DIR;
      if (!fs.existsSync(updatesDir)) {
        fs.mkdirSync(updatesDir, { recursive: true });
      }

      let filename = null;
      let downloadUrl = null;
      let fileSize = 0;

      if (req.files['installer'] && req.files['installer'][0]) {
        const file = req.files['installer'][0];
        filename = `EsquizoLauncher-Setup-${cleanVersion}${path.extname(file.originalname) || '.exe'}`;
        const destPath = path.join(updatesDir, filename);
        fs.copyFileSync(file.path, destPath);
        fs.unlinkSync(file.path);
        fileSize = fs.statSync(destPath).size;
        downloadUrl = `/uploads/updates/${filename}`;
      } else {
        return res.status(400).json({ error: 'Debes adjuntar el archivo instalador (.exe).' });
      }

      const saved = db.saveUpdate({
        version: cleanVersion,
        notes: (notes || '').trim(),
        is_mandatory: is_mandatory === 'true' || is_mandatory === true,
        filename,
        download_url: downloadUrl,
        file_size: fileSize
      });

      sendDiscordAdminWebhook({
        title: '🚀 Nueva Actualización de EsquizoLauncher',
        description: `Se ha publicado una nueva versión del launcher en los servidores oficiales.`,
        color: 0x3b82f6, // Azul
        fields: [
          { name: 'Versión', value: `\`v${cleanVersion}\``, inline: true },
          { name: 'Tipo', value: saved.is_mandatory ? '🚨 **Obligatoria**' : 'Opcional', inline: true },
          { name: 'Tamaño', value: `${(fileSize / (1024 * 1024)).toFixed(1)} MB`, inline: true },
          { name: 'Notas', value: saved.notes || 'Mejoras y estabilidad' }
        ]
      });

      res.status(201).json({
        success: true,
        update: saved,
        message: `Versión ${cleanVersion} publicada con éxito`
      });
    } catch (err) {
      console.error('[Admin Upload Update Error]', err);
      res.status(500).json({ error: 'Error al publicar actualización: ' + err.message });
    }
  }
);

router.delete('/api/updates/:id', (req, res) => {
  const { id } = req.params;
  const list = db.getUpdates();
  const target = list.find(u => u.id === id);

  if (target && target.filename) {
    const filePath = path.join(config.UPDATES_DIR, target.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
  }

  const deleted = db.deleteUpdate(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Actualización no encontrada' });
  }

  res.json({ success: true, message: 'Actualización eliminada' });
});

// --- METRICS & REALTIME ANALYTICS ---

router.get('/api/analytics', (req, res) => {
  res.json({
    success: true,
    data: db.getMetricsSummary()
  });
});

// --- BROADCAST POP-UP ALERTS ---

router.get('/api/broadcast', (req, res) => {
  res.json({
    success: true,
    broadcast: db.getActiveBroadcast()
  });
});

router.post('/api/broadcast', (req, res) => {
  const { title, message, type, expires_in_minutes } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'El mensaje de la alerta es obligatorio.' });
  }

  const broadcast = db.setBroadcast({
    title: title ? title.trim() : 'Aviso Oficial de EsquizoStudios',
    message: message.trim(),
    type: type || 'info',
    expires_in_minutes: parseInt(expires_in_minutes, 10) || 60
  });

  sendDiscordAdminWebhook({
    title: '📢 Alerta Global Emitida',
    description: `Se ha difundido un pop-up oficial en tiempo real a todos los clientes conectados.`,
    color: broadcast.type === 'urgent' ? 0xef4444 : (broadcast.type === 'warning' ? 0xf59e0b : 0x3b82f6),
    fields: [
      { name: 'Título', value: broadcast.title, inline: true },
      { name: 'Tipo', value: broadcast.type.toUpperCase(), inline: true },
      { name: 'Caducidad', value: `${expires_in_minutes || 60} minutos`, inline: true },
      { name: 'Contenido', value: broadcast.message }
    ]
  });

  res.json({ success: true, broadcast });
});

router.delete('/api/broadcast', (req, res) => {
  db.clearBroadcast();
  res.json({ success: true, message: 'Alerta pop-up retirada con éxito' });
});

module.exports = router;
