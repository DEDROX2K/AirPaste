// The live offset of a tile drag, kept outside React state. A drag frame
// writes it here once per animation frame and whatever draws the dragged
// tiles reads it straight from the store: TileShell writes its own
// transform, the tether and feel systems and the paper-note ghosts follow.
// Nothing re-renders mid-drag; React only hears about the drag when it
// starts (draggingTileIds) and when the drop commits the new x/y.
//
// Listeners are per tile, so a frame of dragging tile A never touches B.

export function createDragMotionStore() {
  let current = null;
  const tileListeners = new Map();
  const listeners = new Set();

  function notify(tileIds) {
    tileIds.forEach((tileId) => {
      tileListeners.get(tileId)?.forEach((listener) => listener(current?.delta ?? null));
    });
    listeners.forEach((listener) => listener(current));
  }

  return {
    // { tileIds, delta } while a drag is under way, else null.
    get: () => current,
    getTileDelta(tileId) {
      return current && current.tileIdSet.has(tileId) ? current.delta : null;
    },
    set(tileIds, delta) {
      if (
        current
        && current.tileIds === tileIds
        && current.delta.x === delta.x
        && current.delta.y === delta.y
      ) {
        return;
      }

      current = { tileIds, tileIdSet: current?.tileIds === tileIds ? current.tileIdSet : new Set(tileIds), delta };
      notify(tileIds);
    },
    clear() {
      if (!current) {
        return;
      }

      const { tileIds } = current;
      current = null;
      notify(tileIds);
    },
    // Called with the tile's delta (or null once the drag is over).
    subscribeTile(tileId, listener) {
      let set = tileListeners.get(tileId);

      if (!set) {
        set = new Set();
        tileListeners.set(tileId, set);
      }

      set.add(listener);
      return () => {
        set.delete(listener);

        if (set.size === 0 && tileListeners.get(tileId) === set) {
          tileListeners.delete(tileId);
        }
      };
    },
    // Called with the whole drag ({ tileIds, delta } or null) every frame.
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
