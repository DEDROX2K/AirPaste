/* global crypto, module, require */
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { getSchema } = require("@tiptap/core");
const StarterKit = require("@tiptap/starter-kit").default;
const Link = require("@tiptap/extension-link").default;
const MarkdownIt = require("markdown-it");
const { MarkdownParser } = require("prosemirror-markdown");

const LEGACY_FILES = ["workspace.json", "data.json"];
const INTERNAL_DIR = ".airpaste";
const DOME_FILE = "dome.json";
const INDEX_FILE = "index.json";
const UI_STATE_FILE = "ui-state.json";
const PREVIEWS_DIR = "previews";
const PROJECTS_DIR = "projects";
const CANVASES_DIR = "canvases";
const PAGES_DIR = "pages";
const TILES_DIR = "tiles";
const ASSETS_DIR = "assets";
const CANVAS_SUFFIX = ".airpaste.json";
const PAGE_SUFFIX = ".airpaste.page.json";
const LEGACY_ROOT_META_FILE = "airpaste.json";
const DOME_SETTINGS_FILE = "settings.json";
const TEMP_SUFFIX = ".tmp";
const BACKUP_SUFFIX = ".bak";
const MAX_RECENTS = 25;

const INDEX_VERSION = 5;
const UI_STATE_VERSION = 3;

const DEFAULT_WORKSPACE_NAME = "Main Canvas";
const DEFAULT_PAGE_DOCUMENT = Object.freeze({
  type: "doc",
  content: [{ type: "paragraph" }],
});
const DEFAULT_WORKSPACE = Object.freeze({
  version: 5,
  viewport: { x: 180, y: 120, zoom: 1 },
  cards: [],
});

const DEFAULT_UI_STATE = Object.freeze({
  version: UI_STATE_VERSION,
  homeView: "grid",
  sortBy: "updatedAt",
  filter: "all",
  selectedSection: "home",
  currentFolderPath: "",
  homeScrollTop: 0,
  canvasSnapToGrid: false,
  canvasSnapGridSize: 32,
  lastOpenedItemPath: null,
  lastOpenedCanvasPath: null,
  lastHomeRoute: {
    selectedSection: "home",
    currentFolderPath: "",
    scrollTop: 0,
  },
});

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const DOC_EXTS = new Set(["pdf"]);
const SKIP_DIRS = new Set([INTERNAL_DIR, ".git", "node_modules", "dist", "dist-renderer", "release", "build"]);
const LEGACY_PAGE_EXTENSIONS = [
  StarterKit.configure({
    link: false,
    strike: false,
  }),
  Link.configure({
    autolink: true,
    openOnClick: false,
  }),
];
const pageSchema = getSchema(LEGACY_PAGE_EXTENSIONS);
const markdownTokenizer = new MarkdownIt("commonmark", {
  html: false,
  linkify: true,
});
const markdownParser = new MarkdownParser(pageSchema, markdownTokenizer, {
  blockquote: { block: "blockquote" },
  bullet_list: { block: "bulletList" },
  code_block: { block: "codeBlock", noCloseToken: true },
  fence: {
    block: "codeBlock",
    getAttrs: (token) => ({ language: token.info || null }),
    noCloseToken: true,
  },
  hardbreak: { node: "hardBreak" },
  heading: {
    block: "heading",
    getAttrs: (token) => ({ level: Number(token.tag.slice(1)) || 1 }),
  },
  hr: { node: "horizontalRule" },
  link: {
    mark: "link",
    getAttrs: (token) => ({
      href: token.attrGet("href"),
      title: token.attrGet("title") || null,
    }),
  },
  list_item: { block: "listItem" },
  ordered_list: {
    block: "orderedList",
    getAttrs: (token) => ({
      start: Number(token.attrGet("start")) || 1,
    }),
  },
  paragraph: { block: "paragraph" },
  code_inline: { mark: "code" },
  em: { mark: "italic" },
  strong: { mark: "bold" },
});

function nowIso() {
  return new Date().toISOString();
}

function firstString(...values) {
  return values.find((v) => typeof v === "string" && v.trim())?.trim() ?? "";
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRel(value, fallback = "") {
  const normalized = String(value ?? "").replaceAll("\\", "/").trim().replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!normalized || normalized === ".") return fallback;
  return normalized;
}

function normalizeFolder(value) {
  return normalizeRel(value, "").replace(/\/$/, "");
}

function fileExt(fileName) {
  const ext = path.extname(String(fileName ?? ""));
  return ext ? ext.slice(1).toLowerCase() : "";
}

function stripExt(fileName) {
  const name = String(fileName ?? "");
  return name.slice(0, name.length - path.extname(name).length);
}

function stripCanvasSuffix(fileName) {
  const name = String(fileName ?? "");
  return name.toLowerCase().endsWith(CANVAS_SUFFIX) ? name.slice(0, -CANVAS_SUFFIX.length) : stripExt(name);
}

function stripPageSuffix(fileName) {
  const name = String(fileName ?? "");
  const lower = name.toLowerCase();
  if (lower.endsWith(PAGE_SUFFIX)) {
    return name.slice(0, -PAGE_SUFFIX.length);
  }
  return stripExt(name);
}

function sanitizeName(name, fallback = "untitled") {
  const withoutControls = Array.from(String(name ?? ""))
    .map((char) => (char.charCodeAt(0) < 32 ? " " : char))
    .join("");
  const normalized = withoutControls
    .trim()
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  return normalized || fallback;
}

function internalPath(root) {
  return path.join(root, INTERNAL_DIR);
}

function domeMetaPath(root) {
  return path.join(internalPath(root), DOME_FILE);
}

function legacyRootMetaPath(root) {
  return path.join(root, LEGACY_ROOT_META_FILE);
}

