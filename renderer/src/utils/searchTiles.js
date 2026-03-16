export function getSearchText(tile) {
  return [
    tile?.text,
    tile?.url,
    tile?.title,
    tile?.description,
    tile?.siteName,
    tile?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterTiles(tiles, query) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return tiles;
  }

  return tiles.filter((tile) => getSearchText(tile).includes(normalized));
}
