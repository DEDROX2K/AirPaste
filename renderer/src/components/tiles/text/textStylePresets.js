export const textStylePresets = Object.freeze({
  simple: {
    id: "simple",
    label: "Simple",
  },
  bookish: {
    id: "bookish",
    label: "Bookish",
  },
  technical: {
    id: "technical",
    label: "Technical",
  },
  scribbled: {
    id: "scribbled",
    label: "Scribbled",
  },
});

export const textStylePresetOptions = Object.freeze(
  Object.values(textStylePresets).map((preset) => ({
    value: preset.id,
    label: preset.label,
  })),
);
