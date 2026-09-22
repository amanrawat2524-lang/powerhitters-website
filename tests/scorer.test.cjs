const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/scorer-engine.js');
const Store = require('../js/scorer-store.js');
const { fixture, mockClient } = require('./scorer-mock.js');

for (const [type, runs, total, balls, wickets] of [
  ['normal', 6, 6, 1, 0], ['normal', 0, 0, 1, 0], ['noball', 0, 1, 0, 0],
  ['noball', 6, 7, 0, 0], ['wide', 0, 1, 0, 0], ['wide', 2, 3, 0, 0],
  ['wicket', 0, 0, 1, 1], ['runout', 0, 0, 1, 1], ['runout', 3, 3, 1, 1]
]) test(type + ' + ' + runs, () => {
  const before = fixture();
  const after = E.score(before, E.delivery(type, runs));
  assert.deepEqual([after.runs, after.legal_balls, after.wickets], [total, balls, wickets]);
  assert.deepEqual(E.undo(after), before);
});

test('all supported run choices and invalid combinations', () => {
  for (const runs of [0, 1, 2, 3, 4, 6]) assert.equal(E.delivery('noball', runs).total, runs + 1);
  for (const runs of [0, 1, 2, 3, 4]) assert.equal(E.delivery('wide', runs).total, runs + 1);
  assert.throws(() => E.delivery('wide', 6));
  assert.throws(() => E.delivery('wicket', 1));
  assert.throws(() => E.delivery('noball-wicket', 0));
});

test('overs use legal balls only', () => {
  assert.deepEqual([6, 7, 23, 24].map(E.overs), ['1.0', '1.1', '3.5', '4.0']);
});
test('23 balls + extras remains open; ALL delivery types blocked at 24', () => {
  let s = E.score(fixture({ legal_balls: 23 }), E.delivery('noball', 6));
  assert.equal(s.legal_balls, 23); assert.equal(E.canScore(s), true);
  s = E.score(s, E.delivery('wide', 2));
  s = E.score(s, E.delivery('normal', 0));
  assert.equal(E.canScore(s), false);
  for (const type of ['normal', 'noball', 'wide', 'wicket', 'runout']) assert.throws(() => E.score(s, E.delivery(type, 0)));
});
test('no invented ten-wicket limit', () => {
  const s = E.score(fixture({ wickets: 9 }), E.delivery('wicket', 0));
  assert.equal(s.wickets, 10); assert.equal(E.canScore(s), true);
});

function chase(overrides = {}) {
  return { ...E.endInnings(fixture({ runs: 20, wickets: 3, legal_balls: 24 })), ...overrides };
}
test('innings transition and undo restore target, teams and first score', () => {
  const before = fixture({ runs: 20, wickets: 3, legal_balls: 24 });
  const after = E.endInnings(before);
  assert.deepEqual([after.target, after.batting_team, after.bowling_team, after.runs, after.wickets, after.legal_balls], [21, 'B', 'A', 0, 0, 0]);
  assert.deepEqual(E.undo(after), before);
});
for (const [type, runs, balls] of [['normal', 2, 1], ['noball', 1, 0], ['wide', 1, 0]]) {
  test('winning chase on ' + type + ' and undo auto-finish', () => {
    const before = chase({ runs: 19, legal_balls: 7 });
    const after = E.score(before, E.delivery(type, runs));
    assert.deepEqual([after.runs, after.legal_balls, after.status, after.winner], [21, 7 + balls, 'finished', 'B']);
    assert.deepEqual(E.undo(after), before);
  });
}
for (const [runs, winner] of [[20, 'Tie'], [19, 'A']]) test('chase ends at ' + runs, () => {
  const s = E.score(chase({ runs, legal_balls: 23 }), E.delivery('normal', 0));
  assert.equal(s.winner, winner); assert.equal(s.status, 'finished');
  assert.equal(E.endInnings(chase({ runs })).winner, winner);
});
test('history mapping when team B bats first', () => {
  let s = fixture({ batting_team: 'B', bowling_team: 'A', runs: 20, wickets: 2, legal_balls: 24 });
  s = E.endInnings(s);
  s = E.score(s, E.delivery('normal', 6));
  s = E.endInnings(s);
  const row = E.archiveRow(s);
  assert.deepEqual([row.team_a_runs, row.team_a_balls, row.team_b_runs, row.team_b_wickets, row.team_b_balls, row.match_group], [6, 1, 20, 2, 24, 'Final']);
});
test('first innings survives more than 100 deliveries and refresh', () => {
  let s = chase();
  // High target permits more than 100 extras without finishing.
  s.target = 1001; s.history.find(h => h.innings === 1).runs = 1000;
  for (let i = 0; i < 110; i++) s = E.score(s, E.delivery('wide', 0));
  assert.equal(E.archiveRow(JSON.parse(JSON.stringify(s))).team_a_runs, 1000);
});
test('legacy missing first innings fails visibly instead of inventing zeros', () => {
  assert.throws(() => E.archiveRow(chase({ history: [] })));
});

