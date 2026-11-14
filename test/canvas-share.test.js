// Canvas sharing (main/share/canvasShare.js): export -> import round trip,
// name collisions, and untrusted bundles (zip-slip, bad types, bombs...).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import workspaceService from "../workspace-service.js";

const require = createRequire(import.meta.url);
const { exportCanvasShare, importCanvasShare, isSafeEntryName, LIMITS } = require("../main/share/canvasShare.js");
const { openZip, writeZip } = require("../main/share/zip.js");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body")]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fake-jpg-body")]);
const PDF = Buffer.from("%PDF-1.4\nfake pdf\n");

let tmp;
let domeA;
let domeB;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-share-"));
  domeA = path.join(tmp, "Sender Dome");
  domeB = path.join(tmp, "Receiver Dome");
  await workspaceService.createDome(domeA, "Sender");
  await workspaceService.createDome(domeB, "Receiver");
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function thumbIdFor(rel) {
  return createHash("sha1").update(rel).digest("hex").slice(0, 20);
}

async function writeFile(root, rel, data) {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return abs;
}

async function buildSenderCanvas() {
  await writeFile(domeA, "photo.png", PNG);
  await writeFile(domeA, "doc.pdf", PDF);
  await writeFile(domeA, "Notes.md", "# Notes\nhello");
  await writeFile(domeA, ".airpaste/previews/webclip/abc.jpg", JPG);
  await writeFile(domeA, ".airpaste/articles/abc.json", JSON.stringify({ title: "Article", content: "<p>hi</p>" }));
  await writeFile(tmp, "outside.pdf", PDF);

  const created = await workspaceService.createCanvas(domeA, "Moodboard");
  const page = created.workspace.pages[0];
  const pageOneTiles = [
    { id: "img-1", type: "link", contentKind: "image", image: "photo.png", asset: { relativePath: "photo.png", fileName: "photo.png" }, x: 0, y: 0, width: 200, height: 200 },
    { id: "file-1", type: "file", title: "doc.pdf", file: { relativePath: "doc.pdf", filePath: path.join(domeA, "doc.pdf"), fileName: "doc.pdf", extension: "pdf" }, x: 300, y: 0, width: 200, height: 200 },
    { id: "note-1", type: "canvas-text", source: "file", text: "# Notes\nhello", file: { relativePath: "Notes.md", filePath: path.join(domeA, "Notes.md"), fileName: "Notes.md", extension: "md" }, x: 600, y: 0, width: 200, height: 200 },
    { id: "link-1", type: "link", url: "https://example.com", image: "https://example.com/og.png", webclipImagePath: ".airpaste/previews/webclip/abc.jpg", article: { path: ".airpaste/articles/abc.json", title: "Article" }, x: 0, y: 300, width: 200, height: 200 },
    { id: "sticky-1", type: "canvas-text", text: "see img-1 for reference", sticky: { filePath: "C:\\Users\\someone\\code\\main.js", color: "js" }, x: 300, y: 300, width: 200, height: 200 },
    { id: "rack-1", type: "rack", x: 600, y: 300, width: 400, height: 200 },
    { id: "child-1", type: "canvas-text", text: "in rack", parentRackId: "rack-1", x: 610, y: 310, width: 100, height: 100 },
    { id: "evil-1", type: "file", file: { relativePath: "../outside.pdf", fileName: "outside.pdf" }, x: 0, y: 600, width: 100, height: 100 },
    { id: "internal-1", type: "file", file: { relativePath: ".airpaste/ui-state.json", fileName: "ui-state.json" }, x: 200, y: 600, width: 100, height: 100 },
  ];
  await workspaceService.saveCanvas(created.filePath, {
    activePageId: page.id,
    pages: [
      {
        ...page,
        tiles: pageOneTiles,
        edges: [{ id: "edge-1", fromNode: "img-1", toNode: "file-1" }],
        tethers: [{ id: "tether-1", a: "img-1", b: "link-1" }],
      },
      {
        id: "page-2",
        name: "Second",
        viewport: { x: 0, y: 0, zoom: 1 },
        tiles: [{ id: "p2-img", type: "link", contentKind: "image", image: "photo.png", asset: { relativePath: "photo.png" }, x: 0, y: 0, width: 100, height: 100 }],
      },
    ],
  });
  const rel = workspaceService.toWorkspaceRel(domeA, created.filePath);
  await writeFile(domeA, `.airpaste/previews/canvas-thumbs/${thumbIdFor(rel)}.jpg`, JPG);
  return created.filePath;
}

async function readZipJson(zipPath, name) {
  const zip = await openZip(zipPath);
  try {
    const entry = zip.entries.find((candidate) => candidate.name === name);
    return JSON.parse((await zip.read(entry)).toString("utf8"));
  } finally {
    await zip.close();
  }
}

