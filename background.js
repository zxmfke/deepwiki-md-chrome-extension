importScripts('lib/jszip.min.js');
importScripts('utils.js');
importScripts('batchHistory.js');

const MESSAGE_TIMEOUT = 30000;
const CONVERT_MESSAGE_TIMEOUT = 120000;
// Delay constants for page rendering to avoid rate limiting and ensure content loads
const PAGE_RENDER_BASE_DELAY = 3000;
const PAGE_RENDER_JITTER = 1000;

const messageQueue = {};

// Utility functions (sanitizeName and isValidDeepWikiUrl) are now loaded from utils.js

// Ensure the content script is loaded and responsive in a tab.
// If not, re-inject it using chrome.scripting.executeScript.
async function ensureContentScript(tabId) {
  try {
    const response = await Promise.race([
      attemptDirectMessage(tabId, { action: 'ping' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 3000))
    ]);
    if (response && response.pong) {
      markTabReady(tabId);
      flushMessageQueue(tabId);
      return;
    }
  } catch (e) {
    // Content script not responding, need to re-inject
    if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
      console.log(`Content script not responding on tab ${tabId}: ${e.message}. Re-injecting...`);
    }
  }

  // Re-inject content script
  // Register listener BEFORE executeScript to avoid race condition:
  // content.js sends contentScriptReady synchronously during execution,
  // and executeScript resolves only after the script finishes running.
  let readyTimeoutId;
  let readyHandler;
  const readyPromise = new Promise((resolve, reject) => {
    readyHandler = function (msg, sender) {
      if (msg.action === 'contentScriptReady' && sender.tab?.id === tabId) {
        clearTimeout(readyTimeoutId);
        chrome.runtime.onMessage.removeListener(readyHandler);
        resolve();
      }
    };
    readyTimeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(readyHandler);
      reject(new Error('Content script injection timeout'));
    }, 5000);
    chrome.runtime.onMessage.addListener(readyHandler);
  });
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await readyPromise;
    markTabReady(tabId);
    flushMessageQueue(tabId);
  } catch (e) {
    // Clean up the readyPromise's timeout and listener to prevent
    // unhandled promise rejection when executeScript fails.
    clearTimeout(readyTimeoutId);
    chrome.runtime.onMessage.removeListener(readyHandler);
    readyPromise.catch(() => { }); // suppress the now-orphaned rejection
    throw new Error('Content script not available. Please refresh the page and try again.');
  }
}

const createInitialBatchState = () => ({
  isRunning: false,
  tabId: null,
  originalUrl: null,
  pages: [],
  convertedPages: [],
  folderName: '',
  processed: 0,
  failed: 0,
  cancelRequested: false,
  total: 0,
  currentTitle: '',
  fileNames: new Set()
});

let batchState = createInitialBatchState();
let lastBatchReport = {
  type: 'idle',
  message: 'Batch converter ready.',
  level: 'info',
  processed: 0,
  failed: 0,
  total: 0,
  running: false
};

function markTabPending(tabId) {
  if (!messageQueue[tabId]) {
    messageQueue[tabId] = { isReady: false, queue: [] };
    return;
  }
  messageQueue[tabId].isReady = false;
}

function markTabReady(tabId) {
  if (!messageQueue[tabId]) {
    messageQueue[tabId] = { isReady: true, queue: [] };
  } else {
    messageQueue[tabId].isReady = true;
  }
}

function dispatchMessageToTab(tabId, item) {
  chrome.tabs.sendMessage(tabId, item.message, response => {
    if (chrome.runtime.lastError) {
      item.reject(new Error(chrome.runtime.lastError.message));
      return;
    }
    item.resolve(response);
  });
}

function flushMessageQueue(tabId) {
  const entry = messageQueue[tabId];
  if (!entry) return;
  entry.isReady = true;
  while (entry.queue.length > 0) {
    const payload = entry.queue.shift();
    dispatchMessageToTab(tabId, payload);
  }
}

