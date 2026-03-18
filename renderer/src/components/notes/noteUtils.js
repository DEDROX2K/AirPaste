import {
  NOTE_STYLE_ONE,
  NOTE_STYLE_THREE,
} from "../../lib/workspace";

export const DEFAULT_NOTE_ONE_TITLE = "Things to do today";
export const DEFAULT_NOTE_ONE_FOOTER = "A side note here";
export const DEFAULT_NOTE_ONE_ITEMS = [
  { text: "Design a snap shot", checked: false },
  { text: "Design a snap shot", checked: true },
  { text: "Design a snap shot", checked: true },
  { text: "Design a snap shot", checked: true },
  { text: "Design a snap shot", checked: false },
  { text: "Design a snap shot", checked: false },
];
export const DEFAULT_NOTE_TITLE = "Build review";
export const DEFAULT_SECONDARY_TITLE = "Second column";
export const DEFAULT_META_LINES = ["Title: Build", "Author: Neil"];
export const DEFAULT_SECTION_LABEL = "Review:";
export const DEFAULT_BODY_PLACEHOLDER = "Start typing your review here.";
export const DEFAULT_QUOTE_LABEL = "Quote";
export const DEFAULT_QUOTE_PLACEHOLDER = "Write a quote worth keeping.";
export const DEFAULT_QUOTE_AUTHOR_PLACEHOLDER = "By who?";

export function getTextNoteVariant(card) {
  if (card.noteStyle === NOTE_STYLE_ONE) {
    return "note1";
  }

  if (card.noteStyle === NOTE_STYLE_THREE) {
    return "note3";
  }

  return "note2";
}

export function getMagnifiedTextNoteStyle(card, isSplit = false) {
  const variant = getTextNoteVariant(card);

  if (variant === "note3") {
    return {
      width: "min(760px, calc(100vw - 72px))",
      height: "min(820px, calc(100vh - 88px))",
    };
  }

  if (variant === "note1") {
    return {
      width: "min(540px, calc(100vw - 72px))",
      height: "min(760px, calc(100vh - 88px))",
    };
  }

  return {
    width: isSplit
      ? "min(820px, calc(100vw - 72px))"
      : "min(520px, calc(100vw - 72px))",
    height: isSplit
      ? "min(760px, calc(100vh - 88px))"
      : "min(700px, calc(100vh - 88px))",
  };
}

export function formatNoteTimestamp(timestamp) {
  const parsedTimestamp = timestamp ? new Date(timestamp) : new Date();
  const safeTimestamp = Number.isNaN(parsedTimestamp.getTime()) ? new Date() : parsedTimestamp;

  return {
    dateLabel: new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(safeTimestamp),
    timeLabel: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(safeTimestamp),
    weekdayLabel: new Intl.DateTimeFormat(undefined, {
      weekday: "long",
    }).format(safeTimestamp),
  };
}

export function truncateCopy(text, maxLength = 140) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

export function parseChecklistLine(line) {
  const normalizedLine = String(line ?? "").trim();

  if (!normalizedLine) {
    return null;
  }

  const checkboxMatch = normalizedLine.match(/^(?:[-*•]\s*)?\[(?<state>\s|x|X)\]\s*(?<label>.+)$/);

  if (checkboxMatch?.groups?.label) {
    return {
      text: checkboxMatch.groups.label.trim(),
      checked: checkboxMatch.groups.state.toLowerCase() === "x",
    };
  }

  return {
    text: normalizedLine.replace(/^(?:[-*•]\s+)/, "").trim(),
    checked: false,
  };
}

function splitParagraphBlocks(lines) {
  const blocks = [];
  let currentBlock = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }

      continue;
    }

    currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

export function parseChecklistNote(text, fallbackTitle = DEFAULT_NOTE_ONE_TITLE) {
  const normalizedText = String(text ?? "").replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");
  const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstNonEmptyLineIndex === -1) {
    return {
      title: fallbackTitle,
      items: [],
      footer: "",
      hasContent: false,
      isPlaceholder: true,
    };
  }

  const title = lines[firstNonEmptyLineIndex].trim() || fallbackTitle;
  const remainingLines = lines.slice(firstNonEmptyLineIndex + 1);
  const blocks = splitParagraphBlocks(remainingLines);
  let footer = "";
  let itemBlocks = blocks;

  if (blocks.length > 1) {
    const lastBlock = blocks.at(-1) ?? [];
    const lastBlockLooksLikeChecklist = lastBlock.every((line) => Boolean(parseChecklistLine(line)));

    if (!lastBlockLooksLikeChecklist) {
      footer = lastBlock.join("\n").trim();
      itemBlocks = blocks.slice(0, -1);
    }
  }

  const items = itemBlocks
    .flat()
    .map(parseChecklistLine)
    .filter((item) => item?.text);

  return {
    title,
    items,
    footer,
    hasContent: normalizedText.trim().length > 0,
    isPlaceholder: false,
  };
}

