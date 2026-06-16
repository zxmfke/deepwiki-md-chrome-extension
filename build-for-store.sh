#!/bin/bash

# Chrome Web Store 打包腳本
# 此腳本會創建一個適合上傳到 Chrome Web Store 的 ZIP 文件

# 設定版本號（從 manifest.json 讀取）
VERSION=$(grep -o '"version": "[^"]*"' manifest.json | sed 's/"version": "\(.*\)"/\1/')
OUTPUT_FILE="deepwiki-md-extension-v${VERSION}.zip"

echo "正在打包 DeepWiki to Markdown Extension v${VERSION}..."

# 創建臨時目錄
TEMP_DIR="temp_build"
rm -rf ${TEMP_DIR}
mkdir -p ${TEMP_DIR}

# 複製需要的文件
echo "複製擴充功能文件..."
cp manifest.json ${TEMP_DIR}/
cp popup.html ${TEMP_DIR}/
cp popup.js ${TEMP_DIR}/
cp background.js ${TEMP_DIR}/
cp content.js ${TEMP_DIR}/
cp utils.js ${TEMP_DIR}/
cp batchHistory.js ${TEMP_DIR}/
cp styles.css ${TEMP_DIR}/

# 複製目錄
echo "複製圖標和函式庫..."
mkdir -p ${TEMP_DIR}/icons
mkdir -p ${TEMP_DIR}/lib

# 只複製 manifest.json 中實際使用的圖標（16, 48, 128）
cp icons/icon16.png ${TEMP_DIR}/icons/
cp icons/icon48.png ${TEMP_DIR}/icons/
cp icons/icon128.png ${TEMP_DIR}/icons/

# 複製函式庫
cp lib/jszip.min.js ${TEMP_DIR}/lib/

# 創建 ZIP 文件
echo "創建 ZIP 文件..."
cd ${TEMP_DIR}
zip -r ../${OUTPUT_FILE} ./*
cd ..

# 清理臨時目錄
rm -rf ${TEMP_DIR}

echo "打包完成！"
echo "輸出文件：${OUTPUT_FILE}"
echo "文件大小：$(du -h ${OUTPUT_FILE} | cut -f1)"
echo ""
echo "下一步："
echo "1. 前往 Chrome Web Store Developer Dashboard"
echo "2. 上傳 ${OUTPUT_FILE}"
echo "3. 填寫商店資訊（參考 CHROME_WEB_STORE_GUIDE.md）"
