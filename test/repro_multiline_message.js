const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

// Mock DOM environment
const dom = new JSDOM(`<!DOCTYPE html>
<svg id="mock-sequence">
  <!-- Participants -->
  <text class="actor-box" x="100">Client</text>
  <text class="actor-box" x="300">Server</text>

  <!-- Message 1: Multi-line -->
  <!-- Line at Y=100 -->
  <line class="messageLine0" x1="100" y1="100" x2="300" y2="100" />
  <!-- Text 1 associated with Line 1 -->
  <text class="messageText" x="200" y="90">POST /api</text>
  <!-- Text 2 associated with Line 1 (e.g. payload) -->
  <text class="messageText" x="200" y="110">{data: 1}</text>

  <!-- Message 2: Single line -->
  <!-- Line at Y=200 -->
  <line class="messageLine0" x1="100" y1="200" x2="300" y2="200" />
  <!-- Text 3 associated with Line 2 -->
  <text class="messageText" x="200" y="190">200 OK</text>
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
global.DEBUG_MODE = false;
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
// We expect Line 1 to have "POST /api" AND "{data: 1}"
// We expect Line 2 to have "200 OK"

// Current broken behavior expectation:
// Line 1 gets "POST /api"
// Line 2 gets "{data: 1}"
// "200 OK" is lost or assigned to a non-existent Line 3

const line1Correct = result.includes('POST /api') && result.includes('{data: 1}') && result.indexOf('POST /api') < result.indexOf('{data: 1}');
// Ideally they are on the same line or adjacent lines in mermaid for the same arrow?
// Mermaid doesn't support multi-line text on arrow easily without <br/>.
// Let's see how they are assigned.

// Check if Line 2 has "{data: 1}" (Failure case)
// p1->>p2: {data: 1}  <-- This would be the second arrow in the output

if (result.match(/p1->>p2: {data: 1}/)) {
    console.log("FAIL: '{data: 1}' incorrectly assigned to second message line.");
} else if (result.match(/p1->>p2: POST \/api.*{data: 1}/s) || result.match(/p1->>p2: POST \/api<br\/>{data: 1}/)) {
    console.log("SUCCESS: Multi-line text correctly assigned to first message.");
} else {
    console.log("UNKNOWN OUTPUT STATE");
}
