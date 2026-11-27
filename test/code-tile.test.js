import { describe, expect, it } from "vitest";
import { detectCodeLanguage } from "../renderer/src/tiles/code/detectLanguage";
import {
  CODE_LANGUAGES,
  codeTileHeight,
  normalizeCodeHeight,
  normalizeCodeLanguage,
  stepCodeFontSize,
} from "../renderer/src/tiles/code/model";
import { tokenizeCode } from "../renderer/src/tiles/code/staticHighlight";

describe("code tile language detection", () => {
  const samples = {
    ts: "interface Stack<T> {\n  tiles: T[];\n  seed: number;\n}\n\nexport function pile<T>(tiles: T[]): Stack<T> {\n  const seed = Math.floor(Math.random() * 1e9);\n  return { tiles, seed };\n}",
    py: "import math\n\ndef warp(r: float, r0: float = 0.45) -> float:\n    if r <= r0:\n        return r\n    return r * 2\n\nprint(f\"corner: {warp(1.0):.3f}\")",
    json: "{\"name\": \"airpaste\", \"version\": 4}",
    sql: "SELECT id, title FROM cards WHERE type = 'code' ORDER BY id;",
    go: "package main\n\nimport \"fmt\"\n\nfunc main() {\n  x := 2\n  fmt.Println(x)\n}",
    rust: "fn main() {\n    let mut v: Vec<i32> = Vec::new();\n    println!(\"{:?}\", v);\n}",
    html: "<!doctype html>\n<html>\n<body><div class=\"a\">hi</div></body>\n</html>",
    css: ".tile {\n  color: red;\n  margin: 0;\n}",
    bash: "#!/usr/bin/env bash\nnpm install\ngit status",
    jsx: "export default function App() {\n  const [n, setN] = useState(0);\n  return (\n    <Button onClick={() => setN(n + 1)} />\n  );\n}",
  };

  for (const [expected, code] of Object.entries(samples)) {
    it(`detects ${expected}`, () => {
      expect(detectCodeLanguage(code)).toBe(expected);
    });
  }

  it("returns null for empty code and text for prose", () => {
    expect(detectCodeLanguage("   \n ")).toBeNull();
    expect(detectCodeLanguage("hello there")).toBe("text");
  });

  it("only ever returns known keys", () => {
    for (const code of Object.values(samples)) {
      expect(Object.hasOwn(CODE_LANGUAGES, detectCodeLanguage(code))).toBe(true);
    }
  });
});

describe("code tile model", () => {
  it("maps old language names and drops unknown ones to auto", () => {
    expect(normalizeCodeLanguage("typescript")).toBe("ts");
    expect(normalizeCodeLanguage("regex")).toBe("text");
    expect(normalizeCodeLanguage("rust")).toBe("rust");
    expect(normalizeCodeLanguage("cobol")).toBe("auto");
    expect(normalizeCodeLanguage(undefined)).toBe("auto");
  });

  it("steps font sizes within the list", () => {
    expect(stepCodeFontSize(14, 1)).toBe(16);
    expect(stepCodeFontSize(10, -1)).toBe(10);
    expect(stepCodeFontSize(24, 1)).toBe(24);
    expect(stepCodeFontSize(99, -1)).toBe(13);
  });

  it("clamps user heights and sizes the tile around the paper", () => {
    expect(normalizeCodeHeight(null)).toBeNull();
    expect(normalizeCodeHeight(50)).toBe(120);
    expect(normalizeCodeHeight(300.4)).toBe(300);
    expect(codeTileHeight(220)).toBe(348);
  });
});

describe("code tile static highlighter", () => {
  it("keeps every character and marks tokens", () => {
    const code = "const a = 'x'; // note\nfoo(42)";
    const tokens = tokenizeCode(code, "js");
    expect(tokens.map((token) => token.text).join("")).toBe(code);
    expect(tokens).toEqual(expect.arrayContaining([
      { text: "const", kind: "kw" },
      { text: "'x'", kind: "str" },
      { text: "// note", kind: "com" },
      { text: "foo", kind: "fn" },
      { text: "42", kind: "num" },
    ]));
  });

  it("highlights markup tags and attributes", () => {
    const code = "<div class=\"a\">hi</div>";
    const tokens = tokenizeCode(code, "html");
    expect(tokens.map((token) => token.text).join("")).toBe(code);
    expect(tokens).toEqual(expect.arrayContaining([{ text: "div", kind: "tag" }, { text: "class", kind: "att" }]));
  });
});
