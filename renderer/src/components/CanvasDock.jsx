const DOCK_ITEMS = [
  { id: "sticky-note", label: "Sticky note", src: "icons/stickeynote.png", actionKey: "createNoteOne" },
  { id: "todo", label: "Todo", src: "icons/todo.png", actionKey: "createNoteTwo" },
  { id: "paper", label: "Paper", src: "icons/paper.png", actionKey: "createNoteThree" },
  { id: "folder", label: "Folder", src: "icons/folder.png", actionKey: "createFolderTile" },
  { id: "separator", type: "separator", src: "icons/rope.png", label: "Divider" },
  { id: "rack", label: "Rack", src: "icons/stamp.png", actionKey: "createRack" },
  { id: "caution-tape", label: "Caution tape", src: "icons/cautiontape.png" },
  { id: "highlighter", label: "Highlighter", src: "icons/highlighter.png" },
  { id: "link", label: "Link", src: "icons/link.png" },
  { id: "notification", label: "Notification", src: "icons/notification.png" },
  { id: "pencil", label: "Pencil", src: "icons/pencil.png" },
];

export default function CanvasDock({ commands }) {
  const resolveIconPath = (relativePath) => `${import.meta.env.BASE_URL}${relativePath}`;

  return (
    <div className="note-dock" aria-label="Canvas tools">
      {DOCK_ITEMS.map((item) => {
        if (item.type === "separator") {
          return (
            <span key={item.id} className="note-dock__separator" aria-hidden="true">
              <img className="note-dock__separator-image" src={resolveIconPath(item.src)} alt="" draggable={false} />
            </span>
          );
        }

        const action = item.actionKey ? commands[item.actionKey] : undefined;

        return (
          <button
            key={item.id}
            id={`note-dock-${item.id}`}
            className={`note-dock__item${action ? "" : " note-dock__item--placeholder"}`}
            type="button"
            title={item.label}
            onClick={action}
          >
            <span className="note-dock__tooltip">{item.label}</span>
            <span className="note-dock__icon" aria-hidden="true">
              <img className="note-dock__icon-image" src={resolveIconPath(item.src)} alt="" draggable={false} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
