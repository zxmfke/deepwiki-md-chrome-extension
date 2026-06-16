# DeepWiki 转 Markdown 扩展

一个将 DeepWiki 文档页面转换为 Markdown 格式的 Chrome 扩展，方便本地编辑和存档。

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/giidpddkhhjaikgjkkfclfidbnekghde?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/deepwiki-to-markdown/giidpddkhhjaikgjkkfclfidbnekghde)

[English](./README.md) | [繁體中文](./README.zh-TW.md)

## ☕ 支持此项目

<a href="https://buymeacoffee.com/philipz" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## 概述

本扩展帮助你将 DeepWiki (https://deepwiki.com) 上的文档保存为 Markdown 文件。适用于：
- 创建文档的本地备份
- 离线阅读和参考
- 将内容改编为自己的博客或笔记
- 保存 GitHub 仓库的知识

## 功能特点

### 1. 单页下载
将当前 DeepWiki 页面转换并下载为 Markdown 文件。

### 2. 批量下载（ZIP 压缩包）
将文档项目的所有子页面下载为独立的 Markdown 文件，打包到 ZIP 压缩包中并附带自动生成的索引。

### 3. 单文件批量下载 ✨ 新功能
将所有文档页面合并为一个 Markdown 文件，方便阅读和分享。

### 4. 高级转换
- 保留代码块和语法高亮
- 转换 Mermaid 图表（流程图、时序图、类图、状态图）
- 保持文档结构和格式
- 处理表格、列表和嵌套内容
- 提取元数据（最后索引日期）

## 安装

### 方法一：从 Chrome 网上应用店安装（推荐）

1. 访问 [Chrome 网上应用店](https://chromewebstore.google.com/detail/deepwiki-to-markdown/giidpddkhhjaikgjkkfclfidbnekghde)
2. 点击"添加至 Chrome"
3. 验证安装 - DeepWiki 图标应该出现在扩展工具栏中

### 方法二：从源码安装

1. **下载扩展**
   - 克隆此仓库：`git clone https://github.com/philipz/deepwiki-md-chrome-extension.git`
   - 或从 [Releases](https://github.com/philipz/deepwiki-md-chrome-extension/releases) 页面下载

2. **安装到 Chrome**
   - 打开 Chrome 并访问 `chrome://extensions/`
   - 启用"开发者模式"（右上角开关）
   - 点击"加载已解压的扩展程序"
   - 选择扩展目录

3. **验证安装**
   - DeepWiki 图标应该出现在扩展工具栏中
   - 访问任意 DeepWiki 页面进行测试

## 使用方法

![扩展界面](./images/UI.png)

### 单页下载

1. 访问任意 DeepWiki 文档页面
   - 示例：[ThinkInAIXYZ/go-mcp](https://deepwiki.com/ThinkInAIXYZ/go-mcp)
2. 点击工具栏中的扩展图标
3. 点击 **"Download Current Page"**（下载当前页面）
4. 选择保存 Markdown 文件的位置

### 批量下载（ZIP）

1. 打开 DeepWiki 文档项目的主页
   - 示例：[ThinkInAIXYZ/go-mcp](https://deepwiki.com/ThinkInAIXYZ/go-mcp)
2. 点击扩展图标
3. 点击 **"Download All Pages"**（下载所有页面）
4. 等待转换过程完成
   - 进度会显示在弹出窗口中
   - 可随时点击"Cancel"（取消）按钮
5. 在提示时保存 ZIP 文件

**ZIP 文件内容：**
- 每个页面的独立 Markdown 文件
- 包含所有文档链接的 `README.md`
- 有组织的文件夹结构

### 单文件批量下载

1. 打开 DeepWiki 文档项目的主页
2. 点击扩展图标
3. 点击 **"Download as one md file"**（下载为单个 md 文件）
4. 等待所有页面处理完成
5. 保存合并后的 Markdown 文件

**适用场景：**
- 创建单文件知识库
- 导入到笔记应用
- 轻松分享完整文档

## 示例

**转换前（DeepWiki）：**

![DeepWiki 页面](./images/deepwiki-github.png)

**转换后（Markdown）：**

![Markdown 输出](./images/deepwiki-markdown.png)

## 技术细节

- **支持网站：** https://deepwiki.com/*
- **文件格式：** Markdown (.md)
- **编码：** UTF-8
- **批量下载：** ZIP 压缩包，带组织结构
- **图表支持：** Mermaid 语法

## 系统要求

- Google Chrome 或基于 Chromium 的浏览器（Edge、Brave 等）
- 可访问 https://deepwiki.com

## 故障排除

**扩展无法工作：**
- 确保你在有效的 DeepWiki 文档页面（必须至少有 2 个路径段：`/org/project`）
- 检查页面是否已完全加载
- 尝试刷新页面

**下载失败：**
- 检查浏览器的下载设置
- 确保对下载文件夹有写入权限
- 对于大批量下载，确保有足够的磁盘空间

**批量转换卡住：**
- 使用"Cancel"按钮停止进程
- 刷新页面并重试
- 检查浏览器控制台的错误消息（F12 → Console）

## 开发路线图

未来考虑的增强功能：

- [ ] 转换前自动翻译为其他语言
- [ ] 增强的本地存储选项
- [ ] 云服务集成：
  - [ ] Google Drive（谷歌云端硬盘）
  - [ ] Microsoft OneDrive（微软 OneDrive）
  - [ ] Notion
  - [ ] Feishu/Lark Docs（飞书文档）
- [ ] 自定义转换模板
- [ ] 配置选项（图表格式、元数据包含等）
- [ ] 支持其他文档平台

## 贡献

欢迎贡献！你可以：
- 通过 [Issues](https://github.com/philipz/deepwiki-md-chrome-extension/issues) 报告错误
- 通过 [Issues](https://github.com/philipz/deepwiki-md-chrome-extension/issues) 提出功能建议
- 提交 Pull Request

## 隐私权

本扩展不会收集、存储或传输任何个人数据。所有转换都在您的浏览器本地执行。

完整详情请参阅我们的[隐私政策](PRIVACY_POLICY.md)。

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 致谢

- 为 [DeepWiki](https://deepwiki.com) 平台构建
- 使用 [JSZip](https://stuk.github.io/jszip/) 创建 ZIP 文件
- 受保存和重用技术文档需求的启发

---

**版本：** 0.1.0
**维护者：** [@philipz](https://github.com/philipz)
**仓库：** https://github.com/philipz/deepwiki-md-chrome-extension
