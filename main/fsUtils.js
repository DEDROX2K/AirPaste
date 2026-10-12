const fs = require("node:fs/promises");

function nowIso() {
  return new Date().toISOString();
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  nowIso,
  pathExists,
};
