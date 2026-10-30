import AmazonProductTile from "../components/tiles/AmazonProductTile";
import CanvasTextTile from "../components/tiles/CanvasTextTile";
import CalendarTile from "../components/tiles/CalendarTile";
import ChecklistTile from "../components/tiles/ChecklistTile";
import CodeSnippetTile from "../components/tiles/CodeSnippetTile";
import CounterTile from "../components/tiles/CounterTile";
import DeadlineTile from "../components/tiles/DeadlineTile";
import FileTile from "../components/tiles/FileTile";
import GitHubRepoTile from "../components/tiles/GitHubRepoTile";
import LinkTile from "../components/tiles/LinkTile";
import PaperNoteTile from "../components/tiles/PaperNoteTile";
import ProgressTile from "../components/tiles/ProgressTile";
import RackTile from "../components/tiles/RackTile";
import StickyNoteTile from "../components/tiles/StickyNoteTile";
import NotedLinkTile from "../components/tiles/NotedLinkTile";
import StickyCodeFileTile from "../components/tiles/StickyCodeFileTile";
import StickyFolderTile from "../components/tiles/StickyFolderTile";
import StickyTile from "../components/tiles/StickyTile";
import TableTile from "../components/tiles/TableTile";
import TextBoxTile from "../components/tiles/TextBoxTile";
import WeatherTile from "../components/tiles/WeatherTile";
import {
  CANVAS_TEXT_FORMAT_PLAIN,
  CANVAS_TEXT_SOURCE_FILE,
  CANVAS_TEXT_VARIANT_STICKY,
} from "../lib/canvasText";
import TILE_TYPES from "./tileTypes";
import validateTileRegistry from "./validateTileRegistry";
import { isLinkNoteOpen } from "./link/notedLink";
import { STICKY_DESIGN_CODE_FILE, STICKY_DESIGN_FOLDER, getFileCardCodeLanguageId } from "./sticky/model";

function createPlaceholderTile(displayName) {
  function PlaceholderTile() {
    return null;
  }

  PlaceholderTile.displayName = `${displayName.replace(/\s+/g, "")}Tile`;
  return PlaceholderTile;
}

const NodeGroupTile = createPlaceholderTile("Node Group");
const GameTile = createPlaceholderTile("Game");
const Model3DTile = createPlaceholderTile("3D Model");
const PhysicsItemTile = createPlaceholderTile("Physics Item");

// NOTE: this is the one canonical tile type -> component registry. It used
// to be duplicated across this file and components/tiles/tileRegistry.js,
// which had drifted apart (the other copy was the one actually wired into
// rendering via Card.jsx; this file's `defaultSize`/`capabilities` fields
// were unused dead metadata that had gone stale -- e.g. its Calendar and
// Deadline sizes, and all three canvas-text-family sizes, no longer matched
// the real defaults in lib/workspace.js's getCardSize/defaultTextCardSize).
// Rather than carry that stale data forward, sizing stays owned solely by
// lib/workspace.js; this registry only tracks what's safe to track without
// a second source of truth: display metadata and component resolution.
const tileRegistry = {
  [TILE_TYPES.FILE]: {
    type: TILE_TYPES.FILE,
    displayName: "File Tile",
    status: "stable",
    Component: FileTile,
  },
  [TILE_TYPES.LINK]: {
    type: TILE_TYPES.LINK,
    displayName: "Link Tile",
    status: "stable",
    Component: LinkTile,
  },
  [TILE_TYPES.AMAZON_PRODUCT]: {
    type: TILE_TYPES.AMAZON_PRODUCT,
    displayName: "Amazon Product Tile",
    status: "stable",
    Component: AmazonProductTile,
  },
  [TILE_TYPES.GITHUB_REPO]: {
    type: TILE_TYPES.GITHUB_REPO,
    displayName: "GitHub Repo Tile",
    status: "stable",
    Component: GitHubRepoTile,
  },
  [TILE_TYPES.WEATHER]: {
    type: TILE_TYPES.WEATHER,
    displayName: "Weather Tile",
    status: "stable",
    Component: WeatherTile,
  },
  [TILE_TYPES.CALENDAR]: {
    type: TILE_TYPES.CALENDAR,
    displayName: "Calendar Tile",
    status: "stable",
    Component: CalendarTile,
  },
  [TILE_TYPES.CHECKLIST]: {
    type: TILE_TYPES.CHECKLIST,
    displayName: "Checklist Tile",
    status: "stable",
    Component: ChecklistTile,
  },
  [TILE_TYPES.CODE]: {
    type: TILE_TYPES.CODE,
    displayName: "Code Snippet Tile",
    status: "stable",
    Component: CodeSnippetTile,
  },
  [TILE_TYPES.COUNTER]: {
    type: TILE_TYPES.COUNTER,
    displayName: "Counter Tile",
    status: "stable",
    Component: CounterTile,
  },
  [TILE_TYPES.DEADLINE]: {
    type: TILE_TYPES.DEADLINE,
    displayName: "Deadline Countdown Tile",
    status: "stable",
    Component: DeadlineTile,
  },
  [TILE_TYPES.CANVAS_TEXT]: {
    type: TILE_TYPES.CANVAS_TEXT,
    displayName: "Canvas Text Tile",
    status: "stable",
    Component: CanvasTextTile,
  },
  [TILE_TYPES.NOTE]: {
    type: TILE_TYPES.NOTE,
    displayName: "Note Tile",
    status: "stable",
    Component: CanvasTextTile,
  },
  [TILE_TYPES.TABLE]: {
    type: TILE_TYPES.TABLE,
    displayName: "Table Tile",
    status: "stable",
    Component: TableTile,
  },
  [TILE_TYPES.TEXT_BOX]: {
    type: TILE_TYPES.TEXT_BOX,
    displayName: "Canvas Text Box Tile",
    status: "stable",
    Component: CanvasTextTile,
  },
  [TILE_TYPES.PROGRESS]: {
    type: TILE_TYPES.PROGRESS,
    displayName: "Progress Bar Tile",
    status: "stable",
    Component: ProgressTile,
  },
  [TILE_TYPES.RACK]: {
    type: TILE_TYPES.RACK,
    displayName: "Rack Tile",
    status: "stable",
    Component: RackTile,
  },
  [TILE_TYPES.PAPER_NOTE]: {
    type: TILE_TYPES.PAPER_NOTE,
    displayName: "Paper Note Tile",
    status: "stable",
    Component: PaperNoteTile,
  },
  [TILE_TYPES.NODE_GROUP]: {
    type: TILE_TYPES.NODE_GROUP,
    displayName: "Node Group Tile",
    status: "planned",
    Component: NodeGroupTile,
  },
  [TILE_TYPES.GAME]: {
    type: TILE_TYPES.GAME,
    displayName: "Game Tile",
    status: "planned",
    Component: GameTile,
  },
  [TILE_TYPES.MODEL_3D]: {
    type: TILE_TYPES.MODEL_3D,
    displayName: "3D Model Tile",
    status: "planned",
    Component: Model3DTile,
  },
  [TILE_TYPES.PHYSICS_ITEM]: {
    type: TILE_TYPES.PHYSICS_ITEM,
    displayName: "Physics Item Tile",
    status: "planned",
    Component: PhysicsItemTile,
  },
};

