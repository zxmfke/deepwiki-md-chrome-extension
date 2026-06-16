# DeepWiki to Markdown Extension

A Chrome extension to convert DeepWiki documentation pages to Markdown format for local editing and archiving.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/giidpddkhhjaikgjkkfclfidbnekghde?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/deepwiki-to-markdown/giidpddkhhjaikgjkkfclfidbnekghde)

[简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

## ☕ Support This Project

<a href="https://buymeacoffee.com/philipz" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## Overview

This extension helps you save documentation from DeepWiki (https://deepwiki.com) as Markdown files. Perfect for:
- Creating local backups of documentation
- Offline reading and reference
- Repurposing content for your own blog or notes
- Preserving knowledge from GitHub repositories

## Features

### 1. Single Page Download
Convert and download the current DeepWiki page as a Markdown file.

### 2. Batch Download (ZIP Archive)
Download all subpages of a documentation project as individual Markdown files, packaged in a ZIP archive with an auto-generated index.

### 3. Single File Batch Download
Merge all documentation pages into a single Markdown file for easy reading and sharing.

### 4. Batch download history
After a batch ZIP or single-file run completes, the extension keeps the last few results locally so you can open the popup and download again if you dismissed the save dialog (no re-conversion).

### 5. Advanced Conversion
- Preserves code blocks with syntax highlighting
- Converts Mermaid diagrams (flowcharts, sequence diagrams, class diagrams, state diagrams)
- Maintains document structure and formatting
- Handles tables, lists, and nested content
- Extracts metadata (last indexed date)

## Installation

### Option 1: Install from Chrome Web Store (Recommended)

1. Visit the [Chrome Web Store](https://chromewebstore.google.com/detail/deepwiki-to-markdown/giidpddkhhjaikgjkkfclfidbnekghde)
2. Click "Add to Chrome"
3. Verify installation - the DeepWiki icon should appear in your extensions toolbar

### Option 2: Install from Source

1. **Download the extension**
   - Clone this repository: `git clone https://github.com/philipz/deepwiki-md-chrome-extension.git`
   - Or download from the [Releases](https://github.com/philipz/deepwiki-md-chrome-extension/releases) page

2. **Install in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the extension directory

3. **Verify installation**
   - The DeepWiki icon should appear in your extensions toolbar
   - Visit any DeepWiki page to test

## Usage

![Extension UI](./images/UI.png)

### Single Page Download

1. Navigate to any DeepWiki documentation page
   - Example: [ThinkInAIXYZ/go-mcp](https://deepwiki.com/ThinkInAIXYZ/go-mcp)
2. Click the extension icon in your toolbar
3. Click **"Download Current Page"**
4. Choose where to save the Markdown file

### Batch Download (ZIP)

1. Open the main page of a DeepWiki documentation project
   - Example: [ThinkInAIXYZ/go-mcp](https://deepwiki.com/ThinkInAIXYZ/go-mcp)
2. Click the extension icon
3. Click **"Download All Pages"**
4. Wait for the conversion process to complete
   - Progress is shown in the popup
   - You can cancel anytime with the "Cancel" button
5. Save the ZIP file when prompted

**ZIP Contents:**
- Individual Markdown files for each page
- `README.md` with links to all documents
- Organized folder structure

### Single File Batch Download

1. Open the main page of a DeepWiki documentation project
2. Click the extension icon
3. Click **"Download as one md file"**
4. Wait for all pages to be processed
5. Save the combined Markdown file

**Perfect for:**
- Creating a single-file knowledge base
- Importing into note-taking apps
- Sharing complete documentation easily

## Example

**Before (DeepWiki):**

![DeepWiki Page](./images/deepwiki-github.png)

**After (Markdown):**

![Markdown Output](./images/deepwiki-markdown.png)

## Technical Details

- **Supported Sites:** https://deepwiki.com/*
- **File Format:** Markdown (.md)
- **Encoding:** UTF-8
- **Batch Downloads:** ZIP archive with organized structure
- **Diagram Support:** Mermaid syntax

## Requirements

- Google Chrome or Chromium-based browser (Edge, Brave, etc.)
- Access to https://deepwiki.com

## Troubleshooting

**Extension not working:**
- Ensure you're on a valid DeepWiki documentation page (must have at least 2 path segments: `/org/project`)
- Check that the page has fully loaded before clicking convert
- Try refreshing the page

**Download fails:**
- Check your browser's download settings
- Ensure you have write permissions to the download folder
- For large batch downloads, ensure sufficient disk space

**Batch conversion stuck:**
- Use the "Cancel" button to stop the process
- Refresh the page and try again
- Check browser console for error messages (F12 → Console)

## Roadmap

Future enhancements under consideration:

- [ ] Auto-translation to other languages before conversion
- [ ] Enhanced local storage options
- [ ] Cloud service integration:
  - [ ] Google Drive
  - [ ] Microsoft OneDrive
  - [ ] Notion
  - [ ] Feishu/Lark Docs
- [ ] Custom conversion templates
- [ ] Configuration options (diagram format, metadata inclusion, etc.)
- [ ] Support for additional documentation platforms

## Contributing

Contributions are welcome! Feel free to:
- Report bugs via [Issues](https://github.com/philipz/deepwiki-md-chrome-extension/issues)
- Suggest features via [Issues](https://github.com/philipz/deepwiki-md-chrome-extension/issues)
- Submit pull requests

## Privacy

Conversions run locally in your browser. Completed batch downloads may be kept briefly in local IndexedDB so you can re-download them from the popup (see [Privacy Policy](PRIVACY_POLICY.md)).

For complete details, see our [Privacy Policy](PRIVACY_POLICY.md).

## License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- Built for the [DeepWiki](https://deepwiki.com) platform
- Uses [JSZip](https://stuk.github.io/jszip/) for ZIP file creation
- Inspired by the need to preserve and repurpose technical documentation

---

**Version:** See [CHANGELOG.md](CHANGELOG.md) (current: 0.3.0)
**Maintainer:** [@philipz](https://github.com/philipz)
**Repository:** https://github.com/philipz/deepwiki-md-chrome-extension
