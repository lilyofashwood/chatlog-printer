(function initChatlogStore(root) {
  "use strict";

  const DATABASE_NAME = "chatlog-printer";
  const DATABASE_VERSION = 1;
  const CONVERSATION_STORE = "conversations";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (database.objectStoreNames.contains(CONVERSATION_STORE)) {
          return;
        }

        const store = database.createObjectStore(CONVERSATION_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("provider", "source.provider", { unique: false });
      });

      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error || new Error("Could not open the local archive.")));
      request.addEventListener("blocked", () => reject(new Error("The local archive is open in an older extension page. Close it and try again.")));
    });
  }

  function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error || new Error("Local archive operation failed.")));
    });
  }

  async function withStore(mode, operation) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(CONVERSATION_STORE, mode);
      const store = transaction.objectStore(CONVERSATION_STORE);
      const completion = new Promise((resolve, reject) => {
        transaction.addEventListener("complete", resolve, { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error || new Error("Local archive transaction was cancelled.")), { once: true });
        transaction.addEventListener("error", () => reject(transaction.error || new Error("Local archive transaction failed.")), { once: true });
      });
      try {
        const result = await operation(store, transaction);
        await completion;
        return result;
      } catch (error) {
        try {
          transaction.abort();
        } catch (_abortError) {
          // The transaction may already be complete or aborted.
        }
        try {
          await completion;
        } catch (_transactionError) {
          // Preserve the original operation error below.
        }
        throw error;
      }
    } finally {
      database.close();
    }
  }

  function hashString(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function buildRecordId(conversation) {
    const provider = conversation?.source?.provider || "unknown";
    const sourceId = conversation?.source?.conversationId;
    const stablePart = sourceId || hashString(conversation?.source?.url || `${conversation?.title || "untitled"}:${conversation?.capturedAt || ""}`);
    return `${provider}:${stablePart}`;
  }

  function completenessRank(conversation) {
    const status = conversation?.diagnostics?.completeness;
    return status === "complete" ? 3 : status === "warning" ? 2 : 1;
  }

  function snapshotRecordId(baseId, conversation) {
    const timestamp = String(conversation?.capturedAt || new Date().toISOString()).replace(/\D/g, "").slice(0, 17);
    const signature = hashString(JSON.stringify({
      messageIds: (conversation?.messages || []).map((message) => message?.id || null),
      messageCount: conversation?.messages?.length || 0,
      completeness: conversation?.diagnostics?.completeness || "partial",
      warnings: conversation?.diagnostics?.warnings || []
    }));
    return `${baseId}:snapshot:${timestamp || "undated"}-${signature}`;
  }

  function messagePathIds(conversation) {
    return (conversation?.messages || []).map((message) => message?.id || "");
  }

  function conversationContentSignature(conversation) {
    return hashString(JSON.stringify((conversation?.messages || []).map(messageContentValue)));
  }

  function messageContentValue(message) {
    return {
      id: message?.id || null,
      role: message?.role || null,
      blocks: (message?.blocks || []).map((block) => ({
        type: block?.type || null,
        title: block?.title || null,
        text: block?.text || null,
        details: block?.details || null,
        citations: block?.citations || null
      }))
    };
  }

  function messageContentSignature(message) {
    return hashString(JSON.stringify(messageContentValue(message)));
  }

  function extendsSamePath(conversation, previousRecord) {
    const nextIds = messagePathIds(conversation);
    const previousIds = messagePathIds(previousRecord);
    if (nextIds.length > 0 && previousIds.length > 0 && nextIds.every(Boolean) && previousIds.every(Boolean)) {
      return nextIds.length >= previousIds.length
        && previousIds.every((id, index) => nextIds[index] === id
          && messageContentSignature(previousRecord.messages[index]) === messageContentSignature(conversation.messages[index]));
    }
    return conversationContentSignature(conversation) === conversationContentSignature(previousRecord);
  }

  function chooseRecordId(conversation, previousRecord) {
    const baseId = buildRecordId(conversation);
    if (previousRecord) {
      const nextRank = completenessRank(conversation);
      const previousRank = completenessRank(previousRecord);
      if (nextRank < previousRank || (nextRank === previousRank && !extendsSamePath(conversation, previousRecord))) {
        return snapshotRecordId(baseId, conversation);
      }
    }
    return baseId;
  }

  function prepareRecord(conversation, previousRecord, id = buildRecordId(conversation)) {
    const now = new Date().toISOString();
    return {
      ...conversation,
      id,
      kind: "chatlog-printer-conversation",
      schemaVersion: Number(conversation.schemaVersion) || 1,
      createdAt: previousRecord?.createdAt || conversation.createdAt || now,
      updatedAt: now,
      capturedAt: conversation.capturedAt || now
    };
  }

  async function saveConversation(conversation) {
    if (!conversation || !Array.isArray(conversation.messages)) {
      throw new TypeError("A normalized conversation is required.");
    }

    const baseId = buildRecordId(conversation);
    return withStore("readwrite", async (store) => {
      const previousBaseRecord = await requestAsPromise(store.get(baseId));
      const promoteDivergentCapture = previousBaseRecord
        && completenessRank(conversation) > completenessRank(previousBaseRecord)
        && !extendsSamePath(conversation, previousBaseRecord);
      if (promoteDivergentCapture) {
        const preservedId = snapshotRecordId(baseId, previousBaseRecord);
        await requestAsPromise(store.put({
          ...previousBaseRecord,
          id: preservedId,
          revisionOf: baseId,
          updatedAt: new Date().toISOString()
        }));
      }
      const id = chooseRecordId(conversation, previousBaseRecord);
      const previousRecord = id === baseId ? previousBaseRecord : await requestAsPromise(store.get(id));
      const record = prepareRecord(conversation, previousRecord, id);
      if (id !== baseId) {
        record.revisionOf = baseId;
      }
      await requestAsPromise(store.put(record));
      return {
        ...record,
        saveDisposition: id !== baseId
          ? "preserved-as-snapshot"
          : promoteDivergentCapture
            ? "promoted-with-snapshot"
          : previousBaseRecord
            ? "updated"
            : "created"
      };
    });
  }

  async function getConversation(id) {
    if (!id) {
      return null;
    }
    return withStore("readonly", (store) => requestAsPromise(store.get(id)));
  }

  async function listConversations() {
    const records = await withStore("readonly", (store) => requestAsPromise(store.getAll()));
    return records
      .filter((record) => record?.kind === "chatlog-printer-conversation")
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  async function deleteConversation(id) {
    if (!id) {
      return;
    }
    await withStore("readwrite", (store) => requestAsPromise(store.delete(id)));
  }

  async function exportLibrary() {
    const conversations = await listConversations();
    return {
      application: "chatlog-printer",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      conversations
    };
  }

  root.ChatlogStore = Object.freeze({
    buildRecordId,
    chooseRecordId,
    completenessRank,
    conversationContentSignature,
    deleteConversation,
    exportLibrary,
    getConversation,
    hashString,
    listConversations,
    messageContentSignature,
    prepareRecord,
    saveConversation
  });
})(globalThis);
