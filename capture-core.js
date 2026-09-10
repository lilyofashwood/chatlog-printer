(function initChatlogCaptureCore(root) {
  "use strict";

  const ROOT_MESSAGE_UUID = "00000000-0000-4000-8000-000000000000";
  const MAX_DIAGNOSTIC_DETAIL = 20_000;

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function messageId(message) {
    return message?.uuid || message?.id || message?.message_uuid || "";
  }

  function parentReference(message) {
    if (!message || typeof message !== "object") {
      return { present: false, value: null };
    }
    for (const field of ["parent_message_uuid", "parent_uuid"]) {
      if (Object.prototype.hasOwnProperty.call(message, field)) {
        return { present: true, value: message[field] == null ? null : String(message[field]) };
      }
    }
    if (message.parent_message && typeof message.parent_message === "object" && Object.prototype.hasOwnProperty.call(message.parent_message, "uuid")) {
      return { present: true, value: message.parent_message.uuid == null ? null : String(message.parent_message.uuid) };
    }
    return { present: false, value: null };
  }

  function parentMessageId(message) {
    return parentReference(message).value;
  }

  function messageIndex(message, fallbackIndex = 0) {
    const index = Number(message?.index);
    return Number.isFinite(index) ? index : fallbackIndex;
  }

  function sortMessages(messages) {
    return messages
      .map((message, originalIndex) => ({ message, originalIndex }))
      .sort((left, right) => {
        const indexDifference = messageIndex(left.message, left.originalIndex) - messageIndex(right.message, right.originalIndex);
        if (indexDifference !== 0) {
          return indexDifference;
        }
        const leftDate = Date.parse(left.message?.created_at || left.message?.createdAt || "") || 0;
        const rightDate = Date.parse(right.message?.created_at || right.message?.createdAt || "") || 0;
        return leftDate - rightDate || left.originalIndex - right.originalIndex;
      })
      .map(({ message }) => message);
  }

  function orderActiveBranch(data) {
    const allMessages = asArray(data?.chat_messages);
    const warnings = [];
    if (allMessages.length === 0) {
      return {
        messages: [],
        verified: false,
        warnings: ["Claude returned no chat_messages array entries."],
        rawMessageCount: 0,
        alternateBranchCount: 0
      };
    }

    const leafId = data?.current_leaf_message_uuid || data?.current_leaf_message?.uuid || "";
    if (!leafId) {
      return {
        messages: sortMessages(allMessages),
        verified: false,
        warnings: ["Claude did not identify the current leaf message, so the active branch could not be proven."],
        rawMessageCount: allMessages.length,
        alternateBranchCount: 0
      };
    }

    const byId = new Map();
    for (const message of allMessages) {
      const id = messageId(message);
      if (!id) {
        warnings.push("At least one API message had no stable identifier.");
        continue;
      }
      if (byId.has(id)) {
        warnings.push(`Claude returned duplicate message identifier ${id}.`);
      }
      byId.set(id, message);
    }

    const chain = [];
    const seen = new Set();
    let cursor = leafId;
    let rootReached = false;

    while (cursor && cursor !== ROOT_MESSAGE_UUID) {
      if (seen.has(cursor)) {
        warnings.push("The active conversation branch contained a parent cycle.");
        break;
      }
      if (chain.length > allMessages.length) {
        warnings.push("The active branch exceeded the number of messages Claude returned.");
        break;
      }

      seen.add(cursor);
      const message = byId.get(cursor);
      if (!message) {
        warnings.push(`The active branch is missing parent message ${cursor}.`);
        break;
      }
      chain.push(message);

      const parent = parentReference(message);
      if (!parent.present) {
        warnings.push(`Message ${cursor} has no recognized parent field.`);
        break;
      }
      const parentId = parent.value;
      if (parentId === ROOT_MESSAGE_UUID) {
        rootReached = true;
        break;
      }
      if (parentId === null) {
        if (messageIndex(message, -1) === 0) {
          rootReached = true;
        } else {
          warnings.push(`Message ${cursor} has a null parent but is not the first indexed message.`);
        }
        break;
      }
      cursor = parentId;
    }

    if (cursor === ROOT_MESSAGE_UUID) {
      rootReached = true;
    }

    if (!rootReached || chain.length === 0 || messageId(chain[0]) !== leafId) {
      warnings.push("The complete active branch could not be validated; only the provable leaf-side segment is retained.");
      return {
        messages: chain.reverse(),
        verified: false,
        warnings,
        rawMessageCount: allMessages.length,
        alternateBranchCount: 0
      };
    }

    chain.reverse();
    return {
      messages: chain,
      verified: warnings.length === 0,
      warnings,
      rawMessageCount: allMessages.length,
      alternateBranchCount: Math.max(0, allMessages.length - chain.length)
    };
  }

  function safeDetails(value) {
    try {
      const seen = new WeakSet();
      const json = JSON.stringify(value, (_key, nestedValue) => {
        if (nestedValue && typeof nestedValue === "object") {
          if (seen.has(nestedValue)) {
            return "[Circular]";
          }
          seen.add(nestedValue);
        }
        return nestedValue;
      }, 2);
      if (!json) {
        return "";
      }
      return json.length > MAX_DIAGNOSTIC_DETAIL
        ? `${json.slice(0, MAX_DIAGNOSTIC_DETAIL)}\n… [diagnostic detail truncated]`
        : json;
    } catch (_error) {
      return "[Could not serialize this block]";
    }
  }

  function languageFromArtifact(input) {
    if (input?.language) {
      return String(input.language);
    }
    const type = String(input?.type || "").toLowerCase();
    const map = {
      "text/html": "html",
      "application/vnd.ant.code": "",
      "text/markdown": "markdown",
      "image/svg+xml": "svg"
    };
    return map[type] || "";
  }

  function artifactKey(block) {
    const input = block?.input && typeof block.input === "object" ? block.input : {};
    return input.id || input.artifact_id || "";
  }

  function collectArtifactStates(messages) {
    const states = new Map();
    for (const [messagePosition, message] of asArray(messages).entries()) {
      for (const [blockPosition, block] of asArray(message?.content).entries()) {
        if (block?.type !== "tool_use" || block?.name !== "artifacts") {
          continue;
        }
        const key = artifactKey(block);
        if (!key) {
          continue;
        }
        const input = block.input && typeof block.input === "object" ? block.input : {};
        const command = String(input.command || "create");
        const state = states.get(String(key)) || {
          id: String(key),
          content: "",
          title: "Untitled artifact",
          language: "",
          unresolved: false,
          unapplied: []
        };
        state.title = String(input.title || input.name || state.title);
        state.language = languageFromArtifact(input) || state.language;

        if (["create", "rewrite"].includes(command) && typeof input.content === "string") {
          state.content = input.content;
        } else if (command === "update") {
          if (typeof input.content === "string") {
            state.content = input.content;
          } else if (typeof input.old_str === "string" && typeof input.new_str === "string" && state.content.includes(input.old_str)) {
            state.content = state.content.replace(input.old_str, input.new_str);
          } else {
            state.unresolved = true;
            state.unapplied.push({ old_str: input.old_str, new_str: input.new_str });
          }
        } else if (typeof input.content === "string") {
          state.content = input.content;
        } else {
          state.unresolved = true;
        }

        state.lastPosition = `${messagePosition}:${blockPosition}`;
        state.lastCommand = command;
        states.set(String(key), state);
      }
    }
    return states;
  }

  function normalizeToolUse(block, diagnostics, context = {}) {
    const name = String(block?.name || "unknown tool");
    const input = block?.input && typeof block.input === "object" ? block.input : {};

    if (name === "artifacts") {
      const command = String(input.command || "create");
      const key = artifactKey(block);
      const state = key ? context.artifactStates?.get(String(key)) : null;
      if (state && state.lastPosition !== context.position) {
        diagnostics.artifactRevisionCount += 1;
        return null;
      }
      const title = state?.title || input.title || input.name || input.id || "Untitled artifact";
      let text = state?.content || input.content || "";
      if (state?.unresolved) {
        diagnostics.unresolvedArtifactCount += 1;
        const patchText = state.unapplied
          .map((patch, index) => `Unapplied update ${index + 1}:\nOLD:\n${patch.old_str || "[missing]"}\n\nNEW:\n${patch.new_str || "[missing]"}`)
          .join("\n\n");
        text = [text, patchText].filter(Boolean).join("\n\n");
      } else if (!text && command === "update") {
        text = [
          input.old_str ? `Previous fragment:\n${input.old_str}` : "",
          input.new_str ? `Replacement fragment:\n${input.new_str}` : ""
        ].filter(Boolean).join("\n\n");
      }
      diagnostics.artifactCount += 1;
      if (!text) {
        diagnostics.unknownBlockCount += 1;
      }
      return {
        type: "artifact",
        title: String(title),
        text: String(text || "Artifact metadata was present, but this operation contained no complete printable source."),
        language: state?.language || languageFromArtifact(input),
        command: state?.lastCommand || command,
        artifactId: key ? String(key) : null
      };
    }

    if (name === "create_file") {
      diagnostics.createdFileCount += 1;
      if (!input.file_text) {
        diagnostics.unknownBlockCount += 1;
      }
      return {
        type: "file",
        title: String(input.path || input.file_name || input.description || "Created file"),
        text: String(input.file_text || "File metadata was present, but its contents were not included in this response."),
        language: ""
      };
    }

    if (name === "visualize:show_widget") {
      diagnostics.widgetCount += 1;
      if (!input.widget_code) {
        diagnostics.unknownBlockCount += 1;
      }
      return {
        type: "widget",
        title: String(input.title || "Generated widget"),
        text: String(input.widget_code || "Widget metadata was present, but its source was not included in this response."),
        language: "html"
      };
    }

    diagnostics.toolMarkerCount += 1;
    diagnostics.toolNames.add(name);
    return {
      type: "tool",
      title: name,
      text: "Claude recorded tool activity here. Internal tool inputs and results are not part of the readable transcript."
    };
  }

  function normalizeContentBlock(block, diagnostics, context) {
    if (typeof block === "string") {
      return block ? { type: "text", text: block } : null;
    }

    const type = String(block?.type || "unknown");
    if (type === "text") {
      const citations = asArray(block?.citations).map((citation, index) => ({
        title: String(citation?.title || citation?.document_title || citation?.source_title || `Citation ${index + 1}`),
        url: String(citation?.url || citation?.source?.url || ""),
        citedText: String(citation?.cited_text || citation?.text || ""),
        details: safeDetails(citation)
      }));
      diagnostics.citationCount += citations.length;
      return block.text ? { type: "text", text: String(block.text), ...(citations.length ? { citations } : {}) } : null;
    }
    if (type === "tool_use") {
      return normalizeToolUse(block, diagnostics, context);
    }
    if (type === "thinking" || type === "redacted_thinking") {
      diagnostics.thinkingBlockCount += 1;
      return null;
    }
    if (type === "tool_result") {
      diagnostics.toolResultCount += 1;
      return null;
    }
    if (type === "image") {
      diagnostics.imageBlockCount += 1;
      return {
        type: "attachment",
        title: String(block.alt || block.name || "Conversation image"),
        text: "Image bytes are not embedded in this prototype's local transcript."
      };
    }

    diagnostics.unknownBlockCount += 1;
    diagnostics.unknownBlockTypes.add(type);
    return {
      type: "unknown",
      title: type,
      details: safeDetails(block)
    };
  }

  function normalizeAttachment(attachment, position, diagnostics) {
    diagnostics.attachmentCount += 1;
    const title = attachment?.file_name || attachment?.name || attachment?.title || `Pasted content ${position + 1}`;
    const text = attachment?.extracted_content || attachment?.text || "";
    if (!text) {
      diagnostics.missingAttachmentContentCount += 1;
    }
    return {
      type: "attachment",
      title: String(title),
      text: String(text || "Attachment metadata was saved, but extracted text or binary contents were not available."),
      mimeType: String(attachment?.file_type || attachment?.mime_type || ""),
      size: Number(attachment?.file_size || attachment?.size_bytes) || null,
      language: "text"
    };
  }

  function normalizeFile(file, position, diagnostics) {
    diagnostics.fileCount += 1;
    const kind = file?.file_kind || file?.kind || file?.type || "file";
    return {
      type: "attachment",
      title: String(file?.file_name || file?.name || `Attached ${kind} ${position + 1}`),
      text: `Attachment metadata was saved (${kind}); binary contents are not embedded in this prototype.`,
      mimeType: String(file?.mime_type || kind),
      size: Number(file?.size_bytes) || null
    };
  }

  function normalizeRole(sender) {
    const value = String(sender || "").toLowerCase();
    if (["human", "user"].includes(value)) {
      return "user";
    }
    if (["assistant", "claude"].includes(value)) {
      return "assistant";
    }
    return "";
  }

  function createDiagnostics(meta) {
    return {
      method: meta.method || "claude-api",
      completeness: "warning",
      warnings: [...asArray(meta.warnings)],
      apiMessageCount: 0,
      orderedMessageCount: 0,
      savedMessageCount: 0,
      alternateBranchCount: 0,
      ignoredRoleCount: 0,
      emptyMessageCount: 0,
      truncatedMessageCount: 0,
      interruptedMessageCount: 0,
      thinkingBlockCount: 0,
      toolResultCount: 0,
      toolMarkerCount: 0,
      artifactCount: 0,
      artifactRevisionCount: 0,
      unresolvedArtifactCount: 0,
      createdFileCount: 0,
      widgetCount: 0,
      attachmentCount: 0,
      missingAttachmentContentCount: 0,
      fileCount: 0,
      imageBlockCount: 0,
      citationCount: 0,
      compactionSummaryCount: 0,
      unknownBlockCount: 0,
      toolNames: new Set(),
      unknownBlockTypes: new Set()
    };
  }

  function finalizeDiagnostics(diagnostics, order, meta) {
    diagnostics.apiMessageCount = order.rawMessageCount;
    diagnostics.orderedMessageCount = order.messages.length;
    diagnostics.alternateBranchCount = order.alternateBranchCount;
    diagnostics.warnings.push(...order.warnings);

    if (order.alternateBranchCount > 0) {
      diagnostics.warnings.push(`${order.alternateBranchCount} alternate-branch message${order.alternateBranchCount === 1 ? " was" : "s were"} excluded; the saved transcript follows the branch currently selected in Claude.`);
    }
    if (diagnostics.truncatedMessageCount > 0) {
      diagnostics.warnings.push(`${diagnostics.truncatedMessageCount} active-branch message${diagnostics.truncatedMessageCount === 1 ? " is" : "s are"} marked truncated by Claude.`);
    }
    if (diagnostics.interruptedMessageCount > 0) {
      diagnostics.warnings.push(`${diagnostics.interruptedMessageCount} Claude response${diagnostics.interruptedMessageCount === 1 ? " was" : "s were"} interrupted before normal completion.`);
    }
    if (diagnostics.artifactRevisionCount > 0) {
      diagnostics.warnings.push(`${diagnostics.artifactRevisionCount} earlier artifact revision${diagnostics.artifactRevisionCount === 1 ? " was" : "s were"} folded into the final artifact source.`);
    }
    if (diagnostics.unresolvedArtifactCount > 0) {
      diagnostics.warnings.push(`${diagnostics.unresolvedArtifactCount} artifact update sequence${diagnostics.unresolvedArtifactCount === 1 ? " could" : "s could"} not be reconstructed exactly; unapplied fragments were retained.`);
    }
    if (diagnostics.thinkingBlockCount > 0) {
      diagnostics.warnings.push(`${diagnostics.thinkingBlockCount} private/reasoning block${diagnostics.thinkingBlockCount === 1 ? " was" : "s were"} intentionally omitted from the readable transcript.`);
    }
    if (diagnostics.toolResultCount > 0) {
      diagnostics.warnings.push(`${diagnostics.toolResultCount} internal tool-result block${diagnostics.toolResultCount === 1 ? " was" : "s were"} omitted from the readable transcript.`);
    }
    if (diagnostics.toolMarkerCount > 0) {
      diagnostics.warnings.push(`${diagnostics.toolMarkerCount} tool event${diagnostics.toolMarkerCount === 1 ? " was" : "s were"} represented by a marker; internal inputs and results were not printed.`);
    }
    if (diagnostics.imageBlockCount > 0) {
      diagnostics.warnings.push(`${diagnostics.imageBlockCount} image block${diagnostics.imageBlockCount === 1 ? " was" : "s were"} recorded as metadata without image bytes.`);
    }
    if (diagnostics.fileCount > 0) {
      diagnostics.warnings.push(`${diagnostics.fileCount} attached file${diagnostics.fileCount === 1 ? " was" : "s were"} recorded as metadata without binary contents.`);
    }
    if (diagnostics.missingAttachmentContentCount > 0) {
      diagnostics.warnings.push(`${diagnostics.missingAttachmentContentCount} attachment${diagnostics.missingAttachmentContentCount === 1 ? " had" : "s had"} no extracted text or embedded binary contents.`);
    }
    if (diagnostics.citationCount > 0) {
      diagnostics.warnings.push(`${diagnostics.citationCount} citation record${diagnostics.citationCount === 1 ? " was" : "s were"} retained below its text block; Claude's exact inline citation placement may differ.`);
    }
    if (diagnostics.compactionSummaryCount > 0) {
      diagnostics.warnings.push(`${diagnostics.compactionSummaryCount} active-path message${diagnostics.compactionSummaryCount === 1 ? " included" : "s included"} Claude compaction metadata, so the original pre-compaction content cannot be proven from this response.`);
    }
    if (diagnostics.ignoredRoleCount > 0) {
      diagnostics.warnings.push(`${diagnostics.ignoredRoleCount} active-path message${diagnostics.ignoredRoleCount === 1 ? " had" : "s had"} an unrecognized sender role and was not rendered.`);
    }
    if (diagnostics.emptyMessageCount > 0) {
      diagnostics.warnings.push(`${diagnostics.emptyMessageCount} active-path message${diagnostics.emptyMessageCount === 1 ? " had" : "s had"} no printable body and was retained as a notice.`);
    }
    if (diagnostics.unknownBlockCount > 0) {
      diagnostics.warnings.push(`${diagnostics.unknownBlockCount} unrecognized or incomplete content block${diagnostics.unknownBlockCount === 1 ? " was" : "s were"} preserved as diagnostic text.`);
    }
    if (meta.streaming) {
      diagnostics.warnings.push("Claude was still generating when capture began, so the final response may be incomplete.");
    }
    if (meta.tailVerified === false) {
      diagnostics.warnings.push("Claude's rendered message window did not match the API branch strongly enough to verify it.");
    } else if (meta.tailVerified == null) {
      diagnostics.warnings.push("No rendered message window was available for an independent API-to-page comparison.");
    }
    if (meta.conversationIdMatch !== true) {
      diagnostics.warnings.push("Claude did not return a matching top-level conversation identifier for independent verification.");
    }

    const hardFailure = !order.verified
      || diagnostics.truncatedMessageCount > 0
      || diagnostics.compactionSummaryCount > 0
      || Boolean(meta.streaming)
      || meta.tailVerified !== true
      || meta.conversationIdMatch !== true;
    const contentOmissions = diagnostics.unknownBlockCount > 0
      || diagnostics.unresolvedArtifactCount > 0
      || diagnostics.imageBlockCount > 0
      || diagnostics.thinkingBlockCount > 0
      || diagnostics.toolResultCount > 0
      || diagnostics.toolMarkerCount > 0
      || diagnostics.fileCount > 0
      || diagnostics.missingAttachmentContentCount > 0
      || diagnostics.citationCount > 0
      || diagnostics.ignoredRoleCount > 0
      || diagnostics.emptyMessageCount > 0
      || asArray(meta.warnings).length > 0;
    const softWarning = contentOmissions || diagnostics.interruptedMessageCount > 0;

    diagnostics.messageChain = hardFailure ? "unverified" : "verified";
    diagnostics.contentFidelity = contentOmissions ? "omissions" : "full-text";
    diagnostics.completeness = hardFailure ? "partial" : softWarning ? "warning" : "complete";
    diagnostics.toolNames = [...diagnostics.toolNames].sort();
    diagnostics.unknownBlockTypes = [...diagnostics.unknownBlockTypes].sort();
    diagnostics.warnings = [...new Set(diagnostics.warnings.filter(Boolean))];
    return diagnostics;
  }

  function normalizeClaudeConversation(data, meta = {}) {
    const order = orderActiveBranch(data);
    const artifactStates = collectArtifactStates(order.messages);
    const diagnostics = createDiagnostics(meta);
    const messages = [];

    for (const [messagePosition, rawMessage] of order.messages.entries()) {
      const role = normalizeRole(rawMessage?.sender || rawMessage?.role);
      if (!role) {
        diagnostics.ignoredRoleCount += 1;
        continue;
      }

      const blocks = [];
      const rawContent = Array.isArray(rawMessage?.content)
        ? rawMessage.content
        : typeof rawMessage?.content === "string"
          ? [rawMessage.content]
          : [];

      for (const [blockPosition, rawBlock] of rawContent.entries()) {
        const block = normalizeContentBlock(rawBlock, diagnostics, {
          artifactStates,
          position: `${messagePosition}:${blockPosition}`
        });
        if (block) {
          blocks.push(block);
        }
      }

      if (blocks.length === 0 && rawMessage?.text) {
        blocks.push({ type: "text", text: String(rawMessage.text) });
      }
      for (const [attachmentIndex, attachment] of asArray(rawMessage?.attachments).entries()) {
        blocks.push(normalizeAttachment(attachment, attachmentIndex, diagnostics));
      }
      for (const [fileIndex, file] of asArray(rawMessage?.files).entries()) {
        blocks.push(normalizeFile(file, fileIndex, diagnostics));
      }
      for (const [fileIndex, file] of asArray(rawMessage?.files_v2).entries()) {
        blocks.push(normalizeFile(file, fileIndex, diagnostics));
      }
      if (rawMessage?.compaction_summary) {
        diagnostics.compactionSummaryCount += 1;
        blocks.push({
          type: "notice",
          title: "Claude compaction metadata",
          text: typeof rawMessage.compaction_summary === "string"
            ? rawMessage.compaction_summary
            : safeDetails(rawMessage.compaction_summary)
        });
      }

      if (blocks.length === 0) {
        diagnostics.emptyMessageCount += 1;
        blocks.push({
          type: "notice",
          title: "No printable message body",
          text: "Claude returned this active-branch message without readable text or attachment metadata."
        });
      }

      const stopReason = rawMessage?.stop_reason || "";
      const truncated = rawMessage?.truncated === true;
      if (truncated) {
        diagnostics.truncatedMessageCount += 1;
      }
      if (stopReason === "user_canceled") {
        diagnostics.interruptedMessageCount += 1;
      }

      messages.push({
        id: messageId(rawMessage) || null,
        parentId: parentMessageId(rawMessage),
        index: messageIndex(rawMessage, messages.length),
        role,
        createdAt: rawMessage?.created_at || rawMessage?.createdAt || null,
        stopReason: stopReason || null,
        truncated,
        blocks
      });
    }

    diagnostics.savedMessageCount = messages.length;
    finalizeDiagnostics(diagnostics, order, meta);
    return {
      schemaVersion: 1,
      title: String(data?.name || data?.title || meta.title || "Untitled Claude conversation"),
      capturedAt: meta.capturedAt || new Date().toISOString(),
      source: {
        provider: "claude",
        url: String(meta.sourceUrl || ""),
        conversationId: String(meta.conversationId || data?.uuid || data?.id || "")
      },
      messages,
      diagnostics
    };
  }

  function normalizeDomConversation(records, meta = {}) {
    const messages = asArray(records)
      .filter((record) => ["user", "assistant"].includes(record?.role) && record?.text)
      .map((record, index) => ({
        id: null,
        parentId: null,
        index,
        role: record.role,
        createdAt: record.createdAt || null,
        stopReason: null,
        truncated: false,
        blocks: [{ type: "text", text: String(record.text) }]
      }));
    return {
      schemaVersion: 1,
      title: String(meta.title || "Untitled Claude conversation"),
      capturedAt: meta.capturedAt || new Date().toISOString(),
      source: {
        provider: "claude",
        url: String(meta.sourceUrl || ""),
        conversationId: String(meta.conversationId || "")
      },
      messages,
      diagnostics: {
        method: "rendered-dom-fallback",
        completeness: "partial",
        messageChain: "unverified",
        contentFidelity: "unknown",
        warnings: [
          "Claude's complete conversation data could not be read.",
          "This fallback contains only messages mounted in the page and may omit most of a long conversation.",
          ...asArray(meta.warnings)
        ],
        apiMessageCount: 0,
        orderedMessageCount: messages.length,
        savedMessageCount: messages.length,
        alternateBranchCount: 0
      }
    };
  }

  function primaryMessageText(message) {
    return asArray(message?.blocks)
      .filter((block) => block?.type === "text")
      .map((block) => block.text || "")
      .join("\n")
      .trim();
  }

  function textFingerprint(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[`*_~#>|\[\](){}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tailsLikelyMatch(apiMessages, domRecords) {
    const domWindow = asArray(domRecords)
      .filter((record) => ["user", "assistant"].includes(record?.role) && textFingerprint(record?.text))
      .slice(-3);
    if (domWindow.length === 0) {
      return null;
    }
    const apiWindow = asArray(apiMessages)
      .filter((message) => ["user", "assistant"].includes(message?.role) && primaryMessageText(message))
      .slice(-domWindow.length);
    if (apiWindow.length !== domWindow.length) {
      return false;
    }
    const evidenceLength = domWindow.reduce((total, record) => total + textFingerprint(record.text).length, 0);
    if (evidenceLength < 24) {
      return false;
    }
    return apiWindow.every((apiMessage, index) => {
      const domRecord = domWindow[index];
      if (apiMessage.role !== domRecord.role) {
        return false;
      }
      const apiText = textFingerprint(primaryMessageText(apiMessage));
      const domText = textFingerprint(domRecord.text);
      if (!apiText || !domText) {
        return false;
      }
      if (apiText === domText) {
        return true;
      }
      const sampleLength = Math.min(180, apiText.length, domText.length);
      if (sampleLength < 24) {
        return false;
      }
      return apiText.endsWith(domText)
        || domText.endsWith(apiText)
        || apiText.slice(-sampleLength) === domText.slice(-sampleLength);
    });
  }

  root.ChatlogCaptureCore = Object.freeze({
    ROOT_MESSAGE_UUID,
    messageId,
    parentReference,
    normalizeClaudeConversation,
    normalizeDomConversation,
    orderActiveBranch,
    collectArtifactStates,
    primaryMessageText,
    safeDetails,
    tailsLikelyMatch,
    textFingerprint
  });
})(globalThis);
