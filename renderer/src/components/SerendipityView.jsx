import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import { useToast } from "../hooks/useToast";
import { desktop } from "../lib/desktop";
import { formatRelativeTime } from "../lib/home";
import {
  collectSerendipityEntries,
  getSerendipityKind,
  getStickyHex,
  pickSerendipityDeck,
  readShownAt,
  rememberShown,
  removeSerendipityCard,
  restoreSerendipityCard,
} from "../lib/serendipity";
import { formatCardSubtitle, getDomainLabel } from "../lib/workspace";
import { useTilePreviewSource } from "../systems/canvas/useTilePreviewSource";
import { Canvas, Check, RefreshCw, Sparkles, X } from "./ui/icons";
import "./SerendipityView.css";

// How long a card takes to drift away before the next one settles in.
const EXIT_MS = 560;
// How far (px) a card has to be dragged before letting go of it counts.
const SWIPE_THRESHOLD = 110;
const UNDO_VISIBLE_MS = 6000;
const CODE_PREVIEW_LINES = 14;
const CHECKLIST_PREVIEW_ITEMS = 7;

function useCardImage(card, folderPath) {
  const { src } = useTilePreviewSource({
    card,
    folderPath,
    previewTier: "original",
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  });
  return src || "";
}

function getEntryTitle(card) {
  const kind = getSerendipityKind(card);
  if (kind === "file") return card.file?.fileName || card.title || "File";
  if (kind === "link" || kind === "image") return card.title || getDomainLabel(card.url) || "";
  return card.title || "";
}

function SerendipityImageFace({ card, imageSrc }) {
  return (
    <div className="ap-seren-face ap-seren-face--image">
      {imageSrc ? (
        <img src={imageSrc} alt={card.title || "Saved image"} draggable={false} />
      ) : (
        <div className="ap-seren-face__missing">Image unavailable</div>
      )}
    </div>
  );
}

function SerendipityLinkFace({ card, imageSrc }) {
  const domain = card.siteName || getDomainLabel(card.url);
  return (
    <div className={`ap-seren-face ap-seren-face--link${imageSrc ? "" : " is-text-only"}`}>
      {imageSrc ? (
        <div className="ap-seren-face__media">
          <img src={imageSrc} alt="" draggable={false} />
        </div>
      ) : null}
      <div className="ap-seren-face__body">
        <div className="ap-seren-face__domain">
          {card.favicon ? <img src={card.favicon} alt="" draggable={false} /> : null}
          <span>{domain}</span>
        </div>
        <h2 className="ap-seren-face__title">{card.title || card.url}</h2>
        {card.description ? <p className="ap-seren-face__description">{card.description}</p> : null}
      </div>
    </div>
  );
}

function SerendipityNoteFace({ card }) {
  return (
    <div className="ap-seren-face ap-seren-face--note">
      {card.title ? <h2 className="ap-seren-face__title">{card.title}</h2> : null}
      {card.subtitle ? <p className="ap-seren-face__subtitle">{card.subtitle}</p> : null}
      {card.text ? <p className="ap-seren-face__text">{card.text}</p> : null}
    </div>
  );
}

function SerendipityStickyFace({ card }) {
  return (
    <div className="ap-seren-face ap-seren-face--sticky" style={{ "--ap-seren-sticky": getStickyHex(card) }}>
      {card.title ? <h2 className="ap-seren-face__title">{card.title}</h2> : null}
      <p className="ap-seren-face__text">{card.text}</p>
    </div>
  );
}

function SerendipityCodeFace({ card }) {
  const lines = String(card.code ?? "").split(/\r?\n/);
  return (
    <div className="ap-seren-face ap-seren-face--code">
      <div className="ap-seren-face__code-bar">
        <span>{card.title || "Snippet"}</span>
        <span>{card.language}</span>
      </div>
      <pre>{lines.slice(0, CODE_PREVIEW_LINES).join("\n")}{lines.length > CODE_PREVIEW_LINES ? "\n…" : ""}</pre>
    </div>
  );
}

