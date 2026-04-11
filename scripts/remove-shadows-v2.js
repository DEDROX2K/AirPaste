const fs = require('fs');
const path = require('path');

const stylesPath = path.join(process.cwd(), 'renderer/src/styles.css');
let content = fs.readFileSync(stylesPath, 'utf8');

const shadowsToStrip = [
    /box-shadow:\s+0\s+20px\s+38px\s+rgba\(0,\s+0,\s+0,\s+0\.22\),\s+0\s+0\s+0\s+1px\s+rgba\(255,\s+255,\s+255,\s+0\.24\);/g,
    /box-shadow:\s+0\s+20px\s+38px\s+rgba\(0,\s+0,\s+0,\s+0\.28\),\s+0\s+0\s+0\s+1px\s+rgba\(255,\s+255,\s+255,\s+0\.32\);/g,
    /box-shadow:\s+0\s+18px\s+36px\s+rgba\(0,\s+0,\s+0,\s+0\.26\),\s+0\s+0\s+0\s+2px\s+rgba\(185,\s+175,\s+255,\s+0\.92\);/g,
    /box-shadow:\s+0\s+20px\s+38px\s+rgba\(0,\s+0,\s+0,\s+0\.26\),\s+0\s+0\s+0\s+2px\s+rgba\(185,\s+175,\s+255,\s+0\.92\);/g,
    /box-shadow:\s+0\s+16px\s+30px\s+rgba\(0,\s+0,\s+0,\s+0\.22\);/g,
    /box-shadow:\s+0\s+0\s+0\s+2px\s+color-mix\(in srgb, var\(--accent\) 24%, transparent\),\s+0\s+0\s+0\s+12px\s+color-mix\(in srgb, var\(--accent\) 10%, transparent\);/g,
    /box-shadow:\s+0\s+0\s+0\s+2px\s+color-mix\(in srgb, var\(--accent\) 18%, transparent\),\s+0\s+0\s+0\s+8px\s+color-mix\(in srgb, var\(--accent\) 8%, transparent\);/g,
    /box-shadow:\s+inset\s+0\s+6px\s+14px\s+rgba\(255,\s+213,\s+157,\s+0\.22\),\s+inset\s+0\s+-8px\s+16px\s+rgba\(113,\s+59,\s+18,\s+0\.18\),\s+0\s+18px\s+26px\s+rgba\(47,\s+24,\s+10,\s+0\.24\),\s+0\s+2px\s+0\s+rgba\(255,\s+237,\s+208,\s+0\.08\);/g,
    /box-shadow:\s+inset\s+0\s+2px\s+4px\s+rgba\(71,\s+34,\s+9,\s+0\.12\),\s+inset\s+0\s+1px\s+0\s+rgba\(255,\s+229,\s+189,\s+0\.08\);/g,
    /box-shadow:\s+inset\s+0\s+2px\s+4px\s+rgba\(71,\s+34,\s+9,\s+0\.08\),\s+0\s+0\s+0\s+1px\s+color-mix\(in srgb, var\(--accent\) 20%, transparent\);/g,
    /box-shadow:\s+inset\s+0\s+6px\s+14px\s+rgba\(255,\s+213,\s+157,\s+0\.24\),\s+inset\s+0\s+-8px\s+16px\s+rgba\(113,\s+59,\s+18,\s+0\.20\),\s+0\s+24px\s+34px\s+rgba\(47,\s+24,\s+10,\s+0\.30\),\s+0\s+2px\s+0\s+rgba\(255,\s+237,\s+208,\s+0\.12\);/g,
    /box-shadow:\s+0\s+8px\s+20px\s+color-mix\(in srgb, var\(--shadow\) 72%, transparent\),\s+inset\s+0\s+1px\s+0\s+rgba\(255,\s+255,\s+255,\s+0\.08\);/g,
    /box-shadow:\s+0\s+12px\s+28px\s+rgba\(30,\s+116,\s+182,\s+0\.18\),\s+inset\s+0\s+1px\s+0\s+rgba\(255,\s+255,\s+255,\s+0\.42\);/g,
    /box-shadow:\s+inset\s+0\s+1px\s+0\s+rgba\(255,\s+255,\s+255,\s+0\.38\),\s+inset\s+0\s+-3px\s+0\s+rgba\(30,\s+122,\s+190,\s+0\.22\);/g,
    /box-shadow:\s+0\s+26px\s+44px\s+rgba\(17,\s+86,\s+142,\s+0\.28\),\s+0\s+0\s+0\s+2px\s+rgba\(219,\s+243,\s+255,\s+0\.98\),\s+0\s+0\s+0\s+7px\s+rgba\(63,\s+174,\s+245,\s+0\.22\);/g,
    /box-shadow:\s+0\s+28px\s+48px\s+rgba\(17,\s+86,\s+142,\s+0\.30\),\s+0\s+0\s+0\s+2px\s+rgba\(219,\s+243,\s+255,\s+0\.98\),\s+0\s+0\s+0\s+10px\s+rgba\(63,\s+174,\s+245,\s+0\.24\);/g,
    /box-shadow:\s+0\s+28px\s+44px\s+rgba\(14,\s+74,\s+124,\s+0\.2\),\s+0\s+0\s+0\s+1px\s+rgba\(110,\s+180,\s+237,\s+0\.14\);/g,
    /box-shadow:\s+0\s+32px\s+50px\s+rgba\(95,\s+62,\s+16,\s+0\.22\),\s+0\s+0\s+0\s+2px\s+rgba\(217,\s+245,\s+255,\s+0\.92\),\s+0\s+0\s+0\s+10px\s+rgba\(255,\s+255,\s+255,\s+0\.08\);/g,
    /box-shadow:\s+0\s+28px\s+46px\s+rgba\(95,\s+62,\s+16,\s+0\.32\),\s+0\s+0\s+0\s+2px\s+rgba\(217,\s+245,\s+255,\s+0\.92\),\s+0\s+0\s+0\s+6px\s+rgba\(255,\s+255,\s+255,\s+0\.12\);/g,
    /filter: drop-shadow\(0 24px 42px rgba\(0, 0, 0, 0\.26\)\);/g,
    /filter: drop-shadow\(0 28px 40px rgba\(0, 0, 0, 0\.24\)\);/g,
);

shadowsToStrip.forEach(regex => {
    content = content.replace(regex, (match) => {
        // If it was a multi-line shadow, replace it with a single comment.
        return '/* box-shadow: removed */';
    });
});

fs.writeFileSync(stylesPath, content, 'utf8');
console.log('Processed shadows.');
