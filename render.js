(function initChatlogRender(root) {
  "use strict";

  const PRINT_STYLES = `
    :root {
      color-scheme: light;
      --ink: #1e1e1b;
      --muted: #66635c;
      --paper: #fffdf8;
      --soft: #f4efe5;
      --line: #d9d0c1;
      --accent: #a74727;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html { background: #e8e3d9; }
    body { margin: 0; color: var(--ink); background: #e8e3d9; }
    .transcript-document {
      width: min(860px, calc(100% - 40px));
      margin: 36px auto 72px;
      padding: 68px 72px;
      background: var(--paper);
      box-shadow: 0 14px 48px rgba(35, 30, 22, .13);
    }
    .document-header { padding-bottom: 32px; border-bottom: 2px solid var(--ink); }
    .document-kicker {
      margin: 0 0 12px; color: var(--accent); font-size: 11px; font-weight: 800;
      letter-spacing: .14em; text-transform: uppercase;
    }
    .document-title {
      margin: 0 0 24px; font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(34px, 6vw, 54px); font-weight: 500; line-height: 1.02;
      overflow-wrap: anywhere;
    }
    .document-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 28px; margin: 0; }
    .document-meta div { display: grid; grid-template-columns: 84px 1fr; gap: 8px; }
    .document-meta dt { color: var(--muted); font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: .06em; }
    .document-meta dd { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
    a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
    .completeness-banner { margin: 24px 0 0; padding: 12px 14px; border-left: 4px solid #327456; background: #edf5ef; font-size: 12px; line-height: 1.5; }
    .completeness-banner[data-level="warning"] { border-color: #ad681b; background: #fff5e4; }
    .completeness-banner[data-level="partial"] { border-color: #a33e38; background: #fff0ed; }
    .banner-warnings { margin: 9px 0 0; padding-left: 1.35em; }
    .turn { padding: 34px 0; border-bottom: 1px solid var(--line); }
    .turn-header { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; margin-bottom: 16px; break-after: avoid; }
    .turn-role { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 22px; font-weight: 600; }
    .turn-number { color: var(--accent); }
    .turn-time { color: var(--muted); font-size: 11px; white-space: nowrap; }
    .turn-body { font-size: 14px; line-height: 1.68; overflow-wrap: anywhere; }
    .turn-body > :first-child, .block-content > :first-child { margin-top: 0; }
    .turn-body > :last-child, .block-content > :last-child { margin-bottom: 0; }
    .turn-body p { margin: 0 0 1em; }
    .turn-body h3, .turn-body h4, .turn-body h5, .turn-body h6 { margin: 1.5em 0 .55em; line-height: 1.2; }
    .turn-body h3 { font-family: Georgia, "Times New Roman", serif; font-size: 20px; }
    .turn-body h4 { font-size: 16px; }
    .turn-body ul, .turn-body ol { margin: .6em 0 1em; padding-left: 1.55em; }
    .turn-body li { margin: .25em 0; }
    .citation-list { margin: 16px 0 0; padding: 12px 14px; border-left: 3px solid var(--line); background: var(--soft); font-size: 11px; color: var(--muted); }
    .citation-list > p { margin: 0 0 6px; color: var(--ink); font-weight: 750; }
    .citation-list ol { margin: 0; padding-left: 1.5em; }
    .citation-quote { display: block; margin-top: 2px; }
    blockquote { margin: 1em 0; padding: .15em 0 .15em 1em; border-left: 3px solid var(--line); color: #504e48; }
    pre { max-width: 100%; margin: 1em 0; padding: 15px 17px; border: 1px solid #d8d3ca; border-radius: 4px; background: #f3f1ec; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2; }
    code { border-radius: 3px; background: #f0ede6; font: .9em/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre code { background: transparent; font-size: inherit; }
    table { width: 100%; margin: 1em 0; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: var(--soft); }
    .content-block { margin: 18px 0; padding: 14px 16px; border: 1px solid var(--line); border-radius: 4px; break-inside: avoid; }
    .block-label { margin: 0 0 9px; color: var(--accent); font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    .content-block[data-kind="notice"], .content-block[data-kind="unknown"] { border-style: dashed; color: var(--muted); background: var(--soft); }
    .content-block pre { margin-bottom: 0; }
    .diagnostics { margin-top: 38px; padding: 22px 0 0; border-top: 2px solid var(--ink); font-size: 11px; line-height: 1.55; color: var(--muted); }
    .diagnostics h2 { margin: 0 0 9px; color: var(--ink); font: 600 18px/1.2 Georgia, "Times New Roman", serif; }
    .diagnostics ul { margin: 8px 0 0; padding-left: 1.4em; }
    @page { size: auto; margin: 17mm 16mm 19mm; }
    @media print {
      html, body { background: #fff; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .transcript-document { width: auto; margin: 0; padding: 0; box-shadow: none; }
      .document-title { font-size: 34pt; }
      .turn { break-inside: auto; }
      .turn-header, h3, h4, h5, h6 { break-after: avoid; }
      p, li { orphans: 3; widows: 3; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      blockquote, .content-block { break-inside: avoid-page; }
      pre, table { break-inside: auto; }
      a { color: inherit; text-decoration: none; }
      .turn-body a[href^="http"]::after { content: " <" attr(href) ">"; color: var(--muted); font-size: 8pt; overflow-wrap: anywhere; }
    }
    @media (max-width: 680px) {
      .transcript-document { width: 100%; margin: 0; padding: 40px 24px; box-shadow: none; }
      .document-meta { grid-template-columns: 1fr; }
      .turn-header { display: block; }
      .turn-time { display: block; margin-top: 4px; }
    }
  `;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function sanitizeUrl(value) {
    try {
      const url = new URL(String(value));
      if (["https:", "http:", "mailto:"].includes(url.protocol)) {
        return url.href;
      }
    } catch (_error) {
      // A malformed or relative URL is rendered as plain text.
    }
    return "";
  }

  function renderEmphasis(escapedText) {
    return escapedText
      .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  }

  function renderInline(value) {
    let working = String(value ?? "");
    let marker = "\uE000";
    while (working.includes(marker)) {
      marker += "\uE000";
    }
    const tokens = [];
    const token = (html) => {
      const index = tokens.push(html) - 1;
      return `${marker}${index}\uE001`;
    };

    working = working.replace(/(`+)([^`\n]*?)\1/g, (_match, _ticks, code) => token(`<code>${escapeHtml(code)}</code>`));
    working = working.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (match, label, href) => {
      const safeHref = sanitizeUrl(href);
      if (!safeHref) {
        return match;
      }
      return token(`<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${label} (opens in new tab)`)}">${renderEmphasis(escapeHtml(label))}</a>`);
    });

    let output = renderEmphasis(escapeHtml(working));
    output = output.replace(new RegExp(`${marker}(\\d+)\uE001`, "g"), (_match, index) => tokens[Number(index)] || "");
    return output;
  }

  function splitTableRow(line) {
    return String(line)
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replaceAll("\\|", "|"));
  }

  function isTableDivider(line) {
    const cells = splitTableRow(line);
    return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function beginsBlock(lines, index) {
    const line = lines[index] || "";
    const next = lines[index + 1] || "";
    return /^\s*(```+|~~~+)/.test(line)
      || /^\s{0,3}#{1,6}\s+/.test(line)
      || /^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)
      || /^\s*>/.test(line)
      || /^\s*[-+*]\s+/.test(line)
      || /^\s*\d+[.)]\s+/.test(line)
      || (line.includes("|") && isTableDivider(next));
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    const html = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)?.*$/);
      if (fenceMatch) {
        const fence = fenceMatch[1];
        const language = (fenceMatch[2] || "").replace(/[^a-zA-Z0-9_+#.-]/g, "");
        const codeLines = [];
        index += 1;
        while (index < lines.length && !new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        const className = language ? ` class="language-${escapeHtml(language)}"` : "";
        html.push(`<pre><code${className}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        continue;
      }

      if (line.includes("|") && isTableDivider(lines[index + 1] || "")) {
        const headers = splitTableRow(line);
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }
        html.push(`<table><thead><tr>${headers.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_header, cellIndex) => `<td>${renderInline(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
        continue;
      }

      const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (headingMatch) {
        const level = Math.min(6, headingMatch[1].length + 2);
        html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) {
        html.push("<hr>");
        index += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quoted = [];
        while (index < lines.length && /^\s*>/.test(lines[index])) {
          quoted.push(lines[index].replace(/^\s*>\s?/, ""));
          index += 1;
        }
        html.push(`<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`);
        continue;
      }

      const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const tag = unordered ? "ul" : "ol";
        const pattern = unordered ? /^\s*[-+*]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/;
        const items = [];
        while (index < lines.length) {
          const itemMatch = lines[index].match(pattern);
          if (!itemMatch) {
            break;
          }
          items.push(`<li>${renderInline(itemMatch[1])}</li>`);
          index += 1;
        }
        html.push(`<${tag}>${items.join("")}</${tag}>`);
        continue;
      }

      const paragraph = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !beginsBlock(lines, index)) {
        paragraph.push(lines[index]);
        index += 1;
      }
      html.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    }

    return html.join("\n");
  }

  function longestBacktickRun(value) {
    return Math.max(2, ...Array.from(String(value).matchAll(/`+/g), (match) => match[0].length));
  }

  function fencedCode(value, language) {
    const text = String(value ?? "");
    const fence = "`".repeat(Math.max(3, longestBacktickRun(text) + 1));
    return `${fence}${language || ""}\n${text}\n${fence}`;
  }

  function blockToMarkdown(block) {
    const type = block?.type || "unknown";
    if (type === "text") {
      const citations = (block.citations || []).map((citation, index) => {
        const title = String(citation?.title || `Citation ${index + 1}`).replace(/([\[\]])/g, "\\$1");
        const safeUrl = sanitizeUrl(citation?.url || "");
        const source = safeUrl ? `[${title}](${safeUrl})` : title;
        const citedText = String(citation?.citedText || "").replace(/\s+/g, " ").trim();
        return `${index + 1}. ${source}${citedText ? ` — ${citedText}` : ""}`;
      });
      return [String(block.text || ""), citations.length ? `Sources retained from Claude:\n${citations.join("\n")}` : ""]
        .filter(Boolean)
        .join("\n\n");
    }
    if (type === "artifact" || type === "file" || type === "widget") {
      const label = type === "artifact" ? "Artifact" : type === "file" ? "Created file" : "Widget";
      return `### ${label}: ${block.title || "Untitled"}\n\n${fencedCode(block.text || "", block.language || "")}`;
    }
    if (type === "attachment") {
      const metadata = [block.mimeType, block.size ? `${block.size} bytes` : ""].filter(Boolean).join(", ");
      const heading = `> Attachment: ${block.title || "Unnamed attachment"}${metadata ? ` (${metadata})` : ""}`;
      return block.text ? `${heading}\n\n${fencedCode(block.text, block.language || "text")}` : heading;
    }
    if (type === "notice" || type === "tool") {
      return `> ${block.title || "Conversation event"}${block.text ? ` — ${block.text}` : ""}`;
    }
    return `> Unrecognized conversation block: ${block.title || type}\n\n${block.details ? fencedCode(block.details, "json") : ""}`.trim();
  }

  function formatDate(value, includeTime = true) {
    if (!value) {
      return "Not available";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      ...(includeTime ? { timeStyle: "short" } : {})
    }).format(date);
  }

  function completenessLabel(conversation) {
    const status = conversation?.diagnostics?.completeness || "warning";
    if (status === "complete") {
      return "Active message chain verified; readable transcript content captured.";
    }
    if (status === "partial") {
      return "Message chain unverified. This capture may be missing conversation turns.";
    }
    return "Active message chain verified, with content omissions or fidelity warnings.";
  }

  function conversationToMarkdown(conversation) {
    const lines = [
      `# ${conversation.title || "Untitled conversation"}`,
      "",
      `- Source: ${conversation.source?.url || "Unknown"}`,
      `- Captured: ${formatDate(conversation.capturedAt)}`,
      `- Completeness: ${completenessLabel(conversation)}`,
      ""
    ];
    const roleCounts = { user: 0, assistant: 0 };

    for (const message of conversation.messages || []) {
      const role = message.role === "user" ? "user" : "assistant";
      roleCounts[role] += 1;
      const label = role === "user" ? "You" : "Claude";
      const timestamp = message.createdAt ? ` — ${formatDate(message.createdAt)}` : "";
      lines.push(`## ${label} ${roleCounts[role]}${timestamp}`, "");
      for (const block of message.blocks || []) {
        const rendered = blockToMarkdown(block);
        if (rendered) {
          lines.push(rendered, "");
        }
      }
    }

    const diagnostics = conversation.diagnostics || {};
    lines.push("---", "", "## Capture notes", "", `- ${completenessLabel(conversation)}`);
    for (const warning of diagnostics.warnings || []) {
      lines.push(`- Warning: ${warning}`);
    }
    lines.push(`- Capture method: ${diagnostics.method || "unknown"}`);
    lines.push(`- Saved messages: ${(conversation.messages || []).length}`);
    return `${lines.join("\n").trim()}\n`;
  }

  function renderBlockHtml(block) {
    const type = block?.type || "unknown";
    if (type === "text") {
      const citationItems = (block.citations || []).map((citation, index) => {
        const title = String(citation?.title || `Citation ${index + 1}`);
        const safeUrl = sanitizeUrl(citation?.url || "");
        const source = safeUrl
          ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${title} (opens in new tab)`)}">${escapeHtml(title)}</a>`
          : escapeHtml(title);
        const citedText = String(citation?.citedText || "").replace(/\s+/g, " ").trim();
        return `<li>${source}${citedText ? `<span class="citation-quote">${escapeHtml(citedText)}</span>` : ""}</li>`;
      }).join("");
      const citations = citationItems
        ? `<aside class="citation-list"><p>Sources retained from Claude</p><ol>${citationItems}</ol></aside>`
        : "";
      return `<div class="block-content">${renderMarkdown(block.text || "")}${citations}</div>`;
    }

    const labels = {
      artifact: "Artifact",
      file: "Created file",
      widget: "Widget",
      attachment: "Attachment",
      notice: "Capture note",
      tool: "Tool event",
      unknown: "Unrecognized block"
    };
    const title = block.title || labels[type] || "Conversation content";
    let content = "";
    if (["artifact", "file", "widget"].includes(type) && block.text) {
      content = `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    } else if (type === "attachment" && block.text) {
      content = `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    } else if (block.details) {
      content = `<pre><code>${escapeHtml(block.details)}</code></pre>`;
    } else if (block.text) {
      content = `<p>${renderInline(block.text)}</p>`;
    }
    return `<section class="content-block" data-kind="${escapeHtml(type)}"><p class="block-label">${escapeHtml(labels[type] || type)} · ${escapeHtml(title)}</p>${content}</section>`;
  }

  function renderConversationBody(conversation) {
    const safeSourceUrl = sanitizeUrl(conversation.source?.url || "");
    const diagnostics = conversation.diagnostics || {};
    const completeness = diagnostics.completeness || "warning";
    const roleCounts = { user: 0, assistant: 0 };
    const messages = (conversation.messages || []).map((message, messageIndex) => {
      const role = message.role === "user" ? "user" : "assistant";
      roleCounts[role] += 1;
      const label = role === "user" ? "You" : "Claude";
      const blocks = (message.blocks || []).map(renderBlockHtml).join("\n");
      return `<section class="turn" data-role="${role}" data-message-index="${messageIndex}">
        <header class="turn-header">
          <h2 class="turn-role"><span class="turn-number">${String(roleCounts[role]).padStart(2, "0")}</span> · ${label}</h2>
          ${message.createdAt ? `<time class="turn-time" datetime="${escapeHtml(message.createdAt)}">${escapeHtml(formatDate(message.createdAt))}</time>` : ""}
        </header>
        <div class="turn-body">${blocks || "<p><em>No human-readable content was present in this message.</em></p>"}</div>
      </section>`;
    }).join("\n");

    const warningValues = diagnostics.warnings || [];
    const warnings = warningValues.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
    const topWarnings = warningValues.slice(0, 3).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
    const sourceMarkup = safeSourceUrl
      ? `<a href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Original Claude conversation (opens in new tab)">${escapeHtml(safeSourceUrl)}</a>`
      : "Not available";

    return `<article class="transcript-document">
      <header class="document-header">
        <p class="document-kicker">Claude conversation transcript</p>
        <h1 class="document-title">${escapeHtml(conversation.title || "Untitled conversation")}</h1>
        <dl class="document-meta">
          <div><dt>Captured</dt><dd>${escapeHtml(formatDate(conversation.capturedAt))}</dd></div>
          <div><dt>Messages</dt><dd>${(conversation.messages || []).length}</dd></div>
          <div><dt>Chain</dt><dd>${escapeHtml(diagnostics.messageChain || "Unknown")}</dd></div>
          <div><dt>Fidelity</dt><dd>${escapeHtml(diagnostics.contentFidelity || "Unknown")}</dd></div>
          <div><dt>Source</dt><dd>${sourceMarkup}</dd></div>
        </dl>
        <div class="completeness-banner" data-level="${escapeHtml(completeness)}">
          <strong>${escapeHtml(completenessLabel(conversation))}</strong>
          ${topWarnings ? `<ul class="banner-warnings">${topWarnings}</ul>` : ""}
        </div>
      </header>
      <div class="turns">${messages}</div>
      <footer class="diagnostics">
        <h2>Capture notes</h2>
        <p>${escapeHtml(completenessLabel(conversation))}</p>
        <p>Capture method: ${escapeHtml(diagnostics.method || "Unknown")}.</p>
        ${warnings ? `<ul>${warnings}</ul>` : "<p>No capture warnings were recorded.</p>"}
      </footer>
    </article>`;
  }

  function conversationToHtml(conversation) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
    <title>${escapeHtml(conversation.title || "Conversation transcript")}</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>${renderConversationBody(conversation)}</body>
</html>`;
  }

  function conversationToJson(conversation) {
    return `${JSON.stringify(conversation, null, 2)}\n`;
  }

  function safeFilename(title, extension) {
    const base = String(title || "claude-conversation")
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 110) || "claude-conversation";
    return `${base}.${String(extension).replace(/^\./, "")}`;
  }

  function downloadText(content, filename, mimeType) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function conversationSearchText(conversation) {
    const parts = [conversation.title, conversation.source?.url];
    for (const message of conversation.messages || []) {
      for (const block of message.blocks || []) {
        parts.push(block.title, block.text);
        for (const citation of block.citations || []) {
          parts.push(citation.title, citation.url, citation.citedText);
        }
      }
    }
    return parts.filter(Boolean).join("\n").toLocaleLowerCase();
  }

  root.ChatlogRender = Object.freeze({
    PRINT_STYLES,
    blockToMarkdown,
    completenessLabel,
    conversationSearchText,
    conversationToHtml,
    conversationToJson,
    conversationToMarkdown,
    downloadText,
    escapeHtml,
    formatDate,
    renderConversationBody,
    renderInline,
    renderMarkdown,
    safeFilename,
    sanitizeUrl
  });
})(globalThis);
