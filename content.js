; (function () {
  // Version guard: supports re-injection after extension reload without page refresh
  var __v = (window.__deepwikiVersion || 0) + 1;
  window.__deepwikiVersion = __v;

  // Debug flag to control verbose logging (set to false in production)
  const DEBUG_MODE = false; // Hardcoded to true for debugging, or set to false for production

  // Security check: Only allow local file access in debug mode or for test pages
  // For Devin.ai, we want to be permissive to ensure it runs
  const ALLOW_SCRIPT_EXECUTION = (function () {
    const currentUrl = window.location.href;
    const isLocalFile = currentUrl.startsWith('file://');

    if (!isLocalFile) {
      // Always allow on non-local files (e.g., https://deepwiki.com, devin.ai)
      return true;
    }

    // Check if it's a test page
    const isTestPage = currentUrl.includes('test-page.html') || currentUrl.includes('/test/');

    if (isTestPage) {
      return true;
    }

    // For other local files, only allow in debug mode
    if (DEBUG_MODE) {
      console.log('DeepWiki to Markdown: Running in DEBUG mode on local file');
      return true;
    }

    // Block execution on other local files in production mode
    console.info('DeepWiki to Markdown: Skipping local file (not a test page). Set DEBUG_MODE=true to enable.');
    return false;
  })();

  // Early exit if script execution is not allowed.
  // Intentionally no ping handler here: background must detect this instance
  // as non-functional so it can trigger re-injection or proper error handling.
  if (!ALLOW_SCRIPT_EXECUTION) return;

  // START OF EXTENSION LOGIC
  console.log("DeepWiki Content Script: Loaded and running on", window.location.href);

  // VISUAL DEBUGGING: Red border removed
  if (DEBUG_MODE) {
    console.log("DeepWiki Content Script: Debug mode enabled.");
  }

  // Notify background script IMMEDIATELY that we are ready to receive messages.
  // This prevents race conditions where background queues messages but we haven't signalled readiness yet.
  try {
    chrome.runtime.sendMessage({ action: "contentScriptReady" });
    if (DEBUG_MODE) console.log("DeepWiki Content Script: Sent contentScriptReady signal");
  } catch (e) {
    if (DEBUG_MODE) console.error("DeepWiki Content Script: Failed to send ready signal", e);
  }

  // Backup: Send ready signal again on window load to ensure background gets it
  window.addEventListener('load', () => {
    chrome.runtime.sendMessage({ action: "contentScriptReady" });
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Version guard: ignore messages if a newer version of the script is active
    if (window.__deepwikiVersion !== __v) return false;

    // Ping handler for connectivity checks
    if (request.action === "ping") {
      sendResponse({ pong: true });
      return false;
    }

    if (request.action === "convertToMarkdown") {
      const MAX_RETRIES = 20;
      const RETRY_INTERVAL = 500;

      const attemptConversion = async (attempt = 0) => {
        try {
          // Get page title from head
          const headTitle = document.title || "";
          const formattedHeadTitle = headTitle.replace(/[\/|]/g, '-').replace(/\s+/g, '-').replace('---', '-');

          // Get article title
          const title =
            document.querySelector('.container > div:nth-child(1) a[data-selected="true"]')?.textContent?.trim() ||
            document.querySelector(".container > div:nth-child(1) h1")?.textContent?.trim() ||
            document.querySelector("h1")?.textContent?.trim() ||
            "Untitled";

          // Get article content container
          let contentContainer;
          if (window.location.hostname.includes('devin.ai')) {
            // Devin-specific selector (verified via debugging)
            contentContainer =
              document.querySelector('.prose-main') ||
              document.querySelector('.prose') ||
              document.querySelector('article') ||
              document.querySelector('main');
          } else {
            contentContainer =
              document.querySelector(".container > div:nth-child(2) .prose") ||
              document.querySelector(".container > div:nth-child(2) .prose-custom") ||
              document.querySelector(".container > div:nth-child(2)") ||
              document.body;
          }

          // Check if content is truly ready (heuristic: not empty, or specific loading state)
          // For Devin, contentContainer might exist but be empty during loading
          if (!contentContainer || contentContainer.innerText.trim().length < 50) { // Arbitrary threshold
            if (attempt < MAX_RETRIES) {
              if (DEBUG_MODE) console.log(`Content not ready (attempt ${attempt + 1}), retrying...`);
              setTimeout(() => attemptConversion(attempt + 1), RETRY_INTERVAL);
              return;
            } else {
              if (DEBUG_MODE) console.warn("Content extraction failed after retries, proceeding with what we have.");
            }
          }

          let markdown = ``;
          let markdownTitle = title.replace(/\s+/g, '-');
          let assets = [];

          if (contentContainer) {
            const collection = await collectDiagramAssets(contentContainer, markdownTitle);
            assets = collection.assets;
            currentSvgPathMap = collection.svgPathMap;
            try {
              contentContainer.childNodes.forEach((child) => {
                markdown += processNode(child);
              });
            } finally {
              currentSvgPathMap = null;
            }
          }

          markdown = markdown.trim().replace(/\n{3,}/g, "\n\n");

          sendResponse({
            success: true,
            markdown,
            markdownTitle,
            headTitle: formattedHeadTitle,
            assets
          });
        } catch (error) {
          console.error("Error converting to Markdown:", error);
          sendResponse({ success: false, error: error.message });
        }
      };

      attemptConversion();
      return true; // Indicates async response
    } else if (request.action === "extractAllPages") {
      // 2026-02-16 Fix: Ensure sendResponse is ALWAYS called to prevent timeout
      // 2026-02-16 Fix: Wrap in setTimeout to force true async execution
      // This prevents "channel closed" or "timeout" errors when return true is used.
      setTimeout(() => {
        try {
          if (DEBUG_MODE) console.log("Devin: extractAllPages request received.");

          // Get the head title
          const headTitle = document.title || "";
          // Format head title: replace slashes and pipes with dashes
          const formattedHeadTitle = headTitle.replace(/[\/|]/g, '-').replace(/\s+/g, '-').replace('---', '-');

          // Get the base part of the current document path
          // Use href (full URL) to ensure hash links (#item) are resolved relative to the current page path, not just the root domain.
          const baseUrl = window.location.href;

          const hostname = window.location.hostname;
          let sidebarLinks = [];

          if (hostname.includes('devin.ai')) {
            const pathParts = window.location.pathname.split('/');
            if (DEBUG_MODE) console.log('Devin: Detecting sidebar links using helper logic...');

            const navButtons = getDevinSidebarButtons();

            if (navButtons.length > 0) {
              const counters = navButtons.map((btn, index) => {
                const rect = btn.getBoundingClientRect();
                return {
                  text: btn.getAttribute('aria-label').trim(),
                  left: rect.left,
                  element: btn,
                  index: index
                };
              });

              // Calculate indentation baseline
              const minLeft = Math.min(...counters.map(c => c.left));
              const INDENT_THRESHOLD = 8;
              let hierarchyStack = [0];

              // Determine Base URL for Wiki
              const wikiIndex = pathParts.indexOf('wiki');
              let wikiBaseUrl = window.location.origin;

              if (wikiIndex !== -1 && pathParts[wikiIndex + 2]) {
                const basePath = pathParts.slice(0, wikiIndex + 3).join('/');
                wikiBaseUrl += basePath;
              }

              sidebarLinks = counters.map((item) => {
                const offset = item.left - minLeft;
                const level = offset < INDENT_THRESHOLD ? 0 : 1;

                if (level > hierarchyStack.length - 1) {
                  hierarchyStack.push(1);
                } else if (level < hierarchyStack.length - 1) {
                  while (hierarchyStack.length - 1 > level) {
                    hierarchyStack.pop();
                  }
                  hierarchyStack[level]++;
                } else {
                  hierarchyStack[level]++;
                }

                const prefix = hierarchyStack.join('.');
                const fullUrl = `${wikiBaseUrl}#${prefix}`;

                return {
                  getAttribute: (attr) => (attr === 'href' ? fullUrl : null),
                  textContent: item.text,
                  href: fullUrl,
                  text: item.text,
                  hierarchicalTitle: `${prefix} ${item.text}`,
                  isDevinButton: true,
                  buttonIndex: item.index
                };
              });

              if (DEBUG_MODE) {
                console.log(`Devin: Synthesized links found: ${sidebarLinks.length}`);
              }
            } else {
              if (DEBUG_MODE) console.log("Devin: No matching sidebar buttons found.");
            }
          } else {
            sidebarLinks = Array.from(document.querySelectorAll('.border-r-border ul li a'));
          }

          // Generic fallback - DISABLED FOR DEVIN to prevent "Back" link navigation
          if (sidebarLinks.length === 0 && !hostname.includes('devin.ai')) {
            sidebarLinks = Array.from(document.querySelectorAll('nav a, aside a'));
          }

          // Extract link URLs and titles
          let pages = sidebarLinks.map(link => {
            return {
              url: new URL(link.getAttribute('href'), baseUrl).href,
              // Use hierarchical title (1.1 Title) if available, otherwise fallback to text content
              title: link.hierarchicalTitle || link.textContent.trim(),
              selected: link.getAttribute('data-selected') === 'true',
              isDevinButton: link.isDevinButton === true,
              buttonText: link.text,
              buttonIndex: link.buttonIndex
            };
          });

          // Filter out pages that strictly don't belong to the current project.
          // The prefix MUST be the project root, not the current pathname — otherwise
          // starting batch from a sub-page (e.g. /microsoft/vscode/1-overview) would
          // filter out every sibling page in the sidebar.
          let filterPrefix = window.location.origin + window.location.pathname;

          if (hostname.includes('devin.ai')) {
            // Devin wiki base: /org/[org]/wiki/[user]/[project]
            const pathParts = window.location.pathname.split('/');
            const wikiIndex = pathParts.indexOf('wiki');
            if (wikiIndex !== -1 && pathParts[wikiIndex + 2]) {
              const basePath = pathParts.slice(0, wikiIndex + 3).join('/');
              filterPrefix = window.location.origin + basePath;
            }
          } else {
            // DeepWiki (and other generic wiki hosts): project root is /{org}/{repo}.
            const pathParts = window.location.pathname.split('/').filter(p => p.length > 0);
            if (pathParts.length >= 2) {
              filterPrefix = `${window.location.origin}/${pathParts[0]}/${pathParts[1]}`;
            }
          }

          pages = pages.filter(page => page.url.startsWith(filterPrefix));

          if (DEBUG_MODE) {
            console.log(`Extracted ${pages.length} valid pages (Prefix: ${filterPrefix}):`, pages);
          }

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

          // Extract "Last indexed" date
          let lastIndexedDate = '';
          // Search for all p elements and find the one containing "Last indexed"
          const allParagraphs = document.querySelectorAll('p');
          for (const p of allParagraphs) {
            const text = p.textContent;
            if (text.includes('Last indexed:')) {
              const dateMatch = text.match(/Last indexed:\s*(\d{4}-\d{2}-\d{2})/);
              if (dateMatch) {
                lastIndexedDate = dateMatch[1].replace(/-/g, ''); // Format: 20251106
                break;
              }
            }
          }

          sendResponse({
            success: true,
            pages: pages,
            currentTitle: currentPageTitle,
            baseUrl: baseUrl,
            headTitle: formattedHeadTitle,
            lastIndexedDate: lastIndexedDate
          });
        } catch (error) {
          console.error("Error extracting page links:", error);
          sendResponse({ success: false, error: error.message || 'Unknown error during extraction' });
        }
      }, 0);
    } else if (request.action === "pageLoaded") {
      // Page loading complete, batch operation preparation can be handled here
      // No sendResponse needed, as this is a notification from background.js
      if (DEBUG_MODE) console.log("Page loaded:", window.location.href);
      // Always send a response, even if empty, to avoid connection errors
      sendResponse({ received: true });
    } else if (request.action === "tabActivated") {
      // Tab has been activated, possibly after being in bfcache
      if (DEBUG_MODE) console.log("Tab activated:", window.location.href);
      // Acknowledge receipt of message to avoid connection errors
      sendResponse({ received: true });
    } else if (request.action === "clickDevinButton") {
      const targetText = request.buttonText;
      const targetIndex = request.buttonIndex; // Use index to disambiguate identical labels

      const navButtons = getDevinSidebarButtons();

      let buttonToClick = null;
      if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < navButtons.length) {
        buttonToClick = navButtons[targetIndex];
      } else {
        // Fallback to text matching if index is missing or out of bounds
        buttonToClick = navButtons.find(
          btn => btn.getAttribute('aria-label').trim() === targetText
        );
      }

      if (buttonToClick) {
        if (DEBUG_MODE) console.log(`Devin: Clicking button for '${targetText}' (Index: ${targetIndex})`);

        // If the button is already selected, we are already on the target page.
        // Skip the click and the 15-second polling delay to speed up extraction.
        if (buttonToClick.getAttribute('data-selected') === 'true') {
          if (DEBUG_MODE) console.log(`Devin: Already on page '${targetText}'. Skipping click.`);
          setTimeout(() => {
            chrome.runtime.sendMessage({ action: "contentScriptReady" });
          }, 100);
          sendResponse({ success: true });
          return false;
        }

        const oldUrl = window.location.href;
        let urlChanged = false;

        buttonToClick.click();

        // Clear any existing orphaned interval
        if (window._devinCheckInterval) {
          clearInterval(window._devinCheckInterval);
        }

        // Polling to detect when SPA has finished rendering the new page
        let attempts = 0;
        window._devinCheckInterval = setInterval(() => {
          attempts++;
          if (!urlChanged && window.location.href !== oldUrl) {
            urlChanged = true;
          }

          // We consider the page ready if URL changed AND we find a visible header that matches targetText, 
          // OR if the button itself now has data-selected="true" (faster & more reliable),
          // OR if enough time has passed (fallback 15s)

          let readinessConfirmed = false;

          // 1. Check if the newly clicked button state changed to selected
          if (buttonToClick && buttonToClick.getAttribute('data-selected') === 'true') {
            readinessConfirmed = true;
          }

          // 2. Fallback check for title element matching (DeepWiki + Devin)
          if (!readinessConfirmed) {
            const titleEl =
              document.querySelector('.container > div:nth-child(1) a[data-selected="true"]') ||
              document.querySelector('.container > div:nth-child(1) h1') ||
              document.querySelector('.prose-main h1') ||
              document.querySelector('.prose h1') ||
              document.querySelector('article h1') ||
              document.querySelector('h1');
            const currentTitle = titleEl ? titleEl.textContent.trim() : '';
            if (currentTitle === targetText || currentTitle.endsWith(targetText)) {
              readinessConfirmed = true;
            }
          }

          if (readinessConfirmed || attempts > 50) {
            clearInterval(window._devinCheckInterval);
            window._devinCheckInterval = null;
            if (DEBUG_MODE) console.log(`Devin: Content ready for '${targetText}'. URL changed: ${urlChanged}. Attempts: ${attempts}`);

            // Add a small breather for final react renders
            setTimeout(() => {
              chrome.runtime.sendMessage({ action: "contentScriptReady" });
            }, 500);
          }
        }, 300);

        sendResponse({ success: true });
      } else {
        if (DEBUG_MODE) console.error(`Devin: Button for '${targetText}' not found`);
        sendResponse({ success: false, error: 'Button not found' });
      }
      return false; // Synced response
    }

    // Only return true for asynchronous actions that will call sendResponse later.
    // Note: convertToMarkdown already returns true inside its own if-block (line 146).
    if (request.action === "extractAllPages") {
      return true;
    }
    // For synchronous actions (like pageLoaded, tabActivated), we already called sendResponse above
    return false;
  });

  // Helper: Get strictly filtered Devin sidebar buttons for extraction and programmatic clicking
  function getDevinSidebarButtons() {
    const pathParts = window.location.pathname.split('/');
    const mainContent = document.querySelector('.prose-main') ||
      document.querySelector('.prose') ||
      document.querySelector('article') ||
      document.querySelector('main');

    const buttons = Array.from(document.querySelectorAll('button[aria-label]'));

    // Extract Org Name from URL for exclusion (e.g. /org/philip-zheng/ -> Philip Zheng)
    const orgIndex = pathParts.indexOf('org');
    let orgName = '';
    if (orgIndex !== -1 && pathParts[orgIndex + 1]) {
      orgName = pathParts[orgIndex + 1].replace(/-/g, ' ').toLowerCase();
    }

    // Security & Noise filters: Block potential destructive actions or generic UI elements
    const exactIgnoredLabels = ['Sessions', 'Ask', 'Wiki', 'Review', 'Settings', 'Back', 'Copy', 'Pin', 'Unpin', 'Delete', 'Remove', 'Archive', 'Reset', 'Clear', 'Sign out'];
    const partialIgnoredLabels = ['Close sidebar', 'Show more breadcrumbs', 'Add repo', 'New chat', 'Import repository', 'Create new', 'Copy code', 'Link copied!'];

    return buttons.filter(btn => {
      // 1. Layout checks: Must not be inside main content and must be on the left half of the screen
      if (mainContent && mainContent.contains(btn)) return false;
      const rect = btn.getBoundingClientRect();
      if (rect.left > window.innerWidth / 2) return false;

      // 2. Semantics check: Check aria-label
      const label = btn.getAttribute('aria-label');
      if (!label) return false;

      const text = label.trim();
      if (exactIgnoredLabels.includes(text)) return false;
      if (partialIgnoredLabels.some(ignored => text.includes(ignored))) return false;
      if (orgName && text.toLowerCase().includes(orgName)) return false;

      return true;
    });
  }

  // === Mermaid flowchart SVG → text conversion ===
  // Targets DeepWiki's mermaid v10+ flowchart-v2 output where:
  //   - nodes are <g class="node" id="flowchart-{name}-{index}">
  //   - edge paths are <path id="L_{source}_{target}_{index}">
  //   - edge labels link to paths via inner <g data-id="L_..."> (no geometric matching needed)
  //   - text lives in foreignObject > .nodeLabel/.edgeLabel > <p> with <br> for newlines

  // "flowchart-base-0" → "base"; "flowchart-my-node-3" → "my-node"
  function parseNodeId(svgId) {
    return svgId.replace(/^flowchart-/, '').replace(/-\d+$/, '');
  }

  // Split a "{source}_{target}" string, disambiguating with known node ids
  // when names themselves may contain underscores.
  function splitEdgeIdAtKnownNodes(stripped, knownNodeIds) {
    for (let i = 1; i < stripped.length; i++) {
      if (stripped[i] === '_') {
        const source = stripped.slice(0, i);
        const target = stripped.slice(i + 1);
        if (knownNodeIds.has(source) && knownNodeIds.has(target)) {
          return { source, target };
        }
      }
    }
    const idx = stripped.indexOf('_');
    if (idx > 0) {
      return { source: stripped.slice(0, idx), target: stripped.slice(idx + 1) };
    }
    return null;
  }

  // Flowchart edge id: "L_main_renderer_0"
  function parseEdgeId(edgeId, knownNodeIds) {
    const stripped = edgeId.replace(/^L_/, '').replace(/_\d+$/, '');
    return splitEdgeIdAtKnownNodes(stripped, knownNodeIds);
  }

  // Class diagram edge id: "id_IViewModel_ViewModel_1"
  function parseClassEdgeId(edgeId, knownNodeIds) {
    const stripped = edgeId.replace(/^id_/, '').replace(/_\d+$/, '');
    return splitEdgeIdAtKnownNodes(stripped, knownNodeIds);
  }

  // "classId-IViewModel-0" -> "IViewModel"
  function parseClassNodeId(svgId) {
    return svgId.replace(/^classId-/, '').replace(/-\d+$/, '');
  }

  // Extract label text from a node/edge .label foreignObject, preserving <br>.
  // Returns empty string if label is absent or empty.
  function extractMermaidLabelText(labelHostEl) {
    if (!labelHostEl) return '';
    const fo = labelHostEl.querySelector('foreignObject');
    const html = fo ? fo.innerHTML : labelHostEl.innerHTML;
    if (!html) return '';
    // Operate on innerHTML so behavior is consistent across SVG XHTML namespacing
    // (Chrome and jsdom handle querySelector('br') inside foreignObject differently).
    const BR_SENTINEL = '__MD_BR__';
    return html
      .replace(/<br\s*\/?>/gi, BR_SENTINEL)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ')
      .split(BR_SENTINEL)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .join('<br>');
  }

  // Escape characters that would break a mermaid `["..."]` node label.
  function escapeMermaidLabel(text) {
    return text
      .replace(/"/g, '#quot;')
      .replace(/\[/g, '#91;')
      .replace(/\]/g, '#93;');
  }

  // Escape characters problematic inside a quoted edge label `|"..."|`.
  // Only need to escape characters that close the quoted string or pipe delimiter.
  function escapeMermaidEdgeLabel(text) {
    return text
      .replace(/"/g, '#quot;')
      .replace(/\|/g, '#124;');
  }

  // Parse "translate(x, y)" or "translate(x y)" from an SVG transform attribute.
  function parseTranslate(transform) {
    if (!transform) return { x: 0, y: 0 };
    const m = transform.match(/translate\(\s*(-?[\d.]+)\s*[,\s]\s*(-?[\d.]+)\s*\)/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
  }

  // Parse cluster (subgraph) elements: id, label, bounding box from <rect>.
  // Replace any character outside [A-Za-z0-9_] with `_` so the result is a valid
  // mermaid identifier (subgraph/node ids choke on parens, dashes, dots, spaces).
  function sanitizeMermaidId(id) {
    if (!id) return '';
    const cleaned = String(id).replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_');
    return cleaned || 'cluster';
  }

  function parseClusters(svg) {
    const clusters = [];
    let fallbackCounter = 0;
    svg.querySelectorAll('g.cluster').forEach(el => {
      const rawId = el.getAttribute('id');
      if (!rawId) return;
      const rect = el.querySelector(':scope > rect') || el.querySelector('rect');
      if (!rect) return;
      const x = parseFloat(rect.getAttribute('x')) || 0;
      const y = parseFloat(rect.getAttribute('y')) || 0;
      const w = parseFloat(rect.getAttribute('width')) || 0;
      const h = parseFloat(rect.getAttribute('height')) || 0;
      const labelHost = el.querySelector('.cluster-label') || el.querySelector('.label');
      const label = extractMermaidLabelText(labelHost);
      let id = sanitizeMermaidId(rawId);
      if (id === 'cluster') id = `cluster_${fallbackCounter++}`;
      clusters.push({ id, rawId, label, x, y, w, h, area: w * h, parentId: null });
    });
    return clusters;
  }

  // For each cluster, find smallest strictly-larger cluster that fully contains its bbox.
  function buildClusterHierarchy(clusters) {
    for (const c of clusters) {
      let bestParent = null;
      for (const other of clusters) {
        if (other === c || other.area <= c.area) continue;
        const contains =
          other.x <= c.x &&
          other.y <= c.y &&
          other.x + other.w >= c.x + c.w &&
          other.y + other.h >= c.y + c.h;
        if (contains && (!bestParent || other.area < bestParent.area)) {
          bestParent = other;
        }
      }
      c.parentId = bestParent ? bestParent.id : null;
    }
  }

  // Find the smallest cluster whose bbox contains the node center.
  function findContainingCluster(node, clusters) {
    let best = null;
    for (const c of clusters) {
      if (
        c.x <= node.x && node.x <= c.x + c.w &&
        c.y <= node.y && node.y <= c.y + c.h
      ) {
        if (!best || c.area < best.area) best = c;
      }
    }
    return best;
  }

  function convertFlowchartSvgToMermaidText(svg) {
    // --- Parse nodes ---
    const nodeElements = svg.querySelectorAll('g.node[id^="flowchart-"]');
    if (nodeElements.length === 0) return '';

    const nodes = new Map(); // mermaid id -> { label, x, y, declOrder, clusterId }
    let order = 0;
    nodeElements.forEach(el => {
      const rawId = el.getAttribute('id');
      const id = parseNodeId(rawId);
      if (!id || nodes.has(id)) return;
      const { x, y } = parseTranslate(el.getAttribute('transform'));
      const labelHost = el.querySelector('.nodeLabel') || el.querySelector('.label');
      const label = extractMermaidLabelText(labelHost);
      nodes.set(id, { label, x, y, declOrder: order++, clusterId: null });
    });

    // --- Parse clusters and assign nodes to them ---
    const clusters = parseClusters(svg);
    buildClusterHierarchy(clusters);
    for (const [, node] of nodes) {
      const c = findContainingCluster(node, clusters);
      node.clusterId = c ? c.id : null;
    }

    // --- Infer direction from layout (use SVG viewBox; fall back to node spread) ---
    let direction = 'TD';
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(parseFloat);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        // Wide SVGs are typically rendered LR by mermaid; tall ones TD.
        direction = parts[2] > parts[3] * 1.5 ? 'LR' : 'TD';
      }
    } else {
      const xs = Array.from(nodes.values()).map(n => n.x);
      const ys = Array.from(nodes.values()).map(n => n.y);
      const xRange = Math.max(...xs) - Math.min(...xs);
      const yRange = Math.max(...ys) - Math.min(...ys);
      direction = xRange > yRange ? 'LR' : 'TD';
    }

    // --- Parse edge labels (keyed by path id via data-id) ---
    const edgeLabels = new Map();
    svg.querySelectorAll('g.edgeLabels g.edgeLabel').forEach(el => {
      const inner = el.querySelector('[data-id]');
      if (!inner) return;
      const dataId = inner.getAttribute('data-id');
      const text = extractMermaidLabelText(inner);
      if (text) edgeLabels.set(dataId, text);
    });

    // Detect mermaid edge style from the path's class list.
    // Returns 'dotted' | 'thick' | 'solid'. (Flowchart has no native dashed arrow;
    // edge-pattern-dashed maps to dotted as the closest visual match.)
    const getEdgeStyle = (path) => {
      const cls = path.getAttribute('class') || '';
      if (/edge-pattern-(dotted|dashed)/.test(cls)) return 'dotted';
      if (/edge-thickness-thick/.test(cls)) return 'thick';
      return 'solid';
    };

    // --- Parse edges ---
    const knownIds = new Set(nodes.keys());
    const edges = [];
    svg.querySelectorAll('g.edgePaths path[id^="L_"]').forEach(path => {
      const id = path.getAttribute('id');
      const parsed = parseEdgeId(id, knownIds);
      if (!parsed) return;
      const hasStart = !!path.getAttribute('marker-start');
      const hasEnd = !!path.getAttribute('marker-end');
      edges.push({
        source: parsed.source,
        target: parsed.target,
        label: edgeLabels.get(id) || '',
        bidirectional: hasStart && hasEnd,
        style: getEdgeStyle(path)
      });
    });

    // Self-loops are rendered as 3 path segments with ids "{node}-cyclic-special-{1|mid|2}".
    // The label sits on the -mid segment. Collapse each group into one self-loop edge.
    // Style is taken from any segment carrying a non-solid pattern.
    const cyclicGroups = new Map(); // nodeId -> style
    svg.querySelectorAll('g.edgePaths path[id*="cyclic-special"]').forEach(path => {
      const m = (path.getAttribute('id') || '').match(/^(.+)-cyclic-special-(?:1|2|mid)$/);
      if (!m) return;
      const nodeId = m[1];
      if (!knownIds.has(nodeId)) return;
      const style = getEdgeStyle(path);
      const prev = cyclicGroups.get(nodeId);
      // Prefer a non-solid style if any segment carries it.
      if (!prev || (prev === 'solid' && style !== 'solid')) {
        cyclicGroups.set(nodeId, style);
      }
    });
    for (const [nodeId, style] of cyclicGroups) {
      edges.push({
        source: nodeId,
        target: nodeId,
        label: edgeLabels.get(`${nodeId}-cyclic-special-mid`) || '',
        bidirectional: false,
        style
      });
    }

    if (DEBUG_MODE) {
      console.log(`Flowchart: ${nodes.size} nodes, ${edges.length} edges, ${clusters.length} clusters, direction=${direction}`);
    }

    // --- Build mermaid text ---
    const renderNode = (n, indent) => {
      if (n.label) return `${indent}${n.id}["${escapeMermaidLabel(n.label)}"]\n`;
      return `${indent}${n.id}\n`;
    };

    // Group nodes by clusterId for fast lookup
    const nodesByCluster = new Map(); // clusterId|null -> nodes[]
    for (const [id, info] of nodes) {
      const key = info.clusterId || '';
      if (!nodesByCluster.has(key)) nodesByCluster.set(key, []);
      nodesByCluster.get(key).push({ id, ...info });
    }
    const clustersByParent = new Map(); // parentId|null -> clusters[]
    for (const c of clusters) {
      const key = c.parentId || '';
      if (!clustersByParent.has(key)) clustersByParent.set(key, []);
      clustersByParent.get(key).push(c);
    }

    const renderCluster = (cluster, indent) => {
      const inner = indent + '    ';
      // Prefer DOM-extracted label; fall back to the raw (unsanitized) id so callers
      // don't lose info when the original id had to be rewritten (e.g., contained `()`).
      const display = cluster.label || cluster.rawId || '';
      const labelPart =
        display && display !== cluster.id
          ? ` ["${escapeMermaidLabel(display)}"]`
          : '';
      let s = `${indent}subgraph ${cluster.id}${labelPart}\n`;
      for (const n of (nodesByCluster.get(cluster.id) || [])) {
        s += renderNode(n, inner);
      }
      for (const child of (clustersByParent.get(cluster.id) || [])) {
        s += renderCluster(child, inner);
      }
      s += `${indent}end\n`;
      return s;
    };

    let out = `flowchart ${direction}\n`;
    // Top-level nodes (not in any cluster)
    for (const n of (nodesByCluster.get('') || [])) {
      out += renderNode(n, '    ');
    }
    // Top-level clusters
    for (const c of (clustersByParent.get('') || [])) {
      out += renderCluster(c, '    ');
    }
    // Edges (always at top level; mermaid handles cross-subgraph edges)
    const arrowFor = (style, bidir) => {
      if (style === 'dotted') return bidir ? '<-.->' : '-.->';
      if (style === 'thick')  return bidir ? '<==>'  : '==>';
      return bidir ? '<-->' : '-->';
    };
    for (const e of edges) {
      const arrow = arrowFor(e.style || 'solid', e.bidirectional);
      if (e.label) {
        // Wrap edge label in double quotes so parens / pipes / brackets in the label
        // don't get parsed as node-shape syntax (e.g., "show()" → mermaid "PS" error).
        out += `    ${e.source} ${arrow}|"${escapeMermaidEdgeLabel(e.label)}"| ${e.target}\n`;
      } else {
        out += `    ${e.source} ${arrow} ${e.target}\n`;
      }
    }
    return out;
  }

  // === Mermaid class diagram SVG -> text conversion ===

  // Extract a single-line text label (member or method) from a class node's .label group.
  // Normalizes mermaid's rendered ": :" sequence (e.g. "+foo() : : Type") back to ": ".
  function extractMermaidLineText(labelEl) {
    const text = extractMermaidLabelText(labelEl);
    return text
      .replace(/<br>/g, ' ')
      .replace(/\s*:\s*:\s*/g, ' : ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Extract { name, annotation, members[], methods[] } from a class node element.
  function extractClassNodeData(el) {
    const titleEl = el.querySelector('.label-group .label') || el.querySelector('.classTitle');
    const name = titleEl ? extractMermaidLabelText(titleEl) : '';

    let annotation = '';
    const annotationLabel = el.querySelector('.annotation-group .label');
    if (annotationLabel) {
      annotation = extractMermaidLabelText(annotationLabel)
        .replace(/^«/, '')   // strip leading guillemet
        .replace(/»$/, '')   // strip trailing guillemet
        .replace(/^<<|>>$/g, '')
        .trim();
    }

    const members = [];
    const membersGroup = el.querySelector('.members-group');
    if (membersGroup) {
      membersGroup.querySelectorAll(':scope > .label').forEach(memberEl => {
        const text = extractMermaidLineText(memberEl);
        if (text) members.push(text);
      });
    }

    const methods = [];
    const methodsGroup = el.querySelector('.methods-group');
    if (methodsGroup) {
      methodsGroup.querySelectorAll(':scope > .label').forEach(methodEl => {
        const text = extractMermaidLineText(methodEl);
        if (text) methods.push(text);
      });
    }

    return { name, annotation, members, methods };
  }

  // Determine the mermaid relationship arrow from a path's marker URLs and class.
  // Returns a string like "<|--", "*--", "<|..", or "--" (plain association).
  function inferClassRelation(path) {
    const start = path.getAttribute('marker-start') || '';
    const end = path.getAttribute('marker-end') || '';
    const cls = path.getAttribute('class') || '';
    const dashed = /(edge-pattern-dashed|edge-pattern-dotted|dashed-line|dotted-line)/.test(cls);

    const markerType = (url) => {
      const m = url.match(/class-(\w+?)(?:Start|End)\b/);
      return m ? m[1] : null;
    };

    const sourceHead = (type) => {
      switch (type) {
        case 'extension': return '<|';
        case 'composition': return '*';
        case 'aggregation': return 'o';
        case 'dependency': return '<';
        default: return '';
      }
    };
    const targetHead = (type) => {
      switch (type) {
        case 'extension': return '|>';
        case 'composition': return '*';
        case 'aggregation': return 'o';
        case 'dependency': return '>';
        default: return '';
      }
    };

    const left = sourceHead(markerType(start));
    const right = targetHead(markerType(end));
    const line = dashed ? '..' : '--';
    return `${left}${line}${right}`;
  }

  function convertClassDiagramSvgToMermaidText(svg) {
    const nodeElements = svg.querySelectorAll('g.node[id^="classId-"]');
    if (nodeElements.length === 0) return '';

    const nodes = new Map(); // class name -> { name, annotation, members[], methods[] }
    nodeElements.forEach(el => {
      const id = parseClassNodeId(el.getAttribute('id') || '');
      if (!id || nodes.has(id)) return;
      nodes.set(id, extractClassNodeData(el));
    });

    // Edge labels by data-id (same convention as flowchart)
    const edgeLabels = new Map();
    svg.querySelectorAll('g.edgeLabels g.edgeLabel').forEach(el => {
      const inner = el.querySelector('[data-id]');
      if (!inner) return;
      const dataId = inner.getAttribute('data-id');
      const text = extractMermaidLabelText(inner);
      if (text) edgeLabels.set(dataId, text);
    });

    const knownIds = new Set(nodes.keys());
    const edges = [];
    svg.querySelectorAll('g.edgePaths path[id^="id_"]').forEach(path => {
      const id = path.getAttribute('id');
      const parsed = parseClassEdgeId(id, knownIds);
      if (!parsed) return;
      edges.push({
        source: parsed.source,
        target: parsed.target,
        arrow: inferClassRelation(path),
        label: edgeLabels.get(id) || ''
      });
    });

    if (DEBUG_MODE) {
      console.log(`Class diagram: ${nodes.size} classes, ${edges.length} relations`);
    }

    let out = 'classDiagram\n';
    for (const [id, data] of nodes) {
      const className = data.name || id;
      const hasBody = data.annotation || data.members.length > 0 || data.methods.length > 0;
      if (!hasBody) {
        out += `    class ${className}\n`;
        continue;
      }
      out += `    class ${className} {\n`;
      if (data.annotation) out += `        <<${data.annotation}>>\n`;
      for (const m of data.members) out += `        ${m}\n`;
      for (const m of data.methods) out += `        ${m}\n`;
      out += `    }\n`;
    }
    // Edge ids strip suffixes like ".ts" from class names (mermaid sanitizes ids
    // for the edge id), but the display label keeps them. Resolve back to the
    // display name so `class Foo.ts` matches `Foo.ts --> Bar.ts`.
    const displayName = (id) => {
      const data = nodes.get(id);
      return (data && data.name) ? data.name : id;
    };
    for (const e of edges) {
      const arrow = e.arrow || '--';
      const src = displayName(e.source);
      const tgt = displayName(e.target);
      if (e.label) {
        out += `    ${src} ${arrow} ${tgt} : ${e.label}\n`;
      } else {
        out += `    ${src} ${arrow} ${tgt}\n`;
      }
    }
    return out;
  }

  // === Mermaid sequence diagram SVG -> text conversion ===

  // Read text content from a <text> element, preferring its first <tspan> if present.
  function readSvgText(textEl) {
    if (!textEl) return '';
    const tspan = textEl.querySelector('tspan');
    const raw = tspan ? tspan.textContent : textEl.textContent;
    return (raw || '').replace(/\s+/g, ' ').trim();
  }

  function convertSequenceDiagramSvgToMermaidText(svg) {
    // --- Parse actors (dedupe by `name` attribute; both top + bottom rects share it) ---
    const actorMap = new Map(); // name -> { name, label, xCenter, xLeft, xRight }
    svg.querySelectorAll('rect.actor').forEach(rect => {
      const name = rect.getAttribute('name');
      if (!name || actorMap.has(name)) return;
      const x = parseFloat(rect.getAttribute('x') || '0');
      const w = parseFloat(rect.getAttribute('width') || '0');
      const labelEl = rect.parentNode && rect.parentNode.querySelector('text.actor');
      const label = readSvgText(labelEl) || name;
      actorMap.set(name, { name, label, xLeft: x, xRight: x + w, xCenter: x + w / 2 });
    });
    if (actorMap.size === 0) return '';

    const actors = Array.from(actorMap.values()).sort((a, b) => a.xCenter - b.xCenter);

    const actorAtX = (x) => {
      let best = null, bestD = Infinity;
      for (const a of actors) {
        const d = Math.abs(a.xCenter - x);
        if (d < bestD) { bestD = d; best = a; }
      }
      return best;
    };

    const actorsInRange = (x1, x2) => {
      const lo = Math.min(x1, x2);
      const hi = Math.max(x1, x2);
      return actors.filter(a => a.xCenter >= lo - 1 && a.xCenter <= hi + 1);
    };

    // --- Collect events (notes + messages) tagged with Y for ordering ---
    const events = [];

    svg.querySelectorAll('rect.note').forEach(rect => {
      const x = parseFloat(rect.getAttribute('x') || '0');
      const w = parseFloat(rect.getAttribute('width') || '0');
      const y = parseFloat(rect.getAttribute('y') || '0');
      const textEl = rect.parentNode && rect.parentNode.querySelector('text.noteText');
      const text = readSvgText(textEl);
      if (!text) return;
      const covered = actorsInRange(x, x + w);
      events.push({ kind: 'note', y, text, actors: covered });
    });

    // Pair each message line with the message text closest above it (text.y < line.y).
    // Self-messages render as <path d="M x,y C ..."> (curved arrow back to same actor)
    // instead of a straight <line>; pick up both.
    const messageLines = [];
    svg.querySelectorAll('line.messageLine0, line.messageLine1, path.messageLine0, path.messageLine1').forEach(el => {
      const dashed = (el.getAttribute('class') || '').includes('messageLine1');
      if (el.tagName.toLowerCase() === 'line') {
        messageLines.push({
          x1: parseFloat(el.getAttribute('x1') || '0'),
          x2: parseFloat(el.getAttribute('x2') || '0'),
          y: parseFloat(el.getAttribute('y1') || '0'),
          dashed
        });
      } else {
        const d = el.getAttribute('d') || '';
        const m = d.match(/M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/);
        if (!m) return;
        const x = parseFloat(m[1]);
        messageLines.push({ x1: x, x2: x, y: parseFloat(m[2]), dashed });
      }
    });
    const messageTexts = [];
    svg.querySelectorAll('text.messageText').forEach(textEl => {
      const text = readSvgText(textEl);
      if (text) messageTexts.push({ y: parseFloat(textEl.getAttribute('y') || '0'), text });
    });
    messageLines.sort((a, b) => a.y - b.y);
    messageTexts.sort((a, b) => a.y - b.y);

    const usedTextIdx = new Set();
    messageLines.forEach(line => {
      let bestIdx = -1, bestDelta = Infinity;
      for (let i = 0; i < messageTexts.length; i++) {
        if (usedTextIdx.has(i)) continue;
        const delta = line.y - messageTexts[i].y;
        if (delta < 0) continue;
        if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
      }
      let text = '';
      if (bestIdx >= 0) {
        usedTextIdx.add(bestIdx);
        text = messageTexts[bestIdx].text;
      }
      const source = actorAtX(line.x1);
      const target = actorAtX(line.x2);
      if (!source || !target) return;
      events.push({
        kind: 'message',
        y: line.y,
        source: source.name,
        target: target.name,
        dashed: line.dashed,
        text
      });
    });

    events.sort((a, b) => a.y - b.y);

    if (DEBUG_MODE) {
      console.log(`Sequence: ${actors.length} actors, ${events.length} events`);
    }

    // --- Build mermaid text ---
    let out = 'sequenceDiagram\n';
    for (const a of actors) {
      if (a.label && a.label !== a.name) {
        out += `    participant ${a.name} as ${a.label}\n`;
      } else {
        out += `    participant ${a.name}\n`;
      }
    }
    for (const e of events) {
      if (e.kind === 'note') {
        if (e.actors.length === 0) continue;
        // Mermaid `Note over` only accepts 1 or 2 actors; for wider notes
        // (phase headers spanning the whole diagram) collapse to leftmost+rightmost.
        let targets;
        if (e.actors.length <= 2) {
          targets = e.actors.map(a => a.name).join(',');
        } else {
          const sorted = [...e.actors].sort((a, b) => a.xCenter - b.xCenter);
          targets = `${sorted[0].name},${sorted[sorted.length - 1].name}`;
        }
        out += `    Note over ${targets}: ${e.text}\n`;
      } else {
        const arrow = e.dashed ? '-->>' : '->>';
        out += `    ${e.source}${arrow}${e.target}: ${e.text}\n`;
      }
    }
    return out;
  }

  // === Mermaid state diagram SVG -> text conversion ===

  // Decode mermaid's base64-encoded data-points attribute on edge paths.
  // Returns [{x, y}, ...] or null on failure. Works in both browser (atob) and Node (Buffer).
  function decodeDataPoints(b64) {
    if (!b64) return null;
    try {
      let json;
      if (typeof atob === 'function') {
        json = atob(b64);
      } else if (typeof Buffer !== 'undefined') {
        json = Buffer.from(b64, 'base64').toString('utf-8');
      } else {
        return null;
      }
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : null;
    } catch (e) {
      return null;
    }
  }

  function convertStateDiagramSvgToMermaidText(svg) {
    // --- Parse states ---
    // Each state: <g class="node ..." id="state-{NAME}-{idx}" transform="translate(x, y)">
    // Pseudo states: state-root_start-0 (circle.state-start) → mermaid `[*]`
    const states = []; // { name, label, x, y, isPseudo }
    svg.querySelectorAll('g.node[id^="state-"]').forEach(el => {
      const id = el.getAttribute('id') || '';
      const m = id.match(/^state-(.+)-(\d+)$/);
      if (!m) return;
      const rawName = m[1];
      const t = parseTranslate(el.getAttribute('transform'));

      if (rawName === 'root_start' || el.querySelector('circle.state-start')) {
        states.push({ name: '[*]', label: '', x: t.x, y: t.y, isPseudo: true });
        return;
      }
      if (rawName === 'root_end' || el.querySelector('circle.state-end')) {
        states.push({ name: '[*]', label: '', x: t.x, y: t.y, isPseudo: true });
        return;
      }

      const labelHost = el.querySelector('.nodeLabel') || el.querySelector('.label');
      // extractMermaidLabelText may leave literal newlines from <p>multi\nline</p>;
      // collapse all whitespace so the label fits on one mermaid line.
      const labelText = extractMermaidLabelText(labelHost)
        .replace(/<br>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      states.push({ name: rawName, label: labelText, x: t.x, y: t.y, isPseudo: false });
    });
    if (states.length === 0) return '';

    const nearestState = (px, py) => {
      let best = null, bestD = Infinity;
      for (const s of states) {
        const dx = s.x - px, dy = s.y - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    };

    // --- Parse edges (anonymous; endpoints inferred via nearest state to data-points) ---
    const edges = [];
    svg.querySelectorAll('g.edgePaths path[id^="edge"]').forEach(p => {
      const id = p.getAttribute('id');
      const points = decodeDataPoints(p.getAttribute('data-points'));
      if (!points || points.length < 2) return;
      const start = points[0];
      const end = points[points.length - 1];
      if (typeof start.x !== 'number' || typeof end.x !== 'number') return;
      const source = nearestState(start.x, start.y);
      const target = nearestState(end.x, end.y);
      if (!source || !target) return;
      edges.push({ id, source, target });
    });

    // --- Edge labels keyed by edge id ---
    const edgeLabels = new Map();
    svg.querySelectorAll('g.edgeLabels g.edgeLabel g.label[data-id]').forEach(el => {
      const dataId = el.getAttribute('data-id');
      const text = extractMermaidLabelText(el)
        .replace(/<br>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) edgeLabels.set(dataId, text);
    });

    if (DEBUG_MODE) {
      console.log(`State diagram: ${states.length} states, ${edges.length} edges`);
    }

    // --- Build mermaid ---
    let out = 'stateDiagram-v2\n';
    for (const s of states) {
      if (s.isPseudo) continue;
      if (s.label && s.label !== s.name) {
        out += `    state "${escapeMermaidLabel(s.label)}" as ${s.name}\n`;
      }
    }
    for (const e of edges) {
      const label = edgeLabels.get(e.id);
      if (label) {
        out += `    ${e.source.name} --> ${e.target.name}: ${label}\n`;
      } else {
        out += `    ${e.source.name} --> ${e.target.name}\n`;
      }
    }
    return out;
  }

  // Per-conversion map from SVG element → exported image path (set during collectDiagramAssets).
  let currentSvgPathMap = null;

  function getSvgDimensions(svg) {
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: parts[2], height: parts[3] };
      }
    }
    const w = parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 800;
    const h = parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height || 600;
    return { width: Math.max(w, 80), height: Math.max(h, 80) };
  }

  function isDiagramSvg(svg) {
    const ariaRole = svg.getAttribute('aria-roledescription') || '';
    const svgClass = svg.getAttribute('class') || '';
    const id = svg.getAttribute('id') || '';
    const role = svg.getAttribute('role') || '';
    return ariaRole.includes('flowchart') || svgClass.includes('flowchart') ||
      ariaRole === 'class' || svgClass.includes('classDiagram') ||
      ariaRole === 'sequence' || svgClass.includes('sequence') ||
      ariaRole === 'stateDiagram' || svgClass.includes('statediagram') ||
      id.startsWith('mermaid-') ||
      role === 'graphics-document document';
  }

  function isRootSvg(svg) {
    if ((svg.tagName || '').toLowerCase() !== 'svg') return false;
    let parent = svg.parentElement;
    while (parent) {
      if ((parent.tagName || '').toLowerCase() === 'svg') return false;
      parent = parent.parentElement;
    }
    return true;
  }

  function findDiagramSvgs(container) {
    return Array.from(container.querySelectorAll('svg')).filter(
      svg => isRootSvg(svg) && isDiagramSvg(svg)
    );
  }

  function exportSvgAsSvgBase64(svg) {
    const clone = svg.cloneNode(true);
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    const svgString = new XMLSerializer().serializeToString(clone);
    return btoa(unescape(encodeURIComponent(svgString)));
  }

  function exportSvgToPngBase64(svg) {
    const clone = svg.cloneNode(true);
    const { width, height } = getSvgDimensions(svg);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    const svgString = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const SVG_EXPORT_TIMEOUT_MS = 10000;

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };

      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        finish(reject, new Error('SVG rasterization timed out'));
      }, SVG_EXPORT_TIMEOUT_MS);

      const img = new Image();
      img.onload = () => {
        try {
          const scale = 2;
          const maxDim = 4096;
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(Math.ceil(width * scale), maxDim);
          canvas.height = Math.min(Math.ceil(height * scale), maxDim);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          finish(resolve, canvas.toDataURL('image/png').split(',')[1]);
        } catch (err) {
          URL.revokeObjectURL(url);
          finish(reject, err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        finish(reject, new Error('Failed to rasterize SVG'));
      };
      img.src = url;
    });
  }

  async function collectDiagramAssets(container, pageSlug) {
    const assets = [];
    const svgPathMap = new WeakMap();
    const safeSlug = (pageSlug || 'page')
      .replace(/[^\w-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'page';
    const svgs = findDiagramSvgs(container).slice(0, 30);

    for (let i = 0; i < svgs.length; i++) {
      const svg = svgs[i];
      const n = i + 1;
      try {
        const base64 = await exportSvgToPngBase64(svg);
        const relativePath = `images/${safeSlug}-diagram-${n}.png`;
        assets.push({ relativePath, mimeType: 'image/png', base64 });
        svgPathMap.set(svg, { relativePath, alt: `Diagram ${n}` });
      } catch (err) {
        if (DEBUG_MODE) console.error('PNG export failed, falling back to SVG:', err);
        try {
          const base64 = exportSvgAsSvgBase64(svg);
          const relativePath = `images/${safeSlug}-diagram-${n}.svg`;
          assets.push({ relativePath, mimeType: 'image/svg+xml', base64 });
          svgPathMap.set(svg, { relativePath, alt: `Diagram ${n}` });
        } catch (err2) {
          if (DEBUG_MODE) console.error('SVG export also failed:', err2);
        }
      }
    }

    return { assets, svgPathMap };
  }

  // Returns image markdown when rasterized, else mermaid code block / placeholder / empty.
  function convertSvgToMarkdown(svgElement) {
    if (currentSvgPathMap) {
      const entry = currentSvgPathMap.get(svgElement);
      if (entry) {
        return `\n![${entry.alt}](${entry.relativePath})\n`;
      }
    }

    const ariaRole = svgElement.getAttribute('aria-roledescription') || '';
    const svgClass = svgElement.getAttribute('class') || '';
    const isFlowchart = ariaRole.includes('flowchart') || svgClass.includes('flowchart');
    const isClass = ariaRole === 'class' || svgClass.includes('classDiagram');
    const isSequence = ariaRole === 'sequence' || svgClass.includes('sequence');
    const isState = ariaRole === 'stateDiagram' || svgClass.includes('statediagram');

    if (isFlowchart) {
      try {
        const code = convertFlowchartSvgToMermaidText(svgElement);
        if (code) return `\n\`\`\`mermaid\n${code}\`\`\`\n`;
      } catch (err) {
        if (DEBUG_MODE) console.error('Flowchart conversion failed:', err);
      }
      return '\n[Flowchart Diagram]\n';
    }

    if (isClass) {
      try {
        const code = convertClassDiagramSvgToMermaidText(svgElement);
        if (code) return `\n\`\`\`mermaid\n${code}\`\`\`\n`;
      } catch (err) {
        if (DEBUG_MODE) console.error('Class diagram conversion failed:', err);
      }
      return '\n[Class Diagram]\n';
    }

    if (isSequence) {
      try {
        const code = convertSequenceDiagramSvgToMermaidText(svgElement);
        if (code) return `\n\`\`\`mermaid\n${code}\`\`\`\n`;
      } catch (err) {
        if (DEBUG_MODE) console.error('Sequence diagram conversion failed:', err);
      }
      return '\n[Sequence Diagram]\n';
    }

    if (isState) {
      try {
        const code = convertStateDiagramSvgToMermaidText(svgElement);
        if (code) return `\n\`\`\`mermaid\n${code}\`\`\`\n`;
      } catch (err) {
        if (DEBUG_MODE) console.error('State diagram conversion failed:', err);
      }
      return '\n[State Diagram]\n';
    }

    // Other diagram types not yet supported — drop silently.
    return '';
  }

  // Convert an HTML <table> to a GitHub-flavored Markdown table.
  // Cell content is normalized: newlines collapsed to spaces, pipes escaped.
  function convertTableToMarkdown(table) {
    const extractCells = (tr) => {
      const cells = [];
      Array.from(tr.children).forEach(cell => {
        const tag = (cell.tagName || '').toLowerCase();
        if (tag !== 'th' && tag !== 'td') return;
        let content = '';
        cell.childNodes.forEach(child => {
          content += processNode(child);
        });
        content = content
          .replace(/\s*\n\s*/g, ' ')
          .replace(/\|/g, '\\|')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(content);
      });
      return cells;
    };

    const headerRows = [];
    const bodyRows = [];

    const thead = table.querySelector(':scope > thead');
    if (thead) {
      thead.querySelectorAll(':scope > tr').forEach(tr => headerRows.push(extractCells(tr)));
    }
    const tbody = table.querySelector(':scope > tbody');
    if (tbody) {
      tbody.querySelectorAll(':scope > tr').forEach(tr => bodyRows.push(extractCells(tr)));
    }
    // Loose <tr> directly under <table> (no thead/tbody)
    table.querySelectorAll(':scope > tr').forEach(tr => {
      if (headerRows.length === 0) headerRows.push(extractCells(tr));
      else bodyRows.push(extractCells(tr));
    });

    if (headerRows.length === 0 && bodyRows.length === 0) return '';
    // No explicit header? Promote first body row.
    if (headerRows.length === 0) headerRows.push(bodyRows.shift());

    const colCount = Math.max(
      0,
      ...headerRows.map(r => r.length),
      ...bodyRows.map(r => r.length)
    );
    if (colCount === 0) return '';

    const pad = (row) => {
      const r = row.slice();
      while (r.length < colCount) r.push('');
      return r;
    };

    let out = '\n';
    for (const r of headerRows) out += '| ' + pad(r).join(' | ') + ' |\n';
    out += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';
    for (const r of bodyRows) out += '| ' + pad(r).join(' | ') + ' |\n';
    out += '\n';
    return out;
  }

  // Helper function to process a node and return Markdown
  function processNode(element) {
    let markdown = "";

    if (element.nodeType === Node.TEXT_NODE) {
      // Basic text cleanup
      let text = element.textContent.replace(/\u00A0/g, " "); // Replace non-breaking spaces
      const trimmedText = text.trim();

      // Filter out unwanted UI text (like copy buttons)
      // Only filter highly specific UI phrases to prevent data loss in legitimate Edge cases
      const ignoredTexts = ["Link copied!", "Copy code", "Copied!"];
      if (ignoredTexts.includes(trimmedText)) {
        return "";
      }

      if (trimmedText.length > 0) {
        return text;
      }
      return "";
    }

    if (element.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    // Ignore hidden elements
    if (element.style.display === "none" || element.style.visibility === "hidden") {
      return "";
    }

    const tagName = element.tagName.toLowerCase();

    // Ignore UI buttons and elements that should never produce markdown output.
    // <script> contains Next.js RSC payloads / inline JS; <style> contains CSS;
    // <noscript> / <template> / <head> have no visible content for our purposes.
    if (tagName === "button" || tagName === "script" || tagName === "style" ||
        tagName === "noscript" || tagName === "template" || tagName === "head" ||
        tagName === "meta" || tagName === "link") {
      return "";
    }

    // SVG: convert mermaid flowcharts to fenced mermaid blocks; drop other SVGs.
    // Match by tagName OR namespace as a defensive fallback (SVG inside HTML
    // should always have lowercase "svg", but guard against weird re-injection).
    const isSvgRoot = tagName === "svg" ||
      (element.namespaceURI === 'http://www.w3.org/2000/svg' && !element.parentNode?.namespaceURI?.includes('svg'));
    if (isSvgRoot) {
      return convertSvgToMarkdown(element);
    }
    // Inside an SVG (descendant elements) - drop to avoid leaking foreignObject text
    // when convertSvgToMarkdown failed to run on the root for any reason.
    if (element.namespaceURI === 'http://www.w3.org/2000/svg') {
      return "";
    }

    // Tables: convert wholesale to GFM markdown table.
    if (tagName === "table") {
      return convertTableToMarkdown(element);
    }

    const classList = Array.from(element.classList || []);

    // Mermaid container element with embedded source (rare on DeepWiki, but handle it).
    if (classList.some(cls => cls === 'mermaid' || cls.includes('mermaid'))) {
      const originalCode =
        element.getAttribute('data-src') ||
        element.getAttribute('data-mermaid') ||
        element.getAttribute('data-mermaid-src');
      if (originalCode) {
        return `\n\`\`\`mermaid\n${originalCode}\n\`\`\`\n`;
      }
      // No embedded source: fall through so any nested <svg> child is processed below.
    }

    // Ignore elements hidden via Tailwind classes
    if (classList.some(cls => ["sr-only", "invisible", "hidden"].includes(cls))) {
      return "";
    }

    // Headers
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
      const level = parseInt(tagName.substring(1));
      const prefix = "#".repeat(level) + " ";
      let content = "";
      element.childNodes.forEach((child) => {
        content += processNode(child);
      });
      return `\n${prefix}${content.trim()}\n`;
    }

    // Paragraphs
    if (tagName === "p") {
      let content = "";
      element.childNodes.forEach((child) => {
        content += processNode(child);
      });
      content = content.trim();
      return content.length > 0 ? `\n${content}\n` : "";
    }

    // Lists
    if (tagName === "ul" || tagName === "ol") {
      let content = "";
      let index = 1;
      element.childNodes.forEach((child) => {
        if (child.tagName && child.tagName.toLowerCase() === "li") {
          let liContent = "";
          child.childNodes.forEach((grandChild) => {
            liContent += processNode(grandChild);
          });

          liContent = liContent.trim();
          // Handle nested lists by indenting? (Simple version: just ensure newlines)
          // For a robust MD, we'd need to pass depth.
          // For now, let's keep it simple.

          const prefix = tagName === "ul" ? "- " : `${index++}. `;
          content += `${prefix}${liContent}\n`;
        }
      });
      return `\n${content}\n`;
    }

    // Code Blocks (Pre/Code)
    if (tagName === "pre") {
      // Standard <pre><code> code block.
      const codeElement = element.querySelector(":scope > code") || element.querySelector("code");
      if (codeElement) {
        const codeText = codeElement.innerText || codeElement.textContent || "";
        let language = "";
        const displayClass = Array.from(codeElement.classList).find(c => c.startsWith('language-'));
        if (displayClass) language = displayClass.replace('language-', '');
        return `\n\`\`\`${language}\n${codeText}\n\`\`\`\n`;
      }

      // <pre> wraps rich content (e.g. DeepWiki's diagram block:
      // <pre class="has-[div]:bg-transparent..."><div ...><svg.flowchart></svg></div></pre>).
      // Recurse so nested handlers (SVG converter, table converter) process them
      // instead of falling through to innerText (which would render SVG label text).
      if (element.children.length > 0) {
        let content = "";
        element.childNodes.forEach((child) => {
          content += processNode(child);
        });
        return content;
      }

      // Plain <pre> with only text content.
      return `\n\`\`\`\n${element.innerText || element.textContent || ""}\n\`\`\`\n`;
    }

    // Inline Code
    if (tagName === "code") {
      // If parent is PRE, it's already handled.
      if (element.parentElement.tagName.toLowerCase() === 'pre') return "";
      return `\`${element.textContent}\``;
    }

    // Blockquotes
    if (tagName === "blockquote") {
      let content = "";
      element.childNodes.forEach((child) => {
        content += processNode(child);
      });
      return `\n> ${content.trim().replace(/\n/g, "\n> ")}\n`;
    }

    // Links
    if (tagName === "a") {
      let content = "";
      element.childNodes.forEach((child) => {
        content += processNode(child);
      });
      const href = element.getAttribute("href") || "";
      return `[${content}](${href})`;
    }

    // Images
    if (tagName === "img") {
      const alt = element.getAttribute("alt") || "";
      const src = element.getAttribute("src") || "";
      return `![${alt}](${src})`;
    }

    // Bold/Strong
    if (tagName === "strong" || tagName === "b") {
      let content = "";
      element.childNodes.forEach((child) => {
        content += processNode(child);
      });
      return `**${content}**`;
    }

    // Italic/Emphasis
    if (tagName === "em" || tagName === "i") {
      let content = "";
      element.childNodes.forEach((child) => {
        content += processNode(child);
      });
      return `*${content}*`;
    }

    // Horizontal Rule
    if (tagName === "hr") {
      return "\n---\n";
    }

    // Divs and Spans (Generic containers)
    if (tagName === "div" || tagName === "span" || tagName === "section" || tagName === "article" || tagName === "main") {
      let content = "";
      element.childNodes.forEach((child) => {
        content += processNode(child);
      });

      // If it's a block-level element like DIV, maybe add spacing?
      if (tagName === "div" || tagName === "section" || tagName === 'article') {
        return content ? `\n${content}\n` : "";
      }
      return content;
    }

    // Fallback: Just process children
    let content = "";
    element.childNodes.forEach((child) => {
      content += processNode(child);
    });
    return content;
  }
})();