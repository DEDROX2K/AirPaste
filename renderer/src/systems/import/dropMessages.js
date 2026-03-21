export function formatDropRejectionMessage(rejectedItems, maxDetails = 3) {
  if (!Array.isArray(rejectedItems) || rejectedItems.length === 0) {
    return "";
  }

  const details = rejectedItems
    .slice(0, maxDetails)
    .map((entry) => entry.detail)
    .filter(Boolean);
  const remainder = rejectedItems.length - details.length;
  const suffix = remainder > 0 ? ` ${remainder} more item${remainder === 1 ? "" : "s"} were also rejected.` : "";

  return `Some dropped items were rejected. ${details.join(" ")}${suffix}`.trim();
}

export function formatDropSuccessMessage(createdImageCount, createdBookmarkCount) {
  const parts = [];

  if (createdImageCount > 0) {
    parts.push(`${createdImageCount} image tile${createdImageCount === 1 ? "" : "s"} imported`);
  }

  if (createdBookmarkCount > 0) {
    parts.push(`${createdBookmarkCount} bookmark tile${createdBookmarkCount === 1 ? "" : "s"} created`);
  }

  return parts.length > 0 ? `${parts.join(" and ")}.` : "";
}
