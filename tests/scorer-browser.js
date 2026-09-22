(async function () {
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const results = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  async function until(fn) { for (let i = 0; i < 200; i++) { if (fn()) return; await sleep(20); } throw new Error('Timed out waiting for scorer'); }
  const settled = () => until(() => $('confirmBtn').textContent !== 'SAVING…');
  async function check(name, run) { await run(); results.push('PASS: ' + name); }
  function select(type, runs) {
    document.querySelector('[data-delivery="' + type + '"]').click();
    if (type !== 'wicket') document.querySelector('[data-runs="' + runs + '"]').click();
  }
  async function ball(type, runs) { select(type, runs); $('confirmBtn').click(); await settled(); }
  try {
    await until(() => !$('scorerCard').hidden && $('undoBtn').disabled && !$('noBallBtn').disabled);
    await check('selection and cancellation write nothing', async () => {
      const count = testClient.calls.length;
      select('noball', 6);
      assert($('deliveryPreview').textContent.includes('TOTAL: 7 RUNS'), 'No-ball preview');
      assert($('deliveryPreview').textContent.includes('BALL NOT COUNTED'), 'Illegal ball preview');
      assert($('runs').textContent === '0', 'No premature score');
      $('cancelBtn').click(); assert(testClient.calls.length === count, 'Selection must not save');
    });
    await check('double click saves one delivery and locks all controls', async () => {
      testClient.delay = 40;
      select('noball', 6);
      $('confirmBtn').click(); $('confirmBtn').click();
      assert($('noBallBtn').disabled && $('undoBtn').disabled && $('newMatchBtn').disabled && $('logoutBtn').disabled, 'Controls locked');
      await settled(); testClient.delay = 0;
      assert($('runs').textContent === '7' && $('oversText').textContent === '0.0', 'Single NB+6');
      assert(testClient.calls.filter(c => c.table === 'live_match' && c.verb === 'update').length === 1, 'One write');
    });
    await check('Undo exactly restores extra', async () => {
      $('undoBtn').click(); await settled(); assert($('runs').textContent === '0', 'Undo score');
    });
    await check('normal six, dot, wide+2 and wicket', async () => {
      await ball('normal', 6); await ball('normal', 0); await ball('wide', 2); await ball('wicket', 0);
      assert($('runs').textContent === '9' && $('wickets').textContent === '1' && $('oversText').textContent === '0.3', 'Combined score');
    });
    await check('failed save freezes scoring and recovery keeps last saved score', async () => {
      testClient.failures.push({ table: 'live_match', verb: 'update' });
      await ball('normal', 6);
      assert($('runs').textContent === '9' && !$('recoveryBtn').hidden && $('noBallBtn').disabled, 'Failure state');
      $('recoveryBtn').click(); await settled(); assert(!$('noBallBtn').disabled && $('runs').textContent === '9', 'Recovery');
    });
    await check('lost response reloads committed delivery without scoring twice', async () => {
      testClient.failures.push({ table: 'live_match', verb: 'update', after: true });
      await ball('normal', 1); assert(!$('recoveryBtn').hidden, 'Lost response paused');
      $('recoveryBtn').click(); await settled(); assert($('runs').textContent === '10' && $('oversText').textContent === '0.4', 'Reload saved state');
    });
    await check('first innings transition and boundary undo', async () => {
      $('inningsBtn').click(); await settled(); assert($('targetText').textContent === '11' && $('battingName').textContent === 'B', 'Chase setup');
      $('undoBtn').click(); await settled(); assert($('runs').textContent === '10' && $('battingName').textContent === 'A' && $('targetWrap').hidden, 'Transition undo');
      $('inningsBtn').click(); await settled();
    });
    await check('win on no-ball archives once; Undo removes result; tie reuses ID', async () => {
      await ball('normal', 6); await ball('normal', 4); await ball('noball', 0);
      assert($('matchStatus').textContent === 'MATCH FINISHED' && $('oversText').textContent === '0.2', 'NB win');
      assert(testClient.db.match_history.length === 1, 'One result');
      $('undoBtn').click(); await settled(); assert(testClient.db.match_history.length === 0, 'Removed result');
      assert($('runs').textContent === '10' && !$('noBallBtn').disabled, 'Reopened chase');
      $('finishBtn').click(); await settled(); assert(testClient.db.match_history.length === 1 && testClient.db.match_history[0].winner === 'Tie', 'Tie archive');
      assert($('chaseInfo').textContent === 'MATCH TIED', 'Tie display');
    });
    await check('new match setup validates names and starts once', async () => {
      $('newMatchBtn').click(); $('teamA').value = 'Same'; $('teamB').value = 'Same'; $('startMatchBtn').click();
      assert(window.lastAlert.includes('different'), 'Name validation');
      $('teamA').value = 'PowerHitters'; $('teamB').value = 'Warriors';
      testClient.delay = 20; $('startMatchBtn').click(); $('startMatchBtn').click(); await settled(); testClient.delay = 0;
      assert($('battingName').textContent === 'PowerHitters' && $('runs').textContent === '0', 'New match');
      assert(testClient.db.match_history.length === 1, 'Old history retained');
    });
    await check('all deliveries disabled at 24 legal balls', async () => {
      for (let i = 0; i < 23; i++) await ball('normal', 0);
      await ball('noball', 0); assert($('oversText').textContent === '3.5' && !$('noBallBtn').disabled, '23 + NB open');
      await ball('normal', 0); assert($('oversText').textContent === '4.0' && $('wideBtn').disabled && $('noBallBtn').disabled, 'All locked at 24');
      $('undoBtn').click(); await settled(); assert(!$('noBallBtn').disabled, 'Undo reopens innings');
    });
    select('noball', 4);
    const report = document.createElement('pre'); report.id = 'browserTestResults';
    report.style.cssText = 'background:white;color:#111;padding:16px;white-space:pre-wrap';
    report.textContent = results.join('\n') + '\nALL ' + results.length + ' BROWSER CHECKS PASSED'; document.body.append(report);
    await fetch('/results', { method: 'POST', body: report.textContent });
  } catch (error) {
    const report = document.createElement('pre'); report.id = 'browserTestResults'; report.textContent = results.join('\n') + '\nFAIL: ' + error.stack;
    document.body.append(report); await fetch('/results', { method: 'POST', body: report.textContent });
  }
})();
