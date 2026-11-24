import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatRelativeTime } from "../../lib/home";
import { buildHomeEntries, canvasLayoutKey } from "../../lib/homeLayout";
import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "../ui/app";
import { CardColorMenu } from "../ui/CardColorMenu";
import { ContextMenuItem, ContextMenuSeparator } from "../ui/context-menu";
import { Folder, FolderOpen, MoreHorizontal, Pencil, Star, Trash2, X } from "../ui/icons";
import { loadCanvasEntries } from "../../systems/home/homeTiles";
import { getSerendipityKind } from "../../lib/serendipity";
import HomeTileCard from "./HomeTileCard";
import "./HomeFiles.css";

// Files view (Home, next to List and Cards): every entry is a kraft folder
// object. A canvas shows a few of its tiles peeking out as coloured cards; a
// group (folder) shows its canvases as grey paper sheets with their names.
// Hover tips the frosted front forward and the contents rise. Clicking a
// canvas opens it; clicking a group spreads its canvases over the page (the
// folder slips to the bottom-left corner), and a paper opens that canvas.
//
// The folder shape is two 6-point outlines (back and frosted front) with
// rounded corners, drawn as clip-paths. Closed and open use the same vertex
// count, so the browser morphs one into the other on hover.

const KF_W = 372;
const KF_H = 236;
const KF_BACK_C = [[34.7, 21.6, 8], [152, 21.6, 6], [168.5, 46.1, 6], [345.7, 46.1, 8], [345.7, 247.6, 8], [34.7, 247.6, 8]];
const KF_BACK_O = [[85.8, 0, 7], [161.5, 0, 6], [174.5, 24.5, 6], [302.4, 24.5, 7], [346, 247.6, 8], [36, 247.6, 8]];
const KF_FRONT_C = [[24, 51.2, 8], [290, 51.2, 6], [309, 16.4, 6], [356.4, 16.4, 8], [350.8, 247.6, 8], [32, 247.6, 8]];
const KF_FRONT_O = [[0, 120.1, 8], [310, 120.1, 6], [348, 97.6, 6], [394.5, 97.6, 8], [348, 247.6, 8], [36, 247.6, 8]];

function roundedPath(points, ox = 4, oy = 8) {
  const n = points.length;
  const f = (v) => v.toFixed(1);
  let d = "";
  points.forEach((P, i) => {
    const A = points[(i - 1 + n) % n];
    const B = points[(i + 1) % n];
    const da = Math.hypot(A[0] - P[0], A[1] - P[1]);
    const db = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const r1 = Math.min(P[2], da / 2) / da;
    const r2 = Math.min(P[2], db / 2) / db;
    const p1 = [P[0] + (A[0] - P[0]) * r1 + ox, P[1] + (A[1] - P[1]) * r1 + oy];
    const p2 = [P[0] + (B[0] - P[0]) * r2 + ox, P[1] + (B[1] - P[1]) * r2 + oy];
    d += `${i ? "L" : "M"}${f(p1[0])} ${f(p1[1])}Q${f(P[0] + ox)} ${f(P[1] + oy)} ${f(p2[0])} ${f(p2[1])}`;
  });
  return `${d}Z`;
}

// The clip-paths are computed once and shared by every folder.
let shapesInjected = false;
function injectFolderShapes() {
  if (shapesInjected || typeof document === "undefined") return;
  shapesInjected = true;
  const style = document.createElement("style");
  style.dataset.apHomeFiles = "";
  style.textContent = `
.ap-kf__back{clip-path:path("${roundedPath(KF_BACK_C)}")}
.ap-kf__front{clip-path:path("${roundedPath(KF_FRONT_C)}")}
.ap-fo:hover .ap-kf__back,.ap-fo:focus-within .ap-kf__back,.ap-kf--open .ap-kf__back{clip-path:path("${roundedPath(KF_BACK_O)}")}
.ap-fo:hover .ap-kf__front,.ap-fo:focus-within .ap-kf__front,.ap-kf--open .ap-kf__front{clip-path:path("${roundedPath(KF_FRONT_O)}")}`;
  document.head.appendChild(style);
}

