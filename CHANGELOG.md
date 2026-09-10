# Changelog

## 0.1.1 — September 10, 2026

Private review build, preserving the September 1 prototype's capture architecture and local data format.

- Added an invented, interactive sample using the actual local library, renderer, and exporters.
- Added original paper-mark toolbar icons, a loopback demo server, and reproducible release packaging with a fixed file allowlist.
- Added real Manifest V3 and packaged-adapter integration checks in a temporary Chrome for Testing profile.
- Preserved literal private-use Unicode that previously could be mistaken for the Markdown renderer's internal placeholders.
- Applied artifact replacement strings literally, including `$&` and related sequences. Repeated matching source fragments are now marked unresolved instead of guessing which occurrence to replace. A later full rewrite restores a known final source.

## 0.1.0 — September 1, 2026

Original local prototype: Claude API capture, active-branch validation, explicit capture receipts, partial DOM fallback, IndexedDB library, preserved divergent snapshots, and PDF/HTML/Markdown/JSON export.

The complete pre-0.1.1 source directory was copied unchanged into the workspace's historical archive before this release work began. No prior Git history existed in that directory.
