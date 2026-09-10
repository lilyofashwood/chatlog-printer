# Chatlog Printer

Chatlog Printer is a local-first Chrome extension for saving Claude's readable active branch and turning it into a clean, printable transcript.

The current build is a working unpacked-extension prototype. It is intentionally Claude-only while the capture path is hardened.

## What it does

- Captures the active branch of an open `claude.ai/chat/...` conversation from Claude's structured conversation response.
- Reconstructs edited/regenerated branches by following message parent links instead of exporting abandoned responses.
- Saves a normalized transcript in extension-owned IndexedDB on this computer.
- Opens a dedicated, selectable-text print view for printing or Chrome's **Save as PDF** destination.
- Downloads self-contained HTML, Markdown, normalized JSON, or a plaintext JSON export of the local library.
- Preserves source Markdown, code indentation, timestamps, extracted attachment text, artifact source, and created-file content when Claude returns them.
- Reports partial captures, unknown content blocks, interrupted responses, missing binary attachments, and other omissions instead of silently claiming success.

It has no backend, account, analytics, telemetry, CDN, or remotely hosted code.

## Why API-first capture matters

Claude now virtualizes long conversations: only a small window of nearby messages may exist in the page DOM at one time. Printing Claude's page or scraping the currently rendered HTML can therefore produce a plausible-looking but incomplete transcript.

Chatlog Printer asks Claude's own same-origin conversation endpoint for the structured thread after an explicit toolbar click, uses the browser's existing Claude session, and then validates the active parent chain. A DOM capture exists only as a clearly labeled partial fallback. Partial or warning captures require confirmation before they are saved.

## Install the prototype

1. Open `chrome://extensions` in Google Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `chatlog-printer` directory.
5. Pin Chatlog Printer from Chrome's extensions menu if you want the button visible.

No build step or package installation is required.

## Use it

1. Open a specific conversation at `https://claude.ai/chat/...` and wait for Claude to finish responding.
2. Click the Chatlog Printer toolbar button.
3. Choose **Save locally** or **Save & print**.
4. In the print view, choose **Print / Save PDF**. In Chrome's dialog, select **Save as PDF** or a physical printer.

A longer capture on the same verified message path updates its local record. Downgrades and divergent branches are preserved as snapshots; if a stronger divergent capture is promoted, the previous base is snapshotted first. Use **Open local library** for search, downloads, deletion, and whole-library JSON export.

## Capture receipt

Every capture reports two separate facts:

- **Message chain — Verified / Unverified:** whether the requested conversation ID matched, the current leaf reached the root without a gap or cycle, Claude was not streaming, no compaction/truncation was detected, and the API response agreed with the rendered message window.
- **Content fidelity — Full text / Omissions:** whether readable transcript material was reproduced without known omissions such as image bytes, file bytes, tool internals, private reasoning, unresolved artifact patches, or an unknown block type.

The overall label is **Complete** only when the chain is verified and readable content has no known omissions, **Warnings** when the chain is verified with disclosed fidelity issues, and **Partial** when the chain itself cannot be proven. Warning and partial captures require confirmation before saving.

Alternate branches are intentionally excluded because they are not the branch currently selected in Claude. Their count is recorded in capture notes.

## Local data and privacy

Conversation records live in this extension's IndexedDB database in the current Chrome profile. Nothing is sent to the developer or another service. The only network calls made during capture go to `https://claude.ai` endpoints that the open page itself uses, authenticated by the session already in that tab.

Important prototype caveats:

- The local library is not encrypted separately from the Chrome profile. Anyone with access to that browser profile may be able to read it.
- Removing the extension removes its IndexedDB library. Download HTML/Markdown/JSON files or the library JSON export for durable copies. Library restore/import is not implemented yet.
- Exported files are user-owned local files and survive extension removal.
- Incognito capture is disabled so a private-window conversation cannot be persisted into the regular-profile library.

See [PRIVACY.md](PRIVACY.md) for the complete data-flow statement.

## Permissions

- `activeTab`: temporary access to the tab only after the user clicks the extension.
- `scripting`: inject the packaged Claude capture adapter into that tab.
- `unlimitedStorage`: protect a user-enabled local transcript library from ordinary browser quota limits and eviction.

