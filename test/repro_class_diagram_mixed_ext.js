// Verify class-diagram edges preserve arbitrary file extensions in display names
// (.java, .js, .py — not just .ts).
// Run: node test/repro_class_diagram_mixed_ext.js
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

// Synthetic class diagram with 3 classes carrying different extensions and 2 edges.
const svgText = `<svg class="classDiagram" aria-roledescription="class">
  <g class="root">
    <g class="edgePaths">
      <path d="" id="id_UserController_UserService_1" class="relation" data-id="id_UserController_UserService_1" marker-end="url(#mermaid-x_class-dependencyEnd)"></path>
      <path d="" id="id_UserService_UserRepository_2" class="edge-pattern-dashed relation" data-id="id_UserService_UserRepository_2" marker-end="url(#mermaid-x_class-dependencyEnd)"></path>
    </g>
    <g class="edgeLabels">
      <g class="edgeLabel"><g class="label" data-id="id_UserController_UserService_1"><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span class="edgeLabel"><p>uses</p></span></div></foreignObject></g></g>
      <g class="edgeLabel"><g class="label" data-id="id_UserService_UserRepository_2"><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><span class="edgeLabel"><p>queries</p></span></div></foreignObject></g></g>
    </g>
    <g class="nodes">
      <g class="node default" id="classId-UserController-1">
        <g class="label-group text"><g class="label"><foreignObject width="120" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>UserController.java</p></span></div></foreignObject></g></g>
        <g class="methods-group text"><g class="label"><foreignObject width="120" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>+handleLogin()</p></span></div></foreignObject></g></g>
      </g>
      <g class="node default" id="classId-UserService-2">
        <g class="label-group text"><g class="label"><foreignObject width="120" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>UserService.js</p></span></div></foreignObject></g></g>
        <g class="methods-group text"><g class="label"><foreignObject width="120" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>+authenticate()</p></span></div></foreignObject></g></g>
      </g>
      <g class="node default" id="classId-UserRepository-3">
        <g class="label-group text"><g class="label"><foreignObject width="120" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>UserRepository.py</p></span></div></foreignObject></g></g>
        <g class="methods-group text"><g class="label"><foreignObject width="120" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>+find_by_id(id)</p></span></div></foreignObject></g></g>
      </g>
    </g>
  </g>
</svg>`;

const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
const svg = dom.window.document.querySelector('svg.classDiagram');

const Node = dom.window.Node;
const DEBUG_MODE = false;
for (const name of fnNames) eval(exported[name]);

const out = convertClassDiagramSvgToMermaidText(svg);
console.log('=== Output ===');
console.log(out);

console.log('=== Checks ===');
const checks = [
  ['class UserController.java declared', out.includes('class UserController.java {')],
  ['class UserService.js declared',      out.includes('class UserService.js {')],
  ['class UserRepository.py declared',   out.includes('class UserRepository.py {')],
  ['edge UserController.java -> UserService.js', /UserController\.java\s+--?>\s+UserService\.js\s+:\s+uses/.test(out)],
  ['edge UserService.js ..> UserRepository.py',  /UserService\.js\s+\.\.>\s+UserRepository\.py\s+:\s+queries/.test(out)],
];

let allPass = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) allPass = false;
}

process.exit(allPass ? 0 : 1);
