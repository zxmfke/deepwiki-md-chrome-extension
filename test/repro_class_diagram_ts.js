// Verify class-diagram edges keep ".ts" suffix from class display names instead of
// using the sanitized edge id (which strips dots).
// Run: node test/repro_class_diagram_ts.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const fnNames = [
  'parseNodeId', 'splitEdgeIdAtKnownNodes',
  'parseClassEdgeId', 'parseClassNodeId',
  'extractMermaidLabelText', 'extractMermaidLineText',
  'escapeMermaidLabel',
  'extractClassNodeData', 'inferClassRelation',
  'convertClassDiagramSvgToMermaidText',
];
const exported = {};
for (const name of fnNames) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = contentSrc.match(re);
  if (!m) { console.error('Could not extract', name); process.exit(1); }
  exported[name] = m[0];
}

const svgText = fs.readFileSync(path.join(__dirname, 'sample_class_diagram_ts.svg'), 'utf8');
const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
const svg = dom.window.document.querySelector('svg.classDiagram');
if (!svg) { console.error('no class-diagram svg'); process.exit(1); }

const Node = dom.window.Node;
const DEBUG_MODE = false;
for (const name of fnNames) eval(exported[name]);

const out = convertClassDiagramSvgToMermaidText(svg);
console.log('=== Output ===');
console.log(out);

console.log('=== Checks ===');
const checks = [
  ['Class PythonBridge.ts declared',          out.includes('class PythonBridge.ts {')],
  ['Class MLPredictionService.ts declared',   out.includes('class MLPredictionService.ts {')],
  ['Class FiniDataRepository.ts declared',    out.includes('class FiniDataRepository.ts {')],
  ['Class FINIFlowFetcher.ts declared',       out.includes('class FINIFlowFetcher.ts {')],
  ['Edge MLPredictionService.ts -> PythonBridge.ts', /MLPredictionService\.ts\s+--?>\s+PythonBridge\.ts\s+:\s+"requests prediction"/.test(out)],
  ['Edge MLPredictionService.ts ..> FiniDataRepository.ts', /MLPredictionService\.ts\s+\.\.>\s+FiniDataRepository\.ts\s+:\s+"loads historical features"/.test(out)],
  ['Edge FINIFlowFetcher.ts -> FiniDataRepository.ts', /FINIFlowFetcher\.ts\s+--?>\s+FiniDataRepository\.ts\s+:\s+"persists fetched OI"/.test(out)],
];

// Stronger structural check: every edge endpoint must end with .ts.
const edgeLines = (out.match(/^\s*\S+\s+(--?>|\.\.>|--|\.\.)\s+\S+/gm) || []);
const allEdgesHaveTs = edgeLines.every(l => {
  const parts = l.trim().split(/\s+/);
  return parts[0].endsWith('.ts') && parts[2].endsWith('.ts');
});
console.log(`${allEdgesHaveTs ? 'PASS' : 'FAIL'}: Every edge endpoint ends with .ts`);

let allPass = allEdgesHaveTs;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) allPass = false;
}

process.exit(allPass ? 0 : 1);