function queueMessageForTab(tabId, message, resolve, reject) {
  if (!messageQueue[tabId]) {
    messageQueue[tabId] = { isReady: false, queue: [] };
  }

  const queueItem = {
    message,
    resolve: (response) => {
      clearTimeout(queueItem.timeoutId);
      resolve(response);
    },
    reject: (error) => {
      clearTimeout(queueItem.timeoutId);
      reject(error);
    }
  };

  queueItem.timeoutId = setTimeout(() => {
    queueItem.reject(new Error(`Timed out waiting for response for ${message.action}`));
  }, getMessageTimeout(message));

  messageQueue[tabId].queue.push(queueItem);
}

function getMessageTimeout(message) {
  if (message && message.action === 'convertToMarkdown') {
    return CONVERT_MESSAGE_TIMEOUT;
  }
  return MESSAGE_TIMEOUT;
}

function withMessageTimeout(promise, message) {
  const timeoutMs = getMessageTimeout(message);
  const action = message?.action || 'message';
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timed out waiting for response for ${action}`));
      }, timeoutMs);
    })
  ]);
}

function attemptDirectMessage(tabId, message) {
  return withMessageTimeout(new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  }), message);
}

function shouldQueueForError(error) {
  if (!error || !error.message) return false;
  return error.message.includes('Receiving end does not exist') ||
    error.message.includes('Could not establish connection');
}

function waitForTabReady(tabId, timeoutMs = 20000) {
  const entry = messageQueue[tabId];
  if (entry && entry.isReady) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(check);
      reject(new Error('Timed out waiting for page to become ready after navigation'));
    }, timeoutMs);
    const check = setInterval(() => {
      const e = messageQueue[tabId];
      if (e && e.isReady) {
        clearInterval(check);
        clearTimeout(deadline);
        resolve();
      }
    }, 100);
  });
}

function sendMessageToTab(tabId, message, forceDirect = false) {
  const entry = messageQueue[tabId];
  const tryDirect = () => attemptDirectMessage(tabId, message);

  if (entry && entry.isReady) {
    return tryDirect().catch(error => {
      // If a "ready" tab fails, it might be effectively dead/orphaned (e.g. extension updated).
      // We should re-evaluate if we should queue or fail.
      if (shouldQueueForError(error)) {
        // Check tab status to see if we should really queue
        return new Promise((resolve, reject) => {
          chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
              reject(new Error('Tab no longer exists.'));
              return;
            }

            // Connection failed despite isReady=true (maybe refreshed?).
            // Mark as not ready and Queue.
            entry.isReady = false;
            queueMessageForTab(tabId, message, resolve, reject);
          });
        });
      }
      throw error;
    });
  }

  // If entry exists but is explicitly NOT ready (e.g. markTabPending was called),
  // we must queue directly to guarantee sequential execution after contentScriptReady.
  if (entry && !entry.isReady && !forceDirect) {
    return new Promise((resolve, reject) => {
      queueMessageForTab(tabId, message, resolve, reject);
    });
  }

  return tryDirect().catch(error => {
    if (!shouldQueueForError(error)) {
      throw error;
    }

    return new Promise((resolve, reject) => {
      // Before queuing, check if the tab still exists
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          reject(new Error('Tab no longer exists.'));
          return;
        }

        // Even if the tab is complete, the content script might effectively be
        // "loading" or re-initializing (e.g. after a reload). 
        // We should queue the message and wait for 'contentScriptReady'.
        // If it never comes, the queue timeout (MESSAGE_TIMEOUT) will handle it.
        queueMessageForTab(tabId, message, resolve, reject);
      });
    });
  });
}

function broadcastBatchUpdate(type, data = {}, overrideRunning) {
  const running = typeof overrideRunning === 'boolean' ? overrideRunning : batchState.isRunning;
  const payload = {
    action: 'batchUpdate',
    type,
    running,
    processed: data.processed ?? batchState.processed,
    failed: data.failed ?? batchState.failed,
    total: data.total ?? batchState.total,
    cancelRequested: batchState.cancelRequested,
    message: data.message || '',
    level: data.level || 'info'
  };

  lastBatchReport = payload;

  chrome.runtime.sendMessage(payload, () => {
    const error = chrome.runtime.lastError;
    if (error && error.message && !error.message.includes('Receiving end does not exist')) {
      if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
        console.debug('Batch update broadcast error:', error.message);
      }
    }
  });
}

function getBatchStatusPayload() {
  if (batchState.isRunning) {
    return {
      running: true,
      processed: batchState.processed,
      failed: batchState.failed,
      total: batchState.total,
      cancelRequested: batchState.cancelRequested,
      message: lastBatchReport.message,
      level: lastBatchReport.level,
      type: lastBatchReport.type
    };
  }

  const { action, ...rest } = lastBatchReport;
  return { running: false, ...rest };
}

function sanitizeName(value, fallback = 'page') {
  if (!value || typeof value !== 'string') return fallback;
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || fallback;
}

function getUniqueFileName(desired) {
  const base = sanitizeName(desired, 'page');
  let candidate = base;
  let counter = 1;
  while (batchState.fileNames.has(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  batchState.fileNames.add(candidate);
  return candidate;
}

function resetBatchState() {
  batchState = createInitialBatchState();
}

function cancelBatchProcessing() {
  if (!batchState.isRunning) {
    return false;
  }
  batchState.cancelRequested = true;
  broadcastBatchUpdate('cancelling', {
    message: `Cancelling... processed ${batchState.processed}/${batchState.total}.`
  });
  return true;
}

async function restoreOriginalPage() {
  if (!batchState.tabId || !batchState.originalUrl) {
    return;
  }
  try {
    await navigateToPage(batchState.tabId, batchState.originalUrl);
  } catch (error) {
    if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
      console.debug('Failed to restore original page:', error.message);
    }
  } finally {
    batchState.originalUrl = null;
  }
}

function navigateToPage(tabId, url) {
  markTabPending(tabId);
  return new Promise((resolve, reject) => {
    // Setup listeners BEFORE starting navigation to avoid race conditions
    // especially for fast hash/SPA updates.
    let timeoutId;

    function cleanup() {
      clearTimeout(timeoutId);
      chrome.webNavigation.onCompleted.removeListener(onCompleted);
      chrome.webNavigation.onReferenceFragmentUpdated.removeListener(onCompleted);
      chrome.webNavigation.onHistoryStateUpdated.removeListener(onCompleted);
      chrome.webNavigation.onErrorOccurred.removeListener(onError);
    }

    function onCompleted(details) {
      if (details.tabId === tabId && details.frameId === 0) {
        if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
          console.log(`Navigation complete (${details.transitionType || 'spa/hash'}):`, details.url);
        }
        cleanup();
        resolve();
      }
    }

    function onError(details) {
      if (details.tabId === tabId && details.frameId === 0) {
        cleanup();
        reject(new Error(details.error || 'Navigation error'));
      }
    }

    chrome.webNavigation.onCompleted.addListener(onCompleted);
    chrome.webNavigation.onReferenceFragmentUpdated.addListener(onCompleted);
    chrome.webNavigation.onHistoryStateUpdated.addListener(onCompleted);
    chrome.webNavigation.onErrorOccurred.addListener(onError);

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Navigation timeout.'));
    }, MESSAGE_TIMEOUT);

    chrome.tabs.update(tabId, { url }, () => {
      if (chrome.runtime.lastError) {
        cleanup(); // Clean up if update fails immediately
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      // Navigation started
    });
  });
}

async function processSinglePage(page) {
  if (batchState.cancelRequested) return;

  const currentStep = batchState.processed + batchState.failed + 1;
  batchState.currentTitle = page.title;
  broadcastBatchUpdate('processing', {
    message: `Processing ${currentStep}/${batchState.total}: ${page.title}`
  });

  if (page.isDevinButton && page.buttonText) {
    // Set pending state BEFORE clicking to prevent race condition with contentScriptReady
    markTabPending(batchState.tabId);

    // Add buttonIndex to the payload for disambiguation
    const clickRes = await sendMessageToTab(batchState.tabId, {
      action: 'clickDevinButton',
      buttonText: page.buttonText,
      buttonIndex: page.buttonIndex
    }, true);

    if (!clickRes || !clickRes.success) {
      // Revert the pending state on failure so we don't stall the queue forever
      markTabReady(batchState.tabId);
      throw new Error(clickRes?.error || `Failed to click Devin page button for: ${page.title}`);
    }
    await waitForTabReady(batchState.tabId);
  } else {
    await navigateToPage(batchState.tabId, page.url);
    await waitForTabReady(batchState.tabId);
  }

  if (batchState.cancelRequested) return;

  // Wait for dynamic content to render.
  const delay = PAGE_RENDER_BASE_DELAY + Math.random() * PAGE_RENDER_JITTER;
  await new Promise(resolve => setTimeout(resolve, delay));

  broadcastBatchUpdate('processing', {
    message: `Converting ${currentStep}/${batchState.total}: ${page.title}`
  });

  const convertResponse = await sendMessageToTab(batchState.tabId, { action: 'convertToMarkdown' });
  if (!convertResponse || !convertResponse.success) {
    throw new Error(convertResponse?.error || 'Conversion failed');
  }

  const fileName = getUniqueFileName(convertResponse.markdownTitle || page.title);
  const { markdown, assets } = prefixPageAssets(
    convertResponse.markdown,
    convertResponse.assets || [],
    fileName
  );
  batchState.convertedPages.push({
    title: fileName,
    content: markdown,
    assets
  });
  batchState.processed += 1;
  broadcastBatchUpdate('pageProcessed', {
    message: `Converted ${batchState.processed}/${batchState.total}: ${page.title}`
  });
}

async function buildZipBlob() {
  const zip = new JSZip();
  let indexContent = `# ${batchState.folderName}\n\n## Content Index\n\n`;

  batchState.convertedPages.forEach(page => {
    indexContent += `- [${page.title}](${page.title}.md)\n`;
    zip.file(`${page.title}.md`, page.content);
    (page.assets || []).forEach(asset => {
      zip.file(asset.relativePath, asset.base64, { base64: true });
    });
  });

  zip.file('README.md', indexContent);

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  return {
    blob,
    filename: `${batchState.folderName}.zip`
  };
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: objectUrl,
      filename,
      saveAs: true
    }, () => {
      if (chrome.runtime.lastError) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      resolve();
    });
  });
}

