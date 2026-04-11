const fs = require('fs');
const path = require('path');

const stylesPath = path.join(process.cwd(), 'renderer/src/styles.css');
let content = fs.readFileSync(stylesPath, 'utf8');

const anchor = `.card--dragging {
  will-change: transform;
}`;

const insertion = `
.card__toolbar {
  display: flex;
  align-self: center;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 0 12px;
  cursor: grab;
  user-select: none;
}

.card__toolbar:active {
  cursor: grabbing;
}

.card__toolbar--text-editor {
  justify-content: flex-start;
  padding: 0 10px 8px;
}
`;

if (content.indexOf(anchor) !== -1 && content.indexOf('.card__toolbar {') === -1) {
    const parts = content.split(anchor);
    content = parts[0] + anchor + insertion + parts.slice(1).join(anchor);
    console.log('Inserted missing toolbar classes.');
}

// Also fix the transition syntax artifact
content = content.replace(/transition:\s+transform 180ms ease,\s+;/g, 'transition: transform 180ms ease;');

fs.writeFileSync(stylesPath, content, 'utf8');
console.log('Final cleanup complete.');
