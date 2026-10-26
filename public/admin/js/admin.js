let currentStaff = null;
let allUsers = [];

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupNavigation();
  setupDropzone();
});

// Auth Verification
async function checkAuth() {
  try {
    const res = await fetch('/auth/me');
    const data = await res.json();

    if (data.authenticated && data.user) {
      currentStaff = data.user;
      document.getElementById('login-overlay').style.display = 'none';
      document.getElementById('admin-app').style.display = 'flex';

      document.getElementById('staff-username').textContent = currentStaff.username;
      document.getElementById('staff-role').textContent = currentStaff.role || 'Staff';

      if (currentStaff.avatar) {
        document.getElementById('staff-avatar').innerHTML = `
          <img src="https://cdn.discordapp.com/avatars/${currentStaff.id}/${currentStaff.avatar}.png" alt="Avatar">
        `;
      } else {
        document.getElementById('staff-avatar').textContent = currentStaff.username.slice(0, 2).toUpperCase();
      }

      // Load initial tab data
      loadInstances();
    } else {
      document.getElementById('login-overlay').style.display = 'flex';
      document.getElementById('admin-app').style.display = 'none';
    }
  } catch (err) {
    console.error('Error checking auth:', err);
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('admin-app').style.display = 'none';
  }
}

// Navigation Tabs
function setupNavigation() {
  const buttons = document.querySelectorAll('.nav-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      // Update button active state
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content tab active state
      document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
      const activeTab = document.getElementById(`tab-${tabName}`);
      if (activeTab) activeTab.classList.add('active');

      // Refresh tab data
      if (tabName === 'instances') loadInstances();
      else if (tabName === 'users') loadUsers();
      else if (tabName === 'staff') loadStaff();
      else if (tabName === 'settings') loadSettings();
      else if (tabName === 'updates') loadUpdates();
      else if (tabName === 'analytics') loadAnalytics();
      else if (tabName === 'broadcasts') loadBroadcasts();
    });
  });
}

// Toast notification helper
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--primary)';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

// --- INSTANCE MANAGEMENT ---

async function loadInstances() {
  const container = document.getElementById('instances-container');
  container.innerHTML = '<p style="color:var(--text-muted)">Cargando instancias...</p>';

  try {
    const res = await fetch('/admin/api/instances');
    const data = await res.json();
    const instances = data.instances || [];

    if (instances.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: 14px; border: 1px dashed var(--border-subtle);">
          <p style="color: var(--text-secondary); margin-bottom: 16px;">No hay instancias creadas todavía.</p>
          <button class="btn btn-primary" onclick="openCreateInstanceModal()">Crear Primera Instancia</button>
        </div>
      `;
      return;
    }

    container.innerHTML = instances.map(inst => `
      <div class="instance-card">
        <div class="inst-banner-preview" style="${inst.banner ? `background-image: url('${inst.banner}')` : ''}">
          <img class="inst-logo-preview" src="${inst.logo || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23a855f7\' stroke-width=\'2\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\'/></svg>'}" alt="Logo">
        </div>

        <div class="inst-content">
          <div class="inst-title-row">
            <h3 class="inst-title">${escapeHtml(inst.name)}</h3>
            <span class="inst-id-badge" title="ID Privado">${inst.id}</span>
          </div>

          <p class="inst-desc">${escapeHtml(inst.description || 'Sin descripción.')}</p>

          <div class="inst-meta">
            <span class="meta-pill">MC ${inst.mc_version || '1.20.1'}</span>
            <span class="meta-pill">${(inst.loader?.type || 'fabric').toUpperCase()} ${inst.loader?.version || ''}</span>
            <span class="meta-pill">${inst.stats?.total_mods || 0} mods</span>
            ${inst.server_ip ? `<span class="meta-pill" style="color:var(--accent-cyan); border-color:rgba(6,182,212,0.3);">🌐 ${escapeHtml(inst.server_ip)}</span>` : ''}
            ${inst.max_uses ? `<span class="meta-pill" style="color:#a855f7;">👥 ${inst.claimed_count || 0}/${inst.max_uses} cupos</span>` : ''}
            ${inst.expires_at ? `<span class="meta-pill" style="color:#f59e0b;">⏳ Vence: ${new Date(inst.expires_at).toLocaleDateString()}</span>` : ''}
          </div>

          <!-- 18-CHAR UNIQUE ACCESS CODE -->
          <div class="code-box">
            <div>
              <div class="code-label">Código Único (18 chars)</div>
              <div class="code-value">${inst.access_code}</div>
            </div>
            <button class="btn-copy" onclick="copyAccessCode('${inst.access_code}')">Copiar</button>
          </div>

          <div class="inst-actions">
            <button class="btn btn-secondary btn-sm" onclick='openEditInstanceModal(${JSON.stringify({
              id: inst.id,
              name: inst.name,
              description: inst.description || "",
              server_ip: inst.server_ip || "",
              expires_at: inst.expires_at || "",
              max_uses: inst.max_uses || ""
            })})' title="Actualizar nombre, descripción, servidor o .mrpack">
              Editar
            </button>
            <a href="/admin/api/instances/${inst.id}/download-mrpack" class="btn btn-secondary btn-sm" style="text-decoration:none;" title="Descargar paquete .mrpack de esta instancia">
              Descargar .mrpack
            </a>
            <button class="btn btn-secondary btn-sm" onclick="regenerateCode('${inst.id}')" title="Generar nuevo código de acceso de 18 caracteres">
              Regenerar Código
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteInstance('${inst.id}', '${escapeHtml(inst.name)}')">
              Eliminar
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading instances:', err);
    container.innerHTML = '<p style="color:var(--danger)">Error al cargar instancias.</p>';
  }
}