async function saveBatchToHistory(entry) {
  try {
    await batchHistory.save(entry);
    return '';
  } catch (error) {
    if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
      console.debug('Batch history save failed:', error.message);
    }
    if (error.code === 'TOO_LARGE') {
      return ' Archive too large to keep in history.';
    }
    return ' (not saved to history)';
  }
}

function inlineAssetsInMarkdown(markdown, assets) {
  if (!assets || !assets.length) return markdown;
  let result = markdown;
  for (const asset of assets) {
    const dataUrl = `data:${asset.mimeType};base64,${asset.base64}`;
    const escaped = asset.relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`, 'g'),
      `![](${dataUrl})`
    );
  }
  return result;
}

function prefixPageAssets(markdown, assets, pagePrefix) {
  if (!assets || !assets.length) return { markdown, assets: [] };
  const prefixedAssets = assets.map((asset, index) => {
    const baseName = asset.relativePath.replace(/^images\//, '');
    return {
      ...asset,
      relativePath: `images/${pagePrefix}-${baseName}`
    };
  });
  let updatedMarkdown = markdown;
  assets.forEach((asset, index) => {
    updatedMarkdown = updatedMarkdown.split(asset.relativePath).join(prefixedAssets[index].relativePath);
  });
  return { markdown: updatedMarkdown, assets: prefixedAssets };
}

async function createPageZip(markdown, assets, zipFileName, mdFileName) {
  const zip = new JSZip();
  zip.file(mdFileName, markdown);
  (assets || []).forEach(asset => {
    zip.file(asset.relativePath, asset.base64, { base64: true });
  });

  const base64Zip = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  const dataUrl = `data:application/zip;base64,${base64Zip}`;

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: zipFileName,
      saveAs: true
    }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function buildMergedMarkdown() {
  let combinedMarkdown = '';

  batchState.convertedPages.forEach((page, index) => {
    combinedMarkdown += `# ${page.title}\n\n`;
    combinedMarkdown += inlineAssetsInMarkdown(page.content, page.assets);
    if (index < batchState.convertedPages.length - 1) {
      combinedMarkdown += '\n\n---\n\n';
    }
  });

  return combinedMarkdown;
}

