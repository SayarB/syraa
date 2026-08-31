import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";

marked.setOptions({
  breaks: true,
  gfm: true,
});

/** Render markdown to sanitized HTML for chat bubbles. */
export function renderMarkdown(content) {
  const html = marked.parse(content, { async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
