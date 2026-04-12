import AmazonProductTile from "./AmazonProductTile";
import LinkTile from "./LinkTile";
import RackTile from "./RackTile";
import TILE_TYPES from "../../tiles/tileTypes";

const tileRegistry = {
  [TILE_TYPES.LINK]: {
    Component: LinkTile,
  },
  [TILE_TYPES.AMAZON_PRODUCT]: {
    Component: AmazonProductTile,
  },
  [TILE_TYPES.RACK]: {
    Component: RackTile,
  },
};

export function getTileRegistration(tileType) {
  return tileRegistry[tileType] ?? tileRegistry[TILE_TYPES.LINK];
}