function markdownToDataUrl(markdown) {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(markdown);
  const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
  const base64Content = btoa(binaryString);
  return `data:text/markdown;charset=utf-8;base64,${base64Content}`;
}

function downloadMarkdown(markdown, filename) {
  const dataUrl = markdownToDataUrl(markdown);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: true
    }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function redownloadHistoryEntry(record) {
  if (!record) {
    throw new Error('Batch history entry not found.');
  }
  if (record.type === 'zip') {
    await downloadBlob(new Blob([record.payload]), record.filename);
    return;
  }
  if (record.type === 'single-md') {
    const decoder = new TextDecoder();
    await downloadMarkdown(decoder.decode(record.payload), record.filename);
    return;
  }
  throw new Error(`Unknown batch history type: ${record.type}`);
}

async function runBatchProcessing() {
  try {
    for (const page of batchState.pages) {
      if (batchState.cancelRequested) {
        break;
      }

      try {
        await processSinglePage(page);
      } catch (error) {
        batchState.failed += 1;
        broadcastBatchUpdate('pageFailed', {
          message: `Failed ${page.title}: ${error.message || error}`,
          level: 'error'
        });
      }
    }

    if (batchState.cancelRequested) {
      batchState.isRunning = false;
      broadcastBatchUpdate('cancelled', {
        message: `Batch cancelled. Success ${batchState.processed}, Failed ${batchState.failed}.`
      }, false);
      return;
    }

    if (!batchState.convertedPages.length) {
      throw new Error('No pages were converted successfully.');
    }

    broadcastBatchUpdate('zipping', {
      message: `Creating ZIP with ${batchState.convertedPages.length} files...`
    });

    const { blob, filename } = await buildZipBlob();
    const historyNote = await saveBatchToHistory({
      type: 'zip',
      filename,
      label: batchState.folderName,
      pageCount: batchState.convertedPages.length,
      processed: batchState.processed,
      failed: batchState.failed,
      payload: blob
    });
    await downloadBlob(blob, filename);

    batchState.isRunning = false;
    broadcastBatchUpdate('completed', {
      message: `ZIP ready. Success ${batchState.processed}, Failed ${batchState.failed}.${historyNote}`,
      level: 'success'
    }, false);
  } catch (error) {
    batchState.isRunning = false;
    broadcastBatchUpdate('error', {
      message: error.message || 'Batch conversion failed.',
      level: 'error'
    }, false);
  } finally {
    await restoreOriginalPage();
    resetBatchState();
  }
}

