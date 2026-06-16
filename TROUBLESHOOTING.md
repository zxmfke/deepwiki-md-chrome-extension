# 故障排除 / Troubleshooting

## 常見問題

### ❌ 問題 1: "Please use this extension on a valid DeepWiki documentation page"

**症狀：**
點選擴充功能圖示後顯示錯誤訊息，提示需要在有效的 DeepWiki 頁面使用。

**原因：**
- URL 驗證失敗
- 擴充功能未正確載入最新版本

**解決方法：**

#### 方案 A：重新載入擴充功能（推薦）

1. 開啟 `chrome://extensions/`
2. 找到 "DeepWiki to Markdown" 擴充功能
3. 點選重新整理圖示 🔄
4. 重新整理目前頁面 (F5)
5. 再次點選擴充功能圖示

#### 方案 B：檢查 URL

確保你在以下頁面之一：
- ✅ `https://deepwiki.com/org/project`（真實 DeepWiki 頁面）
- ✅ `file://.../test-page.html`（本機測試頁面）
- ✅ `http://localhost/.../test/`（本機測試）

不支援的 URL：
- ❌ `https://deepwiki.com/`（沒有 /org/project 路徑）
- ❌ `https://evil-deepwiki.com/`（惡意網域）
- ❌ `https://example.com/`（非 DeepWiki 網域）

---

### ❌ 問題 2: 下載的 Markdown 檔案為空或不完整

**症狀：**
檔案已下載，但內容缺失或不完整。

**原因：**
- 頁面未完全載入
- SVG 圖表渲染未完成

**解決方法：**

1. 等待頁面完全載入（查看載入進度條）
2. 捲動到頁面底部，確保所有內容已渲染
3. 再次點選擴充功能圖示

---

### ❌ 問題 3: Mermaid 圖表轉換失敗

**症狀：**
Markdown 中沒有 Mermaid 程式碼區塊，或圖表顯示為空。

**原因：**
- SVG 圖表格式不支援
- 轉換邏輯出錯

**解決方法：**

1. **啟用除錯模式**
   - 開啟 `content.js`
   - 將第 2 行改為 `const DEBUG_MODE = true;`
   - 重新載入擴充功能

2. **查看控制台日誌**
   - 按 F12 開啟開發人員工具
   - 切換到 Console 標籤
   - 查看錯誤訊息

3. **檢查 SVG 類型**
   - 流程圖：`<svg class="flowchart">`
   - 類別圖：`<svg class="classDiagram">`
   - 時序圖：`<svg aria-roledescription="sequence">`
   - 狀態圖：檢查是否包含狀態節點

4. **回報問題**
   - 儲存控制台日誌
   - 複製 SVG 原始碼
   - 在 GitHub Issues 回報

---

### ❌ 問題 4: 擴充功能圖示不顯示或無法點選

**症狀：**
瀏覽器工具列中看不到擴充功能圖示。

**解決方法：**

1. **檢查擴充功能是否已安裝**
   - 開啟 `chrome://extensions/`
   - 查找 "DeepWiki to Markdown"
   - 確保開關是開啟狀態 ✅

2. **固定擴充功能圖示**
   - 點選工具列的拼圖圖示 🧩
   - 找到 "DeepWiki to Markdown"
   - 點選圖釘 📌 固定到工具列

3. **重新啟動瀏覽器**
   - 完全關閉 Chrome
   - 重新開啟

---

### ❌ 問題 5: 測試頁面 (test-page.html) 顯示 "Could not establish connection"

**症狀：**
開啟 test-page.html 後，點選擴充功能圖示顯示錯誤：
```
An error occurred: Could not establish connection. Receiving end does not exist.
```

**原因：**
- Chrome 預設不允許擴充功能存取本機檔案（`file://` 協定）
- 即使 manifest.json 已設定，仍需使用者手動授權

**解決方法：**

**⚠️ 重要：必須啟用檔案存取權限！**

1. 開啟 `chrome://extensions/`
2. 找到 "DeepWiki to Markdown" 擴充功能
3. 點選 **"詳細資料"** 按鈕
4. 向下捲動，找到 **"允許存取檔案網址"** 選項
5. **開啟**這個選項 ✅
6. 回到擴充功能清單，點選 🔄（重新整理擴充功能）
7. **關閉所有** test-page.html 分頁
8. 重新開啟 test-page.html
9. 現在應該可以正常使用了

**為什麼需要這樣做？**
- Chrome 的安全機制要求使用者明確授權擴充功能存取本機檔案
- 這是為了防止惡意擴充功能讀取您電腦上的檔案

**安全機制說明：**
- 即使啟用了檔案存取權限，擴充功能也只會在以下情況執行：
  1. 測試頁面（`test-page.html` 或 `test/` 目錄）
  2. `DEBUG_MODE = true` 時的任何本機檔案
- 這樣可以防止擴充功能意外在其他本機檔案上執行

