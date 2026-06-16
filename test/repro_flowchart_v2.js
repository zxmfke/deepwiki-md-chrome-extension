// Verify convertFlowchartSvgToMermaidText against real DeepWiki flowchart-v2 SVGs.
// Run: node test/repro_flowchart_v2.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Load content.js source and extract the flowchart functions for evaluation.
const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Pull the four helper functions + main converter out of the IIFE so we can test them in isolation.
const fnNames = [
  'parseNodeId',
  'splitEdgeIdAtKnownNodes',
  'parseEdgeId',
  'extractMermaidLabelText',
  'escapeMermaidLabel',
  'parseTranslate',
  'parseClusters',
  'buildClusterHierarchy',
  'findContainingCluster',
  'convertFlowchartSvgToMermaidText',
];
const exported = {};
for (const name of fnNames) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = contentSrc.match(re);
  if (!m) { console.error('Could not extract', name); process.exit(1); }
  exported[name] = m[0];
}

// Sample 1: simple top-down with empty edge labels (microsoft/vscode overview)
const sample1 = fs.readFileSync(path.join(__dirname, 'sample_flowchart_1.svg'), 'utf8');
// Sample 2: left-right with populated edge labels (process architecture)
const sample2 = fs.readFileSync(path.join(__dirname, 'sample_flowchart_2.svg'), 'utf8');
// Sample 3: subgraphs / clusters with cross-cluster edges
const sample3 = fs.readFileSync(path.join(__dirname, 'sample_flowchart_3.svg'), 'utf8');

function runSample(label, svgText) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
  const svg = dom.window.document.querySelector('svg.flowchart');
  if (!svg) { console.error(label, 'no svg.flowchart found'); return; }

  // Eval the helpers inside this scope
  const DEBUG_MODE = false;
  // eslint-disable-next-line no-eval
  const ctx = (() => {
    const Node = dom.window.Node;
    eval(exported.parseNodeId);
    eval(exported.splitEdgeIdAtKnownNodes);
    eval(exported.parseEdgeId);
    eval(exported.extractMermaidLabelText);
    eval(exported.escapeMermaidLabel);
    eval(exported.parseTranslate);
    eval(exported.parseClusters);
    eval(exported.buildClusterHierarchy);
    eval(exported.findContainingCluster);
    eval(exported.convertFlowchartSvgToMermaidText);
    return { convertFlowchartSvgToMermaidText };
  })();

  console.log(`\n=== ${label} ===`);
  console.log(ctx.convertFlowchartSvgToMermaidText(svg));
}

runSample('Sample 1 (simple TD)', sample1);
runSample('Sample 2 (LR with edge labels)', sample2);
runSample('Sample 3 (subgraphs / clusters)', sample3);
