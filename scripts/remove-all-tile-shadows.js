const fs = require('fs');
const path = require('path');

const stylesPath = path.join(process.cwd(), 'renderer/src/styles.css');
let content = fs.readFileSync(stylesPath, 'utf8');

// 1. Fix corruption: Remove everything between the first '.launch-panel h1 {' and the first '.card {'
// because that's where the massive duplication happened.
const launchPanelH1Start = content.indexOf('.launch-panel h1 {');
const firstCardStart = content.indexOf('.card {', launchPanelH1Start);

if (launchPanelH1Start !== -1 && firstCardStart !== -1) {
    const originalLaunchPanelH1 = `.launch-panel h1 {
  margin-bottom: 8px;
  font-size: 1.8rem;
  letter-spacing: -0.04em;
}

.launch-panel p:last-child {
  color: var(--text-secondary);
}

`;
    content = content.substring(0, launchPanelH1Start) + originalLaunchPanelH1 + content.substring(firstCardStart);
    console.log('Fixed corruption block.');
}

// 2. Remove shadows specifically from tile-related classes.
// We process the whole file but keep the replacements tightly scoped to tile selectors.

const selectorsToStrip = [
    // Box shadows
    /\.card--hovered:not\(\.card--selected\):not\(\.card--dragging\)[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card--focused:not\(\.card--selected\):not\(\.card--dragging\)[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card--dragging[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card__surface-frame--selected .card__surface:not\(\.card__surface--music\)[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__surface-frame--selected .card__record-sleeve[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__surface-frame--music:hover[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card__surface-frame--merge-target[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card--folder-group-target .card__surface-frame[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card--folder-group-armed .card__surface-frame[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card--rack-attached .card__label[\s\S]*?text-shadow:[\s\S]*?;/g,
    /\.card--rack-attached .card__surface-frame[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card--rack-attached\.card--hovered .card__surface-frame[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card--rack-attached\.card--focused .card__surface-frame[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card--rack-attached\.card--selected .card__surface-frame[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card__surface \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__surface--rack::after \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__surface-frame--rack-drop-target .card__surface--rack::after[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__surface-frame--selected .card__surface--rack::after[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__rack-rect \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__rack-slot \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__rack-slot--preview \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__surface-frame--rack-drop-target .card__rack-rect[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card--rack-drop-target .card__rack-rect[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card--hovered\.card--rack .card__rack-rect[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__link-action \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__folder-tab \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__folder-front \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__surface-frame--selected .card__folder-front[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__surface-frame--merge-target .card__folder-front[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__folder-title \{[\s\S]*?text-shadow:[\s\S]*?;/g,
    /\.card__folder-glimpse \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__canvas-folder-tab \{[\s\S]*?filter: drop-shadow\([\s\S]*?\);/g,
    /\.card--folder-group-target .card__canvas-folder-front[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card--folder-group-armed .card__canvas-folder-front[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card__canvas-folder-peek-label \{[\s\S]*?text-shadow:[\s\S]*?;/g,
    /\.card--dragging .card__surface \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card--selected .card__surface \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card--focused .card__surface \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.card--selected .card__record-sleeve \{[\s\S]*?box-shadow:[\s\S]*?;/g,
    /\.grid-card__url-pill-text \{[\s\S]*?box-shadow:[\s\S]*?;/g,
];

// Special handle for transitions
content = content.replace(/box-shadow\s+\d+ms\s+[\w-]+\s*,?/g, '');
content = content.replace(/,\s*box-shadow\s+\d+ms\s+[\w-]+/g, '');
content = content.replace(/filter\s+\d+ms\s+[\w-]+\s*,?/g, '');
content = content.replace(/,\s*filter\s+\d+ms\s+[\w-]+/g, '');

// Process specific blocks to remove shadows but keep other properties.
// This is more complex but safer.

function stripShadowProperty(match) {
    // Remove box-shadow, drop-shadow, text-shadow, filter: drop-shadow
    let result = match.replace(/box-shadow:[\s\S]*?;/g, '/* box-shadow removed */');
    result = result.replace(/text-shadow:[\s\S]*?;/g, '/* text-shadow removed */');
    result = result.replace(/filter: drop-shadow\([\s\S]*?\);/g, '/* drop-shadow removed */');
    return result;
}

selectorsToStrip.forEach(regex => {
    content = content.replace(regex, stripShadowProperty);
});

// Final check for box-shadow: none; to leave them as is if they are intentionally none.
// But some were box-shadow: 0 0 0 0 transparent;
content = content.replace(/box-shadow:\s*0\s+0\s+0\s+0\s+transparent;/g, '/* box-shadow: none */');


fs.writeFileSync(stylesPath, content, 'utf8');
console.log('Shadow removal complete.');
