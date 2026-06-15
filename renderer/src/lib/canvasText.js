export const CANVAS_TEXT_SOURCE_LOCAL = "local";
export const CANVAS_TEXT_SOURCE_FILE = "file";
export const CANVAS_TEXT_VARIANT_DEFAULT = "default";
export const CANVAS_TEXT_VARIANT_STICKY = "sticky";
export const CANVAS_TEXT_FORMAT_MARKDOWN = "markdown";
export const CANVAS_TEXT_TITLE_MODE_DERIVED = "derived";
export const CANVAS_TEXT_TITLE_MODE_CUSTOM = "custom";

export const CANVAS_TEXT_DEFAULT_SIZE = Object.freeze({
  width: 420,
  height: 220,
});

export const CANVAS_TEXT_STICKY_SIZE = Object.freeze({
  width: 240,
  height: 180,
});

export const CANVAS_TEXT_MIN_WIDTH = 180;
export const CANVAS_TEXT_MIN_HEIGHT = 80;
export const STICKY_NOTE_DETAIL_BODY_LINE_LIMIT = 4;
export const STICKY_NOTE_DETAIL_FOOTER_LINE_LIMIT = 2;
export const STICKY_NOTE_COMPACT_LINE_LIMIT = 3;
export const STICKY_NOTE_COMPACT_BAR_WIDTHS = Object.freeze([0.82, 0.82, 0.42]);
export const STICKY_NOTE_TITLE_PLACEHOLDER = "ENTER TITLE HERE";
export const STICKY_NOTE_BODY_PLACEHOLDER = "TYPE HERE...";

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

