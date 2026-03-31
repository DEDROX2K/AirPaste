Never put file writes directly in renderer components
Never call Electron APIs directly from React components; use preload bridge
Never store duplicated derived state unless justified
Every tile type must use shared selection, drag, focus, z-index, and context-menu systems
Prefer composition over giant conditional components
Add new tile types through registry/config, not by bloating Card.jsx
All canvas interactions must respect viewport transforms
Every new interaction must define idle, hover, selected, editing, dragging states
No inline random styles for production code; use design tokens/CSS vars
All persistent schema changes must be versioned
All canvas/page load+save IPC must be serialized per workspace root to avoid write races
Atomic file writes must use unique temp+backup filenames per operation; never fixed `.tmp` names
