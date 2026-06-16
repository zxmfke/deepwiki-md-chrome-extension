const jsdom = require("jsdom");
const { JSDOM } = jsdom;

// Mock DOM environment
const dom = new JSDOM(`<!DOCTYPE html>
<svg id="mock-sequence">
  <!-- Participants -->
  <text class="actor-box" x="100">Client</text>
  <text class="actor-box" x="300">key: seat-1</text>

  <!-- Messages -->
  <text class="messageText" x="200" y="150">Request</text>
  <line class="messageLine0" x1="100" y1="160" x2="300" y2="160" />
</svg>`);

global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;

// Import content.js logic (simulated by reading file or pasting relevant parts)
// Since we can't require content.js directly if it's not a module, we'll need to rely on the fact that we are modifying it.
// For this test script, I will assume we are running it in an environment where I can paste the function or I will read it.
// To make it self-contained for the tool usage, I will read content.js and eval it, or just copy the necessary parts.
// But `content.js` is large. I'll use the `fs` module to read it.

const fs = require('fs');
const path = require('path');
const contentJsPath = path.join(__dirname, '../content.js');
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8');

// We need to extract the function `convertSequenceDiagramSvgToMermaidText` and its helpers.
// Since they are not exported, we can eval the file content in the global scope or a context.
// However, content.js might have other side effects.
// A safer way for this specific task is to extract the relevant functions using regex or just assume the user will apply the fix and we run this.
// Let's try to eval the necessary parts.

// Quick hack: Remove the last part of content.js that executes logic and just keep definitions.
// Or better, just mock the function here with the *current* logic to demonstrate failure, then update it.
// But I want to verify the *actual* file.

// Let's try to load the file content and execute it in a VM or just eval.
// content.js usually runs in browser context.
// It might have `chrome.runtime.onMessage` listeners.
// We can mock `chrome` object.
global.chrome = {
    runtime: {
        onMessage: {
            addListener: () => { }
        }
    }
};
global.DEBUG_MODE = false;

// Eval the content.js to load functions into global scope
// We need to make sure `convertSequenceDiagramSvgToMermaidText` is accessible.
// It is defined as a function in the global scope of the file (or inside an IIFE?).
// Looking at content.js, it seems to be top-level functions or inside a block.
// Let's check if it's inside an IIFE.
// It seems to be top-level code.

try {
    eval(contentJsContent);
} catch (e) {
    // Ignore errors related to missing DOM elements or chrome APIs that we didn't mock fully
    // console.log("Eval error (expected):", e.message);
}

// Now `convertSequenceDiagramSvgToMermaidText` should be available if it's global.
// If it's not (e.g. const/let in top level), it might not be attached to global.
// Let's check.

if (typeof convertSequenceDiagramSvgToMermaidText !== 'function') {
    console.error("Could not load function from content.js. It might be scoped.");
    // Fallback: We will copy the logic we want to test into this script for the reproduction *if* we can't load it.
    // But ideally we test the file.
    // As a workaround, I will assume the function is available or I will paste the *current* implementation of generateMermaidCode here to test it.
}

const svg = document.getElementById('mock-sequence');
const result = convertSequenceDiagramSvgToMermaidText(svg);
console.log(result);

if (result && result.includes('participant p2 as "key: seat-1"')) {
    console.log("SUCCESS: Participant alias is used.");
} else if (result && result.includes('participant "key: seat-1"')) {
    console.log("FAIL: Participant name is quoted but not aliased.");
} else {
    console.log("UNKNOWN OUTPUT");
}
