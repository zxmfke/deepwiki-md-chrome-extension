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
  const nodeClusterMap = {}; // Mapping of node to its subgraph

  // Process nodes and collect position information
  const nodePositions = {};
  const nodeElements = svgElement.querySelectorAll('g.node');
  nodeElements.forEach(nodeEl => {
    const svgId = nodeEl.id;
    let textContent = "";
    
    // Try multiple ways to get node text
    // More specific selector for <p> tags that might contain <br>
    const pElementForText = nodeEl.querySelector('.label foreignObject div > span > p, .label foreignObject div > p'); 
    
    if (pElementForText) {
        let rawParts = [];
        // Iterate over child nodes of the <p> element to correctly handle <br>
        pElementForText.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                rawParts.push(child.textContent);
            } else if (child.nodeName.toUpperCase() === 'BR') {
                rawParts.push('<br>');
            } else if (child.nodeType === Node.ELEMENT_NODE) { 
                // For other nested elements within p, take their textContent.
                rawParts.push(child.textContent || ''); 
            }
        });
        textContent = rawParts.join('').trim().replace(/"/g, '#quot;');
    }
    
    // Fallback if the primary method didn't yield text
    if (!textContent.trim()) { 
        const textFo = nodeEl.querySelector('.label foreignObject p, .label p'); // Broader <p> selectors
        if (textFo) {
          let rawParts = [];
          textFo.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) { rawParts.push(child.textContent); }
            else if (child.nodeName.toUpperCase() === 'BR') { rawParts.push('<br>'); }
            else if (child.nodeType === Node.ELEMENT_NODE) { rawParts.push(child.textContent || ''); }
          });
          textContent = rawParts.join('').trim().replace(/"/g, '#quot;');
          
          // If BR processing results in empty but original textContent was not, use original (trimmed)
          if (!textContent.trim() && textFo.textContent && textFo.textContent.trim()) {
              textContent = textFo.textContent.trim().replace(/"/g, '#quot;');
          }
        }
    }
    
    if (!textContent.trim()) { // Further fallback to <text> elements
      const textElement = nodeEl.querySelector('text, .label text');
      if (textElement && textElement.textContent) {
        textContent = textElement.textContent.trim().replace(/"/g, '#quot;');
      }
    }
    
    // Create node ID
    let mermaidId = svgId.replace(/^flowchart-/, '');
    mermaidId = mermaidId.replace(/-\d+$/, '');
    
    nodes[svgId] = { 
      mermaidId: mermaidId, 
      text: textContent, 
      svgId: svgId 
    };

    // Get node position
    let position = null;
    
    // Get position from transform attribute
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
    
    // If cannot get from transform, try from rect element
    if (!position) {
      const rect = nodeEl.querySelector('rect');
      if (rect) {
        const x = parseFloat(rect.getAttribute('x') || 0);
        const y = parseFloat(rect.getAttribute('y') || 0);
        const width = parseFloat(rect.getAttribute('width') || 0);
        const height = parseFloat(rect.getAttribute('height') || 0);
        
        position = {
          x: x + width / 2, // Use center coordinates
          y: y + height / 2
        };
      }
    }
    
    if (position) {
      nodePositions[mermaidId] = position;
    }
  });

  // Process subgraphs/clusters
  const clusterBounds = {};
  const svgClusterElements = svgElement.querySelectorAll('g.cluster');
  svgClusterElements.forEach(clusterEl => {
    const clusterSvgId = clusterEl.id;
    // Get subgraph title
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

  // Use spatial position and distance to assign nodes to subgraphs
  // You can consider analyzing the relative position between nodes and subgraphs to optimize assignment
  for (const nodeId in nodePositions) {
    const pos = nodePositions[nodeId];
    // Find all subgraphs containing this node
    const containingClusters = Object.entries(clusterBounds).filter(([clusterId, bounds]) =>
      pos.x >= bounds.x && pos.x <= bounds.right &&
      pos.y >= bounds.y && pos.y <= bounds.bottom
    );
    if (containingClusters.length > 0) {
      // Choose the smallest area (innermost)
      containingClusters.sort((a, b) => a[1].area - b[1].area);
      const clusterId = containingClusters[0][0];
      nodeClusterMap[nodeId] = clusterId;
      clusters[clusterId].nodes.push(nodeId);
      // Update node object
      for (const svgId in nodes) {
        if (nodes[svgId].mermaidId === nodeId) {
          nodes[svgId].clusterMermaidId = clusterId;
          break;
        }
      }
    }
  }

  // Process edge labels
  const edgeLabelsById = {};
  
  // Extract all edge labels
  svgElement.querySelectorAll('g.edgeLabel').forEach(labelEl => {
    const labelId = labelEl.id || "";
    let labelText = "";
    
    // Try multiple ways to get label text
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
    
    // If all above fail, get inner text directly
    if (!labelText && labelEl.textContent) {
      labelText = labelEl.textContent.trim();
    }
    
    if (labelId && labelText) {
      edgeLabelsById[labelId] = labelText;
    }
  });
  
  // Analyze the relationship between edges and labels by position
  const labelInfo = {};
  
  // Get label position information
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
          id: labelGroup.id || "",
          x: x,  // Add x coordinate for reference
          y: y   // Add y coordinate for reference
        };
        
        if (labelGroup.id) {
          edgeLabelsById[labelGroup.id] = text;
        }
      }
    }
  });
  
  // Process edges, find corresponding labels by ID and position
  const innerClusterEdges = {}; // Edges inside subgraph
  const interClusterEdges = []; // Edges between subgraphs
  const normalEdges = []; // Edges not in any subgraph
  
  svgElement.querySelectorAll('path.flowchart-link').forEach(path => {
    const pathId = path.id || "";
    if (!pathId) return;
    
    // Try to parse node relationship, suitable for common ID format like L_NodeA_NodeB
    let sourceNode = null;
    let targetNode = null;
    let sourceName = null;
    let targetName = null;
    
    if (pathId.startsWith("L_") || pathId.startsWith("FL_")) {
      const idPrefix = pathId.startsWith("L_") ? "L_" : "FL_";
      let remainingPathId = pathId.substring(idPrefix.length);
      
      let baseIdForSplit = remainingPathId;
      // Attempt to remove a trailing _<number> if it exists (edge index)
      const edgeIndexMatch = remainingPathId.match(/^(.*?)_(\d+)$/);
      if (edgeIndexMatch && edgeIndexMatch[1]) { // Ensure capture group 1 exists
          baseIdForSplit = edgeIndexMatch[1]; 
      }

      const idParts = baseIdForSplit.split('_');

      // Iterate through possible split points to find source and target
      // Handles cases like "node_part1_node_part2" splitting into "node_part1" and "node_part2"
      for (let i = 1; i < idParts.length; i++) {
        const potentialSourceName = idParts.slice(0, i).join('_');
        const potentialTargetName = idParts.slice(i).join('_');
        
        const foundSourceNode = Object.values(nodes).find(n => n.mermaidId === potentialSourceName);
        const foundTargetNode = Object.values(nodes).find(n => n.mermaidId === potentialTargetName);

        if (foundSourceNode && foundTargetNode) {
          sourceNode = foundSourceNode;
          targetNode = foundTargetNode;
          sourceName = potentialSourceName; // Used for label lookup
          targetName = potentialTargetName; // Used for label lookup
          break; // Found a valid pair
        }
      }
    }
    
    // If cannot parse by ID, try to infer by marker-end or path
    if (!sourceNode || !targetNode) {
      // You can add other heuristics here, but need more complex parsing
      // Temporarily skip edges that cannot be parsed
      return;
    }
    
    // Find the label for this edge
    let label = null;
    
    // 1. Get directly from ID mapping
    if (edgeLabelsById[pathId]) {
      label = edgeLabelsById[pathId];
    }
    // 2. Try other possible label ID formats
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
    
    // 3. Match by position
    if (!label) {
      const pathD = path.getAttribute('d') || "";
      const midPointMatch = pathD.match(/M[^C]+C[^,]+,[^,]+,([^,]+),([^,]+)/);
      let midX = null, midY = null;
      if (midPointMatch) {
        midX = parseFloat(midPointMatch[1]);
        midY = parseFloat(midPointMatch[2]);
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
        // Use a stricter threshold to avoid incorrect label assignment
        if (closestLabel && closestDist < 50) { // Reduced from 200 to 50
          label = closestLabel.text;
          // Mark this label as used to prevent it from being assigned to other edges
          delete labelInfo[`${closestLabel.x},${closestLabel.y}`];
        }
      }
    }
    
    // Helper function to properly escape labels for Mermaid
    function escapeLabelForMermaid(labelText) {
      if (!labelText) return "";
      
      // Check if label contains special characters that require quoting
      const needsQuotes = /[()[\]{}<>|&!@#$%^*+=~`"']/.test(labelText);
      
      if (needsQuotes) {
        // Escape any existing double quotes and wrap in double quotes
        return `"${labelText.replace(/"/g, '\\"')}"`;
      }
      
      return labelText;
    }
    
    // Build edge text with proper label escaping
    const escapedLabel = escapeLabelForMermaid(label);
    const labelPart = escapedLabel ? `|${escapedLabel}|` : "";
    const edgeText = `${sourceNode.mermaidId} -->${labelPart} ${targetNode.mermaidId}`;
    
    // Determine edge type: inside subgraph, between subgraphs, or normal edge
    const sourceCluster = nodeClusterMap[sourceNode.mermaidId];
    const targetCluster = nodeClusterMap[targetNode.mermaidId];
    
    if (sourceCluster && targetCluster && sourceCluster === targetCluster) {
      // Edge inside subgraph
      if (!innerClusterEdges[sourceCluster]) {
        innerClusterEdges[sourceCluster] = [];
      }
      innerClusterEdges[sourceCluster].push(`    ${edgeText}`);
      
      // Also save edge to the corresponding subgraph's edges set
      if (clusters[sourceCluster]) {
        clusters[sourceCluster].edges.push(`    ${edgeText}`);
      }
    } else if (sourceCluster || targetCluster) {
      // Edge between subgraphs or between subgraph and external node
      interClusterEdges.push(`    ${edgeText}`);
    } else {
      // Normal edge (not in any subgraph)
      normalEdges.push(`    ${edgeText}`);
    }
  });
  
  // Build Mermaid output
  
  // 1. Output all node definitions first
  for (const svgId in nodes) {
    const node = nodes[svgId];
    if (!mermaidCode.includes(`${node.mermaidId}["`)) {
      mermaidCode += `${node.mermaidId}["${node.text}"]\n`;
    }
  }
  
  // 2. Output normal edges and edges between subgraphs
  if (normalEdges.length > 0) {
    mermaidCode += "\n" + normalEdges.join('\n') + '\n';
  }
  
  if (interClusterEdges.length > 0) {
    mermaidCode += "\n" + interClusterEdges.join('\n') + '\n';
  }
  
  // 3. Output subgraph structure and its internal edges
  for (const clusterMermaidId in clusters) {
    const cluster = clusters[clusterMermaidId];
    
    // Output even if subgraph has no nodes
    mermaidCode += `subgraph ${clusterMermaidId} ["${cluster.title}"]\n`;
    
    // Output nodes in subgraph
    for (const nodeId of cluster.nodes) {
      const node = Object.values(nodes).find(n => n.mermaidId === nodeId);
      if (node) {
        mermaidCode += `    ${nodeId}\n`;
      }
    }
    
    // Output internal edges of subgraph
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
    
    // Get key attributes
    const markerEndAttr = path.getAttribute('marker-end') || "";
    const markerStartAttr = path.getAttribute('marker-start') || "";
    const pathClass = path.getAttribute('class') || "";
    
    // Determine line style: solid or dashed
    const isDashed = path.classList.contains('dashed-line') || 
                     path.classList.contains('dotted-line') || 
                     pathClass.includes('dashed') || 
                     pathClass.includes('dotted');
    const lineStyle = isDashed ? ".." : "--";
    
    let relationshipType = "";
    
    // Inheritance relation: <|-- (handle both marker-start and marker-end cases)
    if (markerStartAttr.includes('extensionStart') || markerStartAttr.includes('inheritance')) { 
        // Correctly represent inheritance relation: arrow from subclass to superclass
        relationshipType = `${fromClass} <|${lineStyle} ${toClass}`;
    } 
    else if (markerEndAttr.includes('extensionEnd') || markerEndAttr.includes('inheritance')) { 
        // Correctly represent inheritance relation: arrow from subclass to superclass
        relationshipType = `${fromClass} <|${lineStyle} ${toClass}`;
    }
    // Implementation relation: ..|>
    else if (markerStartAttr.includes('lollipopStart') || markerStartAttr.includes('implementStart')) {
        relationshipType = `${fromClass} ..|> ${toClass}`;
    }
    else if (markerEndAttr.includes('implementEnd') || markerEndAttr.includes('lollipopEnd') || 
             (markerEndAttr.includes('interfaceEnd') && isDashed)) {
        relationshipType = `${fromClass} ..|> ${toClass}`;
    }
    // Composition relation: *--
    else if (markerStartAttr.includes('compositionStart')) {
        relationshipType = `${toClass} *${lineStyle} ${fromClass}`;
    }
    else if (markerEndAttr.includes('compositionEnd') || 
             markerEndAttr.includes('diamondEnd') && markerEndAttr.includes('filled')) { 
        relationshipType = `${fromClass} *${lineStyle} ${toClass}`;
    } 
    // Aggregation relation: o--
    else if (markerStartAttr.includes('aggregationStart')) {
        relationshipType = `${toClass} o${lineStyle} ${fromClass}`;
    }
    else if (markerEndAttr.includes('aggregationEnd') || 
             markerEndAttr.includes('diamondEnd') && !markerEndAttr.includes('filled')) { 
        relationshipType = `${fromClass} o${lineStyle} ${toClass}`;
    } 
    // Dependency relation: ..>
    else if (markerStartAttr.includes('dependencyStart') && isDashed) {
        relationshipType = `${toClass} <.. ${fromClass}`;
    }
    else if ((markerEndAttr.includes('dependencyEnd') || markerEndAttr.includes('openEnd')) && isDashed) { 
        relationshipType = `${fromClass} ..> ${toClass}`;
    }
    // Association relation: -->
    else if (markerStartAttr.includes('arrowStart') || markerStartAttr.includes('openStart')) {
        relationshipType = `${toClass} <${lineStyle} ${fromClass}`;
    }
    else if (markerEndAttr.includes('arrowEnd') || markerEndAttr.includes('openEnd')) { 
        relationshipType = `${fromClass} ${lineStyle}> ${toClass}`;
    }
    // Arrowless solid line link: --
    else if (lineStyle === "--" && !markerEndAttr.includes('End') && !markerStartAttr.includes('Start')) { 
        relationshipType = `${fromClass} -- ${toClass}`;
    }
    // Arrowless dashed line link: ..
    else if (lineStyle === ".." && !markerEndAttr.includes('End') && !markerStartAttr.includes('Start')) {
        relationshipType = `${fromClass} .. ${toClass}`;
    }
    // Default relation
    else {
        relationshipType = `${fromClass} ${lineStyle} ${toClass}`;
    }
    
    // Get relationship label text
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
 * Helper: Convert SVG Sequence Diagram to Mermaid code
 * @param {SVGElement} svgElement - The SVG DOM element for the sequence diagram
 * @returns {string|null}
 */
function convertSequenceDiagramSvgToMermaidText(svgElement) {
    if (!svgElement) return null;

    // 1. Parse participants (only use <text.actor-box>, keep original text and quotes)
    const participants = [];
    svgElement.querySelectorAll('g[id^="root-"] > text.actor-box').forEach((textEl) => {
        const name = textEl.textContent.trim();
        const x = parseFloat(textEl.getAttribute('x'));
        if (name && !isNaN(x)) {
            participants.push({ name, x });
        }
    });
    participants.sort((a, b) => a.x - b.x);
    const participantNames = participants.map(p => p.name);

    // Participant vertical line y range
    const actorRanges = participants.map(p => {
        let line = null;
        svgElement.querySelectorAll('line.actor-line').forEach(l => {
            const lx = parseFloat(l.getAttribute('x1'));
            if (Math.abs(lx - p.x) < 2) line = l;
        });
        let y1 = 0, y2 = 99999;
        if (line) {
            y1 = parseFloat(line.getAttribute('y1'));
            y2 = parseFloat(line.getAttribute('y2'));
        }
        return { name: p.name, x: p.x, y1, y2 };
    });

    // 2. Parse loop range
    let loops = [];
    let loopRects = [];
    svgElement.querySelectorAll('.loopLine').forEach(line => {
        const x1 = parseFloat(line.getAttribute('x1'));
        const y1 = parseFloat(line.getAttribute('y1'));
        const x2 = parseFloat(line.getAttribute('x2'));
        const y2 = parseFloat(line.getAttribute('y2'));
        if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
            loopRects.push({x1, y1, x2, y2});
        }
    });
    if (loopRects.length === 4) {
        const xs = loopRects.map(r => [r.x1, r.x2]).flat();
        const ys = loopRects.map(r => [r.y1, r.y2]).flat();
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        let loopLabel = '';
        let loopText = '';
        const labelText = svgElement.querySelector('.labelText');
        if (labelText) loopLabel = labelText.textContent.trim();
        const loopTextEl = svgElement.querySelector('.loopText');
        if (loopTextEl) loopText = loopTextEl.textContent.trim();
        loops.push({xMin, xMax, yMin, yMax, label: loopLabel, text: loopText});
    }

    // 3. Parse activation range
    const activations = [];
    svgElement.querySelectorAll('rect[class^="activation"]').forEach(rect => {
        const x = parseFloat(rect.getAttribute('x'));
        const y = parseFloat(rect.getAttribute('y'));
        const width = parseFloat(rect.getAttribute('width'));
        const height = parseFloat(rect.getAttribute('height'));
        if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
            activations.push({
                x: x + width/2,
                yStart: y,
                yEnd: y + height
            });
        }
    });

    // 4. Collect all message lines and texts in DOM order
    let messageLines = [];
    let messageTexts = [];
    const allNodes = Array.from(svgElement.querySelectorAll('*'));
    allNodes.forEach(el => {
        if (el.matches('line[class^="messageLine"], path[class^="messageLine"]')) {
            // Parse from/to
            let x1, y1, x2, y2, y;
            if (el.tagName === 'line') {
                x1 = parseFloat(el.getAttribute('x1'));
                y1 = parseFloat(el.getAttribute('y1'));
                x2 = parseFloat(el.getAttribute('x2'));
                y2 = parseFloat(el.getAttribute('y2'));
            } else if (el.tagName === 'path') {
                const d = el.getAttribute('d');
                const m = d.match(/M\s*([\d.]+),([\d.]+)[^A-Za-z]+([\d.]+),([\d.]+)/);
                if (m) {
                    x1 = parseFloat(m[1]); y1 = parseFloat(m[2]);
                    x2 = parseFloat(m[3]); y2 = parseFloat(m[4]);
                } else {
                    x1 = x2 = y1 = y2 = NaN;
                }
            }
            y = (y1 + y2) / 2;
            // Self-message enhancement judgment
            if ((!fromActor || !toActor)) {
                // 1. x1/x2 nearest principle, relax threshold
                let minSelf = Infinity, selfActor = null;
                actorRanges.forEach(a => {
                    const dist = Math.abs(a.x - x1);
                    if (dist < minSelf) { minSelf = dist; selfActor = a.name; }
                });
                if (minSelf < 50) {
                    fromActor = toActor = selfActor;
                } else {
                    // 2. y range overlap principle
                    actorRanges.forEach(a => {
                        if (y >= a.y1 && y <= a.y2) {
                            fromActor = toActor = a.name;
                        }
                    });
                }
            }
            messageLines.push({from: fromActor, to: toActor, y, arrow: (el.getAttribute('class')||"").includes('messageLine1') ? '-->>' : '->>', lineEl: el});
        } else if (el.matches('text.messageText')) {
            messageTexts.push(el.textContent.trim());
        }
    });

    // 5. Strict one-to-one pairing
    for (let i = 0; i < messageLines.length; i++) {
        messageLines[i].text = messageTexts[i] || '';
    }

    // 5.5 Fallback for self-message context
    for (let i = 0; i < messageLines.length; i++) {
        let msg = messageLines[i];
        if (!msg.from || !msg.to) {
            // Previous message
            if (i > 0 && messageLines[i-1].to && messageLines[i-1].to === messageLines[i-1].from) {
                msg.from = msg.to = messageLines[i-1].to;
            }
            // Next message
            else if (i < messageLines.length-1 && messageLines[i+1].from && messageLines[i+1].from === messageLines[i+1].to) {
                msg.from = msg.to = messageLines[i+1].from;
            }
            // Still not, just use previous to or next from
            else if (i > 0 && messageLines[i-1].to) {
                msg.from = msg.to = messageLines[i-1].to;
            } else if (i < messageLines.length-1 && messageLines[i+1].from) {
                msg.from = msg.to = messageLines[i+1].from;
            }
        }
    }

    // 6. Merge all events (message, loop, activation)
    let events = messageLines.map(m => ({type: 'message', y: m.y, data: m}));
    loops.forEach(loop => {
        events.push({type: 'loop_start', y: loop.yMin - 0.1, data: loop});
        events.push({type: 'loop_end', y: loop.yMax + 0.1, data: loop});
    });
    activations.forEach(act => {
        events.push({type: 'activate', y: act.yStart - 0.05, data: act});
        events.push({type: 'deactivate', y: act.yEnd + 0.05, data: act});
    });
    events.sort((a, b) => a.y - b.y);

    // 7. Generate Mermaid
    let mermaidOutput = "sequenceDiagram\n";
    participants.forEach(p => {
        mermaidOutput += `  participant ${p.name}\n`;
    });
    mermaidOutput += "\n";

    let loopStack = [];
    let activationStack = [];
    events.forEach(event => {
        if (event.type === 'loop_start') {
            const text = event.data.text ? ` ${event.data.text}` : '';
            mermaidOutput += `  loop${text}\n`;
            loopStack.push(event.data);
        } else if (event.type === 'loop_end') {
            if (loopStack.length > 0) {
                mermaidOutput += `  end\n`;
                loopStack.pop();
            }
        } else if (event.type === 'activate') {
            let minDist = Infinity, actor = null;
            participants.forEach(p => {
                const dist = Math.abs(p.x - event.data.x);
                if (dist < minDist) { minDist = dist; actor = p.name; }
            });
            if (actor) {
                mermaidOutput += `  activate ${actor}\n`;
                activationStack.push(actor);
            }
        } else if (event.type === 'deactivate') {
            if (activationStack.length > 0) {
                const actor = activationStack.pop();
                mermaidOutput += `  deactivate ${actor}\n`;
            }
        } else if (event.type === 'message') {
            let indent = '';
            if (loopStack.length > 0) indent = '  ';
            const m = event.data;
            mermaidOutput += `${indent}  ${m.from}${m.arrow}${m.to}: ${m.text}\n`;
        }
    });
    while (loopStack.length > 0) { mermaidOutput += `  end\n`; loopStack.pop(); }
    while (activationStack.length > 0) { mermaidOutput += `  deactivate ${activationStack.pop()}\n`; }

    if (participants.length === 0 && events.length === 0) return null;
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
        // Determine if it is a source-related ul
        const isSourceList = (
          (element.previousElementSibling && /source/i.test(element.previousElementSibling.textContent)) ||
          (element.parentElement && /source/i.test(element.parentElement.textContent)) ||
          element.classList.contains('source-list')
        );
        element.querySelectorAll(":scope > li").forEach((li) => {
          let liTxt = "";
          li.childNodes.forEach((c) => { try { liTxt += processNode(c); } catch (e) { console.error("Error processing child of LI:", c, e); liTxt += "[err]";}});
          if (isSourceList) {
            liTxt = liTxt.trim().replace(/\n+/g, ' '); // Merge source-related li into one line
          } else {
            liTxt = liTxt.trim().replace(/\n\n$/, "").replace(/^\n\n/, "");
          }
          if (liTxt) list += `* ${liTxt}\n`;
        });
        resultMd = list + (list ? "\n" : "");
        break;
      }
      case "OL": {
        let list = "";
        let i = 1;
        // Determine if it is a source-related ol
        const isSourceList = (
          (element.previousElementSibling && /source/i.test(element.previousElementSibling.textContent)) ||
          (element.parentElement && /source/i.test(element.parentElement.textContent)) ||
          element.classList.contains('source-list')
        );
        element.querySelectorAll(":scope > li").forEach((li) => {
          let liTxt = "";
          li.childNodes.forEach((c) => { try { liTxt += processNode(c); } catch (e) { console.error("Error processing child of LI:", c, e); liTxt += "[err]";}});
          if (isSourceList) {
            liTxt = liTxt.trim().replace(/\n+/g, ' ');
          } else {
            liTxt = liTxt.trim().replace(/\n\n$/, "").replace(/^\n\n/, "");
          }
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
        let initialTextFromNodes = ""; // Collect raw text from children first
        element.childNodes.forEach(c => { 
          try { 
            initialTextFromNodes += processNode(c); 
          } catch (e) { 
            console.error("Error processing child of A:", c, e); 
            initialTextFromNodes += "[err]";
          }
        });
        let text = initialTextFromNodes.trim(); // This is the base text for further processing

        if (!text && element.querySelector('img')) { // Handle img alt text if link content is empty
            text = element.querySelector('img').alt || 'image';
        }
        // `text` is now the initial display text, possibly from content or image alt.
        // `initialTextFromNodes` keeps the original structure for context like "Sources: [...]".

        if (href && (href.startsWith('http') || href.startsWith('https') || href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:'))) {
          
          let finalLinkDisplayText = text; // Start with the current text, may be overwritten by line logic

          const lineInfoMatch = href.match(/#L(\d+)(?:-L(\d+))?$/);

          if (lineInfoMatch) {
            const pathPart = href.substring(0, href.indexOf('#'));
            let filenameFromPath = pathPart.substring(pathPart.lastIndexOf('/') + 1) || "link"; // Default filename

            const startLine = lineInfoMatch[1];
            const endLine = lineInfoMatch[2]; // This is the number after -L, or undefined

            let displayFilename = filenameFromPath; // Start with filename from path

            const trimmedInitialText = initialTextFromNodes.trim(); // Trim for reliable prefix/suffix checks
            let textToParseForFilename = trimmedInitialText; 

            const isSourcesContext = trimmedInitialText.startsWith("Sources: [") && trimmedInitialText.endsWith("]");

            if (isSourcesContext) {
                const sourcesContentMatch = trimmedInitialText.match(/^Sources:\s+\[(.*)\]$/);
                if (sourcesContentMatch && sourcesContentMatch[1]) {
                    textToParseForFilename = sourcesContentMatch[1].trim(); // Content inside "Sources: [...]"
                }
            }

            // Extract filename hint from (potentially sources-stripped) textToParseForFilename
            // This regex targets the first part that looks like a filename.
            const filenameHintMatch = textToParseForFilename.match(/^[\w\/\.-]+(?:\.\w+)?/);
            if (filenameHintMatch && filenameHintMatch[0]) { // Use filenameHintMatch[0] for the matched string
                // Verify this extracted filename by checking if it's part of the href's path
                if (pathPart.includes(filenameHintMatch[0])) {
                    displayFilename = filenameHintMatch[0];
                }
            }
            
            let lineRefText;
            if (endLine && endLine !== startLine) { // Range like L10-L20
              lineRefText = `L${startLine}-L${endLine}`;
            } else { // Single line like L10, or L10-L10 treated as L10
              lineRefText = `L${startLine}`;
            }

            let constructedText = `${displayFilename} ${lineRefText}`;

            if (isSourcesContext) {
              finalLinkDisplayText = `Sources: [${constructedText}]`;
            } else {
              // If not a "Sources:" link, use the newly constructed clean text
              finalLinkDisplayText = constructedText;
            }
          }
          
          // Fallback: if finalLinkDisplayText is empty (e.g. original text was empty and no lineInfoMatch)
          // or if it became empty after processing, use href.
          text = finalLinkDisplayText.trim() || (href ? href : ""); // Ensure text is not empty if href exists
          
          resultMd = `[${text}](${href})`;
          if (window.getComputedStyle(element).display !== "inline") {
              resultMd += "\n\n";
          }
        } else { 
          // Non-http/s/... link, or no href. Fallback text if empty.
          text = text.trim() || (href ? href : ""); 
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