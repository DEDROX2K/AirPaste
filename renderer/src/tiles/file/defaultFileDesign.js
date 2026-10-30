// The default file design: what an imported file AirPaste has no tile of
// its own for (.blend, .flo, .pdf, ...) looks like. One coloured blob with
// a size pill on top, the name across the middle and the extension in a
// tab at the bottom. Measured at 610 x 415 and scaled with the width
// (k = width / 610); the proportions are fixed. Coding files use the
// code-file design instead (see tiles/sticky/model.js).

export const DEFAULT_FILE_BASE_WIDTH = 610;
export const DEFAULT_FILE_BASE_HEIGHT = 415;
export const DEFAULT_FILE_MIN_WIDTH = 200;
export const DEFAULT_FILE_MAX_WIDTH = 1220;
export const DEFAULT_FILE_DEFAULT_WIDTH = 344;

export const DEFAULT_FILE_COLOR = "#45E6B9";
export const DEFAULT_FILE_COLOR_PRESETS = Object.freeze([
  "#45E6B9", "#D9D9D9", "#000000", "#FFFFFF", "#F25757", "#F2AF57", "#ECF258", "#C955F4",
]);

// The card outline at 610 x 415: body, neck and bottom tab in one path.
export const DEFAULT_FILE_SHAPE_PATH = "M304.744 0C369.748 5.70852e-05 427.127 22.7987 461.383 57.5713C474.707 71.0961 491.092 81.9074 509.296 87.2998C567.795 104.629 609.488 149.63 609.488 202.417C609.488 270.2 540.742 325.149 455.939 325.149C435.523 325.149 416.037 321.963 398.218 316.181C380.133 310.312 360.508 309.588 341.966 313.795C340.833 314.052 339.694 314.298 338.55 314.532C326.405 317.016 316.759 327.116 316.759 339.513C316.759 346.692 322.579 352.513 329.759 352.513H391.743C396.714 352.513 400.744 356.542 400.744 361.513V405.199C400.744 410.17 396.714 414.199 391.744 414.199H217.743C212.773 414.199 208.743 410.17 208.743 405.199V361.513C208.743 356.542 212.773 352.513 217.743 352.513H279.729C286.909 352.513 292.729 346.692 292.729 339.513C292.729 327.116 283.084 317.016 270.938 314.532C269.794 314.298 268.654 314.052 267.521 313.795C248.978 309.588 229.353 310.312 211.269 316.181C193.449 321.963 173.964 325.149 153.548 325.149C68.7454 325.149 3.70684e-06 270.2 0 202.417C0.000133701 149.631 41.6917 104.629 100.19 87.2998C118.394 81.9072 134.78 71.0961 148.104 57.5713C182.36 22.7985 239.74 0 304.744 0Z";

export function clampDefaultFileWidth(width) {
  return Math.round(Math.max(
    DEFAULT_FILE_MIN_WIDTH,
    Math.min(DEFAULT_FILE_MAX_WIDTH, Number.isFinite(width) ? width : DEFAULT_FILE_DEFAULT_WIDTH),
  ));
}

export function getDefaultFileHeight(width) {
  return Math.round(width * (DEFAULT_FILE_BASE_HEIGHT / DEFAULT_FILE_BASE_WIDTH));
}

// A file card's chosen colour: "#RRGGBB", or null for the default green.
export function normalizeFileColor(color) {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim().toUpperCase() : null;
}

export function formatFileSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 MB";
  }

  const megabytes = sizeBytes / (1024 * 1024);

  if (megabytes >= 1) {
    return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
  }

  const kilobytes = sizeBytes / 1024;
  return `${Math.max(1, Math.round(kilobytes))} KB`;
}

// "Model.final.blend" -> { name: "Model.final", extension: ".blend" }.
export function splitFileName(fileName) {
  const value = String(fileName ?? "").trim();
  const dot = value.lastIndexOf(".");

  return dot > 0
    ? { name: value.slice(0, dot), extension: value.slice(dot).toLowerCase() }
    : { name: value, extension: "" };
}

// The right-click menu's "Change colour" asks the tile to open its colour
// panel with this window event ({ detail: { tileId } }).
export const OPEN_FILE_COLOR_EVENT = "airpaste:open-file-color";
