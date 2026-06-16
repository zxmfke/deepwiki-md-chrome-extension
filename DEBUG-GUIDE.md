# 除錯指南 / Debug Guide

## 啟用除錯模式

### 快速啟用

修改 `content.js` 第 2 行：

```javascript
// 改為 true 啟用除錯
const DEBUG_MODE = true;
```

**重要說明：**
- `DEBUG_MODE = true` 會啟用詳細日誌輸出
- 同時也會允許擴充功能在**任何本機檔案**（`file://`）上執行
- 在生產環境中務必設為 `false` 以確保安全性
- 測試頁面（`test-page.html` 或 `test/` 目錄下的檔案）在任何模式下都可使用

### 重新載入擴充功能

1. 開啟 `chrome://extensions/`
2. 找到 "DeepWiki to Markdown"
3. 點選重新整理圖示 🔄

## 查看除錯日誌

### 開啟控制台

1. 造訪 DeepWiki 頁面或測試頁面
2. 按 `F12` 開啟開發人員工具
3. 切換到 `Console` 標籤
4. 點選擴充功能圖示進行轉換

### 日誌類型

#### 流程圖 (Flowchart)

```
Found edge label: "emit event" at (150.5, 200.3)
Total edge labels found: 5
Matched label "emit event" to edge A -> B (distance: 45.23px)
Closest label "text" too far (215.67px) from edge C -> D
Could not determine source/target for edge: FL_A_B_1
Could not get screen CTM for SVG
```

#### 時序圖 (Sequence Diagram)

```
Looking for sequence participants...
Found participant: User at x: 100
Total participants found: 5
Found message texts: 10
Found message lines: 10
Message 1: Alice -> Bob: Hello
Found loop: Loop[Check status] from y 200 to 300
Sequence diagram conversion completed. Participants: 5 Messages: 10
```

#### 狀態圖 (State Diagram)

```
Converting state diagram...
Found State: Idle {x: 100, y: 200}
Found Start State {x: 50, y: 50}
Found End State {x: 300, y: 400}
State diagram conversion completed. Transitions: 8
```

## 除錯技巧

### 1. 過濾日誌

在 Console 中使用過濾器：
- 輸入 `Found` - 只看識別到的元素
- 輸入 `error` - 只看錯誤
- 輸入 `Matched` - 只看配對成功的

### 2. 查看特定元素

```javascript
// 在 Console 中手動檢查元素
const svg = document.querySelector('svg.flowchart');
console.log(svg);

// 查看所有邊緣標籤
const labels = svg.querySelectorAll('.edgeLabel');
console.log('Edge labels:', labels.length);
labels.forEach(l => console.log(l.textContent));
```

### 3. 測試轉換函數

如果定義了全域測試函數：

```javascript
// 使用 quick-test.js 中的測試函數
mermaidTest.testFlowChart();
mermaidTest.testClassDiagram();
mermaidTest.testSequenceDiagram();
```

### 4. 儲存日誌

- 右鍵 Console → `Save as...`
- 儲存為 `.log` 檔案
- 用於問題回報或分析

### 5. 複製元素

```javascript
// 複製 SVG 到剪貼簿
const svg = document.querySelector('svg.flowchart');
copy(svg.outerHTML);
```

## 常見問題診斷

### 問題 1: 標籤無法配對

**症狀：**
```
Closest label "text" too far (215.67px) from edge A -> B
```

**原因：** 標籤距離邊緣中點超過 200px 閾值

**解決：**
- 檢查 SVG 座標轉換是否正確
- 確認 `getScreenCTM()` 可用
- 調整距離閾值（content.js:381）

### 問題 2: 節點識別失敗

**症狀：**
```
Could not determine source/target for edge: FL_A_B_1
```

**原因：** 無法從 path ID 解析出來源節點和目標節點

**解決：**
- 檢查節點 ID 命名規則
- 查看 `nodes` 物件是否包含該節點
- 驗證 path ID 格式

### 問題 3: CTM 不可用

**症狀：**
```
Could not get screen CTM for SVG
```

**原因：** SVG 元素的 `getScreenCTM()` 回傳 null

**解決：**
- 確認 SVG 已完全載入
- 檢查 SVG 是否在 DOM 中
- 等待頁面渲染完成後再轉換

### 問題 4: 文字擷取失敗

**症狀：** 轉換後的 Mermaid 程式碼缺少標籤文字

**原因：** 文字巢狀在 `foreignObject` 或 `tspan` 中

**解決：**
- 啟用除錯查看文字擷取過程
- 檢查是否正確處理了所有文字容器
- 驗證選擇器是否符合 SVG 結構

## 效能考量

### 除錯模式影響

- **日誌輸出**：增加 ~5-10ms 處理時間
- **控制台渲染**：大量日誌可能影響瀏覽器效能
- **記憶體佔用**：日誌物件會佔用額外記憶體

### 生產環境

完成除錯後，**務必**將 DEBUG_MODE 改回 `false`：

```javascript
const DEBUG_MODE = false;
```

然後重新載入擴充功能。

## 問題回報

如果發現 bug，請在回報中包含：

1. ✅ 除錯日誌（完整的 Console 輸出）
2. ✅ 問題截圖
3. ✅ 輸入的 SVG 程式碼
4. ✅ 期望的輸出
5. ✅ 實際的輸出
6. ✅ 瀏覽器版本
7. ✅ 擴充功能版本

可以在 GitHub Issues 中提交：
https://github.com/philipz/deepwiki-md-chrome-extension/issues

## 進階除錯

### 中斷點除錯

1. 開啟 `chrome://extensions/`
2. 開啟「開發人員模式」
3. 找到擴充功能，點選「檢查檢視畫面: background.html」
4. 在 Sources 中找到 `content.js`
5. 設定中斷點

### 效能分析

```javascript
// 在 Console 中測量轉換時間
console.time('conversion');
// ... 進行轉換 ...
console.timeEnd('conversion');
```

### 記憶體分析

1. 開啟 Performance Monitor (Shift+Cmd+P → "Performance Monitor")
2. 觀察 JS heap size
3. 進行多次轉換
4. 檢查是否有記憶體洩漏

## 相關檔案

- `content.js` - 主要轉換邏輯
- `test/test-page.html` - 測試頁面
- `test/quick-test.js` - 控制台測試腳本
- `test/README.md` - 測試指南
