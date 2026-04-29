import { memo, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function makeChecklistItem(item = {}) {
  return {
    id: typeof item.id === "string" && item.id.trim().length > 0
      ? item.id.trim()
      : crypto.randomUUID(),
    text: typeof item.text === "string" ? item.text : "",
    checked: item.checked === true,
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
}) {
  const { updateExistingCard } = useAppContext();
  const itemRefs = useRef(new Map());
  const pendingFocusItemIdRef = useRef(null);
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const items = useMemo(() => (
    Array.isArray(card.items) && card.items.length > 0
      ? card.items
      : [makeChecklistItem()]
  ), [card.items]);
  const completedCount = items.filter((item) => item.checked).length;

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

  const handleAddItem = (afterItemId = null) => {
    const nextItem = makeChecklistItem();
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
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section className="card__surface card__surface--checklist" aria-label={card.title || "Checklist"}>
            <header className="card__checklist-header">
              <input
                className="card__checklist-title"
                type="text"
                value={card.title ?? ""}
                placeholder="Title"
                aria-label="Checklist title"
                onPointerDown={stopInteractivePointer}
                onChange={handleTitleChange}
              />
              <div className="card__checklist-progress" aria-label={`${completedCount} of ${items.length} items complete`}>
                <span>{completedCount}/{items.length}</span>
              </div>
            </header>

            <div className="card__checklist-items">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={`card__checklist-item${item.checked ? " card__checklist-item--checked" : ""}`}
                >
                  <button
                    className={`card__checklist-toggle${item.checked ? " card__checklist-toggle--checked" : ""}`}
                    type="button"
                    aria-label={item.checked ? "Mark item incomplete" : "Mark item complete"}
                    aria-pressed={item.checked}
                    onPointerDown={stopInteractivePointer}
                    onClick={() => handleToggleItem(item.id)}
                  >
                    {item.checked ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8.4 6.3 11.4 13 4.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
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
