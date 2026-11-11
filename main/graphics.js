const { app } = require("electron");

// Graphics mode for the renderer: "full", or "lite" when the GPU can't keep
// up. Lite means Chromium is compositing in software (GPU blocklisted, no
// driver, remote desktop) or the GPU process has crashed this session. A GPU
// process crash blanks and redraws the whole window, which reads as the app
// "flashing" (top bar and dock blinking, tiles vanishing); after one, the
// renderer drops its heaviest effects (backdrop blur) so it doesn't repeat.
// The renderer gets the mode as data-graphics on <html> (see preload.js).

let gpuCrashCount = 0;

function getGpuCompositingStatus() {
  try {
    return String(app.getGPUFeatureStatus()?.gpu_compositing ?? "unknown");
  } catch {
    return "unknown";
  }
}

function getGraphicsInfo() {
  const gpuCompositing = getGpuCompositingStatus();
  const isSoftware = gpuCompositing !== "unknown" && !gpuCompositing.startsWith("enabled");

  return {
    mode: isSoftware || gpuCrashCount > 0 ? "lite" : "full",
    gpuCompositing,
    gpuCrashCount,
  };
}

function sendGraphicsInfo(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const info = getGraphicsInfo();

  if (info.mode !== "full") {
    console.warn("[graphics] using lite graphics", info);
  }

  mainWindow.webContents.send("graphics:mode", info);
}

function watchGpu(getMainWindow) {
  app.on("child-process-gone", (_event, details) => {
    if (details?.type !== "GPU") {
      return;
    }

    gpuCrashCount += 1;
    console.warn("[graphics] GPU process gone", details);
    sendGraphicsInfo(getMainWindow());
  });
}

module.exports = { getGraphicsInfo, sendGraphicsInfo, watchGpu };
