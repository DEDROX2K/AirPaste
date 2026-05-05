import { useEffect, useRef, useState } from "react";

const ASSET_BASE_URL = import.meta.env.BASE_URL;

const MENU_ITEMS = [
  { key: "notes", label: "Notes", icon: "notes" },
  { key: "checklist", label: "Checklist", icon: "checklist" },
  { key: "table", label: "Table", icon: "table" },
  { key: "sticky", label: "Sticky note", icon: "sticky" },
  { key: "text", label: "Text box", icon: "text" },
  { key: "rack", label: "Rack", icon: "rack" },
];

function assetUrl(relativePath) {
  return `${ASSET_BASE_URL}${String(relativePath).replace(/^\/+/, "")}`;
}

export default function CanvasAddMenu({
  commands,
  backgroundSkins = [],
  activeBackgroundSkinId = "",
  disabled = false,
  onSelectBackground,
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
          <div className="canvas-start-menu__hero">
            <span className="canvas-start-menu__hero-icon-wrap" aria-hidden="true">
              <img className="canvas-start-menu__hero-icon" src={assetUrl("Logo.png")} alt="" />
            </span>
            <span className="canvas-start-menu__hero-label">AirPaste Create</span>
          </div>

          <div className="canvas-start-menu__section">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className="canvas-start-menu__item"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  handleMenuAction(commands, item.key);
                  setOpen(false);
                }}
              >
                <span className="canvas-start-menu__item-icon" aria-hidden="true">
                  <MenuIcon icon={item.icon} />
                </span>
                <span className="canvas-start-menu__item-label">{item.label}</span>
              </button>
            ))}

            <div className="canvas-start-menu__separator" aria-hidden="true" />

            <div className="canvas-start-menu__submenu">
              <button
                type="button"
                className="canvas-start-menu__item canvas-start-menu__item--submenu"
                role="menuitem"
                disabled={disabled}
              >
                <span className="canvas-start-menu__item-icon" aria-hidden="true">
                  <MenuIcon icon="background" />
                </span>
                <span className="canvas-start-menu__item-label">Background</span>
                <span className="canvas-start-menu__item-arrow" aria-hidden="true">▶</span>
              </button>

              <div className="canvas-start-menu__submenu-panel" role="menu" aria-label="Backgrounds">
                {backgroundSkins.map((skin) => (
                  <button
                    key={skin.id}
                    type="button"
                    className={`canvas-start-menu__item canvas-start-menu__item--background${activeBackgroundSkinId === skin.id ? " canvas-start-menu__item--active" : ""}`}
                    role="menuitem"
                    onClick={() => {
                      onSelectBackground?.(skin.id);
                      setOpen(false);
                    }}
                  >
                    <span
                      className="canvas-start-menu__background-swatch"
                      aria-hidden="true"
                      style={{
                        backgroundImage: skin.kind === "image"
                          ? `url("${assetUrl(skin.assetPath)}")`
                          : "radial-gradient(circle, #3d3d3d 1px, transparent 1px)",
                        backgroundSize: skin.kind === "image"
                          ? skin.backgroundSize
                          : "8px 8px",
                      }}
                    />
                    <span className="canvas-start-menu__item-label">{skin.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={`canvas-start-menu__trigger${open ? " canvas-start-menu__trigger--open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={disabled ? "Create menu unavailable" : "Open Create menu"}
        title={disabled ? "Open a folder to enable create actions later" : "Open Create menu"}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="canvas-start-menu__trigger-inset">
          <img className="canvas-start-menu__trigger-icon" src={assetUrl("Logo.png")} alt="" aria-hidden="true" />
          <span className="canvas-start-menu__trigger-label">Create</span>
        </span>
      </button>
    </div>
  );
}

function handleMenuAction(commands, key) {
  if (!commands) {
    return;
  }

  if (key === "notes") {
    commands.createNote();
    return;
  }

  if (key === "checklist") {
    commands.createChecklist();
    return;
  }

  if (key === "table") {
    commands.createTable();
    return;
  }

  if (key === "sticky") {
    commands.createSticky();
    return;
  }

  if (key === "text") {
    commands.createTextBox();
    return;
  }

  if (key === "rack") {
    commands.createRack();
  }
}

function MenuIcon({ icon }) {
  if (icon === "canvas") {
    return <img className="canvas-start-menu__item-icon-image" src={assetUrl("icons/canvas.png")} alt="" />;
  }

  if (icon === "notes") {
    return <img className="canvas-start-menu__item-icon-image" src={assetUrl("icons/notes.png")} alt="" />;
  }

  if (icon === "sticky") {
    return <img className="canvas-start-menu__item-icon-image" src={assetUrl("icons/sticky_note_2.png")} alt="" />;
  }

  if (icon === "background") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="13" height="13" fill="#ffffff" stroke="#111111" strokeWidth="1" />
        <circle cx="4.8" cy="4.8" r="1.2" fill="#0078d7" />
        <path d="m3 12 3.2-2.8 2.4 1.8 2.2-2L13 12" stroke="#247324" strokeWidth="1.1" />
      </svg>
    );
  }

  if (icon === "checklist") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="4" height="4" fill="#fff7b6" stroke="#655500" strokeWidth="1" />
        <path d="M8.5 4.5h5" stroke="#111111" strokeWidth="1.2" />
        <rect x="2" y="10" width="4" height="4" fill="#fff7b6" stroke="#655500" strokeWidth="1" />
        <path d="M8.5 12.5h5" stroke="#111111" strokeWidth="1.2" />
      </svg>
    );
  }

  if (icon === "table") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="2" width="13" height="12" fill="#ffffff" stroke="#111111" strokeWidth="1" />
        <path d="M1.5 6.5h13M6 2v12M10.5 2v12" stroke="#111111" strokeWidth="1" />
      </svg>
    );
  }

  if (icon === "text") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 3.5h10M8 3.5v9M5 12.5h6" stroke="#111111" strokeWidth="1.4" strokeLinecap="square" />
      </svg>
    );
  }

  if (icon === "rack") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="12" height="9" fill="#d8d8d8" stroke="#111111" strokeWidth="1" />
        <path d="M4 7.5h8M4 10h8" stroke="#111111" strokeWidth="1" />
      </svg>
    );
  }

  if (icon === "import") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2v7M5 6l3-4 3 4" stroke="#111111" strokeWidth="1.3" strokeLinecap="square" />
        <rect x="2" y="10" width="12" height="4" fill="#fff7b6" stroke="#655500" strokeWidth="1" />
      </svg>
    );
  }

  if (icon === "link") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6.5 9.5 4.5 11.5a2 2 0 1 1-2.8-2.8l2-2" stroke="#111111" strokeWidth="1.2" />
        <path d="M9.5 6.5 11.5 4.5a2 2 0 1 1 2.8 2.8l-2 2" stroke="#111111" strokeWidth="1.2" />
        <path d="M5.5 10.5 10.5 5.5" stroke="#111111" strokeWidth="1.2" />
      </svg>
    );
  }

  if (icon === "image") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="2" width="13" height="11" fill="#ffffff" stroke="#111111" strokeWidth="1" />
        <circle cx="5" cy="5.5" r="1.3" fill="#0095ff" />
        <path d="m3 12 3.5-3 2.5 2L11 8.5 13 12" stroke="#2a6f2a" strokeWidth="1.1" />
      </svg>
    );
  }

  return null;
}
