const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

// Mock DOM environment based on user description
// Client 1 -> Restate Server: POST /Checkout/process \n {ticketId: seat-1, userId: user-1}
// Client 2 -> Restate Server: POST /Checkout/process \n {ticketId: seat-1, userId: user-2}
// Restate Server -> Restate Server: Queue both requests

const dom = new JSDOM(`<!DOCTYPE html>
<svg id="mock-sequence">
  <!-- Participants -->
  <text class="actor-box" x="100">Client 1</text>
  <text class="actor-box" x="300">Client 2</text>
  <text class="actor-box" x="500">Restate Server</text>

  <!-- Message 1: Client 1 -> Server -->
  <!-- Line at Y=100 -->
  <line class="messageLine0" x1="100" y1="100" x2="500" y2="100" />
  <text class="messageText" x="300" y="85">POST /Checkout/process</text>
  <text class="messageText" x="300" y="95">{ticketId: seat-1, userId: user-1}</text>

  <!-- Message 2: Client 2 -> Server -->
  <!-- Line at Y=160 (Large gap) -->
  <line class="messageLine0" x1="300" y1="160" x2="500" y2="160" />
  <!-- Text at 110. Gap to Line 2 (160) is 50px. -->
  <!-- Gap to Line 1 (100) is 10px. -->
  <!-- Current threshold is 40px. So 50 >= 40. -->
  <!-- Logic will reject Line 2 and assign to Line 1 (prevLine). -->
  <text class="messageText" x="400" y="110">POST /Checkout/process</text>
  <text class="messageText" x="400" y="125">{ticketId: seat-1, userId: user-2}</text>

  <!-- Message 3: Server -> Server (Self loop) -->
  <!-- Path at Y=180 (Below Line 2) -->
  <path class="messageLine0" d="M 500 180 C 540 180, 540 200, 530 200" />
  <text class="messageText" x="520" y="190">Queue both requests</text>

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
// p1->>p3: POST ... <br/> {ticketId: seat-1, userId: user-1}
// p2->>p3: POST ... <br/> {ticketId: seat-1, userId: user-2}
// p3->>p3: Queue both requests

if (result.includes('p2->>p3: Queue both requests')) {
    console.log("FAIL: 'Queue both requests' incorrectly assigned to Client 2 message.");
} else if (result.includes('p2->>p3: POST /Checkout/process') && result.includes('{ticketId: seat-1, userId: user-2}')) {
    console.log("SUCCESS: Client 2 message correctly parsed.");
} else {
    console.log("UNKNOWN OUTPUT STATE");
}
