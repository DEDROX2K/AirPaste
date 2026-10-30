// FigJam-style sticky note: a flat pastel square whose text, padding,
// corner radius and author label all scale with its size (k = size / 240).
// A sticky is a canvas-text card (variant "sticky"); this is its `sticky`
// field -- design, colour and whole-note formatting.
//
// `design` picks the look. "classic" is the FigJam square; every other
// design brings its own palette and text sizes (STICKY_DESIGN_OPTIONS), so
// colour and size are checked against the design they belong to.

export const STICKY_BASE_SIZE = 240;
export const STICKY_MIN_SIZE = 96;
export const STICKY_MAX_SIZE = 640;
// Gap between a sticky and one added next to it with a "+" button.
export const STICKY_ADJACENT_GAP = 24;

export const STICKY_COLORS = Object.freeze([
  { id: "yellow", name: "Yellow", hex: "#FFE27A" },
  { id: "orange", name: "Orange", hex: "#FFC48C" },
  { id: "red", name: "Red", hex: "#FF9A8B" },
  { id: "pink", name: "Pink", hex: "#FFB5D6" },
  { id: "violet", name: "Violet", hex: "#D4BBFF" },
  { id: "blue", name: "Blue", hex: "#A9D5FF" },
  { id: "teal", name: "Teal", hex: "#92E4DD" },
  { id: "green", name: "Green", hex: "#A9E8A0" },
  { id: "gray", name: "Gray", hex: "#E3E3E3" },
  { id: "white", name: "White", hex: "#FFFFFF" },
]);

// Text size at the base 240px note; it scales with the note.
export const STICKY_FONT_SIZES = Object.freeze({ s: 16, m: 24, l: 34 });
export const STICKY_FONT_SIZE_LABELS = Object.freeze({ s: "Small", m: "Medium", l: "Large" });
export const STICKY_ALIGNS = Object.freeze(["left", "center", "right"]);

export const STICKY_DESIGN_CLASSIC = "classic";
// A dark ruled sheet with a file-folder tab behind it that shows when it was
// last edited and how many lines it has. Wide, and grows down as you type.
export const STICKY_DESIGN_FOLDER = "folder";
// A coding file: a tall card in its language's colour with the file name,
// the extension (click to change language) and a button that shows the
// linked file in Explorer. Fixed proportions; scales with its width.
export const STICKY_DESIGN_CODE_FILE = "code-file";
export const STICKY_DESIGNS = Object.freeze([STICKY_DESIGN_CLASSIC, STICKY_DESIGN_FOLDER, STICKY_DESIGN_CODE_FILE]);

// Folder notes are measured at 640px wide and scale with their width
// (k = width / 640). The tab rises 104px above the sheet, which is at least
// 380px tall.
export const FOLDER_STICKY_BASE_WIDTH = 640;
export const FOLDER_STICKY_DEFAULT_WIDTH = 480;
export const FOLDER_STICKY_MIN_WIDTH = 320;
export const FOLDER_STICKY_MAX_WIDTH = 1280;
export const FOLDER_STICKY_TAB_RISE = 104;
export const FOLDER_STICKY_SHEET_MIN_HEIGHT = 380;

// `hex` is the swatch; the rest are the tile's colours (see StickyFolderTile.css).
export const FOLDER_STICKY_COLORS = Object.freeze([
  { id: "maroon", name: "Maroon", hex: "#560a10" },
  { id: "ink", name: "Ink", hex: "#1d1d22" },
  { id: "forest", name: "Forest", hex: "#1d3a2c" },
  { id: "paper", name: "Paper", hex: "#efe8d8" },
]);
export const FOLDER_STICKY_FONT_SIZES = Object.freeze({ s: 16, m: 19, l: 24, xl: 32 });
export const FOLDER_STICKY_FONT_SIZE_LABELS = Object.freeze({ s: "Small", m: "Medium", l: "Large", xl: "Huge" });