function hashString(value) {
  let h = 1779033703 ^ value.length;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function canvasMeta(item) {
  const pages = Number.isFinite(item.pageCount) ? item.pageCount : 0;
  const tiles = Number.isFinite(item.tileCount) ? item.tileCount : 0;
  return [pages > 0 ? plural(pages, "page") : null, plural(tiles, "tile")].filter(Boolean).join(", ");
}

// A canvas: its real tiles (up to MAX_FOLDER_TILES) tucked in the folder as
// little cards, read from the canvas file the first time the folder scrolls
// into view (loadCanvasEntries caches by path + last edit). A few peek out
// over the front when closed; on hover the rest fill in and everything rises.
const MAX_FOLDER_TILES = 20;
// The tiles' area inside the 404 x 262 folder drawing (.ap-kf__tiles), px.
const TILE_AREA_W = 299;

function layoutFolderTiles(count, seed) {
  if (count <= 0) return [];
  const r = seededRandom(seed);
  const cols = count === 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : count <= 14 ? 4 : 5;
  const rows = Math.ceil(count / cols);
  const cellW = 100 / cols;
  const widthPx = Math.min(count === 1 ? 150 : 128, (TILE_AREA_W / cols) * 0.94);
  const rowStep = Math.min(26, 62 / Math.max(1, rows - 1 || 1));
  // The top row (and a bit of the second) peeks out when closed.
  const peeking = Math.min(count, cols + (rows > 2 ? Math.ceil(cols / 2) : cols));
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = Math.min(cols, count - row * cols);
    const offset = (cols - inRow) * cellW / 2;
    const rot = r() * 6 - 3;
    const shown = i < peeking;
    return {
      width: widthPx,
      style: {
        "--x": `${(offset + col * cellW + (cellW - (widthPx / TILE_AREA_W) * 100) / 2 + (r() * 4 - 2)).toFixed(1)}%`,
        "--y": `${(2 + row * rowStep + (r() * 4 - 2)).toFixed(1)}%`,
        "--r": `${rot.toFixed(1)}deg`,
        "--r2": `${(rot * 1.5).toFixed(1)}deg`,
        "--rise": `${(-(16 - Math.min(row, 3) * 3) - r() * 8).toFixed(1)}%`,
        "--s0": shown ? 1 : 0.5,
        "--o0": shown ? 1 : 0,
        "--d": `${shown ? 0 : 40 + Math.round((i - peeking) * 24)}ms`,
        zIndex: count - i,
      },
    };
  });
}

function hasFolderFace(entry) {
  return getSerendipityKind(entry.card) !== "link" || Boolean(entry.card?.image);
}

function useInView(ref) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) setInView(true);
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, ref]);
  return inView;
}

function TileContents({ item, folderPath }) {
  const areaRef = useRef(null);
  const inView = useInView(areaRef);
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    if (!inView) return undefined;
    let cancelled = false;
    loadCanvasEntries(item).then((list) => {
      // Inside a folder a tile shows only its picture, so a link with no
      // preview image would be an empty card: leave those out.
      if (!cancelled) setEntries(list.filter(hasFolderFace).slice(0, MAX_FOLDER_TILES));
    });
    return () => {
      cancelled = true;
    };
  }, [inView, item]);

  const placed = useMemo(
    () => layoutFolderTiles(entries?.length ?? 0, hashString(item.filePath || item.name || "canvas")),
    [entries, item.filePath, item.name],
  );

  return (
    <span ref={areaRef} className="ap-kf__tiles">
      {entries?.map((entry, index) => (
        <span key={entry.key} className="ap-fo__it ap-fo__it--tile" style={placed[index].style}>
          <HomeTileCard entry={entry} folderPath={folderPath} width={placed[index].width} />
        </span>
      ))}
    </span>
  );
}

