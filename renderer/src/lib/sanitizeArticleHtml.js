// Article HTML comes from the web (via Readability in the main process), so
// before the reader shows it, it's rebuilt from an allowlist: text structure,
// links and images only. No scripts, styles, frames, forms or event handlers
// survive, and links and images must be http(s).
//
// DOMParser documents are inert: nothing in them runs or loads while they're
// being cleaned.

// Kept, with their content.
const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "cite", "code", "dd", "del", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd",
  "li", "mark", "ol", "p", "pre", "q", "s", "section", "article", "small", "span", "strong", "sub",
  "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul",
]);

// Removed along with everything inside them. Any other tag is unwrapped:
// the tag goes, its content stays.
const DROPPED_TAGS = new Set([
  "audio", "button", "canvas", "embed", "form", "iframe", "input", "link", "math", "meta",
  "noscript", "object", "script", "select", "style", "svg", "template", "textarea", "video",
]);

const ALLOWED_ATTRIBUTES = {
  a: ["href", "title"],
  img: ["src", "alt", "title", "width", "height"],
  ol: ["start"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  time: ["datetime"],
};

function isSafeUrl(value, { allowMailto = false } = {}) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || (allowMailto && url.protocol === "mailto:");
  } catch {
    return false;
  }
}

function cleanElement(element) {
  for (const child of [...element.children]) {
    const tag = child.tagName.toLowerCase();

    if (DROPPED_TAGS.has(tag)) {
      child.remove();
      continue;
    }

    cleanElement(child);

    if (!ALLOWED_TAGS.has(tag)) {
      child.replaceWith(...child.childNodes);
      continue;
    }

    const allowed = ALLOWED_ATTRIBUTES[tag] ?? [];
    for (const attribute of [...child.attributes]) {
      if (!allowed.includes(attribute.name.toLowerCase())) {
        child.removeAttribute(attribute.name);
      }
    }

    if (tag === "a") {
      const href = child.getAttribute("href");
      if (!href || !isSafeUrl(href, { allowMailto: true })) {
        child.removeAttribute("href");
      }
    }

    if (tag === "img") {
      const src = child.getAttribute("src");
      if (!src || !isSafeUrl(src)) {
        child.remove();
        continue;
      }

      child.setAttribute("loading", "lazy");
      child.setAttribute("referrerpolicy", "no-referrer");
      child.setAttribute("draggable", "false");
    }
  }

  // Comments can hide conditional markup; drop them too.
  for (const node of [...element.childNodes]) {
    if (node.nodeType === 8) {
      node.remove();
    }
  }
}

export function sanitizeArticleHtml(html) {
  if (typeof html !== "string" || html.length === 0 || typeof DOMParser === "undefined") {
    return "";
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  cleanElement(doc.body);
  return doc.body.innerHTML;
}
