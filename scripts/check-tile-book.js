const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const tileTypesPath = path.join(rootDir, "renderer", "src", "tiles", "tileTypes.js");
const tileRegistryPath = path.join(rootDir, "renderer", "src", "tiles", "tileRegistry.js");
const tileBookPath = path.join(rootDir, "docs", "TILE_BOOK.md");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractTypeIdsFromTileTypes(source) {
  return [...source.matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractMentionedTypeIdsFromBook(source) {
  return new Set([...source.matchAll(/`([^`]+)`/g)].map((match) => match[1]));
}

function extractStableRegistryTypeIds(source) {
  const matches = [...source.matchAll(/\[TILE_TYPES\.([A-Z0-9_]+)\]:\s*\{[\s\S]*?status:\s*"stable"/g)];
  return matches.map((match) => match[1]);
}

function extractTypeMap(source) {
  return new Map(
    [...source.matchAll(/([A-Z0-9_]+):\s*"([^"]+)"/g)].map((match) => [match[1], match[2]]),
  );
}

function extractImplementedTypeIdsFromBook(source) {
  const lines = source.split(/\r?\n/);
  const implementedTypeIds = [];

  lines.forEach((line) => {
    if (!line.startsWith("| Implemented |")) {
      return;
    }

    const cells = line.split("|").map((part) => part.trim()).filter((part) => part.length > 0);
    const typeIdCell = cells[3] ?? "";
    const typeIdMatch = typeIdCell.match(/`([^`]+)`/);

    if (typeIdMatch) {
      implementedTypeIds.push(typeIdMatch[1]);
    }
  });

  return [...new Set(implementedTypeIds)];
}

function main() {
  const tileTypesSource = readFile(tileTypesPath);
  const tileRegistrySource = readFile(tileRegistryPath);
  const tileBookSource = readFile(tileBookPath);

  const registeredTypeIds = extractTypeIdsFromTileTypes(tileTypesSource);
  const mentionedTypeIds = extractMentionedTypeIdsFromBook(tileBookSource);
  const typeMap = extractTypeMap(tileTypesSource);
  const stableRegistryTypeIds = extractStableRegistryTypeIds(tileRegistrySource)
    .map((key) => typeMap.get(key))
    .filter(Boolean);
  const implementedBookTypeIds = extractImplementedTypeIdsFromBook(tileBookSource);
  const missingTypeIds = registeredTypeIds.filter((typeId) => !mentionedTypeIds.has(typeId));
  const implementedButMissingInRuntime = implementedBookTypeIds.filter(
    (typeId) => !registeredTypeIds.includes(typeId),
  );

  if (missingTypeIds.length === 0 && implementedButMissingInRuntime.length === 0) {
    console.log(`TILE_BOOK is covering all registered tile type IDs (${registeredTypeIds.length}).`);
    console.log(`Implemented tile type IDs documented in TILE_BOOK: ${implementedBookTypeIds.length}.`);
    console.log(`Stable tile type IDs detected in runtime registry: ${stableRegistryTypeIds.length}.`);
    return;
  }

  if (missingTypeIds.length > 0) {
    console.warn("TILE_BOOK is missing registered tile type IDs:");
    missingTypeIds.forEach((typeId) => {
      console.warn(`- ${typeId}`);
    });
  }

  if (implementedButMissingInRuntime.length > 0) {
    console.warn("TILE_BOOK marks these implemented tile type IDs, but they are not present in the runtime registry:");
    implementedButMissingInRuntime.forEach((typeId) => {
      console.warn(`- ${typeId}`);
    });
  }

  process.exitCode = 1;
}

main();
