import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { detectCodeLanguage } from "../../tiles/code/detectLanguage";
import {
  CODE_AUTO_HEIGHT,
  CODE_DEFAULT_TITLE,
  CODE_FONT_SIZES,
  CODE_LANGUAGE_AUTO,
  CODE_LANGUAGES,
  CODE_USER_HEIGHT,
  codeTileHeight,
  normalizeCodeFontSize,
  normalizeCodeHeight,
  normalizeCodeLanguage,
  stepCodeFontSize,
} from "../../tiles/code/model";
import { tokenizeCode } from "../../tiles/code/staticHighlight";
import TileShell from "./TileShell";
import "./CodeTile.css";

// The code tile: a black header (editable title + lime FILE TYPE badge), a
// blue frame and a grey paper holding the code. The language is detected
// from the code unless one is picked from the badge. The paper grows with
// the code (CODE_AUTO_HEIGHT) until the lime bar on the bottom edge sets a
// height; the card's height follows the paper.
//
// At rest the paper shows a static highlighted copy of the code; pressing it
// mounts CodeMirror (lazy) in the same spot with the caret where the press
// was. Compact / rack renders only ever show the static copy (30 lines).

const CodeEditor = lazy(() => import("../../tiles/code/CodeEditor"));

const PAD_TOP = 44;
const PAD_BOTTOM = 20;
const LINE_HEIGHT = 1.6;
const STATIC_LINE_LIMIT = 30;
const DETECT_DELAY_MS = 250;
const COPY_FLASH_MS = 900;
const GRIP_STEP = 20;
const LANGUAGE_KEYS = Object.keys(CODE_LANGUAGES);

const stopEvent = (event) => event.stopPropagation();
// Keeps focus where it is (the editor) when a tool is pressed.
const keepFocus = (event) => event.preventDefault();

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(input);
  }
}

function countLines(code) {
  let lines = 1;
  for (let i = 0; i < code.length; i += 1) {
    if (code.charCodeAt(i) === 10) lines += 1;
  }
  return lines;
}

function firstLines(code, limit) {
  let index = -1;
  for (let line = 0; line < limit; line += 1) {
    index = code.indexOf("\n", index + 1);
    if (index === -1) return code;
  }
  return code.slice(0, index);
}

function StaticCode({ code, lang }) {
  const tokens = useMemo(() => tokenizeCode(code, lang), [code, lang]);
  return (
    <pre className="ct-pre" aria-hidden="true">
      {tokens.map((token, index) => (token.kind
        ? <span key={index} className={`ct-tk-${token.kind}`}>{token.text}</span>
        : token.text))}
      {"\n"}
    </pre>
  );
}

function LanguageMenu({ language, detected, onPick, onClose }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !event.target.closest?.(".ct-type")) onClose();
    };
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [onClose]);

  // The canvas pans on every wheel; the list scrolls instead.
  useEffect(() => {
    const element = rootRef.current;
    element?.addEventListener("wheel", stopEvent, { passive: true });
    return () => element?.removeEventListener("wheel", stopEvent);
  }, []);

  return (
    <div
      ref={rootRef}
      className="ct-menu"
      role="listbox"
      aria-label="Choose file type"
      onPointerDown={stopEvent}
      onMouseDown={keepFocus}
      onDoubleClick={stopEvent}
    >
      <button
        type="button"
        role="option"
        aria-selected={language === CODE_LANGUAGE_AUTO}
        className={language === CODE_LANGUAGE_AUTO ? "on" : ""}
        onClick={() => onPick(CODE_LANGUAGE_AUTO)}
      >
        Auto<small>{detected ? CODE_LANGUAGES[detected] : "—"}</small>
      </button>
      {LANGUAGE_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="option"
          aria-selected={language === key}
          className={language === key ? "on" : ""}
          onClick={() => onPick(key)}
        >
          {CODE_LANGUAGES[key]}
          {key === detected ? <small>detected</small> : null}
        </button>
      ))}
    </div>
  );
}