if (import.meta.env.DEV) {
  validateTileRegistry(tileRegistry);
}

// Local stickies other than the classic one, by sticky.design.
const STICKY_DESIGN_COMPONENTS = {
  [STICKY_DESIGN_FOLDER]: StickyFolderTile,
  [STICKY_DESIGN_CODE_FILE]: StickyCodeFileTile,
};

// Resolves the component for an actual card instance, not just its type:
// the canvas-text family (canvas-text/note/text-box) renders one of three
// different components depending on the card's variant/format/source.
export function getTileRegistration(cardOrType) {
  const tileType = typeof cardOrType === "string" ? cardOrType : cardOrType?.type;

  // A link/image tile with its note open.
  if (tileType === TILE_TYPES.LINK && isLinkNoteOpen(cardOrType)) {
    return {
      ...tileRegistry[tileType],
      Component: NotedLinkTile,
    };
  }

  // An imported coding file (.html, .css, ...) uses the code-file design.
  if (tileType === TILE_TYPES.FILE && getFileCardCodeLanguageId(cardOrType) !== null) {
    return {
      ...tileRegistry[tileType],
      Component: StickyCodeFileTile,
    };
  }

  if (
    tileType === TILE_TYPES.CANVAS_TEXT
    && cardOrType?.variant === CANVAS_TEXT_VARIANT_STICKY
  ) {
    // FigJam-style sticky, or another design picked by sticky.design; the
    // older titled design stays for stickies backed by a Markdown file.
    const LocalStickyComponent = STICKY_DESIGN_COMPONENTS[cardOrType?.sticky?.design] ?? StickyTile;
    return {
      ...tileRegistry[tileType],
      Component: cardOrType?.source === CANVAS_TEXT_SOURCE_FILE ? StickyNoteTile : LocalStickyComponent,
    };
  }

  if (
    tileType === TILE_TYPES.CANVAS_TEXT
    && cardOrType?.source !== CANVAS_TEXT_SOURCE_FILE
    && cardOrType?.format === CANVAS_TEXT_FORMAT_PLAIN
  ) {
    return {
      ...tileRegistry[tileType],
      Component: TextBoxTile,
    };
  }

  return tileRegistry[tileType] ?? tileRegistry[TILE_TYPES.LINK];
}

export function getTileDefinition(tileType) {
  return tileRegistry[tileType] ?? tileRegistry[TILE_TYPES.LINK];
}

export default tileRegistry;
