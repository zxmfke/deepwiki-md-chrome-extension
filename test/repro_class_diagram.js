// Verify convertClassDiagramSvgToMermaidText against a real DeepWiki class diagram SVG.
// Run: node test/repro_class_diagram.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

const fnNames = [
  'parseClassNodeId',
  'parseEdgeId',
  'parseClassEdgeId',
  'splitEdgeIdAtKnownNodes',
  'extractMermaidLabelText',
  'extractMermaidLineText',
  'extractClassNodeData',
  'inferClassRelation',
  'escapeMermaidLabel',
  'convertClassDiagramSvgToMermaidText',
];
const exported = {};
for (const name of fnNames) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = contentSrc.match(re);
  if (!m) { console.error('Could not extract', name); process.exit(1); }
  exported[name] = m[0];
}

const sample = fs.readFileSync(path.join(__dirname, 'sample_class_1.svg'), 'utf8');

function runSample(label, svgText) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
  const svg = dom.window.document.querySelector('svg.classDiagram');
  if (!svg) { console.error(label, 'no svg.classDiagram found'); return; }

  const DEBUG_MODE = false;
  const ctx = (() => {
    const Node = dom.window.Node;
    eval(exported.splitEdgeIdAtKnownNodes);
    eval(exported.parseClassNodeId);
    eval(exported.parseEdgeId);
    eval(exported.parseClassEdgeId);
    eval(exported.extractMermaidLabelText);
    eval(exported.extractMermaidLineText);
    eval(exported.escapeMermaidLabel);
    eval(exported.extractClassNodeData);
    eval(exported.inferClassRelation);
    eval(exported.convertClassDiagramSvgToMermaidText);
    return { convertClassDiagramSvgToMermaidText };
  })();

  console.log(`\n=== ${label} ===`);
  console.log(ctx.convertClassDiagramSvgToMermaidText(svg));
}

runSample('Class diagram (IViewModel <|.. ViewModel)', sample);
