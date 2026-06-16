// Verify edge labels with parens / pipes are escaped via quoted-label syntax.
// Run: node test/repro_edge_label_parens.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const fnNames = [
  'parseNodeId', 'splitEdgeIdAtKnownNodes', 'parseEdgeId',
  'extractMermaidLabelText', 'escapeMermaidLabel', 'escapeMermaidEdgeLabel',
  'parseTranslate', 'parseClusters', 'buildClusterHierarchy', 'findContainingCluster',
  'convertFlowchartSvgToMermaidText',
];
const exported = {};
for (const name of fnNames) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = contentSrc.match(re);
  if (!m) { console.error('Could not extract', name); process.exit(1); }
  exported[name] = m[0];
}

// Synthetic SVG: 3 nodes T, S, C with edge labels containing parens / pipe.
const svgText = `<svg class="flowchart" aria-roledescription="flowchart-v2" viewBox="0 0 600 400">
  <g class="root">
    <g class="edgePaths">
      <path d="M0,0L100,0" id="L_T_S_0" class="flowchart-link" marker-end="url(#x)"></path>
      <path d="M0,0L100,0" id="L_C_T_0" class="flowchart-link" marker-end="url(#x)"></path>
      <path d="M0,0L100,0" id="L_S_C_0" class="flowchart-link" marker-end="url(#x)"></path>
    </g>
    <g class="edgeLabels">
      <g class="edgeLabel" transform="translate(0,0)"><g class="label" data-id="L_T_S_0"><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span class="edgeLabel"><p>show()</p></span></div></foreignObject></g></g>
      <g class="edgeLabel" transform="translate(0,0)"><g class="label" data-id="L_C_T_0"><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span class="edgeLabel"><p>getProvider(id)</p></span></div></foreignObject></g></g>
      <g class="edgeLabel" transform="translate(0,0)"><g class="label" data-id="L_S_C_0"><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span class="edgeLabel"><p>a | b</p></span></div></foreignObject></g></g>
    </g>
    <g class="nodes">
      <g class="node default" id="flowchart-T-0" transform="translate(100, 100)"><g class="label"><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>T</p></span></div></foreignObject></g></g>
      <g class="node default" id="flowchart-S-1" transform="translate(300, 100)"><g class="label"><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>S</p></span></div></foreignObject></g></g>
      <g class="node default" id="flowchart-C-2" transform="translate(500, 100)"><g class="label"><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>C</p></span></div></foreignObject></g></g>
    </g>
  </g>
</svg>`;

const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
const svg = dom.window.document.querySelector('svg.flowchart');

const Node = dom.window.Node;
const DEBUG_MODE = false;
for (const name of fnNames) eval(exported[name]);

const out = convertFlowchartSvgToMermaidText(svg);
console.log('=== Output ===');
console.log(out);

console.log('\n=== Checks ===');
console.log('Edge with show() is quoted:', out.includes('|"show()"|'));
console.log('Edge with getProvider(id) is quoted:', out.includes('|"getProvider(id)"|'));
console.log('Edge with pipe is escaped:', out.includes('|"a #124; b"|'));
console.log('No raw pipe inside edge label:', !out.match(/\|a \| b\|/));
