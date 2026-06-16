# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome MV3 extension that converts DeepWiki (`deepwiki.com`) and Devin (`app.devin.ai`) documentation pages to Markdown. Three modes: single page, batch ZIP, batch single-file merge.

## Common Commands

```bash
# Install / reload as unpacked extension
# 1) chrome://extensions/  → Developer mode ON
# 2) "Load unpacked" → select repo root
# 3) Re-click the 🔄 reload icon after every code change

# Build a Chrome Web Store zip (reads version from manifest.json)
./build-for-store.sh
# → produces deepwiki-md-extension-v<version>.zip

# When releasing: bump version in manifest.json and add an entry to CHANGELOG.md

# Toggle verbose logging
# Edit content.js:7  → const DEBUG_MODE = true;   (then reload extension)
# DEBUG_MODE=true ALSO enables execution on arbitrary file:// pages — leave false in production.

# Test on file:// pages (test/test-page.html, test/quick-test.js)
# Required: chrome://extensions/ → "Details" → enable "Allow access to file URLs"
# Otherwise the content script will not load and you will see "Could not establish connection".
```

There is no test runner, lint, typecheck, or build pipeline. `package.json` declares `jsdom` and `mermaid` for ad-hoc local repros (`test/repro_*.js`, `test/generate_svg.mjs`), but defines no scripts. Tests are manual against either real DeepWiki/Devin pages or `test/test-page.html`.

## Architecture

Three message endpoints — popup ↔ background ↔ content script — coordinate over `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`. The non-obvious complexity lives in **how readiness is synchronized** during SPA navigation and extension reloads.

### Files

- `manifest.json` — MV3, host permissions for `deepwiki.com/*` and `app.devin.ai/*`. Permissions: `downloads`, `tabs`, `webNavigation`, `scripting`.
- `background.js` (service worker) — batch orchestration, per-tab message queue, SPA navigation, ZIP/file generation. Loads `lib/jszip.min.js`, `utils.js`, and `batchHistory.js` via `importScripts`.
- `batchHistory.js` — IndexedDB persistence for completed batch ZIP / single-file outputs (re-download without re-converting).
- `content.js` — DOM → Markdown conversion (`processNode`), sidebar extraction (`extractAllPages`), Devin button clicks (`clickDevinButton`). Wrapped in an IIFE with a version guard (`window.__deepwikiVersion`) so re-injection cleanly supersedes the prior instance.
- `popup.js` / `popup.html` — UI with three buttons + cancel; defers re-injection to background via `ensureContentScript`.
- `utils.js` — shared `sanitizeName` and `isValidDeepWikiUrl` (loaded by both background and popup).

### Key invariants

**Tab readiness queue (`background.js`).** `messageQueue[tabId] = { isReady, queue }` buffers any message destined for a tab whose content script hasn't yet sent `contentScriptReady`. Flushed by `flushMessageQueue` once ready. This is what lets batch processing fire the next `convertToMarkdown` immediately after navigation without racing the freshly re-injected content script. When initiating actions that re-mount the content script (e.g. `clickDevinButton`), the background must call `markTabPending(tabId)` *before* sending and pass `forceDirect=true` to `sendMessageToTab`, otherwise the message would be queued and never delivered.

**Content script readiness signal (`content.js`).** Sends `chrome.runtime.sendMessage({ action: 'contentScriptReady' })` synchronously at IIFE start *and* again on `window load`. Background has a listener registered **before** `chrome.scripting.executeScript` resolves (see `ensureContentScript`) — this avoids a documented race where `executeScript` resolves only after the script body finishes, by which time a synchronous `contentScriptReady` could have already fired.

**SPA navigation completion.** `navigateToPage` listens to `webNavigation.onCompleted` + `onReferenceFragmentUpdated` + `onHistoryStateUpdated` simultaneously, because Devin/DeepWiki use a mix of full loads, hash updates, and history pushState. All three listeners share one `cleanup`.

**Version guard for re-injection.** `content.js` increments `window.__deepwikiVersion` and every message handler short-circuits if `window.__deepwikiVersion !== __v`. This is required because reloading the extension (without refreshing the page) leaves stale event listeners from earlier injections.

**Devin sidebar = buttons, not links.** Devin's wiki nav is `<button aria-label>` not `<a href>`. `getDevinSidebarButtons` filters by aria-label (deny-list of destructive actions like `Delete`, `Sign out`, `Reset`) and layout (must be on left half of viewport, outside `.prose-main`). Page identity is tracked by **`buttonIndex`**, not text — duplicate labels are common, and clicking by text would target the wrong page. Already-selected buttons are skipped to bypass the 15s SPA-readiness poll. `data-selected="true"` is the primary "page rendered" signal; an `h1` text match is the fallback.

**Content-extraction selectors are site-specific.** DeepWiki uses `.container > div:nth-child(2) .prose`; Devin uses `.prose-main` / `.prose` / `article` / `main`. `convertToMarkdown` retries up to 20× at 500ms intervals if the container has fewer than 50 chars of text — this guards against capturing a half-rendered React tree.

**URL gate (`utils.js:isValidDeepWikiUrl`).** Hostname must be exactly `deepwiki.com`, `*.deepwiki.com`, or `app.devin.ai` (no substring matching — `evil-deepwiki.com` is rejected) **and** the path must have ≥2 segments. `file://` and `localhost`/`127.0.0.1` are accepted only when the URL contains `test-page.html` or `test/`. Mirror this any time you add a new permitted origin: update both `manifest.json` (`host_permissions` + `content_scripts.matches`) and `isValidDeepWikiUrl`.

