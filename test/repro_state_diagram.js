// Verify convertStateDiagramSvgToMermaidText against a real DeepWiki state diagram
// (anonymous edges + base64 data-points + start pseudo-state).
// Run: node test/repro_state_diagram.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const fnNames = [
  'extractMermaidLabelText',
  'escapeMermaidLabel',
  'parseTranslate',
  'decodeDataPoints',
  'convertStateDiagramSvgToMermaidText',
];
const exported = {};
for (const name of fnNames) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = contentSrc.match(re);
  if (!m) { console.error('Could not extract', name); process.exit(1); }
  exported[name] = m[0];
}

const svgText = fs.readFileSync(path.join(__dirname, 'sample_state_diagram_1.svg'), 'utf8');
const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
const svg = dom.window.document.querySelector('svg[aria-roledescription="stateDiagram"]');
if (!svg) { console.error('no state-diagram svg found'); process.exit(1); }

const Node = dom.window.Node;
const DEBUG_MODE = false;
for (const name of fnNames) eval(exported[name]);

const out = convertStateDiagramSvgToMermaidText(svg);
console.log('=== Output ===');
console.log(out);

console.log('=== Checks ===');
const checks = [
  ['Starts with stateDiagram-v2',     out.startsWith('stateDiagram-v2\n')],
  ['Has 4 named-state declarations',  (out.match(/^    state ".*" as /gm) || []).length === 4],
  ['IDLE alias declared',             out.includes('state "IDLE (SpikeStateMachine)" as IDLE')],
  ['WR alias declared',               out.includes('state "WAITING_REVERSAL (SpikeStateMachine)" as WR')],
  ['IP alias declared',               out.includes('state "IN_POSITION (RiskGuardian)" as IP')],
  ['CD alias declared',               out.includes('state "COOLDOWN (POST_EXIT_COOLDOWN)" as CD')],
  ['Start transition [*] --> IDLE',   out.includes('[*] --> IDLE\n')],
  ['IDLE --> IP (ALIGNED)',           out.includes('IDLE --> IP: Spike Detected (ALIGNED)')],
  ['IDLE --> WR (OPPOSED)',           out.includes('IDLE --> WR: Spike Detected (OPPOSED)')],
  ['WR --> IP Reversal Confirmed',    out.includes('WR --> IP: Reversal Confirmed')],
  ['WR --> IDLE Reversal Timeout',    out.includes('WR --> IDLE: Reversal Timeout')],
  ['IP --> CD Exit Condition Met',    out.includes('IP --> CD: Exit Condition Met')],
  ['CD --> IDLE Cooldown Expired',    out.includes('CD --> IDLE: Cooldown Expired')],
  ['Total 7 transitions',             (out.match(/-->/g) || []).length === 7],
];

let allPass = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) allPass = false;
}

process.exit(allPass ? 0 : 1);
