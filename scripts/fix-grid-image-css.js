const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "renderer", "src", "styles.css");
let css = fs.readFileSync(filePath, "utf8");

// Replace the grid-card__media and grid-card__image blocks
const oldMedia = `.grid-card__media {
  position: relative;
  width: 100%;
  background: var(--bg-base);
  overflow: hidden;
  border-radius: 14px 14px 0 0;
}

.grid-card__image {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
  max-height: 320px;
  transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
}

.grid-card:hover .grid-card__image {
  transform: scale(1.03);
}`;

const newMedia = `.grid-card__media {
  position: relative;
  width: 100%;
  background: color-mix(in srgb, var(--bg-base) 60%, var(--border-subtle));
  overflow: hidden;
  border-radius: 14px 14px 0 0;
  /* Height shrinks to 0 until image loads — ensure min placeholder height */
  min-height: 8px;
}

.grid-card__image {
  display: block;
  width: 100%;
  height: auto;
  max-height: 340px;
  object-fit: cover;
  opacity: 0;
  transition:
    opacity 280ms ease,
    transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
}

.grid-card__media--loaded .grid-card__image {
  opacity: 1;
}

.grid-card:hover .grid-card__image {
  transform: scale(1.03);
}`;

if (!css.includes(oldMedia)) {
  console.error("OLD BLOCK NOT FOUND — may already have been patched");
  process.exit(1);
}

css = css.replace(oldMedia, newMedia);
fs.writeFileSync(filePath, css, "utf8");
console.log("CSS patched successfully");
