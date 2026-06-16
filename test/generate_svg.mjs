import jsdom from "jsdom";
const { JSDOM } = jsdom;

const dom = new JSDOM('<!DOCTYPE html><body><div id="container"></div></body>');
global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.SVGElement = dom.window.SVGElement;

// Mock getBBox
dom.window.SVGElement.prototype.getBBox = function () {
    const text = this.textContent || "";
    return {
        x: 0,
        y: 0,
        width: text.length * 8 + 10,
        height: 20
    };
};

global.window.requestAnimationFrame = (callback) => setTimeout(callback, 0);

import mermaid from "mermaid";

mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose'
});

const code = `sequenceDiagram
    participant User
    participant QCustomPlot
    participant Element as Plot Element
    
    User->>QCustomPlot: Mouse/Key Event
    QCustomPlot->>Element: Propagate Event
    Element-->>QCustomPlot: Handle or Ignore
    alt Event Handled
        QCustomPlot->>QCustomPlot: Process Interaction
        QCustomPlot->>QCustomPlot: Update State
        QCustomPlot->>User: Visual Feedback
    else Event Ignored
        QCustomPlot->>User: Default Behavior
    end`;

async function run() {
    try {
        const { svg } = await mermaid.render('graphDiv', code);
        console.log(svg);
    } catch (e) {
        console.error(e);
    }
}

run();
