# 測試指南 / Testing Guide

本目錄包含 Mermaid 圖表轉換功能的測試案例。

## 快速開始

**⚠️ 重要：首次使用必須設定**

使用 test-page.html 前，必須啟用檔案存取權限：

1. **啟用檔案存取**：
   - 開啟 `chrome://extensions/`
   - 找到 "DeepWiki to Markdown" 擴充功能
   - 點選 **"詳細資料"** 按鈕
   - 向下捲動到 **"允許存取檔案網址"**
   - **啟用**此選項 ✅

2. **重新載入擴充功能**：回到 `chrome://extensions/` → 點選 🔄

3. **開啟測試頁面**：`test-page.html`

4. **點選擴充功能圖示** → "Download Current Page"

5. **對比**輸出結果與測試檔案中的期望結果

**為什麼？** Chrome 的安全機制要求使用者明確授權擴充功能存取本機檔案（`file://` 協定）。否則會看到錯誤：`Could not establish connection`

## 測試檔案

- `test_class_diagram.md` - 帶註解的類別圖
- `test_flow_chart.md` - 帶子圖的流程圖
- `test_sequence_diagram.md` - 帶自呼叫的時序圖
- `test-page.html` - 互動式測試頁面
- `quick-test.js` - 控制台測試腳本

## 測試方法

### 方法 1：使用測試 HTML 頁面（推薦）

1. 在 Chrome 中開啟 `test-page.html`
2. 載入擴充功能
3. 點選擴充功能圖示
4. 對比實際輸出與期望輸出

### 方法 2：真實 DeepWiki 頁面

1. 造訪包含圖表的 DeepWiki 頁面
2. 點選擴充功能圖示 → "Download Current Page"
3. 開啟下載的 .md 檔案
4. 驗證 Mermaid 程式碼區塊

### 方法 3：瀏覽器控制台

1. 開啟包含測試 SVG 的頁面
2. 按 F12（開發人員工具）
3. 複製 `quick-test.js` 內容到控制台
4. 執行：`mermaidTest.runAll()`

## 測試案例說明

### test_class_diagram.md
- **測試場景**：類別圖中的 `note for` 註解
- **驗證重點**：
  - 類別的屬性和方法是否正確擷取
  - 繼承關係是否正確
  - 註解是否正確關聯

### test_flow_chart.md
- **測試場景**：帶 `subgraph` 的流程圖
- **驗證重點**：
  - 節點之間的連接是否正確
  - 子圖分組是否保留
  - 節點標籤是否完整

### test_sequence_diagram.md
- **測試場景**：時序圖的註解和自呼叫
- **驗證重點**：
  - 參與者識別
  - 訊息順序
  - 自呼叫箭頭
  - 註解位置

## 驗證標準

✅ **通過標準**：
- 所有關鍵元素都被轉換
- 圖表結構保持一致
- 在 Mermaid 渲染器中能正確顯示

⚠️ **可接受的差異**：
- 空格和換行的細微差異
- 屬性順序不同但內容相同
- 樣式細節（如顏色、字型等）

❌ **失敗標準**：
- 缺少關鍵節點或連接
- 關係方向錯誤
- 重要標籤遺失

## 除錯技巧

1. **啟用除錯模式**
   - 在 `content.js` 中將 `DEBUG_MODE` 設定為 `true`
   - 查看瀏覽器控制台的詳細日誌

2. **分步檢查**
   - 先驗證節點識別
   - 再驗證關係識別
   - 最後驗證標籤配對

3. **使用 Mermaid Live Editor**
   - 造訪 https://mermaid.live/
   - 貼上轉換結果
   - 查看渲染效果
   - 對比原始圖表

## 自動化測試（未來計畫）

可以考慮新增：
- Jest 單元測試
- Playwright 端對端測試
- GitHub Actions CI/CD

## 問題回報

如果發現測試失敗：
1. 記錄測試案例名稱
2. 儲存實際輸出
3. 截圖對比
4. 在 GitHub Issues 中回報
