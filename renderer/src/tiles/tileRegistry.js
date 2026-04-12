import AmazonProductTile from "../components/tiles/AmazonProductTile";
import LinkTile from "../components/tiles/LinkTile";
import RackTile from "../components/tiles/RackTile";
import TILE_TYPES from "./tileTypes";
import validateTileRegistry from "./validateTileRegistry";

function createPlaceholderTile(displayName) {
  function PlaceholderTile() {
    return null;
  }

  PlaceholderTile.displayName = `${displayName.replace(/\s+/g, "")}Tile`;
  return PlaceholderTile;
}

const PageLinkTile = createPlaceholderTile("Page Link");
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
  [TILE_TYPES.PAGE_LINK]: {
    type: TILE_TYPES.PAGE_LINK,
    displayName: "Page Link Tile",
    status: "planned",
    component: PageLinkTile,
    defaultSize: { width: 280, height: 180 },
    capabilities: {
      draggable: true,
      selectable: true,
      resizable: true,
      editable: true,
      container: false,
      navigation: true,
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
