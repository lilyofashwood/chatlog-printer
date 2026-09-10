#!/usr/bin/env node
"use strict";

// Development-only: npm install --no-save playwright, then npx playwright install chromium.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const root = path.resolve(__dirname, "..");

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
  const release = process.env.CHATLOG_RELEASE_DIR || path.join(root, "dist", `chatlog-printer-${manifest.version}`);
  const qa = path.join(root, "dist", "qa");
  await fs.mkdir(qa, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "chatlog-release-"));
  let context;
  const failures = [];
  const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png" };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep)) throw new Error("Invalid path");
      response.setHeader("Content-Type", mime[path.extname(file)] || "text/plain");
      response.end(await fs.readFile(file));
    } catch (_error) {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      ...(process.env.CHATLOG_CHROME_BIN ? { executablePath: process.env.CHATLOG_CHROME_BIN } : {}),
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${release}`, `--load-extension=${release}`]
    });
    context.on("page", (page) => page.on("pageerror", (error) => failures.push(error.message)));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).hostname;
    const extensionUrl = `chrome-extension://${extensionId}`;
    const library = await context.newPage();
    await library.goto(`${extensionUrl}/archive.html`);
    await library.getByText("No conversations saved yet.").waitFor();
    const denial = await library.evaluate(() => chrome.runtime.sendMessage({ type: "capture-conversation", tabId: 1 }));
    assert.equal(denial.ok, false);
    assert.match(denial.error, /not allowed to request a capture/);
    console.log("PASS exact release loads its MV3 worker and enforces capture sender restrictions");

    const fixture = {
      uuid: "release-fixture", name: "Release fixture · 𝓲𝓷𝓴 ∿", current_leaf_message_uuid: "a1",
      chat_messages: [
        { uuid: "h1", parent_message_uuid: "00000000-0000-4000-8000-000000000000", index: 0, sender: "human", content: [{ type: "text", text: "Please preserve this whole conversation, including Unicode 𝓲𝓷𝓴." }] },
        { uuid: "a1", parent_message_uuid: "h1", index: 1, sender: "assistant", content: [{ type: "text", text: "This answer is long enough to corroborate the complete rendered window." }] }
      ]
    };
    const claude = await context.newPage();
    let apiAvailable = true;
    const requested = [];
    await claude.route("https://claude.ai/**", async (route) => {
      const url = new URL(route.request().url());
      requested.push(url.pathname);
      if (url.pathname === "/api/organizations") {
        await route.fulfill({ json: [{ uuid: "fixture-workspace" }] });
      } else if (url.pathname.startsWith("/api/organizations/fixture-workspace/chat_conversations/")) {
        await route.fulfill(apiAvailable ? { json: fixture } : { status: 503, body: "Fixture API unavailable" });
      } else {
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><meta charset="utf-8"><title>Fixture | Claude</title><div data-test-render-count="1"><div data-testid="user-message">${fixture.chat_messages[0].content[0].text}</div></div><div data-test-render-count="2"><div class="standard-markdown">${fixture.chat_messages[1].content[0].text}</div></div>` });
      }
    });
    await claude.goto("https://claude.ai/chat/release-fixture");
    await claude.addScriptTag({ path: path.join(release, "capture-core.js") });
    await claude.addScriptTag({ path: path.join(release, "page-capture.js") });
    const capture = await claude.evaluate(() => ChatlogPageCapture.capture());
    assert.equal(capture.ok, true);
    assert.equal(capture.conversation.diagnostics.completeness, "complete", JSON.stringify(capture.conversation.diagnostics));
    assert.equal(capture.conversation.messages.length, 2);
    assert(requested.includes("/api/organizations/fixture-workspace/chat_conversations/release-fixture"));
    apiAvailable = false;
    const fallback = await claude.evaluate(() => ChatlogPageCapture.capture());
    assert.equal(fallback.conversation.diagnostics.completeness, "partial");
    assert.equal(fallback.conversation.diagnostics.method, "rendered-dom-fallback");
    console.log("PASS packaged Claude adapter captures a synthetic API fixture and marks API-failure fallback partial");

    const saved = await library.evaluate((record) => ChatlogStore.saveConversation(record), capture.conversation);
    await library.reload();
    await library.getByRole("heading", { name: fixture.name }).waitFor();
    await library.getByRole("searchbox").fill("𝓲𝓷𝓴");
    await library.getByText("1 matching · 1 saved capture").waitFor();
    await library.getByRole("link", { name: `View or print ${fixture.name}` }).click();
    await library.locator(".turn").first().waitFor();
    assert.equal(await library.locator(".turn").count(), 2);
    const downloadWait = library.waitForEvent("download");
    await library.getByRole("button", { name: "HTML", exact: true }).click();
    const download = await downloadWait;
    const file = await download.path();
    const exported = await fs.readFile(file, "utf8");
    assert(exported.includes("Content-Security-Policy"));
    assert(exported.includes(fixture.chat_messages[0].content[0].text));
    assert(!/<script\b/i.test(exported));
    await library.screenshot({ path: path.join(qa, "extension-transcript.png"), fullPage: true });
    await library.goto(`${extensionUrl}/archive.html`);
    library.once("dialog", (dialog) => dialog.accept());
    await library.getByRole("button", { name: `Delete ${fixture.name} from this Chrome profile` }).click();
    await library.getByText("No conversations saved yet.").waitFor();
    assert.equal(await library.evaluate((id) => ChatlogStore.getConversation(id), saved.id), undefined);
    console.log("PASS exact release saves, searches, views, downloads safe HTML, and deletes a synthetic transcript");

    const demo = await context.newPage();
    await demo.goto(`http://127.0.0.1:${server.address().port}/`);
    await demo.getByRole("button", { name: "Try the local library" }).click();
    await demo.getByRole("link", { name: "Open the demo library →" }).waitFor();
    await demo.screenshot({ path: path.join(qa, "demo-desktop.png"), fullPage: true });
    await demo.setViewportSize({ width: 390, height: 844 });
    await demo.screenshot({ path: path.join(qa, "demo-mobile.png"), fullPage: true });
    assert(await demo.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await demo.setViewportSize({ width: 1280, height: 900 });
    if (process.env.CHATLOG_PRINT_QA === "1") {
      const pdfFolder = path.join(root, "output", "pdf");
      await fs.mkdir(pdfFolder, { recursive: true });
      await demo.pdf({ path: path.join(pdfFolder, "chatlog-printer-sample.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
    }
    assert.deepEqual(failures, []);
    console.log("PASS demo stores invented data locally, renders at mobile width, and reports no uncaught page errors");
    console.log(`Chrome: ${context.browser().version()}\nPackaged extension: ${release}\nScreenshots: ${qa}\nAuthenticated live Claude: NOT TESTED (all Claude responses in this check are synthetic)`);
  } finally {
    if (context) await context.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
