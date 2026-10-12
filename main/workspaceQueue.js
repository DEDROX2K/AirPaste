const path = require("node:path");
const { pathExists } = require("./fsUtils");

const workspaceQueues = new Map();

function withWorkspaceQueue(folderPath, task) {
  const queueKey = typeof folderPath === "string" && folderPath
    ? path.resolve(folderPath)
    : "__invalid-workspace__";
  const previous = workspaceQueues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => { })
    .then(task);

  workspaceQueues.set(queueKey, next);

  return next.finally(() => {
    if (workspaceQueues.get(queueKey) === next) {
      workspaceQueues.delete(queueKey);
    }
  });
}

async function resolveWorkspaceQueueKeyForFile(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return "__invalid-workspace__";
  }

  let dir = path.dirname(path.resolve(filePath));

  while (true) {
    if (
      await pathExists(path.join(dir, "airpaste.json"))
      || await pathExists(path.join(dir, ".airpaste", "index.json"))
    ) {
      return dir;
    }

    const parent = path.dirname(dir);

    if (parent === dir) {
      return path.dirname(path.resolve(filePath));
    }

    dir = parent;
  }
}

module.exports = {
  withWorkspaceQueue,
  resolveWorkspaceQueueKeyForFile,
};
