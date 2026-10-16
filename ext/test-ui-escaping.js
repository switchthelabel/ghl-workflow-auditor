// node ext/test-ui-escaping.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function view(file) {
  const elements = new Map();
  const document = { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      classList: { toggle() {}, remove() {} }, style: {}
    });
    return elements.get(selector);
  } };
  const context = vm.createContext({ document });
  // Rendering functions only; omit browser event wiring and startup.
  const source = fs.readFileSync(`${__dirname}/${file}`, 'utf8').split('// ---------- actions ----------')[0].split('chrome.storage.session.onChanged.addListener')[0];
  vm.runInContext(source, context);
  return { context, elements };
}

const payload = '<img src=x onerror="alert(1)">&';
const escaped = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;';
const popup = view('popup.js');
popup.context.prog = { loc: payload, tokenMins: payload };
vm.runInContext('paint(prog, null)', popup.context);
assert.equal(popup.elements.get('#meta').innerHTML, `<code>${escaped}</code> &middot; session valid ${escaped} min`);
popup.context.prog = { loc: 'abc123', tokenMins: 5 };
vm.runInContext('paint(prog, null)', popup.context);
assert.equal(popup.elements.get('#meta').innerHTML, '<code>abc123</code> &middot; session valid 5 min');

const panel = view('panel.js');
panel.context.bundle = {
  summary: Object.fromEntries(['workflows', 'published', 'steps', 'live', 'edges', 'notRead'].map(k => [k, payload])),
  findings: [], graph: [], workflows: []
};
vm.runInContext('RESULT = { bundle }; render(bundle)', panel.context);
const stats = panel.elements.get('#stats').innerHTML;
assert.equal(stats.split(escaped).length - 1, 6);
assert.ok(panel.elements.get('#findings').innerHTML.includes(escaped));
panel.context.finding = { severity: 'HIGH', workflow: 'Example', rule: 'Rule', detail: '', contactsInWorkflow: payload };
assert.ok(vm.runInContext('row(finding)', panel.context).includes(`<td class="num">${escaped}</td>`));
// Coercible objects exercise the occurrences > 1 branch while carrying markup.
panel.context.finding.occurrences = { valueOf: () => 2, toString: () => payload };
assert.ok(vm.runInContext('row(finding)', panel.context).includes(`<i>(x${escaped})</i>`));
panel.context.finding.contactsInWorkflow = 3;
panel.context.finding.occurrences = 2;
const normal = vm.runInContext('row(finding)', panel.context);
assert.ok(normal.includes('<td class="num">3</td>'));
assert.ok(normal.includes('<i>(x2)</i>'));
console.log('UI escaping checks passed');