function domeSettingsPath(root) {
  return path.join(root, DOME_SETTINGS_FILE);
}

function indexPath(root) {
  return path.join(internalPath(root), INDEX_FILE);
}

function uiStatePath(root) {
  return path.join(internalPath(root), UI_STATE_FILE);
}

function previewDirPath(root) {
  return path.join(internalPath(root), PREVIEWS_DIR);
}

function assetsDirPath(root) {
  return path.join(root, ASSETS_DIR);
}

function ensureInside(root, target) {
  const absRoot = path.resolve(root);
  const absTarget = path.resolve(target);
  const rel = path.relative(absRoot, absTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path is outside the selected workspace.");
  }
  return absTarget;
}

function resolveWorkspacePath(root, relativePath = "") {
  return ensureInside(root, path.join(root, normalizeRel(relativePath, "")));
}

function toWorkspaceRel(root, value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("File path is required.");
  const abs = path.isAbsolute(raw) ? ensureInside(root, raw) : resolveWorkspacePath(root, raw);
  return normalizeRel(path.relative(root, abs), "");
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(dir) {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function readJson(filePath, label) {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) throw new Error(`${label} must contain a JSON object.`);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} contains invalid JSON.`);
    throw error;
  }
}

async function readText(filePath, fallback = "") {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function safeWriteText(filePath, text) {
  const dir = path.dirname(filePath);
  const opId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const temp = `${filePath}${TEMP_SUFFIX}-${opId}`;
  const backup = `${filePath}${BACKUP_SUFFIX}-${opId}`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(temp, text, "utf8");
  await fs.rm(backup, { force: true }).catch(() => {});

  let movedPreviousFile = false;

  if (await exists(filePath)) {
    try {
      await fs.rename(filePath, backup);
      movedPreviousFile = true;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  try {
    await fs.rename(temp, filePath);
  } catch (error) {
    if (movedPreviousFile) {
      await fs.rename(backup, filePath).catch(() => {});
    }
    throw error;
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
    await fs.rm(backup, { force: true }).catch(() => {});
  }
}

async function safeWriteJson(filePath, value) {
  await safeWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function detectType(fileName, relativePath = "") {
  const lower = String(fileName ?? "").toLowerCase();
  const rel = normalizeRel(relativePath, "");
  const relLower = rel.toLowerCase();
  if (
    relLower === LEGACY_ROOT_META_FILE
    || relLower === DOME_SETTINGS_FILE
    || LEGACY_FILES.includes(lower)
    || lower.endsWith(TEMP_SUFFIX)
    || lower.endsWith(BACKUP_SUFFIX)
  ) {
    return null;
  }
  if (lower.endsWith(CANVAS_SUFFIX)) return "canvas";
  if (lower.endsWith(PAGE_SUFFIX)) return "page";
  if (lower.endsWith(".md")) return "page";
  const ext = fileExt(lower);
  if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || DOC_EXTS.has(ext)) return "asset";
  return "file";
}

function normalizeLineEndings(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function markdownName(markdown, fallback) {
  const lines = normalizeLineEndings(markdown).split("\n");
  let index = 0;

  if (lines[0] === "---") {
    index = 1;
    while (index < lines.length && lines[index] !== "---" && lines[index] !== "...") {
      index += 1;
    }
    if (index < lines.length) {
      index += 1;
    } else {
      index = 0;
    }
  }

  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }

  const match = (lines[index] ?? "").match(/^#\s+(.+?)\s*$/);
  return match?.[1]?.trim() || fallback;
}

function normalizePageContent(content) {
  if (!isObject(content) || content.type !== "doc") {
    return DEFAULT_PAGE_DOCUMENT;
  }

  return content;
}

function extractFrontmatter(markdown) {
  const normalized = normalizeLineEndings(markdown);

  if (!normalized.startsWith("---\n")) {
    return { frontmatter: "", content: normalized };
  }

  const match = normalized.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n*/);
  if (!match) {
    return { frontmatter: "", content: normalized };
  }

  return {
    frontmatter: match[0],
    content: normalized.slice(match[0].length),
  };
}

function readFrontmatterTitle(frontmatter) {
  const lines = normalizeLineEndings(frontmatter).split("\n");

  for (const line of lines) {
    const match = line.match(/^title:\s*(.+?)\s*$/i);
    if (match) {
      return match[1].replace(/^["']|["']$/g, "").trim();
    }
  }

  return "";
}

function extractLeadingMarkdownTitle(content, fallbackTitle) {
  const lines = normalizeLineEndings(content).split("\n");
  let cursor = 0;

  while (cursor < lines.length && lines[cursor].trim() === "") {
    cursor += 1;
  }

  const headingLine = lines[cursor] ?? "";
  const headingMatch = headingLine.match(/^#\s+(.+?)\s*$/);

  if (!headingMatch) {
    return {
      title: fallbackTitle || "Page",
      body: content,
    };
  }

  const nextLines = [...lines.slice(0, cursor), ...lines.slice(cursor + 1)];

  if ((nextLines[cursor] ?? "").trim() === "") {
    nextLines.splice(cursor, 1);
  }

  return {
    title: headingMatch[1].trim() || fallbackTitle || "Page",
    body: nextLines.join("\n").replace(/^\n+/, ""),
  };
}

function legacyMarkdownToPageDocument(markdown, fallbackTitle = "Page") {
  const normalized = normalizeLineEndings(markdown);
  const { frontmatter, content } = extractFrontmatter(normalized);
  const frontmatterTitle = readFrontmatterTitle(frontmatter);
  const { title, body } = extractLeadingMarkdownTitle(content, frontmatterTitle || fallbackTitle);
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return {
      title,
      content: DEFAULT_PAGE_DOCUMENT,
    };
  }

  try {
    return {
      title,
      content: markdownParser.parse(trimmedBody).toJSON(),
    };
  } catch {
    return {
      title,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: trimmedBody.replace(/\s+/g, " ").slice(0, 5000) }],
          },
        ],
      },
    };
  }
}

async function readJsonIfExists(filePath, label, fallback) {
  try {
    return await readJson(filePath, label);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function collectPageText(node, parts) {
  if (!isObject(node)) {
    return;
  }

  if (typeof node.text === "string" && node.text.trim()) {
    parts.push(node.text.trim());
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectPageText(child, parts));
  }
}

function pageExcerptFromContent(content) {
  const parts = [];
  collectPageText(normalizePageContent(content), parts);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 220);
}

function markdownExcerpt(markdown) {
  const normalized = String(markdown ?? "").replace(/\r\n/g, "\n");
  let content = normalized;

  if (content.startsWith("---\n")) {
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n*/);
    if (frontmatterMatch) {
      content = content.slice(frontmatterMatch[0].length);
    }
  }

  const lines = content.split("\n");
  let index = 0;

  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }

  if (/^#\s+/.test(lines[index] ?? "")) {
    index += 1;
  }

  return lines
    .slice(index)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")
    .slice(0, 220);
}

function mapItemForResponse(root, item) {
  return {
    path: item.path,
    filePath: resolveWorkspacePath(root, item.path),
    type: item.type,
    name: item.name,
    updatedAt: item.updatedAt,
    starred: item.starred === true,
    thumbnail: item.thumbnail ?? null,
    thumbnailPath: item.thumbnail ?? null,
    excerpt: item.excerpt ?? "",
  };
}

function compareUpdatedDesc(a, b) {
  if (a.updatedAt === b.updatedAt) return a.name.localeCompare(b.name);
  return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
}

function previewRelativePath(relativeCanvasPath) {
  const hash = createHash("sha1").update(relativeCanvasPath).digest("hex").slice(0, 16);
  return path.posix.join(INTERNAL_DIR, PREVIEWS_DIR, `${hash}.svg`);
}

function buildPreviewSvg(workspace, title) {
  const cards = Array.isArray(workspace?.cards) ? workspace.cards : [];
  const label = firstString(title, cards.length > 0 ? `${cards.length} items` : "Empty canvas");
  const safeLabel = label.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  return [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"360\" viewBox=\"0 0 640 360\">",
    "<defs><linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#111315\"/><stop offset=\"100%\" stop-color=\"#0b0d10\"/></linearGradient></defs>",
    "<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"url(#bg)\"/>",
    `<text x="24" y="334" fill="rgba(236,238,241,.76)" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="600">${safeLabel}</text>`,
    "</svg>",
  ].join("\n");
}

async function writePreview(root, relativePath, workspace, title) {
  const rel = previewRelativePath(relativePath);
  await safeWriteText(resolveWorkspacePath(root, rel), buildPreviewSvg(workspace, title));
  return rel;
}

function defaultIndex(meta) {
  return {
    version: INDEX_VERSION,
    workspace: {
      name: meta.name,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    },
    items: [],
    recentItemPaths: [],
    starredItemPaths: [],
  };
}

function normalizeUiState(uiState) {
  const safe = isObject(uiState) ? uiState : {};
  return {
    ...DEFAULT_UI_STATE,
    ...safe,
    version: UI_STATE_VERSION,
    selectedSection: ["home", "recents", "starred"].includes(safe.selectedSection) ? safe.selectedSection : "home",
    homeView: ["grid", "list"].includes(safe.homeView) ? safe.homeView : "grid",
    sortBy: ["updatedAt", "name", "type"].includes(safe.sortBy) ? safe.sortBy : "updatedAt",
    filter: ["all", "canvases", "pages", "assets", "starred"].includes(safe.filter) ? safe.filter : "all",
    currentFolderPath: normalizeFolder(safe.currentFolderPath),
    lastOpenedItemPath: typeof safe.lastOpenedItemPath === "string" ? normalizeRel(safe.lastOpenedItemPath, "") : null,
    lastOpenedCanvasPath: typeof safe.lastOpenedCanvasPath === "string" ? normalizeRel(safe.lastOpenedCanvasPath, "") : null,
  };
}

async function ensureRootReady(root) {
  if (!(await isDirectory(root))) throw new Error("Selected folder is no longer available.");
  await fs.mkdir(internalPath(root), { recursive: true });
  await fs.mkdir(previewDirPath(root), { recursive: true });
  await fs.mkdir(path.join(root, CANVASES_DIR), { recursive: true });
  await fs.mkdir(path.join(root, PAGES_DIR), { recursive: true });
  await fs.mkdir(path.join(root, TILES_DIR), { recursive: true });
  await fs.mkdir(assetsDirPath(root), { recursive: true });

  const legacyMetaFile = legacyRootMetaPath(root);
  const metaFile = domeMetaPath(root);
  const legacyMeta = (await exists(legacyMetaFile))
    ? await readJson(legacyMetaFile, LEGACY_ROOT_META_FILE)
    : null;
  const meta = (await exists(metaFile))
    ? await readJson(metaFile, DOME_FILE)
    : {
      version: 3,
      name: firstString(legacyMeta?.name, path.basename(root)),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  meta.version = 3;
  meta.name = firstString(meta.name, legacyMeta?.name, path.basename(root));
  meta.createdAt = typeof meta.createdAt === "string" ? meta.createdAt : nowIso();
  meta.updatedAt = nowIso();
  await safeWriteJson(metaFile, meta);
  if (!(await exists(domeSettingsPath(root)))) {
    await safeWriteJson(domeSettingsPath(root), {
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  if (legacyMeta && (await exists(legacyMetaFile))) {
    await fs.rm(legacyMetaFile, { force: true });
  }
  return meta;
}

async function uniqueFile(initialPath) {
  let next = initialPath;
  let n = 2;
  while (await exists(next)) {
    const ext = path.extname(initialPath);
    const stem = initialPath.slice(0, -ext.length);
    next = `${stem} ${n}${ext}`;
    n += 1;
  }
  return next;
}

async function migrateLegacy(root) {
  for (const legacyName of LEGACY_FILES) {
    const legacyPath = path.join(root, legacyName);
    if (!(await exists(legacyPath))) continue;
    const raw = await readJson(legacyPath, legacyName);
    const filePath = await uniqueFile(path.join(root, `${DEFAULT_WORKSPACE_NAME}${CANVAS_SUFFIX}`));
    const payload = {
      version: 2,
      type: "canvas",
      name: DEFAULT_WORKSPACE_NAME,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      viewport: isObject(raw.viewport) ? raw.viewport : DEFAULT_WORKSPACE.viewport,
      cards: Array.isArray(raw.cards) ? raw.cards : [],
    };
    await safeWriteJson(filePath, payload);
    await fs.rm(legacyPath, { force: true });
  }

  const legacyProjects = path.join(root, PROJECTS_DIR);
  if (!(await exists(legacyProjects))) return;

  const queue = [legacyProjects];
  while (queue.length > 0) {
    const dir = queue.shift();
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      const lower = entry.name.toLowerCase();
      if (lower === "project.json" || lower === "space.json") continue;

      if (lower.endsWith(".md") && abs.includes(`${path.sep}pages${path.sep}`)) {
        const md = await readText(abs, "");
        const name = markdownName(md, stripExt(entry.name) || "Page");
        await safeWriteText(await uniqueFile(path.join(root, `${sanitizeName(name, "Page")}.md`)), md);
      } else if (lower.endsWith(".json") && abs.includes(`${path.sep}canvases${path.sep}`)) {
        let raw;
        try {
          raw = await readJson(abs, entry.name);
        } catch {
          continue;
        }
        const name = firstString(raw.name, stripCanvasSuffix(entry.name), "Canvas");
        await safeWriteJson(await uniqueFile(path.join(root, `${sanitizeName(name, "Canvas")}${CANVAS_SUFFIX}`)), {
          version: 2,
          type: "canvas",
          name,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          viewport: isObject(raw.viewport) ? raw.viewport : DEFAULT_WORKSPACE.viewport,
          cards: Array.isArray(raw.tiles) ? raw.tiles : Array.isArray(raw.cards) ? raw.cards : [],
        });
      }
    }
  }

  await fs.rm(legacyProjects, { recursive: true, force: true });
}

async function scanFiles(root) {
  const items = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = normalizeRel(path.relative(root, abs), "");
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      const type = detectType(entry.name, rel);
      if (!type) continue;

      const stat = await fs.stat(abs);
      if (type === "canvas") {
        let name = stripCanvasSuffix(entry.name) || "Canvas";
        let workspace = DEFAULT_WORKSPACE;
        try {
          const raw = await readJson(abs, entry.name);
          name = firstString(raw.name, name);
          workspace = {
            version: Number.isFinite(raw.version) ? raw.version : 5,
            viewport: isObject(raw.viewport) ? raw.viewport : DEFAULT_WORKSPACE.viewport,
            cards: Array.isArray(raw.cards) ? raw.cards : Array.isArray(raw.tiles) ? raw.tiles : [],
          };
        } catch {
          // Keep corrupt files visible for rename/delete.
        }
        items.push({ path: rel, type, name, updatedAt: stat.mtime.toISOString(), excerpt: "", workspace });
      } else if (type === "page") {
        const lower = entry.name.toLowerCase();
        let page = {
          title: stripPageSuffix(entry.name) || "Page",
          content: DEFAULT_PAGE_DOCUMENT,
          excerpt: "",
        };
        if (lower.endsWith(PAGE_SUFFIX)) {
          try {
            const raw = await readJson(abs, entry.name);
            page = {
              title: firstString(raw.title, stripPageSuffix(entry.name), "Page"),
              content: normalizePageContent(raw.content),
              excerpt: pageExcerptFromContent(raw.content),
            };
          } catch {
            // Keep corrupt files visible for rename/delete.
          }
        } else {
          const markdown = await readText(abs, "");
          const legacyPage = legacyMarkdownToPageDocument(markdown, stripPageSuffix(entry.name) || "Page");
          page = {
            title: legacyPage.title,
            content: legacyPage.content,
            excerpt: markdownExcerpt(markdown),
          };
        }
        items.push({
          path: rel,
          type,
          name: page.title,
          updatedAt: stat.mtime.toISOString(),
          excerpt: page.excerpt,
        });
      } else {
        items.push({
          path: rel,
          type,
          name: type === "file" ? entry.name : (stripExt(entry.name) || entry.name),
          updatedAt: stat.mtime.toISOString(),
          excerpt: "",
        });
      }
    }
  }

  return items.sort((a, b) => a.path.localeCompare(b.path));
}

async function rebuildIndex(root) {
  await migrateLegacy(root);
  const meta = await ensureRootReady(root);
  const prev = await readJsonIfExists(indexPath(root), INDEX_FILE, defaultIndex(meta));
  const scanned = await scanFiles(root);
  const prevByPath = new Map((Array.isArray(prev.items) ? prev.items : []).map((item) => [normalizeRel(item.path, ""), item]));

  const items = [];
  for (const scannedItem of scanned) {
    const prevItem = prevByPath.get(scannedItem.path);
    let thumbnail = prevItem?.thumbnail ?? prevItem?.thumbnailPath ?? null;
    if (scannedItem.type === "canvas") {
      const thumbAbs = thumbnail ? resolveWorkspacePath(root, thumbnail) : null;
      if (!thumbnail || !(await exists(thumbAbs))) {
        thumbnail = await writePreview(root, scannedItem.path, scannedItem.workspace, scannedItem.name);
      }
    } else {
      thumbnail = null;
    }
    items.push({
      path: scannedItem.path,
      type: scannedItem.type,
      name: scannedItem.name,
      updatedAt: scannedItem.updatedAt,
      starred: prevItem?.starred === true,
      thumbnail,
      excerpt: scannedItem.excerpt ?? "",
    });
  }

  const pathSet = new Set(items.map((item) => item.path));
  const recentItemPaths = (Array.isArray(prev.recentItemPaths) ? prev.recentItemPaths : [])
    .map((value) => normalizeRel(value, ""))
    .filter((value, index, list) => value && list.indexOf(value) === index && pathSet.has(value))
    .slice(0, MAX_RECENTS);
  const starredItemPaths = items.filter((item) => item.starred).map((item) => item.path);

  const nextIndex = {
    version: INDEX_VERSION,
    workspace: {
      name: meta.name,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    },
    items,
    recentItemPaths,
    starredItemPaths,
  };
  await safeWriteJson(indexPath(root), nextIndex);

  const prevUi = await readJsonIfExists(uiStatePath(root), UI_STATE_FILE, DEFAULT_UI_STATE);
  const uiState = normalizeUiState(prevUi);
  if (uiState.lastOpenedItemPath && !pathSet.has(uiState.lastOpenedItemPath)) uiState.lastOpenedItemPath = null;
  if (uiState.lastOpenedCanvasPath && !pathSet.has(uiState.lastOpenedCanvasPath)) uiState.lastOpenedCanvasPath = null;
  await safeWriteJson(uiStatePath(root), uiState);

  return { meta, index: nextIndex, uiState };
}

async function ensureReady(root) {
  return rebuildIndex(root);
}

async function workspaceRootFromFile(filePath) {
  let dir = path.dirname(path.resolve(filePath));
  while (true) {
    if (
      await exists(domeMetaPath(dir))
      || await exists(indexPath(dir))
      || await exists(legacyRootMetaPath(dir))
    ) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function markItemStarred(root, filePath, starred) {
  const { index } = await ensureReady(root);
  const rel = toWorkspaceRel(root, filePath);
  const item = index.items.find((entry) => entry.path === rel);
  if (!item) throw new Error("The selected file no longer exists.");
  const nextItems = index.items.map((entry) => (entry.path === rel ? { ...entry, starred: starred === true } : entry));
  const next = {
    ...index,
    items: nextItems,
    starredItemPaths: nextItems.filter((entry) => entry.starred).map((entry) => entry.path),
  };
  await safeWriteJson(indexPath(root), next);
  return mapItemForResponse(root, nextItems.find((entry) => entry.path === rel));
}

async function recordRecentItem(root, filePath) {
  const { index } = await ensureReady(root);
  const rel = toWorkspaceRel(root, filePath);
  if (!index.items.some((item) => item.path === rel)) throw new Error("The selected file no longer exists.");
  const nextRecent = [rel, ...index.recentItemPaths.filter((item) => item !== rel)].slice(0, MAX_RECENTS);
  await safeWriteJson(indexPath(root), { ...index, recentItemPaths: nextRecent });
  const ui = normalizeUiState(await readJson(uiStatePath(root), UI_STATE_FILE));
  ui.lastOpenedItemPath = rel;
  if (rel.endsWith(CANVAS_SUFFIX)) ui.lastOpenedCanvasPath = rel;
  await safeWriteJson(uiStatePath(root), ui);
  return nextRecent;
}

async function loadCanvas(filePath) {
  const abs = path.resolve(filePath);
  if (!abs.toLowerCase().endsWith(CANVAS_SUFFIX)) throw new Error(`Canvas path must end with "${CANVAS_SUFFIX}".`);
  const root = await workspaceRootFromFile(abs);
  if (!root) throw new Error("Could not resolve the workspace for this canvas.");
  await ensureReady(root);
  ensureInside(root, abs);
  const raw = await readJson(abs, path.basename(abs));
  const stat = await fs.stat(abs);
  const rel = toWorkspaceRel(root, abs);
  const workspace = {
    version: Number.isFinite(raw.version) ? raw.version : 5,
    viewport: isObject(raw.viewport) ? raw.viewport : DEFAULT_WORKSPACE.viewport,
    cards: Array.isArray(raw.cards) ? raw.cards : Array.isArray(raw.tiles) ? raw.tiles : [],
    view: raw.view === null || isObject(raw.view) ? raw.view : null,
  };
  await recordRecentItem(root, abs);
  return {
    type: "canvas",
    path: rel,
    filePath: abs,
    name: firstString(raw.name, stripCanvasSuffix(path.basename(abs))),
    createdAt: raw.createdAt ?? stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    workspace,
  };
}

async function saveCanvas(filePath, data, options = null) {
  const abs = path.resolve(filePath);
  if (!abs.toLowerCase().endsWith(CANVAS_SUFFIX)) throw new Error(`Canvas path must end with "${CANVAS_SUFFIX}".`);
  const root = await workspaceRootFromFile(abs);
  if (!root) throw new Error("Could not resolve the workspace for this canvas.");
  await ensureReady(root);
  ensureInside(root, abs);
  const saveOptions = isObject(options) ? options : {};
  const existing = (await exists(abs)) ? await readJson(abs, path.basename(abs)) : {};
  const workspace = isObject(data) ? data : DEFAULT_WORKSPACE;
  const payload = {
    version: 2,
    type: "canvas",
    name: firstString(workspace.name, existing.name, stripCanvasSuffix(path.basename(abs)), "Canvas"),
    createdAt: typeof existing.createdAt === "string" ? existing.createdAt : nowIso(),
    updatedAt: nowIso(),
    viewport: isObject(workspace.viewport)
      ? workspace.viewport
      : isObject(existing.viewport)
        ? existing.viewport
        : DEFAULT_WORKSPACE.viewport,
    cards: Array.isArray(workspace.cards)
      ? workspace.cards
      : Array.isArray(existing.cards)
        ? existing.cards
        : [],
    view: workspace.view === null || isObject(workspace.view)
      ? workspace.view
      : existing.view ?? null,
  };
  await safeWriteJson(abs, payload);
  const rel = toWorkspaceRel(root, abs);
  const changedKeys = Array.isArray(saveOptions.changedKeys)
    ? saveOptions.changedKeys.filter((key) => typeof key === "string" && key.trim().length > 0)
    : [];
  const shouldUpdatePreview = changedKeys.length === 0
    || changedKeys.includes("cards")
    || changedKeys.includes("name");

  if (shouldUpdatePreview) {
    await writePreview(root, rel, payload, payload.name);
  }

  if (saveOptions.returnWorkspace !== false) {
    await ensureReady(root);
    await recordRecentItem(root, abs);
    return loadCanvas(abs);
  }

  return {
    type: "canvas",
    path: rel,
    filePath: abs,
    updatedAt: payload.updatedAt,
    changedKeys,
  };
}

async function loadPage(filePath) {
  const abs = path.resolve(filePath);
  const lower = abs.toLowerCase();
  if (!lower.endsWith(".md") && !lower.endsWith(PAGE_SUFFIX)) {
    throw new Error(`Page path must end with "${PAGE_SUFFIX}" or ".md".`);
  }
  const root = await workspaceRootFromFile(abs);
  if (!root) throw new Error("Could not resolve the workspace for this page.");
  await ensureReady(root);
  ensureInside(root, abs);
  const stat = await fs.stat(abs);
  const rel = toWorkspaceRel(root, abs);
  let title = stripPageSuffix(path.basename(abs)) || "Page";
  let content = DEFAULT_PAGE_DOCUMENT;
  let excerpt = "";

  if (lower.endsWith(PAGE_SUFFIX)) {
    const raw = await readJson(abs, path.basename(abs));
    title = firstString(raw.title, title);
    content = normalizePageContent(raw.content);
    excerpt = pageExcerptFromContent(content);
  } else {
    const markdown = await readText(abs, "");
    const legacyPage = legacyMarkdownToPageDocument(markdown, title);
    title = legacyPage.title;
    content = legacyPage.content;
    excerpt = markdownExcerpt(markdown);
  }

  await recordRecentItem(root, abs);
  return {
    type: "page",
    path: rel,
    filePath: abs,
    name: title,
    title,
    content,
    storageFormat: lower.endsWith(PAGE_SUFFIX) ? "tiptap-json" : "markdown-legacy",
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    excerpt,
  };
}

async function savePage(filePath, pageData) {
  const abs = path.resolve(filePath);
  const lower = abs.toLowerCase();
  if (!lower.endsWith(".md") && !lower.endsWith(PAGE_SUFFIX)) {
    throw new Error(`Page path must end with "${PAGE_SUFFIX}" or ".md".`);
  }
  const root = await workspaceRootFromFile(abs);
  if (!root) throw new Error("Could not resolve the workspace for this page.");
  await ensureReady(root);
  ensureInside(root, abs);
  const input = isObject(pageData) ? pageData : {};
  const title = firstString(input.title, stripPageSuffix(path.basename(abs)), "Page");
  const content = normalizePageContent(input.content);
  let targetPath = abs;
  let createdAt = nowIso();

  if (await exists(abs)) {
    const stat = await fs.stat(abs).catch(() => null);
    if (stat) {
      createdAt = stat.birthtime.toISOString();
    }
  }

  if (lower.endsWith(PAGE_SUFFIX)) {
    try {
      const existing = await readJson(abs, path.basename(abs));
      createdAt = typeof existing.createdAt === "string" ? existing.createdAt : createdAt;
    } catch {
      // Fall back to file stat timestamp.
    }
  } else {
    const migratedPath = path.join(path.dirname(abs), `${stripExt(path.basename(abs))}${PAGE_SUFFIX}`);
    targetPath = (await exists(migratedPath)) && migratedPath !== abs ? await uniqueFile(migratedPath) : migratedPath;
  }

  await safeWriteJson(targetPath, {
    version: 1,
    type: "page",
    title,
    createdAt,
    updatedAt: nowIso(),
    content,
  });

  if (targetPath !== abs) {
    await fs.rm(abs, { force: true }).catch(() => {});
  }
  await ensureReady(root);
  await recordRecentItem(root, targetPath);
  return loadPage(targetPath);
}

async function createCanvas(root, name, targetFolderPath = "") {
  await ensureReady(root);
  const effectiveTarget = normalizeFolder(targetFolderPath) || CANVASES_DIR;
  const dir = resolveWorkspacePath(root, effectiveTarget);
  await fs.mkdir(dir, { recursive: true });
  const finalPath = await uniqueFile(path.join(dir, `${sanitizeName(firstString(name, "Canvas"), "Canvas")}${CANVAS_SUFFIX}`));
  await safeWriteJson(finalPath, {
    version: 2,
    type: "canvas",
    name: stripCanvasSuffix(path.basename(finalPath)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    viewport: DEFAULT_WORKSPACE.viewport,
    cards: [],
  });
  await ensureReady(root);
  await recordRecentItem(root, finalPath);
  return loadCanvas(finalPath);
}

async function createPage(root, name, targetFolderPath = "") {
  await ensureReady(root);
  const effectiveTarget = normalizeFolder(targetFolderPath) || PAGES_DIR;
  const dir = resolveWorkspacePath(root, effectiveTarget);
  await fs.mkdir(dir, { recursive: true });
  const base = sanitizeName(firstString(name, "Page"), "Page");
  const finalPath = await uniqueFile(path.join(dir, `${base}${PAGE_SUFFIX}`));
  await safeWriteJson(finalPath, {
    version: 1,
    type: "page",
    title: stripPageSuffix(path.basename(finalPath)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    content: DEFAULT_PAGE_DOCUMENT,
  });
  await ensureReady(root);
  await recordRecentItem(root, finalPath);
  return loadPage(finalPath);
}

async function renameFile(root, filePath, nextName) {
  const rel = toWorkspaceRel(root, filePath);
  const abs = resolveWorkspacePath(root, rel);
  if (!(await exists(abs))) throw new Error("The selected file no longer exists.");
  const type = detectType(path.basename(abs));
  if (!type || type === "asset" || type === "file") throw new Error("Only canvas and page files can be renamed from AirPaste.");
  const ext = type === "canvas" ? CANVAS_SUFFIX : (path.basename(abs).toLowerCase().endsWith(".md") ? ".md" : PAGE_SUFFIX);
  const renamed = await uniqueFile(path.join(path.dirname(abs), `${sanitizeName(nextName, "untitled")}${ext}`));
  await fs.rename(abs, renamed);
  if (type === "canvas") {
    const payload = await readJson(renamed, path.basename(renamed));
    payload.name = stripCanvasSuffix(path.basename(renamed));
    payload.updatedAt = nowIso();
    await safeWriteJson(renamed, payload);
  } else if (path.basename(renamed).toLowerCase().endsWith(PAGE_SUFFIX)) {
    const payload = await readJson(renamed, path.basename(renamed));
    payload.title = firstString(nextName, payload.title, stripPageSuffix(path.basename(renamed)), "Page");
    payload.updatedAt = nowIso();
    await safeWriteJson(renamed, payload);
  }
  await ensureReady(root);
  return type === "canvas" ? loadCanvas(renamed) : loadPage(renamed);
}

async function deleteFile(root, filePath) {
  const rel = toWorkspaceRel(root, filePath);
  const abs = resolveWorkspacePath(root, rel);
  if (!(await exists(abs))) return { deleted: false };
  const type = detectType(path.basename(abs));
  if (!type || type === "asset" || type === "file") throw new Error("Only canvas and page files can be deleted from AirPaste.");
  await fs.rm(abs, { force: true });
  await ensureReady(root);
  return { deleted: true, path: rel };
}

async function listFiles(root) {
  const { index } = await ensureReady(root);
  return index.items.map((item) => mapItemForResponse(root, item)).sort(compareUpdatedDesc);
}

async function getRecentItems(root) {
  const { index } = await ensureReady(root);
  const byPath = new Map(index.items.map((item) => [item.path, item]));
  return index.recentItemPaths.map((rel) => byPath.get(rel)).filter(Boolean).map((item) => mapItemForResponse(root, item));
}

async function getStarredItems(root) {
  const { index } = await ensureReady(root);
  return index.items.filter((item) => item.starred).sort(compareUpdatedDesc).map((item) => mapItemForResponse(root, item));
}

function folderSet(items) {
  const set = new Set([""]);
  for (const item of items) {
    const parts = item.path.split("/");
    let cursor = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      cursor = cursor ? `${cursor}/${parts[index]}` : parts[index];
      set.add(cursor);
    }
  }
  return set;
}

async function getHomeData(root, requestedFolderPath = null) {
  const { meta, index, uiState } = await ensureReady(root);
  const folders = folderSet(index.items);
  let currentFolderPath = normalizeFolder(requestedFolderPath ?? uiState.currentFolderPath);
  if (!folders.has(currentFolderPath)) currentFolderPath = "";
  if (currentFolderPath !== uiState.currentFolderPath) {
    await saveUiState(root, { currentFolderPath });
  }

  const folderEntriesMap = new Map();
  const files = [];
  for (const item of index.items) {
    const parent = normalizeFolder(path.posix.dirname(item.path));
    if ((parent === "." ? "" : parent) === currentFolderPath) {
      files.push(mapItemForResponse(root, item));
      continue;
    }
    const prefix = currentFolderPath ? `${currentFolderPath}/` : "";
    if (!item.path.startsWith(prefix)) continue;
    const rest = item.path.slice(prefix.length);
    const first = rest.split("/")[0];
    if (!first || !rest.includes("/")) continue;
    const folderPath = currentFolderPath ? `${currentFolderPath}/${first}` : first;
    const existing = folderEntriesMap.get(folderPath);
    if (!existing || existing.updatedAt < item.updatedAt) {
      folderEntriesMap.set(folderPath, { type: "folder", path: folderPath, name: first, updatedAt: item.updatedAt });
    }
  }

  const byPath = new Map(index.items.map((item) => [item.path, item]));
  return {
    workspace: {
      name: meta.name,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    },
    currentFolderPath,
    folders: [...folderEntriesMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    files: files.sort(compareUpdatedDesc),
    allFiles: index.items.map((item) => mapItemForResponse(root, item)).sort(compareUpdatedDesc),
    recentItems: index.recentItemPaths.map((rel) => byPath.get(rel)).filter(Boolean).map((item) => mapItemForResponse(root, item)),
    starredItems: index.items.filter((item) => item.starred).sort(compareUpdatedDesc).map((item) => mapItemForResponse(root, item)),
    uiState,
  };
}

async function loadUiState(root) {
  const { uiState } = await ensureReady(root);
  return uiState;
}

async function saveUiState(root, partialState) {
  const { uiState } = await ensureReady(root);
  const current = normalizeUiState(uiState);
  const next = normalizeUiState({ ...current, ...(isObject(partialState) ? partialState : {}) });
  await safeWriteJson(uiStatePath(root), next);
  return next;
}

async function loadIndex(root) {
  const { index } = await ensureReady(root);
  return index;
}

async function saveIndex(root, index) {
  const { meta } = await ensureReady(root);
  const next = {
    ...defaultIndex(meta),
    ...(isObject(index) ? index : {}),
    version: INDEX_VERSION,
    workspace: {
      name: meta.name,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    },
  };
  await safeWriteJson(indexPath(root), next);
  return next;
}

async function readWorkspaceDocument(root) {
  const { index, uiState } = await ensureReady(root);
  const candidates = [
    uiState.lastOpenedCanvasPath,
    ...index.recentItemPaths,
    ...index.items.filter((item) => item.type === "canvas").map((item) => item.path),
  ].filter(Boolean);
  const canvasRel = candidates.find((rel) => index.items.some((item) => item.path === rel && item.type === "canvas"));
  if (!canvasRel) return { ...DEFAULT_WORKSPACE };
  const canvas = await loadCanvas(resolveWorkspacePath(root, canvasRel));
  return canvas.workspace;
}

async function loadWorkspace(root) {
  await ensureReady(root);
  return { folderPath: root };
}

async function saveWorkspace(root, data) {
  const { index, uiState } = await ensureReady(root);
  const candidates = [
    uiState.lastOpenedCanvasPath,
    ...index.recentItemPaths,
    ...index.items.filter((item) => item.type === "canvas").map((item) => item.path),
  ].filter(Boolean);
  let canvasRel = candidates.find((rel) => index.items.some((item) => item.path === rel && item.type === "canvas"));
  if (!canvasRel) {
    const created = await createCanvas(root, DEFAULT_WORKSPACE_NAME);
    canvasRel = created.path;
  }
  const saved = await saveCanvas(resolveWorkspacePath(root, canvasRel), data);
  return saved.workspace;
}

async function createWorkspace(root) {
  await ensureReady(root);
  return { folderPath: root };
}

async function isValidWorkspace(root) {
  if (!(await isDirectory(root))) return false;
  return exists(domeMetaPath(root));
}

async function inspectDome(root) {
  if (!(await isDirectory(root))) {
    return {
      exists: false,
      valid: false,
      reason: "missing",
      path: path.resolve(root),
      name: path.basename(root),
    };
  }

  const absRoot = path.resolve(root);
  const hasDomeMeta = await exists(domeMetaPath(absRoot));
  const hasLegacyMeta = await exists(legacyRootMetaPath(absRoot));
  const hasIndex = await exists(indexPath(absRoot));
  const valid = hasDomeMeta;

  let name = path.basename(absRoot);
  if (hasDomeMeta) {
    try {
      const meta = await readJson(domeMetaPath(absRoot), DOME_FILE);
      name = firstString(meta.name, name);
    } catch {
      // Keep fallback name.
    }
  }

  return {
    exists: true,
    valid,
    reason: valid ? "valid" : (hasLegacyMeta || hasIndex ? "legacy" : "uninitialized"),
    path: absRoot,
    name,
  };
}

async function createDome(root, name = "") {
  const absRoot = path.resolve(root);
  await fs.mkdir(absRoot, { recursive: true });
  await ensureRootReady(absRoot);
  const meta = await readJson(domeMetaPath(absRoot), DOME_FILE);
  meta.name = firstString(name, meta.name, path.basename(absRoot));
  meta.updatedAt = nowIso();
  await safeWriteJson(domeMetaPath(absRoot), meta);
  await ensureReady(absRoot);
  return {
    id: createHash("sha1").update(absRoot.toLowerCase()).digest("hex").slice(0, 16),
    name: meta.name,
    path: absRoot,
  };
}

function resolveWorkspaceAssetPath(root, relativePath) {
  if (!root || !relativePath) return null;
  try {
    return resolveWorkspacePath(root, relativePath);
  } catch {
    return null;
  }
}

async function importImageAsset(root, payload) {
  await ensureReady(root);
  if (!isObject(payload)) throw new Error("Image import payload is required.");
  const sourcePath = firstString(payload.sourcePath);
  if (!sourcePath) throw new Error("Image import payload is missing sourcePath.");
  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStat || !sourceStat.isFile()) throw new Error("The selected image file could not be found.");
  const ext = fileExt(payload.fileName || sourcePath) || "png";
  const base = sanitizeName(stripExt(firstString(payload.fileName, path.basename(sourcePath), `asset-${crypto.randomUUID()}`)), "asset");
  const targetPath = await uniqueFile(path.join(assetsDirPath(root), `${base}.${ext}`));
  await fs.copyFile(sourcePath, targetPath);
  return {
    relativePath: toWorkspaceRel(root, targetPath),
    fileName: path.basename(targetPath),
    mimeType: firstString(payload.mimeType),
    sizeBytes: sourceStat.size,
    width: Number.isFinite(payload.width) ? Math.max(0, payload.width) : 0,
    height: Number.isFinite(payload.height) ? Math.max(0, payload.height) : 0,
  };
}

async function getItemForFilePath(root, filePath) {
  const { index } = await ensureReady(root);
  const rel = toWorkspaceRel(root, filePath);
  const item = index.items.find((entry) => entry.path === rel);
  return item ? mapItemForResponse(root, item) : null;
}

module.exports = {
  createCanvas,
  createDome,
  createPage,
  createWorkspace,
  deleteFile,
  getHomeData,
  getItemForFilePath,
  getRecentItems,
  getStarredItems,
  importImageAsset,
  inspectDome,
  isValidWorkspace,
  listFiles,
  loadCanvas,
  loadIndex,
  loadPage,
  loadUiState,
  loadWorkspace,
  markItemStarred,
  readWorkspaceDocument,
  rebuildIndex,
  recordRecentItem,
  renameFile,
  resolveWorkspaceAssetPath,
  saveCanvas,
  saveIndex,
  savePage,
  saveUiState,
  saveWorkspace,
};
