/**
 * Converts LLM-generated standard Markdown to Telegram MarkdownV2.
 *
 * Handles the most common LLM output patterns:
 *   **bold** / __bold__  → *bold*
 *   *italic* / _italic_  → _italic_
 *   ~~strike~~           → ~strike~
 *   `code`               → `code`
 *   ```lang\ncode```     → ```lang\ncode```
 *   [text](url)          → [text](url)
 *   # Heading            → *Heading*
 *   ---                  → (removed)
 *   > blockquote         → >blockquote
 *
 * All remaining special chars are escaped as required by MarkdownV2.
 * Unclosed code blocks (during streaming) are emitted verbatim so that
 * closeOpenMarkdownV2 can detect and close them.
 */
export function toMarkdownV2(src: string): string {
  const out: string[] = [];
  let i = 0;
  const len = src.length;
  const isLineStart = () => i === 0 || src[i - 1] === "\n";

  while (i < len) {
    // ── Code block ```...``` ───────────────────────────────────────────────
    if (src[i] === "`" && src[i + 1] === "`" && src[i + 2] === "`") {
      const closeIdx = src.indexOf("```", i + 3);
      if (closeIdx === -1) {
        // Unclosed (streaming) — emit verbatim so closeOpenMarkdownV2 can close it
        out.push(src.slice(i));
        break;
      }
      const inner = src.slice(i + 3, closeIdx);
      const nl = inner.indexOf("\n");
      const lang = nl > 0 ? inner.slice(0, nl).trim() : "";
      const code = nl >= 0 ? inner.slice(nl + 1) : inner;
      out.push("```" + lang + "\n" + code + (code.endsWith("\n") ? "" : "\n") + "```");
      i = closeIdx + 3;
      continue;
    }

    // ── Inline code `...` ─────────────────────────────────────────────────
    if (src[i] === "`") {
      const closeIdx = src.indexOf("`", i + 1);
      if (closeIdx !== -1 && !src.slice(i + 1, closeIdx).includes("\n")) {
        out.push("`" + src.slice(i + 1, closeIdx) + "`");
        i = closeIdx + 1;
        continue;
      }
    }

    // ── **bold** → *bold* ─────────────────────────────────────────────────
    if (src[i] === "*" && src[i + 1] === "*" && src[i + 2] !== " ") {
      const closeIdx = src.indexOf("**", i + 2);
      if (closeIdx !== -1) {
        out.push("*" + escapeMdV2(src.slice(i + 2, closeIdx)) + "*");
        i = closeIdx + 2;
        continue;
      }
    }

    // ── __bold__ → *bold* ─────────────────────────────────────────────────
    if (src[i] === "_" && src[i + 1] === "_" && src[i + 2] !== " ") {
      const closeIdx = src.indexOf("__", i + 2);
      if (closeIdx !== -1) {
        out.push("*" + escapeMdV2(src.slice(i + 2, closeIdx)) + "*");
        i = closeIdx + 2;
        continue;
      }
    }

    // ── ~~strikethrough~~ → ~text~ ────────────────────────────────────────
    if (src[i] === "~" && src[i + 1] === "~") {
      const closeIdx = src.indexOf("~~", i + 2);
      if (closeIdx !== -1) {
        out.push("~" + escapeMdV2(src.slice(i + 2, closeIdx)) + "~");
        i = closeIdx + 2;
        continue;
      }
    }

    // ── *italic* → _italic_ (skip list markers: "* " at line start) ───────
    if (
      src[i] === "*" &&
      src[i + 1] !== "*" &&
      src[i + 1] !== " " &&
      src[i + 1] !== "\n" &&
      src[i + 1] !== undefined
    ) {
      const closeIdx = src.indexOf("*", i + 1);
      if (closeIdx !== -1 && !src.slice(i + 1, closeIdx).includes("\n")) {
        out.push("_" + escapeMdV2(src.slice(i + 1, closeIdx)) + "_");
        i = closeIdx + 1;
        continue;
      }
    }

    // ── _italic_ ──────────────────────────────────────────────────────────
    if (
      src[i] === "_" &&
      src[i + 1] !== "_" &&
      src[i + 1] !== " " &&
      src[i + 1] !== "\n" &&
      src[i + 1] !== undefined
    ) {
      const closeIdx = src.indexOf("_", i + 1);
      if (closeIdx !== -1 && !src.slice(i + 1, closeIdx).includes("\n")) {
        out.push("_" + escapeMdV2(src.slice(i + 1, closeIdx)) + "_");
        i = closeIdx + 1;
        continue;
      }
    }

    // ── [text](url) ───────────────────────────────────────────────────────
    if (src[i] === "[") {
      const textClose = src.indexOf("]", i + 1);
      if (textClose !== -1 && src[textClose + 1] === "(") {
        const urlClose = src.indexOf(")", textClose + 2);
        if (urlClose !== -1) {
          const text = src.slice(i + 1, textClose);
          const url = src.slice(textClose + 2, urlClose);
          out.push(
            "[" + escapeMdV2(text) + "](" + url.replace(/\\/g, "\\\\").replace(/\)/g, "\\)") + ")",
          );
          i = urlClose + 1;
          continue;
        }
      }
    }

    // ── Line-start patterns ───────────────────────────────────────────────
    if (isLineStart()) {
      // # Heading → *Heading*
      const headingMatch = /^#{1,6} (.+)/.exec(src.slice(i));
      if (headingMatch) {
        out.push("*" + escapeMdV2(headingMatch[1]) + "*");
        i += headingMatch[0].length;
        continue;
      }

      // --- horizontal rule → blank line
      const hrMatch = /^[-*_]{3,}[ \t]*(\n|$)/.exec(src.slice(i));
      if (hrMatch) {
        i += hrMatch[0].length;
        continue;
      }

      // > blockquote
      const quoteMatch = /^(>+) ?(.*)/.exec(src.slice(i));
      if (quoteMatch) {
        out.push(">".repeat(quoteMatch[1].length) + escapeMdV2(quoteMatch[2]));
        i += quoteMatch[0].length;
        continue;
      }
    }

    // ── Plain character ───────────────────────────────────────────────────
    const ch = src[i];
    if (MDV2_ESCAPE.test(ch)) out.push("\\");
    out.push(ch);
    i++;
  }

  return out.join("");
}

