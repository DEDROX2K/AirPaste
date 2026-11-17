import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { desktop } from "../lib/desktop";
import {
  QUICK_NOTE_MAX_ITEMS,
  QUICK_NOTE_SAVE_DEBOUNCE_MS,
  makeQuickNoteItem,
  normalizeQuickNote,
} from "../lib/quickNote";
import { Check, ListChecks, X } from "./ui/icons";
import EdgeConnector from "./ui/app/icons/EdgeConnector";
import "./QuickNote.css";

// Stops pointer, key and clipboard events at the panel, so typing a task
// never fires canvas shortcuts and pressing in the panel never starts a
// marquee or a tile drag underneath it.
const stop = (event) => event.stopPropagation();

// Same seed, same scribble: a task keeps its own hand-drawn line across
// re-renders, but no two tasks (or lines) share one.
function seededRandom(seedText) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = Math.imul(seed ^ seedText.charCodeAt(index), 16777619);
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value) => Math.round(value * 10) / 10;

// One continuous pen stroke over every wrapped line: loopy curls across a
// line (only as far as its words go), then a long diagonal return sweep down
// to the start of the next line, like crossing out a paragraph by hand.
function buildScribblePath(lines, seedText) {
  const rand = seededRandom(seedText);
  const jitter = (amount) => (rand() - 0.5) * 2 * amount;
  const parts = [];
  let pen = null;

  lines.forEach((line, lineIndex) => {
    const amp = line.height * 0.28;
    const y = line.top + line.height * 0.55 + jitter(1.2);
    const startX = line.left - 1 + jitter(1.5);
    const endX = line.left + line.width + 1 + jitter(1.5);

    if (lineIndex === 0 || !pen) {
      parts.push(`M${round(startX)} ${round(y + jitter(2))}`);
    } else {
      // Return sweep: from the end of the line above back to this line's start.
      parts.push(
        `C${round(pen.x + 6)} ${round(pen.y + line.height * 0.45)},`
        + ` ${round(startX + 18 + jitter(4))} ${round(y - line.height * 0.55)},`
        + ` ${round(startX)} ${round(y)}`,
      );
    }

    const span = Math.max(8, endX - startX);
    const loops = Math.max(1, Math.round(span / (24 + jitter(4))));
    const step = span / loops;
    let x = startX;
    for (let loop = 0; loop < loops; loop += 1) {
      const s = step * (1 + jitter(0.12));
      const lift = amp * (1 + jitter(0.25));
      const sink = amp * (1 + jitter(0.25));
      const nextX = Math.min(endX, x + s);
      // Up and forward, then curl back down and on: one loop of the pen.
      parts.push(
        `C${round(x + s * 0.45)} ${round(y - lift)}, ${round(x + s * 0.95)} ${round(y - lift * 1.05)}, ${round(x + s * 0.72)} ${round(y)}`,
        `C${round(x + s * 0.5)} ${round(y + sink)}, ${round(nextX - s * 0.2)} ${round(y + sink * 0.9)}, ${round(nextX)} ${round(y + jitter(1.5))}`,
      );
      x = nextX;
    }
    pen = { x, y };
  });

  return parts.join(" ");
}

