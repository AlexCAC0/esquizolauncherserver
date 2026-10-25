const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Parses and extracts a Modrinth (.mrpack) file into the instance directory.
 * @param {string} mrpackFilePath - Path to the uploaded .mrpack file
 * @param {string} targetDir - Directory to store instance files (uploads/instances/<id>)
 */
function processMrpack(mrpackFilePath, targetDir) {
  if (!fs.existsSync(mrpackFilePath)) {
    throw new Error('El archivo .mrpack no existe');
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const zip = new AdmZip(mrpackFilePath);
  const zipEntries = zip.getEntries();

  // Find modrinth.index.json
  const indexEntry = zipEntries.find(e => e.entryName === 'modrinth.index.json');
  if (!indexEntry) {
    throw new Error('El archivo no es un modpack válido de Modrinth (falta modrinth.index.json)');
  }

  const indexRaw = zip.readAsText(indexEntry);
  const indexData = JSON.parse(indexRaw);

  // Extract dependencies
  const deps = indexData.dependencies || {};
  const mcVersion = deps.minecraft || '1.20.1';
  let loaderType = 'fabric';
  let loaderVersion = 'latest';

  if (deps['fabric-loader']) {
    loaderType = 'fabric';
    loaderVersion = deps['fabric-loader'];
  } else if (deps['neoforge']) {
    loaderType = 'neoforge';
    loaderVersion = deps['neoforge'];
  } else if (deps['forge']) {
    loaderType = 'forge';
    loaderVersion = deps['forge'];
  } else if (deps['quilt-loader']) {
    loaderType = 'quilt';
    loaderVersion = deps['quilt-loader'];
  }

  // Extract overrides (config, options, resourcepacks, etc.)
  const overridesDir = path.join(targetDir, 'overrides');
  if (fs.existsSync(overridesDir)) {
    fs.rmSync(overridesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(overridesDir, { recursive: true });

  const overrideFiles = [];
  zipEntries.forEach(entry => {
    if (entry.isDirectory) return;

    // Check for overrides/ or client-overrides/
    let relPath = null;
    if (entry.entryName.startsWith('overrides/')) {
      relPath = entry.entryName.replace(/^overrides\//, '');
    } else if (entry.entryName.startsWith('client-overrides/')) {
      relPath = entry.entryName.replace(/^client-overrides\//, '');
    }

    if (relPath) {
      const dest = path.join(overridesDir, relPath);
      const parent = path.dirname(dest);
      if (!fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
      }
      fs.writeFileSync(dest, entry.getData());
      overrideFiles.push(relPath.replace(/\\/g, '/'));
    }
  });

  // Filter client-side required files (mods, etc.)
  const clientFiles = [];
  let totalModSize = 0;

  if (Array.isArray(indexData.files)) {
    indexData.files.forEach(f => {
      // Check if required on client
      const clientEnv = f.env && f.env.client;
      if (clientEnv === 'unsupported') return;

      const isMod = f.path.startsWith('mods/');
      totalModSize += f.fileSize || 0;

      clientFiles.push({
        path: f.path,
        hashes: f.hashes || {},
        fileSize: f.fileSize || 0,
        downloads: f.downloads || [],
        is_mod: isMod
      });
    });
  }

  // Prepare compiled manifest for the launcher client
  const manifest = {
    formatVersion: 1,
    name: indexData.name || 'Esquizo Event',
    summary: indexData.summary || '',
    game: indexData.game || 'minecraft',
    mc_version: mcVersion,
    loader: {
      type: loaderType,
      version: loaderVersion
    },
    files: clientFiles,
    overrides: overrideFiles,
    stats: {
      total_files: clientFiles.length + overrideFiles.length,
      total_mods: clientFiles.filter(f => f.is_mod).length,
      total_size: totalModSize
    },
    generated_at: new Date().toISOString()
  };

  // Save manifest.json in the instance folder
  fs.writeFileSync(
    path.join(targetDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  return manifest;
}

/**
 * Packs an existing instance directory back into a valid Modrinth (.mrpack) buffer.
 * @param {string} instanceDir - Directory where manifest.json and overrides/ reside
 * @returns {Buffer} - The .mrpack ZIP buffer
 */
function packInstanceToMrpack(instanceDir) {
  const manifestPath = path.join(instanceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('No se encontró manifest.json en la instancia para generar el .mrpack');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const zip = new AdmZip();

  // Recreate standard Modrinth modrinth.index.json
  const indexData = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: manifest.name || 'esquizo-event',
    name: manifest.name || 'Esquizo Event',
    summary: manifest.summary || '',
    files: manifest.files || [],
    dependencies: {
      minecraft: manifest.mc_version || '1.20.1'
    }
  };

  if (manifest.loader) {
    if (manifest.loader.type === 'fabric') indexData.dependencies['fabric-loader'] = manifest.loader.version || 'latest';
    else if (manifest.loader.type === 'forge') indexData.dependencies['forge'] = manifest.loader.version || 'latest';
    else if (manifest.loader.type === 'neoforge') indexData.dependencies['neoforge'] = manifest.loader.version || 'latest';
    else if (manifest.loader.type === 'quilt') indexData.dependencies['quilt-loader'] = manifest.loader.version || 'latest';
  }

  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(indexData, null, 2), 'utf-8'));

  // Add overrides folder if it exists
  const overridesDir = path.join(instanceDir, 'overrides');
  if (fs.existsSync(overridesDir)) {
    zip.addLocalFolder(overridesDir, 'overrides');
  }

  return zip.toBuffer();
}

module.exports = {
  processMrpack,
  packInstanceToMrpack
};
