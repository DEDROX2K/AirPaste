import {
  firstString,
  getNextCardPosition,
  nowIso,
  normalizeCard,
  normalizeFileExtension,
} from "../../lib/workspace";
import {
  CANVAS_TEXT_DEFAULT_SIZE,
  CANVAS_TEXT_FORMAT_MARKDOWN,
  CANVAS_TEXT_FORMAT_PLAIN,
  CANVAS_TEXT_MIN_HEIGHT,
  CANVAS_TEXT_MIN_WIDTH,
  CANVAS_TEXT_SOURCE_FILE,
  CANVAS_TEXT_SOURCE_LOCAL,
  CANVAS_TEXT_STICKY_SIZE,
  CANVAS_TEXT_TITLE_MODE_CUSTOM,
  CANVAS_TEXT_TITLE_MODE_DERIVED,
  CANVAS_TEXT_VARIANT_DEFAULT,
  CANVAS_TEXT_VARIANT_STICKY,
  QUICK_TEXT_MIN_HEIGHT,
  QUICK_TEXT_MIN_WIDTH,
  deriveStickyNoteDocument,
  normalizeCanvasTextContent,
  normalizeCanvasTextSource,
  normalizeCanvasTextTitleMode,
  normalizeCanvasTextVariant,
} from "../../lib/canvasText";
import {
  normalizeTextBoxStyle,
  normalizeTextBoxText,
  TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT,
  TEXT_BOX_DEFAULT_TEXT,
} from "../../lib/textBoxStyle";
import TILE_TYPES from "../tileTypes";
import { normalizeStickyStyle } from "../sticky/model";

export const CANVAS_TEXT_CARD_TYPE = TILE_TYPES.CANVAS_TEXT;
export const NOTE_CARD_TYPE = TILE_TYPES.NOTE;
export const TEXT_BOX_CARD_TYPE = TILE_TYPES.TEXT_BOX;

export const NOTE_CARD_SIZE = CANVAS_TEXT_DEFAULT_SIZE;
export const TEXT_BOX_CARD_SIZE = CANVAS_TEXT_DEFAULT_SIZE;
export const STICKY_TEXT_BOX_CARD_SIZE = CANVAS_TEXT_STICKY_SIZE;
export const TEXT_BOX_MIN_WIDTH = CANVAS_TEXT_MIN_WIDTH;
export const TEXT_BOX_MIN_HEIGHT = CANVAS_TEXT_MIN_HEIGHT;
export const NOTE_DEFAULT_TITLE = "Untitled note";

export function normalizeLanguageHints(languageHints) {
  return Array.isArray(languageHints)
    ? [...new Set(
      languageHints
        .filter((hint) => typeof hint === "string")
        .map((hint) => hint.trim())
        .filter((hint) => hint.length > 0),
    )]
    : [];
}

export function normalizeCanvasTextFileMeta(file) {
  if (!file || typeof file !== "object") {
    return null;
  }

  const relativePath = typeof file.relativePath === "string" ? file.relativePath.trim() : "";
  if (!relativePath) {
    return null;
  }

  const fileName = typeof file.fileName === "string" && file.fileName.trim().length > 0
    ? file.fileName.trim()
    : relativePath.split(/[\\/]/).pop() ?? "";
  const extension = normalizeFileExtension(file.extension || fileName.split(".").pop() || "md");

  return {
    relativePath,
    fileName,
    extension: extension || "md",
    mimeType: typeof file.mimeType === "string" && file.mimeType.trim().length > 0
      ? file.mimeType.trim()
      : "text/markdown",
    sizeBytes: Number.isFinite(file.sizeBytes) ? Math.max(0, file.sizeBytes) : 0,
    updatedAt: typeof file.updatedAt === "string" ? file.updatedAt : "",
  };
}