async function runBatchSingleFileProcessing(fileName) {
  try {
    // Process all pages using the same logic as batch ZIP processing
    for (const page of batchState.pages) {
      if (batchState.cancelRequested) {
        break;
      }

      try {
        await processSinglePage(page);
      } catch (error) {
        batchState.failed += 1;
        broadcastBatchUpdate('pageFailed', {
          message: `Failed ${page.title}: ${error.message || error}`,
          level: 'error'
        });
      }
    }

    if (batchState.cancelRequested) {
      batchState.isRunning = false;
      broadcastBatchUpdate('cancelled', {
        message: `Batch cancelled. Success ${batchState.processed}, Failed ${batchState.failed}.`
      }, false);
      return;
    }

    if (!batchState.convertedPages.length) {
      throw new Error('No pages were converted successfully.');
    }

    broadcastBatchUpdate('merging', {
      message: `Merging ${batchState.convertedPages.length} pages into single file...`
    });

    const markdown = buildMergedMarkdown();
    const encoder = new TextEncoder();
    const historyNote = await saveBatchToHistory({
      type: 'single-md',
      filename: fileName,
      label: batchState.folderName,
      pageCount: batchState.convertedPages.length,
      processed: batchState.processed,
      failed: batchState.failed,
      payload: encoder.encode(markdown).buffer
    });
    await downloadMarkdown(markdown, fileName);

    batchState.isRunning = false;
    broadcastBatchUpdate('completed', {
      message: `File ready. Success ${batchState.processed}, Failed ${batchState.failed}.${historyNote}`,
      level: 'success'
    }, false);
  } catch (error) {
    batchState.isRunning = false;
    broadcastBatchUpdate('error', {
      message: error.message || 'Single-file batch conversion failed.',
      level: 'error'
    }, false);
  } finally {
    await restoreOriginalPage();
    resetBatchState();
  }
}

