# Tile Registry

| Tile Name | Type ID | Description | Capabilities | Can Contain Children? | Status |
| --- | --- | --- | --- | --- | --- |
| Link Tile | `link` | Rich link preview tile for web references. | drag, resize, preview | no | stable |
| Note Tile | `text` | Freeform note tile for written content. | drag, resize, edit | no | stable |
| Folder Tile | `folder` | Container tile for grouping child tiles. | drag, resize, container | yes | stable |
| Rack Tile | `rack` | Structured container for mounted or slotted items. | drag, resize, container, layout | yes | stable |
| Page Link Tile | `page-link` | Navigation tile that opens a page or workspace destination. | drag, resize, navigation | no | planned |
| Node Group Tile | `node-group` | Behavior or system wrapper for grouped nodes. | drag, resize, container, system | yes | planned |
| Game Tile | `game` | Embedded gameplay surface. | drag, resize, interactive, lazy-load | no | planned |
| 3D Model Tile | `3d-model` | Viewport for 3D content or models. | drag, resize, interactive, lazy-load | no | planned |
| Physics Item Tile | `physics-item` | Physics-aware tile or object inside a simulation system. | drag, resize, physics, runtime-state | no | planned |

