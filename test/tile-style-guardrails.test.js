// Style guardrails for tiles that own a stylesheet (components/tiles/<Tile>.css).
//
// Each check catches a way a ported tile design has shipped half-finished:
// a stylesheet nobody imports, a class the JSX uses that no rule styles, old
// rules left behind after a redesign, a CSS variable that resolves to nothing,
// styling the shared .card__surface frame (TilePolish.css flattens it with
// !important), and button hovers that lose to SimpleUi.css's global
// `button:hover:not(:disabled)` rule.
//
// New tile stylesheets are picked up automatically. To exempt something on
// purpose, add it to ALLOWED below with a reason.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve("renderer/src");
const TILES_DIR = path.join(SRC_DIR, "components", "tiles");

// "<Tile>.css: <class or var>" -> why it's fine.
const ALLOWED = {};

function listFiles(dir, pattern) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(fullPath, pattern);
    }
    return pattern.test(entry.name) ? [fullPath] : [];
  });
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

const cssFiles = listFiles(SRC_DIR, /\.css$/);
const sourceFiles = listFiles(SRC_DIR, /\.jsx?$/);
const allCss = cssFiles.map((file) => stripCssComments(readText(file))).join("\n");
const allSource = sourceFiles.map(readText).join("\n");

const classesDefinedAnywhere = new Set(
  [...allCss.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]),
);
// Custom properties set in any stylesheet, or from JS (style vars such as
// getTileStyleVars, or `style={{ "--x": ... }}`).
const customPropertiesDefined = new Set([
  ...[...allCss.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
  ...[...allSource.matchAll(/["'`](--[\w-]+)["'`]/g)].map((match) => match[1]),
]);
// Class prefixes completed at runtime: `foo__handle--${key}` -> "foo__handle--".
const dynamicClassPrefixes = [...allSource.matchAll(/([a-zA-Z][\w-]*(?:__|--|-))\$\{/g)]
  .map((match) => match[1]);

function getBlockName(className) {
  return className.split("__")[0].split("--")[0];
}

function isClassUsedInSource(className) {
  const pattern = new RegExp(`(?<![\\w-])${className.replace(/-/g, "\\-")}(?![\\w-])`);
  return pattern.test(allSource) || dynamicClassPrefixes.some((prefix) => className.startsWith(prefix));
}

function getRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(",").map((selector) => selector.trim()).filter(Boolean),
    body: match[2],
  }));
}

function getButtonClassNames(jsx) {
  const classNames = new Set();
  const buttonPattern = /<button\b[^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/gs;

  for (const match of jsx.matchAll(buttonPattern)) {
    (match[1] ?? match[2] ?? match[3])
      .split(/\s+/)
      .filter((token) => token && !token.includes("$"))
      .forEach((token) => classNames.add(token));
  }

  return classNames;
}

const tileStylesheets = fs.readdirSync(TILES_DIR)
  .filter((name) => name.endsWith(".css"))
  .map((name) => {
    const componentPath = path.join(TILES_DIR, name.replace(/\.css$/, ".jsx"));
    const css = stripCssComments(readText(path.join(TILES_DIR, name)));
    const jsx = fs.existsSync(componentPath) ? readText(componentPath) : "";
    const definedClasses = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]));
    // The tile's own BEM blocks: blocks this stylesheet defines that its
    // component also uses. Others (.card, .canvas__content, CodeMirror's
    // .cm-*) belong to someone else and aren't checked for coverage.
    const ownBlocks = new Set(
      [...definedClasses]
        .map(getBlockName)
        .filter((block) => block.includes("-") && new RegExp(`(?<![\\w-])${block}(?:__|--|[^\\w-])`).test(jsx)),
    );

    return { name, componentPath, css, jsx, definedClasses, ownBlocks };
  });

function withoutAllowed(name, items) {
  return items.filter((item) => !ALLOWED[`${name}: ${item}`]);
}

describe("tile style guardrails", () => {
  it("finds the tile stylesheets", () => {
    expect(tileStylesheets.length).toBeGreaterThan(0);
  });

  describe.each(tileStylesheets)("$name", (sheet) => {
    it("has a matching component that imports it", () => {
      expect(fs.existsSync(sheet.componentPath), `${path.basename(sheet.componentPath)} is missing`).toBe(true);
      expect(sheet.jsx).toContain(`"./${sheet.name}"`);
    });

    it("styles every element class of its own the component uses", () => {
      // Blocks and __elements only: a --modifier with no rule is often a
      // deliberate state hook (--resizing, the default --front face).
      const unstyled = new Set();

      for (const block of sheet.ownBlocks) {
        const pattern = new RegExp(`(?<![\\w-])${block}(?:__[\\w-]*|--[\\w-]*)?(?![\\w-]*\\$\\{)`, "g");
        for (const [token] of sheet.jsx.matchAll(pattern)) {
          if (!/[-_]$/.test(token) && !token.includes("--") && !classesDefinedAnywhere.has(token)) {
            unstyled.add(token);
          }
        }
      }

      expect(withoutAllowed(sheet.name, [...unstyled]), "classes used in JSX with no CSS rule").toEqual([]);
    });

    it("has no rules left over for classes nothing renders", () => {
      const orphaned = [...sheet.definedClasses].filter((className) => (
        sheet.ownBlocks.has(getBlockName(className)) && !isClassUsedInSource(className)
      ));

      expect(withoutAllowed(sheet.name, orphaned), "CSS classes no component renders").toEqual([]);
    });

    it("only uses CSS variables that are defined or have a fallback", () => {
      const undefinedVars = [...sheet.css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
        .map((match) => match[1])
        .filter((name) => !customPropertiesDefined.has(name));

      expect(withoutAllowed(sheet.name, [...new Set(undefinedVars)]), "var() with no definition and no fallback").toEqual([]);
    });

    it("doesn't style the shared .card__surface frame", () => {
      // TilePolish.css forces these flat white with !important; a tile with
      // its own look should skip them (see PaperNoteTile / ChecklistTile).
      expect(sheet.css).not.toMatch(/\.card__surface(?:-frame)?(?![\w-])/);
    });

    it("guards button hovers against SimpleUi's global hover", () => {
      const buttonClasses = getButtonClassNames(sheet.jsx);
      const weakHovers = getRules(sheet.css).flatMap(({ selectors }) => selectors.filter((selector) => {
        if (!selector.includes(":hover")) {
          return false;
        }
        const target = selector.split(/\s+|>/).pop();
        const targetClasses = [...target.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
        return targetClasses.some((className) => buttonClasses.has(className))
          && !selector.includes(":not(:disabled)");
      }));

      expect(
        withoutAllowed(sheet.name, weakHovers),
        "button :hover rules need :not(:disabled) (and !important on background) to beat SimpleUi.css",
      ).toEqual([]);
    });
  });
});