function sanitizeFolderName(value) {
  return sanitizeName(value, 'deepwiki');
}

function getTabById(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

async function startBatchProcessing(tabId) {
  if (batchState.isRunning) {
    throw new Error('Batch conversion already running.');
  }

  const tab = await getTabById(tabId);
  if (!isValidDeepWikiUrl(tab.url)) {
    throw new Error('Please open a valid DeepWiki documentation page (e.g., https://deepwiki.com/org/project) before starting batch conversion.');
  }

  await ensureContentScript(tabId);
  const extraction = await sendMessageToTab(tabId, { action: 'extractAllPages' });
  if (!extraction || !extraction.success) {
    throw new Error(extraction?.error || 'Failed to extract sidebar links.');
  }

  const pages = extraction.pages || [];
  if (!pages.length) {
    throw new Error('No child pages were detected on this document.');
  }

  // Determine folder name based on domain and URL structure
  const urlObj = new URL(tab.url);
  const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);

  // Default extraction (DeepWiki default or Devin non-wiki)
  let org = sanitizeName(pathSegments[0] || 'org', 'org');
  let project = sanitizeName(pathSegments[1] || 'project', 'project');
  let fileNamePrefix = '';

  if (urlObj.hostname.includes('devin.ai')) {
    // Special case for Devin wiki URLs: /org/[org]/wiki/[user]/[project]
    const wikiIndex = pathSegments.indexOf('wiki');
    if (wikiIndex !== -1 && pathSegments[wikiIndex + 2]) {
      org = sanitizeName(pathSegments[1] || 'org', 'org'); // Org is usually first
      project = sanitizeName(pathSegments[wikiIndex + 2] || 'project', 'project');
    }
    fileNamePrefix = 'Devin-';
  }

  // Decide folder name
  let calculatedFolderName;
  if (urlObj.hostname.includes('devin.ai')) {
    calculatedFolderName = `${fileNamePrefix}${project}`; // Cleaner: just project name or Devin-Project
  } else {
    // Keep old behavior for DeepWiki Zip to avoid regression
    calculatedFolderName = sanitizeFolderName(extraction.headTitle || extraction.currentTitle || 'deepwiki');
  }

  batchState = {
    isRunning: true,
    tabId,
    originalUrl: tab.url,
    pages,
    convertedPages: [],
    folderName: calculatedFolderName,
    processed: 0,
    failed: 0,
    cancelRequested: false,
    total: pages.length,
    currentTitle: '',
    fileNames: new Set()
  };

  broadcastBatchUpdate('started', {
    message: `Found ${batchState.total} pages. Starting batch conversion...`
  });

  runBatchProcessing();

  return {
    total: batchState.total,
    folderName: batchState.folderName
  };
}