// Code file cards are measured at 497 x 735 (k = width / 497).
export const CODE_FILE_BASE_WIDTH = 497;
export const CODE_FILE_BASE_HEIGHT = 735;
export const CODE_FILE_DEFAULT_WIDTH = 300;
export const CODE_FILE_MIN_WIDTH = 160;
export const CODE_FILE_MAX_WIDTH = 994;

// A code file's colour is its language: `hex` is the card, `tint` the
// footer button, `label` the extension shown, `extensions` what a linked
// file's extension maps to.
export const CODE_FILE_LANGUAGES = Object.freeze([
  { id: "html", label: ".HTML", name: "HTML", hex: "#F25757", tint: "#FAA9A9", extensions: ["html", "htm"] },
  { id: "css", label: ".CSS", name: "CSS", hex: "#F2AF57", tint: "#F9D9AA", extensions: ["css", "scss", "sass", "less"] },
  { id: "js", label: ".JS", name: "JavaScript", hex: "#ECF258", tint: "#F6FAAA", extensions: ["js", "mjs", "cjs"] },
  { id: "react", label: ".REACT", name: "React", hex: "#C955F4", tint: "#E8ABF9", extensions: ["jsx", "tsx"] },
  { id: "ts", label: ".TS", name: "TypeScript", hex: "#3178C6", tint: "#A9C7EA", extensions: ["ts", "mts", "cts"] },
  { id: "vue", label: ".VUE", name: "Vue", hex: "#41B883", tint: "#A8E3CB", extensions: ["vue"] },
  { id: "svelte", label: ".SVELTE", name: "Svelte", hex: "#FF7A45", tint: "#FFC4A6", extensions: ["svelte"] },
  { id: "py", label: ".PY", name: "Python", hex: "#3DA5D9", tint: "#A8DBF2", extensions: ["py", "pyw", "ipynb"] },
  { id: "java", label: ".JAVA", name: "Java", hex: "#E76F00", tint: "#F7BE8A", extensions: ["java"] },
  { id: "c", label: ".C", name: "C", hex: "#6A7FDB", tint: "#BDC7EF", extensions: ["c", "h"] },
  { id: "cpp", label: ".CPP", name: "C++", hex: "#00599C", tint: "#8FB9D9", extensions: ["cpp", "cc", "cxx", "hpp", "hh"] },
  { id: "cs", label: ".CS", name: "C#", hex: "#68217A", tint: "#C7A0D0", extensions: ["cs"] },
  { id: "go", label: ".GO", name: "Go", hex: "#00ADD8", tint: "#A6E4F3", extensions: ["go"] },
  { id: "rust", label: ".RS", name: "Rust", hex: "#B7410E", tint: "#E8AE92", extensions: ["rs"] },
  { id: "php", label: ".PHP", name: "PHP", hex: "#777BB4", tint: "#C9CBE3", extensions: ["php"] },
  { id: "rb", label: ".RB", name: "Ruby", hex: "#CC342D", tint: "#EFA9A6", extensions: ["rb"] },
  { id: "swift", label: ".SWIFT", name: "Swift", hex: "#FA7343", tint: "#FDCBB3", extensions: ["swift"] },
  { id: "kt", label: ".KT", name: "Kotlin", hex: "#7F52FF", tint: "#CDBDFF", extensions: ["kt", "kts"] },
  { id: "dart", label: ".DART", name: "Dart", hex: "#40C4FF", tint: "#BDE9FF", extensions: ["dart"] },
  { id: "scala", label: ".SCALA", name: "Scala", hex: "#DC322F", tint: "#F2AAA8", extensions: ["scala", "sc"] },
  { id: "r", label: ".R", name: "R", hex: "#276DC3", tint: "#A3C4EA", extensions: ["r"] },
  { id: "lua", label: ".LUA", name: "Lua", hex: "#5B6BD6", tint: "#BFC6F0", extensions: ["lua"] },
  { id: "sh", label: ".SH", name: "Shell", hex: "#4EAA25", tint: "#B9DFA3", extensions: ["sh", "bash", "zsh"] },
  { id: "ps1", label: ".PS1", name: "PowerShell", hex: "#2671BE", tint: "#A3C4E6", extensions: ["ps1", "psm1"] },
  { id: "sql", label: ".SQL", name: "SQL", hex: "#E8A33D", tint: "#F7D6A0", extensions: ["sql"] },
  { id: "json", label: ".JSON", name: "JSON", hex: "#8BC34A", tint: "#CDE8A8", extensions: ["json", "jsonc"] },
  { id: "yaml", label: ".YAML", name: "YAML", hex: "#E0857A", tint: "#F5C9C2", extensions: ["yaml", "yml"] },
  { id: "xml", label: ".XML", name: "XML", hex: "#FF9800", tint: "#FFD9A0", extensions: ["xml", "svg"] },
  { id: "md", label: ".MD", name: "Markdown", hex: "#9E9E9E", tint: "#DADADA", extensions: ["md", "mdx"] },
  { id: "graphql", label: ".GQL", name: "GraphQL", hex: "#E10098", tint: "#F7A8D6", extensions: ["graphql", "gql"] },
  { id: "docker", label: ".DOCKER", name: "Dockerfile", hex: "#2496ED", tint: "#A8D5F7", extensions: ["dockerfile"] },
  { id: "hs", label: ".HS", name: "Haskell", hex: "#5E5086", tint: "#C4BDD9", extensions: ["hs"] },
  { id: "ex", label: ".EX", name: "Elixir", hex: "#6E4A7E", tint: "#CDBBD5", extensions: ["ex", "exs"] },
]);

