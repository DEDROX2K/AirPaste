import { useEffect, useRef, useState } from "react";

const ASSET_BASE_URL = import.meta.env.BASE_URL;

// Every tile that can be created from scratch, grouped. "command" is the
// useCanvasCommands function each item calls.
const MENU_SECTIONS = [
  {
    key: "write",
    label: "Write",
    items: [
      { key: "text-card", label: "Quick text", icon: "text", command: "createTextCard" },
      { key: "sticky", label: "Sticky note", icon: "sticky", command: "createSticky" },
      { key: "paper-note", label: "Paper note", icon: "paper-note", command: "createPaperNote" },
      { key: "checklist", label: "Checklist", icon: "checklist", command: "createChecklist" },
      { key: "vault-note", label: "Vault note", icon: "notes", command: "addNoteFromVault" },
    ],
  },
  {
    key: "plan",
    label: "Plan",
    items: [
      { key: "calendar", label: "Calendar", icon: "calendar", command: "createCalendar" },
      { key: "deadline", label: "Deadline", icon: "deadline", command: "createDeadline" },
      { key: "progress", label: "Progress", icon: "progress", command: "createProgress" },
      { key: "weather", label: "Weather", icon: "weather", command: "createWeather" },
    ],
  },
  {
    key: "data",
    label: "Data",
    items: [
      { key: "table", label: "Table", icon: "table", command: "createTable" },
      { key: "counter", label: "Counter", icon: "counter", command: "createCounter" },
      { key: "code", label: "Code", icon: "code", command: "createCode" },
    ],
  },
  {
    key: "organize",
    label: "Organize",
    items: [
      { key: "rack", label: "Rack", icon: "rack", command: "createRack" },
      { key: "link", label: "Link from clipboard", icon: "link", command: "createLinkFromClipboard" },
    ],
  },
];

function assetUrl(relativePath) {
  return `${ASSET_BASE_URL}${String(relativePath).replace(/^\/+/, "")}`;
}

export default function CanvasAddMenu({
  commands,
  disabled = false,
  iconOnly = false,
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`canvas-start-menu${open ? " canvas-start-menu--open" : ""}`}>
      {open ? (
        <div className="canvas-start-menu__panel" role="menu" aria-label="Create menu">
          {iconOnly ? null : (
            <div className="canvas-start-menu__hero">
              <span className="canvas-start-menu__hero-icon-wrap" aria-hidden="true">
                <img className="canvas-start-menu__hero-icon" src={assetUrl("Logo.png")} alt="" />
              </span>
              <span className="canvas-start-menu__hero-label">AirPaste Create</span>
            </div>
          )}

          {MENU_SECTIONS.map((section) => (
            <div key={section.key} className="canvas-start-menu__section" role="group" aria-label={section.label}>
              <span className="canvas-start-menu__section-label" aria-hidden="true">{section.label}</span>
              <div className="canvas-start-menu__section-items">
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="canvas-start-menu__item"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => {
                      handleMenuAction(commands, item);
                      setOpen(false);
                    }}
                  >
                    <span className="canvas-start-menu__item-icon" aria-hidden="true">
                      <MenuIcon icon={item.icon} />
                    </span>
                    <span className="canvas-start-menu__item-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className={`canvas-start-menu__trigger${iconOnly ? " canvas-start-menu__trigger--icon-only" : ""}${open ? " canvas-start-menu__trigger--open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={disabled ? "Create menu unavailable" : "Open Create menu"}
        title={disabled ? "Open a folder to enable create actions later" : "Create"}
        onClick={() => setOpen((current) => !current)}
      >
        {iconOnly ? (
          <svg className="canvas-start-menu__trigger-plus" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          <span className="canvas-start-menu__trigger-inset">
            <img className="canvas-start-menu__trigger-icon" src={assetUrl("Logo.png")} alt="" aria-hidden="true" />
            <span className="canvas-start-menu__trigger-label">Create</span>
          </span>
        )}
      </button>
    </div>
  );
}

function handleMenuAction(commands, item) {
  void commands?.[item.command]?.();
}

function MenuIcon({ icon }) {
  if (icon === "canvas") {
    return <img className="canvas-start-menu__item-icon-image" src={assetUrl("icons/canvas.png")} alt="" />;
  }

  if (icon === "notes") {
    return <img className="canvas-start-menu__item-icon-image" src={assetUrl("icons/notes.png")} alt="" />;
  }

  if (icon === "checklist") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="2.5" width="3" height="3" rx="0.6" fill="currentColor" />
        <path d="M8 4h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <rect x="2" y="10.5" width="3" height="3" rx="0.6" fill="currentColor" opacity="0.4" />
        <path d="M8 12h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
      </svg>
    );
  }

  if (icon === "table") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="2" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M1.5 6.5h13M6 2v12M10.5 2v12" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }

  if (icon === "text") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 3.5h10M8 3.5v9M5 12.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "paper-note") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      </svg>
    );
  }

  if (icon === "rack") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 7.5h8M4 10h8" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }

  if (icon === "import") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2v7M5 6l3-4 3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="2" y="10" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  if (icon === "link") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6.5 9.5 4.5 11.5a2 2 0 1 1-2.8-2.8l2-2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9.5 6.5 11.5 4.5a2 2 0 1 1 2.8 2.8l-2 2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 10.5 10.5 5.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  if (icon === "sticky") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V10l-3.5 3.5h-6.5a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M13.5 10H11a1 1 0 0 0-1 1v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "calendar") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "deadline") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 6v3l2 1.5M6.5 1.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "progress") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="6" width="13" height="4" rx="2" stroke="currentColor" strokeWidth="1.2" />
        <rect x="3" y="7.5" width="6" height="1" rx="0.5" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "weather") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 1.5v1M1.5 6h1M2.8 2.8l.7.7M9.2 2.8l-.7.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M6.5 13.5h5.5a2.5 2.5 0 0 0 0-5 3.5 3.5 0 0 0-6.6 1.2A1.9 1.9 0 0 0 6.5 13.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "counter") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 2 4.5 14M11.5 2 10 14M2.5 5.5h11M2 10.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "code") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "image") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="2" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="5" cy="5.5" r="1.3" fill="currentColor" opacity="0.6" />
        <path d="m3 12 3.5-3 2.5 2L11 8.5 13 12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return null;
}