async function listFilesRecursive(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFilesRecursive(abs));
    else out.push(abs);
  }
  return out;
}

async function bundle(entries) {
  const out = path.join(tmp, `crafted-${Math.random().toString(16).slice(2)}.airpaste-share`);
  await writeZip(out, entries.map(([name, data, compress]) => ({
    name,
    data: Buffer.isBuffer(data) ? data : Buffer.from(typeof data === "string" ? data : JSON.stringify(data)),
    compress,
  })));
  return out;
}

const minimalDocument = {
  version: 17,
  name: "Crafted",
  activePageId: "page-1",
  pages: [{ id: "page-1", name: "Page 1", tiles: [] }],
};

function manifestWith(assets = [], extra = {}) {
  return {
    format: "airpaste-share",
    formatVersion: 1,
    canvas: { name: "Crafted", document: "canvas.json", workspaceSchemaVersion: 17 },
    assets,
    ...extra,
  };
}

describe("canvas share round trip", () => {
  it("exports a canvas with its files and imports it intact into another Dome", async () => {
    const canvasPath = await buildSenderCanvas();
    const out = path.join(tmp, "Moodboard.airpaste-share");
    const exported = await exportCanvasShare(canvasPath, out, { appVersion: "test" });

    expect(exported.assetCount).toBe(5); // photo (deduped), pdf, md, webclip, article
    expect(exported.skippedAssets.sort()).toEqual(["../outside.pdf", ".airpaste/ui-state.json"]);

    // Nothing machine-specific leaks into the bundle.
    const zip = await openZip(out);
    const documentEntry = zip.entries.find((entry) => entry.name === "canvas.json");
    const documentText = (await zip.read(documentEntry)).toString("utf8");
    await zip.close();
    expect(documentText).not.toContain(domeA.replaceAll("\\", "\\\\"));
    expect(documentText).not.toContain("someone");
    const manifest = await readZipJson(out, "manifest.json");
    expect(manifest).toMatchObject({ format: "airpaste-share", formatVersion: 1, thumbnail: "thumbnail.jpg" });
    expect(manifest.canvas).toMatchObject({ name: "Moodboard", pageCount: 2, workspaceSchemaVersion: 17 });

    const imported = await importCanvasShare(domeB, out);
    expect(imported.name).toBe("Moodboard");
    expect(imported.warnings).toEqual([]);

    const loaded = await workspaceService.loadCanvas(imported.filePath);
    const original = await workspaceService.loadCanvas(canvasPath, { recordRecent: false });
    expect(loaded.id).not.toBe(original.id);
    expect(loaded.workspace.pages.map((page) => page.name)).toEqual(["Page 1", "Second"]);

    const [pageOne, pageTwo] = loaded.workspace.pages;
    const byText = (predicate) => pageOne.tiles.find(predicate);
    const image = byText((tile) => tile.contentKind === "image");
    const file = byText((tile) => tile.type === "file" && tile.file?.extension === "pdf");
    const note = byText((tile) => tile.source === "file");
    const link = byText((tile) => tile.url === "https://example.com");
    const sticky = byText((tile) => tile.sticky);
    const rack = byText((tile) => tile.type === "rack");
    const child = byText((tile) => tile.parentRackId);

    // Files landed in "<name> files" beside the canvas, with the same bytes.
    expect(image.asset.relativePath).toBe("Moodboard files/photo.png");
    expect(image.image).toBe(image.asset.relativePath);
    expect(await fs.readFile(path.join(domeB, image.asset.relativePath))).toEqual(PNG);
    expect(file.file.relativePath).toBe("Moodboard files/doc.pdf");
    expect(file.file.filePath).toBe(path.join(domeB, "Moodboard files", "doc.pdf"));
    expect(note.file.relativePath).toBe("Moodboard files/Notes.md");
    expect(await fs.readFile(path.join(domeB, note.file.relativePath), "utf8")).toBe("# Notes\nhello");
    expect(link.image).toBe("https://example.com/og.png");
    expect(link.webclipImagePath).toBe(".airpaste/previews/webclip/abc.jpg");
    expect(await fs.readFile(path.join(domeB, link.webclipImagePath))).toEqual(JPG);
    expect(link.article.path).toBe(".airpaste/articles/abc.json");
    expect(pageTwo.tiles[0].asset.relativePath).toBe("Moodboard files/photo.png");

    // Unshareable references were cleared, never pointed at the new Dome.
    const evil = pageOne.tiles.filter((tile) => tile.type === "file" && tile !== file);
    expect(evil.map((tile) => tile.file.relativePath)).toEqual(["", ""]);
    expect(sticky.sticky.filePath).toBeUndefined();
    expect(sticky.text).toBe("see img-1 for reference");

    // Fresh ids, with every reference following them.
    const oldIds = new Set(["img-1", "file-1", "note-1", "link-1", "sticky-1", "rack-1", "child-1", "p2-img"]);
    for (const tile of [...pageOne.tiles, ...pageTwo.tiles]) {
      expect(oldIds.has(tile.id)).toBe(false);
    }
    expect(child.parentRackId).toBe(rack.id);
    expect(pageOne.edges[0]).toMatchObject({ fromNode: image.id, toNode: file.id });
    expect(pageOne.tethers[0]).toMatchObject({ a: image.id, b: link.id });

    // The Home thumbnail came along under the new canvas's path.
    const thumbPath = path.join(domeB, ".airpaste/previews/canvas-thumbs", `${thumbIdFor(imported.path)}.jpg`);
    expect(await fs.readFile(thumbPath)).toEqual(JPG);
  });

  it("imports into a sub-folder and keeps names unique on collisions", async () => {
    const canvasPath = await buildSenderCanvas();
    const out = path.join(tmp, "Moodboard.airpaste-share");
    await exportCanvasShare(canvasPath, out);

    const first = await importCanvasShare(domeB, out, { targetFolderPath: "Shared" });
    const second = await importCanvasShare(domeB, out, { targetFolderPath: "Shared" });
    // Importing back into the Dome it came from works too.
    const third = await importCanvasShare(domeA, out);

    expect(first.path).toBe("Shared/Moodboard.canvas");
    expect(second.path).toBe("Shared/Moodboard 2.canvas");
    expect(third.path).toBe("Moodboard 2.canvas");

    const a = await workspaceService.loadCanvas(first.filePath);
    const b = await workspaceService.loadCanvas(second.filePath);
    const c = await workspaceService.loadCanvas(third.filePath);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    const idsA = new Set(a.workspace.pages[0].tiles.map((tile) => tile.id));
    expect(b.workspace.pages[0].tiles.some((tile) => idsA.has(tile.id))).toBe(false);

    const imageB = b.workspace.pages[0].tiles.find((tile) => tile.contentKind === "image");
    expect(imageB.asset.relativePath).toBe("Shared/Moodboard 2 files/photo.png");
    const linkB = b.workspace.pages[0].tiles.find((tile) => tile.url === "https://example.com");
    expect(linkB.webclipImagePath).toBe(".airpaste/previews/webclip/abc 2.jpg");
    const linkC = c.workspace.pages[0].tiles.find((tile) => tile.url === "https://example.com");
    // The sender's own webclip was never overwritten.
    expect(linkC.webclipImagePath).toBe(".airpaste/previews/webclip/abc 2.jpg");
    expect(await fs.readFile(path.join(domeA, ".airpaste/previews/webclip/abc.jpg"))).toEqual(JPG);
  });

  it("refuses a target folder outside the Dome", async () => {
    const out = await bundle([["manifest.json", manifestWith()], ["canvas.json", minimalDocument]]);
    await expect(importCanvasShare(domeB, out, { targetFolderPath: "../escape" })).rejects.toThrow(/outside/);
  });
});

