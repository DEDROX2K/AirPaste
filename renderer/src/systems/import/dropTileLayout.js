export function getDropSpreadCenters(anchorPoint, itemCount) {
  const count = Math.max(0, itemCount);

  if (count === 0) {
    return [];
  }

  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  const gapX = 372;
  const gapY = 312;
  const startX = anchorPoint.x - ((columns - 1) * gapX) / 2;
  const startY = anchorPoint.y - ((rows - 1) * gapY) / 2;

  return Array.from({ length: count }, (_value, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      x: Math.round(startX + column * gapX),
      y: Math.round(startY + row * gapY),
    };
  });
}
