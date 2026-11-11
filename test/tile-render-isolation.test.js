// @vitest-environment jsdom
//
// The canvas performance contract: an edit or a drag of one tile never
// re-renders another. Renders the real Card / tile components the board
// renders and counts renders with both render spies in lib/perf.js: Card's
// (recordCardRender, props-driven renders) and TileShell's
// (recordTileRender, which also catches renders caused by a context).
/* global window, document */
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Card from "@/components/Card.jsx";
import { CanvasDragMotionContext } from "@/context/CanvasDragMotionContext.js";
import { TileAppContext } from "@/context/TileAppContext.js";
import { createDragMotionStore } from "@/systems/interactions/dragMotion.js";
import { getTileStyleVars } from "@/systems/layout/tileLayout.js";
import { createCounterCard } from "@/tiles/counter/model.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const RENDER_HINT = Object.freeze({ renderState: "detail", previewTier: "original", simplify: false });
const PERFORMANCE_MODE = Object.freeze({ workspaceLodLevel: "normal" });
const CHILD_TILES = [];

function makeTileMeta(card, isDragging = false) {
  return {
    isDragging,
    isSelected: false,
    isFocused: false,
    isHovered: false,
    interactionState: "idle",
    styleVars: getTileStyleVars(card, null),
  };
}

function tileRenders(cardId) {
  const perfStore = window.__AIRPASTE_PERF__;
  return (perfStore?.tileRenders?.byCard.get(cardId) ?? 0) + (perfStore?.cardRenders?.get(cardId) ?? 0);
}

// A minimal board: cards and tile metas in state, stable handlers, one
// Card per tile -- the same props the canvas passes.
function Board({ initialCards, api, dragMotion, tileAppContext }) {
  const [cards, setCards] = useState(initialCards);
  const [metaById, setMetaById] = useState(() => Object.fromEntries(
    initialCards.map((card) => [card.id, makeTileMeta(card)]),
  ));

  api.updateCard = (cardId, patch) => setCards((current) => current.map((card) => (
    card.id === cardId ? { ...card, ...patch } : card
  )));
  api.setDragging = (cardId, isDragging) => setMetaById((current) => ({
    ...current,
    [cardId]: makeTileMeta(cards.find((card) => card.id === cardId), isDragging),
  }));

  return createElement(
    TileAppContext.Provider,
    { value: tileAppContext },
    createElement(
      CanvasDragMotionContext.Provider,
      { value: dragMotion },
      cards.map((card) => createElement(
        "div",
        { key: card.id, "data-tile": card.id },
        createElement(Card, {
          card,
          tileMeta: metaById[card.id],
          renderHint: RENDER_HINT,
          childTiles: CHILD_TILES,
          rackState: null,
          performanceMode: PERFORMANCE_MODE,
          canvasToolMode: "select",
          textBoxEditorState: null,
          onBeginDrag: noop,
          onContextMenu: noop,
          onHoverChange: noop,
          onFocusIn: noop,
          onFocusOut: noop,
          onOpenLink: noop,
          onMediaLoad: noop,
          onPressStart: noop,
          onPullFromRack: noop,
          onCreateAdjacentSticky: noop,
          onRetry: noop,
          onRequestTextBoxEdit: noop,
          onEndTextBoxEdit: noop,
        }),
      )),
    ),
  );
}

describe("tile render isolation", () => {
  let container;
  let root;
  let api;
  let dragMotion;
  let cardA;
  let cardB;

  beforeEach(async () => {
    delete window.__AIRPASTE_PERF__;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = {};
    dragMotion = createDragMotionStore();
    cardA = createCounterCard([], { x: 0, y: 0, zoom: 1 }, { x: 100, y: 100 }, { title: "A" });
    cardB = createCounterCard([cardA], { x: 0, y: 0, zoom: 1 }, { x: 600, y: 100 }, { title: "B" });
    const tileAppContext = {
      currentEditor: { kind: "canvas", filePath: "/mock/test.canvas" },
      deleteExistingCard: noop,
      folderPath: "/mock",
      setCanvasInteractionState: noop,
      updateExistingCard: (cardId, patch) => api.updateCard(cardId, patch),
    };

    await act(async () => {
      root.render(createElement(Board, { initialCards: [cardA, cardB], api, dragMotion, tileAppContext }));
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("re-renders only card A when card A changes", async () => {
    const before = { a: tileRenders(cardA.id), b: tileRenders(cardB.id) };
    expect(before.a).toBeGreaterThan(0);
    expect(before.b).toBeGreaterThan(0);

    await act(async () => api.updateCard(cardA.id, { value: cardA.value + 5 }));

    expect(tileRenders(cardA.id)).toBeGreaterThan(before.a);
    expect(tileRenders(cardB.id)).toBe(before.b);
  });

  it("moves a dragged tile without re-rendering anything", async () => {
    await act(async () => api.setDragging(cardA.id, true));
    const before = { a: tileRenders(cardA.id), b: tileRenders(cardB.id) };
    const articleA = container.querySelector(`[data-tile="${cardA.id}"] article.card`);
    const articleB = container.querySelector(`[data-tile="${cardB.id}"] article.card`);

    await act(async () => {
      for (let frame = 1; frame <= 30; frame += 1) {
        dragMotion.set([cardA.id], { x: frame * 4, y: frame * 2 });
      }
    });

    expect(tileRenders(cardA.id)).toBe(before.a);
    expect(tileRenders(cardB.id)).toBe(before.b);
    expect(articleA.style.getPropertyValue("--tile-drag-x")).toBe("120px");
    expect(articleA.style.getPropertyValue("--tile-drag-y")).toBe("60px");
    expect(articleB.style.getPropertyValue("--tile-drag-x")).toBe("");

    // The drop: the new spot lands and the live offset goes, in one commit.
    await act(async () => {
      dragMotion.clear();
      api.updateCard(cardA.id, { x: cardA.x + 120, y: cardA.y + 60 });
      api.setDragging(cardA.id, false);
    });

    expect(articleA.style.getPropertyValue("--tile-drag-x")).toBe("");
    expect(tileRenders(cardB.id)).toBe(before.b);
  });
});
