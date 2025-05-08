document.addEventListener('DOMContentLoaded', () => {
  const convertBtn = document.getElementById('convertBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const status = document.getElementById('status');
  let currentMarkdown = '';
  let currentTitle = '';

  // 转换按钮点击事件
  convertBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('deepwiki.com')) {
        showStatus('请在 DeepWiki 页面上使用此扩展', 'error');
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'convertToMarkdown' });
      
      if (response && response.success) {
        currentMarkdown = response.markdown;
        currentTitle = response.markdownTitle;
        showStatus('转换成功！', 'success');
        downloadBtn.disabled = false;
      } else {
        showStatus('转换失败：' + (response?.error || '未知错误'), 'error');
      }
    } catch (error) {
      showStatus('发生错误：' + error.message, 'error');
    }
  });

  // 下载按钮点击事件
  downloadBtn.addEventListener('click', () => {
    if (!currentMarkdown) {
      showStatus('请先转换内容', 'error');
      return;
    }

    const blob = new Blob([currentMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    // const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    chrome.downloads.download({
      url: url,
      filename: `${currentTitle}.md`,
      saveAs: true
    });
  });

  // 显示状态信息
  function showStatus(message, type) {
    status.textContent = message;
    status.className = type;
  }
}); 