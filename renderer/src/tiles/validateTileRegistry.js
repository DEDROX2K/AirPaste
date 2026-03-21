function hasValidDefaultSize(defaultSize) {
  return Boolean(
    defaultSize
    && Number.isFinite(defaultSize.width)
    && Number.isFinite(defaultSize.height),
  );
}

export function validateTileRegistry(registry) {
  if (!registry || typeof registry !== "object") {
    throw new Error("Tile registry must be an object.");
  }

  const seenTypes = new Set();
  const errors = [];

  for (const [entryKey, entry] of Object.entries(registry)) {
    if (!entry?.type) {
      errors.push(`Tile registry entry "${entryKey}" is missing "type".`);
      continue;
    }

    if (seenTypes.has(entry.type)) {
      errors.push(`Tile registry has duplicate type "${entry.type}".`);
    } else {
      seenTypes.add(entry.type);
    }

    if (!entry.displayName) {
      errors.push(`Tile registry entry "${entryKey}" is missing "displayName".`);
    }

    if (!hasValidDefaultSize(entry.defaultSize)) {
      errors.push(`Tile registry entry "${entryKey}" is missing a valid "defaultSize".`);
    }

    if (!entry.capabilities || typeof entry.capabilities !== "object") {
      errors.push(`Tile registry entry "${entryKey}" is missing "capabilities".`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return true;
}

export default validateTileRegistry;
