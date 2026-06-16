// Verify cluster ids containing parens / special chars are sanitized so mermaid
// doesn't choke on `subgraph runBacktest()setupblock`.
// Run: node test/repro_subgraph_parens.js
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

const svgText = fs.readFileSync(path.join(__dirname, 'sample_subgraph_parens.svg'), 'utf8');
const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
const svg = dom.window.document.querySelector('svg.flowchart');
if (!svg) { console.error('no flowchart svg'); process.exit(1); }

const Node = dom.window.Node;
const DEBUG_MODE = false;
for (const name of fnNames) eval(exported[name]);

const out = convertFlowchartSvgToMermaidText(svg);
console.log('=== Output ===');
console.log(out);

console.log('=== Checks ===');
const checks = [
  ['No raw `subgraph runBacktest()`',  !out.match(/subgraph\s+runBacktest\(\)/)],
  ['Sanitized id used in subgraph',     /subgraph\s+runBacktest_setupblock/.test(out)],
  ['Original id preserved as label',    out.includes('["runBacktest()setupblock"]')],
  ['Other cluster (no specials) intact',out.includes('subgraph OptionsByMLBotconstructor')],
  ['Has matching `end` count',          (out.match(/^\s*subgraph /gm) || []).length === (out.match(/^\s*end\s*$/gm) || []).length],
];

let allPass = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) allPass = false;
}

process.exit(allPass ? 0 : 1);
