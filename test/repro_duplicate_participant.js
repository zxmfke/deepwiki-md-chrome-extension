const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

// Mock DOM environment
// Participant 1: "Client 1" at Top (y=50)
// Participant 1: "Client 1" at Bottom (y=500) - Should be ignored/deduplicated, not merged.

const dom = new JSDOM(`<!DOCTYPE html>
<svg id="mock-sequence">
  <!-- Top Label -->
  <text class="actor-box" x="100" y="50">Client 1</text>

  <!-- Bottom Label (Duplicate) -->
  <text class="actor-box" x="100" y="500">Client 1</text>

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
if (result.includes('participant p1 as "Client 1<br/>Client 1"')) {
    console.log("FAIL: Duplicate labels merged incorrectly.");
} else if (result.includes('participant p1 as "Client 1"')) {
    console.log("SUCCESS: Duplicate labels handled correctly.");
} else {
    console.log("UNKNOWN OUTPUT STATE");
}
