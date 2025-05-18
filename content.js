// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "convertToMarkdown") {
    try {
      // Get page title from head
      const headTitle = document.title || "";
      // Format head title: replace slashes and pipes with dashes
      const formattedHeadTitle = headTitle.replace(/[\/|]/g, '-').replace(/\s+/g, '-').replace('---','-');

      // Get article title (keep unchanged)
      const title =
        document
          .querySelector(
            '.container > div:nth-child(1) a[data-selected="true"]'
          )
          ?.textContent?.trim() ||
        document
          .querySelector(".container > div:nth-child(1) h1")
          ?.textContent?.trim() ||
        document.querySelector("h1")?.textContent?.trim() ||
        "Untitled";

      // Get article content container (keep unchanged)
      const contentContainer =
        document.querySelector(".container > div:nth-child(2) .prose") ||
        document.querySelector(".container > div:nth-child(2) .prose-custom") ||
        document.querySelector(".container > div:nth-child(2)") ||
        document.body;

      let markdown = ``;
      let markdownTitle = title.replace(/\s+/g, '-');

      contentContainer.childNodes.forEach((child) => {
        markdown += processNode(child);
      });

      // Normalize blank lines
      markdown = markdown.trim().replace(/\n{3,}/g, "\n\n");
      sendResponse({ 
        success: true, 
        markdown, 
        markdownTitle,
        headTitle: formattedHeadTitle
      });
    } catch (error) {
      console.error("Error converting to Markdown:", error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === "extractAllPages") {
    try {
      // Get the head title
      const headTitle = document.title || "";
      // Format head title: replace slashes and pipes with dashes
      const formattedHeadTitle = headTitle.replace(/[\/|]/g, '-').replace(/\s+/g, '-').replace('---','-');
      
      // Get the base part of the current document path
      const baseUrl = window.location.origin;
      
      // Get all links in the sidebar
      const sidebarLinks = Array.from(document.querySelectorAll('.border-r-border ul li a'));
      
      // Extract link URLs and titles
      const pages = sidebarLinks.map(link => {
        return {
          url: new URL(link.getAttribute('href'), baseUrl).href,
          title: link.textContent.trim(),
          selected: link.getAttribute('data-selected') === 'true'
        };
      });
      
      // Get current page information for return
      const currentPageTitle =
        document
          .querySelector(
            '.container > div:nth-child(1) a[data-selected="true"]'
          )
          ?.textContent?.trim() ||
        document
          .querySelector(".container > div:nth-child(1) h1")
          ?.textContent?.trim() ||
        document.querySelector("h1")?.textContent?.trim() ||
        "Untitled";
        
      sendResponse({ 
        success: true, 
        pages: pages, 
        currentTitle: currentPageTitle,
        baseUrl: baseUrl,
        headTitle: formattedHeadTitle
      });
    } catch (error) {
      console.error("Error extracting page links:", error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === "pageLoaded") {
    // Page loading complete, batch operation preparation can be handled here
    // No sendResponse needed, as this is a notification from background.js
    console.log("Page loaded:", window.location.href);
    // Always send a response, even if empty, to avoid connection errors
    sendResponse({ received: true });
  } else if (request.action === "tabActivated") {
    // Tab has been activated, possibly after being in bfcache
    console.log("Tab activated:", window.location.href);
    // Acknowledge receipt of message to avoid connection errors
    sendResponse({ received: true });
  }
  // Always return true for asynchronous sendResponse handling
  return true;
});
// Function for Flowchart (ensure this exists from previous responses)
function convertFlowchartSvgToMermaidText(svgElement) {
  if (!svgElement) return null;

  let mermaidCode = "flowchart TD\n\n";
  const nodes = {}; 
  const clusters = {}; 
  const nodeClusterMap = {}; // 节点所属子图映射

  // 处理节点并收集位置信息
  const nodePositions = {};
  const nodeElements = svgElement.querySelectorAll('g.node');
  nodeElements.forEach(nodeEl => {
    const svgId = nodeEl.id;
    let textContent = "";
    
    // 尝试多种方式获取节点文本
    const textFo = nodeEl.querySelector('.label foreignObject div > span > p, .label foreignObject div > p, .label foreignObject p, .label p');
    if (textFo) {
      textContent = textFo.textContent.trim().replace(/"/g, '#quot;');
    } else {
      const textElement = nodeEl.querySelector('text, .label text');
      if (textElement) {
        textContent = textElement.textContent.trim().replace(/"/g, '#quot;');
      }
    }
    
    // 创建节点ID
    let mermaidId = svgId.replace(/^flowchart-/, '');
    mermaidId = mermaidId.replace(/-\d+$/, '');
    
    nodes[svgId] = { 
      mermaidId: mermaidId, 
      text: textContent, 
      svgId: svgId 
    };

    // 获取节点位置
    let position = null;
    
    // 从transform属性获取位置
    const transform = nodeEl.getAttribute('transform');
    if (transform) {
      const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
      if (match) {
        position = {
          x: parseFloat(match[1]),
          y: parseFloat(match[2])
        };
      }
    }
    
    // 如果无法从transform获取，尝试从矩形元素获取
    if (!position) {
      const rect = nodeEl.querySelector('rect');
      if (rect) {
        const x = parseFloat(rect.getAttribute('x') || 0);
        const y = parseFloat(rect.getAttribute('y') || 0);
        const width = parseFloat(rect.getAttribute('width') || 0);
        const height = parseFloat(rect.getAttribute('height') || 0);
        
        position = {
          x: x + width / 2, // 使用中心点坐标
          y: y + height / 2
        };
      }
    }
    
    if (position) {
      nodePositions[mermaidId] = position;
    }
  });

  // 处理子图/集群
  const clusterBounds = {};
  const svgClusterElements = svgElement.querySelectorAll('g.cluster');
  svgClusterElements.forEach(clusterEl => {
    const clusterSvgId = clusterEl.id;
    // 获取子图标题
    let title = "";
    const labelFo = clusterEl.querySelector('.cluster-label foreignObject div > span > p, .cluster-label foreignObject div > p, .cluster-label foreignObject p, .cluster-label foreignObject, g foreignObject div, g foreignObject span');
    if (labelFo) {
      if (labelFo.textContent) {
        title = labelFo.textContent.trim();
      } else if (labelFo.querySelector('p')) {
        title = labelFo.querySelector('p').textContent.trim();
      }
    }
    if (!title) {
      title = clusterSvgId;
    }
    const clusterMermaidId = title.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    clusters[clusterMermaidId] = { 
      title: title, 
      nodes: [], 
      svgId: clusterSvgId,
      edges: []
    };
    const rectEl = clusterEl.querySelector('rect');
    if (rectEl) {
      const x = parseFloat(rectEl.getAttribute('x') || 0);
      const y = parseFloat(rectEl.getAttribute('y') || 0);
      const width = parseFloat(rectEl.getAttribute('width') || 0);
      const height = parseFloat(rectEl.getAttribute('height') || 0);
      if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
        clusterBounds[clusterMermaidId] = {
          x: x,
          y: y,
          width: width,
          height: height,
          right: x + width,
          bottom: y + height,
          area: width * height
        };
      }
    }
  });

  // 只用严格空间包含+最内层优先分配节点到子图
  for (const nodeId in nodePositions) {
    const pos = nodePositions[nodeId];
    // 找出所有包含该节点的子图
    const containingClusters = Object.entries(clusterBounds).filter(([clusterId, bounds]) =>
      pos.x >= bounds.x && pos.x <= bounds.right &&
      pos.y >= bounds.y && pos.y <= bounds.bottom
    );
    if (containingClusters.length > 0) {
      // 选面积最小的（最内层）
      containingClusters.sort((a, b) => a[1].area - b[1].area);
      const clusterId = containingClusters[0][0];
      nodeClusterMap[nodeId] = clusterId;
      clusters[clusterId].nodes.push(nodeId);
      // 更新节点对象
      for (const svgId in nodes) {
        if (nodes[svgId].mermaidId === nodeId) {
          nodes[svgId].clusterMermaidId = clusterId;
          break;
        }
      }
    }
  }

  // 使用基于空间位置和距离的方法分配节点到子图
  // 可以考虑分析节点与子图之间的相对位置关系来优化分配结果

  // 处理边的标签
  const edgeLabelsById = {};
  
  // 提取所有边标签
  svgElement.querySelectorAll('g.edgeLabel').forEach(labelEl => {
    const labelId = labelEl.id || "";
    let labelText = "";
    
    // 尝试多种方式获取标签文本
    const selectors = [
      '.label foreignObject p', 
      '.label foreignObject span p', 
      '.label foreignObject div p',
      '.label foreignObject span.edgeLabel',
      '.label foreignObject div.labelBkg span.edgeLabel',
      'foreignObject'
    ];
    
    for (const selector of selectors) {
      const el = labelEl.querySelector(selector);
      if (el && el.textContent) {
        labelText = el.textContent.trim();
        if (labelText) break;
      }
    }
    
    // 如果上面的方法都失败，直接获取内部文本
    if (!labelText && labelEl.textContent) {
      labelText = labelEl.textContent.trim();
    }
    
    if (labelId && labelText) {
      edgeLabelsById[labelId] = labelText;
    }
  });
  
  // 分析边和标签的位置关系
  const labelInfo = {};
  
  // 获取标签的位置信息
  svgElement.querySelectorAll('g.edgeLabel').forEach(labelGroup => {
    const transform = labelGroup.getAttribute('transform') || "";
    const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (match) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      
      let text = "";
      const selectors = [
        '.label foreignObject p', 
        '.label foreignObject span p', 
        '.label foreignObject div p',
        '.label foreignObject span.edgeLabel',
        '.label foreignObject div.labelBkg span.edgeLabel',
        'foreignObject'
      ];
      
      for (const selector of selectors) {
        const el = labelGroup.querySelector(selector);
        if (el && el.textContent) {
          text = el.textContent.trim();
          if (text) break;
        }
      }
      
      if (!text && labelGroup.textContent) {
        text = labelGroup.textContent.trim();
      }
      
      if (text) {
        labelInfo[`${x},${y}`] = {
          text: text,
          id: labelGroup.id || ""
        };
        
        if (labelGroup.id) {
          edgeLabelsById[labelGroup.id] = text;
        }
      }
    }
  });
  
  // 处理边，通过ID匹配和位置匹配来找到对应的标签
  const innerClusterEdges = {}; // 子图内部的边
  const interClusterEdges = []; // 子图之间的边
  const normalEdges = []; // 不在任何子图中的边
  
  svgElement.querySelectorAll('path.flowchart-link').forEach(path => {
    const pathId = path.id || "";
    if (!pathId) return;
    
    // 尝试解析节点关系，适用于常见的ID格式如 L_NodeA_NodeB
    let sourceNode = null;
    let targetNode = null;
    let sourceName = null;
    let targetName = null;
    
    if (pathId.startsWith("L_") || pathId.startsWith("FL_")) {
      const idPrefix = pathId.startsWith("L_") ? "L_" : "FL_";
      const parts = pathId.substring(idPrefix.length).split('_'); 
      if (parts.length >= 2) {
        sourceName = parts[0];
        targetName = parts[1]; 
        sourceNode = Object.values(nodes).find(n => n.mermaidId === sourceName);
        targetNode = Object.values(nodes).find(n => n.mermaidId === targetName);
      }
    }
    
    // 如果无法通过ID解析，尝试通过marker-end或路径来推断
    if (!sourceNode || !targetNode) {
      // 这里可以添加其他启发式方法，但需要更复杂的解析
      // 暂时跳过不能解析的边
      return;
    }
    
    // 查找此边的标签
    let label = null;
    
    // 1. 直接从ID映射获取
    if (edgeLabelsById[pathId]) {
      label = edgeLabelsById[pathId];
    }
    // 2. 尝试其他可能的标签ID格式
    else {
      const possibleIds = [
        `edgeLabel-${sourceName}-${targetName}`,
        `L-${sourceName}-${targetName}`,
        `L_${sourceName}_${targetName}`,
        `${sourceName}-${targetName}`,
        `${sourceName}_${targetName}`
      ];
      
      for (const possibleId of possibleIds) {
        if (edgeLabelsById[possibleId]) {
          label = edgeLabelsById[possibleId];
          break;
        }
      }
    }
    
    // 3. 通过位置匹配
    if (!label) {
      const pathD = path.getAttribute('d') || "";
      const midPointMatch = pathD.match(/M[^C]+C[^,]+,[^,]+,([^,]+),([^,]+)/);
      if (midPointMatch) {
        const midX = parseFloat(midPointMatch[1]);
        const midY = parseFloat(midPointMatch[2]);
        
        let closestLabel = null;
        let closestDist = Infinity;
        
        for (const pos in labelInfo) {
          const [x, y] = pos.split(',').map(parseFloat);
          const dist = Math.sqrt(Math.pow(x - midX, 2) + Math.pow(y - midY, 2));
          if (dist < closestDist) {
            closestDist = dist;
            closestLabel = labelInfo[pos];
          }
        }
        
        if (closestLabel && closestDist < 100) {
          label = closestLabel.text;
        }
      }
    }
    
    // 构建边文本
    const labelPart = label ? `|${label}|` : "";
    const edgeText = `${sourceNode.mermaidId} -->${labelPart} ${targetNode.mermaidId}`;
    
    // 判断边的类型：子图内部、子图间、普通边
    const sourceCluster = nodeClusterMap[sourceNode.mermaidId];
    const targetCluster = nodeClusterMap[targetNode.mermaidId];
    
    if (sourceCluster && targetCluster && sourceCluster === targetCluster) {
      // 子图内部的边
      if (!innerClusterEdges[sourceCluster]) {
        innerClusterEdges[sourceCluster] = [];
      }
      innerClusterEdges[sourceCluster].push(`    ${edgeText}`);
      
      // 将边也保存到对应子图的edges集合中
      if (clusters[sourceCluster]) {
        clusters[sourceCluster].edges.push(`    ${edgeText}`);
      }
    } else if (sourceCluster || targetCluster) {
      // 子图之间的边或子图与外部节点的边
      interClusterEdges.push(`    ${edgeText}`);
    } else {
      // 普通边（不在任何子图中）
      normalEdges.push(`    ${edgeText}`);
    }
  });
  
  // 构建Mermaid输出
  
  // 1. 首先输出所有节点的定义
  for (const svgId in nodes) {
    const node = nodes[svgId];
    if (!mermaidCode.includes(`${node.mermaidId}["`)) {
      mermaidCode += `${node.mermaidId}["${node.text}"]\n`;
    }
  }
  
  // 2. 输出普通边和子图间的边
  if (normalEdges.length > 0) {
    mermaidCode += "\n" + normalEdges.join('\n') + '\n';
  }
  
  if (interClusterEdges.length > 0) {
    mermaidCode += "\n" + interClusterEdges.join('\n') + '\n';
  }
  
  // 3. 输出子图结构及其内部边
  for (const clusterMermaidId in clusters) {
    const cluster = clusters[clusterMermaidId];
    
    // 即使子图没有节点，也输出
    mermaidCode += `subgraph ${clusterMermaidId} ["${cluster.title}"]\n`;
    
    // 输出子图中的节点
    for (const nodeId of cluster.nodes) {
      const node = Object.values(nodes).find(n => n.mermaidId === nodeId);
      if (node) {
        mermaidCode += `    ${nodeId}\n`;
      }
    }
    
    // 输出子图内部的边
    if (cluster.edges && cluster.edges.length > 0) {
      mermaidCode += cluster.edges.join('\n') + '\n';
    } else if (innerClusterEdges[clusterMermaidId]) {
      mermaidCode += innerClusterEdges[clusterMermaidId].join('\n') + '\n';
    }
    
    mermaidCode += "end\n\n";
  }
  
  if (Object.keys(nodes).length === 0 && Object.keys(clusters).length === 0) return null;
  return '```mermaid\n' + mermaidCode.trim() + '\n```';
}

// Function for Class Diagram (ensure this exists from previous responses)
function convertClassDiagramSvgToMermaidText(svgElement) {
  // ... (previous implementation for class diagram)
  if (!svgElement) return null;
  const mermaidLines = ['classDiagram'];
  const classData = {}; 

  svgElement.querySelectorAll('g.node.default').forEach(node => {
    const classIdSvg = node.getAttribute('id'); 
    if (!classIdSvg) return;
    const classNameMatch = classIdSvg.match(/^classId-([^-]+(?:-[^-]+)*)-(\d+)$/);
    if (!classNameMatch) return;
    const className = classNameMatch[1];
    if (!classData[className]) {
        classData[className] = { stereotype: "", members: [], methods: [] };
    }
    const stereotypeElem = node.querySelector('g.annotation-group.text foreignObject span.nodeLabel p, g.annotation-group.text foreignObject div p');
    if (stereotypeElem && stereotypeElem.textContent.trim()) {
        classData[className].stereotype = stereotypeElem.textContent.trim();
    }
    node.querySelectorAll('g.members-group.text g.label foreignObject span.nodeLabel p, g.members-group.text g.label foreignObject div p').forEach(m => {
      const txt = m.textContent.trim();
      if (txt) classData[className].members.push(txt);
    });
    node.querySelectorAll('g.methods-group.text g.label foreignObject span.nodeLabel p, g.methods-group.text g.label foreignObject div p').forEach(m => {
      const txt = m.textContent.trim();
      if (txt) classData[className].methods.push(txt);
    });
  });

  for (const className in classData) {
    const data = classData[className];
    if (data.stereotype) {
        mermaidLines.push(`    class ${className} {`);
        mermaidLines.push(`        ${data.stereotype}`);
    } else {
        mermaidLines.push(`    class ${className} {`);
    }
    data.members.forEach(member => { mermaidLines.push(`        ${member}`); });
    data.methods.forEach(method => { mermaidLines.push(`        ${method}`); });
    mermaidLines.push('    }');
  }

  const pathElements = Array.from(svgElement.querySelectorAll('path.relation[id^="id_"]'));
  const labelElements = Array.from(svgElement.querySelectorAll('g.edgeLabels .edgeLabel foreignObject p'));

  pathElements.forEach((path, index) => {
    const id = path.getAttribute('id'); 
    const parts = id.split('_'); 
    if (parts.length < 3) return; 
    const fromClass = parts[1];
    const toClass = parts[2];
    
    // 获取关键属性
    const markerEndAttr = path.getAttribute('marker-end') || "";
    const markerStartAttr = path.getAttribute('marker-start') || "";
    const pathClass = path.getAttribute('class') || "";
    
    // 确定线条样式：实线或虚线
    const isDashed = path.classList.contains('dashed-line') || 
                     path.classList.contains('dotted-line') || 
                     pathClass.includes('dashed') || 
                     pathClass.includes('dotted');
    const lineStyle = isDashed ? ".." : "--";
    
    let relationshipType = "";
    
    // 继承关系: <|--（处理marker-start和marker-end两种情况）
    if (markerStartAttr.includes('extensionStart') || markerStartAttr.includes('inheritance')) { 
        // 正确表示继承关系：箭头从子类指向父类
        relationshipType = `${fromClass} <|${lineStyle} ${toClass}`;
    } 
    else if (markerEndAttr.includes('extensionEnd') || markerEndAttr.includes('inheritance')) { 
        // 正确表示继承关系：箭头从子类指向父类
        relationshipType = `${fromClass} <|${lineStyle} ${toClass}`;
    }
    // 实现关系: ..|>
    else if (markerStartAttr.includes('lollipopStart') || markerStartAttr.includes('implementStart')) {
        relationshipType = `${fromClass} ..|> ${toClass}`;
    }
    else if (markerEndAttr.includes('implementEnd') || markerEndAttr.includes('lollipopEnd') || 
             (markerEndAttr.includes('interfaceEnd') && isDashed)) {
        relationshipType = `${fromClass} ..|> ${toClass}`;
    }
    // 组合关系: *--
    else if (markerStartAttr.includes('compositionStart')) {
        relationshipType = `${toClass} *${lineStyle} ${fromClass}`;
    }
    else if (markerEndAttr.includes('compositionEnd') || 
             markerEndAttr.includes('diamondEnd') && markerEndAttr.includes('filled')) { 
        relationshipType = `${fromClass} *${lineStyle} ${toClass}`;
    } 
    // 聚合关系: o--
    else if (markerStartAttr.includes('aggregationStart')) {
        relationshipType = `${toClass} o${lineStyle} ${fromClass}`;
    }
    else if (markerEndAttr.includes('aggregationEnd') || 
             markerEndAttr.includes('diamondEnd') && !markerEndAttr.includes('filled')) { 
        relationshipType = `${fromClass} o${lineStyle} ${toClass}`;
    } 
    // 依赖关系: ..>
    else if (markerStartAttr.includes('dependencyStart') && isDashed) {
        relationshipType = `${toClass} <.. ${fromClass}`;
    }
    else if ((markerEndAttr.includes('dependencyEnd') || markerEndAttr.includes('openEnd')) && isDashed) { 
        relationshipType = `${fromClass} ..> ${toClass}`;
    }
    // 关联关系: -->
    else if (markerStartAttr.includes('arrowStart') || markerStartAttr.includes('openStart')) {
        relationshipType = `${toClass} <${lineStyle} ${fromClass}`;
    }
    else if (markerEndAttr.includes('arrowEnd') || markerEndAttr.includes('openEnd')) { 
        relationshipType = `${fromClass} ${lineStyle}> ${toClass}`;
    }
    // 无箭头实线链接: --
    else if (lineStyle === "--" && !markerEndAttr.includes('End') && !markerStartAttr.includes('Start')) { 
        relationshipType = `${fromClass} -- ${toClass}`;
    }
    // 无箭头虚线链接: ..
    else if (lineStyle === ".." && !markerEndAttr.includes('End') && !markerStartAttr.includes('Start')) {
        relationshipType = `${fromClass} .. ${toClass}`;
    }
    // 默认关系
    else {
        relationshipType = `${fromClass} ${lineStyle} ${toClass}`;
    }
    
    // 获取关系标签文本
    const labelText = (labelElements[index] && labelElements[index].textContent) ? 
                       labelElements[index].textContent.trim() : "";
    
    if (relationshipType) {
        mermaidLines.push(`    ${relationshipType}${labelText ? ' : ' + labelText : ''}`);
    }
  });

  if (mermaidLines.length <= 1 && Object.keys(classData).length === 0) return null;
  return '```mermaid\n' + mermaidLines.join('\n') + '\n```';
}

/**
 * Helper: 将 SVG Sequence Diagram 图表转换为 Mermaid 代码
 * @param {SVGElement} svgElement - The SVG DOM element for the sequence diagram
 * @returns {string|null}
 */
function convertSequenceDiagramSvgToMermaidText(svgElement) {
    if (!svgElement) return null;

    const participants = [];
    const actorXCoordinates = new Map(); // Map actor name to its lifeline X coordinate

    // Extract participants from actor lines primarily, then fallback to top boxes
    svgElement.querySelectorAll('line.actor-line').forEach(line => {
        const name = line.getAttribute('name');
        const xPos = parseFloat(line.getAttribute('x1'));
        if (name && !isNaN(xPos) && !actorXCoordinates.has(name)) {
            participants.push({ name: name, x: xPos, alias: name.replace(/[^a-zA-Z0-9_]/g, '_') });
            actorXCoordinates.set(name, xPos);
        }
    });
    
    // Fallback if no actor-lines found or to catch any missed ones from top boxes
    svgElement.querySelectorAll('g[id^="root-"] > text.actor-box').forEach((textEl, index) => {
        // Try to get name from associated rect first if it's more reliable
        const parentGroup = textEl.closest('g[id^="root-"]');
        const rectName = parentGroup?.querySelector('rect.actor-top')?.getAttribute('name');
        const name = rectName || textEl.textContent.trim();
        
        if (name && !actorXCoordinates.has(name)) {
            // Estimate X from text el if line wasn't found or didn't have this participant
             // For X, try to find its corresponding line if possible, otherwise use text X
            let xPos = parseFloat(textEl.getAttribute('x')); // Text X is center
            const correspondingLine = svgElement.querySelector(`line.actor-line[name="${name}"]`);
            if(correspondingLine) {
                xPos = parseFloat(correspondingLine.getAttribute('x1'));
            }
            
            if (!isNaN(xPos)) {
                 participants.push({ name: name, x: xPos, alias: name.replace(/[^a-zA-Z0-9_]/g, '_') });
                 actorXCoordinates.set(name, xPos);
            }
        }
    });
    
    // Remove duplicate participants just in case, preferring those with valid x
    const uniqueParticipants = [];
    const seenNames = new Set();
    participants.filter(p => p.name && !isNaN(p.x)).forEach(p => {
        if (!seenNames.has(p.name)) {
            uniqueParticipants.push(p);
            seenNames.add(p.name);
        }
    });

    uniqueParticipants.sort((a, b) => a.x - b.x);

    let mermaidOutput = "sequenceDiagram\n";
    uniqueParticipants.forEach(p => {
        if (p.alias !== p.name) {
            mermaidOutput += `  participant ${p.alias} as "${p.name}"\n`;
        } else {
            mermaidOutput += `  participant ${p.name}\n`;
        }
    });
    mermaidOutput += "\n";

    const events = []; // To store messages and notes, then sort by Y

    // Extract Messages
    const messageLineElements = Array.from(svgElement.querySelectorAll('line[class^="messageLine"]'));
    const messageTextElements = Array.from(svgElement.querySelectorAll('text.messageText'));

    messageLineElements.forEach((lineEl, index) => {
        const x1 = parseFloat(lineEl.getAttribute('x1'));
        const y1 = parseFloat(lineEl.getAttribute('y1'));
        const x2 = parseFloat(lineEl.getAttribute('x2'));

        let fromActorName = null;
        let toActorName = null;
        let minDiffFrom = Infinity;
        let minDiffTo = Infinity;

        uniqueParticipants.forEach(p => {
            const diff1 = Math.abs(p.x - x1);
            if (diff1 < minDiffFrom) {
                minDiffFrom = diff1;
                fromActorName = p.alias; // Use alias for Mermaid syntax
            }
            const diff2 = Math.abs(p.x - x2);
            if (diff2 < minDiffTo) {
                minDiffTo = diff2;
                toActorName = p.alias; // Use alias for Mermaid syntax
            }
        });
        
        // Message text Y is usually close to line Y. The text element has its own Y.
        // Let's use the messageTextElements[index]'s Y if available and reliable.
        let eventY = y1;
        let textContent = "";
        if (messageTextElements[index]) {
            textContent = messageTextElements[index].textContent.trim().replace(/"/g, '#quot;');
            const textY = parseFloat(messageTextElements[index].getAttribute('y'));
            if (!isNaN(textY)) eventY = textY; // Use text's Y for sorting if it's more central to the message
        }

        const lineClass = lineEl.getAttribute('class') || "";
        
        // 根据线条类和可能的标记确定箭头类型
        let arrowType = '->>'; // 默认为带箭头的实线
        
        // 检测线条类型（虚线或实线）
        const isDashed = lineClass.includes('messageLine1') || lineClass.includes('dashed');
        
        // 检测特殊标记（如果有）
        const markerEnd = lineEl.getAttribute('marker-end') || '';
        const hasX = markerEnd.includes('cross') || markerEnd.includes('x-mark');
        const isOpen = markerEnd.includes('open') || markerEnd.includes('circle');
        const isBidirectional = lineClass.includes('bi') || lineClass.includes('both');
        
        // 确定箭头类型
        if (isBidirectional) {
            arrowType = isDashed ? '<<-->>' : '<<->>';
        } else if (hasX) {
            arrowType = isDashed ? '--x' : '-x';
        } else if (isOpen) {
            arrowType = isDashed ? '--)' : '-)';
        } else {
            arrowType = isDashed ? '-->>' : '->>';
        }

        if (fromActorName && toActorName) {
            events.push({
                y: eventY,
                type: 'message',
                data: {
                    from: fromActorName,
                    to: toActorName,
                    arrow: arrowType,
                    text: textContent
                }
            });
        }
    });

    // Extract Notes
    svgElement.querySelectorAll('g > rect.note').forEach(noteRect => {
        const rectY = parseFloat(noteRect.getAttribute('y'));
        const noteX = parseFloat(noteRect.getAttribute('x'));
        const noteWidth = parseFloat(noteRect.getAttribute('width'));
        
        let noteTextContent = "Note"; // Default text
        // Note text is within the same <g> as the rect.note in this SVG
        const noteTextElement = noteRect.parentElement.querySelector('text.noteText');

        if (noteTextElement) {
             noteTextContent = Array.from(noteTextElement.querySelectorAll('tspan'))
                               .map(tspan => tspan.textContent.trim())
                               .join(' ') || noteTextElement.textContent.trim();
             noteTextContent = noteTextContent.replace(/"/g, '#quot;');
        }

        let noteMermaidData = { text: noteTextContent };
        let placementDetermined = false;

        // Try to determine "over P1,P2" or "over P"
        const coveredParticipants = uniqueParticipants.filter(p => {
            const participantBoxStartX = p.x - 75; // Approximate box width 150
            const participantBoxEndX = p.x + 75;
            // Check for overlap: note range vs participant box range
            return Math.max(noteX, participantBoxStartX) < Math.min(noteX + noteWidth, participantBoxEndX);
        });

        if (coveredParticipants.length > 1) {
            // Sort covered participants by their X position
            coveredParticipants.sort((a,b) => a.x - b.x);
            noteMermaidData.position = 'over'; // Mermaid uses "over A,B" for notes spanning multiple actors
            noteMermaidData.actor1 = coveredParticipants[0].alias;
            noteMermaidData.actor2 = coveredParticipants[coveredParticipants.length - 1].alias;
            placementDetermined = true;
        } else if (coveredParticipants.length === 1) {
            noteMermaidData.position = 'over';
            noteMermaidData.actor1 = coveredParticipants[0].alias;
            placementDetermined = true;
        }

        // If not "over", try "left of" or "right of" the closest participant
        if (!placementDetermined) {
            let closestParticipant = null;
            let minDistToClosest = Infinity;
            uniqueParticipants.forEach(p => {
                const dist = Math.abs(p.x - (noteX + noteWidth / 2)); // Distance from note center to participant lifeline
                if (dist < minDistToClosest) {
                    minDistToClosest = dist;
                    closestParticipant = p;
                }
            });

            if (closestParticipant) {
                if (noteX + noteWidth < closestParticipant.x - 10) { // Note ends before participant lifeline (with margin)
                    noteMermaidData.position = 'left of';
                    noteMermaidData.actor1 = closestParticipant.alias;
                } else if (noteX > closestParticipant.x + 10) { // Note starts after participant lifeline (with margin)
                    noteMermaidData.position = 'right of';
                    noteMermaidData.actor1 = closestParticipant.alias;
                } else { // Default to "over" the closest if it's very near or slightly overlapping
                    noteMermaidData.position = 'over';
                    noteMermaidData.actor1 = closestParticipant.alias;
                }
                placementDetermined = true;
            }
        }
        
        if (placementDetermined && noteMermaidData.actor1) {
            events.push({
                y: rectY, // Sort notes by their rect's Y position
                type: 'note',
                data: noteMermaidData
            });
        }
    });

    // Sort all events by Y coordinate
    events.sort((a, b) => a.y - b.y);

    // Generate Mermaid lines for events
    events.forEach(event => {
        if (event.type === 'message') {
            const m = event.data;
            mermaidOutput += `  ${m.from}${m.arrow}${m.to}: ${m.text}\n`;
        } else if (event.type === 'note') {
            const n = event.data;
            if (n.position === 'over' && n.actor2) { // Handles "Note over P1,P2"
                mermaidOutput += `  Note over ${n.actor1},${n.actor2}: ${n.text}\n`;
            } else { // 'over P', 'left of P', 'right of P'
                mermaidOutput += `  Note ${n.position} ${n.actor1}: ${n.text}\n`;
            }
        }
    });
    
    if (uniqueParticipants.length === 0 && events.length === 0) return null; // No sequence elements found

    return '```mermaid\n' + mermaidOutput.trim() + '\n```';
}
// Helper function: recursively process nodes
function processNode(node) {
  // console.log("processNode START:", node.nodeName, node.nodeType, node.textContent ? node.textContent.substring(0,50) : ''); // DEBUG
  let resultMd = "";

  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentNode && node.parentNode.nodeName === 'PRE') { return node.textContent; }
    // Fix: For normal text nodes, avoid consecutive blank lines being converted to a single newline, 
    // then having \n\n added by outer logic causing too many empty lines
    // Simply return the text and let the parent block element handle the trailing \n\n
    return node.textContent;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node;
  const style = window.getComputedStyle(element);

  if (
    (style.display === "none" || style.visibility === "hidden") &&
    !["DETAILS", "SUMMARY"].includes(element.nodeName)
  ) {
    return "";
  }

  if (element.matches('button, [role="button"], nav, footer, aside, script, style, noscript, iframe, embed, object, header')) { // Added header to general skip
      return "";
  }
  if (element.classList.contains("bg-input-dark") && element.querySelector("svg")){ // Your specific rule
    return "";
  }


  // Main logic wrapped in try...catch to catch errors when processing specific nodes
  try {
    switch (element.nodeName) {
      case "P": {
        let txt = "";
        element.childNodes.forEach((c) => {
            try { txt += processNode(c); } catch (e) { console.error("Error processing child of P:", c, e); txt += "[err]";}
        });
        txt = txt.trim();
        if (txt.startsWith("```mermaid") && txt.endsWith("```")) { // Already processed as Mermaid
          resultMd = txt + "\n\n";
        } else if (txt) {
          resultMd = txt + "\n\n";
        } else {
          resultMd = "\n"; // Keep empty P tag as a newline if needed
        }
        break;
      }
      case "H1": resultMd = (element.textContent.trim() ? `# ${element.textContent.trim()}\n\n` : ""); break;
      case "H2": resultMd = (element.textContent.trim() ? `## ${element.textContent.trim()}\n\n` : ""); break;
      case "H3": resultMd = (element.textContent.trim() ? `### ${element.textContent.trim()}\n\n` : ""); break;
      case "H4": resultMd = (element.textContent.trim() ? `#### ${element.textContent.trim()}\n\n` : ""); break;
      case "H5": resultMd = (element.textContent.trim() ? `##### ${element.textContent.trim()}\n\n` : ""); break;
      case "H6": resultMd = (element.textContent.trim() ? `###### ${element.textContent.trim()}\n\n` : ""); break;
      case "UL": {
        let list = "";
        element.querySelectorAll(":scope > li").forEach((li) => {
          let liTxt = "";
          li.childNodes.forEach((c) => { try { liTxt += processNode(c); } catch (e) { console.error("Error processing child of LI:", c, e); liTxt += "[err]";}});
          // Remove extra trailing newlines that might be produced by internal block elements
          liTxt = liTxt.trim().replace(/\n\n$/, "").replace(/^\n\n/, "");
          if (liTxt) list += `* ${liTxt}\n`;
        });
        resultMd = list + (list ? "\n" : "");
        break;
      }
      case "OL": {
        let list = "";
        let i = 1;
        element.querySelectorAll(":scope > li").forEach((li) => {
          let liTxt = "";
          li.childNodes.forEach((c) => { try { liTxt += processNode(c); } catch (e) { console.error("Error processing child of LI:", c, e); liTxt += "[err]";}});
          liTxt = liTxt.trim().replace(/\n\n$/, "").replace(/^\n\n/, "");
          if (liTxt) {
            list += `${i}. ${liTxt}\n`;
            i++;
          }
        });
        resultMd = list + (list ? "\n" : "");
        break;
      }
      case "PRE": {
        const svgElement = element.querySelector('svg[id^="mermaid-"]');
        let mermaidOutput = null;

        if (svgElement) {
          const diagramTypeDesc = svgElement.getAttribute('aria-roledescription');
          const diagramClass = svgElement.getAttribute('class');

          // console.log("Found SVG in PRE: desc=", diagramTypeDesc, "class=", diagramClass); // DEBUG
          if (diagramTypeDesc && diagramTypeDesc.includes('flowchart')) {
            mermaidOutput = convertFlowchartSvgToMermaidText(svgElement);
          } else if (diagramTypeDesc && diagramTypeDesc.includes('class')) {
            mermaidOutput = convertClassDiagramSvgToMermaidText(svgElement);
          } else if (diagramTypeDesc && diagramTypeDesc.includes('sequence')) {
            mermaidOutput = convertSequenceDiagramSvgToMermaidText(svgElement);
          } else if (diagramClass && diagramClass.includes('flowchart')) {
              mermaidOutput = convertFlowchartSvgToMermaidText(svgElement);
          } else if (diagramClass && (diagramClass.includes('classDiagram') || diagramClass.includes('class'))) {
              mermaidOutput = convertClassDiagramSvgToMermaidText(svgElement);
          } else if (diagramClass && (diagramClass.includes('sequenceDiagram') || diagramClass.includes('sequence'))) {
              mermaidOutput = convertSequenceDiagramSvgToMermaidText(svgElement);
          }
        }

        if (mermaidOutput) {
          resultMd = `\n${mermaidOutput}\n\n`;
        } else {
          const code = element.querySelector("code");
          let lang = "";
          let txt = "";
          if (code) {
            txt = code.textContent;
            const cls = Array.from(code.classList).find((c) => c.startsWith("language-"));
            if (cls) lang = cls.replace("language-", "");
          } else {
             txt = element.textContent;
          }
          if (!lang) {
            const preCls = Array.from(element.classList).find((c) => c.startsWith("language-"));
            if (preCls) lang = preCls.replace("language-", "");
          }
          resultMd = `\`\`\`${lang}\n${txt.trim()}\n\`\`\`\n\n`;
        }
        break;
      }
      case "A": {
        const href = element.getAttribute("href");
        let text = "";
        element.childNodes.forEach(c => { 
          try { 
            text += processNode(c); 
          } catch (e) { 
            console.error("Error processing child of A:", c, e); 
            text += "[err]";
          }
        });
        text = text.trim();

        if (!text && element.querySelector('img')) {
            text = element.querySelector('img').alt || 'image';
        }
        text = text || (href ? href : ""); // Fallback to href itself if text is still empty

        if (href && (href.startsWith('http') || href.startsWith('https') || href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:'))) {
          
          // 处理代码引用链接格式
          const hashMatch = href.match(/#L(\d+)-L(\d+)$/);
          if (hashMatch) {
              const hashStartLine = hashMatch[1];
              const hashEndLine = hashMatch[2];
              
              // 匹配"file.js 47-64"格式
              const textMatch = text.match(/^([\w\/-]+(?:\.\w+)?)\s+(\d+)-(\d+)$/);
              if (textMatch) {
                  const textFilename = textMatch[1];
                  const textStartLine = textMatch[2];
                  const textEndLine = textMatch[3];

                  if (hashStartLine === textStartLine && hashEndLine === textEndLine) {
                      const pathPart = href.substring(0, href.indexOf('#'));
                      if (pathPart.endsWith('/' + textFilename) || pathPart.includes('/' + textFilename) || pathPart === textFilename) {
                          text = `${textFilename} L${hashStartLine}-L${hashEndLine}`;
                      }
                  }
              } else {
                  // 匹配"Sources: [file.js 47-64]"格式
                  const sourcesMatch = text.match(/^Sources:\s+\[([\w\/-]+(?:\.\w+)?)\s+(\d+)-(\d+)\]$/);
                  if (sourcesMatch) {
                      const textFilename = sourcesMatch[1];
                      const textStartLine = sourcesMatch[2];
                      const textEndLine = sourcesMatch[3];
                      
                      if (hashStartLine === textStartLine && hashEndLine === textEndLine) {
                          const pathPart = href.substring(0, href.indexOf('#'));
                          if (pathPart.endsWith('/' + textFilename) || pathPart.includes('/' + textFilename) || pathPart === textFilename) {
                              text = `Sources: [${textFilename} L${hashStartLine}-L${hashEndLine}]`;
                          }
                      }
                  }
              }
          }
          
          resultMd = `[${text}](${href})`;
          if (window.getComputedStyle(element).display !== "inline") {
              resultMd += "\n\n";
          }
        } else { 
          resultMd = text; 
          if (window.getComputedStyle(element).display !== "inline" && text.trim()) {
              resultMd += "\n\n";
          }
        }
        break;
      }
      case "IMG":
        if (element.closest && element.closest('a')) return "";
        resultMd = (element.src ? `![${element.alt || ""}](${element.src})\n\n` : "");
        break;
      case "BLOCKQUOTE": {
        let qt = "";
        element.childNodes.forEach((c) => { try { qt += processNode(c); } catch (e) { console.error("Error processing child of BLOCKQUOTE:", c, e); qt += "[err]";}});
        const trimmedQt = qt.trim();
        if (trimmedQt) {
            resultMd = trimmedQt.split("\n").map((l) => `> ${l.trim() ? l : ''}`).filter(l => l.trim() !== '>').join("\n") + "\n\n";
        } else {
            resultMd = "";
        }
        break;
      }
      case "HR":
        resultMd = "\n---\n\n";
        break;
      case "STRONG":
      case "B": {
        let st = "";
        element.childNodes.forEach((c) => { try { st += processNode(c); } catch (e) { console.error("Error processing child of STRONG/B:", c, e); st += "[err]";}});
        return `**${st.trim()}**`; // Return directly
      }
      case "EM":
      case "I": {
        let em = "";
        element.childNodes.forEach((c) => { try { em += processNode(c); } catch (e) { console.error("Error processing child of EM/I:", c, e); em += "[err]";}});
        return `*${em.trim()}*`; // Return directly
      }
      case "CODE": {
          if (element.parentNode && element.parentNode.nodeName === 'PRE') {
              return element.textContent;
          }
          return `\`${element.textContent.trim()}\``; // Return directly
      }
      case "BR":
        if (element.parentNode && ['P', 'DIV', 'LI'].includes(element.parentNode.nodeName) ) { // Added LI
            const nextSibling = element.nextSibling;
            // Add markdown hard break only if BR is followed by text or is at the end of a line within a block
            if (!nextSibling || (nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() !== '') || nextSibling.nodeType === Node.ELEMENT_NODE) {
                 return "  \n"; // Return directly
            }
        }
        return ""; // Return directly (or empty if not a hard break)
      case "TABLE": {
          let tableMd = "";
          const headerRows = Array.from(element.querySelectorAll(':scope > thead > tr, :scope > tr:first-child'));
          const bodyRows = Array.from(element.querySelectorAll(':scope > tbody > tr'));
          const allRows = Array.from(element.rows); // Fallback

          let rowsToProcessForHeader = headerRows;
          if (headerRows.length === 0 && allRows.length > 0) { // Infer header if THEAD is missing
              rowsToProcessForHeader = [allRows[0]];
          }

          if (rowsToProcessForHeader.length > 0) {
              const headerRowElement = rowsToProcessForHeader[0];
              let headerContent = "|"; let separator = "|";
              Array.from(headerRowElement.cells).forEach(cell => {
                  let cellText = ""; cell.childNodes.forEach(c => { try { cellText += processNode(c); } catch (e) { console.error("Error processing child of TH/TD (Header):", c, e); cellText += "[err]";}});
                  headerContent += ` ${cellText.trim().replace(/\|/g, "\\|")} |`; separator += ` --- |`;
              });
              tableMd += `${headerContent}\n${separator}\n`;
          }

          let rowsToProcessForBody = bodyRows;
          if (bodyRows.length === 0 && allRows.length > (headerRows.length > 0 ? 1 : 0) ) { // If no TBODY, take remaining rows
              rowsToProcessForBody = headerRows.length > 0 ? allRows.slice(1) : allRows;
          }


          rowsToProcessForBody.forEach(row => {
              // Ensure we don't re-process a header row if using allRows fallback logic above and header was found
              if (rowsToProcessForHeader.length > 0 && rowsToProcessForHeader.includes(row)) return;

              let rowContent = "|";
              Array.from(row.cells).forEach(cell => {
                  let cellText = ""; cell.childNodes.forEach(c => { try { cellText += processNode(c); } catch (e) { console.error("Error processing child of TH/TD (Body):", c, e); cellText += "[err]";}});
                  rowContent += ` ${cellText.trim().replace(/\|/g, "\\|").replace(/\n+/g, ' <br> ')} |`;
              });
              tableMd += `${rowContent}\n`;
          });
          resultMd = tableMd + (tableMd ? "\n" : "");
          break;
      }
      case "THEAD": case "TBODY": case "TFOOT": case "TR": case "TH": case "TD":
          return ""; // Handled by TABLE case, return empty string if processed directly

      case "DETAILS": {
          let summaryText = "Details"; const summaryElem = element.querySelector('summary');
          if (summaryElem) { let tempSummary = ""; summaryElem.childNodes.forEach(c => { try { tempSummary += processNode(c); } catch (e) { console.error("Error processing child of SUMMARY:", c, e); tempSummary += "[err]";}}); summaryText = tempSummary.trim() || "Details"; }
          let detailsContent = "";
          Array.from(element.childNodes).forEach(child => { if (child.nodeName !== "SUMMARY") { try { detailsContent += processNode(child); } catch (e) { console.error("Error processing child of DETAILS:", c, e); detailsContent += "[err]";}}});
          resultMd = `> **${summaryText}**\n${detailsContent.trim().split('\n').map(l => `> ${l}`).join('\n')}\n\n`;
          break;
      }
      case "SUMMARY": return ""; // Handled by DETAILS

      case "DIV":
      case "SPAN":
      case "SECTION":
      case "ARTICLE":
      case "MAIN":
      default: {
        let txt = "";
        element.childNodes.forEach((c) => { try { txt += processNode(c); } catch (e) { console.error("Error processing child of DEFAULT case:", c, element.nodeName, e); txt += "[err]";}});
        
        const d = window.getComputedStyle(element);
        const isBlock = ["block", "flex", "grid", "list-item", "table", 
                         "table-row-group", "table-header-group", "table-footer-group"].includes(d.display);

        if (isBlock && txt.trim()) {
          // Ensure that text from children which already ends in \n\n isn't given more \n\n
          if (txt.endsWith('\n\n')) {
              resultMd = txt;
          } else if (txt.endsWith('\n')) { // if it ends with one \n, add one more for spacing
              resultMd = txt + '\n';
          } else { // if it has no trailing newlines, add two.
              resultMd = txt.trimEnd() + "\n\n";
          }
        } else { // Inline element or empty block element
          return txt; // Return directly
        }
      }
    }
  } catch (error) {
      console.error("Unhandled error in processNode for element:", element.nodeName, element, error);
      return `\n[ERROR_PROCESSING_ELEMENT: ${element.nodeName}]\n\n`; // Return an error placeholder
  }
  // console.log("processNode END for:", element.nodeName, "Output:", resultMd.substring(0,50)); // DEBUG
  return resultMd;
}