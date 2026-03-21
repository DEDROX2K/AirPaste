import TILE_TYPES from "./tileTypes";

const tileCapabilities = {
  [TILE_TYPES.NOTE]: {
    type: TILE_TYPES.NOTE,
    displayName: "Note Tile",
    existsInCode: "yes",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: true,
      resizable: false,
      canLiveInFolder: true,
      canLiveInRack: true,
      canJoinNodeGroup: false,
    },
    advanced: {
      canContainChildren: false,
      physicsEnabled: false,
      customRenderLoop: false,
    },
    heavy: {
      lazyLoadCandidate: false,
      persistenceComplexity: "low",
    },
    status: "stable",
  },
  [TILE_TYPES.LINK]: {
    type: TILE_TYPES.LINK,
    displayName: "Link Tile",
    existsInCode: "yes",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: false,
      resizable: false,
      canLiveInFolder: true,
      canLiveInRack: true,
      canJoinNodeGroup: false,
    },
    advanced: {
      canContainChildren: false,
      physicsEnabled: false,
      customRenderLoop: false,
    },
    heavy: {
      lazyLoadCandidate: false,
      persistenceComplexity: "medium",
    },
    status: "stable",
  },
  [TILE_TYPES.FOLDER]: {
    type: TILE_TYPES.FOLDER,
    displayName: "Folder Tile",
    existsInCode: "yes",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: false,
      resizable: false,
      canLiveInFolder: false,
      canLiveInRack: false,
      canJoinNodeGroup: false,
    },
    advanced: {
      canContainChildren: true,
      physicsEnabled: false,
      customRenderLoop: false,
    },
    heavy: {
      lazyLoadCandidate: false,
      persistenceComplexity: "medium",
    },
    status: "stable",
  },
  [TILE_TYPES.NOTE_FOLDER]: {
    type: TILE_TYPES.NOTE_FOLDER,
    displayName: "Note Folder Tile",
    existsInCode: "yes",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: false,
      resizable: false,
      canLiveInFolder: true,
      canLiveInRack: true,
      canJoinNodeGroup: false,
    },
    advanced: {
      canContainChildren: false,
      physicsEnabled: false,
      customRenderLoop: false,
    },
    heavy: {
      lazyLoadCandidate: false,
      persistenceComplexity: "medium",
    },
    status: "stable",
  },
  [TILE_TYPES.RACK]: {
    type: TILE_TYPES.RACK,
    displayName: "Rack Tile",
    existsInCode: "yes",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: false,
      resizable: false,
      canLiveInFolder: false,
      canLiveInRack: false,
      canJoinNodeGroup: false,
    },
    advanced: {
      canContainChildren: true,
      physicsEnabled: false,
      customRenderLoop: false,
    },
    heavy: {
      lazyLoadCandidate: false,
      persistenceComplexity: "medium",
    },
    status: "stable",
  },
  [TILE_TYPES.PAGE_LINK]: {
    type: TILE_TYPES.PAGE_LINK,
    displayName: "Page Link Tile",
    existsInCode: "no",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: true,
      resizable: true,
      canLiveInFolder: true,
      canLiveInRack: true,
      canJoinNodeGroup: true,
    },
    advanced: {
      canContainChildren: false,
      physicsEnabled: false,
      customRenderLoop: false,
    },
    heavy: {
      lazyLoadCandidate: false,
      persistenceComplexity: "low",
    },
    status: "planned",
  },
  [TILE_TYPES.NODE_GROUP]: {
    type: TILE_TYPES.NODE_GROUP,
    displayName: "Node Group Tile",
    existsInCode: "no",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: true,
      resizable: true,
      canLiveInFolder: false,
      canLiveInRack: false,
      canJoinNodeGroup: true,
    },
    advanced: {
      canContainChildren: true,
      physicsEnabled: false,
      customRenderLoop: false,
    },
    heavy: {
      lazyLoadCandidate: false,
      persistenceComplexity: "medium",
    },
    status: "planned",
  },
  [TILE_TYPES.GAME]: {
    type: TILE_TYPES.GAME,
    displayName: "Game Tile",
    existsInCode: "no",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: false,
      resizable: true,
      canLiveInFolder: true,
      canLiveInRack: true,
      canJoinNodeGroup: true,
    },
    advanced: {
      canContainChildren: false,
      physicsEnabled: false,
      customRenderLoop: true,
    },
    heavy: {
      lazyLoadCandidate: true,
      persistenceComplexity: "high",
    },
    status: "planned",
  },
  [TILE_TYPES.MODEL_3D]: {
    type: TILE_TYPES.MODEL_3D,
    displayName: "3D Model Tile",
    existsInCode: "no",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: false,
      resizable: true,
      canLiveInFolder: true,
      canLiveInRack: true,
      canJoinNodeGroup: true,
    },
    advanced: {
      canContainChildren: false,
      physicsEnabled: false,
      customRenderLoop: true,
    },
    heavy: {
      lazyLoadCandidate: true,
      persistenceComplexity: "high",
    },
    status: "planned",
  },
  [TILE_TYPES.PHYSICS_ITEM]: {
    type: TILE_TYPES.PHYSICS_ITEM,
    displayName: "Physics Item Tile",
    existsInCode: "no",
    registeredInFoundationRegistry: true,
    universal: {
      draggable: true,
      selectable: true,
    },
    optional: {
      editable: false,
      resizable: true,
      canLiveInFolder: true,
      canLiveInRack: true,
      canJoinNodeGroup: true,
    },
    advanced: {
      canContainChildren: false,
      physicsEnabled: true,
      customRenderLoop: true,
    },
    heavy: {
      lazyLoadCandidate: true,
      persistenceComplexity: "high",
    },
    status: "planned",
  },
};

export default tileCapabilities;