async function startBatchSingleFileProcessing(tabId) {
  if (batchState.isRunning) {
    throw new Error('Batch conversion already running.');
  }

  const tab = await getTabById(tabId);
  if (!isValidDeepWikiUrl(tab.url)) {
    throw new Error('Please open a valid DeepWiki documentation page (e.g., https://deepwiki.com/org/project) before starting batch conversion.');
  }

  await ensureContentScript(tabId);
  const extraction = await sendMessageToTab(tabId, { action: 'extractAllPages' });
  if (!extraction || !extraction.success) {
    throw new Error(extraction?.error || 'Failed to extract sidebar links.');
  }

  const pages = extraction.pages || [];
  if (!pages.length) {
    throw new Error('No child pages were detected on this document.');
  }

  // Extract org and project from URL and sanitize for safe filenames
  const urlObj = new URL(tab.url);
  const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);

  // Default extraction
  let org = sanitizeName(pathSegments[0] || 'org', 'org');
  let project = sanitizeName(pathSegments[1] || 'project', 'project');
  let fileNamePrefix = '';

  if (urlObj.hostname.includes('devin.ai')) {
    // Special case for Devin wiki URLs
    const wikiIndex = pathSegments.indexOf('wiki');
    if (wikiIndex !== -1 && pathSegments[wikiIndex + 2]) {
      org = sanitizeName(pathSegments[1] || 'org', 'org');
      project = sanitizeName(pathSegments[wikiIndex + 2] || 'project', 'project');
    }
    // User requested "Devin-" prefix for Devin downloads
    fileNamePrefix = 'Devin-';
  } else {
    // DeepWiki Logic
    // User requested to match "Download All Pages" (Zip) naming convention.
    // Zip uses: sanitizeFolderName(extraction.headTitle || extraction.currentTitle || 'deepwiki')
    // So we should do the same here.
    const titleBasedName = sanitizeName(extraction.headTitle || extraction.currentTitle || 'deepwiki');
    const lastIndexedDate = sanitizeName(extraction.lastIndexedDate || '', '');

    // Override the structured name generation for DeepWiki to match Zip behavior
    const fileName = lastIndexedDate
      ? `${titleBasedName}-${lastIndexedDate}.md`
      : `${titleBasedName}.md`;

    // Return early with this name for DeepWiki
    batchState = {
      isRunning: true,
      tabId,
      originalUrl: tab.url,
      pages,
      convertedPages: [],
      folderName: fileName.replace('.md', ''),
      processed: 0,
      failed: 0,
      cancelRequested: false,
      total: pages.length,
      currentTitle: '',
      fileNames: new Set()
    };

    broadcastBatchUpdate('started', {
      message: `Found ${batchState.total} pages. Starting single-file batch conversion...`
    });

    runBatchSingleFileProcessing(fileName);

    return {
      total: batchState.total,
      fileName: fileName
    };
  }

  const lastIndexedDate = sanitizeName(extraction.lastIndexedDate || '', '');

  // Generate sanitized filename
  // This block now only runs for Devin, as DeepWiki returns early above.
  const baseName = `${fileNamePrefix}${org}-${project}`;

  const fileName = lastIndexedDate
    ? `${baseName}-${lastIndexedDate}.md`
    : `${baseName}.md`;

  batchState = {
    isRunning: true,
    tabId,
    originalUrl: tab.url,
    pages,
    convertedPages: [],
    folderName: fileName.replace('.md', ''),
    processed: 0,
    failed: 0,
    cancelRequested: false,
    total: pages.length,
    currentTitle: '',
    fileNames: new Set()
  };

  broadcastBatchUpdate('started', {
    message: `Found ${batchState.total} pages. Starting single-file batch conversion...`
  });

  runBatchSingleFileProcessing(fileName);

  return {
    total: batchState.total,
    fileName: fileName
  };
}

