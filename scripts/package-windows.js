const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const pngToIco = require("png-to-ico").default;

const projectRoot = path.resolve(__dirname, "..");
const buildDir = path.join(projectRoot, "build");
const distDir = path.join(projectRoot, "dist");
const releaseDir = path.join(projectRoot, "release");
const publicLogoPath = path.join(projectRoot, "public", "Logo.png");
const buildIconPngPath = path.join(buildDir, "icon.png");
const buildLogoPngPath = path.join(buildDir, "logo.png");
const buildIconIcoPath = path.join(buildDir, "icon.ico");
const releaseIconDir = path.join(releaseDir, ".icon-ico");
const releaseIconPath = path.join(releaseIconDir, "icon.ico");

function getUnpackedDir() {
  const candidates = [
    path.join(releaseDir, "win-unpacked"),
    path.join(distDir, "win-unpacked"),
  ];

  return candidates.find((candidatePath) => fsSync.existsSync(candidatePath)) || candidates[0];
}

function getInstallerPath() {
  const candidates = [
    path.join(releaseDir, "AirPaste Setup 0.1.0.exe"),
    path.join(distDir, "airpaste Setup 0.1.0.exe"),
    path.join(distDir, "AirPaste Setup 0.1.0.exe"),
  ];

  return candidates.find((candidatePath) => fsSync.existsSync(candidatePath)) || candidates[0];
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function findLatestRcedit() {
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || "",
    "electron-builder",
    "Cache",
    "winCodeSign",
  );

  if (!cacheRoot || !fsSync.existsSync(cacheRoot)) {
    return "";
  }

  const entries = fsSync.readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(cacheRoot, entry.name),
    }))
    .filter((entry) => fsSync.existsSync(path.join(entry.fullPath, "rcedit-x64.exe")))
    .sort((left, right) => {
      const leftMtime = fsSync.statSync(left.fullPath).mtimeMs;
      const rightMtime = fsSync.statSync(right.fullPath).mtimeMs;
      return rightMtime - leftMtime;
    });

  return entries[0] ? path.join(entries[0].fullPath, "rcedit-x64.exe") : "";
}

async function syncIconAssets() {
  if (!(await pathExists(publicLogoPath))) {
    throw new Error(`Missing logo source at ${publicLogoPath}`);
  }

  await fs.mkdir(buildDir, { recursive: true });
  await fs.copyFile(publicLogoPath, buildIconPngPath);
  await fs.copyFile(publicLogoPath, buildLogoPngPath);

  const iconBuffer = await pngToIco(publicLogoPath);
  await fs.writeFile(buildIconIcoPath, iconBuffer);
}

async function cleanOutputs() {
  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.rm(distDir, { recursive: true, force: true });
}

async function writeTempBuilderConfig() {
  const tempConfigPath = path.join(os.tmpdir(), `airpaste-builder-${Date.now()}.yml`);
  await fs.writeFile(tempConfigPath, "win:\n  signAndEditExecutable: false\n", "utf8");
  return tempConfigPath;
}

async function buildUnpackedApp(tempConfigPath) {
  await run("npx", [
    "electron-builder",
    "--dir",
    "--win",
    "--x64",
    "--publish",
    "never",
    "--config",
    tempConfigPath,
  ]);
}

async function patchExecutableIcon() {
  const rceditPath = findLatestRcedit();
  const unpackedDir = getUnpackedDir();
  const exeCandidates = [
    path.join(unpackedDir, "AirPaste.exe"),
    path.join(unpackedDir, "airpaste.exe"),
  ];
  const unpackedExePath = exeCandidates.find((candidatePath) => fsSync.existsSync(candidatePath)) || exeCandidates[0];

  if (!rceditPath) {
    throw new Error("Could not locate rcedit-x64.exe in the electron-builder cache.");
  }

  if (!(await pathExists(unpackedExePath))) {
    throw new Error(`Missing unpacked executable at ${unpackedExePath}`);
  }

  await run(rceditPath, [
    unpackedExePath,
    "--set-icon",
    buildIconIcoPath,
  ]);
}

async function refreshReleaseIcon() {
  await fs.mkdir(releaseIconDir, { recursive: true });
  await fs.copyFile(buildIconIcoPath, releaseIconPath);
}

async function buildInstallerFromPrepackaged(tempConfigPath) {
  const unpackedDir = getUnpackedDir();
  await run("npx", [
    "electron-builder",
    "--prepackaged",
    unpackedDir,
    "--win",
    "nsis",
    "--publish",
    "never",
    "--config",
    tempConfigPath,
  ]);
}

async function main() {
  let tempConfigPath = "";

  try {
    await syncIconAssets();
    await cleanOutputs();
    await run("npm", ["run", "build"]);
    tempConfigPath = await writeTempBuilderConfig();
    await buildUnpackedApp(tempConfigPath);
    await patchExecutableIcon();
    await refreshReleaseIcon();
    await buildInstallerFromPrepackaged(tempConfigPath);
    const unpackedDir = getUnpackedDir();

    console.log("");
    console.log("Windows package ready:");
    console.log(`- ${unpackedDir}`);
    console.log(`- ${getInstallerPath()}`);
  } finally {
    if (tempConfigPath) {
      await fs.rm(tempConfigPath, { force: true }).catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
