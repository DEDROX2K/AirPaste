// CodeMirror language support for each code tile language key, loaded on
// demand so a board with one Python tile never ships the Rust parser.
// Each loader resolves to an Extension (or [] for plain text).

async function legacy(load) {
  const [{ StreamLanguage }, mode] = await Promise.all([import("@codemirror/language"), load()]);
  return StreamLanguage.define(mode);
}

const LOADERS = {
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  tsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: true })),
  py: () => import("@codemirror/lang-python").then((m) => m.python()),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  scss: () => import("@codemirror/lang-sass").then((m) => m.sass({ indented: false })),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  sql: () => import("@codemirror/lang-sql").then((m) => m.sql()),
  rust: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  java: () => import("@codemirror/lang-java").then((m) => m.java()),
  c: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  php: () => import("@codemirror/lang-php").then((m) => m.php({ plain: true })),
  yaml: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  go: () => legacy(() => import("@codemirror/legacy-modes/mode/go").then((m) => m.go)),
  bash: () => legacy(() => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell)),
  swift: () => legacy(() => import("@codemirror/legacy-modes/mode/swift").then((m) => m.swift)),
  ruby: () => legacy(() => import("@codemirror/legacy-modes/mode/ruby").then((m) => m.ruby)),
  kotlin: () => legacy(() => import("@codemirror/legacy-modes/mode/clike").then((m) => m.kotlin)),
  cs: () => legacy(() => import("@codemirror/legacy-modes/mode/clike").then((m) => m.csharp)),
  glsl: () => legacy(() => import("@codemirror/legacy-modes/mode/clike").then((m) => m.shader)),
};

const cache = new Map();

export function loadCodeLanguage(key) {
  const loader = LOADERS[key];
  if (!loader) return Promise.resolve([]);
  if (!cache.has(key)) {
    cache.set(key, loader().catch(() => {
      cache.delete(key);
      return [];
    }));
  }
  return cache.get(key);
}
