// Every canvas pane on screen (split screen's left and right panes, the
// floating view) registers here, so a tile dragged out of one can be
// dropped into another. One window has one registry.
//
// A pane's api: { getPageId, getFilePath, getElement, clientToWorldPoint,
// getZoom }. Its outer element and drop-ghost element are registered
// separately (by whoever lays the pane out) for the drop highlight.

const panes = new Map();
const paneElements = new Map();
const dropGhosts = new Map();
const elementRefCallbacks = new Map();
const ghostRefCallbacks = new Map();

// The floating view sits on top of the others, so it wins the hit test.
const HIT_ORDER = ["float", "right", "left"];

export function registerPane(paneId, api) {
  panes.set(paneId, api);
  return () => {
    if (panes.get(paneId) === api) {
      panes.delete(paneId);
    }
  };
}

function contains(rect, clientX, clientY) {
  return rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

// The pane (other than `fromPaneId`) whose canvas is under the pointer.
export function findDropPane(clientX, clientY, fromPaneId) {
  const ids = [...HIT_ORDER.filter((id) => panes.has(id)), ...[...panes.keys()].filter((id) => !HIT_ORDER.includes(id))];
  for (const paneId of ids) {
    const api = panes.get(paneId);
    const rect = api?.getElement()?.getBoundingClientRect();
    if (!contains(rect, clientX, clientY)) continue;
    // Over the pane being dragged from (e.g. the floating view above the
    // left pane): not a drop into anything underneath.
    if (paneId === fromPaneId) return null;
    return { paneId, ...api };
  }
  return null;
}

// A tile from one pane is being dragged over another: highlight that pane
// and draw the tiles' outline where they'd land. Written straight to the
// DOM, so a drag never re-renders a canvas.
export function setDropTargetPane(paneId, info) {
  for (const [id, node] of paneElements) {
    if (id === paneId) node.setAttribute("data-drop-target", "");
    else node.removeAttribute("data-drop-target");
  }
  for (const [id, node] of dropGhosts) {
    if (id !== paneId) node.style.display = "none";
  }

  const ghost = paneId ? dropGhosts.get(paneId) : null;
  if (!ghost) return;
  const target = panes.get(paneId);
  const paneNode = paneElements.get(paneId);
  if (!target || !paneNode || !info?.bounds) {
    ghost.style.display = "none";
    return;
  }
  const zoom = target.getZoom();
  const paneRect = paneNode.getBoundingClientRect();
  ghost.style.display = "block";
  ghost.style.left = `${info.clientX - paneRect.left + info.bounds.left * zoom}px`;
  ghost.style.top = `${info.clientY - paneRect.top + info.bounds.top * zoom}px`;
  ghost.style.width = `${info.bounds.width * zoom}px`;
  ghost.style.height = `${info.bounds.height * zoom}px`;
}

function stableRef(cache, store, paneId) {
  let callback = cache.get(paneId);
  if (!callback) {
    callback = (node) => {
      if (node) store.set(paneId, node);
      else store.delete(paneId);
    };
    cache.set(paneId, callback);
  }
  return callback;
}

const paneApi = Object.freeze({ registerPane, findDropPane, setDropTargetPane });
const registry = Object.freeze({
  paneApi,
  paneElementRef: (paneId) => stableRef(elementRefCallbacks, paneElements, paneId),
  dropGhostRef: (paneId) => stableRef(ghostRefCallbacks, dropGhosts, paneId),
});

export function useCanvasPaneRegistry() {
  return registry;
}