There are no persistent host permissions, all-sites access, downloads permission, tabs permission, debugger access, web request access, or clipboard access.

## Architecture

```text
explicit toolbar click
        ↓
Claude same-origin conversation response
        ↓
active-branch and completeness validation
        ↓
versioned semantic transcript
        ↓
extension-origin IndexedDB
        ↓
print view · HTML · Markdown · JSON · library export
```

Key files:

- `capture-core.js` — pure active-branch ordering and transcript normalization.
- `page-capture.js` — the on-click Claude adapter and marked-partial DOM fallback.
- `background.js` — capture orchestration outside the ephemeral popup; warning/partial saves wait for its live receipt.
- `store.js` — extension-origin IndexedDB library.
- `render.js` — safe Markdown, HTML, JSON, and print document rendering.
- `popup.*`, `archive.*`, `transcript.*` — the three extension surfaces.
- `tests/` — browser-run regression and hostile-input tests.

## Tests

The runner uses Python's standard library to coordinate Chrome, so it does not need Node, npm, or downloaded packages:

```sh
./scripts/run-browser-tests.sh
```

With ordinary branded Chrome 137+, the command runs the browser/IndexedDB suite and reports the unpacked-extension smoke as skipped because [Google disabled command-line extension loading](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY). Set `CHATLOG_CHROME_BIN` to Chromium or Chrome for Testing to include the real service-worker round-trip.

Current coverage includes active-branch reconstruction, absent/missing-parent failure, artifact revision folding, code/attachment whitespace, citation sanitization, unknown-block preservation, hostile HTML and unsafe URL escaping, fenced code, tables, script-free standalone HTML, and IndexedDB snapshot preservation.

The parser still needs sanitized fixtures captured from multiple real Claude account/conversation shapes before a Chrome Web Store release.

## Known limitations

- Claude's conversation endpoint is internal and undocumented. The adapter is isolated because Anthropic can change it without notice.
- Live `/chat/...` conversations are the verified target. `/share/...` pages currently use the partial DOM adapter.
- Attachment text returned by Claude is saved; image/file bytes are not yet embedded. Their omission is recorded.
- Hidden reasoning and internal tool results are not printed. Their counts are disclosed in capture notes; human/assistant text and content-bearing artifacts/files remain the product promise.
- The viewer uses a compact bundled Markdown renderer. Extremely exotic Markdown may be preserved in Markdown/JSON but rendered more simply in HTML/PDF.
- The library currently loads all saved records for search and export, so extremely large archives may need pagination/indexing work.
- Chrome does not provide an ordinary low-permission API that silently writes a PDF. The extension opens the native print dialog instead.
- This prototype has not yet been exercised against an authenticated live Claude account in this workspace.

## Research trail

This project was prompted by the older [A.I. Archives Chrome extension](https://chromewebstore.google.com/detail/ai-archives-share-claude/jagobfpimhagccjbkchfdilhejgfggna), whose hosted-link model and public reviews expose several useful lessons: Claude breakage, lost code spacing, limited export formats, and unclear deletion/privacy tradeoffs.

The implementation direction is also informed by:

- [A.I. Archives review history](https://chrome-stats.com/d/jagobfpimhagccjbkchfdilhejgfggna/reviews)
- [A.I. Archives privacy policy](https://aiarchives.org/policy.html)
- [Claude virtualization/export regression report](https://github.com/anthropics/claude-code/issues/83456) (user-filed, not an official Anthropic postmortem)
- [true-ai-export](https://github.com/filteredwaterdev/true-ai-export), an MIT-licensed proof of concept for API-first local exports
- [Chrome `activeTab` documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Chrome extension security guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)

See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for additional technical references and licensing notes.

## Release path

Before publishing broadly:

1. Test against a fixture matrix and several long live conversations.
2. Add encrypted-at-rest library mode or make durable user-owned files the default.
3. Add import/restore and storage health indicators.
4. Decide how to package attachment and artifact binaries without remote references.
5. Complete Chrome Web Store privacy disclosures and an accurate hosted privacy policy.
6. Add independent branding icons and store assets.
7. Package a release ZIP without development tests/scripts and test that exact artifact in Chrome for Testing.

Chatlog Printer is not affiliated with or endorsed by Anthropic.
