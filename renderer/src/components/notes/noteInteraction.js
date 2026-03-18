export const NOTE_INLINE_EDIT_ZOOM_THRESHOLD = 0.9;
export const NOTE_MAGNIFY_ZOOM_THRESHOLD = 0.55;

export function getTextNoteInteraction(viewportZoom, isMagnified = false) {
  if (isMagnified) {
    return {
      canEdit: true,
      canMagnify: false,
      dragMode: "none",
      mode: "magnified",
    };
  }

  const canEdit = viewportZoom >= NOTE_INLINE_EDIT_ZOOM_THRESHOLD;

  return {
    canEdit,
    canMagnify: viewportZoom <= NOTE_MAGNIFY_ZOOM_THRESHOLD,
    dragMode: canEdit ? "header" : "surface",
    mode: canEdit ? "edit" : "preview",
  };
}
