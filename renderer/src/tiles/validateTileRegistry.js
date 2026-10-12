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

    // Not a strict typeof === "function" check: several tile components are
    // wrapped in React.memo()/forwardRef(), whose typeof is "object".
    if (!entry.Component) {
      errors.push(`Tile registry entry "${entryKey}" is missing a "Component".`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return true;
}

export default validateTileRegistry;
