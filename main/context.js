// Shared mutable state that multiple main-process modules need to read the
// current value of (e.g. the main BrowserWindow, which is reassigned if the
// window is recreated on macOS activate). Modules read `context.mainWindow`
// as a live property access rather than capturing a stale reference.
const context = {
  mainWindow: null,
};

module.exports = context;
