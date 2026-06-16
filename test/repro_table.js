// Verify convertTableToMarkdown against a real DeepWiki HTML table.
// Run: node test/repro_table.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// processNode is recursive so we eval it together with convertTableToMarkdown.
const fnNames = ['convertTableToMarkdown', 'processNode'];
const exported = {};
for (const name of fnNames) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = contentSrc.match(re);
  if (!m) { console.error('Could not extract', name); process.exit(1); }
  exported[name] = m[0];
}

const html = `<table><thead><tr><th>Directory</th><th>Purpose</th></tr></thead><tbody><tr><td><code class="x">src/vs/</code></td><td>All product TypeScript source</td></tr><tr><td><code>extensions/</code></td><td>Built-in extensions bundled with the product</td></tr><tr><td><code>remote/</code></td><td>Remote Extension Host package (<code>vscode-reh</code>)</td></tr><tr><td><code>remote/web/</code></td><td>Web-only remote package (<code>vscode-web</code>)</td></tr><tr><td><code>build/</code></td><td>Gulp-based build toolchain and CI scripts</td></tr><tr><td><code>test/</code></td><td>Unit, browser, and smoke tests</td></tr></tbody></table>`;

const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
const table = dom.window.document.querySelector('table');
if (!table) { console.error('no table found'); process.exit(1); }

const DEBUG_MODE = false;
const Node = dom.window.Node;
eval(exported.processNode);
eval(exported.convertTableToMarkdown);

console.log('=== Real DeepWiki table ===');
console.log(convertTableToMarkdown(table));

// Edge case: no thead, first <tr> auto-promoted
const html2 = `<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>`;
const dom2 = new JSDOM(`<!DOCTYPE html><body>${html2}</body>`);
const table2 = dom2.window.document.querySelector('table');
console.log('=== Loose <tr> (no thead/tbody) ===');
console.log(convertTableToMarkdown(table2));

// Edge case: pipe in cell
const html3 = `<table><thead><tr><th>Op</th><th>Note</th></tr></thead><tbody><tr><td>a | b</td><td>or</td></tr></tbody></table>`;
const dom3 = new JSDOM(`<!DOCTYPE html><body>${html3}</body>`);
const table3 = dom3.window.document.querySelector('table');
console.log('=== Pipe escape ===');
console.log(convertTableToMarkdown(table3));
