import { memo, useLayoutEffect, useRef } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { CHECKLIST_CARD_SIZE, makeChecklistItem } from "../../tiles/checklist/model";
import TileShell from "./TileShell";
import "./ChecklistTile.css";

const EMPTY_ITEMS = [];
const ADD_INPUT_FOCUS = "add-input";

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function splitPastedLines(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function focusAtEnd(field) {
  if (!field) {
    return;
  }

  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}

// Date, time and title are single-line: Enter commits instead of breaking.
function blurOnEnter(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

// Plain-text fields never hold line breaks; a multi-line paste is flattened.
function pasteAsSingleLine(event) {
  const pasted = event.clipboardData?.getData("text") ?? "";

  if (!/\r?\n/.test(pasted)) {
    return;
  }

  event.preventDefault();
  document.execCommand("insertText", false, splitPastedLines(pasted).join(" "));
}

function GripIcon() {
  return (
    <svg className="checklist-tile__grip" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.3" /><circle cx="7.5" cy="2" r="1.3" /><circle cx="13" cy="2" r="1.3" />
      <circle cx="2" cy="7.5" r="1.3" /><circle cx="7.5" cy="7.5" r="1.3" /><circle cx="13" cy="7.5" r="1.3" />
      <circle cx="2" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" /><circle cx="13" cy="13" r="1.3" />
    </svg>
  );
}

function ChecklistTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  renderHint,
}) {
  const { updateExistingCard } = useAppContext();
  const items = Array.isArray(card.items) ? card.items : EMPTY_ITEMS;
  const surfaceRef = useRef(null);
  const titleInputRef = useRef(null);
  const addInputRef = useRef(null);
  const itemRefs = useRef(new Map());
  const pendingFocusRef = useRef(null);
  // Only rows added after mount animate in -- not every row each time the
  // tile mounts (load, page switch, LOD swap).
  const mountedItemIdsRef = useRef(null);
  if (mountedItemIdsRef.current === null) {
    mountedItemIdsRef.current = new Set(items.map((item) => item.id));
  }
  // Keyboard and blur handlers can fire back-to-back before the card prop
  // re-renders, so edits compose on the latest list rather than a stale one.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const surfaceGesture = useTileGesture({
    card,
    onDoubleActivate: () => focusAtEnd(titleInputRef.current),
    onDragStart: onBeginDrag,
    onPressStart,
  });

  useLayoutEffect(() => {
    const pendingFocus = pendingFocusRef.current;

    if (!pendingFocus) {
      return;
    }

    pendingFocusRef.current = null;
    focusAtEnd(pendingFocus === ADD_INPUT_FOCUS ? addInputRef.current : itemRefs.current.get(pendingFocus));
  }, [items]);

  // The tile has no fixed height -- it grows with every task -- but
  // card.height is what selection, hit-testing and layout use, so write the
  // rendered height back. offsetHeight is layout size, unaffected by zoom.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const measuredHeight = Math.max(CHECKLIST_CARD_SIZE.height, Math.ceil(surface.offsetHeight));
    const currentHeight = Number.isFinite(card.height) ? card.height : CHECKLIST_CARD_SIZE.height;

    if (Math.abs(measuredHeight - currentHeight) > 1) {
      updateExistingCard(card.id, { height: measuredHeight });
    }
  });

  const updateCard = (updates) => updateExistingCard(card.id, updates);

  const updateItems = (nextItems) => {
    itemsRef.current = nextItems;
    updateCard({ items: nextItems });
  };

  const updateItem = (itemId, updates) => {
    updateItems(itemsRef.current.map((item) => (item.id === itemId ? { ...item, ...updates } : item)));
  };

  const removeItem = (itemId) => {
    updateItems(itemsRef.current.filter((item) => item.id !== itemId));
  };

  const appendItems = (texts) => {
    updateItems([...itemsRef.current, ...texts.map((text) => makeChecklistItem({ text }))]);
  };

  const handleItemKeyDown = (event, item) => {
    const currentItems = itemsRef.current;
    const index = currentItems.findIndex((entry) => entry.id === item.id);

    if (event.key === "Enter") {
      event.preventDefault();

      if (!event.currentTarget.value.trim()) {
        removeItem(item.id);
        pendingFocusRef.current = ADD_INPUT_FOCUS;
        return;
      }

      const nextItem = makeChecklistItem();
      const nextItems = [...currentItems];
      nextItems.splice(index + 1, 0, nextItem);
      pendingFocusRef.current = nextItem.id;
      updateItems(nextItems);
      return;
    }

    if (event.key === "Backspace" && event.currentTarget.value.length === 0) {
      event.preventDefault();
      pendingFocusRef.current = index > 0 ? currentItems[index - 1].id : ADD_INPUT_FOCUS;
      removeItem(item.id);
    }
  };

  // Never leave empty tasks behind.
  const handleItemBlur = (event, itemId) => {
    if (!itemsRef.current.some((item) => item.id === itemId)) {
      return;
    }

    const trimmed = event.currentTarget.value.trim();

    if (!trimmed) {
      removeItem(itemId);
    } else if (trimmed !== event.currentTarget.value) {
      updateItem(itemId, { text: trimmed });
    }
  };

  const handleAddKeyDown = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const value = event.currentTarget.value.trim();

    if (!value) {
      return;
    }

    event.currentTarget.value = "";
    appendItems([value]);
  };

  const handleAddPaste = (event) => {
    const lines = splitPastedLines(event.clipboardData?.getData("text") ?? "");

    if (lines.length < 2) {
      pasteAsSingleLine(event);
      return;
    }

    event.preventDefault();
    appendItems(lines);
  };

  const handleFooterClick = (event) => {
    if (event.target !== addInputRef.current) {
      focusAtEnd(addInputRef.current);
    }
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--checklist"
      renderHint={renderHint}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <article
        ref={surfaceRef}
        className="checklist-tile"
        aria-label={card.title || "Checklist"}
        {...surfaceGesture}
      >
        <header className="checklist-tile__header">
          <div className="checklist-tile__header-row">
            <div className="checklist-tile__meta">
              <input
                className="checklist-tile__date"
                type="text"
                value={card.dateLabel ?? ""}
                placeholder="Date"
                aria-label="Date"
                spellCheck={false}
                onPointerDown={stopInteractivePointer}
                onChange={(event) => updateCard({ dateLabel: event.target.value })}
                onKeyDown={blurOnEnter}
              />
              <input
                className="checklist-tile__time"
                type="text"
                value={card.timeLabel ?? ""}
                placeholder="Time"
                aria-label="Time"
                spellCheck={false}
                onPointerDown={stopInteractivePointer}
                onChange={(event) => updateCard({ timeLabel: event.target.value })}
                onKeyDown={blurOnEnter}
              />
            </div>
            <GripIcon />
          </div>
        </header>

        <section className="checklist-tile__body">
          <textarea
            ref={titleInputRef}
            className="checklist-tile__title"
            rows={1}
            value={card.title ?? ""}
            placeholder="Untitled"
            aria-label="Checklist title"
            onPointerDown={stopInteractivePointer}
            onChange={(event) => updateCard({ title: event.target.value })}
            onKeyDown={blurOnEnter}
            onPaste={pasteAsSingleLine}
          />

          <ul className="checklist-tile__list" aria-label="Tasks">
            {items.map((item) => (
              <li
                key={item.id}
                className={[
                  "checklist-tile__task",
                  mountedItemIdsRef.current.has(item.id) ? "" : "checklist-tile__task--entering",
                ].filter(Boolean).join(" ")}
                data-done={item.checked ? "true" : "false"}
              >
                <button
                  className="checklist-tile__check"
                  type="button"
                  role="checkbox"
                  aria-checked={item.checked}
                  aria-label={item.checked ? "Mark as not done" : "Mark as done"}
                  onPointerDown={stopInteractivePointer}
                  onClick={() => updateItem(item.id, { checked: !item.checked })}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3.2 8.6l3.2 3.2L12.8 4.6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <textarea
                  ref={(node) => {
                    if (node) {
                      itemRefs.current.set(item.id, node);
                    } else {
                      itemRefs.current.delete(item.id);
                    }
                  }}
                  className="checklist-tile__task-text"
                  rows={1}
                  value={item.text}
                  aria-label="Task"
                  onPointerDown={stopInteractivePointer}
                  onChange={(event) => updateItem(item.id, { text: event.target.value })}
                  onKeyDown={(event) => handleItemKeyDown(event, item)}
                  onBlur={(event) => handleItemBlur(event, item.id)}
                  onPaste={pasteAsSingleLine}
                />
              </li>
            ))}
          </ul>

          <div
            className="checklist-tile__footer"
            onPointerDown={stopInteractivePointer}
            onClick={handleFooterClick}
          >
            <textarea
              ref={addInputRef}
              className="checklist-tile__add-input"
              rows={1}
              placeholder="Add to checklist…"
              aria-label="Add to checklist"
              onKeyDown={handleAddKeyDown}
              onPaste={handleAddPaste}
            />
          </div>
        </section>
      </article>
    </TileShell>
  );
}

export default memo(ChecklistTile);
