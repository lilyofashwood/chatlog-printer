(async function runExtensionSmokeTest() {
  "use strict";

  const output = document.querySelector("#result");
  try {
    const response = await chrome.runtime.sendMessage({ type: "test-ping" });
    if (!response?.ok || !response?.pong) {
      throw new Error(response?.error || "The background worker did not answer correctly.");
    }
    output.dataset.status = "pass";
    output.textContent = "PASS unpacked extension loaded and background worker answered";
    document.title = `CHATLOG_EXTENSION_SMOKE:pass:${encodeURIComponent(output.textContent)}`;
  } catch (error) {
    output.dataset.status = "fail";
    output.textContent = `FAIL ${error?.message || error}`;
    document.title = `CHATLOG_EXTENSION_SMOKE:fail:${encodeURIComponent(output.textContent)}`;
  }
})();
