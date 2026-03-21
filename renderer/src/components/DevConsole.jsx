import { useEffect, useRef, useState } from "react";
import { DemoShadcn } from "./DemoShadcn";
import { useLog } from "../hooks/useLog";
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

export function DevConsole() {
  const { entries, clearLog } = useLog();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
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

  const visible = filter === "all"
    ? entries
    : entries.filter((e) => e.level === filter);

  return (
    <div id="dev-console" className={`dev-console ${open ? "dev-console--open" : ""}`}>
      {/* ── Tab handle ── */}
      <button
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
      </button>

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
                onClick={clearLog}
                title="Clear log"
              >
                Clear
              </AppButton>
            </div>
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
                          ? JSON.stringify(entry.detail)
                          : String(entry.detail)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      <DemoShadcn />
    </div>
  );
}
