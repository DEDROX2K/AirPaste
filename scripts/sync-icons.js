// Regenerates the packaging icons in build/ from public/logo.png, so the
// app exe, installer, uninstaller, shortcuts and Settings > Apps entry all
// show the AirPaste logo. Runs before every package (npm "prepackage" and
// scripts/package-windows.js); build/icon.ico and build/icon.png are also
// committed so electron-builder never falls back to Electron's icon.
const fs = require("node:fs/promises");
const path = require("node:path");
const pngToIco = require("png-to-ico").default;

const projectRoot = path.resolve(__dirname, "..");
const buildDir = path.join(projectRoot, "build");
const publicLogoPath = path.join(projectRoot, "public", "logo.png");

async function syncIconAssets() {
  await fs.access(publicLogoPath).catch(() => {
    throw new Error(`Missing logo source at ${publicLogoPath}`);
  });

  await fs.mkdir(buildDir, { recursive: true });
  await fs.copyFile(publicLogoPath, path.join(buildDir, "icon.png"));
  await fs.copyFile(publicLogoPath, path.join(buildDir, "logo.png"));
  await fs.writeFile(path.join(buildDir, "icon.ico"), await pngToIco(publicLogoPath));
}

if (require.main === module) {
  syncIconAssets().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = { syncIconAssets };
