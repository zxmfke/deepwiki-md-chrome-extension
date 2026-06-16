// Verify convertSvgToMarkdown emits image refs when currentSvgPathMap is populated.
// Run: node test/repro_diagram_assets.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

const fnNames = [
  'parseNodeId', 'splitEdgeIdAtKnownNodes', 'parseEdgeId',
  'parseClassEdgeId', 'parseClassNodeId',
  'extractMermaidLabelText', 'extractMermaidLineText',
  'escapeMermaidLabel', 'parseTranslate',
  'parseClusters', 'buildClusterHierarchy', 'findContainingCluster',
  'extractClassNodeData', 'inferClassRelation',
  'convertFlowchartSvgToMermaidText',
  'convertClassDiagramSvgToMermaidText',
  'convertSequenceDiagramSvgToMermaidText',
  'convertStateDiagramSvgToMermaidText',
  'convertSvgToMarkdown', 'convertTableToMarkdown',
  'processNode',
];
const exported = {};
for (const name of fnNames) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = contentSrc.match(re);
  if (!m) { console.error('Could not extract', name); process.exit(1); }
  exported[name] = m[0];
}

// Pull currentSvgPathMap declaration (let) for eval scope
const mapDecl = contentSrc.match(/let currentSvgPathMap = null;/);
if (!mapDecl) { console.error('Could not find currentSvgPathMap'); process.exit(1); }

const sample1 = fs.readFileSync(path.join(__dirname, 'sample_cyclic_special.svg'), 'utf8');
const html = `<!DOCTYPE html><body>
<pre class="has-[div]:bg-transparent">
  <div class="group dialog-trigger">
    <div class="flex justify-center">${sample1}</div>
  </div>
</pre>
</body>`;

const dom = new JSDOM(html);
const Node = dom.window.Node;
const DEBUG_MODE = false;

eval(mapDecl[0]);
for (const name of fnNames) eval(exported[name]);

const svg = dom.window.document.querySelector('svg.flowchart');
if (!svg) { console.error('no flowchart svg'); process.exit(1); }

// Simulate pre-scan asset map (PNG path assigned before processNode walk)
currentSvgPathMap = new WeakMap();
currentSvgPathMap.set(svg, {
  relativePath: 'images/architecture-diagram-1.png',
  alt: 'Diagram 1'
});

let out = '';
dom.window.document.body.childNodes.forEach(child => { out += processNode(child); });
out = out.trim().replace(/\n{3,}/g, '\n\n');

console.log('=== Output ===');
console.log(out);
console.log('\n=== Checks ===');
console.log('Contains image ref:', out.includes('![Diagram 1](images/architecture-diagram-1.png)'));
console.log('Does NOT contain mermaid fence:', !out.includes('```mermaid'));

// Fallback: without map, mermaid text or placeholder is still emitted
currentSvgPathMap = null;
let out2 = convertSvgToMarkdown(svg);
console.log('\n=== Fallback (no map) ===');
console.log('Contains mermaid or placeholder:',
  out2.includes('```mermaid') || out2.includes('[Flowchart Diagram]'));

if (!out.includes('![Diagram 1](images/architecture-diagram-1.png)')) process.exit(1);
if (out.includes('```mermaid')) process.exit(1);
if (!out2.includes('```mermaid') && !out2.includes('[Flowchart Diagram]')) process.exit(1);

console.log('\nAll checks passed.');
