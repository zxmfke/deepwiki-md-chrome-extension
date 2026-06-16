const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

// Mock DOM environment
// Participant 1: "Client 1" (Single line)
// Participant 2: "ticketObject\nkey: seat-1\nstate: AVAILABLE" (Multi-line, same X)

const dom = new JSDOM(`<!DOCTYPE html>
<svg id="mock-sequence">
  <!-- Participant 1 -->
  <text class="actor-box" x="100">Client 1</text>

  <!-- Participant 2 (Multi-line) -->
  <!-- All have same X=500 -->
  <text class="actor-box" x="500" y="50">ticketObject</text>
  <text class="actor-box" x="500" y="65">key: seat-1</text>
  <text class="actor-box" x="500" y="80">state: AVAILABLE</text>

  <!-- Message -->
  <line class="messageLine0" x1="100" y1="100" x2="500" y2="100" />
  <text class="messageText" x="300" y="90">Request</text>
</svg>`);

global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;

// Load content.js
const contentJsPath = path.join(__dirname, '../content.js');
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8');

global.chrome = {
    runtime: {
        onMessage: {
            addListener: () => { }
        }
    }
};
global.DEBUG_MODE = true;
global.SEQ_CONSTANTS = {
    TOLERANCE: 2,
    SELF_MESSAGE_DIST: 20,
    BLOCK_TEXT_Y_MARGIN: 5,
    BLOCK_DIVIDER_Y_MARGIN: 5,
    BLOCK_DIVIDER_LOOKAHEAD: 40
};

try {
    eval(contentJsContent);
} catch (e) {
    // Ignore
}

const svg = document.getElementById('mock-sequence');
const result = convertSequenceDiagramSvgToMermaidText(svg);
console.log(result);

// Verification logic
// We expect:
// participant p1 as "Client 1"
// participant p2 as "ticketObject<br/>key: seat-1<br/>state: AVAILABLE"

if (result.includes('participant p2 as "ticketObject<br/>key: seat-1<br/>state: AVAILABLE"')) {
    console.log("SUCCESS: Multi-line participant correctly grouped.");
} else if (result.includes('participant p2 as "ticketObject"') && result.includes('participant p3 as "key: seat-1"')) {
    console.log("FAIL: Multi-line participant split into multiple participants.");
} else {
    console.log("UNKNOWN OUTPUT STATE");
}
