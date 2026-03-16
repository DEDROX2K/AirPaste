/* global process, require */
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const playwrightRoot = path.dirname(require.resolve("playwright/package.json"));
const cliPath = path.join(playwrightRoot, "cli.js");
const result = spawnSync(
  process.execPath,
  [cliPath, "install", "chromium"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: "0",
    },
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