describe("untrusted share bundles", () => {
  async function expectNothingWritten(promise, pattern) {
    const before = (await listFilesRecursive(domeB)).filter((file) => !file.includes(`${path.sep}tmp${path.sep}`));
    await expect(promise).rejects.toThrow(pattern);
    const after = (await listFilesRecursive(domeB)).filter((file) => !file.includes(`${path.sep}tmp${path.sep}`));
    expect(after.sort()).toEqual(before.sort());
    expect(await fs.stat(path.join(tmp, "evil.txt")).catch(() => null)).toBeNull();
  }

  it("validates entry names (zip-slip)", () => {
    for (const name of ["../evil.txt", "assets/../../evil.txt", "/etc/passwd", "C:/Windows/evil.txt", "assets\\..\\evil.txt", "assets//x.png", "./x", "a/./b", "", "x\u0000.png", "assets/con:x"]) {
      expect(isSafeEntryName(name)).toBe(false);
    }
    expect(isSafeEntryName("assets/001-photo.png")).toBe(true);
  });

  it("rejects a bundle with a path-traversal entry and writes nothing", async () => {
    const out = await bundle([
      ["manifest.json", manifestWith()],
      ["canvas.json", minimalDocument],
      ["../evil.txt", "pwned"],
    ]);
    await expectNothingWritten(importCanvasShare(domeB, out), /unsafe path/);
  });

  it("rejects manifest asset paths outside assets/", async () => {
    const out = await bundle([
      ["manifest.json", manifestWith([{ path: "assets/../../evil.txt", kind: "file", name: "evil.txt" }])],
      ["canvas.json", minimalDocument],
    ]);
    await expectNothingWritten(importCanvasShare(domeB, out), /unexpected place/);
  });

  it("rejects files that aren't share bundles and bundles from the future", async () => {
    const notZip = path.join(tmp, "notzip.airpaste-share");
    await fs.writeFile(notZip, "hello, I am not a zip file at all".repeat(4));
    await expectNothingWritten(importCanvasShare(domeB, notZip), /isn't an AirPaste share file/);

    const foreign = await bundle([["manifest.json", { format: "something-else" }], ["canvas.json", minimalDocument]]);
    await expectNothingWritten(importCanvasShare(domeB, foreign), /isn't an AirPaste share file/);

    const future = await bundle([["manifest.json", manifestWith([], { formatVersion: 99 })], ["canvas.json", minimalDocument]]);
    await expectNothingWritten(importCanvasShare(domeB, future), /newer version of AirPaste/);

    const noPages = await bundle([["manifest.json", manifestWith()], ["canvas.json", { pages: "nope" }]]);
    await expectNothingWritten(importCanvasShare(domeB, noPages), /damaged/);
  });

  it("skips disallowed or disguised files and clears references to them", async () => {
    const document = {
      ...minimalDocument,
      pages: [{
        id: "page-1",
        tiles: [
          { id: "a", type: "file", file: { relativePath: "assets/001-run.exe" } },
          { id: "b", type: "link", contentKind: "image", image: "assets/002-photo.png", asset: { relativePath: "assets/002-photo.png" } },
          { id: "c", type: "file", file: { relativePath: ".airpaste/ui-state.json", filePath: "C:\\Windows\\system32" } },
          { id: "d", type: "link", webclipImagePath: "assets/003-ok.png" },
        ],
      }],
    };
    const out = await bundle([
      ["manifest.json", manifestWith([
        { path: "assets/001-run.exe", kind: "file", name: "run.exe" },
        { path: "assets/002-photo.png", kind: "file", name: "photo.png" },
        { path: "assets/003-ok.png", kind: "file", name: "ok.png" },
      ])],
      ["canvas.json", document],
      ["assets/001-run.exe", "MZ fake executable"],
      ["assets/002-photo.png", "MZ actually an executable"],
      ["assets/003-ok.png", PNG],
    ]);

    const imported = await importCanvasShare(domeB, out);
    expect(imported.warnings).toHaveLength(2);
    expect(imported.assetCount).toBe(1);
    const tiles = (await workspaceService.loadCanvas(imported.filePath)).workspace.pages[0].tiles;
    expect(tiles.map((tile) => tile.file?.relativePath ?? tile.asset?.relativePath ?? tile.webclipImagePath)).toEqual(["", "", "", ""]);
    expect(tiles[2].file.filePath).toBeUndefined();

    const written = await listFilesRecursive(domeB);
    expect(written.some((file) => file.endsWith(".exe"))).toBe(false);
    // ok.png was a "file" asset, so a webclip field may not point at it, but
    // the file itself is still unpacked next to the canvas.
    expect(written.some((file) => file.endsWith(`Crafted files${path.sep}ok.png`))).toBe(true);
  });

  it("detects a lying zip (bomb / corrupted entry) and rolls back what it wrote", async () => {
    const out = await bundle([
      ["manifest.json", manifestWith([
        { path: "assets/001-a.png", kind: "file", name: "a.png" },
        { path: "assets/002-b.txt", kind: "file", name: "b.txt" },
      ])],
      ["canvas.json", minimalDocument],
      ["assets/001-a.png", PNG],
      ["assets/002-b.txt", "A".repeat(100000), true],
    ]);

    // Shrink b.txt's declared size in both headers: inflating it must stop
    // at the declared size instead of expanding the whole payload.
    const raw = await fs.readFile(out);
    const name = Buffer.from("assets/002-b.txt");
    for (let index = raw.indexOf(name); index !== -1; index = raw.indexOf(name, index + 1)) {
      const isCentral = raw.readUInt32LE(index - 46) === 0x02014b50;
      raw.writeUInt32LE(10, isCentral ? index - 46 + 24 : index - 30 + 22);
    }
    await fs.writeFile(out, raw);

    await expectNothingWritten(importCanvasShare(domeB, out), /damaged/);
    const names = await fs.readdir(domeB);
    expect(names.filter((entry) => entry.startsWith("Crafted"))).toEqual([]);
  });

  it("refuses entries larger than the import limits before reading them", async () => {
    const out = await bundle([["manifest.json", manifestWith()], ["canvas.json", minimalDocument], ["assets/001-big.png", PNG]]);
    const raw = await fs.readFile(out);
    const name = Buffer.from("assets/001-big.png");
    const centralIndex = raw.lastIndexOf(name);
    raw.writeUInt32LE(LIMITS.maxEntryBytes + 1, centralIndex - 46 + 24);
    await fs.writeFile(out, raw);
    await expectNothingWritten(importCanvasShare(domeB, out), /larger than AirPaste will import/);
  });
});
