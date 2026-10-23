import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

function stopInteractivePointer(event) {
  event.stopPropagation();
}

const MAX_INDENT = 1;
const CHECKLIST_MIN_HEIGHT = 140;
const CHECKLIST_HEIGHT_EPSILON = 1;

function makeChecklistItem(item = {}) {
  return {
    id: typeof item.id === "string" && item.id.trim().length > 0
      ? item.id.trim()
      : crypto.randomUUID(),
    text: typeof item.text === "string" ? item.text : "",
    checked: item.checked === true,
    indent: Number.isInteger(item.indent) ? Math.max(0, Math.min(MAX_INDENT, item.indent)) : 0,
    highlighted: item.highlighted === true,
  };
}

function resizeTextarea(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return;
  }

  textarea.style.height = "0px";
  textarea.style.height = `${Math.max(28, textarea.scrollHeight)}px`;
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
  const itemRefs = useRef(new Map());
  const pendingFocusItemIdRef = useRef(null);
  const titleInputRef = useRef(null);
  const surfaceRef = useRef(null);
  const surfaceGesture = useTileGesture({
    card,
    onDoubleActivate: () => {
      titleInputRef.current?.focus?.();
      titleInputRef.current?.select?.();
    },
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const items = useMemo(() => (
    Array.isArray(card.items) && card.items.length > 0
      ? card.items
      : [makeChecklistItem()]
  ), [card.items]);

  useEffect(() => {
    itemRefs.current.forEach((textarea) => {
      resizeTextarea(textarea);
    });

    if (pendingFocusItemIdRef.current) {
      const textarea = itemRefs.current.get(pendingFocusItemIdRef.current);

      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        pendingFocusItemIdRef.current = null;
      }
    }
  }, [items]);

  // The surface only ever carries min-height, so it already visually grows
  // to fit its content -- but card.height (the data the rest of the canvas,
  // hit-testing, and layout use) never followed along, so the tile's actual
  // selection/overlap bounds stayed stuck at creation size while the content
  // kept adding items. Same measure-and-write-back pattern TextBoxTile and
  // CanvasTextTile already use for exactly this reason.
  useLayoutEffect(() => {
    if (!surfaceRef.current) {
      return;
    }

    const measuredHeight = Math.max(
      CHECKLIST_MIN_HEIGHT,
      Math.ceil(surfaceRef.current.getBoundingClientRect().height),
    );
    const currentHeight = Number.isFinite(card.height) ? card.height : CHECKLIST_MIN_HEIGHT;

    if (Math.abs(measuredHeight - currentHeight) > CHECKLIST_HEIGHT_EPSILON) {
      updateExistingCard(card.id, { height: measuredHeight });
    }
  }, [card.height, card.id, card.title, card.width, items, updateExistingCard]);

  const updateItems = (nextItems) => {
    updateExistingCard(card.id, {
      items: nextItems.map((item) => makeChecklistItem(item)),
    });
  };

  const handleTitleChange = (event) => {
    updateExistingCard(card.id, {
      title: event.target.value,
    });
  };

  const handleToggleItem = (itemId) => {
    updateItems(items.map((item) => (
      item.id === itemId
        ? { ...item, checked: !item.checked }
        : item
    )));
  };

  const handleItemTextChange = (itemId, value) => {
    updateItems(items.map((item) => (
      item.id === itemId
        ? { ...item, text: value }
        : item
    )));
  };

  const handleToggleHighlight = (itemId) => {
    updateItems(items.map((item) => (
      item.id === itemId
        ? { ...item, highlighted: !item.highlighted }
        : item
    )));
  };

  const handleIndentItem = (itemId, delta) => {
    const index = items.findIndex((item) => item.id === itemId);

    if (index < 0) {
      return;
    }

    const current = items[index];
    const nextIndent = Math.max(0, Math.min(MAX_INDENT, current.indent + delta));

    if (nextIndent === current.indent || (nextIndent > 0 && index === 0)) {
      return;
    }

    updateItems(items.map((item) => (
      item.id === itemId
        ? { ...item, indent: nextIndent }
        : item
    )));
  };

  const handleMoveItem = (itemId, direction) => {
    const index = items.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    const nextItems = [...items];
    [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
    updateItems(nextItems);
  };

  const handleAddItem = (afterItemId = null) => {
    const afterItem = afterItemId ? items.find((item) => item.id === afterItemId) : null;
    const nextItem = makeChecklistItem({ indent: afterItem?.indent ?? 0 });
    pendingFocusItemIdRef.current = nextItem.id;

    if (!afterItemId) {
      updateItems([...items, nextItem]);
      return;
    }

    const currentIndex = items.findIndex((item) => item.id === afterItemId);
    const insertionIndex = currentIndex >= 0 ? currentIndex + 1 : items.length;
    const nextItems = [...items];
    nextItems.splice(insertionIndex, 0, nextItem);
    updateItems(nextItems);
  };

  const handleRemoveItem = (itemId) => {
    if (items.length <= 1) {
      updateItems([{ ...items[0], text: "", checked: false }]);
      return;
    }

    updateItems(items.filter((item) => item.id !== itemId));
  };

  const handleItemKeyDown = (event, itemId, itemText) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      handleMoveItem(itemId, event.key === "ArrowUp" ? -1 : 1);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      handleIndentItem(itemId, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleAddItem(itemId);
      return;
    }

    if (event.key === "Backspace" && itemText.length === 0) {
      event.preventDefault();
      handleRemoveItem(itemId);
    }
  };

  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section ref={surfaceRef} className="card__surface card__surface--checklist" aria-label={card.title || "Checklist"}>
            <header className="card__checklist-header">
              <input
                ref={titleInputRef}
                className="card__checklist-title"
                type="text"
                value={card.title ?? ""}
                placeholder="Title"
                aria-label="Checklist title"
                onPointerDown={stopInteractivePointer}
                onChange={handleTitleChange}
              />
            </header>

            <div className="card__checklist-items">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={[
                    "card__checklist-item",
                    item.checked ? "card__checklist-item--checked" : "",
                    item.indent > 0 ? "card__checklist-item--indented" : "",
                    item.highlighted ? "card__checklist-item--highlighted" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <button
                    className={`card__checklist-bullet${item.checked ? " card__checklist-bullet--checked" : ""}`}
                    type="button"
                    aria-label={item.checked ? "Mark item not done" : "Mark item done"}
                    aria-pressed={item.checked}
                    onPointerDown={stopInteractivePointer}
                    onClick={() => handleToggleItem(item.id)}
                  />
                  <textarea
                    ref={(node) => {
                      if (node) {
                        itemRefs.current.set(item.id, node);
                        resizeTextarea(node);
                      } else {
                        itemRefs.current.delete(item.id);
                      }
                    }}
                    className="card__checklist-input"
                    value={item.text}
                    rows={1}
                    placeholder={index === items.length - 1 ? "List item" : "Checklist item"}
                    aria-label={`Checklist item ${index + 1}`}
                    onPointerDown={stopInteractivePointer}
                    onChange={(event) => {
                      handleItemTextChange(item.id, event.target.value);
                      resizeTextarea(event.target);
                    }}
                    onKeyDown={(event) => handleItemKeyDown(event, item.id, item.text)}
                  />
                  <button
                    className={`card__checklist-highlight${item.highlighted ? " card__checklist-highlight--active" : ""}`}
                    type="button"
                    aria-label={item.highlighted ? "Remove emphasis" : "Emphasize item"}
                    aria-pressed={item.highlighted}
                    onPointerDown={stopInteractivePointer}
                    onClick={() => handleToggleHighlight(item.id)}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M10.5 2.5 13.5 5.5 6 13l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <button
              className="card__checklist-add"
              type="button"
              onPointerDown={stopInteractivePointer}
              onClick={() => handleAddItem()}
            >
              <span className="card__checklist-add-plus" aria-hidden="true">+</span>
              <span>Add item</span>
            </button>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(ChecklistTile);
