import { desktop } from "./desktop";

// App colour theme: the window base (the grey around Home and the canvas card)
// and the accent colour, picked from the flower picker in the Home sidebar.
//
// A theme is { hue, tone, intensity }:
//   hue        0-360, or null for the default grey
//   tone       "vivid" (outer petals) or "pastel" (inner petals)
//   intensity  0-1 from the arc slider: 0 = soft and light, 1 = deep and
//              fully saturated (high contrast)
//
// Applied as custom properties on <html>, so every stylesheet reading
// --ap-shell-base / --ap-accent-* picks it up with no re-render.

const STORAGE_KEY = "airpaste-app-theme";

export const DEFAULT_INTENSITY = 0.4;
export const INTENSITY_DETENTS = [0, 0.2, 0.4, 0.6, 0.8, 1];
export const DEFAULT_THEME = Object.freeze({ hue: null, tone: "vivid", intensity: DEFAULT_INTENSITY });

const listeners = new Set();
let current = loadTheme();

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : DEFAULT_INTENSITY));
}

export function normalizeTheme(raw) {
  const hue = Number.isFinite(raw?.hue) ? ((raw.hue % 360) + 360) % 360 : null;
  return {
    hue,
    tone: raw?.tone === "pastel" ? "pastel" : "vivid",
    intensity: clamp01(raw?.intensity),
  };
}

function loadTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeTheme(JSON.parse(stored)) : { ...DEFAULT_THEME };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

function hsl(h, s, l, a = 1) {
  return a === 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;
}

// Relative luminance of an HSL colour (0-1), to pick legible text on it.
function luminance(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
}

// The base colour the window shows for a theme, as { h, s, l }.
export function themeBase(theme) {
  const t = theme.intensity;
  if (theme.hue == null) {
    // Default grey (#b0b0b0 ≈ 69% at the default intensity), darker as it rises.
    return { h: 0, s: 0, l: Math.round(85 - t * 40) };
  }
  if (theme.tone === "pastel") {
    return { h: theme.hue, s: Math.round(18 + t * 62), l: Math.round(88 - t * 30) };
  }
  return { h: theme.hue, s: Math.round(20 + t * 80), l: Math.round(80 - t * 38) };
}

export function themeBaseCss(theme) {
  const { h, s, l } = themeBase(theme);
  return hsl(h, s, l);
}

// Every custom property the theme writes on <html>, so switching back to
// the default grey can remove exactly those.
const appliedVars = new Set();

// Bare "h s% l%" triple, for the Tailwind tokens in index.css that are
// read as hsl(var(--x)).
function triple(h, s, l) {
  return `${h} ${s}% ${l}%`;
}

