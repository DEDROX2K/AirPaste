// Builds the custom AirPaste installer (installer/AirPasteSetup.cs) around an
// already-packaged app (dist/win-unpacked, from electron-builder --dir):
//
//   1. zip the unpacked app with the 7-Zip binary electron-builder ships;
//   2. compile the setup stub with the C# compiler that comes with Windows
//      (.NET Framework 4.8 -- nothing to install);
//   3. write [stub][zip][int64 zip length]["APINST01"] as the setup exe.
//
// Usage: node installer/build-installer.js   (scripts/package-windows.js runs it)
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { path7za } = require("7zip-bin");

const projectRoot = path.resolve(__dirname, "..");
const { version, build } = require(path.join(projectRoot, "package.json"));
const productName = build?.productName || "AirPaste";
const distDir = path.join(projectRoot, "dist");
const unpackedDir = path.join(distDir, "win-unpacked");
const workDir = path.join(distDir, ".installer-build");
const outputPath = path.join(distDir, `${productName} Setup ${version}.exe`);

const frameworkDir = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319");
const wpfDir = path.join(frameworkDir, "WPF");
const cscPath = path.join(frameworkDir, "csc.exe");

function buildInstaller() {
  if (!fs.existsSync(path.join(unpackedDir, "airpaste.exe"))) {
    throw new Error(`Missing packaged app at ${unpackedDir} (run electron-builder --dir first).`);
  }

  if (!fs.existsSync(cscPath)) {
    throw new Error(`Missing the .NET Framework C# compiler at ${cscPath}.`);
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const zipPath = path.join(workDir, "payload.zip");
  console.log("• zipping the packaged app");
  execFileSync(path7za, ["a", "-tzip", "-mx=7", "-bso0", "-bsp0", zipPath, ".\\*"], { cwd: unpackedDir, stdio: "inherit" });

  const versionPath = path.join(workDir, "version.txt");
  fs.writeFileSync(versionPath, version, "utf8");

  const stubPath = path.join(workDir, "setup-stub.exe");
  console.log("• compiling the setup UI");
  execFileSync(cscPath, [
    "/nologo",
    "/target:winexe",
    "/optimize+",
    `/out:${stubPath}`,
    `/win32icon:${path.join(projectRoot, "build", "icon.ico")}`,
    `/resource:${path.join(projectRoot, "public", "logo.png")},logo.png`,
    `/resource:${versionPath},version.txt`,
    `/reference:${path.join(wpfDir, "PresentationFramework.dll")}`,
    `/reference:${path.join(wpfDir, "PresentationCore.dll")}`,
    `/reference:${path.join(wpfDir, "WindowsBase.dll")}`,
    `/reference:${path.join(frameworkDir, "System.Xaml.dll")}`,
    `/reference:${path.join(frameworkDir, "System.IO.Compression.dll")}`,
    `/reference:${path.join(frameworkDir, "Microsoft.CSharp.dll")}`,
    `/reference:${path.join(frameworkDir, "System.Core.dll")}`,
    path.join(__dirname, "AirPasteSetup.cs"),
  ], { stdio: "inherit" });

  console.log("• writing the setup exe");
  const zipSize = fs.statSync(zipPath).size;
  const trailer = Buffer.alloc(16);
  trailer.writeBigInt64LE(BigInt(zipSize), 0);
  trailer.write("APINST01", 8, "ascii");

  fs.rmSync(outputPath, { force: true });
  fs.copyFileSync(stubPath, outputPath);
  fs.appendFileSync(outputPath, fs.readFileSync(zipPath));
  fs.appendFileSync(outputPath, trailer);
  fs.rmSync(workDir, { recursive: true, force: true });

  console.log(`• ${outputPath} (${Math.round(fs.statSync(outputPath).size / (1024 * 1024))} MB)`);
  return outputPath;
}

if (require.main === module) {
  try {
    buildInstaller();
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

module.exports = { buildInstaller };
