const jsdom = require("jsdom");
const { JSDOM } = jsdom;

// Mock DOM environment
const dom = new JSDOM(`<!DOCTYPE html>
<svg id="mock-sequence">
  <!-- Participants -->
  <text class="actor-box" x="75">User</text>
  <text class="actor-box" x="283">System</text>

  <!-- Real SVG Structure for Alt Block -->
  <g>
      <line x1="64" y1="225" x2="375" y2="225" class="loopLine"></line>
      <line x1="375" y1="225" x2="375" y2="575" class="loopLine"></line>
      <line x1="64" y1="575" x2="375" y2="575" class="loopLine"></line>
      <line x1="64" y1="225" x2="64" y2="575" class="loopLine"></line>
      
      <!-- Divider -->
      <line x1="64" y1="485" x2="375" y2="485" class="loopLine" style="stroke-dasharray: 3, 3;"></line>
      
      <!-- Label Box (alt) - Note class is labelText, NOT loopText -->
      <polygon points="64,225 114,225 114,238 105.6,245 64,245" class="labelBox"></polygon>
      <text x="89" y="238" class="labelText">alt</text>
      
      <!-- Conditions -->
      <text x="244.5" y="243" class="loopText">[Event Handled]</text>
      <text x="219.5" y="503" class="loopText">[Event Ignored]</text>
  </g>

  <!-- Messages -->
  <text class="messageText" x="200" y="300">Process Interaction</text>
  <line class="messageLine0" x1="100" y1="300" x2="300" y2="300" />
  
  <text class="messageText" x="200" y="520">Default Behavior</text>
  <line class="messageLine0" x1="100" y1="530" x2="300" y2="530" />

</svg>`);

global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;

// --- Load convertSequenceDiagramSvgToMermaidText from content.js ---
const fs = require('fs');
const path = require('path');
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

try {
    eval(contentJsContent);
} catch (e) {
    // Ignore errors related to missing DOM elements or chrome APIs
}


const svg = document.getElementById('mock-sequence');
const result = convertSequenceDiagramSvgToMermaidText(svg);
console.log(result);

if (result.includes("loop alt")) {
    console.log("FAIL: 'alt' block detected as 'loop'");
} else if (result.includes("alt")) {
    console.log("SUCCESS: 'alt' block detected correctly");
} else {
    console.log("UNKNOWN OUTPUT");
}
