// A small one-pass highlighter for the code tile when it isn't being edited
// (and for compact / rack renders). It's cheap and synchronous; CodeMirror
// takes over once the paper is clicked. Token classes match the editor's
// colours (CodeTile.css: .ct-tk-*).
//
// tokenizeCode(code, lang) -> [{ text, kind }] where kind is one of
// "kw" | "str" | "num" | "com" | "tag" | "att" | "fn" | "pun" | null.

const KW = {
  js: "const let var function return if else for while do switch case break continue new class extends import from export default async await try catch finally throw typeof instanceof in of this null undefined true false yield",
  py: "def return if elif else for while in not and or is import from as class try except finally raise with lambda pass break continue None True False self yield global async await",
  go: "package import func return if else for range var const type struct interface map chan go defer select switch case default break continue nil true false",
  rust: "fn let mut pub use mod impl struct enum trait match if else for while loop return self Self crate as where in ref move async await true false",
  java: "public private protected static final class interface extends implements new return if else for while do switch case break continue try catch finally throw throws void int boolean double float long char null true false this super import package",
  sql: "select from where join inner left right outer on group by order having insert into values update set delete create table alter drop index as and or not null is in like limit offset distinct primary key",
  bash: "if then else elif fi for in do done while case esac function return echo export local sudo cd",
  css: "",
  kotlin: "fun val var class object return if else when for while in is as null true false import package interface override data",
  swift: "func let var class struct enum protocol extension return if else guard for in while switch case import self nil true false some",
  c: "int char float double void return if else for while do switch case break continue struct typedef const static unsigned sizeof include define",
  php: "function return if else foreach as echo class public private new array null true false",
  ruby: "def end class module if elsif else unless do return puts require nil true false self yield",
  glsl: "uniform varying attribute in out void float int vec2 vec3 vec4 mat3 mat4 sampler2D return if else for precision highp mediump",
};
KW.ts = `${KW.js} interface type enum implements readonly private public protected declare namespace abstract as keyof never unknown any string number boolean void`;
KW.jsx = KW.js;
KW.tsx = KW.ts;
KW.cpp = `${KW.c} class public private namespace using std template typename new delete auto nullptr`;
KW.cs = `${KW.java} using namespace var async await string`;

const KEYWORDS = Object.fromEntries(
  Object.entries(KW).map(([lang, words]) => [lang, new Set(words.split(/\s+/).filter(Boolean))]),
);

const LINE_COMMENT = { py: "#", ruby: "#", bash: "#", yaml: "#", sql: "--" };
const NO_SYNTAX = new Set(["text", "md", "json", "yaml"]);
const patternCache = new Map();

function tokenPattern(lineComment) {
  if (!patternCache.has(lineComment)) {
    const escaped = lineComment.replace(/[/#-]/g, "\\$&");
    patternCache.set(lineComment, new RegExp(
      "(\\/\\*[\\s\\S]*?\\*\\/)"
      + `|(${escaped}[^\\n]*)`
      + "|(\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`)"
      + "|(\\b\\d+(?:\\.\\d+)?\\b)"
      + "|([A-Za-z_$][\\w$]*)(?=(\\s*\\()?)",
      "g",
    ));
  }
  const pattern = patternCache.get(lineComment);
  pattern.lastIndex = 0;
  return pattern;
}

function tokenizeMarkup(code) {
  const tokens = [];
  const pattern = /(<!--[\s\S]*?-->)|(<\/?)([\w-]+)([^<>]*?)(\/?>)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(code))) {
    if (match.index > last) tokens.push({ text: code.slice(last, match.index), kind: null });
    if (match[1]) {
      tokens.push({ text: match[1], kind: "com" });
    } else {
      tokens.push({ text: match[2], kind: "pun" }, { text: match[3], kind: "tag" });
      const attrs = match[4];
      const attrPattern = /([\w:-]+)(=)("[^"]*"|'[^']*')/g;
      let attrLast = 0;
      let attr;
      while ((attr = attrPattern.exec(attrs))) {
        if (attr.index > attrLast) tokens.push({ text: attrs.slice(attrLast, attr.index), kind: null });
        tokens.push({ text: attr[1], kind: "att" }, { text: attr[2], kind: null }, { text: attr[3], kind: "str" });
        attrLast = attr.index + attr[0].length;
      }
      if (attrLast < attrs.length) tokens.push({ text: attrs.slice(attrLast), kind: null });
      tokens.push({ text: match[5], kind: "pun" });
    }
    last = match.index + match[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), kind: null });
  return tokens;
}

function tokenizeJson(code) {
  const tokens = [];
  const pattern = /("(?:\\.|[^"\\\n])*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(code))) {
    if (match.index > last) tokens.push({ text: code.slice(last, match.index), kind: null });
    if (match[1]) {
      tokens.push({ text: match[1], kind: match[2] ? "att" : "str" });
      if (match[2]) tokens.push({ text: match[2], kind: null });
    } else if (match[3]) {
      tokens.push({ text: match[3], kind: "num" });
    } else {
      tokens.push({ text: match[4], kind: "kw" });
    }
    last = match.index + match[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), kind: null });
  return tokens;
}

export function tokenizeCode(code, lang) {
  const source = String(code ?? "");
  if (!source) return [];
  if (lang === "html") return tokenizeMarkup(source);
  if (lang === "json") return tokenizeJson(source);
  if (!lang || NO_SYNTAX.has(lang)) return [{ text: source, kind: null }];

  const keywords = KEYWORDS[lang] || KEYWORDS.js;
  const caseless = lang === "sql";
  const pattern = tokenPattern(LINE_COMMENT[lang] || "//");
  const tokens = [];
  let last = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const [token, block, line, string, number, word, call] = match;
    if (token.length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    if (match.index > last) tokens.push({ text: source.slice(last, match.index), kind: null });
    let kind = null;
    if (block || line) kind = "com";
    else if (string) kind = "str";
    else if (number) kind = "num";
    else if (word && keywords.has(caseless ? word.toLowerCase() : word)) kind = "kw";
    else if (word && call) kind = "fn";
    tokens.push({ text: token, kind });
    last = match.index + token.length;
  }
  if (last < source.length) tokens.push({ text: source.slice(last), kind: null });
  return tokens;
}
