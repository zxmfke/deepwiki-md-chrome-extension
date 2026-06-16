// Verify sequence converter against a complex Devin SVG with:
//   - Phase notes spanning all 5 actors (must collapse to 2)
//   - Self-message <path> elements (must be detected, source === target)
// Run: node test/repro_sequence_2.js
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

const svgText = fs.readFileSync(path.join(__dirname, 'sample_sequence_2.svg'), 'utf8');
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
  ['Has 5 participants',                    (out.match(/^    participant /gm) || []).length === 5],
  ['No Note over with >2 actors',           !out.match(/Note over [A-Za-z]+,[A-Za-z]+,/)],
  ['Phase note collapses to BOT,SDK',       out.includes('Note over BOT,SDK: Initialization Phase')],
  ['Phase note ML Prediction collapsed',    out.includes('Note over BOT,SDK: ML Prediction Phase')],
  ['Phase note Execution collapsed',        out.includes('Note over BOT,SDK: Execution Phase')],
  ['Self-msg ORC->>ORC: getPrediction',     out.includes('ORC->>ORC: "getPrediction(mode | features)"')],
  ['Self-msg RG->>RG: _checkConsecutive',   out.includes('RG->>RG: "_checkConsecutiveLosses()"')],
  ['Self-msg BOT->>BOT: log/notify',        out.includes('BOT->>BOT: "log/notify violation"')],
  ['Linear msg BOT->>AM: login',            out.includes('BOT->>AM: "login(FUBON_ID | FUBON_PASSWORD)"')],
  ['Dashed reply SDK-->>AM: config',        out.includes('SDK-->>AM: "config"')],
  ['Linear msg BOT->>RG: checkOrder',       out.includes('BOT->>RG: "checkOrder(orderRequest)"')],
  ['Dashed reply RG-->>BOT: passed:true',   out.includes('RG-->>BOT: "{ passed: true, allowed: true }"')],
  ['Dashed reply RG-->>BOT: passed:false',  out.includes('RG-->>BOT: "{ passed: false, reason }"')],
  ['Linear msg BOT->>SDK: placeFutoptOrder',out.includes('BOT->>SDK: "placeFutoptOrder(order)"')],
];

let allPass = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) allPass = false;
}

// Chronological order sanity (Y-sorted)
const expectedOrder = [
  'Note over BOT,SDK: Initialization Phase',
  'BOT->>AM: "login',
  'AM->>SDK: "buildWebSocketConfig',
  'SDK-->>AM: "config"',
  'AM->>SDK: "buildWebSocketClient',
  'Note over BOT,SDK: ML Prediction Phase',
  'BOT->>ORC: "runMLCheck',
  'ORC->>ORC: "getPrediction',
  'ORC-->>BOT: "prediction',
  'Note over BOT,SDK: Execution Phase',
  'BOT->>RG: "checkOrder',
  'RG->>RG: "_checkConsecutiveLosses',
  'RG-->>BOT: "{ passed: true',
  'BOT->>SDK: "placeFutoptOrder',
  'RG-->>BOT: "{ passed: false',
  'BOT->>BOT: "log/notify',
];
let lastIdx = -1;
let orderOk = true;
for (const marker of expectedOrder) {
  const idx = out.indexOf(marker);
  if (idx < 0 || idx <= lastIdx) {
    console.log(`  FAIL marker (out-of-order or missing): ${marker} (idx=${idx}, last=${lastIdx})`);
    orderOk = false;
    break;
  }
  lastIdx = idx;
}
console.log(`${orderOk ? 'PASS' : 'FAIL'}: Events in chronological order`);
if (!orderOk) allPass = false;

process.exit(allPass ? 0 : 1);
