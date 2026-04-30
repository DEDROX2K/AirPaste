# AirPaste Docs

This directory contains canonical, supporting, and historical AirPaste documentation.

## Canonical Docs

Start here for all future tile work.

- [TILE_BOOK.md](./TILE_BOOK.md)
  - Source of truth for all tile types, implemented/planned status, type IDs, UX, data models, files, diagnostics, and Testing Tiles coverage.
- [TESTING_TILES.md](./TESTING_TILES.md)
  - Source of truth for Testing Tiles as the universal QA playground.

Trust boundary:

- Future tile work should start from `docs/TILE_BOOK.md` and `docs/TESTING_TILES.md`.
- Do not use older tile docs as primary implementation guidance when they conflict with the canonical docs.

## Supporting Docs

These are useful engineering summaries and rules, but they are not the canonical inventory.

- [rules/tile-system-rules.md](./rules/tile-system-rules.md)
- [tiles/tile-capability-matrix.md](./tiles/tile-capability-matrix.md)
- [tiles/tile-integration-notes.md](./tiles/tile-integration-notes.md)

## Historical / Reference Docs

These are retained for historical context and may describe older tile models or architecture.

- [tiles/note-family-proposal.md](./tiles/note-family-proposal.md)
- [tiles/note-family-implementation-notes.md](./tiles/note-family-implementation-notes.md)
- [tiles/note-system-audit.md](./tiles/note-system-audit.md)
- [tiles/tile-registry.md](./tiles/tile-registry.md)

If you are implementing or updating tiles, prefer the canonical docs over these historical/reference documents.
