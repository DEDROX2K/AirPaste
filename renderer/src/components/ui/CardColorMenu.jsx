import { CARD_COLORS, setCardColor, useCardColors } from "../../lib/cardColors";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "./context-menu";

// Right-click a card or row to mark it with a colour. Wrap the element
// (it must be a single DOM element); it gets data-card-color="<id>" while
// marked, which the stylesheet turns into a tint.
export function CardColorMenu({ itemKey, children, extraItems = null }) {
  const colors = useCardColors();
  const current = colors[itemKey] ?? null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild data-card-color={current ?? undefined}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="card-color-menu" onClick={(event) => event.stopPropagation()}>
        <ContextMenuLabel>Mark with colour</ContextMenuLabel>
        <div className="card-color-menu__row" role="group" aria-label="Colour">
          <ContextMenuItem
            className={`card-color-menu__swatch card-color-menu__swatch--none${current ? "" : " is-active"}`}
            aria-label="No colour"
            title="No colour"
            onSelect={() => setCardColor(itemKey, null)}
          />
          {CARD_COLORS.map((color) => (
            <ContextMenuItem
              key={color.id}
              className={`card-color-menu__swatch${current === color.id ? " is-active" : ""}`}
              style={{ "--swatch": color.swatch }}
              aria-label={color.label}
              title={color.label}
              onSelect={() => setCardColor(itemKey, color.id)}
            />
          ))}
        </div>
        {extraItems}
      </ContextMenuContent>
    </ContextMenu>
  );
}
