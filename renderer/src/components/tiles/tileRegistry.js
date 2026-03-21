import FolderTile from "./FolderTile";
import LinkTile from "./LinkTile";
import NoteFolderTile from "./NoteFolderTile";
import RackTile from "./RackTile";
import TextTile from "./TextTile";
import TILE_TYPES from "../../tiles/tileTypes";

const tileRegistry = {
  [TILE_TYPES.NOTE]: {
    Component: TextTile,
  },
  [TILE_TYPES.LINK]: {
    Component: LinkTile,
  },
  [TILE_TYPES.FOLDER]: {
    Component: FolderTile,
  },
  [TILE_TYPES.NOTE_FOLDER]: {
    Component: NoteFolderTile,
  },
  [TILE_TYPES.RACK]: {
    Component: RackTile,
  },
};

export function getTileRegistration(tileType) {
  return tileRegistry[tileType] ?? tileRegistry[TILE_TYPES.LINK];
}
