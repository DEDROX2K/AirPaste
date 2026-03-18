import { FOLDER_CARD_TYPE, NOTE_FOLDER_CARD_TYPE, RACK_CARD_TYPE } from "../../lib/workspace";
import FolderTile from "./FolderTile";
import LinkTile from "./LinkTile";
import NoteFolderTile from "./NoteFolderTile";
import RackTile from "./RackTile";
import TextTile from "./TextTile";

const tileRegistry = {
  text: {
    Component: TextTile,
  },
  link: {
    Component: LinkTile,
  },
  [FOLDER_CARD_TYPE]: {
    Component: FolderTile,
  },
  [NOTE_FOLDER_CARD_TYPE]: {
    Component: NoteFolderTile,
  },
  [RACK_CARD_TYPE]: {
    Component: RackTile,
  },
};

export function getTileRegistration(tileType) {
  return tileRegistry[tileType] ?? tileRegistry.link;
}
