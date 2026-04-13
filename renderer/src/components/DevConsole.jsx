import { useEffect, useMemo, useRef, useState } from "react";
import { useLog } from "../hooks/useLog";
import { useToast } from "../hooks/useToast";
import { AppButton } from "./ui/app";

const LEVEL_META = {
  info:    { label: "INFO",    color: "var(--dc-info)"    },
  success: { label: "OK",      color: "var(--dc-success)" },
  warn:    { label: "WARN",    color: "var(--dc-warn)"    },
  error:   { label: "ERR",     color: "var(--dc-error)"   },
};

function timestamp(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
}

function serializeEntry(entry) {
  const meta = LEVEL_META[entry.level] ?? LEVEL_META.info;
  const detail = entry.detail == null
    ? ""
    : typeof entry.detail === "object"
      ? JSON.stringify(entry.detail, null, 2)
      : String(entry.detail);

  return `[${timestamp(entry.ts)}] ${meta.label} ${entry.message}${detail ? `\n${detail}` : ""}`;
}

async function copyTextToClipboard(text) {
  if (!text) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function readPerfSnapshot() {
  const perfStore = window.__AIRPASTE_PERF__ ?? null;
  const pointer = perfStore?.pointerMove ?? null;
  const pointerCount = pointer?.count ?? 0;
  const latestCommit = perfStore?.commits?.[perfStore.commits.length - 1] ?? null;
  const summary = perfStore?.summary ?? {};

  return {
    pointerAvgMs: pointerCount > 0 ? pointer.totalMs / pointerCount : 0,
    pointerMaxMs: pointer?.maxMs ?? 0,
    boardRenders: perfStore?.boardRenders?.count ?? 0,
    latestCommitMs: latestCommit?.durationMs ?? 0,
    visibleTileCount: summary.visibleTileCount ?? 0,
    totalTileCount: summary.totalTileCount ?? 0,
    activeDragLayers: summary.activeDragLayers ?? 0,
  };
}

export function DevConsole() {
  const { entries, clearLog } = useLog();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [perfSnapshot, setPerfSnapshot] = useState(() => readPerfSnapshot());
  const bodyRef = useRef(null);

  /* Toggle with Ctrl+` */
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Auto-scroll to bottom */
  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setPerfSnapshot(readPerfSnapshot());
    }, 400);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open]);

  const visible = filter === "all"
    ? entries
    : entries.filter((e) => e.level === filter);
  const visibleLogText = useMemo(() => visible.map(serializeEntry).join("\n"), [visible]);
  const allLogText = useMemo(() => entries.map(serializeEntry).join("\n"), [entries]);

  const handleCopyText = async (text, label) => {
    if (!text) {
      toast("info", `Nothing to copy from ${label}.`);
      return;
    }

    try {
      await copyTextToClipboard(text);
      toast("success", `${label} copied to clipboard.`);
    } catch {
      toast("error", `Could not copy ${label.toLowerCase()}.`);
    }
  };

  return (
    <div id="dev-console" className={`dev-console ${open ? "dev-console--open" : ""}`}>
      {/* ── Tab handle ── */}
      <AppButton tone="unstyled"
        id="dev-console-toggle"
        className="dev-console__tab"
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Toggle dev console (Ctrl+`)"
      >
        <span className="dev-console__tab-dot" />
        DEV
        {entries.some((e) => e.level === "error") && (
          <span className="dev-console__tab-badge">!</span>
        )}
      </AppButton>

      {open && (
        <div className="dev-console__panel">
          {/* Header */}
          <div className="dev-console__header">
            <div className="dev-console__filters">
              {["all", "info", "success", "warn", "error"].map((lvl) => (
                <AppButton
                  key={lvl}
                  size="sm"
                  variant={filter === lvl ? "secondary" : "ghost"}
                  className="h-6 px-2 text-xs capitalize"
                  onClick={() => setFilter(lvl)}
                >
                  {lvl}
                </AppButton>
              ))}
            </div>
            <div className="dev-console__header-actions">
              <span className="dev-console__count">{entries.length} entries</span>
              <AppButton
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => { void handleCopyText(visibleLogText, "Visible log"); }}
                title="Copy currently filtered entries"
              >
                Copy Visible
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => { void handleCopyText(allLogText, "Full log"); }}
                title="Copy all entries"
              >
                Copy All
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={clearLog}
                title="Clear log"
              >
                Clear
              </AppButton>
            </div>
          </div>
          <div className="dev-console__perf">
            <span>Pointer {perfSnapshot.pointerAvgMs.toFixed(2)}ms avg</span>
            <span>Pointer max {perfSnapshot.pointerMaxMs.toFixed(2)}ms</span>
            <span>Board renders {perfSnapshot.boardRenders}</span>
            <span>Commit {perfSnapshot.latestCommitMs.toFixed(2)}ms</span>
            <span>Visible {perfSnapshot.visibleTileCount}/{perfSnapshot.totalTileCount}</span>
            <span>Drag layers {perfSnapshot.activeDragLayers}</span>
          </div>

          {/* Log body */}
          <div className="dev-console__body" ref={bodyRef}>
            {visible.length === 0 ? (
              <p className="dev-console__empty">No log entries yet. Start interacting with the app.</p>
            ) : (
              visible.map((entry) => {
                const meta = LEVEL_META[entry.level] ?? LEVEL_META.info;
                return (
                  <div key={entry.id} className={`dev-console__row dev-console__row--${entry.level}`}>
                    <span className="dev-console__ts">{timestamp(entry.ts)}</span>
                    <span className="dev-console__badge" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="dev-console__msg">{entry.message}</span>
                    {entry.detail != null && entry.detail !== "" && (
                      <span className="dev-console__detail">
                        {typeof entry.detail === "object"
                          ? JSON.stringify(entry.detail, null, 2)
                          : String(entry.detail)}
                      </span>
                    )}
                    <AppButton tone="unstyled"
                      className="dev-console__copy-row"
                      type="button"
                      onClick={() => { void handleCopyText(serializeEntry(entry), "Log line"); }}
                    >
                      Copy
                    </AppButton>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

