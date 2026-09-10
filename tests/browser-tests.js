(async function runBrowserTests() {
  "use strict";

  const output = document.querySelector("#results");
  const tests = [];

  function test(name, callback) {
    tests.push({ name, callback });
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || "Assertion failed");
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || "Values differ"}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
  }

  function message(uuid, parent, index, sender, text, extra = {}) {
    return {
      uuid,
      parent_message_uuid: parent,
      index,
      sender,
      created_at: `2026-08-01T12:0${index}:00.000Z`,
      content: [{ type: "text", text }],
      ...extra
    };
  }

  test("reconstructs only the current Claude branch", () => {
    const root = ChatlogCaptureCore.ROOT_MESSAGE_UUID;
    const data = {
      uuid: "conversation-1",
      name: "Branch test",
      current_leaf_message_uuid: "a2",
      chat_messages: [
        message("a2", "h2", 4, "assistant", "Final answer"),
        message("discarded", "h1", 2, "assistant", "Discarded branch"),
        message("h1", root, 0, "human", "First prompt"),
        message("h2", "a1", 3, "human", "Second prompt"),
        message("a1", "h1", 1, "assistant", "First answer")
      ]
    };
    const conversation = ChatlogCaptureCore.normalizeClaudeConversation(data, {
      conversationId: "conversation-1",
      conversationIdMatch: true,
      tailVerified: true,
      sourceUrl: "https://claude.ai/chat/conversation-1"
    });
    assertEqual(conversation.messages.length, 4, "active branch length");
    assertEqual(conversation.messages.map((item) => item.id).join(","), "h1,a1,h2,a2", "active branch order");
    assertEqual(conversation.diagnostics.alternateBranchCount, 1, "alternate branch count");
    assertEqual(conversation.diagnostics.completeness, "complete", "verified completeness");
  });

  test("fails closed when a parent is missing", () => {
    const data = {
      current_leaf_message_uuid: "a2",
      chat_messages: [message("a2", "missing", 2, "assistant", "Tail")]
    };
    const conversation = ChatlogCaptureCore.normalizeClaudeConversation(data, {
      conversationId: "conversation-2",
      conversationIdMatch: true,
      tailVerified: true
    });
    assertEqual(conversation.diagnostics.completeness, "partial", "missing parent completeness");
    assert(conversation.diagnostics.warnings.some((warning) => warning.includes("missing parent")), "missing parent warning");
  });

  test("does not mistake an absent parent field for the conversation root", () => {
    const data = {
      current_leaf_message_uuid: "a2",
      chat_messages: [
        { uuid: "h1", index: 0, sender: "human", content: [{ type: "text", text: "First" }] },
        { uuid: "a2", index: 1, sender: "assistant", content: [{ type: "text", text: "Second" }] }
      ]
    };
    const conversation = ChatlogCaptureCore.normalizeClaudeConversation(data, {
      conversationIdMatch: true,
      tailVerified: true
    });
    assertEqual(conversation.diagnostics.completeness, "partial", "missing parent field completeness");
    assert(conversation.diagnostics.warnings.some((warning) => warning.includes("no recognized parent field")), "missing parent field warning");
    assertEqual(conversation.messages.length, 1, "only provable leaf-side segment retained");
  });

  test("preserves code whitespace and attachment extracts", () => {
    const root = ChatlogCaptureCore.ROOT_MESSAGE_UUID;
    const data = {
      current_leaf_message_uuid: "h1",
      chat_messages: [{
        ...message("h1", root, 0, "human", "```java\npublic class Example {\n    int value = 1;\n}\n```"),
        attachments: [{ file_name: "notes.txt", extracted_content: "alpha    beta" }]
      }]
    };
    const conversation = ChatlogCaptureCore.normalizeClaudeConversation(data, {
      conversationIdMatch: true,
      tailVerified: true
    });
    assert(conversation.messages[0].blocks[0].text.includes("    int value"), "code indentation preserved");
    assertEqual(conversation.messages[0].blocks[1].text, "alpha    beta", "attachment whitespace preserved");
  });

  test("records unknown content instead of silently dropping it", () => {
    const root = ChatlogCaptureCore.ROOT_MESSAGE_UUID;
    const data = {
      current_leaf_message_uuid: "a1",
      chat_messages: [{
        ...message("a1", root, 0, "assistant", "Known text"),
        content: [
          { type: "text", text: "Known text" },
          { type: "future_block", payload: "unexpected" }
        ]
      }]
    };
    const conversation = ChatlogCaptureCore.normalizeClaudeConversation(data, {
      conversationIdMatch: true,
      tailVerified: true
    });
    assertEqual(conversation.diagnostics.completeness, "warning", "unknown block completeness");
    assert(conversation.messages[0].blocks.some((block) => block.type === "unknown"), "unknown block retained");
  });

  test("folds Claude artifact revisions into one final source", () => {
    const root = ChatlogCaptureCore.ROOT_MESSAGE_UUID;
    const data = {
      current_leaf_message_uuid: "a2",
      chat_messages: [
        {
          uuid: "a1",
          parent_message_uuid: root,
          index: 0,
          sender: "assistant",
          content: [{ type: "tool_use", name: "artifacts", input: { id: "artifact-1", command: "create", title: "Demo", content: "abc" } }]
        },
        {
          uuid: "a2",
          parent_message_uuid: "a1",
          index: 1,
          sender: "assistant",
          content: [{ type: "tool_use", name: "artifacts", input: { id: "artifact-1", command: "update", old_str: "b", new_str: "B" } }]
        }
      ]
    };
    const conversation = ChatlogCaptureCore.normalizeClaudeConversation(data, {
      conversationIdMatch: true,
      tailVerified: true
    });
    const artifacts = conversation.messages.flatMap((messageValue) => messageValue.blocks).filter((block) => block.type === "artifact");
    assertEqual(artifacts.length, 1, "one final artifact rendered");
    assertEqual(artifacts[0].text, "aBc", "artifact update applied");
    assertEqual(conversation.diagnostics.artifactRevisionCount, 1, "earlier revision counted once");
    assertEqual(conversation.diagnostics.unresolvedArtifactCount, 0, "artifact fully reconstructed");
  });

  test("escapes hostile HTML and rejects unsafe links", () => {
    const html = ChatlogRender.renderMarkdown("<script>alert('x')</script> [bad](javascript:alert(1)) **safe**");
    assert(!html.includes("<script>"), "script tag escaped");
    assert(!html.includes("href=\"javascript:"), "javascript URL rejected");
    assert(html.includes("<strong>safe</strong>"), "safe Markdown rendered");
  });

  test("renders citation metadata while rejecting an unsafe citation URL", () => {
    const record = {
      title: "Citation test",
      source: {},
      messages: [{
        role: "assistant",
        blocks: [{
          type: "text",
          text: "Cited answer",
          citations: [{ title: "Unsafe source", url: "javascript:alert(1)", citedText: "Quoted evidence" }]
        }]
      }],
      diagnostics: { completeness: "warning", warnings: [] }
    };
    const html = ChatlogRender.renderConversationBody(record);
    assert(html.includes("Sources retained from Claude"), "citation section rendered");
    assert(html.includes("Quoted evidence"), "cited text retained");
    assert(!html.includes("href=\"javascript:"), "unsafe citation URL rejected");
  });

  test("requires meaningful rendered-window evidence", () => {
    const apiMessages = [{ role: "assistant", blocks: [{ type: "text", text: "A long answer that happens to conclude with the word OK" }] }];
    assertEqual(ChatlogCaptureCore.tailsLikelyMatch(apiMessages, [{ role: "assistant", text: "OK" }]), false, "two-character suffix rejected");
    assertEqual(ChatlogCaptureCore.tailsLikelyMatch(apiMessages, []), null, "unavailable rendered window is tri-state");
  });

  test("does not label an uncorroborated API branch as verified", () => {
    const root = ChatlogCaptureCore.ROOT_MESSAGE_UUID;
    const data = {
      uuid: "conversation-no-window",
      current_leaf_message_uuid: "a1",
      chat_messages: [message("a1", root, 0, "assistant", "A sufficiently long answer from the API branch.")]
    };
    const conversation = ChatlogCaptureCore.normalizeClaudeConversation(data, {
      conversationId: "conversation-no-window",
      conversationIdMatch: true,
      tailVerified: null
    });
    assertEqual(conversation.diagnostics.messageChain, "unverified", "missing page corroboration leaves chain unverified");
    assertEqual(conversation.diagnostics.completeness, "partial", "missing page corroboration is partial");
  });

  test("does not verify a stale historical same-role message as the current tail", () => {
    const apiMessages = [
      { role: "user", blocks: [{ type: "text", text: "Explain the first topic in enough detail." }] },
      { role: "assistant", blocks: [{ type: "text", text: "This is the earlier answer that is still mounted." }] },
      { role: "user", blocks: [{ type: "text", text: "Now explain the second topic in enough detail." }] },
      { role: "assistant", blocks: [{ type: "text", text: "This is the actual current answer from the API." }] }
    ];
    const staleDom = [{ role: "assistant", text: "This is the earlier answer that is still mounted." }];
    assertEqual(ChatlogCaptureCore.tailsLikelyMatch(apiMessages, staleDom), false, "historical answer rejected");
  });

  test("renders fenced code and tables without changing whitespace", () => {
    const markdown = "```js\nfunction x() {\n  return 1;\n}\n```\n\n| A | B |\n| --- | --- |\n| one | two |";
    const html = ChatlogRender.renderMarkdown(markdown);
    assert(html.includes("  return 1;"), "code indentation kept");
    assert(html.includes("<table>"), "table rendered");
    assert(html.includes("<td>two</td>"), "table cell rendered");
  });

  test("creates script-free self-contained HTML", () => {
    const record = {
      title: "A <script> title",
      capturedAt: "2026-08-01T12:00:00.000Z",
      source: { provider: "claude", url: "https://claude.ai/chat/example", conversationId: "example" },
      messages: [{ role: "user", blocks: [{ type: "text", text: "Hello <img src=x onerror=alert(1)>" }] }],
      diagnostics: { method: "test", completeness: "complete", warnings: [] }
    };
    const html = ChatlogRender.conversationToHtml(record);
    assert(html.includes("Content-Security-Policy"), "export CSP present");
    assert(!html.includes("<script>"), "no executable script tag");
    assert(!html.includes("<img src=x"), "message HTML escaped");
  });

  test("all packaged runtime scripts parse", async () => {
    const scriptPaths = [
      "../archive.js",
      "../background.js",
      "../capture-core.js",
      "../page-capture.js",
      "../popup.js",
      "../render.js",
      "../store.js",
      "../transcript.js",
      "extension-smoke.js"
    ];
    for (const path of scriptPaths) {
      const response = await fetch(path);
      assert(response.ok, `${path} fetched`);
      const source = await response.text();
      try {
        new Function(source);
      } catch (error) {
        throw new Error(`${path} did not parse: ${error?.message || error}`);
      }
    }
  });

  test("manifest keeps the extension local, click-scoped, and out of Incognito", async () => {
    const response = await fetch("../manifest.json");
    const manifest = await response.json();
    assertEqual(manifest.manifest_version, 3, "Manifest V3");
    assertEqual(manifest.incognito, "not_allowed", "Incognito disabled");
    assertEqual([...manifest.permissions].sort().join(","), "activeTab,scripting,unlimitedStorage", "minimal declared permissions");
    assert(!manifest.host_permissions, "no persistent host permissions");
    assert(String(manifest.content_security_policy?.extension_pages).includes("connect-src 'none'"), "extension pages cannot make network requests");
  });

  test("never overwrites a more complete saved transcript", () => {
    const base = {
      schemaVersion: 1,
      capturedAt: "2026-09-01T12:00:00.000Z",
      source: { provider: "claude", url: "https://claude.ai/chat/stable", conversationId: "stable" },
      messages: [{ id: "one", role: "user", blocks: [{ type: "text", text: "Complete" }] }],
      diagnostics: { completeness: "complete", warnings: [] }
    };
    const partial = {
      ...base,
      capturedAt: "2026-09-01T13:00:00.000Z",
      messages: [{ id: null, role: "user", blocks: [{ type: "text", text: "Visible fragment" }] }],
      diagnostics: { completeness: "partial", warnings: ["DOM fallback"] }
    };
    const baseId = ChatlogStore.buildRecordId(base);
    const selectedId = ChatlogStore.chooseRecordId(partial, ChatlogStore.prepareRecord(base, null));
    assert(selectedId.startsWith(`${baseId}:snapshot:`), "downgrade saved as a snapshot");
    assertEqual(ChatlogStore.chooseRecordId(base, ChatlogStore.prepareRecord(partial, null)), baseId, "upgrade replaces base record");
  });

  test("preserves same-ID content changes as divergent snapshots", () => {
    const base = {
      schemaVersion: 1,
      capturedAt: "2026-09-01T12:00:00.000Z",
      source: { provider: "claude", url: "https://claude.ai/chat/content-change", conversationId: "content-change" },
      messages: [{ id: "one", role: "user", blocks: [{ type: "text", text: "Original text" }] }],
      diagnostics: { completeness: "complete", warnings: [] }
    };
    const changed = {
      ...base,
      capturedAt: "2026-09-01T13:00:00.000Z",
      messages: [{ id: "one", role: "user", blocks: [{ type: "text", text: "Unexpected replacement" }] }]
    };
    const extended = {
      ...base,
      capturedAt: "2026-09-01T14:00:00.000Z",
      messages: [
        ...base.messages,
        { id: "two", role: "assistant", blocks: [{ type: "text", text: "A safe appended response" }] }
      ]
    };
    const baseRecord = ChatlogStore.prepareRecord(base, null);
    assert(ChatlogStore.chooseRecordId(changed, baseRecord).includes(":snapshot:"), "same-ID text change becomes snapshot");
    assertEqual(ChatlogStore.chooseRecordId(extended, baseRecord), ChatlogStore.buildRecordId(base), "matching prefix can safely extend base");
  });

  test("persists records and preserves a completeness downgrade in IndexedDB", async () => {
    const uniqueId = `indexeddb-${Date.now()}`;
    const complete = {
      schemaVersion: 1,
      title: "IndexedDB transaction test",
      capturedAt: "2026-09-01T14:00:00.000Z",
      source: { provider: "claude", url: `https://claude.ai/chat/${uniqueId}`, conversationId: uniqueId },
      messages: [{ id: "one", role: "user", blocks: [{ type: "text", text: "Complete" }] }],
      diagnostics: { completeness: "complete", warnings: [] }
    };
    const partial = {
      ...complete,
      capturedAt: "2026-09-01T15:00:00.000Z",
      messages: [{ id: null, role: "user", blocks: [{ type: "text", text: "Partial" }] }],
      diagnostics: { completeness: "partial", warnings: ["Fallback"] }
    };
    const savedComplete = await ChatlogStore.saveConversation(complete);
    const savedPartial = await ChatlogStore.saveConversation(partial);
    assertEqual(savedComplete.saveDisposition, "created", "complete record created");
    assertEqual(savedPartial.saveDisposition, "preserved-as-snapshot", "partial record disposition");
    assert(savedPartial.id !== savedComplete.id, "downgrade has a separate key");
    const storedRecords = await ChatlogStore.listConversations();
    assert(storedRecords.some((record) => record.id === savedComplete.id), "complete record still stored");
    assert(storedRecords.some((record) => record.id === savedPartial.id), "partial snapshot stored");
    await ChatlogStore.deleteConversation(savedComplete.id);
    await ChatlogStore.deleteConversation(savedPartial.id);
  });

  test("promotes a stronger divergent capture without losing the old base", async () => {
    const uniqueId = `indexeddb-promote-${Date.now()}`;
    const warning = {
      schemaVersion: 1,
      title: "Divergent promotion test",
      capturedAt: "2026-09-01T16:00:00.000Z",
      source: { provider: "claude", url: `https://claude.ai/chat/${uniqueId}`, conversationId: uniqueId },
      messages: [{ id: "one", role: "user", blocks: [{ type: "text", text: "Earlier warning branch" }] }],
      diagnostics: { completeness: "warning", warnings: ["Earlier fidelity warning"] }
    };
    const complete = {
      ...warning,
      capturedAt: "2026-09-01T17:00:00.000Z",
      messages: [{ id: "one", role: "user", blocks: [{ type: "text", text: "Different verified branch" }] }],
      diagnostics: { completeness: "complete", warnings: [] }
    };
    const savedWarning = await ChatlogStore.saveConversation(warning);
    const savedComplete = await ChatlogStore.saveConversation(complete);
    assertEqual(savedComplete.id, savedWarning.id, "stronger capture promoted to base key");
    assertEqual(savedComplete.saveDisposition, "promoted-with-snapshot", "promotion disposition disclosed");
    const storedRecords = await ChatlogStore.listConversations();
    const preserved = storedRecords.find((record) => record.revisionOf === savedComplete.id && record.messages?.[0]?.blocks?.[0]?.text === "Earlier warning branch");
    assert(preserved, "earlier divergent base preserved as snapshot");
    await ChatlogStore.deleteConversation(savedComplete.id);
    await ChatlogStore.deleteConversation(preserved.id);
  });

  const lines = [];
  let failures = 0;
  for (const { name, callback } of tests) {
    try {
      await callback();
      lines.push(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      lines.push(`FAIL ${name}\n  ${error?.stack || error}`);
    }
  }

  const status = failures === 0 ? "pass" : "fail";
  const resultText = `${lines.join("\n")}\n\n${tests.length - failures}/${tests.length} tests passed`;
  output.dataset.status = status;
  output.textContent = resultText;
  document.title = `CHATLOG_TESTS:${status}:${encodeURIComponent(resultText)}`;
})();
