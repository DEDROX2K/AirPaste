const LANGUAGE_KEYWORDS = Object.freeze({
  bash: ["if", "then", "else", "fi", "for", "do", "done", "case", "esac", "function", "export", "local", "return", "echo"],
  javascript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case", "break", "continue", "new", "class", "extends", "import", "from", "export", "await", "async", "try", "catch", "finally", "throw"],
  typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case", "break", "continue", "new", "class", "extends", "import", "from", "export", "await", "async", "try", "catch", "finally", "throw", "type", "interface", "implements", "enum", "readonly"],
  json: [],
  css: ["display", "position", "color", "background", "border", "padding", "margin", "flex", "grid", "font-size"],
  html: [],
  sql: ["select", "from", "where", "order", "by", "limit", "insert", "into", "update", "delete", "join", "left", "right", "inner", "outer", "group", "having", "as", "and", "or", "not", "null", "create", "table"],
  regex: [],
  python: ["def", "return", "if", "elif", "else", "for", "while", "class", "import", "from", "as", "try", "except", "finally", "with", "lambda", "yield", "None", "True", "False"],
  markdown: [],
  yaml: [],
  plain: [],
});

function renderToken(text, className, key) {
  return (
    <span key={key} className={className}>
      {text}
    </span>
  );
}

function tokenizeLine(language, line, lineIndex) {
  const normalizedLanguage = typeof language === "string" ? language : "plain";
  const tokens = [];
  let remainder = line;
  let tokenIndex = 0;

  const pushPlain = (value) => {
    if (!value) {
      return;
    }

    tokens.push(renderToken(value, "card__code-token", `${lineIndex}-plain-${tokenIndex}`));
    tokenIndex += 1;
  };

  const keywordPattern = LANGUAGE_KEYWORDS[normalizedLanguage]?.length
    ? new RegExp(`\\b(${LANGUAGE_KEYWORDS[normalizedLanguage].join("|")})\\b`, normalizedLanguage === "sql" ? "i" : "")
    : null;

  while (remainder.length > 0) {
    const commentMatch = normalizedLanguage === "bash"
      ? remainder.match(/^#.*$/)
      : normalizedLanguage === "sql"
        ? remainder.match(/^--.*$/)
        : normalizedLanguage === "python"
          ? remainder.match(/^#.*$/)
          : normalizedLanguage === "javascript" || normalizedLanguage === "typescript" || normalizedLanguage === "css"
            ? remainder.match(/^\/\/.*$/)
            : normalizedLanguage === "yaml"
              ? remainder.match(/^#.*$/)
              : null;

    if (commentMatch) {
      tokens.push(renderToken(commentMatch[0], "card__code-token card__code-token--comment", `${lineIndex}-comment-${tokenIndex}`));
      break;
    }

    const stringMatch = remainder.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    if (stringMatch) {
      tokens.push(renderToken(stringMatch[0], "card__code-token card__code-token--string", `${lineIndex}-string-${tokenIndex}`));
      remainder = remainder.slice(stringMatch[0].length);
      tokenIndex += 1;
      continue;
    }

    if (normalizedLanguage === "regex") {
      const regexParts = remainder.match(/^(\\.|[^A-Za-z0-9_\s])+/);
      if (regexParts) {
        tokens.push(renderToken(regexParts[0], "card__code-token card__code-token--regex", `${lineIndex}-regex-${tokenIndex}`));
        remainder = remainder.slice(regexParts[0].length);
        tokenIndex += 1;
        continue;
      }
    }

    const numberMatch = remainder.match(/^-?\b\d+(?:\.\d+)?\b/);
    if (numberMatch) {
      tokens.push(renderToken(numberMatch[0], "card__code-token card__code-token--number", `${lineIndex}-number-${tokenIndex}`));
      remainder = remainder.slice(numberMatch[0].length);
      tokenIndex += 1;
      continue;
    }

    if (normalizedLanguage === "html") {
      const tagMatch = remainder.match(/^(<\/?[a-zA-Z][^>]*>)/);
      if (tagMatch) {
        tokens.push(renderToken(tagMatch[0], "card__code-token card__code-token--keyword", `${lineIndex}-tag-${tokenIndex}`));
        remainder = remainder.slice(tagMatch[0].length);
        tokenIndex += 1;
        continue;
      }
    }

    if (normalizedLanguage === "markdown") {
      const markdownLeadMatch = remainder.match(/^(#{1,6}\s.*|[-*+]\s.*|\d+\.\s.*|>\s.*)/);
      if (markdownLeadMatch) {
        tokens.push(renderToken(markdownLeadMatch[0], "card__code-token card__code-token--keyword", `${lineIndex}-md-${tokenIndex}`));
        break;
      }
    }

    if (keywordPattern) {
      const keywordMatch = remainder.match(keywordPattern);
      if (keywordMatch && keywordMatch.index === 0) {
        tokens.push(renderToken(keywordMatch[0], "card__code-token card__code-token--keyword", `${lineIndex}-kw-${tokenIndex}`));
        remainder = remainder.slice(keywordMatch[0].length);
        tokenIndex += 1;
        continue;
      }
    }

    const punctuationMatch = remainder.match(/^[{}[\]().,:;<>/=+-]+/);
    if (punctuationMatch) {
      tokens.push(renderToken(punctuationMatch[0], "card__code-token card__code-token--punctuation", `${lineIndex}-punct-${tokenIndex}`));
      remainder = remainder.slice(punctuationMatch[0].length);
      tokenIndex += 1;
      continue;
    }

    const nextSpecialCandidates = [
      remainder.search(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/),
      remainder.search(/-?\b\d+(?:\.\d+)?\b/),
      remainder.search(/[{}[\]().,:;<>/=+-]+/),
      keywordPattern ? remainder.search(keywordPattern) : -1,
    ].filter((candidate) => candidate >= 0);
    const nextSpecialIndex = nextSpecialCandidates.length > 0 ? Math.min(...nextSpecialCandidates) : -1;

    if (nextSpecialIndex === -1) {
      pushPlain(remainder);
      break;
    }

    if (nextSpecialIndex === 0) {
      pushPlain(remainder[0]);
      remainder = remainder.slice(1);
      continue;
    }

    pushPlain(remainder.slice(0, nextSpecialIndex));
    remainder = remainder.slice(nextSpecialIndex);
  }

  return tokens.length > 0 ? tokens : [renderToken("", "card__code-token", `${lineIndex}-empty`)];
}

export function renderCodeSyntax(language, code) {
  const lines = String(code ?? "").replaceAll("\r\n", "\n").split("\n");

  return lines.map((line, lineIndex) => ({
    lineNumber: lineIndex + 1,
    content: tokenizeLine(language, line, lineIndex),
  }));
}

export default renderCodeSyntax;