function copyAccessCode(code) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(code).then(() => {
      showToast(`Código copiado al portapapeles: ${code}`);
    }).catch(() => {
      fallbackCopy(code);
    });
  } else {
    fallbackCopy(code);
  }
}

function fallbackCopy(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(`Código copiado: ${text}`);
  } catch (err) {
    prompt('Copia manualmente el código de acceso:', text);
  }
  document.body.removeChild(textArea);
}

async function regenerateCode(id) {
  if (!confirm(`¿Regenerar el código de acceso para la instancia '${id}'? Los clientes que usen el código anterior no podrán registrarla nuevamente.`)) {
    return;
  }
  try {
    const res = await fetch(`/admin/api/instances/${id}/regenerate-code`, { credentials: 'include', method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Nuevo código generado: ${data.access_code}`);
      loadInstances();
    } else {
      showToast(data.error || 'Error al regenerar código', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

async function deleteInstance(id, name) {
  if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente la instancia '${name}' (ID: ${id})? Esta acción no se puede deshacer.`)) {
    return;
  }
  try {
    const res = await fetch(`/admin/api/instances/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Instancia eliminada correctamente');
      loadInstances();
    } else {
      showToast(data.error || 'Error al eliminar instancia', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

function openCreateInstanceModal() {
  document.getElementById('modal-instance-title').textContent = 'Crear Nueva Instancia';
  document.getElementById('instance-form').reset();
  document.getElementById('inst-id').disabled = false;
  document.getElementById('inst-id').required = true;
  document.getElementById('instance-is-edit').value = 'false';
  document.getElementById('mrpack-filename').style.display = 'none';
  // Reset extra fields
  document.getElementById('inst-server-ip').value = '';
  document.getElementById('inst-expires-at').value = '';
  document.getElementById('inst-max-uses').value = '';
  // Hide mrpack required hint when creating
  document.getElementById('inst-mrpack').required = true;
  document.getElementById('btn-modal-download-mrpack').style.display = 'none';
  document.getElementById('btn-save-instance').textContent = 'Procesar y Guardar';
  openModal('instance-modal');
}

function openEditInstanceModal(inst) {
  document.getElementById('modal-instance-title').textContent = 'Editar Instancia: ' + escapeHtml(inst.name);
  document.getElementById('instance-form').reset();

  // Populate existing values
  document.getElementById('inst-id').value = inst.id;
  document.getElementById('inst-id').disabled = true;
  document.getElementById('inst-id').required = false;
  document.getElementById('inst-name').value = inst.name || '';
  document.getElementById('inst-desc').value = inst.description || '';
  document.getElementById('inst-server-ip').value = inst.server_ip || '';
  document.getElementById('inst-expires-at').value = inst.expires_at ? inst.expires_at.split('T')[0] : '';
  document.getElementById('inst-max-uses').value = inst.max_uses || '';

  // In edit mode mrpack is optional (only re-upload if you want to update it)
  document.getElementById('inst-mrpack').required = false;

  const dlBtn = document.getElementById('btn-modal-download-mrpack');
  if (dlBtn) {
    dlBtn.href = `/admin/api/instances/${inst.id}/download-mrpack`;
    dlBtn.style.display = 'inline-flex';
  }

  document.getElementById('instance-is-edit').value = 'true';
  document.getElementById('mrpack-filename').style.display = 'none';
  document.getElementById('btn-save-instance').textContent = 'Guardar Cambios';
  openModal('instance-modal');
}

function setupDropzone() {
  const mrpackInput = document.getElementById('inst-mrpack');
  const preview = document.getElementById('mrpack-filename');
  mrpackInput.addEventListener('change', () => {
    if (mrpackInput.files.length > 0) {
      preview.textContent = 'Archivo seleccionado: ' + mrpackInput.files[0].name;
      preview.style.display = 'inline-block';
    } else {
      preview.style.display = 'none';
    }
  });
}

async function handleInstanceSubmit(e) {
  e.preventDefault();

  const isEdit = document.getElementById('instance-is-edit').value === 'true';
  const idInput = document.getElementById('inst-id');
  const idVal = idInput.value.trim();

  // Only validate ID format when creating (edit uses existing ID)
  if (!isEdit && !/^[a-z]+$/.test(idVal)) {
    showToast('El ID solo debe contener letras minúsculas (sin números, mayúsculas ni espacios)', true);
    idInput.focus();
    return;
  }

  const formData = new FormData();
  if (!isEdit) formData.append('id', idVal);
  formData.append('name', document.getElementById('inst-name').value.trim());
  formData.append('description', document.getElementById('inst-desc').value.trim());
  formData.append('server_ip', document.getElementById('inst-server-ip').value.trim());
  formData.append('expires_at', document.getElementById('inst-expires-at').value);
  formData.append('max_uses', document.getElementById('inst-max-uses').value);

  const logoFile = document.getElementById('inst-logo').files[0];
  if (logoFile) formData.append('logo', logoFile);

  const bannerFile = document.getElementById('inst-banner').files[0];
  if (bannerFile) formData.append('banner', bannerFile);

  const mrpackFile = document.getElementById('inst-mrpack').files[0];
  if (mrpackFile) formData.append('mrpack', mrpackFile);

  const saveBtn = document.getElementById('btn-save-instance');
  saveBtn.disabled = true;
  saveBtn.textContent = isEdit ? 'Guardando cambios...' : 'Procesando .mrpack...';

  try {
    let res, data;
    if (isEdit) {
      // PUT — update existing instance
      res = await fetch(`/admin/api/instances/${encodeURIComponent(idVal)}`, {
        method: 'PUT',
        body: formData
      });
      data = await res.json();
      if (data.success) {
        showToast('¡Instancia actualizada correctamente!');
        closeModal('instance-modal');
        loadInstances();
      } else {
        showToast(data.error || 'Error al actualizar instancia', true);
      }
    } else {
      // POST — create new instance
      res = await fetch('/admin/api/instances', {
        method: 'POST',
        body: formData
      });
      data = await res.json();
      if (data.success) {
        showToast(`¡Instancia creada con éxito! Código: ${data.instance.access_code}`);
        closeModal('instance-modal');
        loadInstances();
      } else {
        showToast(data.error || 'Error al procesar instancia', true);
      }
    }
  } catch (err) {
    showToast('Error de red al subir archivos', true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = isEdit ? 'Guardar Cambios' : 'Procesar y Guardar';
  }
}

// --- USER MANAGEMENT ---

async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Cargando usuarios...</td></tr>';

  try {
    const res = await fetch('/admin/api/users');
    const data = await res.json();
    allUsers = data.users || [];
    renderUsersTable(allUsers);
  } catch (err) {
    console.error('Error loading users:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger)">Error al cargar lista de usuarios.</td></tr>';
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px;">No hay usuarios registrados todavía.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>
        <span class="badge-status ${u.type === 'microsoft' ? 'badge-microsoft' : 'badge-offline'}">
          ${u.type === 'microsoft' ? 'Microsoft Premium' : 'Offline'}
        </span>
      </td>
      <td>
        ${u.discord_username ? `
          <span style="color:#818cf8; font-weight:600;">@${escapeHtml(u.discord_username)}</span>
        ` : '<span style="color:var(--text-muted)">No vinculado</span>'}
      </td>
      <td><code style="color:var(--text-secondary)">${u.discord_id || '-'}</code></td>
      <td>${u.last_login ? new Date(u.last_login).toLocaleString() : 'Nunca'}</td>
      <td>
        <span class="badge-status ${u.is_banned ? 'badge-banned' : 'badge-active'}">
          ${u.is_banned ? 'Baneado' : 'Activo'}
        </span>
        ${u.is_banned && u.ban_reason ? `<br><small style="color:#f87171">${escapeHtml(u.ban_reason)}</small>` : ''}
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          ${u.is_banned ? `
            <button class="btn btn-secondary btn-sm" onclick="unbanUser('${escapeHtml(u.username)}')">Desbanear</button>
          ` : `
            <button class="btn btn-danger btn-sm" onclick="banUser('${escapeHtml(u.username)}')">Banear</button>
          `}
          ${u.discord_id ? `
            <button class="btn btn-secondary btn-sm" onclick="adminUnlinkDiscord('${escapeHtml(u.username)}')">Desvincular Discord</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function filterUsers() {
  const term = document.getElementById('user-search').value.toLowerCase().trim();
  if (!term) {
    renderUsersTable(allUsers);
    return;
  }
  const filtered = allUsers.filter(u =>
    u.username.toLowerCase().includes(term) ||
    (u.discord_id && u.discord_id.includes(term)) ||
    (u.discord_username && u.discord_username.toLowerCase().includes(term))
  );
  renderUsersTable(filtered);
}

async function banUser(username) {
  const reason = prompt(`Motivo de la sanción para '${username}':`, 'Infracción de normas del evento');
  if (reason === null) return;

  try {
    const res = await fetch(`/admin/api/users/${encodeURIComponent(username)}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Usuario '${username}' sancionado.`);
      loadUsers();
    } else {
      showToast(data.error || 'Error al sancionar', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

async function unbanUser(username) {
  try {
    const res = await fetch(`/admin/api/users/${encodeURIComponent(username)}/unban`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Sanción removida para '${username}'.`);
      loadUsers();
    } else {
      showToast(data.error || 'Error al desbanear', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

async function adminUnlinkDiscord(username) {
  if (!confirm(`¿Desvincular la cuenta de Discord de '${username}'?`)) return;

  try {
    const res = await fetch(`/admin/api/users/${encodeURIComponent(username)}/unlink-discord`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Discord desvinculado.');
      loadUsers();
    } else {
      showToast(data.error || 'Error al desvincular', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

// --- STAFF MANAGEMENT ---

async function loadStaff() {
  const tbody = document.getElementById('staff-table-body');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Cargando lista de staff...</td></tr>';

  try {
    const res = await fetch('/admin/api/staff');
    const data = await res.json();
    const staffList = data.staff || [];

    if (staffList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px;">No hay miembros registrados en la whitelist.</td></tr>';
      return;
    }

    tbody.innerHTML = staffList.map(s => `
      <tr>
        <td><code>${s.discord_id}</code></td>
        <td><strong>${escapeHtml(s.tag || 'Staff')}</strong></td>
        <td>
          <span class="role-badge">${s.role === 'admin' ? 'Administrador' : 'Moderador'}</span>
        </td>
        <td>${s.added_at ? new Date(s.added_at).toLocaleDateString() : '-'}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="removeStaff('${s.discord_id}')">Revocar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--danger)">Error al cargar staff.</td></tr>';
  }
}

function openAddStaffModal() {
  document.getElementById('staff-form').reset();
  openModal('staff-modal');
}

async function handleStaffSubmit(e) {
  e.preventDefault();
  const discord_id = document.getElementById('staff-discord-id').value.trim();
  const tag = document.getElementById('staff-tag').value.trim();
  const role = document.getElementById('staff-role-select').value;

  try {
    const res = await fetch('/admin/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discord_id, tag, role })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Miembro de staff añadido a la whitelist');
      closeModal('staff-modal');
      loadStaff();
    } else {
      showToast(data.error || 'Error al añadir staff', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

async function removeStaff(discordId) {
  if (!confirm(`¿Revocar acceso administrativo a Discord ID ${discordId}?`)) return;

  try {
    const res = await fetch(`/admin/api/staff/${discordId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Acceso revocado');
      loadStaff();
    } else {
      showToast(data.error || 'Error al revocar', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

// --- SETTINGS MANAGEMENT ---

async function loadSettings() {
  try {
    const res = await fetch('/admin/api/settings');
    const data = await res.json();
    const settings = data.settings || {};
    document.getElementById('setting-announcement').value = settings.announcement || '';
    document.getElementById('setting-webhook').value = settings.discord_webhook_url || '';
    document.getElementById('setting-tos').value = settings.tos || '';
  } catch (err) {
    showToast('Error al cargar configuración', true);
  }
}

async function saveSettings() {
  const announcement = document.getElementById('setting-announcement').value;
  const discord_webhook_url = document.getElementById('setting-webhook').value.trim();
  const tos = document.getElementById('setting-tos').value;

  try {
    const res = await fetch('/admin/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcement, discord_webhook_url, tos })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Configuración y Términos guardados correctamente');
    } else {
      showToast(data.error || 'Error al guardar', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

// --- UPDATES MANAGEMENT ---

async function loadUpdates() {
  const tbody = document.getElementById('updates-table-body');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Cargando actualizaciones...</td></tr>';

  try {
    const res = await fetch('/admin/api/updates');
    const data = await res.json();
    const updates = data.updates || [];

    if (updates.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px;">No hay actualizaciones publicadas todavía.</td></tr>';
      return;
    }

    tbody.innerHTML = updates.map(u => {
      const sizeMb = (u.file_size / (1024 * 1024)).toFixed(1);
      return `
        <tr>
          <td><strong style="color:var(--primary); font-size:15px;">v${escapeHtml(u.version)}</strong></td>
          <td><code>${escapeHtml(u.filename)}</code></td>
          <td>${sizeMb} MB</td>
          <td>
            <span class="role-badge" style="background:${u.is_mandatory ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}; color:${u.is_mandatory ? '#ef4444' : '#3b82f6'};">
              ${u.is_mandatory ? 'Obligatoria' : 'Opcional'}
            </span>
          </td>
          <td style="max-width:240px; white-space:pre-wrap; font-size:12px; color:var(--text-secondary);">${escapeHtml(u.notes || '-')}</td>
          <td>${u.created_at ? new Date(u.created_at).toLocaleString() : '-'}</td>
          <td>
            <div style="display:flex; gap:6px;">
              <a href="${u.download_url}" class="btn btn-secondary btn-sm" download title="Descargar instalador">
                Descargar
              </a>
              <button class="btn btn-danger btn-sm" onclick="deleteUpdate('${u.id}', '${escapeHtml(u.version)}')">
                Eliminar
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger)">Error al cargar actualizaciones.</td></tr>';
  }
}

function openUploadUpdateModal() {
  document.getElementById('update-form').reset();
  openModal('update-modal');
}

async function handleUpdateSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-update');
  btn.disabled = true;
  btn.textContent = 'Subiendo instalador...';

  const formData = new FormData();
  formData.append('version', document.getElementById('update-version').value.trim());
  formData.append('notes', document.getElementById('update-notes').value.trim());
  formData.append('is_mandatory', document.getElementById('update-mandatory').checked);

  const fileInput = document.getElementById('update-installer');
  if (fileInput.files.length > 0) {
    formData.append('installer', fileInput.files[0]);
  }

  try {
    const res = await fetch('/admin/api/updates', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Actualización v${data.update.version} publicada exitosamente.`);
      closeModal('update-modal');
      loadUpdates();
    } else {
      showToast(data.error || 'Error al publicar actualización', true);
    }
  } catch (err) {
    showToast('Error de conexión al subir la actualización', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Subir y Publicar';
  }
}

async function deleteUpdate(id, version) {
  if (!confirm(`¿Eliminar la actualización v${version}? Los clientes no podrán descargar esta versión.`)) {
    return;
  }
  try {
    const res = await fetch(`/admin/api/updates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`Actualización v${version} eliminada.`);
      loadUpdates();
    } else {
      showToast(data.error || 'Error al eliminar actualización', true);
    }
  } catch (err) {
    showToast('Error de conexión', true);
  }
}

// Modal helpers
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

/* ==========================================================================
   MÉTRICAS & TELEMETRÍA EN TIEMPO REAL
   ========================================================================== */
async function loadAnalytics() {
  try {
    const res = await fetch('/admin/api/analytics');
    const data = await res.json();
    if (!data.success) return showToast(data.error || 'Error cargando analíticas', true);

    const m = data.metrics;
    document.getElementById('metric-online-now').textContent = m.onlineUsers || 0;
    document.getElementById('metric-playing-sub').textContent = `${m.playingNow || 0} jugando ahora`;
    document.getElementById('metric-launches-today').textContent = m.launchesToday || 0;
    document.getElementById('metric-total-users').textContent = m.totalUsers || 0;
    document.getElementById('metric-popular-instance').textContent = m.mostPopularInstance || '-';

    const tbody = document.getElementById('realtime-players-body');
    if (!m.activeSessions || m.activeSessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay jugadores conectados en este momento.</td></tr>';
      return;
    }

    tbody.innerHTML = m.activeSessions.map(s => {
      const isPlaying = s.status === 'playing';
      const statusBadge = isPlaying
        ? `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);"><span class="badge-pulse"></span>Jugando</span>`
        : `<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3);">En el Menú</span>`;
      
      const secondsAgo = Math.round((Date.now() - (s.last_ping || Date.now())) / 1000);
      const pingText = secondsAgo < 5 ? 'Ahora mismo' : `hace ${secondsAgo}s`;

      return `
        <tr>
          <td style="font-weight: 600; color: #fff;">${escapeHtml(s.username || 'Desconocido')}</td>
          <td>${statusBadge}</td>
          <td><code>${escapeHtml(s.instance_id || 'Ninguna')}</code></td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(s.java_version || 'N/A')}</span></td>
          <td style="color: var(--text-secondary); font-size: 13px;">${pingText}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading analytics:', err);
    showToast('Error cargando métricas en tiempo real', true);
  }
}

/* ==========================================================================
   DIFUSIÓN DE ALERTAS & POP-UPS
   ========================================================================== */
async function loadBroadcasts() {
  try {
    const res = await fetch('/admin/api/broadcast');
    const data = await res.json();
    const container = document.getElementById('active-broadcast-container');

    if (!data.broadcast) {
      container.innerHTML = '<p style="color: var(--text-muted); margin: 0; text-align: center;">No hay ninguna alerta activa difundida en este momento.</p>';
      return;
    }

    const b = data.broadcast;
    const typeColor = b.type === 'urgent' ? '#ef4444' : (b.type === 'warning' ? '#f59e0b' : '#3b82f6');
    const typeBg = b.type === 'urgent' ? 'rgba(239, 68, 68, 0.1)' : (b.type === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)');
    const typeBorder = b.type === 'urgent' ? 'rgba(239, 68, 68, 0.3)' : (b.type === 'warning' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)');

    container.innerHTML = `
      <div style="background: ${typeBg}; border: 1px solid ${typeBorder}; padding: 16px; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <h4 style="margin: 0; color: ${typeColor}; font-size: 1.05rem;">${escapeHtml(b.title)}</h4>
          <span class="badge" style="background: ${typeBg}; color: ${typeColor}; border: 1px solid ${typeBorder}; text-transform: uppercase;">${escapeHtml(b.type)}</span>
        </div>
        <p style="margin: 0 0 12px; color: #f1f5f9; font-size: 0.95rem; line-height: 1.5;">${escapeHtml(b.message)}</p>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">
          Emitido por: <strong>${escapeHtml(b.author || 'Staff')}</strong> · Expira en: ${Math.round(b.duration_minutes)} min
        </div>
        <button class="btn btn-secondary" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); width: 100%;" onclick="clearActiveBroadcast()">
          Retirar y Desactivar Alerta
        </button>
      </div>
    `;
  } catch (err) {
    console.error('Error loading broadcast:', err);
  }
}

async function sendBroadcastAlert(e) {
  e.preventDefault();
  const title = document.getElementById('bc-title').value.trim();
  const message = document.getElementById('bc-message').value.trim();
  const type = document.getElementById('bc-type').value;
  const duration_minutes = parseInt(document.getElementById('bc-duration').value, 10);

  if (!title || !message) return showToast('Completa el título y mensaje', true);

  try {
    const res = await fetch('/admin/api/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ title, message, type, duration_minutes })
    });
    const data = await res.json();
    if (data.success) {
      showToast('¡Alerta global emitida correctamente a todos los clientes!');
      document.getElementById('broadcast-form').reset();
      loadBroadcasts();
    } else {
      showToast(data.error || 'Error al emitir alerta', true);
    }
  } catch (err) {
    console.error('Error sending broadcast:', err);
    showToast(`Error al emitir alerta: ${err.message || 'Error de red'}`, true);
  }
}

async function clearActiveBroadcast() {
  if (!confirm('¿Seguro que deseas retirar la alerta activa? Ya no aparecerá a ningún cliente.')) return;
  try {
    const res = await fetch('/admin/api/broadcast', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Alerta retirada.');
      loadBroadcasts();
    } else {
      showToast(data.error || 'Error al retirar alerta', true);
    }
  } catch (err) {
    console.error('Error clearing broadcast:', err);
    showToast(`Error al retirar alerta: ${err.message || 'Error de red'}`, true);
  }
}