// A group: grey paper sheets with the canvas names on their header strip.
function SheetContents({ names, seed }) {
  const sheets = useMemo(() => {
    const r = seededRandom(hashString(seed || "group") + 3);
    const list = names.slice(0, 4);
    const n = list.length;
    return list.map((name, i) => {
      const w = 30 + r() * 6;
      const rot = r() * 8 - 4;
      return {
        key: `${i}:${name}`,
        name,
        style: {
          "--x": `${(22 + i * ((66 - w) / Math.max(1, n - 1)) + (r() * 4 - 2)).toFixed(1)}%`,
          "--y": `${((i === 0 ? 15 : i % 2 ? 13 : 8) + r() * 3).toFixed(1)}%`,
          "--w": `${w.toFixed(1)}%`,
          "--h": "72%",
          "--r": `${rot.toFixed(1)}deg`,
          "--r2": `${(rot * 1.4).toFixed(1)}deg`,
          "--rise": `${(-(10 + r() * 8)).toFixed(1)}%`,
          "--s0": 1,
          "--o0": 1,
          "--d": `${i * 30}ms`,
        },
      };
    });
  }, [names, seed]);

  return sheets.map((sheet) => (
    <i key={sheet.key} className="ap-fo__it ap-fo__it--sheet" style={sheet.style}>
      <b>{sheet.name || " "}</b>
    </i>
  ));
}

// The kraft folder itself, scaled to its box (designed at 372 wide).
function KraftFolder({ open = false, variant = "folder", children, label = null }) {
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    injectFolderShapes();
    const box = boxRef.current;
    if (!box) return undefined;
    const apply = () => box.style.setProperty("--k", (box.clientWidth / KF_W).toFixed(4));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="ap-fo__box">
      <div className={`ap-kf${open ? " ap-kf--open" : ""}${variant === "file" ? " ap-kf--file" : ""}`}>
        <div className="ap-kf__back" />
        <div className="ap-kf__in">{children}</div>
        <div className="ap-kf__front">{label}</div>
      </div>
      <svg className="ap-fo__dash" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
        <path style={{ "--k": 0 }} d="M262 2l14-12" />
        <path style={{ "--k": 1 }} d="M282 8l18-10" />
        <path style={{ "--k": 2 }} d="M50 4l-10-12" />
        <path style={{ "--k": 3 }} d="M34 12l-14-8" />
        <path style={{ "--k": 2 }} d="M326 70h12" />
        <path style={{ "--k": 3 }} d="M326 80h8" />
      </svg>
    </div>
  );
}

// forwardRef + rest props: CardColorMenu wraps it as its right-click trigger.
const FileObject = forwardRef(function FileObject({ name, meta, starred, ariaLabel, onOpen, menu, children, style, ...rest }, ref) {
  return (
    <article ref={ref} className="ap-fo" role="listitem" style={style} {...rest}>
      <button type="button" className="ap-fo__hit" aria-label={ariaLabel} onClick={onOpen}>
        {children}
        <span className="ap-fo__tag">
          <span className="ap-fo__name">
            {starred ? <Star size={12} fill="currentColor" aria-hidden="true" className="ap-fo__star" /> : null}
            {name}
          </span>
          <small className="ap-fo__meta">{meta}</small>
        </span>
      </button>
      <div className="ap-fo__more">{menu}</div>
    </article>
  );
});

function MoreMenu({ label, children }) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <AppButton type="button" tone="unstyled" className="ap-fo__more-btn" aria-label={label} title="More actions">
          <MoreHorizontal size={15} aria-hidden="true" />
        </AppButton>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={6}>{children}</AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