**Local-file execution gate (`content.js:ALLOW_SCRIPT_EXECUTION`).** Defense-in-depth on top of the URL gate: on `file://`, the content script no-ops unless the URL is a known test page or `DEBUG_MODE=true`. When this guard short-circuits, **no `ping` handler is registered** — that's intentional, so background detects the dead instance and falls through to error/re-injection paths.

**Diagram export.** Before `processNode` walks the prose container, `collectDiagramAssets` rasterizes root Mermaid/diagram SVGs to PNG (SVG fallback on failure) and builds `currentSvgPathMap` so `convertSvgToMarkdown` emits `![Diagram N](images/{pageSlug}-diagram-N.png)`. Failed rasterization falls back to existing SVG→Mermaid text converters. Assets are returned in `convertToMarkdown`'s `assets[]` and packaged as follows: single-page download → mini-ZIP when assets exist; batch ZIP → `images/` inside archive; merged single-file → `inlineAssetsInMarkdown` rewrites refs to base64 data URLs.

**Filenames.** ZIP mode uses page head/current title (`sanitizeFolderName`). Single-file merge: DeepWiki uses `<headTitle>[-<lastIndexedDate>].md`; Devin uses `Devin-<org>-<project>[-<lastIndexedDate>].md`. Sanitization in `sanitizeName` strips `\/:*?"<>|`, collapses whitespace and runs of `-`, and trims leading/trailing `-`. Within a single batch, `getUniqueFileName` appends `-1`, `-2`, … to deduplicate.

**Batch download history.** After a successful batch ZIP or single-file merge, `background.js` saves the output to IndexedDB (`batchHistory.js`, DB `deepwiki-batch-history`) *before* triggering `chrome.downloads`, so dismissing the save dialog still leaves a recoverable copy. Retention: max 5 entries (FIFO by `completedAt`), skip persist above 80 MB per entry (download still proceeds). Popup **Recent batches** lists metadata and supports re-download / per-entry remove / clear all. Not used for single-page `downloadPageZip`.

### Message contract (background ↔ content)

| Action | Direction | Payload | Notes |
|---|---|---|---|
| `ping` | bg → cs | — | `{ pong: true }`; used by `ensureContentScript` |
| `contentScriptReady` | cs → bg | — | Fires twice per load (sync + window.load); flushes queue |
| `convertToMarkdown` | bg/popup → cs | — | Returns `{ success, markdown, markdownTitle, headTitle, assets[] }` where each asset is `{ relativePath, mimeType, base64 }` |
| `extractAllPages` | bg → cs | — | Wrapped in `setTimeout(…, 0)` to force async — callers rely on `return true` keeping the channel open |
| `clickDevinButton` | bg → cs | `{ buttonText, buttonIndex }` | `buttonIndex` is authoritative; `buttonText` is fallback |
| `pageLoaded` / `tabActivated` | bg → cs | — | Liveness pings on tab updates; cs must `sendResponse({ received: true })` |
| `startBatch` / `startBatchSingleFile` / `cancelBatch` / `getBatchStatus` | popup → bg | `{ tabId? }` | |
| `batchUpdate` | bg → popup | progress payload | Broadcast; popup also calls `getBatchStatus` on open to recover state |
| `ensureContentScript` | popup → bg | `{ tabId }` | Popup delegates re-injection here instead of doing it itself |
| `downloadPageZip` | popup → bg | `{ markdown, assets[], zipFileName, mdFileName }` | Single-page download with diagram assets; builds ZIP via JSZip |
| `getBatchHistory` | popup → bg | — | `{ success, entries[] }` metadata only (no payloads) |
| `redownloadBatchHistory` | popup → bg | `{ id }` | Loads IDB record and triggers `saveAs` download |
| `deleteBatchHistoryEntry` | popup → bg | `{ id }` | Removes one history entry |
| `clearBatchHistory` | popup → bg | — | Clears all history entries |

### When editing

- **Version release** → bump `manifest.json` `version`, add a dated section to root `CHANGELOG.md` (Keep a Changelog format).
- **New permitted origin** → update `manifest.json` host_permissions + content_scripts.matches, AND `isValidDeepWikiUrl`, AND any hostname checks in `background.js` (`tab.url.includes('deepwiki.com')`/`'devin.ai'`) and `content.js` (`hostname.includes('devin.ai')`). All three layers must agree.
- **New async message handler in `content.js`** → `return true` from the listener so the channel stays open; mirror in `background.js` if it sends back. Prefer wrapping the body in `setTimeout(…, 0)` (see `extractAllPages`) to avoid the "channel closed" failure mode.
- **Action that re-mounts the content script** → call `markTabPending(tabId)` first, then `sendMessageToTab(..., true)` (forceDirect). The next `contentScriptReady` flushes the queue.
- **Don't bypass `processNode`'s ignore list** (`button`, `svg`, `path`, `sr-only`, `invisible`, `hidden`, and `Copy code` / `Link copied!` text) — these filter UI chrome that DeepWiki injects into the article DOM.
- **Don't `console.log` outside `if (DEBUG_MODE)`** in production paths — verbose logging is gated behind that flag everywhere except top-level lifecycle messages.
