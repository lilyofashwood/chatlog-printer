# Acknowledgements and technical references

Chatlog Printer was implemented independently, with its architecture informed by public documentation and open-source projects that investigated the same failure mode.

- [filteredwaterdev/true-ai-export](https://github.com/filteredwaterdev/true-ai-export) — MIT. Demonstrates same-origin Claude conversation retrieval, complete/clean export semantics, omission reporting, and print-view PDF flow.
- [pinguarmy/ai-chat-exporter](https://github.com/pinguarmy/ai-chat-exporter) — MIT. Useful reference for strict active-branch validation and refusing unverified DOM-only captures.
- [mauriziofonte/chat-dump-bookmarklet](https://github.com/mauriziofonte/chat-dump-bookmarklet) — MIT. Useful reference for multi-workspace Claude lookup, API-first extraction, attachment text, and compact local rendering.
- [nuncaeslupus/ai-chat-exporter](https://github.com/nuncaeslupus/ai-chat-exporter) — MIT. Documents current Claude selector drift and local-only extension/export practices.
- [browser-use/browser-harness Claude share export map](https://github.com/browser-use/browser-harness/blob/main/agent-workspace/domain-skills/claude-ai/share-export.md) — public DOM notes for Claude share pages.
- [Chrome Extensions documentation](https://developer.chrome.com/docs/extensions/) — Manifest V3, permission, CSP, storage, and security requirements.

No source files from these projects were copied into this repository. Their published behavior, API observations, and design tradeoffs were used as research inputs. If future code is incorporated, its license and copyright notice must be preserved as required.

