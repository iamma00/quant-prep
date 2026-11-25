/**
 * A small, dependency-free Markdown renderer for the framework document.
 *
 * Supports the subset the document actually uses: headings, paragraphs,
 * emphasis, inline code, fenced code, blockquotes, ordered/unordered lists,
 * task lists, pipe tables, horizontal rules, links and diagram markers.
 *
 * Security: all source text is escaped before inline formatting. Raw HTML is
 * never passed through. SVG diagrams are build artefacts, but are still
 * stripped of scripts, foreignObject and event handlers before injection.
 */

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "section"
  );
}

function safeUrl(raw) {
  const url = String(raw).trim();
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (url.startsWith("#")) return url;
  return "#";
}

export function sanitizeSvg(raw) {
  const svg = String(raw ?? "");
  if (!/^\s*<svg[\s>]/i.test(svg)) return "";
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
}

/** Inline formatting. Source is escaped first; code spans are protected. */
export function inline(text) {
  const codes = [];
  let value = String(text ?? "");
  value = value.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  value = escapeHtml(value);

  value = value.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = safeUrl(url.replace(/&amp;/g, "&"));
    const external = /^https?:/i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer" data-external="1"' : "";
    return `<a href="${escapeHtml(href)}"${attrs}>${label}</a>`;
  });

  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  value = value.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  value = value.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  value = value.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  value = value.replace(/\u0000(\d+)\u0000/g, (_, index) => {
    return `<code>${escapeHtml(codes[Number(index)] ?? "")}</code>`;
  });
  return value;
}

function splitRow(line) {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  const cells = [];
  let current = "";
  let inCode = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\\" && value[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function alignmentFor(cell) {
  const value = cell.trim();
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}

function renderTable(lines, start) {
  const header = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map(alignmentFor);
  let i = start + 2;
  const rows = [];
  while (i < lines.length && /^\s*\|/.test(lines[i])) {
    rows.push(splitRow(lines[i]));
    i += 1;
  }
  const head = header
    .map((cell, index) => {
      const align = aligns[index] ? ` style="text-align:${aligns[index]}"` : "";
      return `<th${align}>${inline(cell)}</th>`;
    })
    .join("");
  const body = rows
    .map((row) => {
      const cells = header
        .map((_, index) => {
          const align = aligns[index] ? ` style="text-align:${aligns[index]}"` : "";
          return `<td${align}>${inline(row[index] ?? "")}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return {
    html: `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
    next: i,
  };
}

function isBlockStart(lines, index) {
  const line = lines[index] ?? "";
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^```/.test(trimmed)) return true;
  if (/^\[\[diagram:[a-z0-9-]+\]\]$/.test(trimmed)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true;
  if (/^>\s?/.test(trimmed)) return true;
  if (/^(\s*)([-*+]|\d+[.)])\s+/.test(line)) return true;
  if (/^\s*\|/.test(line) && isSeparator(lines[index + 1] ?? "")) return true;
  return false;
}

function renderList(lines, start) {
  const items = [];
  let baseIndent = null;
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) break;
    const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (match) {
      const indent = match[1].replace(/\t/g, "    ").length;
      if (baseIndent === null) baseIndent = indent;
      if (indent < baseIndent) break;
      items.push({
        indent,
        ordered: /^\d/.test(match[2]),
        content: match[3],
      });
      i += 1;
      continue;
    }
    if (items.length && /^\s+/.test(line)) {
      items[items.length - 1].content += ` ${line.trim()}`;
      i += 1;
      continue;
    }
    break;
  }

  function build(index, indent) {
    const ordered = items[index].ordered;
    const tag = ordered ? "ol" : "ul";
    let html = "";
    let hasTask = false;
    let cursor = index;

    while (cursor < items.length && items[cursor].indent >= indent) {
      if (items[cursor].indent > indent) {
        const nested = build(cursor, items[cursor].indent);
        html = html.replace(/<\/li>$/, `${nested.html}</li>`);
        hasTask = hasTask || nested.hasTask;
        cursor = nested.next;
        continue;
      }
      if (items[cursor].ordered !== ordered) break;

      let content = items[cursor].content;
      let task = "";
      const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        hasTask = true;
        task = `<input type="checkbox" disabled${taskMatch[1].toLowerCase() === "x" ? " checked" : ""}> `;
        content = taskMatch[2];
      }
      let li = `<li${task ? ' class="task-item"' : ""}>${task}${inline(content)}`;
      cursor += 1;
      if (cursor < items.length && items[cursor].indent > indent) {
        const nested = build(cursor, items[cursor].indent);
        li += nested.html;
        hasTask = hasTask || nested.hasTask;
        cursor = nested.next;
      }
      html += `${li}</li>`;
    }

    const cls = hasTask ? ' class="task-list"' : "";
    return { html: `<${tag}${cls}>${html}</${tag}>`, next: cursor, hasTask };
  }

  let html = "";
  let cursor = 0;
  while (cursor < items.length) {
    const result = build(cursor, items[cursor].indent);
    html += result.html;
    cursor = result.next;
  }
  return { html, next: i };
}

function renderCodeFence(lines, start) {
  const opening = lines[start].trim();
  const language = opening.slice(3).trim().split(/\s+/)[0] || "";
  let i = start + 1;
  const code = [];
  while (i < lines.length && !/^```/.test(lines[i].trim())) {
    code.push(lines[i]);
    i += 1;
  }
  if (i < lines.length) i += 1;
  const cls = language ? ` class="language-${escapeHtml(language)}"` : "";
  return {
    html: `<pre><button class="copy-code" type="button" data-copy-code>Copy</button><code${cls}>${escapeHtml(
      code.join("\n")
    )}</code></pre>`,
    next: i,
  };
}

function renderBlockquote(lines, start) {
  let i = start;
  const content = [];
  while (i < lines.length && /^\s*>/.test(lines[i])) {
    content.push(lines[i].replace(/^\s*>\s?/, ""));
    i += 1;
  }
  const paragraphs = content
    .join("\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^(\s*)([-*+]|\d+[.)])\s+/.test(block)) {
        const sub = renderList(block.split("\n"), 0);
        return sub.html;
      }
      return `<p>${inline(block.replace(/\n/g, " "))}</p>`;
    })
    .join("");
  return { html: `<blockquote>${paragraphs}</blockquote>`, next: i };
}

