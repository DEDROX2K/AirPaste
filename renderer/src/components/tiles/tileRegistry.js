import FolderTile from "./FolderTile";
import LinkTile from "./LinkTile";
import RackTile from "./RackTile";
import TILE_TYPES from "../../tiles/tileTypes";

const tileRegistry = {
  [TILE_TYPES.LINK]: {
    Component: LinkTile,
  },
  [TILE_TYPES.FOLDER]: {
    Component: FolderTile,
  },
  [TILE_TYPES.RACK]: {
    Component: RackTile,
  },
};

export function getTileRegistration(tileType) {
  return tileRegistry[tileType] ?? tileRegistry[TILE_TYPES.LINK];
}
