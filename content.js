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
  console.log("Found flowchart nodes:", nodeElements.length); // DEBUG
  nodeElements.forEach(nodeEl => {
    const svgId = nodeEl.id;
    console.log("Processing node:", svgId); // DEBUG
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
    
    // Try more fallback selectors for newer mermaid versions
    if (!textContent.trim()) {
        const nodeLabel = nodeEl.querySelector('.nodeLabel, .label, foreignObject span, foreignObject div');
        if (nodeLabel && nodeLabel.textContent) {
            textContent = nodeLabel.textContent.trim().replace(/"/g, '#quot;');
        }
    }
    
    if (!textContent.trim()) { // Further fallback to <text> elements
      const textElement = nodeEl.querySelector('text, .label text');
      if (textElement && textElement.textContent) {
        textContent = textElement.textContent.trim().replace(/"/g, '#quot;');
      }
    }
    
    console.log("Node text content:", textContent); // DEBUG
    
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
  console.log("Flowchart conversion completed. Total nodes:", Object.keys(nodes).length, "Total clusters:", Object.keys(clusters).length); // DEBUG
  console.log("Generated mermaid code:", mermaidCode.substring(0, 200) + "..."); // DEBUG
  return '```mermaid\n' + mermaidCode.trim() + '\n```';
}

// Function for Class Diagram (ensure this exists from previous responses)
function convertClassDiagramSvgToMermaidText(svgElement) {
  if (!svgElement) return null;
  const mermaidLines = ['classDiagram'];
  const classData = {}; 

  // 1. Parse Classes and their geometric information
  svgElement.querySelectorAll('g.node.default[id^="classId-"]').forEach(node => {
    const classIdSvg = node.getAttribute('id'); 
    if (!classIdSvg) return;
    
    const classNameMatch = classIdSvg.match(/^classId-([^-]+(?:-[^-]+)*)-(\d+)$/);
    if (!classNameMatch) return;
    const className = classNameMatch[1];

    let cx = 0, cy = 0, halfWidth = 0, halfHeight = 0;
    const transform = node.getAttribute('transform');
    if (transform) {
      const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
      if (match) {
        cx = parseFloat(match[1]);
        cy = parseFloat(match[2]);
      }
    }
    const pathForBounds = node.querySelector('g.basic.label-container > path[d^="M-"]');
    if (pathForBounds) {
      const d = pathForBounds.getAttribute('d');
      const dMatch = d.match(/M-([0-9.]+)\s+-([0-9.]+)/); // Extracts W and H from M-W -H
      if (dMatch && dMatch.length >= 3) {
        halfWidth = parseFloat(dMatch[1]);
        halfHeight = parseFloat(dMatch[2]);
      }
    }

    if (!classData[className]) {
        classData[className] = { 
            stereotype: "", 
            members: [], 
            methods: [], 
            svgId: classIdSvg, 
            x: cx, 
            y: cy, 
            width: halfWidth * 2, 
            height: halfHeight * 2 
        };
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

  // 2. Parse Notes
  const notes = [];
  
  // Method 1: Find traditional rect.note and text.noteText
  svgElement.querySelectorAll('g').forEach(g => {
    const noteRect = g.querySelector('rect.note');
    const noteText = g.querySelector('text.noteText');
    
    if (noteRect && noteText) {
      const text = noteText.textContent.trim();
      const x = parseFloat(noteRect.getAttribute('x'));
      const y = parseFloat(noteRect.getAttribute('y'));
      const width = parseFloat(noteRect.getAttribute('width'));
      const height = parseFloat(noteRect.getAttribute('height'));
      
      if (text && !isNaN(x) && !isNaN(y)) {
        notes.push({
          text: text,
          x: x,
          y: y,
          width: width || 0,
          height: height || 0,
          id: g.id || `note_${notes.length}`
        });
      }
    }
  });
  
  // Method 2: Find other note formats (like node undefined type)
  svgElement.querySelectorAll('g.node.undefined, g[id^="note"]').forEach(g => {
    // Check if it's a note (by background color, id or other features)
    const hasNoteBackground = g.querySelector('path[fill="#fff5ad"], path[style*="#fff5ad"], path[style*="fill:#fff5ad"]');
    const isNoteId = g.id && g.id.includes('note');
    
    if (hasNoteBackground || isNoteId) {
      // Try to get text from foreignObject
      let text = '';
      const foreignObject = g.querySelector('foreignObject');
      if (foreignObject) {
        const textEl = foreignObject.querySelector('p, span.nodeLabel, .nodeLabel');
        if (textEl) {
          text = textEl.textContent.trim();
        }
      }
      
      // If no text found, try other selectors
      if (!text) {
        const textEl = g.querySelector('text, .label text, tspan');
        if (textEl) {
          text = textEl.textContent.trim();
        }
      }
      
      if (text) {
        // Get position information
        const transform = g.getAttribute('transform');
        let x = 0, y = 0;
        if (transform) {
          const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
          if (match) {
            x = parseFloat(match[1]);
            y = parseFloat(match[2]);
          }
        }
        
        // Check if this note has already been added
        const existingNote = notes.find(n => n.text === text && Math.abs(n.x - x) < 10 && Math.abs(n.y - y) < 10);
        if (!existingNote) {
          notes.push({
            text: text,
            x: x,
            y: y,
            width: 0,
            height: 0,
            id: g.id || `note_${notes.length}`
          });
        }
      }
    }
  });

  // 3. Parse Note-to-Class Connections
  const noteTargets = {}; // Maps note.id to target className
  const connectionThreshold = 50; // Increase connection threshold

  // Find note connection paths, support multiple path types
  const noteConnections = [
    ...svgElement.querySelectorAll('path.relation.edge-pattern-dotted'),
    ...svgElement.querySelectorAll('path[id^="edgeNote"]'),
    ...svgElement.querySelectorAll('path.edge-thickness-normal.edge-pattern-dotted')
  ];
  
  noteConnections.forEach(pathEl => {
    const dAttr = pathEl.getAttribute('d');
    if (!dAttr) return;

    // Improved path parsing, support Bezier curves
    const pathPoints = [];
    
    // Parse various path commands
    const commands = dAttr.match(/[A-Za-z][^A-Za-z]*/g) || [];
    let currentX = 0, currentY = 0;
    
    commands.forEach(cmd => {
      const parts = cmd.match(/[A-Za-z]|[-+]?\d*\.?\d+/g) || [];
      const type = parts[0];
      const coords = parts.slice(1).map(Number);
      
      switch(type.toUpperCase()) {
        case 'M': // Move to
          if (coords.length >= 2) {
            currentX = coords[0];
            currentY = coords[1];
            pathPoints.push({x: currentX, y: currentY});
          }
          break;
        case 'L': // Line to
          for (let i = 0; i < coords.length; i += 2) {
            if (coords[i+1] !== undefined) {
              currentX = coords[i];
              currentY = coords[i+1];
              pathPoints.push({x: currentX, y: currentY});
            }
          }
          break;
        case 'C': // Cubic bezier
          for (let i = 0; i < coords.length; i += 6) {
            if (coords[i+5] !== undefined) {
              // Get end point coordinates
              currentX = coords[i+4];
              currentY = coords[i+5];
              pathPoints.push({x: currentX, y: currentY});
            }
          }
          break;
        case 'Q': // Quadratic bezier
          for (let i = 0; i < coords.length; i += 4) {
            if (coords[i+3] !== undefined) {
              currentX = coords[i+2];
              currentY = coords[i+3];
              pathPoints.push({x: currentX, y: currentY});
            }
          }
          break;
      }
    });

    if (pathPoints.length < 2) return;
    
    const pathStart = pathPoints[0];
    const pathEnd = pathPoints[pathPoints.length - 1];

    // Find the closest note to path start point
    let closestNote = null;
    let minDistToNote = Infinity;
    notes.forEach(note => {
      const dist = Math.sqrt(Math.pow(note.x - pathStart.x, 2) + Math.pow(note.y - pathStart.y, 2));
      if (dist < minDistToNote) {
        minDistToNote = dist;
        closestNote = note;
      }
    });

    // Find the closest class to path end point
    let targetClassName = null;
    let minDistToClass = Infinity;
    for (const currentClassName in classData) {
      const classInfo = classData[currentClassName];
      const classCenterX = classInfo.x;
      const classCenterY = classInfo.y;
      const classWidth = classInfo.width || 200; // Default width
      const classHeight = classInfo.height || 200; // Default height

      // Calculate distance from path end to class center
      const distToCenter = Math.sqrt(
        Math.pow(pathEnd.x - classCenterX, 2) + 
        Math.pow(pathEnd.y - classCenterY, 2)
      );

      // Also calculate distance to class boundary
      const classLeft = classCenterX - classWidth/2;
      const classRight = classCenterX + classWidth/2;
      const classTop = classCenterY - classHeight/2;
      const classBottom = classCenterY + classHeight/2;
      
      const dx = Math.max(classLeft - pathEnd.x, 0, pathEnd.x - classRight);
      const dy = Math.max(classTop - pathEnd.y, 0, pathEnd.y - classBottom);
      const distToEdge = Math.sqrt(dx*dx + dy*dy);

      // Use the smaller distance as the judgment criterion
      const finalDist = Math.min(distToCenter, distToEdge + classWidth/4);
      
      if (finalDist < minDistToClass) {
        minDistToClass = finalDist;
        targetClassName = currentClassName;
      }
    }
    
    // Relax connection conditions
    if (closestNote && targetClassName && 
        minDistToNote < connectionThreshold && 
        minDistToClass < connectionThreshold * 2) {
      
      const existing = noteTargets[closestNote.id];
      const currentScore = minDistToNote + minDistToClass;
      
      if (!existing || currentScore < existing.score) {
        noteTargets[closestNote.id] = { 
          name: targetClassName, 
          score: currentScore,
          noteDistance: minDistToNote,
          classDistance: minDistToClass
        };
      }
    }
  });

  // 4. Add Note Definitions to Mermaid output
  const noteMermaidLines = [];
  notes.forEach(note => {
    const targetInfo = noteTargets[note.id];
    if (targetInfo && targetInfo.name) {
      noteMermaidLines.push(`    note for ${targetInfo.name} "${note.text}"`);
    } else {
      noteMermaidLines.push(`    note "${note.text}"`);
    }
  });
  // Insert notes after 'classDiagram' line
  if (noteMermaidLines.length > 0) {
    mermaidLines.splice(1, 0, ...noteMermaidLines);
  }
  
  // 5. Add Class Definitions
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
    
    // Inheritance relation: <|-- or --|> (corrected inheritance relationship judgment)
    if (markerStartAttr.includes('extensionStart')) { 
        // marker-start has extension, arrow at start point, means: toClass inherits fromClass
        if (isDashed) {
            // Dashed inheritance (implementation relationship): fromClass <|.. toClass
            relationshipType = `${fromClass} <|.. ${toClass}`;
        } else {
            // Solid inheritance: fromClass <|-- toClass
            relationshipType = `${fromClass} <|${lineStyle} ${toClass}`;
        }
    } 
    else if (markerEndAttr.includes('extensionEnd')) { 
        // marker-end has extension, arrow at end point, means: fromClass inherits toClass
        if (isDashed) {
            // Dashed inheritance (implementation relationship): toClass <|.. fromClass
            relationshipType = `${toClass} <|.. ${fromClass}`;
        } else {
            // Solid inheritance: toClass <|-- fromClass
            relationshipType = `${toClass} <|${lineStyle} ${fromClass}`;
        }
    }
    // Implementation relation: ..|> (corrected implementation relationship judgment)
    else if (markerStartAttr.includes('lollipopStart') || markerStartAttr.includes('implementStart')) {
        relationshipType = `${toClass} ..|> ${fromClass}`;
    }
    else if (markerEndAttr.includes('implementEnd') || markerEndAttr.includes('lollipopEnd') || 
             (markerEndAttr.includes('interfaceEnd') && isDashed)) {
        relationshipType = `${fromClass} ..|> ${toClass}`;
    }
    // Composition relation: *-- (corrected composition relationship judgment)
    else if (markerStartAttr.includes('compositionStart')) {
        // marker-start has composition, diamond at start point, means: fromClass *-- toClass
        relationshipType = `${fromClass} *${lineStyle} ${toClass}`;
    }
    else if (markerEndAttr.includes('compositionEnd') || 
             markerEndAttr.includes('diamondEnd') && markerEndAttr.includes('filled')) { 
        relationshipType = `${toClass} *${lineStyle} ${fromClass}`;
    } 
    // Aggregation relation: o-- (corrected aggregation relationship judgment)
    else if (markerStartAttr.includes('aggregationStart')) {
        // marker-start has aggregation, empty diamond at start point, means: toClass --o fromClass
        relationshipType = `${toClass} ${lineStyle}o ${fromClass}`;
    }
    else if (markerEndAttr.includes('aggregationEnd') || 
             markerEndAttr.includes('diamondEnd') && !markerEndAttr.includes('filled')) { 
        relationshipType = `${fromClass} o${lineStyle} ${toClass}`;
    } 
    // Dependency relation: ..> or --> (corrected dependency relationship judgment)
    else if (markerStartAttr.includes('dependencyStart')) {
        if (isDashed) {
            relationshipType = `${toClass} <.. ${fromClass}`;
        } else {
            relationshipType = `${toClass} <-- ${fromClass}`;
        }
    }
    else if (markerEndAttr.includes('dependencyEnd')) { 
        if (isDashed) {
            relationshipType = `${fromClass} ..> ${toClass}`;
        } else {
            relationshipType = `${fromClass} --> ${toClass}`;
        }
    }
    // Association relation: --> (corrected association relationship judgment)
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

  if (mermaidLines.length <= 1 && Object.keys(classData).length === 0 && notes.length === 0) return null;
  return '```mermaid\n' + mermaidLines.join('\n') + '\n```';
}

/**
 * Helper: Convert SVG Sequence Diagram to Mermaid code
 * @param {SVGElement} svgElement - The SVG DOM element for the sequence diagram
 * @returns {string|null}
 */
function convertSequenceDiagramSvgToMermaidText(svgElement) {
    if (!svgElement) return null;

    // 1. Parse participants 
    const participants = [];
    console.log("Looking for sequence participants..."); // DEBUG
    
    // Find all participant text elements
    svgElement.querySelectorAll('text.actor-box').forEach((textEl) => {
        const name = textEl.textContent.trim().replace(/^"|"$/g, ''); // Remove quotes
        const x = parseFloat(textEl.getAttribute('x'));
        console.log("Found participant:", name, "at x:", x); // DEBUG
        if (name && !isNaN(x)) {
            participants.push({ name, x });
        }
    });
    
    console.log("Total participants found:", participants.length); // DEBUG
    participants.sort((a, b) => a.x - b.x);
    
    // Remove duplicate participants
    const uniqueParticipants = [];
    const seenNames = new Set();
    participants.forEach(p => {
        if (!seenNames.has(p.name)) {
            uniqueParticipants.push(p);
            seenNames.add(p.name);
        }
    });

    // 2. Parse Notes
    const notes = [];
    svgElement.querySelectorAll('g').forEach(g => {
        const noteRect = g.querySelector('rect.note');
        const noteText = g.querySelector('text.noteText');
        
        if (noteRect && noteText) {
            const text = noteText.textContent.trim();
            const x = parseFloat(noteRect.getAttribute('x'));
            const width = parseFloat(noteRect.getAttribute('width'));
            const leftX = x;
            const rightX = x + width;
            
            // Find all participants within note coverage range
            const coveredParticipants = [];
            uniqueParticipants.forEach(p => {
                // Check if participant is within note's horizontal range
                if (p.x >= leftX && p.x <= rightX) {
                    coveredParticipants.push(p);
                }
            });
            
            // Sort by x coordinate
            coveredParticipants.sort((a, b) => a.x - b.x);
            
            if (coveredParticipants.length > 0) {
                let noteTarget;
                if (coveredParticipants.length === 1) {
                    // Single participant
                    noteTarget = coveredParticipants[0].name;
                } else {
                    // Multiple participants, use first and last
                    const firstParticipant = coveredParticipants[0].name;
                    const lastParticipant = coveredParticipants[coveredParticipants.length - 1].name;
                    noteTarget = `${firstParticipant},${lastParticipant}`;
                }
                
                notes.push({
                    text: text,
                    target: noteTarget,
                    y: parseFloat(noteRect.getAttribute('y'))
                });
            }
        }
    });
    
    // 3. Parse message lines and message text
    const messages = [];
    
    // Collect all message texts
    const messageTexts = [];
    svgElement.querySelectorAll('text.messageText').forEach(textEl => {
        const text = textEl.textContent.trim();
        const y = parseFloat(textEl.getAttribute('y'));
        const x = parseFloat(textEl.getAttribute('x'));
        if (text && !isNaN(y)) {
            messageTexts.push({ text, y, x });
        }
    });
    messageTexts.sort((a, b) => a.y - b.y);
    console.log("Found message texts:", messageTexts.length); // DEBUG
    
    // Collect all message lines
    const messageLines = [];
    svgElement.querySelectorAll('line.messageLine0, line.messageLine1').forEach(lineEl => {
        const x1 = parseFloat(lineEl.getAttribute('x1'));
        const y1 = parseFloat(lineEl.getAttribute('y1'));
        const x2 = parseFloat(lineEl.getAttribute('x2'));
        const y2 = parseFloat(lineEl.getAttribute('y2'));
        const isDashed = lineEl.classList.contains('messageLine1');
        
        if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
            messageLines.push({ x1, y1, x2, y2, isDashed });
        }
    });
    
    // Collect all curved message paths (self messages)
    svgElement.querySelectorAll('path.messageLine0, path.messageLine1').forEach(pathEl => {
        const d = pathEl.getAttribute('d');
        const isDashed = pathEl.classList.contains('messageLine1');
        
        if (d) {
            // Parse path, check if it's a self message
            const moveMatch = d.match(/M\s*([^,\s]+)[,\s]+([^,\s]+)/);
            const endMatch = d.match(/([^,\s]+)[,\s]+([^,\s]+)$/);
            
            if (moveMatch && endMatch) {
                const x1 = parseFloat(moveMatch[1]);
                const y1 = parseFloat(moveMatch[2]);
                const x2 = parseFloat(endMatch[1]);
                const y2 = parseFloat(endMatch[2]);
                
                // Check if it's a self message (start and end x coordinates are close)
                if (Math.abs(x1 - x2) < 20) { // Allow some margin of error
                    messageLines.push({ 
                        x1, y1, x2, y2, isDashed, 
                        isSelfMessage: true 
                    });
                }
            }
        }
    });
    
    messageLines.sort((a, b) => a.y1 - b.y1);
    console.log("Found message lines:", messageLines.length); // DEBUG
    
    // 4. Match message lines and message text
    for (let i = 0; i < Math.min(messageLines.length, messageTexts.length); i++) {
        const line = messageLines[i];
        const messageText = messageTexts[i];
        
        let fromParticipant = null;
        let toParticipant = null;
        
        if (line.isSelfMessage) {
            // Self message - find participant closest to x1
            let minDist = Infinity;
            for (const p of uniqueParticipants) {
                const dist = Math.abs(p.x - line.x1);
                if (dist < minDist) {
                    minDist = dist;
                    fromParticipant = toParticipant = p.name;
                }
            }
        } else {
            // Find sender and receiver based on x coordinates
            let minDist1 = Infinity;
            for (const p of uniqueParticipants) {
                const dist = Math.abs(p.x - line.x1);
                if (dist < minDist1) {
                    minDist1 = dist;
                    fromParticipant = p.name;
                }
            }
            
            let minDist2 = Infinity;
            for (const p of uniqueParticipants) {
                const dist = Math.abs(p.x - line.x2);
                if (dist < minDist2) {
                    minDist2 = dist;
                    toParticipant = p.name;
                }
            }
        }
        
        if (fromParticipant && toParticipant) {
            // Determine arrow type
            let arrow;
            if (line.isDashed) {
                arrow = '-->>'; // Dashed arrow
            } else {
                arrow = '->>'; // Solid arrow
            }
            
            messages.push({
                from: fromParticipant,
                to: toParticipant,
                text: messageText.text,
                arrow: arrow,
                y: line.y1,
                isSelfMessage: line.isSelfMessage || false
            });
            
            console.log(`Message ${i + 1}: ${fromParticipant} ${arrow} ${toParticipant}: ${messageText.text}`); // DEBUG
        }
    }

    // 5. Parse loop areas
    const loops = [];
    const loopLines = svgElement.querySelectorAll('line.loopLine');
    if (loopLines.length >= 4) {
        const xs = Array.from(loopLines).map(line => [
            parseFloat(line.getAttribute('x1')),
            parseFloat(line.getAttribute('x2'))
        ]).flat();
        const ys = Array.from(loopLines).map(line => [
            parseFloat(line.getAttribute('y1')),
            parseFloat(line.getAttribute('y2'))
        ]).flat();
        
        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);
        
        let loopText = '';
        const loopTextEl = svgElement.querySelector('.loopText');
        if (loopTextEl) {
            loopText = loopTextEl.textContent.trim();
        }
        
        loops.push({ xMin, xMax, yMin, yMax, text: loopText });
        console.log("Found loop:", loopText, "from y", yMin, "to", yMax); // DEBUG
    }

    // 6. Generate Mermaid code
    let mermaidOutput = "sequenceDiagram\n";
    
    // Add participants
    uniqueParticipants.forEach(p => {
        mermaidOutput += `  participant ${p.name}\n`;
    });
    mermaidOutput += "\n";

    // Sort all events by y coordinate (messages, notes, loops)
    const events = [];
    
    messages.forEach(msg => {
        events.push({ type: 'message', y: msg.y, data: msg });
    });
    
    notes.forEach(note => {
        events.push({ type: 'note', y: note.y, data: note });
    });
    
    loops.forEach(loop => {
        events.push({ type: 'loop_start', y: loop.yMin - 1, data: loop });
        events.push({ type: 'loop_end', y: loop.yMax + 1, data: loop });
    });
    
    events.sort((a, b) => a.y - b.y);
    
    // Generate events
    let loopStack = [];
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
        } else if (event.type === 'note') {
            const indent = loopStack.length > 0 ? '  ' : '';
            mermaidOutput += `${indent}  note over ${event.data.target}: ${event.data.text}\n`;
        } else if (event.type === 'message') {
            const indent = loopStack.length > 0 ? '  ' : '';
            const msg = event.data;
            mermaidOutput += `${indent}  ${msg.from}${msg.arrow}${msg.to}: ${msg.text}\n`;
        }
    });
    
    // Close remaining loops
    while (loopStack.length > 0) {
        mermaidOutput += `  end\n`;
        loopStack.pop();
    }

    if (uniqueParticipants.length === 0 && messages.length === 0) return null;
    console.log("Sequence diagram conversion completed. Participants:", uniqueParticipants.length, "Messages:", messages.length, "Notes:", notes.length); // DEBUG
    console.log("Generated sequence mermaid code:", mermaidOutput.substring(0, 200) + "..."); // DEBUG
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

          console.log("Found SVG in PRE: desc=", diagramTypeDesc, "class=", diagramClass); // DEBUG
          if (diagramTypeDesc && diagramTypeDesc.includes('flowchart')) {
            console.log("Trying to convert flowchart..."); // DEBUG
            mermaidOutput = convertFlowchartSvgToMermaidText(svgElement);
          } else if (diagramTypeDesc && diagramTypeDesc.includes('class')) {
            console.log("Trying to convert class diagram..."); // DEBUG
            mermaidOutput = convertClassDiagramSvgToMermaidText(svgElement);
          } else if (diagramTypeDesc && diagramTypeDesc.includes('sequence')) {
            console.log("Trying to convert sequence diagram..."); // DEBUG
            mermaidOutput = convertSequenceDiagramSvgToMermaidText(svgElement);
          } else if (diagramClass && diagramClass.includes('flowchart')) {
              console.log("Trying to convert flowchart by class..."); // DEBUG
              mermaidOutput = convertFlowchartSvgToMermaidText(svgElement);
          } else if (diagramClass && (diagramClass.includes('classDiagram') || diagramClass.includes('class'))) {
              console.log("Trying to convert class diagram by class..."); // DEBUG
              mermaidOutput = convertClassDiagramSvgToMermaidText(svgElement);
          } else if (diagramClass && (diagramClass.includes('sequenceDiagram') || diagramClass.includes('sequence'))) {
              console.log("Trying to convert sequence diagram by class..."); // DEBUG
              mermaidOutput = convertSequenceDiagramSvgToMermaidText(svgElement);
          }
          
          if (mermaidOutput) {
            console.log("Successfully converted SVG to mermaid:", mermaidOutput.substring(0, 100) + "..."); // DEBUG
          } else {
            console.log("Failed to convert SVG, using fallback"); // DEBUG
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
          // Auto-detect language if still not found
          if (!lang && txt.trim()) {
            lang = detectCodeLanguage(txt);
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

// Function to auto-detect programming language from code content
function detectCodeLanguage(codeText) {
  if (!codeText || codeText.trim().length < 10) return '';
  
  const code = codeText.trim();
  const firstLine = code.split('\n')[0].trim();
  const lines = code.split('\n');
  
  // JavaScript/TypeScript patterns
  if (code.includes('function ') || code.includes('const ') || code.includes('let ') || 
      code.includes('var ') || code.includes('=>') || code.includes('console.log') ||
      code.includes('require(') || code.includes('import ') || code.includes('export ')) {
    if (code.includes(': ') && (code.includes('interface ') || code.includes('type ') || 
        code.includes('enum ') || code.includes('implements '))) {
      return 'typescript';
    }
    return 'javascript';
  }
  
  // Python patterns
  if (code.includes('def ') || code.includes('import ') || code.includes('from ') ||
      code.includes('print(') || code.includes('if __name__') || code.includes('class ') ||
      firstLine.startsWith('#!') && firstLine.includes('python')) {
    return 'python';
  }
  
  // Java patterns
  if (code.includes('public class ') || code.includes('private ') || code.includes('public static void main') ||
      code.includes('System.out.println') || code.includes('import java.')) {
    return 'java';
  }
  
  // C# patterns
  if (code.includes('using System') || code.includes('namespace ') || code.includes('public class ') ||
      code.includes('Console.WriteLine') || code.includes('[Attribute]')) {
    return 'csharp';
  }
  
  // C/C++ patterns
  if (code.includes('#include') || code.includes('int main') || code.includes('printf(') ||
      code.includes('cout <<') || code.includes('std::')) {
    return code.includes('std::') || code.includes('cout') ? 'cpp' : 'c';
  }
  
  // Go patterns
  if (code.includes('package ') || code.includes('func ') || code.includes('import (') ||
      code.includes('fmt.Printf') || code.includes('go ')) {
    return 'go';
  }
  
  // Rust patterns
  if (code.includes('fn ') || code.includes('let mut') || code.includes('println!') ||
      code.includes('use std::') || code.includes('impl ')) {
    return 'rust';
  }
  
  // PHP patterns
  if (code.includes('<?php') || code.includes('$') && (code.includes('echo ') || code.includes('print '))) {
    return 'php';
  }
  
  // Ruby patterns
  if (code.includes('def ') && (code.includes('end') || code.includes('puts ') || code.includes('require '))) {
    return 'ruby';
  }
  
  // Shell/Bash patterns
  if (firstLine.startsWith('#!') && (firstLine.includes('bash') || firstLine.includes('sh')) ||
      code.includes('#!/bin/') || code.includes('echo ') && code.includes('$')) {
    return 'bash';
  }
  
  // SQL patterns
  if (code.match(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i)) {
    return 'sql';
  }
  
  // CSS patterns
  if (code.includes('{') && code.includes('}') && code.includes(':') && 
      (code.includes('color:') || code.includes('margin:') || code.includes('padding:') || code.includes('#'))) {
    return 'css';
  }
  
  // HTML patterns
  if (code.includes('<') && code.includes('>') && 
      (code.includes('<!DOCTYPE') || code.includes('<html') || code.includes('<div') || code.includes('<p'))) {
    return 'html';
  }
  
  // XML patterns
  if (code.includes('<?xml') || (code.includes('<') && code.includes('>') && code.includes('</'))) {
    return 'xml';
  }
  
  // JSON patterns
  if (code.startsWith('{') && code.endsWith('}') || code.startsWith('[') && code.endsWith(']')) {
    try {
      JSON.parse(code);
      return 'json';
    } catch (e) {
      // Not valid JSON
    }
  }
  
  // YAML patterns
  if (lines.some(line => line.match(/^\s*\w+:\s*/) && !line.includes('{') && !line.includes(';'))) {
    return 'yaml';
  }
  
  // Markdown patterns
  if (code.includes('# ') || code.includes('## ') || code.includes('```') || code.includes('[') && code.includes('](')) {
    return 'markdown';
  }
  
  // Docker patterns
  if (firstLine.startsWith('FROM ') || code.includes('RUN ') || code.includes('COPY ') || code.includes('WORKDIR ')) {
    return 'dockerfile';
  }
  
  // Default fallback
  return '';
}