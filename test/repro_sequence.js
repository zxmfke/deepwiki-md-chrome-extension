// Verify convertSequenceDiagramSvgToMermaidText against a real Devin sequence SVG.
// Run: node test/repro_sequence.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const fnNames = ['readSvgText', 'convertSequenceDiagramSvgToMermaidText'];
const exported = {};
for (const name of fnNames) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = contentSrc.match(re);
  if (!m) { console.error('Could not extract', name); process.exit(1); }
  exported[name] = m[0];
}

const svgText = fs.readFileSync(path.join(__dirname, 'sample_sequence_1.svg'), 'utf8');
const dom = new JSDOM(`<!DOCTYPE html><body>${svgText}</body>`);
const svg = dom.window.document.querySelector('svg[aria-roledescription="sequence"]');
if (!svg) { console.error('no sequence svg found'); process.exit(1); }

const Node = dom.window.Node;
const DEBUG_MODE = false;
for (const name of fnNames) eval(exported[name]);

const out = convertSequenceDiagramSvgToMermaidText(svg);
console.log('=== Output ===');
console.log(out);

console.log('=== Checks ===');
const checks = [
  ['Starts with sequenceDiagram',         out.startsWith('sequenceDiagram\n')],
  ['Has 6 participants',                  (out.match(/^    participant /gm) || []).length === 6],
  ['Participant SDK with label',          out.includes('participant SDK as "fubon-neo SDK"')],
  ['Participant order: SDK before DS',    out.indexOf('participant SDK') < out.indexOf('participant DS')],
  ['Participant order: BOT before ML',    out.indexOf('participant BOT') < out.indexOf('participant ML')],
  ['Participant order: RG before OR',     out.indexOf('participant RG') < out.indexOf('participant OR')],
  ['Solid msg SDK->>DS',                  out.includes('SDK->>DS: "WebSocket Ticks (trades/books)"')],
  ['Solid msg DS->>BOT',                  out.includes('DS->>BOT: "onTick / TickProcessor"')],
  ['Note over BOT (1st)',                 out.includes('Note over BOT: "Spike Detection / Strike Selection"')],
  ['Solid msg BOT->>ML',                  out.includes('BOT->>ML: "getPrediction()"')],
  ['Dashed reply ML-->>BOT',              out.includes('ML-->>BOT: "Directional Bias / Sentiment"')],
  ['Note over BOT (2nd)',                 out.includes('Note over BOT: "Signal Validation"')],
  ['Solid msg BOT->>RG',                  out.includes('BOT->>RG: "checkRisk(orderRequest)"')],
  ['Dashed reply RG-->>BOT',              out.includes('RG-->>BOT: "Risk Approval (passed: true)"')],
  ['Solid msg BOT->>OR',                  out.includes('BOT->>OR: "buyOption / sellOption / executeSpread"')],
  ['Solid msg OR->>SDK',                  out.includes('OR->>SDK: "Fubon SDK Order Execution"')],
];

let allPass = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) allPass = false;
}

// Order check: events should appear in chronological (Y) order.
const expectedOrder = [
  'SDK->>DS:', 'DS->>BOT:', 'Note over BOT: "Spike',
  'BOT->>ML:', 'ML-->>BOT:', 'Note over BOT: "Signal',
  'BOT->>RG:', 'RG-->>BOT:', 'BOT->>OR:', 'OR->>SDK:'
];
let lastIdx = -1;
let orderOk = true;
for (const marker of expectedOrder) {
  const idx = out.indexOf(marker);
  if (idx < 0 || idx <= lastIdx) { orderOk = false; break; }
  lastIdx = idx;
}
console.log(`${orderOk ? 'PASS' : 'FAIL'}: Events in chronological order`);
if (!orderOk) allPass = false;

process.exit(allPass ? 0 : 1);
