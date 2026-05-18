const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'renderer/src/components/HomeShellPrototype.css',
  'renderer/src/components/TopTabBar.css'
];

filesToUpdate.forEach(file => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');

    // Replace old retro variables
    content = content.replace(/var\(--bg-black\)/g, 'var(--ap-text-primary)');
    content = content.replace(/var\(--bg-white\)/g, 'var(--ap-surface-default)');
    content = content.replace(/var\(--bg-desktop\)/g, 'var(--ap-bg-page)');
    content = content.replace(/var\(--bg-window\)/g, 'var(--ap-surface-raised)');
    content = content.replace(/var\(--bg-off-white\)/g, 'var(--ap-surface-raised)');
    content = content.replace(/var\(--bg-grey\)/g, 'var(--ap-surface-muted)');
    content = content.replace(/var\(--bg-active\)/g, 'var(--ap-interactive-bg-selected)');
    content = content.replace(/var\(--text-main\)/g, 'var(--ap-text-primary)');
    
    // Hardcoded colors to tokens
    content = content.replace(/color:\s*#000;/g, 'color: var(--ap-text-primary);');
    content = content.replace(/color:\s*#fff;/g, 'color: var(--ap-text-inverse);');
    content = content.replace(/background:\s*#000;/g, 'background: var(--ap-text-primary);');
    content = content.replace(/background:\s*#fff;/g, 'background: var(--ap-surface-default);');
    content = content.replace(/background-color:\s*#000;/g, 'background-color: var(--ap-text-primary);');
    content = content.replace(/background-color:\s*#fff;/g, 'background-color: var(--ap-surface-default);');
    
    // Pixelated rendering
    content = content.replace(/image-rendering:\s*pixelated;/g, '');
    
    // Checkers and borders
    content = content.replace(/border:\s*2px\s*solid\s*#000;?/g, 'border: 1px solid var(--ap-border-subtle);');
    content = content.replace(/border:\s*1px\s*solid\s*#000;?/g, 'border: 1px solid var(--ap-border-subtle);');
    content = content.replace(/box-shadow:\s*4px\s*4px\s*0\s*#000;?/g, 'box-shadow: var(--ap-shadow-sm);');
    
    fs.writeFileSync(fullPath, content);
    console.log(`Updated ${file}`);
  }
});