export function normalizeCanvasTextPayload(card) {
  const isLegacyTextBox = card?.type === TEXT_BOX_CARD_TYPE;
  const isLegacyNote = card?.type === NOTE_CARD_TYPE;
  const variant = normalizeCanvasTextVariant(
    card?.variant ?? (card?.appearance === "sticky" ? CANVAS_TEXT_VARIANT_STICKY : CANVAS_TEXT_VARIANT_DEFAULT),
  );
  const source = normalizeCanvasTextSource(
    card?.source ?? ((card?.file?.relativePath && normalizeFileExtension(card?.file?.extension || card?.file?.fileName?.split(".").pop()) === "md")
      ? CANVAS_TEXT_SOURCE_FILE
      : CANVAS_TEXT_SOURCE_LOCAL),
  );
  const legacyText = isLegacyTextBox
    ? normalizeTextBoxText(card?.text)
    : normalizeCanvasTextContent(card?.text);
  const text = normalizeCanvasTextContent(
    isLegacyNote ? String(card?.body ?? "") : legacyText,
  );
  const format = isLegacyTextBox
    ? CANVAS_TEXT_FORMAT_PLAIN
    : (card?.format === CANVAS_TEXT_FORMAT_PLAIN ? CANVAS_TEXT_FORMAT_PLAIN : CANVAS_TEXT_FORMAT_MARKDOWN);
  const title = typeof card?.title === "string" ? card.title : "";
  const titleMode = normalizeCanvasTextTitleMode(
    card?.titleMode ?? (isLegacyNote && title.trim().length > 0 ? CANVAS_TEXT_TITLE_MODE_CUSTOM : CANVAS_TEXT_TITLE_MODE_DERIVED),
  );
  const style = format === CANVAS_TEXT_FORMAT_PLAIN
    ? normalizeTextBoxStyle(card?.style)
    : null;
  const placeholder = format === CANVAS_TEXT_FORMAT_PLAIN && card?.placeholder === true;
  const placeholderText = format === CANVAS_TEXT_FORMAT_PLAIN
    ? (typeof card?.placeholderText === "string" && card.placeholderText.length > 0
      ? card.placeholderText
      : TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT)
    : TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT;
  const autoWidth = format === CANVAS_TEXT_FORMAT_PLAIN
    ? card?.autoWidth !== false
    : false;

  if (variant === CANVAS_TEXT_VARIANT_STICKY) {
    const stickyDocument = deriveStickyNoteDocument({
      title,
      text,
      titleMode,
    });

    return {
      source,
      variant,
      format: CANVAS_TEXT_FORMAT_MARKDOWN,
      text: stickyDocument.bodyText,
      title: stickyDocument.title,
      titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM,
      file: source === CANVAS_TEXT_SOURCE_FILE ? normalizeCanvasTextFileMeta(card?.file) : null,
      style: null,
      placeholder: false,
      placeholderText: TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT,
      autoWidth: false,
      sticky: normalizeStickyStyle(card?.sticky),
    };
  }

  return {
    source,
    variant,
    format,
    text,
    title,
    titleMode,
    file: source === CANVAS_TEXT_SOURCE_FILE ? normalizeCanvasTextFileMeta(card?.file) : null,
    style,
    placeholder,
    placeholderText,
    autoWidth,
    sticky: null,
  };
}