const STICKY_DESIGN_OPTIONS = Object.freeze({
  [STICKY_DESIGN_CLASSIC]: { colors: STICKY_COLORS, fontSizes: STICKY_FONT_SIZES, defaultColor: "yellow" },
  [STICKY_DESIGN_FOLDER]: { colors: FOLDER_STICKY_COLORS, fontSizes: FOLDER_STICKY_FONT_SIZES, defaultColor: "maroon" },
  // One fixed text size: the name and extension fill the card.
  [STICKY_DESIGN_CODE_FILE]: { colors: CODE_FILE_LANGUAGES, fontSizes: { m: 64 }, defaultColor: "html" },
});

const DEFAULT_COLOR = "yellow";
const LAST_COLOR_STORAGE_KEY = "airpaste:sticky-last-color";

export function getStickyColorHex(colorId) {
  return (STICKY_COLORS.find((color) => color.id === colorId) ?? STICKY_COLORS[0]).hex;
}

export function clampStickySize(size) {
  return Math.round(Math.max(STICKY_MIN_SIZE, Math.min(STICKY_MAX_SIZE, Number.isFinite(size) ? size : STICKY_BASE_SIZE)));
}

export function clampFolderStickyWidth(width) {
  return Math.round(Math.max(
    FOLDER_STICKY_MIN_WIDTH,
    Math.min(FOLDER_STICKY_MAX_WIDTH, Number.isFinite(width) ? width : FOLDER_STICKY_DEFAULT_WIDTH),
  ));
}

// The shortest a folder note of this width can be: tab plus an empty sheet.
export function getFolderStickyMinHeight(width) {
  return Math.ceil((FOLDER_STICKY_TAB_RISE + FOLDER_STICKY_SHEET_MIN_HEIGHT) * (width / FOLDER_STICKY_BASE_WIDTH));
}

export function getFolderStickyColorHex(colorId) {
  return (FOLDER_STICKY_COLORS.find((color) => color.id === colorId) ?? FOLDER_STICKY_COLORS[0]).hex;
}

export function clampCodeFileWidth(width) {
  return Math.round(Math.max(
    CODE_FILE_MIN_WIDTH,
    Math.min(CODE_FILE_MAX_WIDTH, Number.isFinite(width) ? width : CODE_FILE_DEFAULT_WIDTH),
  ));
}

export function getCodeFileHeight(width) {
  return Math.round(width * (CODE_FILE_BASE_HEIGHT / CODE_FILE_BASE_WIDTH));
}

