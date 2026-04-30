import AmazonProductTile from "./AmazonProductTile";
import ChecklistTile from "./ChecklistTile";
import CodeSnippetTile from "./CodeSnippetTile";
import CounterTile from "./CounterTile";
import DeadlineTile from "./DeadlineTile";
import LinkTile from "./LinkTile";
import NoteTile from "./NoteTile";
import ProgressTile from "./ProgressTile";
import RackTile from "./RackTile";
import TableTile from "./TableTile";
import TILE_TYPES from "../../tiles/tileTypes";

const tileRegistry = {
  [TILE_TYPES.LINK]: {
    Component: LinkTile,
  },
  [TILE_TYPES.AMAZON_PRODUCT]: {
    Component: AmazonProductTile,
  },
  [TILE_TYPES.CHECKLIST]: {
    Component: ChecklistTile,
  },
  [TILE_TYPES.CODE]: {
    Component: CodeSnippetTile,
  },
  [TILE_TYPES.COUNTER]: {
    Component: CounterTile,
  },
  [TILE_TYPES.DEADLINE]: {
    Component: DeadlineTile,
  },
  [TILE_TYPES.NOTE]: {
    Component: NoteTile,
  },
  [TILE_TYPES.PROGRESS]: {
    Component: ProgressTile,
  },
  [TILE_TYPES.TABLE]: {
    Component: TableTile,
  },
  [TILE_TYPES.RACK]: {
    Component: RackTile,
  },
};

export function getTileRegistration(tileType) {
  return tileRegistry[tileType] ?? tileRegistry[TILE_TYPES.LINK];
}
