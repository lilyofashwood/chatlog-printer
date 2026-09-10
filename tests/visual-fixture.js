(function renderVisualFixture() {
  "use strict";
  const record = {
    schemaVersion: 1,
    title: "A durable local archive for long research conversations",
    capturedAt: "2026-09-01T18:24:00.000Z",
    source: {
      provider: "claude",
      url: "https://claude.ai/chat/example-conversation",
      conversationId: "example-conversation"
    },
    messages: [
      {
        role: "user",
        createdAt: "2026-09-01T18:18:00.000Z",
        blocks: [{
          type: "text",
          text: "Can you design a local-first archive that preserves **the entire conversation**, including code spacing and tables?"
        }]
      },
      {
        role: "assistant",
        createdAt: "2026-09-01T18:19:00.000Z",
        blocks: [{
          type: "text",
          text: "## Capture contract\n\nThe exporter should fail loudly if completeness cannot be proven.\n\n| Layer | Responsibility |\n| --- | --- |\n| Capture | Retrieve the active branch |\n| Store | Keep normalized records local |\n| Render | Produce portable documents |\n\n```js\nfunction preserveSpacing(value) {\n  return value.replace(/\\t/g, '  ');\n}\n```"
        }, {
          type: "artifact",
          title: "transcript-schema.json",
          language: "json",
          text: "{\n  \"schemaVersion\": 1,\n  \"messages\": []\n}"
        }]
      },
      {
        role: "user",
        createdAt: "2026-09-01T18:21:00.000Z",
        blocks: [{ type: "text", text: "Good. Make the printed transcript feel more like a document than a chat screenshot." }]
      },
      {
        role: "assistant",
        createdAt: "2026-09-01T18:22:00.000Z",
        blocks: [{
          type: "text",
          text: "Done. The printable view uses restrained typography, explicit provenance, selectable text, wrapped code, and page-aware spacing."
        }]
      }
    ],
    diagnostics: {
      method: "claude-api-active-branch",
      completeness: "complete",
      warnings: ["One alternate-branch message was excluded; this transcript follows the branch selected in Claude."]
    }
  };
  document.querySelector("#transcript-root").innerHTML = ChatlogRender.renderConversationBody(record);
})();