function themeVars(theme, base) {
  const t = theme.intensity;
  const h = theme.hue;
  const s = Math.round(60 + t * 40);
  const l = Math.round(46 - t * 10);
  const ss = Math.round(35 + t * 55); // surface saturation
  const ts = Math.round(22 + t * 40); // text / line saturation
  const r = Math.round;

  const surface = r(97 - t * 12);
  const panel = r(94 - t * 14);
  const menu = r(99 - t * 8);
  const hover = r(92 - t * 12);
  const active = r(87 - t * 14);
  const line = r(84 - t * 12);

  return {
    // Accent
    "--ap-accent-bg": hsl(h, s, l),
    "--ap-accent-bg-hover": hsl(h, s, l - 5),
    "--ap-accent-bg-active": hsl(h, s, l - 10),
    "--ap-accent-tint": hsl(h, s, l, 0.12),
    "--ap-accent-tint-hover": hsl(h, s, l, 0.2),
    "--ap-border-accent": hsl(h, s, l, 0.55),
    "--ap-text-accent": hsl(h, s, Math.min(l, 40)),
    "--ap-icon-accent": hsl(h, s, Math.min(l, 40)),
    "--ap-theme-accent": hsl(h, s, l),

    // Theme surfaces (read by design/appTheme.css)
    "--ap-theme-surface": hsl(h, ss, surface),
    "--ap-theme-panel": hsl(h, ss, panel),
    "--ap-theme-menu": hsl(h, ss, menu),
    "--ap-theme-panel-edge": hsl(h, r(30 + t * 40), r(80 - t * 14), 0.7),
    "--ap-theme-grid": hsl(h, r(25 + t * 45), r(82 - t * 16)),
    "--ap-theme-ink": hsl(h, r(70 + t * 30), r(32 - t * 8)),
    "--ap-theme-tint": hsl(h, s, l, 0.1 + t * 0.06),
    "--ap-theme-tint-strong": hsl(h, s, l, 0.2 + t * 0.1),
    "--ap-theme-control": hsl(base.h, base.s, Math.min(92, base.l + 10)),
    "--ap-theme-control-edge": hsl(base.h, base.s, Math.max(12, base.l - 18), 0.6),

    // Shared design tokens (design/theme.css): text, icons, lines, hover,
    // surfaces. Tiles reset these to the originals (design/appTheme.css).
    "--ap-text-primary": hsl(h, ts, 12),
    "--ap-text-secondary": hsl(h, ts, r(36 - t * 6)),
    "--ap-text-tertiary": hsl(h, ts, r(50 - t * 8)),
    "--ap-text-placeholder": hsl(h, ts, r(62 - t * 8)),
    "--ap-text-disabled": hsl(h, ts, r(76 - t * 8)),
    "--ap-icon-default": hsl(h, ts, 24),
    "--ap-icon-muted": hsl(h, ts, r(38 - t * 6)),
    "--ap-border-subtle": hsl(h, ts, 30, 0.1),
    "--ap-border-default": hsl(h, ts, 30, 0.16),
    "--ap-border-strong": hsl(h, ts, 30, 0.28),
    "--ap-border-focus": hsl(h, s, l, 0.5),
    "--ap-interactive-bg-hover": hsl(h, s, l, 0.1 + t * 0.05),
    "--ap-interactive-bg-active": hsl(h, s, l, 0.18 + t * 0.08),
    "--ap-bg-page": hsl(h, ss, surface),
    "--ap-bg-base": hsl(h, ss, panel),
    "--ap-bg-sunken": hsl(h, ss, r(88 - t * 14)),
    "--ap-surface-default": hsl(h, ss, menu, 0.75),
    "--ap-surface-raised": hsl(h, ss, menu, 0.9),
    "--ap-surface-overlay": hsl(h, ss, menu, 0.97),
    "--ap-surface-overlay-bg": hsl(h, ss, menu, 0.97),
    "--ap-surface-modal": hsl(h, ss, menu, 0.97),
    "--ap-surface-inset": hsl(h, ss, menu),
    "--ap-scrollbar-thumb": hsl(h, ts, 30, 0.25),
    "--ap-scrollbar-thumb-hover": hsl(h, ts, 30, 0.45),

    // Open-workspace chrome (components/SimpleUi.css)
    "--ap-simple-page": hsl(h, ss, surface),
    "--ap-simple-surface": hsl(h, ss, menu),
    "--ap-simple-subtle": hsl(h, ss, panel),
    "--ap-simple-hover": hsl(h, ss, hover),
    "--ap-simple-active": hsl(h, ss, active),
    "--ap-simple-line": hsl(h, ts, line),
    "--ap-simple-line-strong": hsl(h, ts, r(72 - t * 12)),
    "--ap-simple-ink": hsl(h, ts, 13),
    "--ap-simple-muted": hsl(h, ts, r(38 - t * 6)),

    // Tailwind tokens (index.css) used by the shared menus and dialogs
    "--popover": triple(h, ss, menu),
    "--popover-foreground": triple(h, ts, 12),
    "--foreground": triple(h, ts, 12),
    "--secondary": triple(h, ss, panel),
    "--muted": triple(h, ss, panel),
    "--muted-foreground": triple(h, ts, r(40 - t * 6)),
    "--border": triple(h, ts, line),
    "--input": triple(h, ts, line),
    "--ap-surface-shell": triple(h, ss, panel),
    "--ap-surface-panel": triple(h, ss, menu),
    "--ap-surface-menu": triple(h, ss, menu),
    "--ap-surface-dialog": triple(h, ss, menu),
    "--ap-surface-inspector": triple(h, ss, surface),
    "--ap-surface-muted": triple(h, ss, panel),
  };
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const base = themeBase(theme);
  const isDefault = theme.hue == null && theme.intensity === DEFAULT_INTENSITY;

  if (isDefault) {
    root.style.removeProperty("--ap-theme-base");
  } else {
    root.style.setProperty("--ap-theme-base", hsl(base.h, base.s, base.l));
  }

  // Text that sits straight on the base (sidebar, title bar) flips to white
  // once the base gets dark enough.
  root.dataset.shellTone = luminance(base.h, base.s, base.l) < 0.2 ? "dark" : "light";
  // The native window buttons (Windows) follow the same tone.
  desktop.window.setControlsTone?.(root.dataset.shellTone);

  if (theme.hue == null) {
    for (const name of appliedVars) root.style.removeProperty(name);
    appliedVars.clear();
    delete root.dataset.appTheme;
    return;
  }

  for (const [name, value] of Object.entries(themeVars(theme, base))) {
    root.style.setProperty(name, value);
    appliedVars.add(name);
  }
  root.dataset.appTheme = "on";
}

export function getTheme() {
  return current;
}

// `persist: false` while dragging the slider, so storage is written once on release.
export function setTheme(next, { persist = true } = {}) {
  current = normalizeTheme(next);
  applyTheme(current);
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Storage unavailable: the theme still applies for this session.
    }
  }
  for (const listener of listeners) listener(current);
}

export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Apply the saved theme as soon as this module loads (imported from main.jsx),
// so the window never flashes grey first.
applyTheme(current);