// A group opened: the page blurs, the folder slips to the bottom-left corner
// in its open shape, and its canvases fly out into a tidy grid of papers.
// The cover, empty space, × or Esc gather them back in.
function FolderSpread({ group, items, sourceRect, onOpenCanvas, onClose }) {
  const rootRef = useRef(null);
  const [phase, setPhase] = useState("start");

  useLayoutEffect(() => {
    // first paint in the start pose, then fly out
    const frame = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = () => {
    if (phase === "end") return;
    setPhase("end");
    window.setTimeout(onClose, 650);
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useLayoutEffect(() => {
    if (phase === "open") rootRef.current?.querySelector(".ap-spread__paper")?.focus({ preventScroll: true });
  }, [phase]);

  const W = window.innerWidth;
  const H = window.innerHeight;
  const cw = Math.max(140, Math.min(190, W * 0.13));
  const ch = cw * 1.1;
  const fw = 300;
  const fh = (fw * KF_H) / KF_W;
  const at = (cx, cy, w, h, rot, scale = 1, opacity = 1) => ({
    width: `${w}px`,
    height: `${h}px`,
    transform: `translate(${(cx - w / 2).toFixed(1)}px, ${(cy - h / 2).toFixed(1)}px) rotate(${rot}deg) scale(${scale})`,
    opacity,
    pointerEvents: opacity ? undefined : "none",
  });

  const resting = phase === "start" || phase === "end";
  const folderCentre = resting && sourceRect
    ? [sourceRect.left + sourceRect.width / 2, sourceRect.top + sourceRect.height / 2]
    : [fw * 0.36, H - fh * 0.22];
  const folderStyle = resting
    ? sourceRect
      ? at(folderCentre[0], folderCentre[1], fw, fh, 0, sourceRect.width / fw)
      : at(-fw, H + fh, fw, fh, 55, 1, phase === "end" ? 0 : 1)
    : at(folderCentre[0], folderCentre[1], fw, fh, 58, 1.05);

  const n = items.length;
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * 1.7))));
  const rows = Math.ceil(n / cols);
  const gx = cw * 1.22;
  const gy = ch * 1.18;
  const ox = W / 2 - ((cols - 1) * gx) / 2;
  const oy = H / 2 - ((rows - 1) * gy) / 2;

  return createPortal(
    <>
      <div className={`ap-spread-blur${phase === "open" ? " is-on" : ""}`} aria-hidden="true" />
      <div ref={rootRef} className="ap-spread" role="dialog" aria-label={group.name} data-phase={phase}>
        <div className="ap-spread__scrim" onClick={close} />
        <button
          type="button"
          className="ap-spread__x"
          style={{ transform: `translate(${W - 52}px, 14px)`, opacity: phase === "end" ? 0 : 1 }}
          aria-label="Close folder"
          onClick={close}
        >
          <X size={14} aria-hidden="true" />
        </button>
        <div
          className="ap-spread__abs ap-spread__folder"
          role="button"
          tabIndex={0}
          aria-label={`Close ${group.name}`}
          style={folderStyle}
          onClick={close}
          onKeyDown={(event) => { if (event.key === "Enter") close(); }}
        >
          <KraftFolder open label={(
            <div className="ap-spread__name">
              {group.name}
              <small>{n} {n === 1 ? "canvas" : "canvases"}, tap to gather</small>
            </div>
          )}
          />
        </div>
        {items.map((item, i) => {
          const r = seededRandom(hashString(group.name) + i * 97);
          const style = resting
            ? at(folderCentre[0], folderCentre[1], cw, ch, phase === "start" && sourceRect ? 0 : 55, 0.2, 0)
            : at(ox + (i % cols) * gx, oy + Math.floor(i / cols) * gy, cw, ch, (r() * 6 - 3).toFixed(1));
          return (
            <div
              key={canvasLayoutKey(item)}
              className="ap-spread__abs ap-spread__paper"
              role="button"
              tabIndex={0}
              aria-label={`Open ${item.name}`}
              style={{ ...style, "--d": `${phase === "end" ? (n - i) * 18 : 80 + i * 40}ms` }}
              onClick={() => onOpenCanvas(item)}
              onKeyDown={(event) => { if (event.key === "Enter") onOpenCanvas(item); }}
            >
              <div className="ap-spread__sheet">
                <div className="ap-spread__head">{item.name}</div>
                <div className="ap-spread__body">
                  <span className="ap-spread__meta">{canvasMeta(item)}, {formatRelativeTime(item.updatedAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

export default function HomeFilesView({
  folderPath,
  canvases,
  layout,
  grouping,
  starredGroups,
  onOpenCanvas,
  onRename,
  onDelete,
  onToggleStar,
  onRenameGroup,
  onToggleGroupStar,
  onUngroup,
}) {
  const [spread, setSpread] = useState(null);

  const entries = useMemo(() => {
    if (!Array.isArray(canvases)) return [];
    if (grouping) return buildHomeEntries(canvases, layout);
    return [
      ...(starredGroups ?? []),
      ...canvases.map((item) => ({ type: "canvas", key: canvasLayoutKey(item), item })),
    ];
  }, [canvases, grouping, layout, starredGroups]);
  const entryKeys = useMemo(() => entries.map((entry) => entry.key), [entries]);

  const openGroup = (entry, event) => {
    const box = event?.currentTarget?.querySelector?.(".ap-fo__box");
    setSpread({ entry, rect: box ? box.getBoundingClientRect() : null, box });
    if (box) box.style.visibility = "hidden";
  };
  const closeSpread = () => {
    if (spread?.box) spread.box.style.visibility = "";
    setSpread(null);
  };

  return (
    <>
      <div className="ap-files-grid" role="list">
        {entries.map((entry, index) => {
          const style = { "--ap-stagger": Math.min(index, 14) };
          if (entry.type === "group") {
            const { group, items } = entry;
            return (
              <CardColorMenu
                key={entry.key}
                itemKey={entry.key}
                extraItems={(
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => setSpread({ entry, rect: null })}>
                      <FolderOpen size={14} aria-hidden="true" />
                      Open folder
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onUngroup(entryKeys, group.id)}>
                      <Folder size={14} aria-hidden="true" />
                      Ungroup
                    </ContextMenuItem>
                  </>
                )}
              >
                <FileObject
                  name={group.name}
                  meta={`${items.length} ${items.length === 1 ? "canvas" : "canvases"}`}
                  starred={group.starred}
                  ariaLabel={`Open folder ${group.name}, ${items.length} canvases`}
                  onOpen={(event) => openGroup(entry, event)}
                  style={style}
                  menu={(
                    <MoreMenu label={`More actions for ${group.name}`}>
                      <AppDropdownMenuItem onSelect={() => setSpread({ entry, rect: null })}>
                        <FolderOpen size={14} aria-hidden="true" />
                        Open folder
                      </AppDropdownMenuItem>
                      <AppDropdownMenuItem onSelect={() => onRenameGroup(group)}>
                        <Pencil size={14} aria-hidden="true" />
                        Rename
                      </AppDropdownMenuItem>
                      <AppDropdownMenuItem onSelect={() => onToggleGroupStar(group.id)}>
                        <Star size={14} aria-hidden="true" fill={group.starred ? "currentColor" : "none"} />
                        {group.starred ? "Remove star" : "Add star"}
                      </AppDropdownMenuItem>
                      <AppDropdownMenuSeparator />
                      <AppDropdownMenuItem onSelect={() => onUngroup(entryKeys, group.id)}>
                        <Folder size={14} aria-hidden="true" />
                        Ungroup
                      </AppDropdownMenuItem>
                    </MoreMenu>
                  )}
                >
                  <KraftFolder>
                    <SheetContents names={items.map((item) => item.name)} seed={group.name} />
                  </KraftFolder>
                </FileObject>
              </CardColorMenu>
            );
          }

          const { item } = entry;
          return (
            <CardColorMenu key={entry.key} itemKey={entry.key}>
              <FileObject
                name={item.name}
                meta={`${canvasMeta(item)}, ${formatRelativeTime(item.updatedAt)}`}
                starred={item.starred}
                ariaLabel={`Open ${item.name}, ${canvasMeta(item)}`}
                onOpen={() => onOpenCanvas(item)}
                style={style}
                menu={(
                  <MoreMenu label={`More actions for ${item.name}`}>
                    <AppDropdownMenuItem onSelect={() => onOpenCanvas(item)}>
                      <FolderOpen size={14} aria-hidden="true" />
                      Open
                    </AppDropdownMenuItem>
                    <AppDropdownMenuItem onSelect={() => onToggleStar(item)}>
                      <Star size={14} aria-hidden="true" fill={item.starred ? "currentColor" : "none"} />
                      {item.starred ? "Remove star" : "Add star"}
                    </AppDropdownMenuItem>
                    <AppDropdownMenuItem onSelect={() => onRename(item)}>
                      <Pencil size={14} aria-hidden="true" />
                      Rename
                    </AppDropdownMenuItem>
                    <AppDropdownMenuSeparator />
                    <AppDropdownMenuItem onSelect={() => onDelete(item)}>
                      <Trash2 size={14} aria-hidden="true" />
                      Delete
                    </AppDropdownMenuItem>
                  </MoreMenu>
                )}
              >
                <KraftFolder variant="file">
                  <TileContents item={item} folderPath={folderPath} />
                </KraftFolder>
              </FileObject>
            </CardColorMenu>
          );
        })}
      </div>
      {spread ? (
        <FolderSpread
          group={spread.entry.group}
          items={spread.entry.items}
          sourceRect={spread.rect}
          onOpenCanvas={(item) => {
            closeSpread();
            onOpenCanvas(item);
          }}
          onClose={closeSpread}
        />
      ) : null}
    </>
  );
}