const MDV2_ESCAPE = /[_*[\]()~`>#+=|{}.!\-\\]/;
const MDV2_ESCAPE_GLOBAL = /[_*[\]()~`>#+=|{}.!\-\\]/g;

/** Escape MarkdownV2 special chars in plain text spans. */
export function escapeMdV2(text: string): string {
  return text.replace(MDV2_ESCAPE_GLOBAL, "\\$&");
}

/**
 * Closes any unclosed MarkdownV2 formatting markers so a partial streaming
 * response is always valid. Returns { closed, opener } where opener must be
 * prepended to the next message to continue the formatting context.
 * Priority: ``` → ` → * → _
 */
export function closeOpenMarkdownV2(text: string): { closed: string; opener: string } {
  if ((text.match(/```/g) ?? []).length % 2 !== 0) {
    return { closed: text + "\n```", opener: "```\n" };
  }

  // Strip code blocks and inline code before counting inline markers
  const noBlocks = text.replace(/```[\s\S]*?```/g, "");
  const noInline = noBlocks.replace(/`[^`\n]*`/g, "");

  if ((noBlocks.match(/`/g) ?? []).length % 2 !== 0) {
    return { closed: text + "`", opener: "`" };
  }

  // Strip escaped chars (e.g. \* \_ ) before counting formatting markers —
  // they are literal characters, not formatting.
  const unescaped = noInline.replace(/\\./g, "");

  if ((unescaped.match(/\*/g) ?? []).length % 2 !== 0) {
    return { closed: text + "*", opener: "*" };
  }

  if ((unescaped.match(/_/g) ?? []).length % 2 !== 0) {
    return { closed: text + "_", opener: "_" };
  }

  return { closed: text, opener: "" };
}