export function createNoteCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CANVAS_TEXT_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CANVAS_TEXT_CARD_TYPE,
    source: CANVAS_TEXT_SOURCE_LOCAL,
    variant: CANVAS_TEXT_VARIANT_DEFAULT,
    format: CANVAS_TEXT_FORMAT_MARKDOWN,
    title: firstString(options?.title),
    titleMode: firstString(options?.title)
      ? CANVAS_TEXT_TITLE_MODE_CUSTOM
      : CANVAS_TEXT_TITLE_MODE_DERIVED,
    text: typeof options?.text === "string"
      ? options.text
      : (typeof options?.body === "string" ? options.body : ""),
    languageHints: normalizeLanguageHints(options?.languageHints),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createTextBoxCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CANVAS_TEXT_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();
  const variant = normalizeCanvasTextVariant(
    options?.variant ?? (options?.appearance === "sticky" ? CANVAS_TEXT_VARIANT_STICKY : CANVAS_TEXT_VARIANT_DEFAULT),
  );
  const defaultSize = variant === CANVAS_TEXT_VARIANT_STICKY ? STICKY_TEXT_BOX_CARD_SIZE : TEXT_BOX_CARD_SIZE;
  const width = Number.isFinite(options?.width)
    ? options.width
    : defaultSize.width;
  const height = Number.isFinite(options?.height)
    ? options.height
    : defaultSize.height;
  // options.x / options.y place the top-left corner exactly (quick text
  // puts its caret on the click point); otherwise centre on preferredCenter.
  const x = Number.isFinite(options?.x)
    ? Math.round(options.x)
    : Number.isFinite(preferredCenter?.x)
      ? Math.round(preferredCenter.x - width / 2)
      : position.x;
  const y = Number.isFinite(options?.y)
    ? Math.round(options.y)
    : Number.isFinite(preferredCenter?.y)
      ? Math.round(preferredCenter.y - height / 2)
      : position.y;
  const isStickyVariant = variant === CANVAS_TEXT_VARIANT_STICKY;
  const nextTitle = isStickyVariant
    ? (typeof options?.title === "string" ? options.title.trim() : "")
    : firstString(options?.title);
  const nextText = typeof options?.text === "string"
    ? options.text
    : (isStickyVariant ? "" : TEXT_BOX_DEFAULT_TEXT);
  const nextTitleMode = isStickyVariant
    ? CANVAS_TEXT_TITLE_MODE_CUSTOM
    : (nextTitle ? CANVAS_TEXT_TITLE_MODE_CUSTOM : CANVAS_TEXT_TITLE_MODE_DERIVED);

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CANVAS_TEXT_CARD_TYPE,
    source: CANVAS_TEXT_SOURCE_LOCAL,
    variant,
    format: CANVAS_TEXT_FORMAT_PLAIN,
    title: nextTitle,
    titleMode: nextTitleMode,
    text: nextText,
    style: normalizeTextBoxStyle(options?.style),
    placeholder: options?.placeholder === true,
    placeholderText: typeof options?.placeholderText === "string" && options.placeholderText.length > 0
      ? options.placeholderText
      : TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT,
    autoWidth: options?.autoWidth !== false,
    sticky: isStickyVariant ? options?.sticky : null,
    x,
    y,
    width: Math.max(isStickyVariant ? TEXT_BOX_MIN_WIDTH : QUICK_TEXT_MIN_WIDTH, width),
    height: Math.max(isStickyVariant ? TEXT_BOX_MIN_HEIGHT : QUICK_TEXT_MIN_HEIGHT, height),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createCanvasTextCard(cards, viewport, preferredCenter = null, options = {}) {
  if (options?.source === CANVAS_TEXT_SOURCE_FILE && options?.file) {
    const position = getNextCardPosition(cards, viewport, CANVAS_TEXT_CARD_TYPE, preferredCenter);
    const timestamp = nowIso();
    const variant = normalizeCanvasTextVariant(options?.variant);
    const defaultSize = variant === CANVAS_TEXT_VARIANT_STICKY ? STICKY_TEXT_BOX_CARD_SIZE : TEXT_BOX_CARD_SIZE;
    const file = normalizeCanvasTextFileMeta(options.file);
    const initialTitle = firstString(options?.title);
    const initialTitleMode = normalizeCanvasTextTitleMode(options?.titleMode);
    const initialText = normalizeCanvasTextContent(options?.text);
    const stickyDocument = variant === CANVAS_TEXT_VARIANT_STICKY
      ? deriveStickyNoteDocument({
        title: initialTitle,
        titleMode: initialTitleMode,
        text: initialText,
      })
      : null;

    return normalizeCard({
      id: crypto.randomUUID(),
      type: CANVAS_TEXT_CARD_TYPE,
      source: CANVAS_TEXT_SOURCE_FILE,
      variant,
      format: CANVAS_TEXT_FORMAT_MARKDOWN,
      title: stickyDocument ? stickyDocument.title : initialTitle,
      titleMode: stickyDocument ? CANVAS_TEXT_TITLE_MODE_CUSTOM : initialTitleMode,
      text: stickyDocument ? stickyDocument.bodyText : initialText,
      file,
      x: position.x,
      y: position.y,
      width: Number.isFinite(options?.width) ? options.width : defaultSize.width,
      height: Number.isFinite(options?.height) ? options.height : defaultSize.height,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  if (options?.variant === CANVAS_TEXT_VARIANT_STICKY || options?.appearance === "sticky") {
    return createTextBoxCard(cards, viewport, preferredCenter, {
      ...options,
      variant: CANVAS_TEXT_VARIANT_STICKY,
    });
  }

  return createNoteCard(cards, viewport, preferredCenter, options);
}