// The text box and each wrapped line's box (left, top, width, height),
// read from a hidden copy of the text laid out exactly like the textarea.
function useWrappedLines(wrapRef, measureRef, text, enabled) {
  const [layout, setLayout] = useState(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const mirror = measureRef.current;
    if (!enabled || !wrap || !mirror) {
      setLayout(null);
      return undefined;
    }

    const measure = () => {
      const textNode = mirror.firstChild;
      const box = wrap.getBoundingClientRect();
      if (!textNode || !box.width) return;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const byTop = new Map();
      for (const rect of range.getClientRects()) {
        if (rect.width < 1) continue;
        const key = Math.round(rect.top);
        const existing = byTop.get(key);
        if (existing) {
          existing.left = Math.min(existing.left, rect.left);
          existing.right = Math.max(existing.right, rect.right);
        } else {
          byTop.set(key, { left: rect.left, right: rect.right, top: rect.top, height: rect.height });
        }
      }
      const lines = [...byTop.values()]
        .sort((a, b) => a.top - b.top)
        .map((rect) => ({
          left: rect.left - box.left,
          top: rect.top - box.top,
          width: rect.right - rect.left,
          height: rect.height,
        }));
      setLayout({ width: box.width, height: box.height, lines });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [enabled, measureRef, text, wrapRef]);

  return layout;
}

function Scribble({ layout, seed }) {
  const d = useMemo(
    () => (layout?.lines.length ? buildScribblePath(layout.lines, `${seed}:${layout.lines.length}`) : ""),
    [layout, seed],
  );
  if (!d) return null;
  const lineCount = layout.lines.length;
  return (
    <svg
      className="quick-note__scribble"
      width={layout.width}
      height={layout.height}
      style={{ "--quick-note-scribble-ms": `${320 + 240 * (lineCount - 1)}ms` }}
      aria-hidden="true"
    >
      <path pathLength="1" d={d} />
    </svg>
  );
}

function QuickNoteRow({ item, inputRef, onChange, onToggle, onKeyDown }) {
  const wrapRef = useRef(null);
  const measureRef = useRef(null);
  const showScribble = item.checked && Boolean(item.text);
  const layout = useWrappedLines(wrapRef, measureRef, item.text, showScribble);

  return (
    <li className="quick-note__row" data-checked={item.checked ? "true" : undefined}>
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={item.checked ? "Mark as not done" : "Mark as done"}
        className="quick-note__check"
        onClick={() => onToggle(item.id)}
      >
        {item.checked ? <Check size={14} /> : null}
      </button>
      <span ref={wrapRef} className="quick-note__text">
        <textarea
          ref={inputRef}
          className="quick-note__input"
          value={item.text}
          rows={1}
          spellCheck={false}
          aria-label="Task"
          onChange={(event) => onChange(item.id, event.target.value.replace(/\n/g, " "))}
          onKeyDown={(event) => onKeyDown(event, item)}
        />
        {showScribble ? (
          <>
            <span ref={measureRef} className="quick-note__input quick-note__measure" aria-hidden="true">{item.text}</span>
            <Scribble layout={layout} seed={item.id} />
          </>
        ) : null}
      </span>
    </li>
  );
}

export default function QuickNote() {
  const { folderPath } = useAppContext();
  const isTooNarrow = useMediaQuery("(max-width: 719px)");
  const [note, setNote] = useState(() => normalizeQuickNote(null));
  const [loadedFor, setLoadedFor] = useState(null);
  const [draft, setDraft] = useState("");
  const [focusRequest, setFocusRequest] = useState(null);
  // True while the panel shrinks back into the launcher; the note is marked
  // closed once that animation ends.
  const [closing, setClosing] = useState(false);
  const inputRefs = useRef(new Map());
  const draftRef = useRef(null);
  const saveTimeoutRef = useRef(0);
  const pendingSaveRef = useRef(null);
  const refCallbacks = useRef(new Map());
  const getInputRef = useCallback((id) => {
    let callback = refCallbacks.current.get(id);
    if (!callback) {
      callback = (node) => {
        if (node) inputRefs.current.set(id, node);
        else {
          inputRefs.current.delete(id);
          refCallbacks.current.delete(id);
        }
      };
      refCallbacks.current.set(id, callback);
    }
    return callback;
  }, []);

  // Load once per workspace folder; ui-state.json is per Dome.
  useEffect(() => {
    if (!folderPath) {
      return undefined;
    }

    let cancelled = false;
    void Promise.resolve(desktop.workspace.loadUiState(folderPath))
      .catch(() => null)
      .then((uiState) => {
        if (cancelled) return;
        setNote(normalizeQuickNote(uiState?.quickNote));
        setLoadedFor(folderPath);
      });

    return () => {
      cancelled = true;
    };
  }, [folderPath]);

  const flushSave = useCallback(() => {
    window.clearTimeout(saveTimeoutRef.current);
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) {
      void Promise.resolve(desktop.workspace.saveUiState(pending.folderPath, { quickNote: pending.note }))
        .catch(() => {});
    }
  }, []);

  // Saved straight through the bridge rather than saveHomeUiState, so an
  // autosave doesn't replace homeData.uiState and re-run Home's effects.
  const commit = useCallback((updater) => {
    setNote((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next === current) return current;
      if (folderPath && loadedFor === folderPath) {
        pendingSaveRef.current = { folderPath, note: next };
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(flushSave, QUICK_NOTE_SAVE_DEBOUNCE_MS);
      }
      return next;
    });
  }, [flushSave, folderPath, loadedFor]);

  useEffect(() => {
    window.addEventListener("beforeunload", flushSave);
    return () => {
      window.removeEventListener("beforeunload", flushSave);
      flushSave();
    };
  }, [flushSave]);

  useLayoutEffect(() => {
    if (!focusRequest) return;
    const target = focusRequest.id === "draft" ? draftRef.current : inputRefs.current.get(focusRequest.id);
    if (target) {
      target.focus();
      const caret = focusRequest.caret === "start" ? 0 : target.value.length;
      target.setSelectionRange?.(caret, caret);
    }
    setFocusRequest(null);
  }, [focusRequest]);

  const setOpen = useCallback((open) => commit((current) => (
    current.open === open ? current : { ...current, open }
  )), [commit]);

  const updateText = useCallback((id, text) => commit((current) => ({
    ...current,
    items: current.items.map((item) => (item.id === id ? { ...item, text } : item)),
  })), [commit]);

  const toggleItem = useCallback((id) => commit((current) => ({
    ...current,
    items: current.items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
  })), [commit]);

  const handleRowKeyDown = useCallback((event, item) => {
    const index = note.items.findIndex((entry) => entry.id === item.id);

    if (event.key === "Enter") {
      event.preventDefault();
      if (note.items.length >= QUICK_NOTE_MAX_ITEMS) return;
      const nextItem = makeQuickNoteItem();
      commit((current) => {
        const items = [...current.items];
        items.splice(index + 1, 0, nextItem);
        return { ...current, items };
      });
      setFocusRequest({ id: nextItem.id });
      return;
    }

    if (event.key === "Backspace" && item.text === "") {
      event.preventDefault();
      commit((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }));
      const previous = note.items[index - 1];
      setFocusRequest({ id: previous ? previous.id : "draft" });
      return;
    }

    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      setFocusRequest({ id: note.items[index - 1].id });
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusRequest({ id: note.items[index + 1]?.id ?? "draft" });
      return;
    }

    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  }, [commit, note.items]);

  const handleDraftKeyDown = useCallback((event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const text = draft.trim();
      if (!text || note.items.length >= QUICK_NOTE_MAX_ITEMS) return;
      commit((current) => ({ ...current, items: [...current.items, makeQuickNoteItem({ text })] }));
      setDraft("");
      return;
    }

    if (event.key === "ArrowUp" && note.items.length > 0) {
      event.preventDefault();
      setFocusRequest({ id: note.items[note.items.length - 1].id });
      return;
    }

    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  }, [commit, draft, note.items]);

  if (!folderPath || loadedFor !== folderPath) {
    return null;
  }

  const isOpen = note.open && !isTooNarrow;
  const collapse = () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) setOpen(false);
    else setClosing(true);
  };
  const openCount = note.items.filter((item) => !item.checked && item.text.trim()).length;
  const eventGuards = {
    onPointerDown: stop,
    onMouseDown: stop,
    onWheel: stop,
    onKeyDown: stop,
    onKeyUp: stop,
    onPaste: stop,
    onCopy: stop,
    onCut: stop,
    onContextMenu: stop,
    onDoubleClick: stop,
  };

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          className="quick-note-launcher"
          aria-label={openCount ? `Open quick note, ${openCount} to do` : "Open quick note"}
          title="Quick note"
          onClick={() => setOpen(true)}
          {...eventGuards}
        >
          <EdgeConnector className="quick-note__fillet quick-note__fillet--above-tab" />
          <EdgeConnector className="quick-note__fillet quick-note__fillet--beside-tab" />
          <ListChecks size={20} />
          {openCount ? <span className="quick-note-launcher__count">{openCount}</span> : null}
        </button>
      ) : null}

      {isOpen ? (
        <section
          className={`quick-note${closing ? " quick-note--closing" : ""}`}
          aria-label="Quick note"
          onAnimationEnd={(event) => {
            if (closing && event.target === event.currentTarget) {
              setClosing(false);
              setOpen(false);
            }
          }}
          {...eventGuards}
        >
          <div className="quick-note__tab">
            <EdgeConnector className="quick-note__fillet quick-note__fillet--above-tab" />
            <EdgeConnector className="quick-note__fillet quick-note__fillet--beside-tab" />
            <button
              type="button"
              className="quick-note__close"
              aria-label="Collapse quick note"
              title="Collapse"
              onClick={collapse}
            >
              <X size={12} />
            </button>
          </div>
          <EdgeConnector className="quick-note__fillet quick-note__fillet--beside-frame" />
          <div className="quick-note__frame">
            <div className="quick-note__sheet">
              <ul className="quick-note__list">
                {note.items.map((item) => (
                  <QuickNoteRow
                    key={item.id}
                    item={item}
                    inputRef={getInputRef(item.id)}
                    onChange={updateText}
                    onToggle={toggleItem}
                    onKeyDown={handleRowKeyDown}
                  />
                ))}
                <li className="quick-note__row quick-note__row--draft">
                  <span className="quick-note__check quick-note__check--ghost" aria-hidden="true" />
                  <input
                    ref={draftRef}
                    className="quick-note__input quick-note__input--draft"
                    value={draft}
                    placeholder="Add a task"
                    spellCheck={false}
                    aria-label="Add a task"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleDraftKeyDown}
                  />
                </li>
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