export function renderMarkdown(markdown, diagrams = {}) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const usedIds = new Map();
  let i = 0;

  const uniqueId = (base) => {
    const count = usedIds.get(base) ?? 0;
    usedIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const fence = renderCodeFence(lines, i);
      out.push(fence.html);
      i = fence.next;
      continue;
    }

    const diagramMatch = trimmed.match(/^\[\[diagram:([a-z0-9-]+)\]\]$/);
    if (diagramMatch) {
      const name = diagramMatch[1];
      let caption = "";
      if (i + 1 < lines.length) {
        const captionMatch = lines[i + 1].trim().match(/^\*(.+)\*\.?$/);
        if (captionMatch) {
          caption = captionMatch[1].replace(/\.$/, "");
          i += 1;
        }
      }
      const svg = sanitizeSvg(diagrams[name]);
      if (!svg) {
        out.push(
          `<div class="callout red"><strong>Diagram unavailable.</strong> This edition was built without the <code>${escapeHtml(
            name
          )}</code> diagram.</div>`
        );
      } else {
        out.push(
          `<figure class="diagram" data-diagram="${escapeHtml(name)}">${svg}${
            caption ? `<figcaption>${inline(caption)}</figcaption>` : ""
          }<a class="diagram-open" href="#/org/${escapeHtml(name)}">Open the interactive viewer</a></figure>`
        );
      }
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const id = uniqueId(slugify(text.replace(/[*_`]/g, "")));
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("<hr>");
      i += 1;
      continue;
    }

    if (/^\s*\|/.test(line) && isSeparator(lines[i + 1] ?? "")) {
      const table = renderTable(lines, i);
      out.push(table.html);
      i = table.next;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = renderBlockquote(lines, i);
      out.push(quote.html);
      i = quote.next;
      continue;
    }

    if (/^(\s*)([-*+]|\d+[.)])\s+/.test(line)) {
      const list = renderList(lines, i);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // Paragraph: collect until a blank line or the start of another block.
    const paragraph = [];
    while (i < lines.length && !isBlockStart(lines, i)) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    } else {
      // Defensive: never spin on an unhandled line.
      out.push(`<p>${inline(trimmed)}</p>`);
      i += 1;
    }
  }

  return out.join("\n");
}

/** Plain text for search indexing and excerpts. */
export function toPlainText(markdown) {
  return String(markdown ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\[diagram:[a-z0-9-]+\]\]/g, " ")
    .replace(/[#>*_`|]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
