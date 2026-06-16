/**
 * Mermaid 轉換快速測試腳本
 *
 * 在瀏覽器控制台中執行此腳本來快速測試轉換功能
 *
 * 使用方法：
 * 1. 開啟包含 SVG 圖表的頁面
 * 2. 開啟瀏覽器開發人員工具 (F12)
 * 3. 複製此腳本到控制台並執行
 * 4. 查看輸出結果
 */

(function() {
  'use strict';

  console.log('%c🧪 開始 Mermaid 轉換測試', 'color: #007bff; font-size: 16px; font-weight: bold;');
  console.log('================================================');

  // 測試案例 1：類別圖
  function testClassDiagram() {
    console.log('%c\n📊 測試 1：類別圖', 'color: #28a745; font-weight: bold;');

    const svg = document.querySelector('svg.classDiagram');
    if (!svg) {
      console.warn('⚠️ 此頁面找不到類別圖 SVG');
      return null;
    }

    console.log('✓ 找到類別圖 SVG');

    // 這裡需要呼叫實際的轉換函數
    // 因為 content.js 已注入，可以直接呼叫
    if (typeof convertClassDiagram === 'function') {
      const result = convertClassDiagram(svg);
      console.log('轉換結果：');
      console.log(result);
      return result;
    } else {
      console.error('❌ 找不到 convertClassDiagram 函數。請確保擴充功能已載入。');
      return null;
    }
  }

  // 測試案例 2：流程圖
  function testFlowChart() {
    console.log('%c\n🔄 測試 2：流程圖', 'color: #28a745; font-weight: bold;');

    const svg = document.querySelector('svg.flowchart');
    if (!svg) {
      console.warn('⚠️ 此頁面找不到流程圖 SVG');
      return null;
    }

    console.log('✓ 找到流程圖 SVG');

    if (typeof convertFlowchart === 'function') {
      const result = convertFlowchart(svg);
      console.log('轉換結果：');
      console.log(result);
      return result;
    } else {
      console.error('❌ 找不到 convertFlowchart 函數。請確保擴充功能已載入。');
      return null;
    }
  }

  // 測試案例 3：時序圖
  function testSequenceDiagram() {
    console.log('%c\n⏱️ 測試 3：時序圖', 'color: #28a745; font-weight: bold;');

    const svg = document.querySelector('svg[aria-roledescription="sequence"]');
    if (!svg) {
      console.warn('⚠️ 此頁面找不到時序圖 SVG');
      return null;
    }

    console.log('✓ 找到時序圖 SVG');

    if (typeof convertSequenceDiagram === 'function') {
      const result = convertSequenceDiagram(svg);
      console.log('轉換結果：');
      console.log(result);
      return result;
    } else {
      console.error('❌ 找不到 convertSequenceDiagram 函數。請確保擴充功能已載入。');
      return null;
    }
  }

  // 工具函數：複製結果到剪貼簿
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      console.log('✓ 結果已複製到剪貼簿！');
    }).catch(err => {
      console.error('複製失敗：', err);
    });
  }

  // 主要測試執行器
  function runAllTests() {
    console.log('%c\n🚀 執行所有測試...', 'color: #007bff; font-weight: bold;');

    const results = {
      classDigram: testClassDiagram(),
      flowChart: testFlowChart(),
      sequenceDiagram: testSequenceDiagram()
    };

    console.log('%c\n📋 測試摘要', 'color: #007bff; font-size: 14px; font-weight: bold;');
    console.log('================================================');

    let passCount = 0;
    let totalCount = 0;

    Object.keys(results).forEach(key => {
      totalCount++;
      if (results[key]) {
        passCount++;
        console.log(`✓ ${key}: 通過`);
      } else {
        console.log(`✗ ${key}: 跳過或失敗`);
      }
    });

    console.log(`\n結果：${passCount}/${totalCount} 個測試完成`);
    console.log('================================================\n');

    return results;
  }

  // 將測試函數公開到全域範圍
  window.mermaidTest = {
    runAll: runAllTests,
    testClassDiagram,
    testFlowChart,
    testSequenceDiagram,
    copyToClipboard
  };

  console.log('%c\n💡 可用的測試函數：', 'color: #ffc107; font-weight: bold;');
  console.log('  - mermaidTest.runAll()           // 執行所有測試');
  console.log('  - mermaidTest.testClassDiagram() // 測試類別圖');
  console.log('  - mermaidTest.testFlowChart()    // 測試流程圖');
  console.log('  - mermaidTest.testSequenceDiagram() // 測試時序圖');
  console.log('  - mermaidTest.copyToClipboard(text) // 複製到剪貼簿');
  console.log('\n');

  // 如果找到 SVG 則自動執行測試
  const hasSVG = document.querySelector('svg.classDiagram, svg.flowchart, svg[aria-roledescription="sequence"]');
  if (hasSVG) {
    console.log('%c自動偵測到 SVG 圖表，開始測試...', 'color: #28a745;');
    setTimeout(() => {
      runAllTests();
    }, 500);
  } else {
    console.log('%c頁面中沒有偵測到 Mermaid SVG 圖表', 'color: #ffc107;');
    console.log('請開啟包含圖表的頁面後重新執行此腳本');
  }

})();
