import { FOLDER_CARD_TYPE, NOTE_FOLDER_CARD_TYPE, RACK_CARD_TYPE } from "../lib/workspace";
import FolderTile from "../components/tiles/FolderTile";
import LinkTile from "../components/tiles/LinkTile";
import NoteFolderTile from "../components/tiles/NoteFolderTile";
import RackTile from "../components/tiles/RackTile";
import TextTile from "../components/tiles/TextTile";

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
  text: {
    type: "text",
    displayName: "Note Tile",
    component: TextTile,
    defaultSize: { width: 428, height: 540 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: true,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  link: {
    type: "link",
    displayName: "Link Tile",
    component: LinkTile,
    defaultSize: { width: 340, height: 280 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: false,
      container: false,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [FOLDER_CARD_TYPE]: {
    type: FOLDER_CARD_TYPE,
    displayName: "Folder Tile",
    component: FolderTile,
    defaultSize: { width: 340, height: 236 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: true,
      container: true,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [NOTE_FOLDER_CARD_TYPE]: {
    type: NOTE_FOLDER_CARD_TYPE,
    displayName: "Note Folder Tile",
    component: NoteFolderTile,
    defaultSize: { width: 360, height: 284 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: true,
      container: true,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  [RACK_CARD_TYPE]: {
    type: RACK_CARD_TYPE,
    displayName: "Rack Tile",
    component: RackTile,
    defaultSize: { width: 836, height: 126 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: true,
      container: true,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  "page-link": {
    type: "page-link",
    displayName: "Page Link Tile",
    component: PageLinkTile,
    defaultSize: { width: 280, height: 180 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: true,
      container: false,
      navigation: true,
      physics: false,
      lazy: false,
    },
  },
  "node-group": {
    type: "node-group",
    displayName: "Node Group Tile",
    component: NodeGroupTile,
    defaultSize: { width: 420, height: 280 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: true,
      container: true,
      navigation: false,
      physics: false,
      lazy: false,
    },
  },
  game: {
    type: "game",
    displayName: "Game Tile",
    component: GameTile,
    defaultSize: { width: 480, height: 320 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: false,
      container: false,
      navigation: false,
      physics: false,
      lazy: true,
    },
  },
  "3d-model": {
    type: "3d-model",
    displayName: "3D Model Tile",
    component: Model3DTile,
    defaultSize: { width: 480, height: 320 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: false,
      container: false,
      navigation: false,
      physics: false,
      lazy: true,
    },
  },
  "physics-item": {
    type: "physics-item",
    displayName: "Physics Item Tile",
    component: PhysicsItemTile,
    defaultSize: { width: 240, height: 240 },
    capabilities: {
      draggable: true,
      resizable: true,
      editable: false,
      container: false,
      navigation: false,
      physics: true,
      lazy: true,
    },
  },
};

export function getTileDefinition(tileType) {
  return tileRegistry[tileType] ?? tileRegistry.link;
}

export default tileRegistry;
