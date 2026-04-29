function isSafeHttpUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function renderInline(text, keyPrefix) {
  const source = typeof text === "string" ? text : "";
  const nodes = [];
  let index = 0;
  let partIndex = 0;

  const pushText = (value) => {
    if (!value) {
      return;
    }

    const fragments = value.split("\n");
    fragments.forEach((fragment, fragmentIndex) => {
      if (fragment) {
        nodes.push(fragment);
      }

      if (fragmentIndex < fragments.length - 1) {
        nodes.push(<br key={`${keyPrefix}-br-${partIndex}-${fragmentIndex}`} />);
      }
    });
    partIndex += 1;
  };

  while (index < source.length) {
    const remaining = source.slice(index);

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      if (isSafeHttpUrl(href)) {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${partIndex}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="card__markdown-link"
          >
            {renderInline(label, `${keyPrefix}-label-${partIndex}`)}
          </a>,
        );
        index += linkMatch[0].length;
        partIndex += 1;
        continue;
      }
    }

    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push(
        <code key={`${keyPrefix}-code-${partIndex}`} className="card__markdown-inline-code">
          {codeMatch[1]}
        </code>,
      );
      index += codeMatch[0].length;
      partIndex += 1;
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${partIndex}`}>
          {renderInline(boldMatch[1], `${keyPrefix}-bold-inner-${partIndex}`)}
        </strong>,
      );
      index += boldMatch[0].length;
      partIndex += 1;
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      nodes.push(
        <em key={`${keyPrefix}-italic-${partIndex}`}>
          {renderInline(italicMatch[1], `${keyPrefix}-italic-inner-${partIndex}`)}
        </em>,
      );
      index += italicMatch[0].length;
      partIndex += 1;
      continue;
    }

    const nextSpecialIndexCandidates = [
      remaining.indexOf("["),
      remaining.indexOf("`"),
      remaining.indexOf("**"),
      remaining.indexOf("*"),
    ].filter((candidate) => candidate >= 0);
    const nextSpecialIndex = nextSpecialIndexCandidates.length > 0
      ? Math.min(...nextSpecialIndexCandidates)
      : -1;

    if (nextSpecialIndex === -1) {
      pushText(remaining);
      break;
    }

    if (nextSpecialIndex === 0) {
      pushText(remaining[0]);
      index += 1;
      continue;
    }

    pushText(remaining.slice(0, nextSpecialIndex));
    index += nextSpecialIndex;
  }

  return nodes;
}

function consumeParagraph(lines, startIndex) {
  const collected = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (
      trimmed.length === 0
      || /^#{1,6}\s+/.test(trimmed)
      || /^```/.test(trimmed)
      || /^>\s?/.test(trimmed)
      || /^[-*+]\s+/.test(trimmed)
      || /^\d+\.\s+/.test(trimmed)
    ) {
      break;
    }

    collected.push(line);
    index += 1;
  }

  return {
    lines: collected,
    nextIndex: index,
  };
}

function renderBlocks(markdown, keyPrefix = "md") {
  const lines = String(markdown ?? "").replaceAll("\r\n", "\n").split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      index += 1;

      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <pre key={`${keyPrefix}-code-${blocks.length}`} className="card__markdown-code-block">
          {language ? <span className="card__markdown-code-language">{language}</span> : null}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      const HeadingTag = `h${level}`;
      blocks.push(
        <HeadingTag key={`${keyPrefix}-heading-${blocks.length}`} className={`card__markdown-heading card__markdown-heading--h${level}`}>
          {renderInline(headingMatch[2], `${keyPrefix}-heading-inline-${blocks.length}`)}
        </HeadingTag>,
      );
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];

      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push(
        <blockquote key={`${keyPrefix}-quote-${blocks.length}`} className="card__markdown-blockquote">
          {renderBlocks(quoteLines.join("\n"), `${keyPrefix}-quote-inner-${blocks.length}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];

      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`${keyPrefix}-ul-${blocks.length}`} className="card__markdown-list">
          {items.map((item, itemIndex) => (
            <li key={`${keyPrefix}-ul-item-${blocks.length}-${itemIndex}`}>
              {renderInline(item, `${keyPrefix}-ul-inline-${blocks.length}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`${keyPrefix}-ol-${blocks.length}`} className="card__markdown-list card__markdown-list--ordered">
          {items.map((item, itemIndex) => (
            <li key={`${keyPrefix}-ol-item-${blocks.length}-${itemIndex}`}>
              {renderInline(item, `${keyPrefix}-ol-inline-${blocks.length}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraph = consumeParagraph(lines, index);
    blocks.push(
      <p key={`${keyPrefix}-p-${blocks.length}`} className="card__markdown-paragraph">
        {renderInline(paragraph.lines.join("\n"), `${keyPrefix}-p-inline-${blocks.length}`)}
      </p>,
    );
    index = paragraph.nextIndex;
  }

  return blocks;
}

export function renderSimpleMarkdown(markdown) {
  return renderBlocks(markdown);
}

export default renderSimpleMarkdown;
