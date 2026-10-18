# EsquizoLauncher Server

Backend oficial y Panel de Administración Web privado para **EsquizoStudios**.

---

## 🚀 Requisitos en la PC Servidor

- **Node.js**: Versión 18+ LTS ([nodejs.org](https://nodejs.org))
- **Git para Windows**: ([git-scm.com](https://git-scm.com))

---

## 📦 Instalación Rápida

1. **Clonar este repositorio:**
   ```powershell
   git clone https://github.com/AlexCAC0/esquizolauncherserver.git
   cd esquizolauncherserver
   ```

2. **Instalar dependencias:**
   ```powershell
   npm install
   ```

3. **Configurar variables de entorno:**
   - Copia `.env.example` a `.env`:
     ```powershell
     Copy-Item .env.example .env
     ```
   - Edita `.env` con tus credenciales de Discord y puertos:
     ```env
     PORT=3001
     SESSION_SECRET=esquizo-studios-super-secret-key-2026
     DISCORD_CLIENT_ID=TU_CLIENT_ID
     DISCORD_CLIENT_SECRET=TU_CLIENT_SECRET
     DISCORD_REDIRECT_URI=https://TU-DOMINIO/auth/discord/callback
     DEFAULT_ADMIN_IDS=TU_DISCORD_ID
     ```

4. **Ejecutar el servidor con PM2 (Siempre encendido):**
   ```powershell
   npm install -g pm2
   pm2 start src/server.js --name "esquizo-server"
   pm2 save
   ```

---

## 🔒 Seguridad y Propiedad

Software propietario de **EsquizoStudios**. Todos los derechos reservados.
