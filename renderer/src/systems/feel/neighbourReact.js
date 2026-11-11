// Hover neighbours: point at a card and the cards around it lean away a few
// px, then settle back. One delegated listener for the whole app, no React
// state and no frame loop: it only does work when the hovered card changes
// (one measure of that group's cards, then a short Web Animation per card
// that moves). Animating the `translate` property keeps it out of the way of
// each card's own transform and transitions.
//
// Opt a group in with data-nb-group on its container (its direct children
// are the cards), or add a entry to GROUPS below (the canvas has its own,
// much milder one).

export const NEIGHBOUR = Object.freeze({
  PUSH_PX: 5,
  RANGE_PX: 200,
  IN_MS: 260,
  OUT_MS: 340,
  EASING: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  MAX_GROUP_ITEMS: 160,
});

// How a group finds its cards: `selector` matches the container, `items`
// lists its cards, `itemFor` maps a hovered element to its card.
function directChild(target, group) {
  let item = target;

  while (item && item.parentElement !== group) {
    item = item.parentElement;
  }

  return item;
}

const GROUPS = [
  {
    selector: "[data-nb-group], .ap-home-grid, .ap-home-dome-list, .masonry-grid",
    items: (group) => [...group.children],
    itemFor: directChild,
    push: NEIGHBOUR.PUSH_PX,
    range: NEIGHBOUR.RANGE_PX,
    max: NEIGHBOUR.MAX_GROUP_ITEMS,
  },
  {
    // Canvas tiles: the same, but a whisper (2px) and closer in.
    selector: ".canvas__content",
    items: (group) => [...group.querySelectorAll(":scope > [data-tether-tile] > .card")],
    itemFor: (target) => target.closest("[data-tether-tile]")?.querySelector(":scope > .card") ?? null,
    push: 2,
    range: 170,
    max: 300,
  },
];

function findGroup(target) {
  for (const config of GROUPS) {
    const group = target.closest?.(config.selector) ?? null;

    if (group) {
      return { config, group };
    }
  }

  return null;
}

// Push for each rect away from rects[hoveredIndex]: up to PUSH_PX for a
// touching neighbour, fading to nothing at RANGE_PX of gap. Pure, in screen
// px. Returns [{ x, y }] aligned with `rects`.
export function getNeighbourOffsets(rects, hoveredIndex, { push = NEIGHBOUR.PUSH_PX, range = NEIGHBOUR.RANGE_PX } = {}) {
  const hovered = rects[hoveredIndex];

  return rects.map((rect, index) => {
    if (!hovered || index === hoveredIndex) {
      return { x: 0, y: 0 };
    }

    const dx = (rect.left + rect.width / 2) - (hovered.left + hovered.width / 2);
    const dy = (rect.top + rect.height / 2) - (hovered.top + hovered.height / 2);
    const gapX = Math.max(0, Math.abs(dx) - (rect.width + hovered.width) / 2);
    const gapY = Math.max(0, Math.abs(dy) - (rect.height + hovered.height) / 2);
    const gap = Math.hypot(gapX, gapY);

    if (gap >= range) {
      return { x: 0, y: 0 };
    }

    const distance = Math.hypot(dx, dy) || 1;
    const strength = (1 - gap / range) ** 2 * push;
    return { x: (dx / distance) * strength, y: (dy / distance) * strength };
  });
}

function readTranslate(element) {
  const value = getComputedStyle(element).translate;
  return !value || value === "none" ? "0px 0px" : value;
}

function moveTo(element, x, y) {
  const previous = element.__nbAnimation ?? null;
  const rest = Math.abs(x) < 0.05 && Math.abs(y) < 0.05;

  if (rest && !previous) {
    return;
  }

  const from = readTranslate(element);
  const to = rest ? "0px 0px" : `${x.toFixed(2)}px ${y.toFixed(2)}px`;

  if (from === to) {
    return;
  }

  const animation = element.animate(
    [{ translate: from }, { translate: to }],
    { duration: rest ? NEIGHBOUR.OUT_MS : NEIGHBOUR.IN_MS, easing: NEIGHBOUR.EASING, fill: "forwards" },
  );
  previous?.cancel();

  if (rest) {
    // Back home: drop the animation once it has landed, leaving no styles.
    animation.onfinish = () => {
      animation.cancel();

      if (element.__nbAnimation === animation) {
        element.__nbAnimation = null;
      }
    };
  }

  element.__nbAnimation = animation;
}

// Installs the listener once; returns the cleanup.
export function installNeighbourReact(root = document) {
  if (typeof window === "undefined" || typeof root.addEventListener !== "function") {
    return () => {};
  }

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let activeGroup = null;
  let activeItem = null;
  let affected = [];

  function settle() {
    affected.forEach((element) => moveTo(element, 0, 0));
    affected = [];
    activeGroup = null;
    activeItem = null;
  }

  function handleOver(event) {
    if (event.pointerType === "touch" || event.buttons !== 0 || reduceMotion?.matches) {
      return;
    }

    const found = findGroup(event.target);

    if (!found || found.group.hasAttribute("data-nb-off")) {
      if (activeGroup) {
        settle();
      }
      return;
    }

    const { config, group } = found;
    const item = config.itemFor(event.target, group);

    if (!item || item === activeItem) {
      return;
    }

    if (activeGroup && activeGroup !== group) {
      settle();
    }

    const items = config.items(group);

    if (items.length < 2 || items.length > config.max) {
      return;
    }

    activeGroup = group;
    activeItem = item;
    const rects = items.map((element) => element.getBoundingClientRect());
    const offsets = getNeighbourOffsets(rects, items.indexOf(item), { push: config.push, range: config.range });
    const nextAffected = [];

    items.forEach((element, index) => {
      if (element === item) {
        moveTo(element, 0, 0);
        return;
      }

      moveTo(element, offsets[index].x, offsets[index].y);

      if (offsets[index].x !== 0 || offsets[index].y !== 0) {
        nextAffected.push(element);
      }
    });

    // Anything that was leaning and no longer is, goes home.
    affected.forEach((element) => {
      if (!nextAffected.includes(element)) {
        moveTo(element, 0, 0);
      }
    });
    affected = nextAffected;
  }

  function handleLeave(event) {
    if (!activeGroup) {
      return;
    }

    const next = event.relatedTarget;

    if (!next || !activeGroup.contains(next)) {
      settle();
    }
  }

  function handleDown() {
    // A press (start of a drag or click) ends the hover reaction.
    if (activeGroup) {
      settle();
    }
  }

  root.addEventListener("pointerover", handleOver, true);
  root.addEventListener("pointerout", handleLeave, true);
  root.addEventListener("pointerdown", handleDown, true);

  return () => {
    root.removeEventListener("pointerover", handleOver, true);
    root.removeEventListener("pointerout", handleLeave, true);
    root.removeEventListener("pointerdown", handleDown, true);
    settle();
  };
}
