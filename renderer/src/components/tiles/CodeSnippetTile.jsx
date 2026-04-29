import { memo, useMemo, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { renderCodeSyntax } from "../../lib/renderCodeSyntax";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

const CODE_LANGUAGES = [
  "plain",
  "bash",
  "javascript",
  "typescript",
  "json",
  "css",
  "html",
  "sql",
  "regex",
  "python",
  "markdown",
  "yaml",
];

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(input);
  }
}

function CodeSnippetTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
}) {
  const { updateExistingCard } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const highlightedLines = useMemo(
    () => renderCodeSyntax(card.language, card.code ?? ""),
    [card.code, card.language],
  );
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const updateCodeTile = (patch) => {
    updateExistingCard(card.id, patch);
  };

  const handleCodeKeyDown = (event) => {
    stopInteractiveKey(event);

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      setIsEditing((current) => !current);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsEditing(false);
    }
  };

  const handleCopyCode = async () => {
    await copyTextToClipboard(card.code ?? "");
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--code"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section className="card__surface card__surface--code" aria-label={card.title || "Code snippet"}>
            <header className="card__code-header">
              <input
                className="card__code-title"
                type="text"
                value={card.title ?? ""}
                placeholder="Untitled snippet"
                aria-label="Code snippet title"
                onPointerDown={stopInteractivePointer}
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateCodeTile({ title: event.target.value })}
              />
              <div className="card__code-toolbar" onPointerDown={stopInteractivePointer}>
                <select
                  className="card__code-language-select"
                  value={card.language ?? "plain"}
                  aria-label="Code snippet language"
                  onKeyDown={stopInteractiveKey}
                  onChange={(event) => updateCodeTile({ language: event.target.value })}
                >
                  {CODE_LANGUAGES.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`card__code-toggle${card.wrap ? " card__code-toggle--active" : ""}`}
                  onClick={() => updateCodeTile({ wrap: !card.wrap })}
                >
                  Wrap
                </button>
                <button
                  type="button"
                  className={`card__code-toggle${card.showLineNumbers ? " card__code-toggle--active" : ""}`}
                  onClick={() => updateCodeTile({ showLineNumbers: !card.showLineNumbers })}
                >
                  Lines
                </button>
                <button
                  type="button"
                  className="card__code-copy"
                  onClick={() => { void handleCopyCode(); }}
                >
                  Copy Code
                </button>
              </div>
            </header>

            <div className={`card__code-body-shell${card.wrap ? " card__code-body-shell--wrap" : ""}`} onPointerDown={stopInteractivePointer}>
              {isEditing ? (
                <textarea
                  className={`card__code-editor${card.wrap ? " card__code-editor--wrap" : ""}`}
                  value={card.code ?? ""}
                  placeholder="Paste terminal commands, SQL, regex, or helpers here."
                  aria-label="Code snippet body"
                  spellCheck={false}
                  onBlur={() => setIsEditing(false)}
                  onKeyDown={handleCodeKeyDown}
                  onChange={(event) => updateCodeTile({ code: event.target.value })}
                />
              ) : (
                <button
                  type="button"
                  className={`card__code-preview${card.wrap ? " card__code-preview--wrap" : ""}`}
                  onClick={() => setIsEditing(true)}
                  onKeyDown={handleCodeKeyDown}
                >
                  <div className="card__code-grid" role="presentation">
                    {highlightedLines.map((line) => (
                      <div
                        key={`${card.id}-line-${line.lineNumber}`}
                        className={`card__code-line${card.showLineNumbers ? "" : " card__code-line--no-numbers"}`}
                      >
                        {card.showLineNumbers ? (
                          <span className="card__code-line-number">{line.lineNumber}</span>
                        ) : null}
                        <span className="card__code-line-content">{line.content}</span>
                      </div>
                    ))}
                  </div>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(CodeSnippetTile);