export function serializeChecklistNote({ title, items, footer }, fallbackTitle = DEFAULT_NOTE_ONE_TITLE) {
  const cleanTitle = String(title ?? "").trim();
  const cleanItems = Array.isArray(items)
    ? items
      .map((item) => ({
        text: String(item?.text ?? "").trim(),
        checked: Boolean(item?.checked),
      }))
      .filter((item) => item.text.length > 0)
    : [];
  const cleanFooter = String(footer ?? "").replace(/\r\n/g, "\n").trim();

  if (!cleanTitle && cleanItems.length === 0 && !cleanFooter) {
    return "";
  }

  const parts = [cleanTitle || fallbackTitle];

  if (cleanItems.length > 0) {
    parts.push(cleanItems.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`).join("\n"));
  }

  if (cleanFooter) {
    parts.push(cleanFooter);
  }

  return parts.join("\n\n");
}

export function getEditableChecklistItems(items) {
  const normalizedItems = Array.isArray(items)
    ? items
      .map((item) => ({
        text: String(item?.text ?? ""),
        checked: Boolean(item?.checked),
      }))
      .filter((item) => item.text.trim().length > 0)
    : [];
  const targetRowCount = normalizedItems.length >= DEFAULT_NOTE_ONE_ITEMS.length
    ? normalizedItems.length + 1
    : DEFAULT_NOTE_ONE_ITEMS.length;
  const rows = [...normalizedItems];

  while (rows.length < targetRowCount) {
    rows.push({ text: "", checked: false });
  }

  return rows;
}

export function normalizeMetaLines(metaText) {
  return String(metaText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseNoteDocument(text, fallbackTitle) {
  const normalizedText = String(text ?? "").replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");
  const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstNonEmptyLineIndex === -1) {
    return {
      title: fallbackTitle,
      metaLines: [...DEFAULT_META_LINES],
      metaText: DEFAULT_META_LINES.join("\n"),
      sectionLabel: DEFAULT_SECTION_LABEL,
      body: "",
      hasContent: false,
      isPlaceholder: true,
    };
  }

  const title = lines[firstNonEmptyLineIndex].trim() || fallbackTitle;
  let cursor = firstNonEmptyLineIndex + 1;

  while (cursor < lines.length && lines[cursor].trim().length === 0) {
    cursor += 1;
  }

  const metaLines = [];

  while (cursor < lines.length) {
    const trimmedLine = lines[cursor].trim();

    if (!trimmedLine) {
      cursor += 1;
      break;
    }

    if (!/^[^:]{1,24}:\s*.+$/.test(trimmedLine)) {
      break;
    }

    metaLines.push(trimmedLine);
    cursor += 1;
  }

  while (cursor < lines.length && lines[cursor].trim().length === 0) {
    cursor += 1;
  }

  let sectionLabel = DEFAULT_SECTION_LABEL;

  if (cursor < lines.length && /^[^:]{1,32}:\s*$/.test(lines[cursor].trim())) {
    sectionLabel = lines[cursor].trim();
    cursor += 1;
  }

  while (cursor < lines.length && lines[cursor].trim().length === 0) {
    cursor += 1;
  }

  return {
    title,
    metaLines,
    metaText: metaLines.join("\n"),
    sectionLabel,
    body: lines.slice(cursor).join("\n").replace(/\s+$/, ""),
    hasContent: normalizedText.trim().length > 0,
    isPlaceholder: false,
  };
}

export function serializeNoteDocument({ title, metaText, sectionLabel, body }, fallbackTitle) {
  const cleanMetaLines = normalizeMetaLines(metaText);
  const cleanTitle = String(title ?? "").trim();
  const cleanBody = String(body ?? "").replace(/\r\n/g, "\n").trimEnd();
  const rawSectionLabel = String(sectionLabel ?? "").trim();
  const cleanSectionLabel = rawSectionLabel
    ? (rawSectionLabel.endsWith(":") ? rawSectionLabel : `${rawSectionLabel}:`)
    : "";

  if (!cleanTitle && cleanMetaLines.length === 0 && !cleanBody) {
    return "";
  }

  const parts = [
    cleanTitle || fallbackTitle,
    cleanMetaLines.length > 0 ? cleanMetaLines.join("\n") : "",
    cleanSectionLabel || DEFAULT_SECTION_LABEL,
    cleanBody,
  ].filter(Boolean);

  return parts.join("\n\n");
}

export function getFolderNotePreview(note) {
  if (note.noteStyle === NOTE_STYLE_ONE) {
    const document = parseChecklistNote(note.text, DEFAULT_NOTE_ONE_TITLE);
    const itemSnippet = document.items.slice(0, 2).map((item) => item.text).join(" · ");

    return {
      title: document.title,
      snippet: itemSnippet || document.footer || DEFAULT_NOTE_ONE_FOOTER,
    };
  }

  if (note.noteStyle === NOTE_STYLE_THREE) {
    const quote = truncateCopy(note.text, 180);
    const author = String(note.quoteAuthor ?? "").trim();

    return {
      title: author ? `By ${author}` : DEFAULT_QUOTE_LABEL,
      snippet: quote || DEFAULT_QUOTE_PLACEHOLDER,
    };
  }

  const document = parseNoteDocument(note.text, DEFAULT_NOTE_TITLE);

  return {
    title: document.title,
    snippet: document.body || document.metaLines.join(" ") || DEFAULT_BODY_PLACEHOLDER,
  };
}
