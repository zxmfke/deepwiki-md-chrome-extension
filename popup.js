// Utility functions are now loaded from utils.js

// Helper: Send a message to a tab's content script with auto-retry.
// If the content script is not loaded (e.g., extension reloaded without page refresh),
// re-inject it and retry the message.
async function sendMessageWithRetry(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (error.message && (
      error.message.includes('Receiving end does not exist') ||
      error.message.includes('Could not establish connection')
    )) {
      // Delegate injection to background script which has robust
      // readiness handling (contentScriptReady listener + messageQueue)
      const result = await chrome.runtime.sendMessage({
        action: 'ensureContentScript', tabId
      });
      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to inject content script. Please refresh the page.');
      }
      // Retry after background confirms content script is ready
      return await chrome.tabs.sendMessage(tabId, message);
    }
    throw error;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const convertBtn = document.getElementById('convertBtn');
  const batchDownloadBtn = document.getElementById('batchDownloadBtn');
  const batchSingleFileBtn = document.getElementById('batchSingleFileBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const status = document.getElementById('status');
  const batchHistorySection = document.getElementById('batchHistorySection');
  const batchHistoryToggle = document.getElementById('batchHistoryToggle');
  const batchHistoryPanel = document.getElementById('batchHistoryPanel');
  const batchHistoryList = document.getElementById('batchHistoryList');
  const batchHistoryClearBtn = document.getElementById('batchHistoryClearBtn');
  let batchRunning = false;

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'batchUpdate') {
      applyBatchStatus(request);
      if (request.type === 'completed') {
        loadBatchHistory();
      }
    }
  });

  initializeBatchStatus();
  loadBatchHistory();

  batchHistoryToggle.addEventListener('click', () => {
    const collapsed = batchHistoryPanel.classList.toggle('collapsed');
    batchHistoryToggle.setAttribute('aria-expanded', String(!collapsed));
    document.getElementById('batchHistoryToggleIcon').textContent = collapsed ? '▶' : '▼';
  });

  batchHistoryClearBtn.addEventListener('click', async () => {
    if (!confirm('Remove all saved batch downloads from history?')) {
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearBatchHistory' });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to clear history.');
      }
      await loadBatchHistory();
      showStatus('Batch history cleared.', 'info');
    } catch (error) {
      showStatus('Unable to clear history: ' + error.message, 'error');
    }
  });

  convertBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!isValidDeepWikiUrl(tab.url)) {
        showStatus('Please use this extension on a valid DeepWiki or Devin page (e.g., https://deepwiki.com/org/project)', 'error');
        return;
      }

      showStatus('Converting page...', 'info');
      const response = await sendMessageWithRetry(tab.id, { action: 'convertToMarkdown' });

      if (response && response.success) {
        const headTitle = sanitizeName(response.headTitle || '', '');
        const currentTitle = sanitizeName(response.markdownTitle, 'page');
        const fileName = headTitle
          ? `${headTitle}-${currentTitle}.md`
          : `${currentTitle}.md`;

        if (response.assets && response.assets.length > 0) {
          const zipFileName = fileName.replace(/\.md$/i, '.zip');
          const zipResponse = await chrome.runtime.sendMessage({
            action: 'downloadPageZip',
            markdown: response.markdown,
            assets: response.assets,
            zipFileName,
            mdFileName: fileName
          });
          if (!zipResponse || !zipResponse.success) {
            throw new Error(zipResponse?.error || 'Failed to create ZIP download.');
          }
          showStatus('Conversion successful! Downloading ZIP with diagrams...', 'success');
        } else {
          const blob = new Blob([response.markdown], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);

          chrome.downloads.download({
            url,
            filename: fileName,
            saveAs: true
          });

          showStatus('Conversion successful! Downloading...', 'success');
        }
      } else {
        showStatus('Conversion failed: ' + (response?.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      showStatus('An error occurred: ' + error.message, 'error');
    }
  });

  batchDownloadBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!isValidDeepWikiUrl(tab.url)) {
        showStatus('Please use this extension on a valid DeepWiki or Devin page (e.g., https://deepwiki.com/org/project)', 'error');
        return;
      }

      showCancelButton(true);
      disableBatchButton(true);
      showStatus('Starting batch conversion...', 'info');

      const response = await chrome.runtime.sendMessage({ action: 'startBatch', tabId: tab.id });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to start batch conversion.');
      }
    } catch (error) {
      showStatus('An error occurred: ' + error.message, 'error');
      showCancelButton(false);
      disableBatchButton(false);
    }
  });

  batchSingleFileBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!isValidDeepWikiUrl(tab.url)) {
        showStatus('Please use this extension on a valid DeepWiki or Devin page (e.g., https://deepwiki.com/org/project)', 'error');
        return;
      }

      showCancelButton(true);
      disableBatchButton(true);
      showStatus('Starting single-file batch conversion...', 'info');

      const response = await chrome.runtime.sendMessage({ action: 'startBatchSingleFile', tabId: tab.id });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to start single-file batch conversion.');
      }
    } catch (error) {
      showStatus('An error occurred: ' + error.message, 'error');
      showCancelButton(false);
      disableBatchButton(false);
    }
  });

  cancelBtn.addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'cancelBatch' });
      if (response && response.success) {
        showStatus('Cancelling batch operation...', 'info');
      } else {
        showStatus('No active batch operation to cancel.', 'info');
      }
    } catch (error) {
      showStatus('Unable to cancel batch: ' + error.message, 'error');
    }
  });

  async function initializeBatchStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getBatchStatus' });
      applyBatchStatus(response);
    } catch (error) {
      if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
        console.debug('Unable to fetch batch status:', error.message);
      }
    }
  }

  function applyBatchStatus(statusPayload) {
    if (!statusPayload) {
      return;
    }

    batchRunning = !!statusPayload.running;

    if (statusPayload.running) {
      showCancelButton(true);
      disableBatchButton(true);
    } else {
      showCancelButton(false);
      disableBatchButton(false);
    }

    setBatchHistoryActionsDisabled(batchRunning);

    if (statusPayload.message) {
      showStatus(statusPayload.message, statusPayload.level || 'info');
    }
  }

  function showCancelButton(show) {
    cancelBtn.style.display = show ? 'block' : 'none';
  }

  function disableBatchButton(disable) {
    batchDownloadBtn.disabled = disable;
    batchSingleFileBtn.disabled = disable;
  }

  function showStatus(message, type) {
    status.textContent = message;
    status.className = type;
  }

  async function loadBatchHistory() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getBatchHistory' });
      const entries = (response && response.success && response.entries) ? response.entries : [];
      renderBatchHistory(entries);
    } catch (error) {
      if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
        console.debug('Unable to load batch history:', error.message);
      }
      renderBatchHistory([]);
    }
  }

  function renderBatchHistory(entries) {
    batchHistoryList.innerHTML = '';

    if (!entries.length) {
      batchHistorySection.hidden = true;
      return;
    }

    batchHistorySection.hidden = false;

    entries.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'batch-history-item';

      const meta = document.createElement('div');
      meta.className = 'batch-history-meta';

      const label = document.createElement('div');
      label.className = 'batch-history-label';
      label.textContent = entry.label || entry.filename;
      label.title = entry.filename;

      const details = document.createElement('div');
      details.className = 'batch-history-details';
      const typeLabel = entry.type === 'single-md' ? 'MD' : 'ZIP';
      const failedPart = entry.failed > 0 ? ` · ${entry.failed} failed` : '';
      details.textContent = `${formatRelativeTime(entry.completedAt)} · ${typeLabel} · ${entry.pageCount} pages${failedPart} · ${formatBytes(entry.sizeBytes)}`;

      meta.appendChild(label);
      meta.appendChild(details);

      const actions = document.createElement('div');
      actions.className = 'batch-history-actions';

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'batch-history-download';
      downloadBtn.textContent = 'Download';
      downloadBtn.addEventListener('click', () => redownloadBatchEntry(entry.id, downloadBtn));

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'batch-history-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove from history';
      removeBtn.addEventListener('click', () => deleteBatchEntry(entry.id));

      actions.appendChild(downloadBtn);
      actions.appendChild(removeBtn);

      li.appendChild(meta);
      li.appendChild(actions);
      batchHistoryList.appendChild(li);
    });

    setBatchHistoryActionsDisabled(batchRunning);
  }

  function setBatchHistoryActionsDisabled(disabled) {
    batchHistoryList.querySelectorAll('button').forEach(btn => {
      btn.disabled = disabled;
    });
    batchHistoryClearBtn.disabled = disabled;
  }

  async function redownloadBatchEntry(id, button) {
    try {
      button.disabled = true;
      showStatus('Starting download...', 'info');
      const response = await chrome.runtime.sendMessage({ action: 'redownloadBatchHistory', id });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Download failed.');
      }
      showStatus('Download started. Choose where to save the file.', 'success');
    } catch (error) {
      showStatus('Download failed: ' + error.message, 'error');
    } finally {
      if (!batchRunning) {
        button.disabled = false;
      }
    }
  }

  async function deleteBatchEntry(id) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'deleteBatchHistoryEntry', id });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to remove entry.');
      }
      await loadBatchHistory();
    } catch (error) {
      showStatus('Unable to remove entry: ' + error.message, 'error');
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 1024) {
      return `${bytes || 0} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }
});
