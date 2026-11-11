import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useToast } from "../../hooks/useToast";
import { desktop } from "../../lib/desktop";
import { formatRelativeTime } from "../../lib/home";
import {
  canEditSerendipityNote,
  collectSerendipityEntries,
  getEntryTitle,
  getSerendipityKind,
  getSerendipityNote,
  pickSerendipityDeck,
  readShownAt,
  rememberShown,
  removeSerendipityCard,
  restoreSerendipityCard,
  updateSerendipityNote,
} from "../../lib/serendipity";
import { clampAspect } from "../../systems/constellation/constellationLayout";
import { Canvas as CanvasIcon, ChevronRight, Sparkles, Trash2, X } from "../ui/icons";
import { ConstellationFace } from "./ConstellationFaces";
import ConstellationSky from "./ConstellationSky";
import { useCardImage } from "./ConstellationFaces";
import "./ConstellationFaces.css";
import "./ConstellationView.css";

// The 3D scene (three.js) is a separate chunk, loaded only when this opens.
const ConstellationScene = lazy(() => import("./ConstellationScene"));

const UNDO_VISIBLE_MS = 6000;
const NOTE_SAVE_DELAY_MS = 700;

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The opened tile: its full face next to a quiet panel (notes, delete, open).
function ConstellationFocus({
  entry,
  card,
  onTarget,
  leaving,
  folderPath,
  onClose,
  onMove,
  onDelete,
  onOpenCanvas,
  onSaveNote,
}) {
  const imageSrc = useCardImage(card, folderPath);
  const heroRef = useRef(null);
  const canEdit = canEditSerendipityNote(card);
  const savedNote = getSerendipityNote(card);
  const [note, setNote] = useState(savedNote);
  const noteRef = useRef(note);
  const timeoutRef = useRef(0);
  const title = getEntryTitle(card);
  const kind = getSerendipityKind(card);
  // A tile with a picture is shown as just the picture: no title, no text.
  const pictureOnly = Boolean(imageSrc) && (kind === "image" || kind === "link");

  noteRef.current = note;

  // Tell the scene where the picture sits, so the 3D tile glides onto exactly
  // that spot and the picture takes over from it (and again if it resizes,
  // e.g. once the image has loaded).
  useEffect(() => {
    const hero = heroRef.current;

    if (!hero || !onTarget) {
      return undefined;
    }

    const report = () => {
      const box = hero.getBoundingClientRect();
      onTarget({ cx: box.left + box.width / 2, cy: box.top + box.height / 2, width: box.width, height: box.height });
    };

    report();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(report) : null;
    observer?.observe(hero);
    window.addEventListener("resize", report);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [onTarget, pictureOnly, imageSrc]);

  const flushNote = useCallback(() => {
    window.clearTimeout(timeoutRef.current);

    if (canEdit && noteRef.current !== savedNote) {
      onSaveNote(entry, noteRef.current);
    }
  }, [canEdit, entry, onSaveNote, savedNote]);

  // Saved shortly after typing stops, and when leaving the tile.
  useEffect(() => {
    if (!canEdit || note === savedNote) {
      return undefined;
    }

    timeoutRef.current = window.setTimeout(flushNote, NOTE_SAVE_DELAY_MS);
    return () => window.clearTimeout(timeoutRef.current);
  }, [canEdit, flushNote, note, savedNote]);

  useEffect(() => () => {
    if (canEdit && noteRef.current !== savedNote) {
      onSaveNote(entry, noteRef.current);
    }
    // Only on leaving this tile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.key]);

  return (
    <div className={`ap-const-focus${leaving ? " is-leaving" : ""}`} role="dialog" aria-label={title || "Saved tile"}>
      {/* A div, not a button: the app's button styles must not touch it. */}
      <div className="ap-const-focus__backdrop" aria-hidden="true" onClick={onClose} />
      <div className="ap-const-focus__layout">
        <div ref={heroRef} className={`ap-const-focus__hero ap-const-focus__hero--${pictureOnly ? "image" : kind}`}>
          {pictureOnly ? (
            <img className="ap-const-focus__image" src={imageSrc} alt="" draggable={false} />
          ) : (
            <ConstellationFace card={card} imageSrc={imageSrc} />
          )}
        </div>

        <aside className="ap-const-focus__panel">
          <p className="ap-const-focus__meta">
            From <strong>{entry.canvasName}</strong>
            {entry.pageName ? ` · ${entry.pageName}` : ""}
            {entry.savedAt ? ` · saved ${formatRelativeTime(entry.savedAt)}` : ""}
          </p>

          {canEdit ? (
            <label className="ap-const-focus__notes">
              <span>{kind === "note" || kind === "sticky" ? "Text" : "Notes"}</span>
              <textarea
                value={note}
                placeholder="Add a note…"
                rows={5}
                onChange={(event) => setNote(event.target.value)}
                onBlur={flushNote}
              />
            </label>
          ) : (
            <p className="ap-const-focus__quiet">This kind of tile can be edited on its canvas.</p>
          )}

          <div className="ap-const-focus__actions">
            <button type="button" className="ap-const__btn" onClick={() => void onOpenCanvas(entry)}>
              <CanvasIcon size={14} aria-hidden="true" />
              Open canvas
            </button>
            <button type="button" className="ap-const__btn ap-const__btn--danger" onClick={() => void onDelete(entry)} title="Delete this tile">
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
          </div>

          <div className="ap-const-focus__nav" aria-label="Move to another tile">
            <button type="button" className="ap-const__round ap-const__round--flip" onClick={() => onMove("left")} aria-label="Previous tile (←)">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button type="button" className="ap-const__round" onClick={() => onMove("right")} aria-label="Next tile (→)">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <span>← → ↑ ↓ to move · Esc to go back</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ConstellationView({ canvasItems, onClose }) {
  const { folderPath, openHomeItem, rewriteCanvasFile, flushAllPendingCanvasSaves } = useAppContext();
  const { toast } = useToast();
  const [status, setStatus] = useState("loading");
  const [items, setItems] = useState([]);
  const [focus, setFocus] = useState(null);
  const [removed, setRemoved] = useState(() => new Set());
  const [overrides, setOverrides] = useState({});
  const [undo, setUndo] = useState(null);
  const [arrived, setArrived] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef(null);
  const sceneApiRef = useRef(null);
  const leaveTimeoutRef = useRef(0);
  const closeTimeoutRef = useRef(0);
  // The blanket's pan (written by the scene) and what the screen is doing
  // (read by the sky), so the night sky moves with both.
  const panRef = useRef({ x: 3.5, y: 0 });
  const skyModeRef = useRef({ mode: "enter", since: performance.now() });
  const undoTimeoutRef = useRef(0);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  // App-level chrome that shouldn't show over the sky (the quick note)
  // hides itself off this flag.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-constellation-open", "");
    return () => root.removeAttribute("data-constellation-open");
  }, []);

  const canvasPaths = useMemo(
    () => canvasItems.map((item) => item.filePath).filter(Boolean),
    [canvasItems],
  );

  useEffect(() => {
    let cancelled = false;

    async function gather() {
      setStatus("loading");
      try {
        await flushAllPendingCanvasSaves?.().catch(() => {});
        const docs = await Promise.all(canvasPaths.map((filePath) => (
          desktop.workspace.loadCanvas(filePath, { recordRecent: false }).catch(() => null)
        )));

        if (cancelled) return;

        const entries = collectSerendipityEntries(docs.filter(Boolean));
        // Every tile goes in the deck (the sphere shows a few hundred at a
        // time and swaps the rest in as you turn), weighted toward older saves.
        const picked = pickSerendipityDeck(entries, {
          limit: entries.length,
          shownAt: readShownAt(),
        }).map((entry) => ({ ...entry, aspect: clampAspect(entry.card.width, entry.card.height) }));

        setItems(picked);
        setStatus(picked.length ? "ready" : "empty");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void gather();
    return () => {
      cancelled = true;
    };
  }, [canvasPaths, flushAllPendingCanvasSaves]);

  useEffect(() => {
    rootRef.current?.focus();
    return () => {
      window.clearTimeout(undoTimeoutRef.current);
      window.clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  const focusedEntry = focus ? items[focus.item] ?? null : null;
  const focusedCard = focusedEntry ? overrides[focusedEntry.key] ?? focusedEntry.card : null;

  useEffect(() => {
    if (focusedEntry) rememberShown(focusedEntry.key);
  }, [focusedEntry]);

  const handlePick = useCallback((slot, item) => {
    window.clearTimeout(leaveTimeoutRef.current);
    setFocus({ slot, item });
  }, []);

  const setFocusTarget = useCallback((rect) => sceneApiRef.current?.setFocusTarget(rect), []);

  // True full screen while this is open: the window itself goes full screen
  // (and goes back to how it was on the way out).
  useEffect(() => {
    desktop.window.enterImmersive?.();
    const settle = window.setTimeout(() => {
      skyModeRef.current = { mode: "idle", since: performance.now() };
    }, 2000);

    return () => {
      window.clearTimeout(settle);
      desktop.window.exitImmersive?.();
    };
  }, []);

  // Closing lets the tile settle back first (the panel fades, the picture
  // eases down), then removes it.
  const closeFocus = useCallback(() => {
    setFocus((current) => (current && !current.leaving ? { ...current, leaving: true } : current));
    window.clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = window.setTimeout(() => setFocus(null), reducedMotion ? 0 : 950);
  }, [reducedMotion]);

  const move = useCallback((direction) => {
    setFocus((current) => {
      if (!current || current.leaving) return current;
      const next = sceneApiRef.current?.getAdjacent(current.slot, direction);
      return next ? { slot: next.slot, item: next.item } : current;
    });
  }, []);

  const saveNote = useCallback(async (entry, text) => {
    try {
      const result = await rewriteCanvasFile(entry.canvasFilePath, (workspace) => (
        updateSerendipityNote(workspace, entry.pageId, entry.card.id, text)
      ));

      if (result?.card) {
        setOverrides((value) => ({ ...value, [entry.key]: result.card }));
      }
    } catch (error) {
      toast("error", error?.message || "Couldn't save that note.");
    }
  }, [rewriteCanvasFile, toast]);

  const deleteTile = useCallback(async (entry) => {
    const index = items.indexOf(entry);
    if (index < 0) return;

    setRemoved((value) => new Set(value).add(index));
    // Move on to a neighbour, or back to the sky if none is left.
    const next = focus ? sceneApiRef.current?.getAdjacent(focus.slot, "right") : null;
    if (!next || next.item === index) {
      closeFocus();
    } else {
      setFocus({ slot: next.slot, item: next.item });
    }

    try {
      const result = await rewriteCanvasFile(entry.canvasFilePath, (workspace) => (
        removeSerendipityCard(workspace, entry.pageId, entry.card.id)
      ));

      if (!result) return;

      window.clearTimeout(undoTimeoutRef.current);
      setUndo({ index, entry, removed: result.removed });
      undoTimeoutRef.current = window.setTimeout(() => setUndo(null), UNDO_VISIBLE_MS);
    } catch (error) {
      setRemoved((value) => {
        const next = new Set(value);
        next.delete(index);
        return next;
      });
      toast("error", error?.message || "Couldn't delete that tile.");
    }
  }, [closeFocus, focus, items, rewriteCanvasFile, toast]);

  const undoDelete = useCallback(async () => {
    if (!undo) return;
    const { entry, index, removed: removedInfo } = undo;
    window.clearTimeout(undoTimeoutRef.current);
    setUndo(null);

    try {
      await rewriteCanvasFile(entry.canvasFilePath, (workspace) => {
        const restored = restoreSerendipityCard(workspace, removedInfo);
        return restored ? { workspace: restored } : null;
      });
      setRemoved((value) => {
        const next = new Set(value);
        next.delete(index);
        return next;
      });
    } catch (error) {
      toast("error", error?.message || "Couldn't bring that tile back.");
    }
  }, [rewriteCanvasFile, toast, undo]);

  // Leaving: the sky rushes off and the view wipes away from left to right,
  // uncovering Home, then it goes. (Opening a canvas skips the wipe.)
  const requestClose = useCallback(() => {
    if (closing) return;

    if (reducedMotion) {
      onClose();
      return;
    }

    skyModeRef.current = { mode: "exit", since: performance.now() };
    desktop.window.exitImmersive?.();
    setClosing(true);
    closeTimeoutRef.current = window.setTimeout(onClose, 720);
  }, [closing, onClose, reducedMotion]);

  useEffect(() => () => window.clearTimeout(closeTimeoutRef.current), []);

  const openCanvas = useCallback(async (entry) => {
    window.clearTimeout(closeTimeoutRef.current);
    onClose();
    await openHomeItem({ type: "canvas", filePath: entry.canvasFilePath });
  }, [onClose, openHomeItem]);

  const handleKeyDown = useCallback((event) => {
    const typing = event.target instanceof HTMLElement && /^(TEXTAREA|INPUT)$/.test(event.target.tagName);

    if (event.key === "Escape") {
      event.preventDefault();
      if (focus) closeFocus();
      else requestClose();
      return;
    }

    if (!focus || typing) return;

    const directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

    if (directions[event.key]) {
      event.preventDefault();
      move(directions[event.key]);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (focusedEntry) void deleteTile(focusedEntry);
    }
  }, [closeFocus, deleteTile, focus, focusedEntry, move, requestClose]);

  return (
    <div
      ref={rootRef}
      className={`ap-const${arrived || reducedMotion ? " is-arrived" : ""}${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Constellation"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onAnimationEnd={(event) => {
        if (event.target === rootRef.current && event.animationName === "ap-const-swoop") setArrived(true);
      }}
    >
      <ConstellationSky panRef={panRef} modeRef={skyModeRef} reducedMotion={reducedMotion} />

      <div className={`ap-const__stage${focus && !focus.leaving ? " is-focused" : ""}${sceneReady ? " is-ready" : ""}`}>
        {status === "ready" ? (
          <Suspense fallback={null}>
            <ConstellationScene
              items={items}
              folderPath={folderPath}
              focusedSlot={focus && !focus.leaving ? focus.slot : -1}
              removedItems={removed}
              apiRef={sceneApiRef}
              panRef={panRef}
              reducedMotion={reducedMotion}
              onPick={handlePick}
              onReady={() => setSceneReady(true)}
            />
          </Suspense>
        ) : null}
      </div>

      <div className="ap-const__edge" aria-hidden="true" />

      <header className="ap-const__top">
        <div className="ap-const__brand">
          <Sparkles size={16} aria-hidden="true" />
          <span>Constellation</span>
        </div>
        <button type="button" className="ap-const__round" onClick={requestClose} aria-label="Close Constellation" title="Close (Esc)">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      {status === "loading" ? (
        <div className="ap-const__message"><p>Gathering your stars…</p></div>
      ) : null}
      {status === "empty" ? (
        <div className="ap-const__message">
          <h2>Nothing to see yet</h2>
          <p>Save links, images and notes to your canvases and they will gather here.</p>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="ap-const__message"><h2>Couldn&rsquo;t gather your saves</h2></div>
      ) : null}

      {status === "ready" && !focus && sceneReady ? (
        <p className="ap-const__hint">Drag to pan in any direction · flick to glide · click a tile to open it · Esc to leave</p>
      ) : null}

      {focusedEntry && focusedCard ? (
        <ConstellationFocus
          key={focusedEntry.key}
          entry={focusedEntry}
          card={focusedCard}
          onTarget={setFocusTarget}
          leaving={Boolean(focus.leaving)}
          folderPath={folderPath}
          onClose={closeFocus}
          onMove={move}
          onDelete={deleteTile}
          onOpenCanvas={openCanvas}
          onSaveNote={saveNote}
        />
      ) : null}

      {undo ? (
        <div className="ap-const__undo" role="status">
          <span>Deleted {getEntryTitle(undo.entry.card) ? `“${getEntryTitle(undo.entry.card)}”` : "that tile"}</span>
          <button type="button" className="ap-const__link" onClick={() => void undoDelete()}>Undo</button>
        </div>
      ) : null}
    </div>
  );
}
