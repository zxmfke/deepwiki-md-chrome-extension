document.addEventListener('DOMContentLoaded', () => {
  const convertBtn = document.getElementById('convertBtn');
  const batchDownloadBtn = document.getElementById('batchDownloadBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const status = document.getElementById('status');
  let currentMarkdown = '';
  let currentTitle = '';
  let currentHeadTitle = '';
  let allPages = [];
  let baseUrl = '';
  let convertedPages = []; // Store all converted page content
  let isCancelled = false; // Flag to control cancellation

  // Convert button click event - now also downloads
  convertBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('deepwiki.com')) {
        showStatus('Please use this extension on a DeepWiki page', 'error');
        return;
      }

      showStatus('Converting page...', 'info');
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'convertToMarkdown' });
      
      if (response && response.success) {
        currentMarkdown = response.markdown;
        currentTitle = response.markdownTitle;
        currentHeadTitle = response.headTitle || '';
        
        // Create filename with head title and content title
        const fileName = currentHeadTitle 
          ? `${currentHeadTitle}-${currentTitle}.md` 
          : `${currentTitle}.md`;
        
        // Automatically download after successful conversion
        const blob = new Blob([currentMarkdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
          url: url,
          filename: fileName,
          saveAs: true
        });
        
        showStatus('Conversion successful! Downloading...', 'success');
      } else {
        showStatus('Conversion failed: ' + (response?.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      showStatus('An error occurred: ' + error.message, 'error');
    }
  });

  // Batch download button click event
  batchDownloadBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('deepwiki.com')) {
        showStatus('Please use this extension on a DeepWiki page', 'error');
        return;
      }

      // Reset cancellation flag and show cancel button
      isCancelled = false;
      showCancelButton(true);
      disableBatchButton(true);

      showStatus('Extracting all page links...', 'info');
      
      // Extract all links first
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractAllPages' });
      
      if (response && response.success) {
        allPages = response.pages;
        baseUrl = response.baseUrl;
        
        // Use head title for folder name if available
        const headTitle = response.headTitle || '';
        const folderName = headTitle || response.currentTitle.replace(/\s+/g, '-');
        
        // Clear previous conversion results
        convertedPages = [];
        
        showStatus(`Found ${allPages.length} pages, starting batch conversion`, 'info');
        
        // Process all pages - collect conversion results
        await processAllPages(tab.id, folderName);
        
        // Download all collected content at once if not cancelled
        if (!isCancelled && convertedPages.length > 0) {
          await downloadAllPagesAsZip(folderName);
        }
      } else {
        showStatus('Failed to extract page links: ' + (response?.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      showStatus('An error occurred: ' + error.message, 'error');
    } finally {
      // Hide cancel button and re-enable batch button
      showCancelButton(false);
      disableBatchButton(false);
    }
  });

  // Cancel button click event
  cancelBtn.addEventListener('click', () => {
    isCancelled = true;
    showStatus('Cancelling batch operation...', 'info');
    showCancelButton(false);
    disableBatchButton(false);
  });

  // Process all pages - collect conversion results but don't download immediately
  async function processAllPages(tabId, folderName) {
    let processedCount = 0;
    let errorCount = 0;
    
    // Save current page URL
    const currentPageUrl = allPages.find(page => page.selected)?.url || "";
    
    for (const page of allPages) {
      // Check if operation was cancelled
      if (isCancelled) {
        showStatus(`Operation cancelled. Processed: ${processedCount}, Failed: ${errorCount}`, 'info');
        // Return to original page
        if (currentPageUrl) {
          await chrome.tabs.update(tabId, { url: currentPageUrl });
        }
        return;
      }

      try {
        showStatus(`Processing ${processedCount + 1}/${allPages.length}: ${page.title}`, 'info');
        
        // Navigate to page
        await chrome.tabs.update(tabId, { url: page.url });

        // Wait for page to load using webNavigation API
        await new Promise((resolve, reject) => {
          const onCompleted = (details) => {
            if (details.tabId === tabId && details.url === page.url) {
              chrome.webNavigation.onCompleted.removeListener(onCompleted);
              resolve();
            }
          };
          chrome.webNavigation.onCompleted.addListener(onCompleted);

          // Set a timeout in case the page takes too long to load
          const timeoutId = setTimeout(() => {
            chrome.webNavigation.onCompleted.removeListener(onCompleted);
            reject(new Error('Page took too long to load.'));
          }, 10000); // 10 seconds timeout
        });

        // Check again if cancelled during wait
        if (isCancelled) {
          showStatus(`Operation cancelled. Processed: ${processedCount}, Failed: ${errorCount}`, 'info');
          if (currentPageUrl) {
            await chrome.tabs.update(tabId, { url: currentPageUrl });
          }
          return;
        }
        
        // Convert page content
        const convertResponse = await chrome.tabs.sendMessage(tabId, { action: 'convertToMarkdown' });
        
        if (convertResponse && convertResponse.success) {
          // Store converted content
          convertedPages.push({
            title: convertResponse.markdownTitle || page.title.replace(/\s+/g, '-'),
            content: convertResponse.markdown
          });
          
          processedCount++;
        } else {
          errorCount++;
          console.error(`Page processing failed: ${page.title}`, convertResponse?.error);
        }
      } catch (err) {
        errorCount++;
        console.error(`Error processing page: ${page.title}`, err);
      }
    }
    
    // Return to original page after processing
    if (currentPageUrl) {
      await chrome.tabs.update(tabId, { url: currentPageUrl });
    }
    
    if (!isCancelled) {
      showStatus(`Batch conversion complete! Success: ${processedCount}, Failed: ${errorCount}, Preparing download...`, 'success');
    }
  }
  
  // Package all pages into a ZIP file for download
  async function downloadAllPagesAsZip(folderName) {
    try {
      showStatus('Creating ZIP file...', 'info');
      
      // Create new JSZip instance
      const zip = new JSZip();
      
      // Create index file
      let indexContent = `# ${folderName}\n\n## Content Index\n\n`;
      convertedPages.forEach(page => {
        indexContent += `- [${page.title}](${page.title}.md)\n`;
      });
      
      // Add index file to zip
      zip.file('README.md', indexContent);
      
      // Add all Markdown files to zip
      convertedPages.forEach(page => {
        zip.file(`${page.title}.md`, page.content);
      });
      
      // Generate zip file
      showStatus('Compressing files...', 'info');
      const zipContent = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });
      
      // Download zip file
      const zipUrl = URL.createObjectURL(zipContent);
      chrome.downloads.download({
        url: zipUrl,
        filename: `${folderName}.zip`,
        saveAs: true
      }, () => {
        if (chrome.runtime.lastError) {
          showStatus('Error downloading ZIP file: ' + chrome.runtime.lastError.message, 'error');
        } else {
          showStatus(`ZIP file successfully generated! Contains ${convertedPages.length} Markdown files`, 'success');
        }
      });
      
    } catch (error) {
      showStatus('Error creating ZIP file: ' + error.message, 'error');
    }
  }

  // Show or hide cancel button
  function showCancelButton(show) {
    cancelBtn.style.display = show ? 'block' : 'none';
  }

  // Enable or disable batch button
  function disableBatchButton(disable) {
    batchDownloadBtn.disabled = disable;
  }

  // Display status information
  function showStatus(message, type) {
    status.textContent = message;
    status.className = type;
  }
}); 
