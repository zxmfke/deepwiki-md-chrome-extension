# Privacy Policy for DeepWiki to Markdown Extension

**Last Updated:** November 20, 2024

## Overview

DeepWiki to Markdown Extension ("the Extension") is committed to protecting your privacy. This privacy policy explains our data practices and your privacy rights.

## Data Collection

**We do not collect, store, or transmit any personal data.**

The Extension operates entirely locally within your browser. All content conversion from DeepWiki to Markdown format happens on your device.

## What We Don't Do

- ❌ We do NOT collect any personal information
- ❌ We do NOT track your browsing activity
- ❌ We do NOT send any data to external servers
- ❌ We do NOT use cookies or tracking technologies
- ❌ We do NOT perform any analytics or telemetry
- ❌ We do NOT share any information with third parties
- ❌ We do NOT display advertisements

## Permissions Usage

The Extension requires the following permissions to function:

### 1. downloads
**Purpose:** To save converted Markdown files to your local download folder.
**Data Access:** None. This permission only allows the extension to trigger file downloads.

### 2. tabs
**Purpose:** To detect when you're viewing a DeepWiki page.
**Data Access:** Only reads the URL of the current tab to check if it matches `deepwiki.com/*`. No browsing history is collected.

### 3. webNavigation
**Purpose:** To detect page load events and coordinate content extraction.
**Data Access:** Only monitors navigation events on DeepWiki pages you're actively viewing.

### 4. host_permissions (https://deepwiki.com/*)
**Purpose:** To read and extract content from DeepWiki pages for conversion.
**Data Access:** Only accesses content from DeepWiki pages when you explicitly click a download button. No automatic background access occurs.

## How the Extension Works

1. You visit a DeepWiki documentation page
2. You click the extension icon and choose a download option
3. The extension reads the current page content
4. Content is converted to Markdown format locally in your browser
5. The Markdown file is saved to your download folder

**All processing happens locally on your device. No data leaves your browser.**

## Third-Party Services

The Extension does not use any third-party services, analytics, or tracking tools.

## External Libraries

The Extension includes one third-party library:
- **JSZip** (v3.10.1) - Used locally to create ZIP archives for batch downloads
- This library runs entirely in your browser and does not communicate with external servers

## Data Storage

The Extension stores data locally on your device only when you complete a batch download (ZIP or single merged Markdown file):

- Completed batch outputs are saved in **IndexedDB** so you can re-download them from the extension popup without re-running conversion
- Up to **5** recent batch results are kept; older entries are removed automatically
- Archives larger than **80 MB** are not kept in history (the initial download still runs)
- You can remove individual entries or clear all history from the popup
- No cookies are created
- No data is transmitted to our servers or third parties

Single-page downloads are not stored in history. Aside from optional batch history, the only files created are those you explicitly choose to download via your browser’s save dialog.

## Children's Privacy

The Extension does not knowingly collect any information from anyone, including children under the age of 13.

## Changes to This Privacy Policy

We may update this privacy policy from time to time. Any changes will be posted on this page with an updated "Last Updated" date.

## Your Rights

Since we don't collect any personal data, there is no data to:
- Request access to
- Request deletion of
- Request correction of
- Request transfer of

## Open Source

This Extension is open source. You can review the complete source code at:
https://github.com/philipz/deepwiki-md-chrome-extension

## Contact

If you have questions about this privacy policy or the Extension, please:
- Open an issue on GitHub: https://github.com/philipz/deepwiki-md-chrome-extension/issues
- Contact the maintainer: [@philipz](https://github.com/philipz)

## Compliance

This Extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)

**Summary:** We don't collect data, so there's nothing to protect, share, or delete. Your privacy is fully preserved.

---

**Version:** 1.0
**Extension Version:** 0.1.3
**Effective Date:** November 20, 2024
