function getPerfStore() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.__AIRPASTE_PERF__) {
    window.__AIRPASTE_PERF__ = {
      pointerMove: {
        count: 0,
        totalMs: 0,
        maxMs: 0,
      },
      boardRenders: {
        count: 0,
        reasons: new Map(),
      },
      summary: {},
      derived: new Map(),
      hitTests: new Map(),
      images: [],
      cardRenders: new Map(),
      commits: [],
    };
  }

  return window.__AIRPASTE_PERF__;
}

export function recordPointerMoveSample(durationMs) {
  const perfStore = getPerfStore();

  if (!perfStore) {
    return;
  }

  perfStore.pointerMove.count += 1;
  perfStore.pointerMove.totalMs += durationMs;
  perfStore.pointerMove.maxMs = Math.max(perfStore.pointerMove.maxMs, durationMs);
}

export function recordCardRender(cardId, cardType) {
  const perfStore = getPerfStore();

  if (!perfStore || !cardId) {
    return;
  }

  const currentCount = perfStore.cardRenders.get(cardId) ?? 0;
  const nextCount = currentCount + 1;

  perfStore.cardRenders.set(cardId, nextCount);

  if (nextCount === 1 || nextCount % 25 === 0) {
    console.debug(`[perf] Card render ${cardType}:${cardId} count=${nextCount}`);
  }
}

export function recordBoardRender(changedKeys = []) {
  const perfStore = getPerfStore();

  if (!perfStore) {
    return;
  }

  perfStore.boardRenders.count += 1;

  changedKeys.forEach((key) => {
    perfStore.boardRenders.reasons.set(
      key,
      (perfStore.boardRenders.reasons.get(key) ?? 0) + 1,
    );
  });

  if (
    perfStore.boardRenders.count === 1
    || perfStore.boardRenders.count % 20 === 0
    || changedKeys.includes("dragVisualDelta")
    || changedKeys.includes("viewport")
  ) {
    console.debug("[perf] canvas-board render", {
      count: perfStore.boardRenders.count,
      changedKeys,
    });
  }
}

export function recordDerivedMetric(name, durationMs, details = {}) {
  const perfStore = getPerfStore();

  if (!perfStore) {
    return;
  }

  const current = perfStore.derived.get(name) ?? {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    lastDetails: null,
  };

  current.count += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  current.lastDetails = details;
  perfStore.derived.set(name, current);
}

export function recordHitTestSample(name, durationMs, details = {}) {
  const perfStore = getPerfStore();

  if (!perfStore) {
    return;
  }

  const current = perfStore.hitTests.get(name) ?? {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    lastDetails: null,
  };

  current.count += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  current.lastDetails = details;
  perfStore.hitTests.set(name, current);
}

export function recordImageSample(sample) {
  const perfStore = getPerfStore();

  if (!perfStore) {
    return;
  }

  perfStore.images.push(sample);

  if (perfStore.images.length > 250) {
    perfStore.images.shift();
  }

  if (sample.oversizeRatio >= 2) {
    console.debug("[perf] oversized image candidate", sample);
  }
}

export function setPerfSummary(summary) {
  const perfStore = getPerfStore();

  if (!perfStore) {
    return;
  }

  perfStore.summary = {
    ...(perfStore.summary ?? {}),
    ...summary,
  };
}

export function recordInteractionCommit(kind, durationMs, details = {}) {
  const perfStore = getPerfStore();

  if (!perfStore) {
    return;
  }

  const entry = {
    kind,
    durationMs,
    details,
    timestamp: Date.now(),
  };

  perfStore.commits.push(entry);

  console.debug(`[perf] ${kind} commit ${durationMs.toFixed(2)}ms`, details);
}

export function readPointerMoveStats() {
  const perfStore = getPerfStore();

  if (!perfStore || perfStore.pointerMove.count === 0) {
    return null;
  }

  return {
    count: perfStore.pointerMove.count,
    avgMs: perfStore.pointerMove.totalMs / perfStore.pointerMove.count,
    maxMs: perfStore.pointerMove.maxMs,
  };
}
