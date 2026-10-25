const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const DB_FILE = path.join(config.DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

const DEFAULT_TOS = `# Términos y Condiciones de EsquizoStudios

Bienvenido a **EsquizoLauncher**, la plataforma oficial de eventos de **EsquizoStudios**.

Al utilizar este cliente y participar en nuestros eventos, aceptas de manera obligatoria y vinculante los siguientes términos:

### 1. Propiedad y Confidencialidad
El software, las modificaciones propietarias, los complementos, la identidad visual y los recursos de los eventos son propiedad exclusiva de **EsquizoStudios** y **NO** son de código abierto.
Queda estrictamente prohibida la descompilación, extracción, redistribución o filtración de cualquier archivo, mod o asset entregado a través del launcher.

### 2. Política de Recursos y Archivos de Eventos
Los recursos, modificaciones y complementos utilizados durante las partidas son suministrados por los servidores de **EsquizoStudios** para la ejecución exclusiva de las sesiones oficiales. Queda prohibida la extracción, redistribución o copia no autorizada de dichos elementos.
El incumplimiento resultará en el cese inmediato de acceso y la revocación de la participación en futuros eventos.

### 3. Conducta y Juego Limpio
- Está prohibido el uso de clientes modificados externos, hacks, macros o herramientas no autorizadas.
- Se prohíbe el uso de cuentas duplicadas o el intercambio no autorizado de códigos de acceso.
- La vinculación de Discord es obligatoria y única para jugadores offline para evitar suplantaciones.

### 4. Sanciones
La administración de EsquizoStudios se reserva el derecho de revocar el acceso al launcher, banear cuentas vinculadas y prohibir la participación en eventos futuros sin previo aviso ante el incumplimiento de estas normas.

*Última actualización: EsquizoStudios 2026*`;

const INITIAL_DATA = {
  instances: [],
  users: [],
  updates: [],
  staff: [
    // Pre-populate with default admin IDs if configured
    ...config.DISCORD.DEFAULT_ADMIN_IDS.map(id => ({
      discord_id: id,
      tag: 'Admin (' + id + ')',
      role: 'admin',
      added_at: new Date().toISOString()
    }))
  ],
  settings: {
    tos: DEFAULT_TOS,
    announcement: '¡Bienvenidos a EsquizoStudios! Prepara tu cliente para los próximos torneos y eventos exclusivos.',
    require_discord_for_offline: true
  }
};

class Database {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          instances: parsed.instances || [],
          users: parsed.users || [],
          updates: parsed.updates || [],
          staff: parsed.staff || INITIAL_DATA.staff,
          settings: { ...INITIAL_DATA.settings, ...(parsed.settings || {}) }
        };
      }
    } catch (err) {
      console.error('[DB] Error loading database file, initializing defaults:', err);
    }
    this.saveDirect(INITIAL_DATA);
    return JSON.parse(JSON.stringify(INITIAL_DATA));
  }

  save() {
    this.saveDirect(this.data);
  }

  saveDirect(data) {
    try {
      const tempPath = DB_FILE + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('[DB] Error saving database:', err);
    }
  }

  // --- INSTANCES ---

  generateAccessCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    let isUnique = false;

    while (!isUnique) {
      code = '';
      const bytes = crypto.randomBytes(18);
      for (let i = 0; i < 18; i++) {
        code += chars[bytes[i] % chars.length];
      }
      if (!this.data.instances.some(inst => inst.access_code === code)) {
        isUnique = true;
      }
    }
    return code;
  }

  getInstances() {
    return this.data.instances;
  }

  getInstanceById(id) {
    return this.data.instances.find(i => i.id === id);
  }

  getInstanceByCode(code) {
    if (!code) return null;
    return this.data.instances.find(i => i.access_code === code.trim());
  }

  saveInstance(instanceData) {
    const existingIndex = this.data.instances.findIndex(i => i.id === instanceData.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      this.data.instances[existingIndex] = {
        ...this.data.instances[existingIndex],
        ...instanceData,
        updated_at: now
      };
      this.save();
      return this.data.instances[existingIndex];
    } else {
      if (!instanceData.access_code) {
        instanceData.access_code = this.generateAccessCode();
      }
      const newInst = {
        ...instanceData,
        created_at: now,
        updated_at: now
      };
      this.data.instances.push(newInst);
      this.save();
      return newInst;
    }
  }

  deleteInstance(id) {
    const prevLen = this.data.instances.length;
    this.data.instances = this.data.instances.filter(i => i.id !== id);
    if (this.data.instances.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }

  regenerateInstanceCode(id) {
    const inst = this.getInstanceById(id);
    if (!inst) return null;
    inst.access_code = this.generateAccessCode();
    inst.updated_at = new Date().toISOString();
    this.save();
    return inst.access_code;
  }

  // --- USERS & DISCORD LINKING ---

  getUsers() {
    return this.data.users;
  }

  getUserByUsername(username) {
    if (!username) return null;
    const clean = username.trim().toLowerCase();
    return this.data.users.find(u => u.username.toLowerCase() === clean);
  }

  getUserByDiscordId(discordId) {
    if (!discordId) return null;
    return this.data.users.find(u => u.discord_id === discordId);
  }

  registerOrUpdateUser({ username, type, discord_id, discord_username, discord_avatar }) {
    const existing = this.getUserByUsername(username);
    const now = new Date().toISOString();

    if (existing) {
      existing.type = type || existing.type;
      if (discord_id !== undefined) existing.discord_id = discord_id;
      if (discord_username !== undefined) existing.discord_username = discord_username;
      if (discord_avatar !== undefined) existing.discord_avatar = discord_avatar;
      existing.last_login = now;
      this.save();
      return existing;
    } else {
      const newUser = {
        id: crypto.randomUUID(),
        username: username.trim(),
        type: type || 'offline',
        discord_id: discord_id || null,
        discord_username: discord_username || null,
        discord_avatar: discord_avatar || null,
        is_banned: false,
        ban_reason: null,
        created_at: now,
        last_login: now
      };
      this.data.users.push(newUser);
      this.save();
      return newUser;
    }
  }

  unlinkDiscord(username) {
    const user = this.getUserByUsername(username);
    if (!user) return { success: false, message: 'Usuario no encontrado' };
    user.discord_id = null;
    user.discord_username = null;
    user.discord_avatar = null;
    this.save();
    return { success: true, user };
  }

  setUserBan(username, isBanned, reason = null) {
    const user = this.getUserByUsername(username);
    if (!user) return null;
    user.is_banned = !!isBanned;
    user.ban_reason = isBanned ? (reason || 'Sancionado por la administración') : null;
    this.save();
    return user;
  }

  // --- STAFF / ADMIN WHITELIST ---

  getStaff() {
    return this.data.staff;
  }

  isStaff(discordId) {
    if (!discordId) return false;
    const clean = String(discordId).trim();
    // Check database staff list
    if (this.data.staff.some(s => s.discord_id === clean)) return true;
    // Check config.DEFAULT_ADMIN_IDS directly from .env
    if (config.DISCORD.DEFAULT_ADMIN_IDS.includes(clean)) return true;
    // Auto-whitelist first user if staff list is completely empty
    if (this.data.staff.length === 0) return true;
    return false;
  }

  addStaff(discordId, tag, role = 'moderator') {
    const cleanId = String(discordId).trim();
    if (!cleanId) return null;
    const existing = this.data.staff.find(s => s.discord_id === cleanId);
    if (existing) {
      existing.tag = tag || existing.tag;
      existing.role = role || existing.role;
      this.save();
      return existing;
    }
    const newStaff = {
      discord_id: cleanId,
      tag: tag || 'Staff (' + cleanId + ')',
      role: role || 'moderator',
      added_at: new Date().toISOString()
    };
    this.data.staff.push(newStaff);
    this.save();
    return newStaff;
  }

  removeStaff(discordId) {
    const cleanId = String(discordId).trim();
    const prev = this.data.staff.length;
    this.data.staff = this.data.staff.filter(s => s.discord_id !== cleanId);
    if (this.data.staff.length !== prev) {
      this.save();
      return true;
    }
    return false;
  }

  // --- SETTINGS ---

  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }

  // --- CLIENT UPDATES MANAGEMENT ---

  getUpdates() {
    if (!this.data.updates) this.data.updates = [];
    return this.data.updates;
  }

  getLatestUpdate() {
    const list = this.getUpdates();
    if (list.length === 0) return null;
    return list[0]; // First element is latest
  }

  saveUpdate(updateData) {
    if (!this.data.updates) this.data.updates = [];
    const index = this.data.updates.findIndex(u => u.version === updateData.version);
    if (index >= 0) {
      this.data.updates[index] = { ...this.data.updates[index], ...updateData, updated_at: new Date().toISOString() };
    } else {
      this.data.updates.unshift({
        id: crypto.randomUUID(),
        ...updateData,
        created_at: new Date().toISOString()
      });
    }
    this.save();
    return this.data.updates.find(u => u.version === updateData.version);
  }

  deleteUpdate(id) {
    if (!this.data.updates) return false;
    const initial = this.data.updates.length;
    this.data.updates = this.data.updates.filter(u => u.id !== id);
    if (this.data.updates.length !== initial) {
      this.save();
      return true;
    }
    return false;
  }
}

module.exports = new Database();
