import AmazonProductTile from "../components/tiles/AmazonProductTile";
import ChecklistTile from "../components/tiles/ChecklistTile";
import CodeSnippetTile from "../components/tiles/CodeSnippetTile";
import CounterTile from "../components/tiles/CounterTile";
import DeadlineTile from "../components/tiles/DeadlineTile";
import LinkTile from "../components/tiles/LinkTile";
import NoteTile from "../components/tiles/NoteTile";
import ProgressTile from "../components/tiles/ProgressTile";
import RackTile from "../components/tiles/RackTile";
import TableTile from "../components/tiles/TableTile";
import TextBoxTile from "../components/tiles/TextBoxTile";
import TILE_TYPES from "./tileTypes";
import validateTileRegistry from "./validateTileRegistry";

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

const tileRegistry = {
  [TILE_TYPES.LINK]: {
    type: TILE_TYPES.LINK,
    displayName: "Link Tile",
    status: "stable",
    component: LinkTile,
    defaultSize: { width: 340, height: 280 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: false,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.AMAZON_PRODUCT]: {
    type: TILE_TYPES.AMAZON_PRODUCT,
    displayName: "Amazon Product Tile",
    status: "stable",
    component: AmazonProductTile,
    defaultSize: { width: 340, height: 388 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: false,
      container: false,
      navigation: true,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.CHECKLIST]: {
    type: TILE_TYPES.CHECKLIST,
    displayName: "Checklist Tile",
    status: "stable",
    component: ChecklistTile,
    defaultSize: { width: 380, height: 360 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.CODE]: {
    type: TILE_TYPES.CODE,
    displayName: "Code Snippet Tile",
    status: "stable",
    component: CodeSnippetTile,
    defaultSize: { width: 520, height: 360 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.COUNTER]: {
    type: TILE_TYPES.COUNTER,
    displayName: "Counter Tile",
    status: "stable",
    component: CounterTile,
    defaultSize: { width: 360, height: 300 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.DEADLINE]: {
    type: TILE_TYPES.DEADLINE,
    displayName: "Deadline Countdown Tile",
    status: "stable",
    component: DeadlineTile,
    defaultSize: { width: 400, height: 320 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.NOTE]: {
    type: TILE_TYPES.NOTE,
    displayName: "Note Tile",
    status: "stable",
    component: NoteTile,
    defaultSize: { width: 460, height: 420 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.TABLE]: {
    type: TILE_TYPES.TABLE,
    displayName: "Table Tile",
    status: "stable",
    component: TableTile,
    defaultSize: { width: 560, height: 360 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.TEXT_BOX]: {
    type: TILE_TYPES.TEXT_BOX,
    displayName: "Canvas Text Box Tile",
    status: "stable",
    component: TextBoxTile,
    defaultSize: { width: 520, height: 180 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: true,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.PROGRESS]: {
    type: TILE_TYPES.PROGRESS,
    displayName: "Progress Bar Tile",
    status: "stable",
    component: ProgressTile,
    defaultSize: { width: 400, height: 280 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.RACK]: {
    type: TILE_TYPES.RACK,
    displayName: "Rack Tile",
    status: "stable",
    component: RackTile,
    defaultSize: { width: 836, height: 126 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: false,
      editable: false,
      container: true,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.NODE_GROUP]: {
    type: TILE_TYPES.NODE_GROUP,
    displayName: "Node Group Tile",
    status: "planned",
    component: NodeGroupTile,
    defaultSize: { width: 420, height: 280 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: true,
      editable: true,
      container: true,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [TILE_TYPES.GAME]: {
    type: TILE_TYPES.GAME,
    displayName: "Game Tile",
    status: "planned",
    component: GameTile,
    defaultSize: { width: 480, height: 320 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: true,
      editable: false,
      container: false,
      navigation: false,
      physics: false,
      lazy: true,
    },
  },
  [TILE_TYPES.MODEL_3D]: {
    type: TILE_TYPES.MODEL_3D,
    displayName: "3D Model Tile",
    status: "planned",
    component: Model3DTile,
    defaultSize: { width: 480, height: 320 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: true,
      editable: false,
      container: false,
      navigation: false,
      physics: false,
      lazy: true,
    },
  },
  [TILE_TYPES.PHYSICS_ITEM]: {
    type: TILE_TYPES.PHYSICS_ITEM,
    displayName: "Physics Item Tile",
    status: "planned",
    component: PhysicsItemTile,
    defaultSize: { width: 240, height: 240 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: true,
      editable: false,
      container: false,
      navigation: false,
      physics: true,
      lazy: true,
    },
  },
};

if (import.meta.env.DEV) {
  validateTileRegistry(tileRegistry);
}

export function getTileDefinition(tileType) {
  return tileRegistry[tileType] ?? tileRegistry[TILE_TYPES.LINK];
}

export default tileRegistry;
