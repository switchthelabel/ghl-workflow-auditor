// node ext/test-popup.js -- opening a popup must never start an audit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function check(prog, result, visible, button) {
  const nodes = {}, messages = [];
  const context = vm.createContext({
    document: { querySelector: selector => nodes[selector] ||= {
      style: {}, classList: { toggle: (_, hidden) => { nodes[selector].hidden = hidden; } }
    } },
    chrome: {
      tabs: { query: async () => [{ id: 7, url: 'https://app.gohighlevel.com/v2/location/AAAAAAAAAAAAAAAAAAAA/automation' }] },
      runtime: { getManifest: () => ({ version: 'test' }), sendMessage: async msg => messages.push(msg) },
      storage: { session: { get: async () => ({ prog, result }), onChanged: { addListener() {} } } }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8'), context);
  await new Promise(setImmediate);
  assert.equal(messages.length, 0, 'opening the popup must not start an audit');
  assert.equal(nodes[visible].hidden, false, `${visible} should be visible`);
  if (button) {
    await nodes[button].onclick();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'start');
    assert.equal(messages[0].tabId, 7);
  }
}

(async () => {
  await check(undefined, undefined, '#go', '#go');
  await check({ status: 'running', at: Date.now(), done: 1, total: 2 }, undefined, '#running');
  await check({ status: 'running', at: Date.now() - 120000 }, undefined, '#again', '#again');
  await check({ status: 'error', at: Date.now(), error: 'failed' }, undefined, '#again', '#again');
  await check({ status: 'done', loc: 'other-account' }, {
    loc: 'other-account', bundle: { findings: [], summary: { workflows: 1 } }
  }, '#done', '#again');
  console.log('Popup checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
