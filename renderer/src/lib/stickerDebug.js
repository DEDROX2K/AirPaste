const STICKER_DEBUG_STORE_KEY = "__AIRPASTE_STICKER_DEBUG__";
const MAX_STICKER_DEBUG_EVENTS = 40;

function getStickerDebugStore() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window[STICKER_DEBUG_STORE_KEY]) {
    window[STICKER_DEBUG_STORE_KEY] = {
      events: [],
      latest: null,
    };
  }

  return window[STICKER_DEBUG_STORE_KEY];
}

export function recordStickerDebug(event, detail = null) {
  const store = getStickerDebugStore();

  if (!store) {
    return null;
  }

  const entry = {
    ts: new Date().toISOString(),
    event: typeof event === "string" ? event : "unknown",
    detail,
  };

  store.latest = entry;
  store.events.push(entry);

  if (store.events.length > MAX_STICKER_DEBUG_EVENTS) {
    store.events.splice(0, store.events.length - MAX_STICKER_DEBUG_EVENTS);
  }

  return entry;
}

export function readStickerDebugSnapshot() {
  const store = getStickerDebugStore();
  const events = Array.isArray(store?.events) ? store.events : [];

  return {
    count: events.length,
    latest: store?.latest ?? null,
    recent: events.slice(-8),
  };
}