export function getCodeFileLanguage(languageId) {
  return CODE_FILE_LANGUAGES.find((language) => language.id === languageId) ?? CODE_FILE_LANGUAGES[0];
}

// The language a file extension ("tsx", ".TSX") belongs to, or null.
export function getCodeFileLanguageIdForExtension(extension) {
  const normalized = String(extension ?? "").trim().replace(/^\.+/, "").toLowerCase();
  return CODE_FILE_LANGUAGES.find((language) => language.extensions.includes(normalized))?.id ?? null;
}

// An imported file card (type "file") whose extension is a known coding
// language shows as a code file too; this is that language, or null.
export function getFileCardCodeLanguageId(card) {
  if (card?.type !== "file") {
    return null;
  }

  return getCodeFileLanguageIdForExtension(card.file?.extension || String(card.file?.fileName ?? "").split(".").pop());
}

// What a linked file's path says about it: its name without the
// extension, and its language (null when the extension isn't known).
export function describeCodeFilePath(filePath) {
  const fileName = String(filePath ?? "").split(/[\\/]/).pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  const extension = (dot > 0 ? fileName.slice(dot + 1) : fileName).toLowerCase();
  const language = CODE_FILE_LANGUAGES.find((entry) => entry.extensions.includes(extension));

  return {
    name: dot > 0 ? fileName.slice(0, dot) : fileName,
    languageId: language?.id ?? null,
  };
}

export function normalizeStickyStyle(sticky) {
  const source = sticky && typeof sticky === "object" ? sticky : {};
  const design = STICKY_DESIGNS.includes(source.design) ? source.design : STICKY_DESIGN_CLASSIC;
  const options = STICKY_DESIGN_OPTIONS[design];
  const editedAt = typeof source.editedAt === "string" && Number.isFinite(Date.parse(source.editedAt))
    ? source.editedAt
    : null;

  return {
    design,
    color: options.colors.some((color) => color.id === source.color) ? source.color : options.defaultColor,
    fontSize: Object.hasOwn(options.fontSizes, source.fontSize) ? source.fontSize : "m",
    align: STICKY_ALIGNS.includes(source.align) ? source.align : "left",
    bold: source.bold === true,
    italic: source.italic === true,
    strike: source.strike === true,
    author: typeof source.author === "string" ? source.author : "",
    // When the text was last typed into (formatting doesn't count).
    editedAt,
    // The file a code-file sticky points at (shown in Explorer).
    filePath: typeof source.filePath === "string" ? source.filePath : "",
  };
}

// New stickies use the colour the user last picked. A per-person preference,
// so browser storage is fine; it may be unavailable, hence the try/catch.
export function getLastStickyColor() {
  try {
    const stored = window.localStorage.getItem(LAST_COLOR_STORAGE_KEY);
    return STICKY_COLORS.some((color) => color.id === stored) ? stored : DEFAULT_COLOR;
  } catch {
    return DEFAULT_COLOR;
  }
}

export function rememberStickyColor(colorId) {
  try {
    window.localStorage.setItem(LAST_COLOR_STORAGE_KEY, colorId);
  } catch {
    // Not remembered; new stickies fall back to yellow.
  }
}

// Where a sticky added with a "+" button goes: next to this one, same size,
// in that direction.
export function getAdjacentStickyPosition(card, direction) {
  const step = (Number.isFinite(card?.width) ? card.width : STICKY_BASE_SIZE) + STICKY_ADJACENT_GAP;

  return {
    x: card.x + (direction === "e" ? step : direction === "w" ? -step : 0),
    y: card.y + (direction === "s" ? step : direction === "n" ? -step : 0),
  };
}

// Stickies made before this design had a separate title; it reads as the
// first line of the text.
export function getStickyDisplayText(card) {
  const title = typeof card?.title === "string" ? card.title.trim() : "";
  const text = typeof card?.text === "string" ? card.text : "";

  if (!title) {
    return text;
  }

  return text ? `${title}\n${text}` : title;
}
