const fs = require('fs');
const path = require('path');

/**
 * Script de automatización: Copia el instalador Setup.exe generado
 * en client/dist directamente a la carpeta de actualizaciones del servidor
 * (server/public/uploads/updates) y registra la versión en la base de datos.
 */
function publishLocalUpdate(version, notes = '', isMandatory = false) {
  const rootDir = path.resolve(__dirname, '../..');
  const clientDistDir = path.join(rootDir, 'client', 'dist');
  const serverUpdatesDir = path.join(rootDir, 'server', 'public', 'uploads', 'updates');
  const dbFile = path.join(rootDir, 'server', 'data', 'database.json');

  if (!fs.existsSync(serverUpdatesDir)) {
    fs.mkdirSync(serverUpdatesDir, { recursive: true });
  }

  // Find generated installer
  let installerSource = path.join(clientDistDir, `EsquizoLauncher-Setup-${version}.exe`);
  if (!fs.existsSync(installerSource)) {
    // Search for any setup.exe in dist
    const distFiles = fs.existsSync(clientDistDir) ? fs.readdirSync(clientDistDir) : [];
    const found = distFiles.find(f => f.toLowerCase().endsWith('.exe') && f.toLowerCase().includes('setup'));
    if (found) {
      installerSource = path.join(clientDistDir, found);
    }
  }

  if (!fs.existsSync(installerSource)) {
    console.error(`[Error] No se encontró el ejecutable en '${clientDistDir}'. Ejecuta primero 'npm run dist' en client.`);
    process.exit(1);
  }

  const cleanVersion = String(version).trim().replace(/^v/i, '');
  const destFileName = `EsquizoLauncher-Setup-${cleanVersion}.exe`;
  const destPath = path.join(serverUpdatesDir, destFileName);

  console.log(`Copiando '${path.basename(installerSource)}' -> '${destFileName}'...`);
  fs.copyFileSync(installerSource, destPath);
  const fileSize = fs.statSync(destPath).size;
  console.log(`Copiado con éxito (${(fileSize / (1024 * 1024)).toFixed(1)} MB).`);

  // Update server database.json directly
  let dbData = { instances: [], users: [], updates: [], staff: [], settings: {} };
  if (fs.existsSync(dbFile)) {
    try {
      dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (e) {}
  }
  if (!dbData.updates) dbData.updates = [];

  const existingIdx = dbData.updates.findIndex(u => u.version === cleanVersion);
  const updateObj = {
    id: existingIdx >= 0 ? dbData.updates[existingIdx].id : require('crypto').randomUUID(),
    version: cleanVersion,
    notes: notes || 'Actualización con nuevas optimizaciones y características para eventos.',
    is_mandatory: !!isMandatory,
    filename: destFileName,
    download_url: `/uploads/updates/${destFileName}`,
    file_size: fileSize,
    created_at: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    dbData.updates[existingIdx] = updateObj;
  } else {
    dbData.updates.unshift(updateObj);
  }

  fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2), 'utf8');
  console.log(`[Éxito] Actualización v${cleanVersion} registrada en el panel de administración.`);
}

// CLI args: node publish-update.js <version> [notes] [isMandatory]
const args = process.argv.slice(2);
const ver = args[0] || '1.0.0';
const notes = args[1] || 'Versión oficial con auto-actualizador, ping de servidores en vivo, modo streamer y optimizaciones.';
const mandatory = args[2] === 'true';

publishLocalUpdate(ver, notes, mandatory);
