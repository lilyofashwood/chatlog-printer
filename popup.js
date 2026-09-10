(function initPopup() {
  "use strict";

  const saveButton = document.querySelector("#save-button");
  const printButton = document.querySelector("#print-button");
  const libraryButton = document.querySelector("#library-button");
  const actions = document.querySelector("#actions");
  const receiptPanel = document.querySelector("#receipt");
  const receiptChain = document.querySelector("#receipt-chain");
  const receiptFidelity = document.querySelector("#receipt-fidelity");
  const receiptCount = document.querySelector("#receipt-count");
  const receiptWarnings = document.querySelector("#receipt-warnings");
  const receiptSaveButton = document.querySelector("#receipt-save");
  const receiptCancelButton = document.querySelector("#receipt-cancel");
  const status = document.querySelector("#status");
  const statusText = document.querySelector("#status-text");
  let eligiblePage = false;

  function setStatus(message, state = "ready") {
    status.dataset.state = state;
    statusText.textContent = message;
  }

  function setBusy(busy) {
    status.setAttribute("aria-busy", String(busy));
    saveButton.disabled = busy || !eligiblePage;
    printButton.disabled = busy || !eligiblePage;
    libraryButton.disabled = busy;
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  function isClaudeConversation(urlValue) {
    try {
      const url = new URL(urlValue);
      return url.protocol === "https:"
        && url.hostname === "claude.ai"
        && /^\/(?:chat|share)\/[^/]+\/?$/.test(url.pathname);
    } catch (_error) {
      return false;
    }
  }

  async function sendWorkerMessage(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      throw new Error(response?.error || "Chatlog Printer's background worker did not complete the request.");
    }
    return response;
  }

  function preservationNote(saved) {
    if (saved?.saveDisposition === "preserved-as-snapshot") {
      return " The existing base capture was left untouched; this one was saved as a snapshot.";
    }
    if (saved?.saveDisposition === "promoted-with-snapshot") {
      return " The previous divergent base was preserved as a snapshot.";
    }
    return "";
  }

  function reviewCapture(receipt, pendingToken) {
    receiptChain.textContent = receipt.messageChain || "unverified";
    receiptFidelity.textContent = receipt.contentFidelity || "unknown";
    receiptCount.textContent = String(Number(receipt.messageCount) || 0);
    const warningValues = receipt.warnings?.length
      ? receipt.warnings
      : ["The capture contains unspecified warnings."];
    receiptWarnings.replaceChildren(...warningValues.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    }));
    actions.hidden = true;
    receiptPanel.hidden = false;
    receiptSaveButton.disabled = false;
    receiptCancelButton.disabled = false;
    setStatus("Review the capture receipt before anything is saved.", "warning");
    receiptSaveButton.focus();

    return new Promise((resolve) => {
      let finished = false;
      const heartbeat = setInterval(() => {
        sendWorkerMessage({
          type: "keep-pending-conversation-alive",
          pendingToken
        }).catch(() => {
          clearInterval(heartbeat);
          receiptSaveButton.disabled = true;
          setStatus("This receipt expired before it was saved. Discard it and capture again.", "error");
        });
      }, 15_000);

      const finish = (save) => {
        if (finished) {
          return;
        }
        finished = true;
        clearInterval(heartbeat);
        receiptSaveButton.removeEventListener("click", saveCapture);
        receiptCancelButton.removeEventListener("click", discardCapture);
        receiptPanel.hidden = true;
        actions.hidden = false;
        resolve(save);
      };
      const saveCapture = () => finish(true);
      const discardCapture = () => finish(false);
      receiptSaveButton.addEventListener("click", saveCapture);
      receiptCancelButton.addEventListener("click", discardCapture);
    });
  }

  async function captureAndSave(openPrintView, invoker) {
    setBusy(true);
    setStatus("Reading and validating Claude's active branch…", "working");
    try {
      const tab = await getActiveTab();
      if (tab?.incognito) {
        throw new Error("Chatlog Printer does not save conversations from Incognito windows.");
      }
      if (!tab?.id || !isClaudeConversation(tab.url)) {
        throw new Error("Open a specific conversation on claude.ai, then try again.");
      }

      let response = await sendWorkerMessage({
        type: "capture-conversation",
        tabId: tab.id,
        openPrintView
      });
      if (!response.needsConfirmation) {
        const saved = response.saved;
        const messageCount = saved.messageCount;
        const preservationMessage = preservationNote(saved);
        setStatus(
          saved.openViewError
            ? `Saved ${messageCount} messages locally, but the print view could not open: ${saved.openViewError}`
            : openPrintView
            ? `Saved ${messageCount} messages locally.${preservationMessage} Opening print dialog…`
            : `Saved ${messageCount} messages locally with the chain and readable text verified.${preservationMessage}`,
          saved.openViewError ? "warning" : "ready"
        );
        return;
      }

      const receipt = response.receipt || {};
      const messageCount = Number(receipt.messageCount) || 0;
      const agreed = await reviewCapture(receipt, response.pendingToken);
      if (!agreed) {
        sendWorkerMessage({
          type: "discard-pending-conversation",
          pendingToken: response.pendingToken
        }).catch(() => {});
        setStatus("Capture cancelled; no partial transcript was saved.", "warning");
        return;
      }

      response = await sendWorkerMessage({
        type: "save-confirmed-conversation",
        pendingToken: response.pendingToken
      });
      const saved = response.saved;
      const preservationMessage = preservationNote(saved);
      if (openPrintView) {
        setStatus(
          saved.openViewError
            ? `Saved ${messageCount} messages locally with warnings, but the print view could not open: ${saved.openViewError}`
            : `Saved ${messageCount} messages locally with warnings.${preservationMessage} Review the receipt before printing.`,
          "warning"
        );
      } else {
        setStatus(`Saved ${messageCount} messages locally with warnings.${preservationMessage}`, "warning");
      }
    } catch (error) {
      setStatus(error?.message || "Capture failed.", "error");
    } finally {
      setBusy(false);
      if (document.hasFocus() && invoker?.isConnected) {
        invoker.focus();
      }
    }
  }

  async function openLibrary() {
    await chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") });
  }

  async function updateReadiness() {
    try {
      const tab = await getActiveTab();
      eligiblePage = !tab?.incognito && isClaudeConversation(tab?.url);
      if (!eligiblePage) {
        setStatus(
          tab?.incognito
            ? "Incognito capture is disabled so private chats cannot enter the regular-profile library."
            : "Open a specific Claude conversation to capture it.",
          "warning"
        );
      } else {
        setStatus("Ready to capture and validate this Claude conversation.", "ready");
      }
    } catch (_error) {
      eligiblePage = false;
      setStatus("Open a specific Claude conversation to capture it.", "warning");
    } finally {
      setBusy(false);
    }
  }

  saveButton.addEventListener("click", () => captureAndSave(false, saveButton));
  printButton.addEventListener("click", () => captureAndSave(true, printButton));
  libraryButton.addEventListener("click", openLibrary);
  updateReadiness();
})();
