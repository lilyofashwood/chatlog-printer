"use strict";

importScripts("store.js");

const pendingCaptures = new Map();
const PENDING_CAPTURE_LIFETIME_MS = 45 * 1000;

function assertInternalSender(sender, expectedPath) {
  const extensionOrigin = chrome.runtime.getURL("");
  if (sender?.id !== chrome.runtime.id || !String(sender?.url || "").startsWith(extensionOrigin)) {
    throw new Error("Chatlog Printer rejected a message from outside the extension.");
  }
  if (expectedPath && new URL(sender.url).pathname !== expectedPath) {
    throw new Error("This extension page is not allowed to request a capture.");
  }
}

function isClaudeConversationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "claude.ai"
      && /^\/(?:chat|share)\/[^/]+\/?$/.test(url.pathname);
  } catch (_error) {
    return false;
  }
}

async function validateCaptureTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.incognito) {
    throw new Error("Chatlog Printer does not save conversations from Incognito windows.");
  }
  if (!isClaudeConversationUrl(tab.url)) {
    throw new Error("Open a specific conversation on claude.ai, then try again.");
  }
  return tab;
}

function cleanupPendingCaptures() {
  const now = Date.now();
  for (const [token, pending] of pendingCaptures) {
    if (pending.expiresAt <= now) {
      pendingCaptures.delete(token);
    }
  }
}

function pendingToken() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : [...crypto.getRandomValues(new Uint32Array(4))].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function captureReceipt(conversation) {
  return {
    completeness: conversation.diagnostics?.completeness || "warning",
    messageChain: conversation.diagnostics?.messageChain || "unverified",
    contentFidelity: conversation.diagnostics?.contentFidelity || "unknown",
    messageCount: conversation.messages.length,
    warnings: (conversation.diagnostics?.warnings || []).slice(0, 5)
  };
}

function validateConversation(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.messages) || value.messages.length === 0) {
    throw new Error("The page returned an invalid or empty transcript structure.");
  }
  for (const message of value.messages) {
    if (!["user", "assistant"].includes(message?.role) || !Array.isArray(message?.blocks)) {
      throw new Error("The captured transcript failed schema validation.");
    }
  }
  return value;
}

async function captureFromTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ["capture-core.js", "page-capture.js"]
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: async () => {
      try {
        if (!globalThis.ChatlogPageCapture?.capture) {
          return { ok: false, error: "The capture adapter did not initialize." };
        }
        return await globalThis.ChatlogPageCapture.capture();
      } finally {
        try { delete globalThis.ChatlogPageCapture; } catch (_error) { /* no-op */ }
        try { delete globalThis.ChatlogCaptureCore; } catch (_error) { /* no-op */ }
      }
    }
  });

  const result = results?.[0]?.result;
  if (!result?.ok) {
    throw new Error(result?.error || "Claude did not return a transcript.");
  }
  return validateConversation(result.conversation);
}

async function openTranscript(record, autoPrint) {
  const suffix = autoPrint ? "&print=1" : "";
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`transcript.html?id=${encodeURIComponent(record.id)}${suffix}`)
  });
}

async function saveConversation(conversation, openPrintView) {
  const saved = await ChatlogStore.saveConversation(validateConversation(conversation));
  if (openPrintView) {
    try {
      await openTranscript(saved, saved.diagnostics?.completeness === "complete");
    } catch (error) {
      saved.openViewError = error?.message || "The transcript tab could not be opened.";
    }
  }
  return saved;
}

function compactSavedResult(saved) {
  return {
    id: saved.id,
    messageCount: saved.messages.length,
    saveDisposition: saved.saveDisposition,
    completeness: saved.diagnostics?.completeness || "warning",
    openViewError: saved.openViewError || ""
  };
}

async function handleMessage(request, sender) {
  assertInternalSender(sender);
  cleanupPendingCaptures();

  if (request?.type === "test-ping") {
    return { pong: true };
  }

  if (request?.type === "capture-conversation") {
    assertInternalSender(sender, "/popup.html");
    const tabId = Number(request.tabId);
    if (!Number.isInteger(tabId)) {
      throw new Error("No active Claude tab was available.");
    }
    await validateCaptureTab(tabId);
    const conversation = await captureFromTab(tabId);
    if (conversation.diagnostics?.completeness !== "complete") {
      const token = pendingToken();
      pendingCaptures.set(token, {
        conversation,
        expiresAt: Date.now() + PENDING_CAPTURE_LIFETIME_MS,
        openPrintView: Boolean(request.openPrintView)
      });
      return { needsConfirmation: true, pendingToken: token, receipt: captureReceipt(conversation) };
    }
    const saved = await saveConversation(conversation, Boolean(request.openPrintView));
    return { needsConfirmation: false, saved: compactSavedResult(saved) };
  }

  if (request?.type === "save-confirmed-conversation") {
    assertInternalSender(sender, "/popup.html");
    const pending = pendingCaptures.get(String(request.pendingToken || ""));
    if (!pending) {
      throw new Error("That capture receipt expired. Run the capture again before saving.");
    }
    pendingCaptures.delete(String(request.pendingToken));
    const saved = await saveConversation(pending.conversation, pending.openPrintView);
    return { needsConfirmation: false, saved: compactSavedResult(saved) };
  }

  if (request?.type === "keep-pending-conversation-alive") {
    assertInternalSender(sender, "/popup.html");
    const token = String(request.pendingToken || "");
    const pending = pendingCaptures.get(token);
    if (!pending) {
      throw new Error("That capture receipt expired. Run the capture again before saving.");
    }
    pending.expiresAt = Date.now() + PENDING_CAPTURE_LIFETIME_MS;
    return { keptAlive: true };
  }

  if (request?.type === "discard-pending-conversation") {
    assertInternalSender(sender, "/popup.html");
    pendingCaptures.delete(String(request.pendingToken || ""));
    return { discarded: true };
  }

  throw new Error("Unknown Chatlog Printer request.");
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handleMessage(request, _sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Chatlog Printer could not complete the request." }));
  return true;
});
