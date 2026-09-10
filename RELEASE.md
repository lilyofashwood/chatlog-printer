# v0.1.1 · private review build

The extension is ready for a local trial. It has not been submitted to the Chrome Web Store, and an authenticated Claude conversation has not yet been captured in this workspace.

## Review artifacts

- `dist/chatlog-printer-0.1.1.zip` — clean, deterministic extension package.
- `dist/chatlog-printer-0.1.1/` — matching folder for Chrome's **Load unpacked** action.
- `dist/SHA256SUMS` — release ZIP checksum.
- `index.html` — invented interactive sample, served with `python3 scripts/serve-demo.py`.
- `output/pdf/chatlog-printer-sample.pdf` — local print-layout review sample when PDF QA is requested.

Generated packages and QA files are ignored by Git and belong on the private release as assets, not in source history.

## Verified

On September 10, 2026:

- 21/21 browser regression checks passed, including Unicode preservation, malformed parent chains, artifact reconstruction ambiguity, safe HTML export, and IndexedDB snapshot preservation.
- The unpacked Manifest V3 extension loaded and answered from its service worker in Chrome for Testing 151.0.7922.34.
- The exact 22-file packaged folder passed sender-restriction, synthetic structured-capture, API-failure fallback, save/search/view/export/delete, and responsive-demo checks.
- The demo uses invented data only. Its warning receipt identifies that fact on screen and in exported files.
- The two-page A4 sample PDF was rendered back to PNGs and visually reviewed: no clipped text, overlapping blocks, broken tables, or missing styled Unicode. Text extraction confirmed the final turn and receipt are present.

The integration runner intercepts the synthetic Claude fixture's requests. It exercises packaged adapter code without claiming a signed-in account test or a toolbar-granted `activeTab` capture.

## Remaining before broad publication

The first useful live check is an ordinary Claude text conversation, followed by a long thread, an edited/regenerated branch, code/artifacts, and attachments. Confirm that the receipt describes each accurately. The endpoint is undocumented, so live response shapes may require another adapter revision.

Attachment/image bytes, private reasoning, and internal tool results are not included. Their omissions are disclosed. Local storage is not separately encrypted, and JSON restore/import remains unimplemented.

Chrome Web Store listing assets, hosted privacy disclosures, and the public-release decision remain open. The working source and release are intended to stay private for owner review.

## Provenance and new decisions

All 28 original files (4,378 lines) were read in full before this work. The original directory is preserved at `../archive/2026-09-10/chatlog-printer-original/`. This release's icons, invented sample, package scripts, and regression fixes are new work, not recovered historical content. The existing research attribution remains in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).
