import { useEffect, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Canvas,
  CloudSun,
  Code,
  Hash,
  Image,
  Import,
  Link2,
  ListChecks,
  NotebookText,
  Notes,
  Plus,
  Progress,
  StickyNote,
  Table2,
  Timer,
  Type,
} from "./ui/icons";

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
                <img className="canvas-start-menu__hero-icon" src={assetUrl("logo.png")} alt="" />
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
          <Plus className="canvas-start-menu__trigger-plus" size={16} aria-hidden="true" />
        ) : (
          <span className="canvas-start-menu__trigger-inset">
            <img className="canvas-start-menu__trigger-icon" src={assetUrl("logo.png")} alt="" aria-hidden="true" />
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

// Pixel icon per menu item (see ui/icons.jsx).
const MENU_ICONS = {
  canvas: Canvas,
  notes: Notes,
  checklist: ListChecks,
  table: Table2,
  text: Type,
  "paper-note": NotebookText,
  rack: Archive,
  import: Import,
  link: Link2,
  sticky: StickyNote,
  calendar: CalendarDays,
  deadline: Timer,
  progress: Progress,
  weather: CloudSun,
  counter: Hash,
  code: Code,
  image: Image,
};

function MenuIcon({ icon }) {
  const Icon = MENU_ICONS[icon];
  return Icon ? <Icon size={16} aria-hidden="true" /> : null;
}
