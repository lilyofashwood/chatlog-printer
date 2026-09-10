(function initTranscript() {
  "use strict";

  const root = document.querySelector("#transcript-root");
  const loadingStatus = document.querySelector("#loading-status");
  const printButton = document.querySelector("#print-button");
  const markdownButton = document.querySelector("#markdown-button");
  const htmlButton = document.querySelector("#html-button");
  const jsonButton = document.querySelector("#json-button");
  const parameters = new URLSearchParams(location.search);
  let conversation = null;

  function download(format) {
    if (!conversation) {
      return;
    }
    const exporters = {
      markdown: [ChatlogRender.conversationToMarkdown(conversation), "md", "text/markdown"],
      html: [ChatlogRender.conversationToHtml(conversation), "html", "text/html"],
      json: [ChatlogRender.conversationToJson(conversation), "json", "application/json"]
    };
    const [content, extension, mime] = exporters[format];
    ChatlogRender.downloadText(content, ChatlogRender.safeFilename(conversation.title, extension), mime);
  }

  async function load() {
    try {
      const id = parameters.get("id");
      if (!id) {
        throw new Error("No saved conversation was selected.");
      }
      conversation = await ChatlogStore.getConversation(id);
      if (!conversation) {
        throw new Error("This saved conversation was not found. It may have been deleted or belong to another Chrome profile.");
      }
      document.title = `${conversation.title || "Transcript"} · Chatlog Printer`;
      root.innerHTML = ChatlogRender.renderConversationBody(conversation);
      loadingStatus.hidden = true;
      if (parameters.get("print") === "1") {
        setTimeout(() => window.print(), 350);
      }
    } catch (error) {
      root.replaceChildren();
      loadingStatus.textContent = error?.message || "The transcript could not be loaded.";
      printButton.disabled = true;
      markdownButton.disabled = true;
      htmlButton.disabled = true;
      jsonButton.disabled = true;
    }
  }

  printButton.addEventListener("click", () => window.print());
  markdownButton.addEventListener("click", () => download("markdown"));
  htmlButton.addEventListener("click", () => download("html"));
  jsonButton.addEventListener("click", () => download("json"));
  load();
})();