// Listen for extension installation event
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepWiki to Markdown extension installed');

  // Auto-inject content script into existing matching tabs
  // This ensures the extension works immediately after install/update without requiring a page refresh
  chrome.tabs.query({ url: ['https://deepwiki.com/*', 'https://app.devin.ai/*'] }, (tabs) => {
    if (chrome.runtime.lastError) return;
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).catch(() => { /* Tab might not be injectable */ });
    }
  });
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log') {
    console.log('Message from page:', request.message);
    return;
  }

  if (request.action === 'contentScriptReady') {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ status: 'no-tab' });
      return;
    }

    markTabReady(tabId);
    if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
      console.log(`DeepWiki Background: Received contentScriptReady from tab ${tabId}. Flushing queue...`);
    }
    flushMessageQueue(tabId);
    sendResponse({ status: 'ready' });
    return;
  }

  if (request.action === 'startBatch') {
    const tabId = request.tabId;
    if (typeof tabId !== 'number') {
      sendResponse({ success: false, error: 'Missing tabId for batch start.' });
      return;
    }

    startBatchProcessing(tabId)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'startBatchSingleFile') {
    const tabId = request.tabId;
    if (typeof tabId !== 'number') {
      sendResponse({ success: false, error: 'Missing tabId for single-file batch start.' });
      return;
    }

    startBatchSingleFileProcessing(tabId)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'cancelBatch') {
    const cancelled = cancelBatchProcessing();
    sendResponse({ success: cancelled });
    return;
  }

  if (request.action === 'getBatchStatus') {
    sendResponse(getBatchStatusPayload());
    return;
  }

  if (request.action === 'ensureContentScript') {
    const tabId = request.tabId;
    if (typeof tabId !== 'number') {
      sendResponse({ success: false, error: 'Missing tabId.' });
      return;
    }
    ensureContentScript(tabId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'downloadPageZip') {
    const { markdown, assets, zipFileName, mdFileName } = request;
    if (!markdown || !zipFileName || !mdFileName) {
      sendResponse({ success: false, error: 'Missing markdown or filename for ZIP download.' });
      return;
    }
    createPageZip(markdown, assets || [], zipFileName, mdFileName)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getBatchHistory') {
    batchHistory.list()
      .then(entries => sendResponse({ success: true, entries }))
      .catch(error => sendResponse({ success: false, error: error.message, entries: [] }));
    return true;
  }

  if (request.action === 'redownloadBatchHistory') {
    const { id } = request;
    if (!id) {
      sendResponse({ success: false, error: 'Missing history entry id.' });
      return;
    }
    batchHistory.get(id)
      .then(record => redownloadHistoryEntry(record))
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'deleteBatchHistoryEntry') {
    const { id } = request;
    if (!id) {
      sendResponse({ success: false, error: 'Missing history entry id.' });
      return;
    }
    batchHistory.remove(id)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'clearBatchHistory') {
    batchHistory.clear()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'pageLoaded' || request.action === 'tabActivated') {
    sendResponse({ received: true });
    return;
  }

  return false;
});

// Listen for tab updates to reset readiness and notify content scripts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url || (!tab.url.includes('deepwiki.com') && !tab.url.includes('devin.ai'))) {
    return;
  }

  if (changeInfo.status === 'loading') {
    markTabPending(tabId);
  }

  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, { action: 'pageLoaded' }, () => {
      const error = chrome.runtime.lastError;
      if (error && !error.message.includes('Receiving end does not exist')) {
        console.log('Page loaded ping error:', error.message);
      } else if (!error) {
        // Ping succeeded, so content script is ready!
        markTabReady(tabId);
        flushMessageQueue(tabId);
      }
    });
  }
});

// Keep content script informed when a DeepWiki tab becomes active
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (tab && tab.url && (tab.url.includes('deepwiki.com') || tab.url.includes('devin.ai'))) {
      chrome.tabs.sendMessage(activeInfo.tabId, { action: 'tabActivated' }, () => {
        const error = chrome.runtime.lastError;
        if (error && !error.message.includes('Receiving end does not exist')) {
          console.log('Tab activated ping error:', error.message);
        } else if (!error) {
          // Ping succeeded, mark as ready
          markTabReady(activeInfo.tabId);
          flushMessageQueue(activeInfo.tabId);
        }
      });
    }
  });
});

// Clean up the queue when a tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  if (messageQueue[tabId]) {
    messageQueue[tabId].queue.forEach(item => item.reject(new Error('Tab closed.')));
    delete messageQueue[tabId];
  }

  if (batchState.isRunning && batchState.tabId === tabId) {
    batchState.isRunning = false;
    batchState.cancelRequested = true;
    broadcastBatchUpdate('error', {
      message: 'Batch cancelled because the tab was closed.',
      level: 'error'
    }, false);
    resetBatchState();
  }
});
