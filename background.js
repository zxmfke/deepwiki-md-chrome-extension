// Listen for extension installation event
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepWiki to Markdown extension installed');
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log') {
    console.log('Message from page:', request.message);
  }
  return true;
});

// Listen for tab update complete event, for batch processing
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('deepwiki.com')) {
    // Notify content script that page has loaded
    // Use a callback to safely handle errors
    chrome.tabs.sendMessage(tabId, { action: 'pageLoaded' }, response => {
      // Check for any error that might have occurred during message sending
      if (chrome.runtime.lastError) {
        // Just log and ignore the error - likely due to back/forward cache
        console.log('Error sending message:', chrome.runtime.lastError.message);
      }
    });
  }
});

// Also listen for tab activation to reinitialize connection if needed
chrome.tabs.onActivated.addListener(activeInfo => {
  // When a tab becomes active, check if it's a DeepWiki tab
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (tab && tab.url && tab.url.includes('deepwiki.com')) {
      // Send a reconnect message that the content script can use to initialize
      chrome.tabs.sendMessage(activeInfo.tabId, { action: 'tabActivated' }, response => {
        // Ignore any errors - tab might not have content script
        if (chrome.runtime.lastError) {
          console.log('Tab activated but no listener:', chrome.runtime.lastError.message);
        }
      });
    }
  });
}); 