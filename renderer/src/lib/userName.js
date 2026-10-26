import { desktop } from "./desktop";

// The person using AirPaste, for author labels (sticky notes). Loaded once;
// until it arrives (or outside Electron) it's an empty string.
let cachedUserName = "";

void desktop.shell.getUserName()
  .then((name) => {
    const trimmed = String(name ?? "").trim();
    cachedUserName = trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
  })
  .catch(() => {});

export function getUserName() {
  return cachedUserName;
}
