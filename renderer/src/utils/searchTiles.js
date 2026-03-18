export function getSearchText(tile) {
  return [
    tile?.text,
    tile?.secondaryText,
    tile?.quoteAuthor,
    tile?.url,
    tile?.title,
    tile?.description,
    tile?.siteName,
    tile?.type,
    ...(Array.isArray(tile?.notes)
      ? tile.notes.flatMap((note) => [note?.text, note?.secondaryText, note?.quoteAuthor])
      : []),
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
