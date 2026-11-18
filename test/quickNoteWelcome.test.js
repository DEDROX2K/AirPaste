import { describe, expect, it } from "vitest";
import {
  QUICK_NOTE_WELCOME_STORAGE_KEY,
  QUICK_NOTE_WELCOME_TEXTS,
  claimQuickNoteWelcome,
  makeWelcomeQuickNote,
} from "../renderer/src/lib/quickNote";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

describe("quick note first-run welcome", () => {
  it("is claimed only once per install", () => {
    const storage = memoryStorage();
    expect(claimQuickNoteWelcome(undefined, storage)).toBe(true);
    expect(storage.getItem(QUICK_NOTE_WELCOME_STORAGE_KEY)).toBe("true");
    expect(claimQuickNoteWelcome(undefined, storage)).toBe(false);
  });

  it("is skipped when the folder already has a saved quick note", () => {
    const storage = memoryStorage();
    expect(claimQuickNoteWelcome({ open: false, items: [] }, storage)).toBe(false);
    expect(storage.getItem(QUICK_NOTE_WELCOME_STORAGE_KEY)).toBe(null);
  });

  it("opens with the two editable starter tasks", () => {
    const note = makeWelcomeQuickNote();
    expect(note.open).toBe(true);
    expect(note.items.map((item) => item.text)).toEqual(QUICK_NOTE_WELCOME_TEXTS);
    expect(note.items.every((item) => !item.checked && item.id)).toBe(true);
  });
});
