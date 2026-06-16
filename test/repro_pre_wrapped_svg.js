// Verify <pre> handler doesn't swallow nested SVG flowcharts (DeepWiki structure).
// Run: node test/repro_pre_wrapped_svg.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Pull processNode + everything it transitively calls.
const fnNames = [
  'parseNodeId', 'splitEdgeIdAtKnownNodes', 'parseEdgeId',
  'parseClassEdgeId', 'parseClassNodeId',
  'extractMermaidLabelText', 'extractMermaidLineText',
  'escapeMermaidLabel', 'parseTranslate',
  'parseClusters', 'buildClusterHierarchy', 'findContainingCluster',
  'extractClassNodeData', 'inferClassRelation',
  'convertFlowchartSvgToMermaidText',
  'convertClassDiagramSvgToMermaidText',
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

// DeepWiki structure: <pre> wrapping a div that wraps the SVG.
const sample1 = fs.readFileSync(path.join(__dirname, 'sample_flowchart_1.svg'), 'utf8');
const html = `<!DOCTYPE html><body>
<strong>Source Layer Hierarchy</strong>
<pre class="has-[div]:bg-transparent">
  <div class="group dialog-trigger">
    <div class="flex justify-center">
      ${sample1}
    </div>
  </div>
</pre>
</body>`;

const dom = new JSDOM(html);
const Node = dom.window.Node;
const DEBUG_MODE = false;

for (const name of fnNames) eval(exported[name]);

// Walk top-level body children and concatenate, mimicking the convertToMarkdown loop.
const body = dom.window.document.body;
let out = '';
body.childNodes.forEach(child => { out += processNode(child); });
out = out.trim().replace(/\n{3,}/g, '\n\n');

console.log('=== Output ===');
console.log(out);
console.log('\n=== Checks ===');
console.log('Contains "```mermaid":', out.includes('```mermaid'));
console.log('Contains "flowchart TD":', out.includes('flowchart TD'));
console.log('Contains "base -->":', out.includes('base -->'));
console.log('Does NOT have stray plain "```\\nbase/\\n":', !out.match(/```\nbase\//));

// Also: standard <pre><code> still works.
const dom2 = new JSDOM(`<!DOCTYPE html><body><pre><code class="language-js">const x = 1;</code></pre></body>`);
let out2 = '';
dom2.window.document.body.childNodes.forEach(c => { out2 += processNode(c); });
console.log('\n=== Standard <pre><code> ===');
console.log(out2.trim());

// And: <pre> with plain text only.
const dom3 = new JSDOM(`<!DOCTYPE html><body><pre>plain preformatted text</pre></body>`);
let out3 = '';
dom3.window.document.body.childNodes.forEach(c => { out3 += processNode(c); });
console.log('\n=== <pre> plain text ===');
console.log(out3.trim());