function CodeTile({
  card,
  tileMeta,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  renderHint,
}) {
  const { setCanvasInteractionState, updateExistingCard } = useTileAppContext();
  const code = typeof card.code === "string" ? card.code : "";
  const language = normalizeCodeLanguage(card.language);
  const fontSize = normalizeCodeFontSize(card.codeFontSize);
  const userHeight = normalizeCodeHeight(card.codeHeight);
  const isStatic = renderHint?.isStaticPreview === true
    || renderHint?.simplify === true
    || renderHint?.renderState === "compact";

  const [detected, setDetected] = useState(() => detectCodeLanguage(code));
  const [editAt, setEditAt] = useState(null);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isCopied, setCopied] = useState(false);
  const [dragHeight, setDragHeight] = useState(null);
  const rootRef = useRef(null);
  const paperRef = useRef(null);
  const badgeRef = useRef(null);
  const scrollRef = useRef(null);
  const pasteRef = useRef(false);
  const detectedRef = useRef(detected);
  const languageRef = useRef(language);

  const gesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });

  const currentLang = language === CODE_LANGUAGE_AUTO ? detected : language;
  const isEditing = editAt !== null && !isStatic;

  // --- language detection: right away after a paste, else 250 ms after typing
  useEffect(() => {
    const run = () => setDetected(detectCodeLanguage(code));
    if (pasteRef.current) {
      pasteRef.current = false;
      run();
      return undefined;
    }
    const timer = window.setTimeout(run, DETECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [code]);

  // The badge pops when what it shows changes.
  const popBadge = useCallback(() => {
    const badge = badgeRef.current;
    if (!badge || isStatic) return;
    badge.classList.remove("ct-type--pop");
    void badge.offsetWidth;
    badge.classList.add("ct-type--pop");
  }, [isStatic]);

  useEffect(() => {
    const changed = detectedRef.current !== detected;
    detectedRef.current = detected;
    if (changed && languageRef.current === CODE_LANGUAGE_AUTO) popBadge();
  }, [detected, popBadge]);

  useEffect(() => {
    if (languageRef.current !== language) {
      languageRef.current = language;
      popBadge();
    }
  }, [language, popBadge]);

  // --- height: auto (grows with the code) or the user's, card follows
  const lineCount = useMemo(() => countLines(code), [code]);
  const autoHeight = Math.max(
    CODE_AUTO_HEIGHT.min,
    Math.min(CODE_AUTO_HEIGHT.max, Math.ceil(PAD_TOP + PAD_BOTTOM + lineCount * fontSize * LINE_HEIGHT)),
  );
  const paperHeight = dragHeight ?? userHeight ?? autoHeight;
  const tileHeight = codeTileHeight(paperHeight);

  useEffect(() => {
    if (isStatic || dragHeight !== null) return;
    if (Math.abs((card.height ?? 0) - tileHeight) >= 1) {
      updateExistingCard(card.id, { height: tileHeight });
    }
  }, [card.height, card.id, dragHeight, isStatic, tileHeight, updateExistingCard]);

  // --- editing
  useEffect(() => {
    if (!isEditing) return undefined;
    setCanvasInteractionState?.(true);
    return () => setCanvasInteractionState?.(false);
  }, [isEditing, setCanvasInteractionState]);

  useEffect(() => {
    if (isStatic) {
      setEditAt(null);
      setMenuOpen(false);
    }
  }, [isStatic]);

  const handlePaperPointerDown = (event) => {
    event.stopPropagation();
    if (isStatic || isEditing || event.button !== 0) return;
    const scroller = scrollRef.current;
    setEditAt({
      x: event.clientX,
      y: event.clientY,
      scrollTop: scroller?.scrollTop ?? 0,
      scrollLeft: scroller?.scrollLeft ?? 0,
    });
  };

  const handleCodeChange = useCallback((nextCode, { paste }) => {
    if (paste) pasteRef.current = true;
    updateExistingCard(card.id, { code: nextCode });
  }, [card.id, updateExistingCard]);

  const handleEditorFocus = useCallback((focused) => {
    if (!focused) {
      // Let a press on a tool land first; it keeps focus anyway.
      window.setTimeout(() => {
        if (!paperRef.current?.contains(document.activeElement)) setEditAt(null);
      }, 0);
    }
  }, []);

  const handleEditorExit = useCallback(() => setEditAt(null), []);

  // The paper scrolls its code instead of panning the canvas, when it can.
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || isStatic) return undefined;
    const handleWheel = (event) => {
      if (event.ctrlKey || event.metaKey) return;
      const scroller = paper.querySelector(".cm-scroller") ?? scrollRef.current;
      if (!scroller) return;
      const canScrollY = scroller.scrollHeight > scroller.clientHeight + 1;
      const canScrollX = scroller.scrollWidth > scroller.clientWidth + 1;
      if ((canScrollY && event.deltaY !== 0) || (canScrollX && event.deltaX !== 0) || (canScrollX && event.shiftKey)) {
        event.stopPropagation();
      }
    };
    paper.addEventListener("wheel", handleWheel, { passive: true });
    return () => paper.removeEventListener("wheel", handleWheel);
  }, [isStatic]);

  // --- tools
  const handleCopy = async () => {
    try {
      await copyText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FLASH_MS);
    } catch {
      // Clipboard blocked: nothing to flash.
    }
  };

  const setFontSize = (direction) => {
    updateExistingCard(card.id, { codeFontSize: stepCodeFontSize(fontSize, direction) });
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const pickLanguage = (key) => {
    setMenuOpen(false);
    updateExistingCard(card.id, { language: key });
  };

  // --- height bar: drag (screen px / zoom), double-click or Enter = auto
  const setUserHeight = (height) => {
    const next = height === null ? null : normalizeCodeHeight(height);
    const paper = next ?? autoHeight;
    updateExistingCard(card.id, { codeHeight: next, height: codeTileHeight(paper) });
  };

  const handleGripPointerDown = (event) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.preventDefault();
    const root = rootRef.current;
    const scale = root && root.offsetHeight > 0 ? root.getBoundingClientRect().height / root.offsetHeight : 1;
    const startY = event.clientY;
    const startHeight = paperHeight;
    let latest = startHeight;
    const grip = event.currentTarget;
    grip.setPointerCapture?.(event.pointerId);
    setDragHeight(startHeight);

    const handleMove = (moveEvent) => {
      latest = Math.round(Math.max(
        CODE_USER_HEIGHT.min,
        Math.min(CODE_USER_HEIGHT.max, startHeight + (moveEvent.clientY - startY) / (scale || 1)),
      ));
      setDragHeight(latest);
    };
    const finish = () => {
      grip.removeEventListener("pointermove", handleMove);
      grip.removeEventListener("pointerup", finish);
      grip.removeEventListener("pointercancel", finish);
      setDragHeight(null);
      if (latest !== startHeight) setUserHeight(latest);
    };
    grip.addEventListener("pointermove", handleMove);
    grip.addEventListener("pointerup", finish);
    grip.addEventListener("pointercancel", finish);
  };

  const handleGripKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setUserHeight(paperHeight + (event.key === "ArrowDown" ? GRIP_STEP : -GRIP_STEP));
    } else if (event.key === "Enter") {
      event.preventDefault();
      setUserHeight(null);
    }
  };

  // --- render
  const staticCode = isStatic ? firstLines(code, STATIC_LINE_LIMIT) : code;
  const badgeLabel = currentLang ? CODE_LANGUAGES[currentLang] : "File type";
  const isManual = language !== CODE_LANGUAGE_AUTO;

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className="card--code"
      renderHint={renderHint}
      tileState={isEditing ? "editing" : ""}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <article
        ref={rootRef}
        className={[
          "ct-tile",
          isStatic ? "ct-tile--static" : "",
          isEditing ? "ct-tile--editing" : "",
          dragHeight !== null ? "ct-tile--resizing" : "",
        ].filter(Boolean).join(" ")}
        aria-label={card.title || "Code"}
        style={{ "--ct-paper-h": `${paperHeight}px`, "--ct-fs": `${fontSize}px`, height: `${tileHeight}px` }}
        {...gesture}
      >
        <svg className="ct-tabs" viewBox="0 0 236 20" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 20V24C0 20.6 2.7 17.9 6 17.9H15.6C18.9 17.9 21.6 15.2 21.6 11.9V6C21.6 2.7 24.3 0 27.6 0H29.9C33.2 0 35.9 2.7 35.9 6V11.9C35.9 15.2 38.6 17.9 41.9 17.9H42.4C45.7 17.9 48.4 15.2 48.4 11.9V6C48.4 2.7 51.1 0 54.4 0H152.9C156.2 0 158.9 2.7 158.9 6V11.9C158.9 15.2 161.6 17.9 164.9 17.9L176.5 17.9C178.3 17.9 180 17.1 181.2 15.7L192.3 2.2C193.4 .8 195.1 0 196.9 0H221.5C224.2 0 226.5 1.8 227.2 4.4L229.7 13.5C230.4 16.1 232.8 17.9 235.5 17.9V20Z" />
        </svg>
        <div className="ct-body" />
        <div className="ct-head">
          {isStatic ? (
            <span className="ct-title">{card.title || CODE_DEFAULT_TITLE}</span>
          ) : (
            <input
              className="ct-title"
              type="text"
              spellCheck={false}
              placeholder={CODE_DEFAULT_TITLE}
              aria-label="Title"
              value={card.title ?? ""}
              onPointerDown={stopEvent}
              onDoubleClick={stopEvent}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
              }}
              onFocus={() => setCanvasInteractionState?.(true)}
              onBlur={() => setCanvasInteractionState?.(false)}
              onChange={(event) => updateExistingCard(card.id, { title: event.target.value })}
            />
          )}
          <button
            ref={badgeRef}
            type="button"
            className="ct-type"
            aria-haspopup="listbox"
            aria-expanded={isMenuOpen}
            aria-label={`File type: ${badgeLabel}`}
            title={isManual ? "Set manually — click to change" : "Detected automatically — click to choose"}
            tabIndex={isStatic ? -1 : 0}
            onPointerDown={stopEvent}
            onMouseDown={keepFocus}
            onDoubleClick={stopEvent}
            onKeyDown={stopEvent}
            onAnimationEnd={(event) => event.currentTarget.classList.remove("ct-type--pop")}
            onClick={(event) => {
              event.stopPropagation();
              if (!isStatic) setMenuOpen((open) => !open);
            }}
          >
            {badgeLabel}
            {isManual ? <span className="ct-type__manual">●</span> : null}
          </button>
        </div>

        {isMenuOpen && !isStatic ? (
          <LanguageMenu language={language} detected={detected} onPick={pickLanguage} onClose={closeMenu} />
        ) : null}

        <div
          ref={paperRef}
          className="ct-paper"
          onPointerDown={handlePaperPointerDown}
          onDoubleClick={stopEvent}
          onKeyDown={stopEvent}
          onContextMenu={isEditing ? stopEvent : undefined}
        >
          {isEditing ? (
            <Suspense fallback={<div className="ct-scroll"><StaticCode code={code} lang={currentLang} /></div>}>
              <CodeEditor
                value={code}
                language={currentLang ?? "text"}
                placeholder="Paste or type code…"
                focusAt={editAt}
                onChange={handleCodeChange}
                onFocusChange={handleEditorFocus}
                onExit={handleEditorExit}
              />
            </Suspense>
          ) : (
            <div ref={scrollRef} className="ct-scroll">
              {code ? (
                <StaticCode code={staticCode} lang={currentLang} />
              ) : (
                <pre className="ct-pre ct-pre--empty" aria-hidden="true">Paste or type code…</pre>
              )}
            </div>
          )}

          {isStatic ? null : (
            <div className="ct-tools" onPointerDown={stopEvent} onMouseDown={keepFocus} onDoubleClick={stopEvent}>
              <button
                type="button"
                className={`ct-btn${isCopied ? " ct-btn--ok" : ""}`}
                aria-label="Copy code"
                title="Copy code"
                onClick={() => { void handleCopy(); }}
              >
                <svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M4 1h8v8h-2V3H4z" /><path d="M1 4h8v9H1z" /></svg>
              </button>
              <button
                type="button"
                className="ct-btn"
                aria-label="Smaller text"
                title="Smaller"
                disabled={fontSize <= CODE_FONT_SIZES[0]}
                onClick={() => setFontSize(-1)}
              >
                −
              </button>
              <button
                type="button"
                className="ct-btn"
                aria-label="Bigger text"
                title="Bigger"
                disabled={fontSize >= CODE_FONT_SIZES[CODE_FONT_SIZES.length - 1]}
                onClick={() => setFontSize(1)}
              >
                +
              </button>
            </div>
          )}
        </div>

        {isStatic ? null : (
          <button
            type="button"
            className="ct-grip"
            aria-label="Drag to resize height. Double-click to fit content."
            title={userHeight === null ? "Drag to set height" : "Drag to resize · double-click to fit"}
            onPointerDown={handleGripPointerDown}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setUserHeight(null);
            }}
            onKeyDown={handleGripKeyDown}
          />
        )}
      </article>
    </TileShell>
  );
}

export default memo(CodeTile);
