import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

const LINE_HEIGHT = 21;
const TEXT_PAD_Y = 10;

function Scribble({ top }) {
  return (
    <svg className="quick-note__scribble" style={{ top }} viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">
      <path
        pathLength="1"
        d="M1 10 C 14 2, 26 1, 22 9 S 10 17, 30 12 S 52 1, 48 9 S 36 17, 58 12 S 80 1, 76 9 S 64 17, 86 11 S 96 8, 99 9"
      />
    </svg>
  );
}

// How many lines a wrapped task takes, so the done-scribble crosses out
// every line.
function useLineCount(ref, enabled) {
  const [lines, setLines] = useState(1);
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return undefined;
    const measure = () => {
      const height = node.getBoundingClientRect().height - TEXT_PAD_Y * 2;
      setLines(Math.max(1, Math.round(height / LINE_HEIGHT)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, ref]);
  return lines;
}

function QuickNoteRow({ item, inputRef, onChange, onToggle, onKeyDown }) {
  const textRef = useRef(null);
  const showScribble = item.checked && Boolean(item.text);
  const lines = useLineCount(textRef, showScribble);
  const setRefs = useCallback((node) => {
    textRef.current = node;
    inputRef(node);
  }, [inputRef]);

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
      <span className="quick-note__text">
        <textarea
          ref={setRefs}
          className="quick-note__input"
          value={item.text}
          rows={1}
          spellCheck={false}
          aria-label="Task"
          onChange={(event) => onChange(item.id, event.target.value.replace(/\n/g, " "))}
          onKeyDown={(event) => onKeyDown(event, item)}
        />
        {showScribble
          ? Array.from({ length: lines }, (_, index) => (
            <Scribble key={index} top={TEXT_PAD_Y + index * LINE_HEIGHT} />
          ))
          : null}
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
          <ListChecks size={20} />
          {openCount ? <span className="quick-note-launcher__count">{openCount}</span> : null}
        </button>
      ) : null}

      {isOpen ? (
        <section className="quick-note" aria-label="Quick note" {...eventGuards}>
          <div className="quick-note__tab">
            <EdgeConnector className="quick-note__fillet quick-note__fillet--above-tab" />
            <EdgeConnector className="quick-note__fillet quick-note__fillet--beside-tab" />
            <button
              type="button"
              className="quick-note__close"
              aria-label="Collapse quick note"
              title="Collapse"
              onClick={() => setOpen(false)}
            >
              <X size={14} />
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
