// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepWiki to Markdown 扩展已安装');
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log') {
    console.log('来自页面的消息:', request.message);
  }
  return true;
}); 