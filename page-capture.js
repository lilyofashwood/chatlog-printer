(function initChatlogPageCapture(root) {
  "use strict";

  const core = root.ChatlogCaptureCore;
  if (!core) {
    throw new Error("Chatlog capture core did not load.");
  }

  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    for (const item of document.cookie.split(";")) {
      const trimmed = item.trim();
      if (trimmed.startsWith(prefix)) {
        try {
          return decodeURIComponent(trimmed.slice(prefix.length)).replace(/^['"]|['"]$/g, "");
        } catch (_error) {
          return trimmed.slice(prefix.length).replace(/^['"]|['"]$/g, "");
        }
      }
    }
    return "";
  }

  function getRoute() {
    const segments = location.pathname.split("/").filter(Boolean);
    const chatIndex = segments.lastIndexOf("chat");
    const shareIndex = segments.lastIndexOf("share");
    if (chatIndex >= 0 && segments[chatIndex + 1]) {
      return { type: "chat", conversationId: segments[chatIndex + 1] };
    }
    if (shareIndex >= 0 && segments[shareIndex + 1]) {
      return { type: "share", conversationId: segments[shareIndex + 1] };
    }
    return { type: "unsupported", conversationId: "" };
  }

  async function fetchJson(url, timeoutMs = 12_000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`Claude returned HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function organizationIdsFromResponse(response) {
    const candidates = Array.isArray(response)
      ? response
      : Array.isArray(response?.organizations)
        ? response.organizations
        : Array.isArray(response?.data)
          ? response.data
          : [];
    return candidates
      .map((organization) => organization?.uuid || organization?.id || organization?.organization_uuid || "")
      .filter(Boolean)
      .map(String);
  }

  async function fetchConversationForOrganization(organizationId, conversationId) {
    const endpoint = new URL(`/api/organizations/${encodeURIComponent(organizationId)}/chat_conversations/${encodeURIComponent(conversationId)}`, location.origin);
    endpoint.searchParams.set("tree", "true");
    endpoint.searchParams.set("rendering_mode", "messages");
    endpoint.searchParams.set("render_all_tools", "true");
    endpoint.searchParams.set("consistency", "strong");
    const data = await fetchJson(endpoint.href);
    if (!Array.isArray(data?.chat_messages)) {
      throw new Error("unexpected response shape");
    }
    const returnedId = data?.uuid || data?.id || data?.conversation_uuid || "";
    if (returnedId && String(returnedId) !== String(conversationId)) {
      throw new Error("conversation identifier mismatch");
    }
    return {
      data,
      organizationId,
      conversationIdMatch: returnedId ? String(returnedId) === String(conversationId) : null
    };
  }

  function failureLabel(error) {
    return error?.name === "AbortError" ? "request timed out" : error?.message || "request failed";
  }

  async function fetchClaudeConversation(conversationId) {
    const failures = [];
    const cookieId = readCookie("lastActiveOrg");
    if (cookieId) {
      try {
        return await fetchConversationForOrganization(cookieId, conversationId);
      } catch (error) {
        failures.push(failureLabel(error));
      }
    }

    let organizationIds = [];
    try {
      const organizations = await fetchJson(`${location.origin}/api/organizations`, 8_000);
      organizationIds = [...new Set(organizationIdsFromResponse(organizations))].filter((id) => id !== cookieId);
    } catch (error) {
      failures.push(failureLabel(error));
    }
    if (organizationIds.length === 0 && !cookieId) {
      throw new Error("Claude's active workspace could not be identified. Make sure you are signed in.");
    }

    const attempts = await Promise.allSettled(
      organizationIds.map((organizationId) => fetchConversationForOrganization(organizationId, conversationId))
    );
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") {
        return attempt.value;
      }
      failures.push(failureLabel(attempt.reason));
    }
    throw new Error(`The complete Claude conversation could not be retrieved (${[...new Set(failures)].join(", ") || "unknown API error"}).`);
  }

  function cleanNodeText(node) {
    if (!node) {
      return "";
    }
    const clone = node.cloneNode(true);
    for (const removable of clone.querySelectorAll("button, script, style, svg, input, textarea, [aria-hidden='true'], .sr-only, .cdk-visually-hidden")) {
      removable.remove();
    }
    return String(clone.innerText || clone.textContent || "").trim();
  }

  function assistantText(wrapper) {
    const richNodes = [...wrapper.querySelectorAll(".standard-markdown, .progressive-markdown")]
      .filter((candidate) => !candidate.parentElement?.closest(".standard-markdown, .progressive-markdown"));
    const text = richNodes.map(cleanNodeText).filter(Boolean).join("\n\n");
    if (text) {
      return text;
    }
    return cleanNodeText(wrapper.querySelector(".font-claude-response") || wrapper.querySelector("[data-is-streaming]"));
  }

  function extractRenderedMessages() {
    const records = [];
    const wrappers = [...document.querySelectorAll("div[data-test-render-count]")];
    for (const wrapper of wrappers) {
      const userNode = wrapper.querySelector("[data-testid='user-message']") || wrapper.querySelector("[data-user-message-bubble='true']");
      if (userNode) {
        const text = cleanNodeText(userNode);
        if (text) {
          records.push({ role: "user", text });
        }
        continue;
      }
      const text = assistantText(wrapper);
      if (text) {
        records.push({ role: "assistant", text });
      }
    }

    if (records.length > 0) {
      return records;
    }

    const candidates = [...document.querySelectorAll("[data-testid='user-message'], .font-claude-response")];
    for (const candidate of candidates) {
      const role = candidate.matches("[data-testid='user-message']") ? "user" : "assistant";
      const text = cleanNodeText(candidate);
      if (text) {
        records.push({ role, text });
      }
    }
    return records;
  }

  function getTitle() {
    const titleNode = document.querySelector("button[data-testid='chat-title-button']")
      || document.querySelector("[data-testid='page-header']")
      || document.querySelector("[data-testid='chat-header'] h1");
    const title = cleanNodeText(titleNode).split("\n")[0]?.trim();
    if (title) {
      return title;
    }
    return document.title && document.title !== "Claude" ? document.title.replace(/\s*[|–—-]\s*Claude\s*$/i, "").trim() : "Untitled Claude conversation";
  }

  function isClaudeStreaming() {
    return [...document.querySelectorAll("[data-is-streaming]")].some((node) => {
      const value = node.getAttribute("data-is-streaming");
      return !/^(?:false|0|no)$/i.test(String(value || ""));
    });
  }

  async function capture() {
    try {
      if (location.protocol !== "https:" || location.hostname !== "claude.ai") {
        throw new Error("Open a conversation on claude.ai before capturing it.");
      }
      const route = getRoute();
      if (route.type === "unsupported") {
        throw new Error("Open a specific Claude conversation first; the Claude home screen has no transcript to save.");
      }

      const capturedAt = new Date().toISOString();
      const renderedMessages = extractRenderedMessages();
      const streamingBefore = isClaudeStreaming();
      if (route.type === "chat") {
        try {
          const result = await fetchClaudeConversation(route.conversationId);
          const streamingAfter = isClaudeStreaming();
          const renderedMessagesAfter = extractRenderedMessages();
          const preliminary = core.normalizeClaudeConversation(result.data, {
            method: "claude-api-active-branch",
            capturedAt,
            sourceUrl: location.href,
            conversationId: route.conversationId,
            conversationIdMatch: result.conversationIdMatch,
            streaming: streamingBefore || streamingAfter
          });
          const tailVerified = core.tailsLikelyMatch(preliminary.messages, renderedMessagesAfter);
          const conversation = core.normalizeClaudeConversation(result.data, {
            method: "claude-api-active-branch",
            capturedAt,
            sourceUrl: location.href,
            conversationId: route.conversationId,
            conversationIdMatch: result.conversationIdMatch,
            streaming: streamingBefore || streamingAfter,
            tailVerified
          });
          if (conversation.messages.length === 0) {
            throw new Error("Claude returned a conversation with no readable human or assistant messages.");
          }
          return { ok: true, conversation };
        } catch (apiError) {
          const fallbackMessages = extractRenderedMessages();
          if (fallbackMessages.length === 0) {
            throw apiError;
          }
          const conversation = core.normalizeDomConversation(fallbackMessages, {
            title: getTitle(),
            capturedAt,
            sourceUrl: location.href,
            conversationId: route.conversationId,
            warnings: [
              `Complete-data capture failed: ${apiError?.message || "unknown error"}`,
              ...(isClaudeStreaming() ? ["Claude was still generating when the DOM fallback was captured."] : [])
            ]
          });
          return { ok: true, conversation };
        }
      }

      if (renderedMessages.length === 0) {
        throw new Error("No readable messages were found on this shared Claude page.");
      }
      return {
        ok: true,
        conversation: core.normalizeDomConversation(renderedMessages, {
          title: getTitle(),
          capturedAt,
          sourceUrl: location.href,
          conversationId: route.conversationId,
          warnings: ["Shared Claude links use a separate page structure; this prototype cannot yet verify their completeness."]
        })
      };
    } catch (error) {
      return {
        ok: false,
        error: error?.name === "AbortError" ? "Claude took too long to return the conversation." : error?.message || "Capture failed."
      };
    }
  }

  root.ChatlogPageCapture = Object.freeze({ capture });
})(globalThis);
