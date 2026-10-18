const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const config = require('../config');
const db = require('../db');
const { processMrpack } = require('../mrpack');

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
      const { id, name, description } = req.body;

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
        logo: logoUrl,
        banner: bannerUrl,
        access_code: accessCode,
        mc_version: manifestData ? manifestData.mc_version : '1.20.1',
        loader: manifestData ? manifestData.loader : { type: 'fabric', version: 'latest' },
        stats: manifestData ? manifestData.stats : { total_files: 0, total_mods: 0, total_size: 0 }
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

      const { name, description } = req.body;
      const instanceDir = path.join(config.INSTANCES_DIR, id);

      if (name) inst.name = name.trim();
      if (description !== undefined) inst.description = description.trim();

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
  const { tos, announcement } = req.body;
  const updated = db.updateSettings({ tos, announcement });
  res.json({ success: true, settings: updated });
});

module.exports = router;
