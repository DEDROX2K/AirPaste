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
        movingCount: 0,
        reasons: new Map(),
      },
      summary: {},
      derived: new Map(),
      hitTests: new Map(),
      images: [],
      cardRenders: new Map(),
      previewTiers: {
        byCard: new Map(),
        counts: new Map(),
      },
      saves: {
        count: 0,
        totalSerializeMs: 0,
        totalSaveMs: 0,
        maxSaveMs: 0,
        maxSerializeMs: 0,
        lastSample: null,
      },
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

export function recordBoardRender(changedKeys = [], options = {}) {
  const perfStore = getPerfStore();

  if (!perfStore) {
    return;
  }

  const isMoving = options?.isMoving === true;
  perfStore.boardRenders.count += 1;
  if (isMoving) {
    perfStore.boardRenders.movingCount += 1;
  }

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
      movingCount: perfStore.boardRenders.movingCount,
      changedKeys,
    });
  }
}

export function recordPreviewTierSelection(cardId, tier) {
  const perfStore = getPerfStore();

  if (!perfStore || !cardId || !tier) {
    return;
  }

  const previousTier = perfStore.previewTiers.byCard.get(cardId) ?? null;
  if (previousTier === tier) {
    return;
  }

  if (previousTier) {
    const previousCount = perfStore.previewTiers.counts.get(previousTier) ?? 0;
    perfStore.previewTiers.counts.set(previousTier, Math.max(0, previousCount - 1));
  }

  perfStore.previewTiers.byCard.set(cardId, tier);
  perfStore.previewTiers.counts.set(
    tier,
    (perfStore.previewTiers.counts.get(tier) ?? 0) + 1,
  );
}

export function recordSaveSample(sample) {
  const perfStore = getPerfStore();

  if (!perfStore || !sample) {
    return;
  }

  const serializeMs = Number.isFinite(sample.serializeMs) ? sample.serializeMs : 0;
  const saveMs = Number.isFinite(sample.saveMs) ? sample.saveMs : 0;
  const totalMs = Number.isFinite(sample.totalMs) ? sample.totalMs : serializeMs + saveMs;
  const payloadBytes = Number.isFinite(sample.payloadBytes) ? sample.payloadBytes : 0;
  const status = sample.status === "error" ? "error" : "success";

  perfStore.saves.count += 1;
  perfStore.saves.totalSerializeMs += serializeMs;
  perfStore.saves.totalSaveMs += saveMs;
  perfStore.saves.maxSaveMs = Math.max(perfStore.saves.maxSaveMs, saveMs);
  perfStore.saves.maxSerializeMs = Math.max(perfStore.saves.maxSerializeMs, serializeMs);
  perfStore.saves.lastSample = {
    path: typeof sample.path === "string" ? sample.path : "",
    serializeMs,
    saveMs,
    totalMs,
    payloadBytes,
    status,
    timestamp: Date.now(),
  };
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
