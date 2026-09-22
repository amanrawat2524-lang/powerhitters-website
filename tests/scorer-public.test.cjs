const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { fixture, mockClient } = require('./scorer-mock.js');

async function mount(source, initial) {
  const elements = new Map(); let ready, realtime;
  const client = mockClient(initial);
  client.channel = () => ({ on(event, filter, callback) {
    assert.equal(filter.table, 'live_match'); assert.equal(filter.filter, 'id=eq.1');
    realtime = callback; return { subscribe() {} };
  } });
  const document = { addEventListener: (event, callback) => { ready = callback; },
    getElementById: id => { if (!elements.has(id)) elements.set(id, { style: {}, hidden: false, textContent: '' }); return elements.get(id); } };
  vm.runInNewContext(source, { document, window: { supabase: { createClient: () => client } }, console });
  ready(); await new Promise(resolve => setImmediate(resolve));
  return { get: document.getElementById, update: match => realtime({ new: match }) };
}
const html = fs.readFileSync(require.resolve('../live.html'), 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
test('public page renders live legal overs/target and realtime tie', async () => {
  const s = fixture({ innings: 2, runs: 9, legal_balls: 7, target: 21 });
  const ui = await mount(source, s);
  assert.equal(ui.get('pageOvers').textContent, '1.1');
  assert.equal(ui.get('pageChaseText').textContent, 'Need 12 runs from 17 balls');
  ui.update({ ...s, runs: 20, status: 'finished', winner: 'Tie' });
  assert.equal(ui.get('pageChaseText').textContent, 'Match tied');
  assert.equal(ui.get('pageLiveStatus').textContent, 'FINAL');
  ui.update({ ...s, runs: 21, status: 'finished', winner: 'B' });
  assert.equal(ui.get('pageChaseText').textContent, 'B won the match');
});
test('public no-match state remains supported', async () => {
  const ui = await mount(source, null);
  assert.equal(ui.get('liveMatchPageCard').style.display, 'none');
  assert.equal(ui.get('noLiveMatch').style.display, 'block');
});
test('homepage banner receives updates, hides final and returns after undo', async () => {
  const ui = await mount(fs.readFileSync(require.resolve('../js/live-score.js'), 'utf8'), fixture());
  assert.equal(ui.get('liveMatchBanner').hidden, false);
  ui.update(fixture({ runs: 7 }));
  assert.match(ui.get('liveBannerText').textContent, /A 7\/0 vs B/);
  ui.update(fixture({ status: 'finished' }));
  assert.equal(ui.get('liveMatchBanner').hidden, true);
  ui.update(fixture()); assert.equal(ui.get('liveMatchBanner').hidden, false);
});
