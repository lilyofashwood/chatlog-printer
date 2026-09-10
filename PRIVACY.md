# Privacy statement

Last updated: September 1, 2026

Chatlog Printer is designed to keep conversation data on the user's device.

## Data it accesses

Only after the user clicks the extension while viewing a Claude conversation, Chatlog Printer reads:

- The active Claude conversation's structured messages and metadata.
- The conversation title, URL, identifier, roles, timestamps, text, and available attachment/artifact metadata.
- The active Claude workspace identifier needed to request that conversation from Claude.
- The currently mounted rendered message window to check it against the structured response. If structured capture fails, or on a `/share/...` page, this window may instead be offered as a clearly marked partial fallback that requires confirmation before saving.

The extension does not monitor tabs in the background or automatically collect conversations.
Incognito capture is disabled; the extension does not save private-window conversations into its regular-profile library.

## Network activity

During capture, packaged code running in the active Claude tab requests Claude's own same-origin organization and conversation endpoints. Those requests use the Claude session already present in that tab.

Other than the same-origin Claude requests described above, Chatlog Printer does not send conversation data, URLs, account identifiers, analytics, diagnostics, or telemetry to the developer or anyone else. It contains no remotely hosted executable code, fonts, images, or SDKs.

## Local storage

Saved conversations are stored in extension-origin IndexedDB in the current Chrome profile. Local records remain until the user deletes them, clears the extension's site data, removes the Chrome profile, or uninstalls the extension.

The prototype requests `unlimitedStorage` to reduce quota/eviction risk. This does not make the data cloud-hosted or accessible to the developer.

The local library is not separately encrypted in this prototype. Users should protect their operating-system account and Chrome profile and should use downloaded HTML, Markdown, JSON, or the library JSON export for durable archival copies. Restore/import of that library export is not implemented yet.

## Exports

HTML, Markdown, JSON, library-export, print, and Save-as-PDF operations are performed locally. Downloaded files are plaintext and are written through the browser's ordinary local download flow. Printing uses Chrome's native print dialog.

## Deletion

Each local conversation can be deleted from the library after a confirmation prompt. Removing the extension removes its local IndexedDB data. Files the user previously downloaded are not deleted by either action.

## Permissions

- `activeTab` grants temporary access to the active page after an explicit toolbar click.
- `scripting` loads the packaged capture adapter into that one page.
- `unlimitedStorage` supports the local transcript library.

The extension does not request persistent host access, all-sites access, downloads management, tab-history access, debugger access, web-request interception, identity, cookies, or clipboard permissions.

## Changes

Any future analytics, synchronization, hosted sharing, external service, or materially different data use would require an explicit product decision, updated disclosures, and user consent. None are present in this prototype.

Chatlog Printer is not affiliated with or endorsed by Anthropic.
