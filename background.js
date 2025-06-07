// A queue to hold messages for tabs that are not yet ready
const messageQueue = {};

// Function to safely send a message to a tab, queuing if necessary
function sendMessageToTab(tabId, message) {
  // Check if the content script is ready. We'll use a simple check for now.
  // A more robust way is for the content script to notify when it's ready.
  if (messageQueue[tabId] && messageQueue[tabId].isReady) {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        console.log(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError.message);
      }
    });
  } else {
    // If the tab is not ready, queue the message
    if (!messageQueue[tabId]) {
      messageQueue[tabId] = { isReady: false, queue: [] };
    }
    messageQueue[tabId].queue.push(message);
    console.log(`Message queued for tab ${tabId}:`, message.action);
  }
}

// Listen for extension installation event
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepWiki to Markdown extension installed');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log') {
    console.log('Message from page:', request.message);
  } else if (request.action === 'contentScriptReady') {
    // Content script is ready, process any queued messages for this tab
    const tabId = sender.tab.id;
    if (messageQueue[tabId]) {
      messageQueue[tabId].isReady = true;
      while (messageQueue[tabId].queue.length > 0) {
        const message = messageQueue[tabId].queue.shift();
        chrome.tabs.sendMessage(tabId, message, response => {
          if (chrome.runtime.lastError) {
            console.log(`Error sending queued message to tab ${tabId}:`, chrome.runtime.lastError.message);
          }
        });
      }
    } else {
      // If no queue exists, create one and mark as ready
      messageQueue[tabId] = { isReady: true, queue: [] };
    }
    console.log(`Content script ready on tab ${tabId}. Queue processed.`);
    sendResponse({ status: 'ready' });
  }
  return true;
});

// Listen for tab update complete event, for batch processing
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('deepwiki.com')) {
    // Initialize the message queue for this tab as not ready
    if (!messageQueue[tabId] || !messageQueue[tabId].isReady) {
        messageQueue[tabId] = { isReady: false, queue: [] };
    }
    // Notify content script that page has loaded, it should respond when ready
    chrome.tabs.sendMessage(tabId, { action: 'pageLoaded' }, response => {
      if (chrome.runtime.lastError) {
        console.log('Error pinging tab, will wait for ready signal:', chrome.runtime.lastError.message);
      }
    });
  }
});

// Also listen for tab activation to reinitialize connection if needed
chrome.tabs.onActivated.addListener(activeInfo => {
  // When a tab becomes active, check if it's a DeepWiki tab
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (tab && tab.url && tab.url.includes('deepwiki.com')) {
      // Ensure queue is initialized
      if (!messageQueue[tab.id]) {
        messageQueue[tab.id] = { isReady: false, queue: [] };
      }
      // Send a reconnect message that the content script can use to initialize
      chrome.tabs.sendMessage(activeInfo.tabId, { action: 'tabActivated' }, response => {
        if (chrome.runtime.lastError) {
          console.log('Tab activated but no listener:', chrome.runtime.lastError.message);
        }
      });
    }
  });
});

// Clean up the queue when a tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  if (messageQueue[tabId]) {
    delete messageQueue[tabId];
    console.log(`Cleaned up message queue for closed tab ${tabId}.`);
  }
}); 