function SerendipityChecklistFace({ card }) {
  const items = card.items.filter((item) => item.text.trim());
  return (
    <div className="ap-seren-face ap-seren-face--checklist">
      {card.title ? <h2 className="ap-seren-face__title">{card.title}</h2> : null}
      <ul>
        {items.slice(0, CHECKLIST_PREVIEW_ITEMS).map((item) => (
          <li key={item.id} className={item.checked ? "is-checked" : ""}>
            <span className="ap-seren-face__check" aria-hidden="true">{item.checked ? <Check size={12} /> : null}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      {items.length > CHECKLIST_PREVIEW_ITEMS ? (
        <p className="ap-seren-face__more">+{items.length - CHECKLIST_PREVIEW_ITEMS} more</p>
      ) : null}
    </div>
  );
}

function SerendipityFileFace({ card }) {
  return (
    <div className="ap-seren-face ap-seren-face--file">
      <div className="ap-seren-face__file-badge">{card.file?.extension ? `.${card.file.extension}` : "file"}</div>
      <h2 className="ap-seren-face__title">{card.file?.fileName || card.title}</h2>
      <p className="ap-seren-face__subtitle">{formatCardSubtitle(card)}</p>
    </div>
  );
}

function SerendipityFace({ card, imageSrc }) {
  switch (getSerendipityKind(card)) {
    case "image": return <SerendipityImageFace card={card} imageSrc={imageSrc} />;
    case "link": return <SerendipityLinkFace card={card} imageSrc={imageSrc} />;
    case "sticky": return <SerendipityStickyFace card={card} />;
    case "code": return <SerendipityCodeFace card={card} />;
    case "checklist": return <SerendipityChecklistFace card={card} />;
    case "file": return <SerendipityFileFace card={card} />;
    default: return <SerendipityNoteFace card={card} />;
  }
}

// One card on the table. The top card follows the pointer while dragged
// and reports a swipe; cards underneath are drawn as the deck.
function SerendipityCard({ entry, folderPath, role, fresh = false, exit = null, exitFromX = 0, onImage, onSwipe }) {
  const imageSrc = useCardImage(entry.card, folderPath);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const kind = getSerendipityKind(entry.card);

  useEffect(() => {
    if (role === "top") onImage?.(imageSrc);
  }, [imageSrc, onImage, role]);

  function handlePointerDown(event) {
    if (role !== "top" || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY };
    setDrag({ dx: 0, dy: 0 });
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;
    setDrag({
      dx: event.clientX - dragRef.current.startX,
      dy: (event.clientY - dragRef.current.startY) * 0.35,
    });
  }

  function handlePointerEnd() {
    if (!dragRef.current) return;
    const dx = drag?.dx ?? 0;
    dragRef.current = null;
    setDrag(null);
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      onSwipe?.(dx > 0 ? "keep" : "letgo", dx);
    }
  }

  const dragStyle = drag
    ? {
      transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 18}deg)`,
      transition: "none",
    }
    : exit && exitFromX
      // A swiped card flies on from where it was let go, not from center.
      ? { "--ap-seren-from-x": `${exitFromX}px`, "--ap-seren-from-rot": `${exitFromX / 18}deg` }
      : null;
  const intent = drag && Math.abs(drag.dx) > 24 ? (drag.dx > 0 ? "keep" : "letgo") : null;

  return (
    <div
      className={[
        "ap-seren-card",
        `ap-seren-card--${role}`,
        `ap-seren-card--${kind}`,
        fresh ? "is-fresh" : "",
        exit ? `is-leaving is-leaving--${exit}` : "",
        intent ? `is-leaning--${intent}` : "",
      ].filter(Boolean).join(" ")}
      style={dragStyle ?? undefined}
      aria-hidden={role !== "top"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div className="ap-seren-card__float">
        <SerendipityFace card={entry.card} imageSrc={imageSrc} />
      </div>
      {role === "top" ? (
        <>
          <span className="ap-seren-card__stamp ap-seren-card__stamp--keep" aria-hidden="true">Keep</span>
          <span className="ap-seren-card__stamp ap-seren-card__stamp--letgo" aria-hidden="true">Let go</span>
        </>
      ) : null}
    </div>
  );
}

export default function SerendipityView({ canvasItems, onClose }) {
  const { folderPath, openHomeItem, rewriteCanvasFile, flushAllPendingCanvasSaves } = useAppContext();
  const { toast } = useToast();
  const [status, setStatus] = useState("loading");
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(null);
  const [undo, setUndo] = useState(null);
  const [ambientImage, setAmbientImage] = useState("");
  const [shuffleId, setShuffleId] = useState(0);
  const leavingTimeoutRef = useRef(0);
  const undoTimeoutRef = useRef(0);
  const rootRef = useRef(null);

  const canvasPaths = useMemo(
    () => canvasItems.map((item) => item.filePath).filter(Boolean),
    [canvasItems],
  );

  useEffect(() => {
    let cancelled = false;

    async function shuffle() {
      setStatus("loading");
      setIndex(0);
      setLeaving(null);
      try {
        await flushAllPendingCanvasSaves?.().catch(() => {});
        const docs = await Promise.all(canvasPaths.map((filePath) => (
          desktop.workspace.loadCanvas(filePath, { recordRecent: false }).catch(() => null)
        )));
        if (cancelled) return;
        const nextDeck = pickSerendipityDeck(collectSerendipityEntries(docs.filter(Boolean)), {
          shownAt: readShownAt(),
        });
        setDeck(nextDeck);
        setStatus(nextDeck.length ? "ready" : "empty");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void shuffle();
    return () => {
      cancelled = true;
    };
  }, [canvasPaths, flushAllPendingCanvasSaves, shuffleId]);

  useEffect(() => () => {
    window.clearTimeout(leavingTimeoutRef.current);
    window.clearTimeout(undoTimeoutRef.current);
  }, []);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const current = status === "ready" ? deck[index] ?? null : null;
  const upcoming = status === "ready" ? deck.slice(index + 1, index + 3) : [];
  const isDone = status === "ready" && !current;

  useEffect(() => {
    if (current) rememberShown(current.key);
    else setAmbientImage("");
  }, [current]);

  const advance = useCallback((direction, entry, fromX = 0) => {
    window.clearTimeout(leavingTimeoutRef.current);
    setLeaving({ entry, direction, fromX });
    setIndex((value) => value + 1);
    leavingTimeoutRef.current = window.setTimeout(() => setLeaving(null), EXIT_MS);
  }, []);

  const keep = useCallback((fromX = 0) => {
    if (!current) return;
    advance("keep", current, fromX);
  }, [advance, current]);

  const letGo = useCallback(async (fromX = 0) => {
    if (!current) return;
    const entry = current;
    advance("letgo", entry, fromX);
    try {
      const result = await rewriteCanvasFile(entry.canvasFilePath, (workspace) => (
        removeSerendipityCard(workspace, entry.pageId, entry.card.id)
      ));
      if (!result) return;
      window.clearTimeout(undoTimeoutRef.current);
      setUndo({ entry, removed: result.removed });
      undoTimeoutRef.current = window.setTimeout(() => setUndo(null), UNDO_VISIBLE_MS);
    } catch (error) {
      toast("error", error?.message || "Couldn't let go of that card.");
    }
  }, [advance, current, rewriteCanvasFile, toast]);

  const undoLetGo = useCallback(async () => {
    if (!undo) return;
    const { entry, removed } = undo;
    window.clearTimeout(undoTimeoutRef.current);
    setUndo(null);
    try {
      await rewriteCanvasFile(entry.canvasFilePath, (workspace) => {
        const restored = restoreSerendipityCard(workspace, removed);
        return restored ? { workspace: restored } : null;
      });
      // Bring it back to the top of the deck so it's clearly home again.
      setDeck((value) => {
        const next = value.filter((candidate) => candidate.key !== entry.key);
        next.splice(Math.min(index, next.length), 0, entry);
        return next;
      });
    } catch (error) {
      toast("error", error?.message || "Couldn't bring that card back.");
    }
  }, [index, rewriteCanvasFile, toast, undo]);

  const openInCanvas = useCallback(async () => {
    if (!current) return;
    const entry = current;
    onClose();
    await openHomeItem({ type: "canvas", filePath: entry.canvasFilePath });
  }, [current, onClose, openHomeItem]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!current) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      keep();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      void letGo();
    } else if (event.key === "Enter" && event.target === rootRef.current) {
      event.preventDefault();
      void openInCanvas();
    }
  }, [current, keep, letGo, onClose, openInCanvas]);

  const tint = current && getSerendipityKind(current.card) === "sticky" ? getStickyHex(current.card) : null;

  return (
    <div
      ref={rootRef}
      className="ap-seren"
      role="dialog"
      aria-modal="true"
      aria-label="Serendipity"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={tint ? { "--ap-seren-tint": tint } : undefined}
    >
      <div className="ap-seren__ambient" aria-hidden="true">
        <span className="ap-seren__blob ap-seren__blob--a" />
        <span className="ap-seren__blob ap-seren__blob--b" />
        <span className="ap-seren__blob ap-seren__blob--c" />
        {ambientImage ? (
          <img key={ambientImage} className="ap-seren__ambient-image" src={ambientImage} alt="" />
        ) : null}
      </div>

      <header className="ap-seren__top">
        <div className="ap-seren__brand">
          <Sparkles size={16} aria-hidden="true" />
          <span>Serendipity</span>
        </div>
        {status === "ready" && current ? (
          <span className="ap-seren__count">{index + 1} of {deck.length}</span>
        ) : null}
        <button type="button" className="ap-seren__btn ap-seren__btn--ghost" onClick={onClose} aria-label="Close Serendipity" title="Close (Esc)">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="ap-seren__stage">
        {status === "loading" ? (
          <div className="ap-seren__message">
            <span className="ap-seren__shuffle-dots" aria-hidden="true"><i /><i /><i /></span>
            <p>Shuffling through your saves…</p>
          </div>
        ) : null}

        {status === "empty" ? (
          <div className="ap-seren__message">
            <h2>Nothing to rediscover yet</h2>
            <p>Save links, images and notes to your canvases. They&rsquo;ll drift back here later.</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="ap-seren__message">
            <h2>Couldn&rsquo;t gather your saves</h2>
            <button type="button" className="ap-seren__btn ap-seren__btn--pill" onClick={() => setShuffleId((value) => value + 1)}>
              <RefreshCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : null}

        {isDone ? (
          <div className="ap-seren__message ap-seren__message--done">
            <h2>That&rsquo;s all for now</h2>
            <p>Come back another day. Something else will surface.</p>
            <div className="ap-seren__message-actions">
              <button type="button" className="ap-seren__btn ap-seren__btn--pill" onClick={() => setShuffleId((value) => value + 1)}>
                <RefreshCw size={14} aria-hidden="true" />
                Shuffle again
              </button>
              <button type="button" className="ap-seren__btn ap-seren__btn--pill ap-seren__btn--quiet" onClick={onClose}>
                Back to Home
              </button>
            </div>
          </div>
        ) : null}

        {status === "ready" ? (
          <div className="ap-seren__deck">
            {[...upcoming].reverse().map((entry) => (
              <SerendipityCard
                key={entry.key}
                entry={entry}
                folderPath={folderPath}
                role={entry === upcoming[0] ? "next" : "later"}
              />
            ))}
            {current ? (
              <SerendipityCard
                key={current.key}
                entry={current}
                folderPath={folderPath}
                role="top"
                fresh={index === 0}
                onImage={setAmbientImage}
                onSwipe={(direction, dx) => (direction === "keep" ? keep(dx) : void letGo(dx))}
              />
            ) : null}
            {leaving ? (
              <SerendipityCard
                key={`${leaving.entry.key}:leaving`}
                entry={leaving.entry}
                folderPath={folderPath}
                role="leaving"
                exit={leaving.direction}
                exitFromX={leaving.fromX}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {current ? (
        <footer className="ap-seren__bottom">
          <p className="ap-seren__meta" key={current.key}>
            {getEntryTitle(current.card) && getSerendipityKind(current.card) === "image" ? (
              <span className="ap-seren__meta-title">{getEntryTitle(current.card)}</span>
            ) : null}
            <span>
              From <strong>{current.canvasName}</strong>
              {current.pageName ? ` · ${current.pageName}` : ""}
              {current.savedAt ? ` · saved ${formatRelativeTime(current.savedAt)}` : ""}
            </span>
          </p>
          <div className="ap-seren__actions">
            <button type="button" className="ap-seren__btn ap-seren__btn--round ap-seren__btn--letgo" onClick={() => void letGo()} title="Let go (←)">
              <X size={20} aria-hidden="true" />
              <span>Let go</span>
            </button>
            <button type="button" className="ap-seren__btn ap-seren__btn--pill ap-seren__btn--quiet" onClick={() => void openInCanvas()} title="Open its canvas (Enter)">
              <Canvas size={14} aria-hidden="true" />
              Open canvas
            </button>
            <button type="button" className="ap-seren__btn ap-seren__btn--round ap-seren__btn--keep" onClick={() => keep()} title="Keep (→)">
              <Check size={20} aria-hidden="true" />
              <span>Keep</span>
            </button>
          </div>
          <p className="ap-seren__hint">Swipe or use ← → · Esc to leave</p>
        </footer>
      ) : null}

      {undo ? (
        <div className="ap-seren__undo" role="status">
          <span>Let go of {getEntryTitle(undo.entry.card) ? `“${getEntryTitle(undo.entry.card)}”` : "that card"}</span>
          <button type="button" className="ap-seren__btn ap-seren__btn--link" onClick={() => void undoLetGo()}>Undo</button>
        </div>
      ) : null}
    </div>
  );
}