export function normalizeCanvasTextContent(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeCanvasTextSource(value) {
  return value === CANVAS_TEXT_SOURCE_FILE ? CANVAS_TEXT_SOURCE_FILE : CANVAS_TEXT_SOURCE_LOCAL;
}

export function normalizeCanvasTextVariant(value) {
  return value === CANVAS_TEXT_VARIANT_STICKY ? CANVAS_TEXT_VARIANT_STICKY : CANVAS_TEXT_VARIANT_DEFAULT;
}

export function normalizeCanvasTextTitleMode(value) {
  return value === CANVAS_TEXT_TITLE_MODE_CUSTOM ? CANVAS_TEXT_TITLE_MODE_CUSTOM : CANVAS_TEXT_TITLE_MODE_DERIVED;
}

export function stripMarkdownFormatting(line) {
  return String(line ?? "")
    .replace(/^\s{0,3}(#{1,6})\s+/, "")
    .replace(/^\s*[-*+]\s+\[(?: |x|X)\]\s+/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .trim();
}

export function extractMarkdownDisplayLines(markdown) {
  return normalizeCanvasTextContent(markdown)
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map(stripMarkdownFormatting)
    .filter(Boolean);
}

function splitStickyNoteCompatibilityContent(markdown) {
  const normalizedText = normalizeCanvasTextContent(markdown).replaceAll("\r\n", "\n");
  const lines = normalizedText.split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentLineIndex < 0) {
    return {
      title: "",
      bodyText: normalizedText,
    };
  }

  const title = stripMarkdownFormatting(lines[firstContentLineIndex]);
  const bodyLines = [...lines];
  bodyLines.splice(firstContentLineIndex, 1);

  while (bodyLines.length > 0 && bodyLines[0].trim().length === 0) {
    bodyLines.shift();
  }

  return {
    title,
    bodyText: bodyLines.join("\n").trimEnd(),
  };
}

export function isStickyCanvasTextCard(card) {
  return isCanvasTextCard(card) && normalizeCanvasTextVariant(card?.variant) === CANVAS_TEXT_VARIANT_STICKY;
}

export function deriveStickyNoteDocument(card, textOverride = null) {
  const rawTitle = firstString(card?.title);
  const rawBodyText = normalizeCanvasTextContent(
    typeof textOverride === "string" ? textOverride : card?.text,
  );
  const titleMode = normalizeCanvasTextTitleMode(card?.titleMode);

  if (rawTitle.length > 0 || titleMode === CANVAS_TEXT_TITLE_MODE_CUSTOM) {
    return {
      title: rawTitle,
      bodyText: rawBodyText,
      bodyLines: extractMarkdownDisplayLines(rawBodyText),
      usedCompatibilitySplit: false,
    };
  }

  const compatibilityDocument = splitStickyNoteCompatibilityContent(rawBodyText);
  return {
    title: compatibilityDocument.title,
    bodyText: compatibilityDocument.bodyText,
    bodyLines: extractMarkdownDisplayLines(compatibilityDocument.bodyText),
    usedCompatibilitySplit: compatibilityDocument.title.length > 0
      || compatibilityDocument.bodyText !== rawBodyText,
  };
}

export function deriveStickyNoteFileDocument(markdown, fallbackTitle = "") {
  const normalizedText = normalizeCanvasTextContent(markdown).replaceAll("\r\n", "\n").trimEnd();
  const lines = normalizedText.split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentLineIndex < 0) {
    return {
      title: firstString(fallbackTitle),
      bodyText: "",
      bodyLines: [],
    };
  }

  const firstLine = lines[firstContentLineIndex];
  const headingMatch = firstLine.match(/^\s{0,3}#{1,6}\s+(.+)$/);
  if (headingMatch) {
    const bodyLines = [...lines];
    bodyLines.splice(firstContentLineIndex, 1);

    while (bodyLines.length > 0 && bodyLines[0].trim().length === 0) {
      bodyLines.shift();
    }

    const bodyText = bodyLines.join("\n").trimEnd();
    return {
      title: stripMarkdownFormatting(firstLine),
      bodyText,
      bodyLines: extractMarkdownDisplayLines(bodyText),
    };
  }

  return {
    title: firstString(fallbackTitle),
    bodyText: normalizedText,
    bodyLines: extractMarkdownDisplayLines(normalizedText),
  };
}

export function getStickyNoteNormalizationPatch(card, textOverride = null) {
  if (!isStickyCanvasTextCard(card)) {
    return null;
  }

  const stickyDocument = deriveStickyNoteDocument(card, textOverride);
  const nextPatch = {};
  const currentTitle = typeof card?.title === "string" ? card.title : "";
  const currentBodyText = normalizeCanvasTextContent(card?.text);

  if (stickyDocument.title !== currentTitle) {
    nextPatch.title = stickyDocument.title;
  }

  if (stickyDocument.bodyText !== currentBodyText) {
    nextPatch.text = stickyDocument.bodyText;
  }

  if (normalizeCanvasTextTitleMode(card?.titleMode) !== CANVAS_TEXT_TITLE_MODE_CUSTOM) {
    nextPatch.titleMode = CANVAS_TEXT_TITLE_MODE_CUSTOM;
  }

  return Object.keys(nextPatch).length > 0 ? nextPatch : null;
}

export function deriveStickyNoteViewModel(card, textOverride = null) {
  const stickyDocument = deriveStickyNoteDocument(card, textOverride);

  return {
    title: stickyDocument.title,
    bodyText: stickyDocument.bodyText,
    bodyLines: stickyDocument.bodyLines,
    detailBodyLines: stickyDocument.bodyLines.slice(0, STICKY_NOTE_DETAIL_BODY_LINE_LIMIT),
    detailFooterLines: stickyDocument.bodyLines.slice(
      STICKY_NOTE_DETAIL_BODY_LINE_LIMIT,
      STICKY_NOTE_DETAIL_BODY_LINE_LIMIT + STICKY_NOTE_DETAIL_FOOTER_LINE_LIMIT,
    ),
    compactLines: stickyDocument.bodyLines.slice(0, STICKY_NOTE_COMPACT_LINE_LIMIT),
    hasBodyContent: stickyDocument.bodyLines.length > 0,
  };
}

export function composeStickyNoteFileContent(title, bodyText) {
  const normalizedTitle = firstString(title);
  const normalizedBodyText = normalizeCanvasTextContent(bodyText)
    .replaceAll("\r\n", "\n")
    .trimEnd();

  if (normalizedTitle && normalizedBodyText) {
    return `# ${normalizedTitle}\n\n${normalizedBodyText}`;
  }

  if (normalizedTitle) {
    return `# ${normalizedTitle}`;
  }

  return normalizedBodyText;
}

export function resolveStickyNoteLayoutMetrics(width, height, renderState = "detail") {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : CANVAS_TEXT_STICKY_SIZE.width);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : CANVAS_TEXT_STICKY_SIZE.height);
  const isCompact = renderState === "compact";
  const gap = isCompact ? clamp(safeHeight * 0.028, 3, 5) : clamp(safeHeight * 0.04, 6, 8);
  const headerHeight = isCompact ? clamp(safeHeight * 0.09, 12, 18) : clamp(safeHeight * 0.13, 28, 40);
  const footerHeight = isCompact ? clamp(safeHeight * 0.16, 18, 26) : clamp(safeHeight * 0.23, 30, 42);
  const bodyHeight = Math.max(24, safeHeight - headerHeight - footerHeight - (gap * 2));
  const titleFontSize = isCompact ? 0 : clamp(safeWidth * 0.1, 18, 28);
  const bodyFontSize = isCompact ? 0 : clamp(safeWidth * 0.055, 13, 16);
  const footerFontSize = isCompact ? 0 : clamp(safeWidth * 0.05, 12, 15);
  const compactBarHeight = isCompact ? clamp(bodyHeight * 0.12, 4, 7) : 0;
  const compactBarGap = isCompact ? Math.max(5, compactBarHeight + 2) : 0;

  return {
    gap,
    chamfer: isCompact ? clamp(safeWidth * 0.045, 6, 10) : clamp(safeWidth * 0.075, 12, 18),
    headerHeight,
    footerHeight,
    bodyHeight,
    headerPaddingX: isCompact ? clamp(safeWidth * 0.06, 10, 14) : clamp(safeWidth * 0.11, 18, 24),
    headerPaddingTop: isCompact ? 0 : clamp(safeHeight * 0.05, 8, 10),
    headerPaddingBottom: isCompact ? 0 : clamp(safeHeight * 0.06, 8, 12),
    bodyPaddingX: isCompact ? clamp(safeWidth * 0.06, 10, 14) : clamp(safeWidth * 0.09, 16, 20),
    bodyPaddingTop: isCompact ? clamp(safeHeight * 0.07, 10, 12) : clamp(safeHeight * 0.09, 14, 18),
    bodyPaddingBottom: isCompact ? clamp(safeHeight * 0.07, 10, 12) : clamp(safeHeight * 0.11, 16, 20),
    footerPaddingX: isCompact ? 0 : clamp(safeWidth * 0.09, 16, 20),
    footerPaddingTop: isCompact ? 0 : clamp(safeHeight * 0.06, 10, 12),
    footerPaddingBottom: isCompact ? 0 : clamp(safeHeight * 0.08, 12, 16),
    titleFontSize,
    bodyFontSize,
    footerFontSize,
    bodyLineHeight: bodyFontSize > 0 ? bodyFontSize + 4 : 0,
    footerLineHeight: footerFontSize > 0 ? footerFontSize + 3 : 0,
    compactBarHeight,
    compactBarGap,
    compactBarWidths: STICKY_NOTE_COMPACT_BAR_WIDTHS,
  };
}

export function deriveCanvasTextDisplayModel(card, textOverride = null) {
  if (isStickyCanvasTextCard(card)) {
    const stickyNote = deriveStickyNoteDocument(card, textOverride);
    return {
      title: stickyNote.title,
      bodyMarkdown: stickyNote.bodyText,
      bodyLines: stickyNote.bodyLines,
    };
  }

  const text = typeof textOverride === "string" ? textOverride : normalizeCanvasTextContent(card?.text);
  const normalizedText = text.replaceAll("\r\n", "\n");
  const lines = normalizedText.split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim().length > 0);
  const titleMode = normalizeCanvasTextTitleMode(card?.titleMode);
  const derivedDisplayTitle = extractMarkdownDisplayLines(normalizedText)[0] ?? "";
  const fallbackTitle = firstString(card?.title);
  const fileTitle = firstString(card?.file?.fileName);

  let title = "";
  if (titleMode === CANVAS_TEXT_TITLE_MODE_DERIVED) {
    title = derivedDisplayTitle || fallbackTitle || fileTitle;
  } else {
    title = fallbackTitle || fileTitle || derivedDisplayTitle;
  }

  let bodyMarkdown = normalizedText;
  if (titleMode === CANVAS_TEXT_TITLE_MODE_DERIVED && firstContentLineIndex >= 0) {
    const bodyLines = [...lines];
    bodyLines.splice(firstContentLineIndex, 1);

    while (bodyLines.length > 0 && bodyLines[0].trim().length === 0) {
      bodyLines.shift();
    }

    bodyMarkdown = bodyLines.join("\n").trimEnd();
  }

  return {
    title,
    bodyMarkdown,
    bodyLines: extractMarkdownDisplayLines(bodyMarkdown),
  };
}

export function deriveCanvasTextTitle(card) {
  if (isStickyCanvasTextCard(card)) {
    return firstString(deriveStickyNoteDocument(card).title, "Untitled note");
  }

  const titleMode = normalizeCanvasTextTitleMode(card?.titleMode);
  if (titleMode === CANVAS_TEXT_TITLE_MODE_CUSTOM) {
    return firstString(card?.title, card?.file?.fileName, "Untitled note");
  }

  if (normalizeCanvasTextSource(card?.source) === CANVAS_TEXT_SOURCE_FILE) {
    return firstString(card?.title, card?.file?.fileName, "Untitled note");
  }

  return firstString(
    ...extractMarkdownDisplayLines(card?.text).slice(0, 1),
    card?.title,
    "Untitled note",
  );
}

export function deriveCanvasTextSummary(markdown, maxLines = 4) {
  return extractMarkdownDisplayLines(markdown)
    .slice(0, Math.max(1, maxLines))
    .join("\n");
}

export function getCanvasTextLineCount(markdown) {
  return Math.max(1, normalizeCanvasTextContent(markdown).replaceAll("\r\n", "\n").split("\n").length);
}

export function isCanvasTextCard(card) {
  return card?.type === "canvas-text";
}