test('failed and zero-row score writes do not mutate previous state', async () => {
  for (const failure of [{}, { throws: true }, { silent: true }]) {
    const original = fixture(); const c = mockClient(original); const store = new Store(c);
    c.failures.push({ table: 'live_match', verb: 'update', ...failure });
    await assert.rejects(store.write(original, E.score(original, E.delivery('noball', 6))));
    assert.deepEqual(original, fixture());
    assert.deepEqual(c.db.live_match[0], fixture());
  }
});
test('lost response is recovered by reading saved state; stale retry cannot score twice', async () => {
  const original = fixture(); const c = mockClient(original); const store = new Store(c);
  const candidate = E.score(original, E.delivery('noball', 6));
  c.failures.push({ table: 'live_match', verb: 'update', after: true });
  await assert.rejects(store.write(original, candidate));
  assert.equal((await store.load()).runs, 7);
  await assert.rejects(store.write(original, candidate));
  assert.equal((await store.load()).runs, 7);
});
test('two stale scorer tabs cannot overwrite each other', async () => {
  const c = mockClient(); const store = new Store(c); const before = await store.load();
  const results = await Promise.allSettled([1, 2].map(r => store.write(before, E.score(before, E.delivery('normal', r)))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
test('no session means no writes', async () => {
  const c = mockClient(); c.session = false;
  await assert.rejects(new Store(c).write(fixture(), fixture()));
  assert.equal(c.calls.length, 0);
});
test('finished history is saved once across repeat calls and refresh', async () => {
  const s = E.endInnings(chase({ runs: 20 })); const c = mockClient(s); const store = new Store(c);
  await store.syncArchive(s); await store.syncArchive(s);
  await new Store(c).syncArchive(await store.load());
  assert.equal(c.db.match_history.length, 1); assert.equal(c.db.match_history[0].winner, 'Tie');
});
test('history insert response lost: recovery reuses primary key', async () => {
  const s = E.endInnings(chase({ runs: 20 })); const c = mockClient(s); const store = new Store(c);
  c.failures.push({ table: 'match_history', verb: 'insert', after: true });
  await assert.rejects(store.syncArchive(s));
  await store.syncArchive(s); assert.equal(c.db.match_history.length, 1);
});
test('history read failure never attempts blind insert', async () => {
  const s = E.endInnings(chase()); const c = mockClient(s);
  c.failures.push({ table: 'match_history', verb: 'select' });
  await assert.rejects(new Store(c).syncArchive(s));
  assert.equal(c.calls.filter(x => x.verb === 'insert').length, 0);
});
test('undo finished match removes result; corrected finish uses same ID once', async () => {
  const s = E.score(chase({ runs: 20 }), E.delivery('wide', 0));
  const c = mockClient(s); const store = new Store(c);
  await store.syncArchive(s);
  const restored = await store.write(s, E.undo(s)); await store.syncArchive(restored);
  assert.equal(c.db.match_history.length, 0);
  const corrected = await store.write(restored, E.endInnings(restored)); await store.syncArchive(corrected);
  assert.equal(c.db.match_history.length, 1); assert.equal(c.db.match_history[0].winner, 'Tie');
});
test('denied history deletion is detected and safely retried', async () => {
  const s = E.endInnings(chase()); const c = mockClient(s); const store = new Store(c);
  await store.syncArchive(s);
  const restored = E.undo(s);
  c.failures.push({ table: 'match_history', verb: 'delete', silent: true });
  await assert.rejects(store.syncArchive(restored));
  assert.equal(c.db.match_history.length, 1);
  await store.syncArchive(restored); assert.equal(c.db.match_history.length, 0);
});
test('ID collision never overwrites another history row', async () => {
  const s = E.endInnings(chase()); const c = mockClient(s);
  c.db.match_history.push({ id: -123, team_a: 'Other', played_at: '2020-01-01' });
  await assert.rejects(new Store(c).syncArchive(s));
  assert.equal(c.db.match_history[0].team_a, 'Other');
});
test('same teams and identical result in a new match creates a separate record', async () => {
  const s = E.endInnings(chase()); const c = mockClient(s); const store = new Store(c);
  await store.syncArchive(s);
  const next = E.copy(s); E.metadata(next).archive_id = -456;
  E.metadata(next).played_at = '2026-09-21T00:00:00Z';
  await store.syncArchive(next); assert.equal(c.db.match_history.length, 2);
});
test('legacy completed match adopts its exact existing record', async () => {
  const s = E.endInnings(chase()); s.history = s.history.filter(h => !h.scorer_version);
  const c = mockClient(s); c.db.match_history.push({ ...E.archiveRow(s), id: 5, played_at: '2026-09-20T00:00:00Z' });
  const store = new Store(c); const adopted = await store.withIdentity(s);
  assert.equal(E.metadata(adopted).archive_id, 5);
  await store.syncArchive(adopted); assert.equal(c.db.match_history.length, 1);
});
