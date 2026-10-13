# AirPaste: Product Vision & Gap

## Status

Captured from a conversation on 2026-10-13. This is a reference document, not a plan — the next step is to turn this into a step-by-step game plan, tile by tile, once priorities are decided. Nothing here is scoped or scheduled yet.

## What AirPaste is actually meant to be

Not a mymind clone. The original framing ("Mymind clone done way long back") undersold the goal. The real target:

- A **local-first "save everything" tool**, like mymind, where every saved thing (link, file, note, idea) gets its own rich, custom-designed visual treatment instead of a generic card.
- With the **writing/storage depth of Obsidian** — a real place to write up and organize thoughts, not just clip things.
- **Local-first was a deliberate choice for performance**, not just privacy/ownership: running locally means the app can draw directly on the PC's own processing power to drive rich, custom per-tile rendering, instead of being constrained by what a web app / hosted backend can afford to push to a browser.
- The person building this is a **designer** — the intent is to design custom UI for each content type personally, not reuse generic components. "Optimization" in this project specifically means: make the app fast enough to support that richness, not just make existing simple UI faster.

## The actual gap (not UI/UX polish — a product gap)

Every tile currently does **one thing**, functionally, with minimal UI:

- Example called out directly: the text tool creates a text box you can write in. That's the entire feature. "Which is sad and that is all I have implemented."
- The person's own assessment: this "came out terrible," and the app overall is "nowhere near a competitor for Mymind."
- This applies broadly, not just to text: the tiles documented in [TILE_BOOK.md](./TILE_BOOK.md) are functionally real (checklist, calendar, counter, deadline, table, code, rack, etc.) but are implemented at prototype-level visual depth, not the rich, custom, product-grade UI the vision calls for.

In other words: the earlier engineering assessment (god-files, no tests, fake search bar, schema-versioning bug) was about **code health**. This is a separate, higher-level gap about **product depth and visual quality per tile type** — and it's the more important one to the person's actual goal.

## What's explicitly needed next

- A **step-by-step plan**, not an all-at-once redesign. Direct quote: "These are all too much so I think first we need to go step - step lets make a plan."
- The plan needs to cover, per tile type: what it does today (prototype) vs. what it should look/feel like (rich, custom, mymind-grade), and in what order to tackle them.
- Performance work ("optimization") and UI richness work are linked, not sequential afterthoughts — richer per-tile rendering is exactly what the local-first architecture is supposed to make affordable. Any plan needs to account for this together, not treat polish as a final coat of paint after the "real" engineering work.

## Open questions to resolve when building the actual plan

These weren't answered yet — surface them at the start of the planning session rather than assuming:

1. **Which tile(s) go first?** Most-used, most visible on open, or easiest to get a strong win on (to build momentum/prove the direction)?
2. **Shared shell vs. one-off redesigns** — does each tile get bespoke UI work independently, or is there a shared "rich tile" presentation layer/pattern worth building once (card chrome, motion, hover states, etc.) that every tile then uses?
3. **Reference points** — specific mymind interactions/visuals the person wants to match or beat, and specific Obsidian writing/organization features they want preserved, so the redesign has concrete targets instead of "make it nicer."
4. **How this reprioritizes the existing incremental rewrite plan** (see `.claude/plans/` history this session) — that plan sequences foundation work (tests, decomposition, search index) before a UI/UX/performance polish phase at the very end. This product-vision gap suggests the per-tile UI depth work may need to move up in priority relative to that plan, or run in parallel — worth an explicit decision rather than letting it default to "last."

## Why this document exists

So this context isn't lost between sessions: the person wants to come back to this specific framing (rich custom UI per tile, local-first for performance headroom, step-by-step execution) and build the real plan from it, rather than re-explaining the vision from scratch.
