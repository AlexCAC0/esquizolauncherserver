const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');
const db = require('../db');

// Route to initiate Discord OAuth
router.get('/discord', (req, res) => {
  const scope = encodeURIComponent('identify');
  const redirectUri = encodeURIComponent(config.DISCORD.REDIRECT_URI);
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.DISCORD.CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  res.redirect(discordAuthUrl);
});

// Discord OAuth callback
router.get('/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Código de autorización no provisto');
  }

  try {
    // Exchange code for token
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: config.DISCORD.CLIENT_ID,
        client_secret: config.DISCORD.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.DISCORD.REDIRECT_URI
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Fetch user profile
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const discordUser = userResponse.data;

    // STRICT WHITELIST CHECK: Only authorized Discord accounts can log in
    if (!db.isStaff(discordUser.id)) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <title>Acceso Denegado - EsquizoStudios</title>
          <style>
            body { background: #0a0814; color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #130f26; border: 1px solid #ef444455; border-radius: 12px; padding: 36px; max-width: 480px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); text-align: center; }
            h2 { color: #f87171; margin-top: 0; }
            p { color: #94a3b8; line-height: 1.6; font-size: 14px; }
            .tag { display: inline-block; background: #2b1118; color: #fca5a5; padding: 4px 10px; border-radius: 6px; font-weight: bold; margin: 8px 0; }
            .footer { margin-top: 20px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Acceso Restringido</h2>
            <p>La cuenta de Discord:</p>
            <div class="tag">${discordUser.username} (ID: ${discordUser.id})</div>
            <p><strong>NO</strong> tiene permisos para acceder al panel de administración privado de <strong>EsquizoStudios</strong>.<br>El inicio de sesión ha sido rechazado automáticamente.</p>
            <div class="footer">EsquizoStudios &copy; 2026 - Sistema de Seguridad</div>
          </div>
        </body>
        </html>
      `);
    }

    // Determine staff role
    let staffEntry = db.getStaff().find(s => s.discord_id === discordUser.id);
    let role = 'moderator';

    if (config.DISCORD.DEFAULT_ADMIN_IDS.includes(discordUser.id)) {
      role = 'admin';
      if (!staffEntry) {
        staffEntry = db.addStaff(discordUser.id, discordUser.username, 'admin');
      }
    } else if (staffEntry) {
      role = staffEntry.role;
    } else if (db.getStaff().length === 0) {
      role = 'admin';
      staffEntry = db.addStaff(discordUser.id, discordUser.username, 'admin');
    }

    // Store in session
    req.session.staffUser = {
      id: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar,
      role: role
    };

    res.redirect('/admin');
  } catch (err) {
    console.error('[Discord OAuth Error]', err.response?.data || err.message);
    res.status(500).send('Error durante la autenticación con Discord');
  }
});

// Map to store temporary client Discord OAuth sessions (valid for 5 mins)
const clientOAuthSessions = new Map();

// Helper to clean up expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of clientOAuthSessions.entries()) {
    if (now - session.created > 5 * 60 * 1000) {
      clientOAuthSessions.delete(id);
    }
  }
}, 60 * 1000);

// Client Discord OAuth: Start flow
router.get('/discord/client-start', (req, res) => {
  const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
  clientOAuthSessions.set(sessionId, { status: 'pending', created: Date.now() });

  const scope = encodeURIComponent('identify');
  // Callback route on server
  const clientCallbackUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/auth/discord/client-callback`);
  const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.DISCORD.CLIENT_ID}&redirect_uri=${clientCallbackUri}&response_type=code&scope=${scope}&state=${sessionId}`;

  res.json({
    success: true,
    sessionId,
    url: discordUrl,
    isDev: false
  });
});

// Client Discord OAuth: Callback from Discord
router.get('/discord/client-callback', async (req, res) => {
  const { code, state: sessionId } = req.query;

  if (!sessionId || !clientOAuthSessions.has(sessionId)) {
    return res.status(400).send('Sesión inválida o expirada.');
  }

  if (!code) {
    clientOAuthSessions.set(sessionId, { status: 'error', error: 'Acceso cancelado por el usuario.' });
    return res.send('Inicio de sesión cancelado. Puedes cerrar esta pestaña.');
  }

  try {
    const clientCallbackUri = `${req.protocol}://${req.get('host')}/auth/discord/client-callback`;
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: config.DISCORD.CLIENT_ID,
        client_secret: config.DISCORD.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: clientCallbackUri
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const accessToken = tokenResponse.data.access_token;
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const discordUser = userResponse.data;

    clientOAuthSessions.set(sessionId, {
      status: 'completed',
      created: Date.now(),
      user: {
        id: discordUser.id,
        username: discordUser.username,
        avatar: discordUser.avatar
      }
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Discord Vinculado - EsquizoLauncher</title>
        <style>
          body { background: #0a0814; color: #f1f5f9; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #130f26; border: 1px solid #7c3aed44; border-radius: 12px; padding: 36px; max-width: 440px; text-align: center; }
          h2 { color: #a855f7; margin-top: 0; }
          .tag { display: inline-block; background: #2e1065; color: #d8b4fe; padding: 6px 14px; border-radius: 8px; font-weight: bold; margin: 12px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>¡Discord Vinculado!</h2>
          <div class="tag">@${discordUser.username}</div>
          <p style="color:#94a3b8; font-size:14px;">Tu cuenta ha sido vinculada correctamente con EsquizoLauncher.<br>Ya puedes cerrar esta ventana y continuar.</p>
        </div>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[Discord Client OAuth Error]', err.response?.data || err.message);
    clientOAuthSessions.set(sessionId, { status: 'error', error: 'Error al intercambiar token con Discord.' });
    res.status(500).send('Error durante la vinculación con Discord. Puedes cerrar esta ventana.');
  }
});

// Client Discord OAuth: Poll status endpoint
router.get('/discord/client-result', (req, res) => {
  const { session } = req.query;
  if (!session || !clientOAuthSessions.has(session)) {
    return res.status(404).json({ success: false, error: 'Sesión no encontrada o expirada.' });
  }

  const sessionData = clientOAuthSessions.get(session);
  if (sessionData.status === 'completed') {
    clientOAuthSessions.delete(session);
    return res.json({ success: true, status: 'completed', user: sessionData.user });
  }

  if (sessionData.status === 'error') {
    clientOAuthSessions.delete(session);
    return res.json({ success: false, status: 'error', error: sessionData.error });
  }

  res.json({ success: true, status: 'pending' });
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// Get current user info
router.get('/me', (req, res) => {
  if (!req.session || !req.session.staffUser) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    user: req.session.staffUser
  });
});

module.exports = router;