**截圖參考：**
```
chrome://extensions/
  → DeepWiki to Markdown
    → 詳細資料
      → 允許存取檔案網址 [開啟]
```

---

### ❌ 問題 6: 批次下載卡住或失敗

**症狀：**
點選 "Download All Pages" 後，進度條停止或顯示錯誤。

**原因：**
- 網路連線問題
- 頁面太多
- 某個頁面載入失敗

**解決方法：**

1. **檢查網路連線**
   - 確保能正常存取 DeepWiki

2. **使用取消按鈕**
   - 點選 "Cancel Batch Operation"
   - 等待操作停止

3. **查看失敗頁面**
   - 查看控制台日誌
   - 記錄失敗的頁面 URL

4. **分批下載**
   - 不要一次下載太多頁面
   - 先下載部分重要頁面

---

### ❌ 問題 7: 下載的檔案名稱包含特殊字元

**症狀：**
下載的檔案名稱顯示為 `org-project-?.md` 或包含亂碼。

**原因：**
- URL 或標題包含不支援的字元
- 作業系統檔案名稱限制

**解決方法：**

這是正常的保護措施。擴充功能會自動：
- 將不支援的字元替換為 `-`
- 移除開頭和結尾的 `-`
- 如果檔案名稱為空，使用預設名稱

如果需要特定檔案名稱，下載後手動重新命名即可。

---

## 除錯步驟

### 步驟 1: 檢查擴充功能狀態

```bash
1. 開啟 chrome://extensions/
2. 確認擴充功能已啟用
3. 檢查版本號（應為 0.1.0 或更高）
4. 點選 "詳細資料" 查看權限
```

### 步驟 2: 檢查頁面內容

```javascript
// 在 Console 中執行
console.log('Current URL:', window.location.href);
console.log('SVGs found:', document.querySelectorAll('svg').length);
console.log('Flowcharts:', document.querySelectorAll('svg.flowchart').length);
console.log('Class diagrams:', document.querySelectorAll('svg.classDiagram').length);
console.log('Sequence diagrams:', document.querySelectorAll('svg[aria-roledescription="sequence"]').length);
```

### 步驟 3: 手動測試轉換

```javascript
// 複製 test/quick-test.js 的內容到控制台
// 然後執行
mermaidTest.runAll();
```

### 步驟 4: 查看網路請求

```bash
1. 按 F12 開啟開發人員工具
2. 切換到 Network 標籤
3. 點選擴充功能圖示
4. 查看是否有失敗的請求
```

---

## 取得協助

如果以上方法都無法解決問題：

### 1. 收集資訊

- 瀏覽器版本：`chrome://version/`
- 擴充功能版本：`chrome://extensions/`
- 錯誤訊息：控制台截圖
- 重現步驟：詳細描述

### 2. 提交 Issue

造訪：https://github.com/philipz/deepwiki-md-chrome-extension/issues

包含以下資訊：
- **問題描述**：簡短說明
- **重現步驟**：1, 2, 3...
- **期望行為**：應該發生什麼
- **實際行為**：實際發生了什麼
- **環境資訊**：
  - 作業系統
  - Chrome 版本
  - 擴充功能版本
- **日誌/截圖**：控制台輸出或截圖
- **SVG 範例**：如果是轉換問題，提供 SVG 程式碼

### 3. 社群討論

- GitHub Discussions
- 相關技術論壇

---

## 常見問題快速索引

| 問題 | 解決方案 |
|------|---------|
| URL 驗證失敗 | [問題 1](#-問題-1-please-use-this-extension-on-a-valid-deepwiki-documentation-page) |
| 內容為空 | [問題 2](#-問題-2-下載的-markdown-檔案為空或不完整) |
| 圖表轉換失敗 | [問題 3](#-問題-3-mermaid-圖表轉換失敗) |
| 圖示不顯示 | [問題 4](#-問題-4-擴充功能圖示不顯示或無法點選) |
| 測試頁面連線錯誤 | [問題 5](#-問題-5-測試頁面-test-pagehtml-顯示-could-not-establish-connection) |
| 批次下載問題 | [問題 6](#-問題-6-批次下載卡住或失敗) |
| 檔案名稱問題 | [問題 7](#-問題-7-下載的檔案名稱包含特殊字元) |

---

## 預防措施

### 使用前

1. ✅ 確保 Chrome 版本 > 88
2. ✅ 擴充功能已完全載入
3. ✅ 頁面已完全渲染
4. ✅ 網路連線正常

### 使用時

1. ✅ 一次只下載一個頁面（除非批次）
2. ✅ 等待轉換完成再關閉分頁
3. ✅ 定期清理下載資料夾
4. ✅ 保持擴充功能更新

### 測試時

1. ✅ 使用最新版本擴充功能
2. ✅ 啟用 DEBUG_MODE 查看詳細日誌
3. ✅ 在真實 DeepWiki 頁面測試
4. ✅ 對比測試案例的期望輸出

---

最後更新：2024-01-20
