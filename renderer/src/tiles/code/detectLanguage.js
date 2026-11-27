// Guesses a code tile's language from its text: no library, just weighted
// regex signals summed per language over the first 6,000 characters. JSON is
// checked first (starts with { or [ and parses). Families add up: TS counts
// the JS signals too, JSX/TSX build on JS/TS, SCSS on CSS, C++ on C. The best
// score wins if it's above 2, else "text".
//
// Keys match CODE_LANGUAGES in model.js.
const RULES = [
  ["js", 3, /\b(const|let|var)\s+\w+\s*=/], ["js", 3, /=>\s*[{(\w]/], ["js", 3, /\bfunction\s*\w*\s*\(/],
  ["js", 4, /\bconsole\.\w+\(/], ["js", 3, /\brequire\(['"]/], ["js", 3, /^\s*import .+ from ['"].+['"];?\s*$/m],
  ["js", 2, /^\s*export (default |const |function )/m], ["js", 2, /document\.|window\./], ["js", 2, /===|!==/],
  ["ts", 5, /^\s*(export\s+)?(interface|type)\s+\w+(<.+>)?\s*[={]/m], ["ts", 4, /:\s*(string|number|boolean|void|any|unknown)\b/],
  ["ts", 3, /\bas const\b|\benum\s+\w+\s*\{|\bimplements\b|\breadonly\b/], ["ts", 2, /<\w+(,\s*\w+)*>\(/],
  ["jsx", 6, /return\s*\(?\s*<[A-Za-z]/], ["jsx", 5, /<[A-Z]\w*(\s+[\w-]+=|\s*\/>|>[^<\n]*<\/)/], ["jsx", 3, /className=/], ["jsx", 2, /\buse(State|Effect|Ref|Memo)\(/],
  ["py", 6, /^\s*def \w+\(.*\)\s*(->\s*[\w[\], .]+)?:\s*$/m], ["py", 4, /^\s*(from \w[\w.]* )?import \w[\w., ]*$/m],
  ["py", 3, /\bself\b/], ["py", 3, /\belif\b|\bNone\b|\bTrue\b|\bFalse\b/], ["py", 3, /^\s*(if|for|while|with|class) .+:\s*$/m],
  ["py", 2, /\bprint\(/], ["py", 3, /^\s*@\w+/m], ["py", 2, /f['"].*\{.*\}.*['"]/],
  ["html", 7, /<!doctype html|<html[\s>]/i], ["html", 4, /<(div|span|section|head|body|p|a|ul|li|h[1-6]|button|img|meta|link)\b[^>]*>/i],
  ["html", 3, /<\/(div|p|span|a|li|ul|section|body|html|h[1-6])>/i],
  ["css", 6, /^\s*[.#@]?[\w\-\s,.#:>*[\]="'()]+\{\s*$/m], ["css", 5, /^\s*[\w-]+\s*:\s*[^;{}]+;\s*$/m], ["css", 3, /@media|@keyframes|:root|var\(--/],
  ["scss", 6, /^\s*\$[\w-]+\s*:/m], ["scss", 4, /&:\w+|@mixin|@include/],
  ["sql", 7, /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/i], ["sql", 4, /\b(FROM|WHERE|JOIN|GROUP BY|ORDER BY|VALUES)\b/],
  ["go", 8, /^package \w+/m], ["go", 5, /\bfunc (\(\w+ \*?\w+\) )?\w+\(/], ["go", 3, /:=/], ["go", 4, /\bfmt\.\w+\(/],
  ["rust", 6, /\bfn \w+(<.*>)?\(/], ["rust", 5, /\blet mut\b/], ["rust", 4, /\b(impl|pub fn|use \w+::|-> \w+|println!|&mut|Vec<|Option<|Result<)/],
  ["java", 7, /\bpublic (static )?(class|void|interface)\b/], ["java", 6, /System\.out\.print/], ["java", 3, /\bprivate final\b|@Override/],
  ["kotlin", 7, /^\s*fun \w+\(/m], ["kotlin", 4, /\bval \w+\s*[:=]/], ["kotlin", 2, /\bprintln\(/],
  ["swift", 6, /import (SwiftUI|Foundation|UIKit)/], ["swift", 5, /\bfunc \w+\(.*\)( -> \w+)? \{/], ["swift", 4, /\bguard let\b|\bif let\b|: some View/],
  ["c", 6, /#include\s*<\w+\.h>/], ["c", 3, /\bprintf\(/], ["c", 3, /\bint main\(/],
  ["cpp", 7, /#include\s*<(iostream|vector|string|map|memory)>/], ["cpp", 6, /\bstd::/], ["cpp", 4, /\bcout\s*<</],
  ["cs", 7, /^\s*using System/m], ["cs", 5, /\bnamespace \w+/], ["cs", 6, /Console\.Write/], ["cs", 3, /\bpublic (async )?(Task|void|string|int)\b/],
  ["php", 10, /<\?php/], ["php", 4, /\$\w+\s*=/], ["php", 3, /\becho\b/],
  ["ruby", 5, /^\s*def \w+[^:(]*$/m], ["ruby", 4, /^\s*end\s*$/m], ["ruby", 4, /\bputs\b|\brequire ['"]/], ["ruby", 3, /\.each do \|/],
  ["bash", 9, /^#!\/(usr\/)?bin\/(env )?(ba|z)?sh/], ["bash", 5, /^\s*(sudo |cd |ls |echo |export |npm |pnpm |yarn |git |brew |apt |mkdir |rm |curl )/m], ["bash", 3, /\$\{?\w+\}?|\|\s*grep\b/],
  ["yaml", 5, /^[\w-]+:\s*$/m], ["yaml", 3, /^\s+- [\w"']/m], ["yaml", 3, /^[\w-]+: [^{};]+$/m],
  ["md", 6, /^#{1,6} \S/m], ["md", 4, /^```/m], ["md", 3, /\[[^\]]+\]\([^)]+\)/], ["md", 2, /^\s*[-*] \S/m], ["md", 2, /\*\*[^*]+\*\*/],
  ["glsl", 8, /gl_(FragColor|FragCoord|Position)/], ["glsl", 5, /\b(uniform|varying|attribute) (vec|float|mat|sampler)/], ["glsl", 4, /\bvec[234]\(/],
];

const SAMPLE_LIMIT = 6000;

// null for empty code (the badge then says "File type").
export function detectCodeLanguage(code) {
  const src = String(code ?? "").trim();
  if (!src) return null;
  if (/^[[{]/.test(src)) {
    try {
      JSON.parse(src);
      return "json";
    } catch {
      // not JSON
    }
  }

  const sample = src.length > SAMPLE_LIMIT ? src.slice(0, SAMPLE_LIMIT) : src;
  const score = {};
  for (const [lang, weight, pattern] of RULES) {
    if (pattern.test(sample)) score[lang] = (score[lang] || 0) + weight;
  }

  if (score.jsx) {
    if (score.ts) score.tsx = score.ts + score.jsx + (score.js || 0);
    else score.jsx += score.js || 0;
  }
  if (score.ts) score.ts += score.js || 0;
  if (score.scss) score.scss += score.css || 0;
  if (score.cpp) score.cpp += score.c || 0;
  if (score.html && score.jsx) score.html -= 4;
  if (score.kotlin && score.swift) score.kotlin -= 2;

  let best = "text";
  let bestScore = 2;
  for (const lang of Object.keys(score)) {
    if (score[lang] > bestScore) {
      best = lang;
      bestScore = score[lang];
    }
  }
  return best;
}
