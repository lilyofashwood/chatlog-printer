(function initDemo() {
  "use strict";
  const sample = {
    schemaVersion: 1,
    title: "The little archive at the end of the conversation",
    capturedAt: "2026-09-10T16:00:00.000Z",
    source: { provider: "claude", conversationId: "chatlog-printer-invented-demo", url: "" },
    messages: [
      { id: "demo-1", role: "user", blocks: [{ type: "text", text: "I'd like to keep this conversation. All the little details, too: the code, the tables, the odd little symbols. Can we make it feel like a book?" }] },
      { id: "demo-2", role: "assistant", blocks: [{ type: "text", text: "## A place for the whole thread\n\nA transcript can be a useful object: searchable, selectable, printable. Here's what belongs on the page.\n\n| Material | What the archive keeps |\n| --- | --- |\n| Conversation | The selected human and assistant turns |\n| Code | Spaces, line breaks, and literal symbols |\n| Provenance | A capture date and an honest receipt |\n\n```js\nfunction keepTheThread(message) {\n  return {\n    text: message.text,\n    note: \"𝓽𝓱𝓮 𝓹𝓪𝓹𝓮𝓻 𝓻𝓮𝓶𝓮𝓶𝓫𝓮𝓻𝓼 ∿\"\n  };\n}\n```\n\n> A library can begin with one conversation you didn't want to lose." }] },
      { id: "demo-3", role: "user", blocks: [{ type: "text", text: "And if something is missing? I'd like the transcript to tell me." }] },
      { id: "demo-4", role: "assistant", blocks: [{ type: "text", text: "It will. Each capture separates **message-chain verification** from **content fidelity**. Missing parents, ongoing generation, unreadable attachments, and unknown content each leave a visible note.\n\nThis particular conversation is an invented demo, so its receipt says exactly that. Try printing it, downloading the HTML, or saving it to the demo library." }, { type: "artifact", title: "A small colophon", language: "text", text: "archive.signal = local\npage.state     = kept\n∿ let the margins hold a little starlight ∿" }] }
    ],
    diagnostics: {
      method: "invented-demo-fixture",
      completeness: "partial",
      messageChain: "unverified",
      contentFidelity: "full-text",
      warnings: ["Invented demonstration data. No Claude conversation was fetched or verified."]
    }
  };
  const status = document.querySelector("#demo-status");
  document.querySelector("#transcript-root").innerHTML = ChatlogRender.renderConversationBody(sample);
  document.querySelector("#save-demo").addEventListener("click", async () => {
    try {
      await ChatlogStore.saveConversation(sample);
      status.replaceChildren(document.createTextNode("Sample saved on this browser's demo origin. "));
      const link = document.createElement("a");
      link.href = "archive.html";
      link.textContent = "Open the demo library →";
      status.append(link);
    } catch (error) {
      status.textContent = `The browser could not save the sample: ${error.message}`;
    }
  });
  document.querySelector("#print-demo").addEventListener("click", () => window.print());
  document.querySelector("#html-demo").addEventListener("click", () => {
    ChatlogRender.downloadText(ChatlogRender.conversationToHtml(sample), "chatlog-printer-sample.html", "text/html");
  });
})();
