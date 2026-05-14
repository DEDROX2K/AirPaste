const path = require("node:path");

const JSON_CANVAS_SUFFIX = ".canvas";
const LEGACY_CANVAS_SUFFIX = ".airpaste.json";
const DEFAULT_CANVAS_SUFFIX = JSON_CANVAS_SUFFIX;
const CANVAS_SUFFIXES = Object.freeze([JSON_CANVAS_SUFFIX, LEGACY_CANVAS_SUFFIX]);

const DEFAULT_VIEWPORT = Object.freeze({
  x: 180,
  y: 120,
  zoom: 1,
});

const DEFAULT_DRAWINGS = Object.freeze({
  version: 1,
  objects: [],
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneStructuredValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function fileExt(fileName) {
  const ext = path.extname(String(fileName ?? ""));
  return ext ? ext.slice(1).toLowerCase() : "";
}

function normalizeFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function normalizeViewport(viewport) {
  const safeViewport = isObject(viewport) ? viewport : {};
  return {
    x: normalizeFiniteNumber(safeViewport.x, DEFAULT_VIEWPORT.x),
    y: normalizeFiniteNumber(safeViewport.y, DEFAULT_VIEWPORT.y),
    zoom: normalizeFiniteNumber(safeViewport.zoom, DEFAULT_VIEWPORT.zoom),
  };
}

function normalizeDrawings(drawings) {
  const safeDrawings = isObject(drawings) ? drawings : {};
  return {
    version: Number.isFinite(safeDrawings.version) ? Math.max(1, Math.round(safeDrawings.version)) : DEFAULT_DRAWINGS.version,
    objects: Array.isArray(safeDrawings.objects) ? cloneStructuredValue(safeDrawings.objects) : [],
  };
}

function stripCanvasSuffix(fileName) {
  const normalized = String(fileName ?? "");
  const lower = normalized.toLowerCase();

  if (lower.endsWith(LEGACY_CANVAS_SUFFIX)) {
    return normalized.slice(0, -LEGACY_CANVAS_SUFFIX.length);
  }

  if (lower.endsWith(JSON_CANVAS_SUFFIX)) {
    return normalized.slice(0, -JSON_CANVAS_SUFFIX.length);
  }

  return normalized.slice(0, normalized.length - path.extname(normalized).length);
}

function isJsonCanvasPath(filePath) {
  return String(filePath ?? "").toLowerCase().endsWith(JSON_CANVAS_SUFFIX);
}

function isLegacyCanvasPath(filePath) {
  return String(filePath ?? "").toLowerCase().endsWith(LEGACY_CANVAS_SUFFIX);
}

function isCanvasPath(filePath) {
  return CANVAS_SUFFIXES.some((suffix) => String(filePath ?? "").toLowerCase().endsWith(suffix));
}

function getCanvasSuffix(filePath) {
  return isLegacyCanvasPath(filePath) ? LEGACY_CANVAS_SUFFIX : JSON_CANVAS_SUFFIX;
}

function getDomainLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function cleanNodeAirpaste(airpaste) {
  if (!isObject(airpaste)) {
    return null;
  }

  const nextAirpaste = cloneStructuredValue(airpaste);
  delete nextAirpaste.card;

  return Object.keys(nextAirpaste).length > 0 ? nextAirpaste : null;
}

function cleanGroupAirpaste(airpaste) {
  if (!isObject(airpaste)) {
    return null;
  }

  const nextAirpaste = cloneStructuredValue(airpaste);
  delete nextAirpaste.group;

  return Object.keys(nextAirpaste).length > 0 ? nextAirpaste : null;
}

function cleanEdgeAirpaste(airpaste) {
  if (!isObject(airpaste)) {
    return null;
  }

  const nextAirpaste = cloneStructuredValue(airpaste);
  delete nextAirpaste.edge;

  return Object.keys(nextAirpaste).length > 0 ? nextAirpaste : null;
}

function buildTextCardFromNode(node, airpaste) {
  return {
    id: firstString(node?.id, `card-${Date.now()}`),
    type: firstString(node?.airpaste?.sourceType, "text-box"),
    text: typeof node?.text === "string" ? node.text : "",
    title: "",
    x: normalizeFiniteNumber(node?.x, 120),
    y: normalizeFiniteNumber(node?.y, 120),
    width: Math.max(120, normalizeFiniteNumber(node?.width, 520)),
    height: Math.max(52, normalizeFiniteNumber(node?.height, 180)),
    appearance: "plain",
    placeholder: false,
    placeholderText: "",
    autoWidth: false,
    createdAt: typeof node?.createdAt === "string" ? node.createdAt : new Date().toISOString(),
    updatedAt: typeof node?.updatedAt === "string" ? node.updatedAt : new Date().toISOString(),
    airpaste,
  };
}

function buildFileCardFromNode(node, airpaste) {
  const relativePath = typeof node?.file === "string" ? node.file.trim() : "";
  const fileName = relativePath ? path.basename(relativePath) : "";

  return {
    id: firstString(node?.id, `card-${Date.now()}`),
    type: "file",
    title: firstString(node?.label, fileName, "Untitled file"),
    x: normalizeFiniteNumber(node?.x, 120),
    y: normalizeFiniteNumber(node?.y, 120),
    width: Math.max(120, normalizeFiniteNumber(node?.width, 344)),
    height: Math.max(120, normalizeFiniteNumber(node?.height, 436)),
    file: relativePath
      ? {
        relativePath,
        fileName,
        extension: fileExt(fileName),
        mimeType: "",
        sizeBytes: 0,
      }
      : null,
    createdAt: typeof node?.createdAt === "string" ? node.createdAt : new Date().toISOString(),
    updatedAt: typeof node?.updatedAt === "string" ? node.updatedAt : new Date().toISOString(),
    airpaste,
  };
}

function buildLinkCardFromNode(node, airpaste) {
  const url = typeof node?.url === "string" ? node.url : "";

  return {
    id: firstString(node?.id, `card-${Date.now()}`),
    type: firstString(node?.airpaste?.sourceType, "link"),
    url,
    title: typeof node?.label === "string" ? node.label : "",
    description: "",
    siteName: getDomainLabel(url),
    resolvedUrl: url,
    previewStatus: "",
    contentType: "link",
    sourceType: "generic-link",
    status: "idle",
    x: normalizeFiniteNumber(node?.x, 120),
    y: normalizeFiniteNumber(node?.y, 120),
    width: Math.max(120, normalizeFiniteNumber(node?.width, 340)),
    height: Math.max(120, normalizeFiniteNumber(node?.height, 280)),
    createdAt: typeof node?.createdAt === "string" ? node.createdAt : new Date().toISOString(),
    updatedAt: typeof node?.updatedAt === "string" ? node.updatedAt : new Date().toISOString(),
    airpaste,
  };
}

function canvasNodeToCard(node, fallbackIndex = 0) {
  const persistedCard = isObject(node?.airpaste?.card) ? cloneStructuredValue(node.airpaste.card) : null;
  const cleanAirpaste = cleanNodeAirpaste(node?.airpaste);

  if (persistedCard) {
    const mergedAirpaste = {
      ...(isObject(persistedCard.airpaste) ? persistedCard.airpaste : {}),
      ...(cleanAirpaste ?? {}),
    };

    return {
      ...persistedCard,
      id: firstString(node?.id, persistedCard.id, `card-${fallbackIndex + 1}`),
      x: normalizeFiniteNumber(node?.x, persistedCard.x),
      y: normalizeFiniteNumber(node?.y, persistedCard.y),
      width: Math.max(1, normalizeFiniteNumber(node?.width, persistedCard.width)),
      height: Math.max(1, normalizeFiniteNumber(node?.height, persistedCard.height)),
      airpaste: Object.keys(mergedAirpaste).length > 0 ? mergedAirpaste : null,
    };
  }

  if (node?.type === "file") {
    return buildFileCardFromNode(node, cleanAirpaste);
  }

  if (node?.type === "link") {
    return buildLinkCardFromNode(node, cleanAirpaste);
  }

  return buildTextCardFromNode(node, cleanAirpaste);
}

function canvasNodeToGroup(node, fallbackIndex = 0) {
  const persistedGroup = isObject(node?.airpaste?.group) ? cloneStructuredValue(node.airpaste.group) : null;
  const cleanAirpaste = cleanGroupAirpaste(node?.airpaste);

  if (persistedGroup) {
    const mergedAirpaste = {
      ...(isObject(persistedGroup.airpaste) ? persistedGroup.airpaste : {}),
      ...(cleanAirpaste ?? {}),
    };

    return {
      ...persistedGroup,
      id: firstString(node?.id, persistedGroup.id, `group-${fallbackIndex + 1}`),
      x: normalizeFiniteNumber(node?.x, persistedGroup.x),
      y: normalizeFiniteNumber(node?.y, persistedGroup.y),
      width: Math.max(1, normalizeFiniteNumber(node?.width, persistedGroup.width)),
      height: Math.max(1, normalizeFiniteNumber(node?.height, persistedGroup.height)),
      label: firstString(node?.label, persistedGroup.label),
      airpaste: Object.keys(mergedAirpaste).length > 0 ? mergedAirpaste : null,
    };
  }

  return {
    id: firstString(node?.id, `group-${fallbackIndex + 1}`),
    x: normalizeFiniteNumber(node?.x, 120),
    y: normalizeFiniteNumber(node?.y, 120),
    width: Math.max(1, normalizeFiniteNumber(node?.width, 480)),
    height: Math.max(1, normalizeFiniteNumber(node?.height, 320)),
    label: firstString(node?.label),
    color: firstString(node?.color),
    background: firstString(node?.background),
    airpaste: cleanAirpaste,
  };
}

function canvasEdgeToInternal(edge, fallbackIndex = 0) {
  const persistedEdge = isObject(edge?.airpaste?.edge) ? cloneStructuredValue(edge.airpaste.edge) : null;
  const cleanAirpaste = cleanEdgeAirpaste(edge?.airpaste);

  if (persistedEdge) {
    const mergedAirpaste = {
      ...(isObject(persistedEdge.airpaste) ? persistedEdge.airpaste : {}),
      ...(cleanAirpaste ?? {}),
    };

    return {
      ...persistedEdge,
      id: firstString(edge?.id, persistedEdge.id, `edge-${fallbackIndex + 1}`),
      fromNode: firstString(edge?.fromNode, persistedEdge.fromNode),
      fromSide: firstString(edge?.fromSide, persistedEdge.fromSide),
      toNode: firstString(edge?.toNode, persistedEdge.toNode),
      toSide: firstString(edge?.toSide, persistedEdge.toSide),
      label: firstString(edge?.label, persistedEdge.label),
      color: firstString(edge?.color, persistedEdge.color),
      airpaste: Object.keys(mergedAirpaste).length > 0 ? mergedAirpaste : null,
    };
  }

  return {
    id: firstString(edge?.id, `edge-${fallbackIndex + 1}`),
    fromNode: firstString(edge?.fromNode),
    fromSide: firstString(edge?.fromSide),
    toNode: firstString(edge?.toNode),
    toSide: firstString(edge?.toSide),
    label: firstString(edge?.label),
    color: firstString(edge?.color),
    airpaste: cleanAirpaste,
  };
}

function buildCanvasText(card) {
  if (typeof card?.text === "string" && card.text.trim().length > 0) {
    return card.text;
  }

  if (typeof card?.body === "string" && card.body.trim().length > 0) {
    return card.body;
  }

  if (typeof card?.code === "string" && card.code.trim().length > 0) {
    return card.code;
  }

  return [card?.title, card?.description].filter((value) => typeof value === "string" && value.trim().length > 0).join("\n\n");
}

function mapCardToCanvasNodeType(card) {
  switch (card?.type) {
    case "file":
      return "file";
    case "link":
    case "amazon-product":
      return "link";
    default:
      return "text";
  }
}

function cardToCanvasNode(card) {
  const type = mapCardToCanvasNodeType(card);
  const node = {
    id: firstString(card?.id),
    type,
    x: normalizeFiniteNumber(card?.x, 120),
    y: normalizeFiniteNumber(card?.y, 120),
    width: Math.max(1, normalizeFiniteNumber(card?.width, 320)),
    height: Math.max(1, normalizeFiniteNumber(card?.height, 240)),
    airpaste: {
      ...(isObject(card?.airpaste) ? cloneStructuredValue(card.airpaste) : {}),
      sourceType: firstString(card?.type, type),
      card: cloneStructuredValue(card),
    },
  };

  if (type === "file") {
    node.file = firstString(card?.file?.relativePath, card?.asset?.relativePath, card?.url, card?.title);
    node.label = firstString(card?.title, card?.file?.fileName);
    return node;
  }

  if (type === "link") {
    node.url = firstString(card?.url, card?.resolvedUrl);
    node.label = firstString(card?.title, card?.siteName);
    return node;
  }

  node.text = buildCanvasText(card);
  node.label = firstString(card?.title);
  return node;
}

function groupToCanvasNode(group) {
  return {
    id: firstString(group?.id),
    type: "group",
    label: firstString(group?.label, group?.title),
    x: normalizeFiniteNumber(group?.x, 120),
    y: normalizeFiniteNumber(group?.y, 120),
    width: Math.max(1, normalizeFiniteNumber(group?.width, 480)),
    height: Math.max(1, normalizeFiniteNumber(group?.height, 320)),
    color: firstString(group?.color),
    background: firstString(group?.background),
    airpaste: {
      ...(isObject(group?.airpaste) ? cloneStructuredValue(group.airpaste) : {}),
      group: cloneStructuredValue(group),
    },
  };
}

function edgeToCanvasEdge(edge) {
  return {
    id: firstString(edge?.id),
    fromNode: firstString(edge?.fromNode),
    fromSide: firstString(edge?.fromSide),
    toNode: firstString(edge?.toNode),
    toSide: firstString(edge?.toSide),
    label: firstString(edge?.label),
    color: firstString(edge?.color),
    airpaste: {
      ...(isObject(edge?.airpaste) ? cloneStructuredValue(edge.airpaste) : {}),
      edge: cloneStructuredValue(edge),
    },
  };
}

function isJsonCanvasDocument(raw) {
  return isObject(raw) && Array.isArray(raw.nodes) && Array.isArray(raw.edges);
}

function parseJsonCanvasDocument(raw, fallbackName = "Canvas") {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const groups = [];
  const tiles = [];

  nodes.forEach((node, index) => {
    if (!isObject(node)) {
      return;
    }

    if (node.type === "group") {
      groups.push(canvasNodeToGroup(node, index));
      return;
    }

    tiles.push(canvasNodeToCard(node, index));
  });

  const edges = Array.isArray(raw?.edges)
    ? raw.edges
      .filter((edge) => isObject(edge))
      .map((edge, index) => canvasEdgeToInternal(edge, index))
    : [];

  const airpaste = isObject(raw?.airpaste) ? cloneStructuredValue(raw.airpaste) : {};
  const pageId = firstString(airpaste.pageId, raw?.id, "page-1");
  const pageName = firstString(airpaste.pageName, raw?.name, "Page 1");
  const viewport = normalizeViewport(airpaste.viewport);
  const drawings = normalizeDrawings(airpaste.drawings);
  const view = airpaste.view === null || isObject(airpaste.view) ? (cloneStructuredValue(airpaste.view) ?? null) : null;

  const boardAirpaste = cloneStructuredValue(airpaste) ?? {};
  delete boardAirpaste.pageId;
  delete boardAirpaste.pageName;
  delete boardAirpaste.viewport;
  delete boardAirpaste.drawings;
  delete boardAirpaste.view;

  return {
    version: Number.isFinite(airpaste.workspaceVersion) ? airpaste.workspaceVersion : 10,
    name: firstString(raw?.name, fallbackName, "Canvas"),
    activePageId: pageId,
    airpaste: Object.keys(boardAirpaste).length > 0 ? boardAirpaste : null,
    pages: [{
      id: pageId,
      name: pageName,
      viewport,
      tiles,
      drawings,
      edges,
      groups,
      view,
      airpaste: null,
    }],
  };
}

function serializeJsonCanvasDocument(workspaceDocument, options = {}) {
  const pages = Array.isArray(workspaceDocument?.pages) ? workspaceDocument.pages : [];
  const activePageId = firstString(workspaceDocument?.activePageId, pages[0]?.id, "page-1");
  const activePage = pages.find((page) => page?.id === activePageId) ?? pages[0] ?? {};
  const tiles = Array.isArray(activePage?.tiles)
    ? activePage.tiles
    : Array.isArray(activePage?.cards)
      ? activePage.cards
      : [];
  const groups = Array.isArray(activePage?.groups) ? activePage.groups : [];
  const edges = Array.isArray(activePage?.edges) ? activePage.edges : [];

  return {
    id: firstString(options.id, workspaceDocument?.id, activePage.id, "page-1"),
    type: "canvas",
    name: firstString(workspaceDocument?.name, options.fallbackName, "Canvas"),
    createdAt: typeof options.createdAt === "string" ? options.createdAt : undefined,
    updatedAt: typeof options.updatedAt === "string" ? options.updatedAt : undefined,
    nodes: [
      ...tiles.map((card) => cardToCanvasNode(card)),
      ...groups.map((group) => groupToCanvasNode(group)),
    ],
    edges: edges.map((edge) => edgeToCanvasEdge(edge)).filter((edge) => edge.fromNode && edge.toNode),
    airpaste: {
      ...(isObject(workspaceDocument?.airpaste) ? cloneStructuredValue(workspaceDocument.airpaste) : {}),
      workspaceVersion: Number.isFinite(workspaceDocument?.version) ? workspaceDocument.version : 10,
      pageId: firstString(activePage?.id, "page-1"),
      pageName: firstString(activePage?.name, "Page 1"),
      viewport: normalizeViewport(activePage?.viewport),
      drawings: normalizeDrawings(activePage?.drawings),
      view: activePage?.view === null || isObject(activePage?.view) ? cloneStructuredValue(activePage.view) : null,
    },
  };
}

module.exports = {
  CANVAS_SUFFIXES,
  DEFAULT_CANVAS_SUFFIX,
  JSON_CANVAS_SUFFIX,
  LEGACY_CANVAS_SUFFIX,
  getCanvasSuffix,
  isCanvasPath,
  isJsonCanvasDocument,
  isJsonCanvasPath,
  isLegacyCanvasPath,
  parseJsonCanvasDocument,
  serializeJsonCanvasDocument,
  stripCanvasSuffix,
};
