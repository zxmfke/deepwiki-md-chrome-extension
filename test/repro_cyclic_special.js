// Verify mermaid self-loop edges (rendered as 3 path segments with
// "{node}-cyclic-special-{1|mid|2}" ids) are picked up — previously they
// were filtered out by the `path[id^="L_"]` selector.
// Run: node test/repro_cyclic_special.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const fnNames = [
  'parseNodeId', 'splitEdgeIdAtKnownNodes', 'parseEdgeId',
  'extractMermaidLabelText', 'escapeMermaidLabel', 'escapeMermaidEdgeLabel',
  'sanitizeMermaidId',
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

const svgText = fs.readFileSync(path.join(__dirname, 'sample_cyclic_special.svg'), 'utf8');
const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
const svg = dom.window.document.querySelector('svg.flowchart');

const Node = dom.window.Node;
const DEBUG_MODE = false;
for (const name of fnNames) eval(exported[name]);

const out = convertFlowchartSvgToMermaidText(svg);
console.log('=== Output ===');
console.log(out);

console.log('=== Checks ===');
const selfLoopLines = out.split('\n').filter(l => /SeatMapHandlers\b.*SeatMapHandlers/.test(l));
const checks = [
  ['SeatMapHandlers node declared',           out.includes('SeatMapHandlers[')],
  ['Self-loop uses dotted arrow -.->',         /SeatMapHandlers\s+-\.->\|.*\|\s*SeatMapHandlers/.test(out)],
  ['Self-loop is NOT solid -->',               !/SeatMapHandlers\s+-->\|.*\|\s*SeatMapHandlers/.test(out)],
  ['Label "auto-reset at 50 SOLD" preserved',  out.includes('auto-reset at 50 SOLD')],
  ['Label "ctx.objectSendClient" preserved',   out.includes('ctx.objectSendClient')],
  ['Only 1 self-loop emitted (not 3)',         selfLoopLines.length === 1],
  // Regression: regular edge styles also detected from class.
  ['Solid edge A --> B',                       /A\s+-->\|"solid edge"\|\s*B/.test(out)],
  ['Dotted edge B -.-> C',                     /B\s+-\.->\|"dotted edge"\|\s*C/.test(out)],
];

let allPass = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) allPass = false;
}

process.exit(allPass ? 0 : 1);
