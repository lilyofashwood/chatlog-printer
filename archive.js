(function initArchive() {
  "use strict";

  const list = document.querySelector("#conversation-list");
  const emptyState = document.querySelector("#empty-state");
  const count = document.querySelector("#library-count");
  const searchInput = document.querySelector("#search-input");
  const backupButton = document.querySelector("#backup-button");
  const template = document.querySelector("#conversation-card-template");
  const toast = document.querySelector("#toast");
  let records = [];
  let toastTimer = 0;
  let searchTimer = 0;
  const searchCache = new Map();

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }

  function firstReadableText(record) {
    for (const message of record.messages || []) {
      for (const block of message.blocks || []) {
        if (block?.text) {
          const text = String(block.text).replace(/\s+/g, " ").trim();
          if (text) {
            return text.length > 175 ? `${text.slice(0, 174).trimEnd()}…` : text;
          }
        }
      }
    }
    return "No text preview is available for this capture.";
  }

  function downloadConversation(record, format) {
    const exporters = {
      markdown: {
        content: ChatlogRender.conversationToMarkdown(record),
        extension: "md",
        mime: "text/markdown"
      },
      html: {
        content: ChatlogRender.conversationToHtml(record),
        extension: "html",
        mime: "text/html"
      },
      json: {
        content: ChatlogRender.conversationToJson(record),
        extension: "json",
        mime: "application/json"
      }
    };
    const exportData = exporters[format];
    ChatlogRender.downloadText(
      exportData.content,
      ChatlogRender.safeFilename(record.title, exportData.extension),
      exportData.mime
    );
    showToast(`${format === "json" ? "JSON" : format[0].toUpperCase() + format.slice(1)} downloaded.`);
  }

  async function removeConversation(record) {
    const agreed = window.confirm(`Delete “${record.title || "Untitled conversation"}” from this browser?\n\nDownloaded files will not be affected.`);
    if (!agreed) {
      return;
    }
    await ChatlogStore.deleteConversation(record.id);
    records = records.filter((candidate) => candidate.id !== record.id);
    searchCache.delete(record.id);
    render();
    showToast("Conversation deleted from the local library.");
  }

  function renderCard(record) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".conversation-card");
    const completeness = record.diagnostics?.completeness || "warning";
    card.dataset.completeness = completeness;
    const completenessText = completeness === "complete" ? "Verified text" : completeness === "partial" ? "Unverified" : "Omissions";
    fragment.querySelector(".completeness-badge").textContent = record.revisionOf ? `${completenessText} snapshot` : completenessText;
    fragment.querySelector(".card-title").textContent = record.title || "Untitled conversation";
    const snapshotLabel = record.revisionOf ? " · preserved snapshot" : "";
    fragment.querySelector(".card-summary").textContent = `${record.messages?.length || 0} messages${snapshotLabel} · ${firstReadableText(record)}`;
    const warning = record.diagnostics?.warnings?.[0];
    const warningNode = fragment.querySelector(".card-warning");
    if (warning) {
      warningNode.hidden = false;
      warningNode.textContent = warning.length > 190 ? `${warning.slice(0, 189).trimEnd()}…` : warning;
    }
    fragment.querySelector(".card-date").textContent = `Saved ${ChatlogRender.formatDate(record.updatedAt || record.capturedAt)}`;
    const title = record.title || "Untitled conversation";
    const viewButton = fragment.querySelector(".view-button");
    viewButton.href = `transcript.html?id=${encodeURIComponent(record.id)}`;
    viewButton.setAttribute("aria-label", `View or print ${title}`);
    const markdownButton = fragment.querySelector(".markdown-button");
    const htmlButton = fragment.querySelector(".html-button");
    const jsonButton = fragment.querySelector(".json-button");
    const deleteButton = fragment.querySelector(".delete-button");
    markdownButton.setAttribute("aria-label", `Download ${title} as Markdown`);
    htmlButton.setAttribute("aria-label", `Download ${title} as HTML`);
    jsonButton.setAttribute("aria-label", `Download ${title} as JSON`);
    deleteButton.setAttribute("aria-label", `Delete ${title} from this Chrome profile`);
    markdownButton.addEventListener("click", () => downloadConversation(record, "markdown"));
    htmlButton.addEventListener("click", () => downloadConversation(record, "html"));
    jsonButton.addEventListener("click", () => downloadConversation(record, "json"));
    deleteButton.addEventListener("click", () => removeConversation(record));
    return fragment;
  }

  function render() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const visible = query
      ? records.filter((record) => searchCache.get(record.id)?.includes(query))
      : records;

    list.replaceChildren(...visible.map(renderCard));
    const totalLabel = `${records.length} saved capture${records.length === 1 ? "" : "s"}`;
    count.textContent = query ? `${visible.length} matching · ${totalLabel}` : totalLabel;
    emptyState.hidden = visible.length !== 0;
    const emptyHeading = emptyState.querySelector("h2");
    const emptyCopy = emptyState.querySelector("p:last-child");
    if (query && records.length > 0) {
      emptyHeading.textContent = "No matching conversations.";
      emptyCopy.textContent = "Try a title, phrase, or source URL from another saved chat.";
    } else {
      emptyHeading.textContent = "No conversations saved yet.";
      emptyCopy.textContent = "Open a Claude conversation, choose the Chatlog Printer toolbar button, and save it locally.";
    }
  }

  async function downloadLibraryExport() {
    const libraryExport = await ChatlogStore.exportLibrary();
    if (libraryExport.conversations.length === 0) {
      showToast("There is nothing to export yet.");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    ChatlogRender.downloadText(`${JSON.stringify(libraryExport, null, 2)}\n`, `chatlog-printer-library-${date}.json`, "application/json");
    showToast(`Downloaded ${libraryExport.conversations.length} plaintext capture${libraryExport.conversations.length === 1 ? "" : "s"} as library JSON.`);
  }

  async function load() {
    try {
      records = await ChatlogStore.listConversations();
      searchCache.clear();
      for (const record of records) {
        searchCache.set(record.id, ChatlogRender.conversationSearchText(record));
      }
      render();
    } catch (error) {
      count.textContent = "Local library unavailable";
      emptyState.hidden = false;
      emptyState.querySelector("h2").textContent = "The local library could not be opened.";
      emptyState.querySelector("p:last-child").textContent = error?.message || "Reload this page and try again.";
    }
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 140);
  });
  backupButton.addEventListener("click", downloadLibraryExport);
  load();
})();
