document.addEventListener('DOMContentLoaded', async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const E = window.PowerHittersScoring;
  if (!window.supabase || !E || !window.PowerHittersScorerStore) {
    $('authGate').querySelector('h1').textContent = 'Scorer could not load. Check your connection and refresh.';
    return;
  }
  async function boundedFetch(input, options = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    try {
      return await fetch(input, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  const client = window.supabase.createClient('https://icebgysininolvjbueet.supabase.co',
    'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4', { global: { fetch: boundedFetch } });
  const store = new window.PowerHittersScorerStore(client);
  let state = null;
  let pending = null;
  let mode = 'normal';
  let saving = false;
  let blocked = false;
  let authenticated = false;
  let message = 'Ready — select a delivery.';

  function render() {
    const locked = saving || blocked || !authenticated;
    const active = !locked && E.canScore(state);
    document.querySelectorAll('[data-delivery]').forEach(button => {
      button.disabled = !active;
      button.setAttribute('aria-pressed', String(button.dataset.delivery === mode));
    });
    document.querySelectorAll('[data-runs]').forEach(button => {
      const runs = Number(button.dataset.runs);
      const valid = mode === 'wide' ? runs <= 4 : mode === 'runout' ? runs <= 3 : mode === 'wicket' ? runs === 0 : true;
      button.hidden = !valid;
      button.disabled = !active || !valid;
      button.setAttribute('aria-pressed', String(pending?.runs === runs));
    });
    $('runChoiceLabel').textContent = mode === 'noball' ? 'Select BAT RUNS (penalty +1 included)' :
      mode === 'wide' ? 'Select ADDITIONAL RUNS (wide +1 included)' :
      mode === 'runout' ? 'Select COMPLETED RUNS' : mode === 'wicket' ? 'Wicket — no runs added' : 'Select RUNS';
    $('confirmBtn').disabled = !active || !pending;
    $('confirmBtn').textContent = saving ? 'SAVING…' : 'CONFIRM / NEXT BALL';
    $('cancelBtn').disabled = locked || !pending;
    $('deliveryPreview').textContent = pending ?
      (pending.type === 'noball' ? 'NO BALL + ' + pending.runs + ' BAT RUNS' :
        pending.type === 'wide' ? 'WIDE + ' + pending.runs + ' ADDITIONAL' :
        pending.type === 'runout' ? 'RUN OUT + ' + pending.runs + ' COMPLETED RUNS' :
        pending.type === 'wicket' ? 'WICKET' : pending.runs + ' RUNS') +
      '\nTOTAL: ' + pending.total + ' RUNS' + (pending.wicket ? ' · +1 WICKET' : '') +
      '\n' + (pending.legal ? 'LEGAL BALL' : 'BALL NOT COUNTED') : 'No delivery selected. Nothing will save until you confirm.';
    $('saveState').textContent = message;
    $('saveState').setAttribute('role', blocked ? 'alert' : 'status');
    $('recoveryBtn').hidden = !blocked;
    $('recoveryBtn').disabled = saving;
    $('startMatchBtn').disabled = locked;
    $('logoutBtn').disabled = saving;
    document.querySelectorAll('#setupCard input, #setupCard select').forEach(el => { el.disabled = locked; });
    $('setupMessage').textContent = message;
    $('setupRecoveryBtn').hidden = !blocked;
    $('setupRecoveryBtn').disabled = saving;
    if (!state) return;
    $('runs').textContent = state.runs;
    $('wickets').textContent = state.wickets;
    $('oversText').textContent = E.overs(state.legal_balls);
    $('limitText').textContent = state.overs_limit;
    $('battingName').textContent = state.batting_team || '—';
    $('bowlingName').textContent = state.bowling_team || '—';
    $('inningsLabel').textContent = state.innings === 1 ? '1st Innings' : '2nd Innings';
    $('targetWrap').hidden = state.innings !== 2;
    $('targetText').textContent = state.target ?? '—';
    $('chaseInfo').hidden = state.innings !== 2;
    $('chaseInfo').textContent = state.status === 'finished' ?
      (state.winner === 'Tie' ? 'MATCH TIED' : state.winner ? state.winner + ' won the match' : 'Match finished') :
      'Need ' + Math.max(0, state.target - state.runs) + ' runs from ' + Math.max(0, E.maxBalls(state) - state.legal_balls) + ' balls';
    $('matchStatus').textContent = state.status === 'finished' ? 'MATCH FINISHED' :
      state.legal_balls >= E.maxBalls(state) ? 'INNINGS COMPLETE' : 'LIVE';
    $('inningsBtn').textContent = state.innings === 1 ? 'END 1ST / START 2ND INNINGS' : 'END 2ND INNINGS';
    $('inningsBtn').disabled = locked || !!pending || state.status !== 'live';
    $('finishBtn').disabled = locked || !!pending || state.status !== 'live' || state.innings !== 2;
    $('undoBtn').disabled = locked || !!pending || E.snapshots(state).length === 0;
    $('newMatchBtn').disabled = locked || !!pending || state.status !== 'finished';
  }

  function showMatch() {
    const exists = state && state.status !== 'not_started' && state.team_a;
    $('setupCard').hidden = !!exists || !authenticated;
    $('scorerCard').hidden = !exists || !authenticated;
  }

  function failed(error) {
    blocked = true;
    pending = null;
    message = 'Scoring paused: ' + (error.message || String(error)) +
      ' Use RELOAD / RETRY SYNC, then verify the displayed score before selecting another delivery. Do not repeat the last ball blindly.';
  }

  async function change(build) {
    if (saving || blocked || !authenticated) return;
    saving = true;
    message = 'Saving…';
    render();
    try {
      const candidate = await build();
      state = await store.write(state, candidate);
      pending = null;
      mode = 'normal';
      showMatch();
      // Keep controls locked until BOTH score and result persistence are verified.
      await store.syncArchive(state);
      message = state.status === 'finished' ? 'Saved — match finished and history verified.' :
        state.legal_balls >= E.maxBalls(state) ? 'Over limit reached. End the innings to start the chase.' : 'Saved ✓ — select the next delivery.';
    } catch (error) {
      failed(error);
    } finally {
      saving = false;
      render();
    }
  }

  async function recover() {
    if (saving || !authenticated) return;
    saving = true;
    pending = null;
    message = 'Loading saved match and checking history…';
    render();
    try {
      await store.authenticated();
      state = await store.load();
      if (state?.team_a && state.status !== 'not_started') {
        if (!E.metadata(state)) {
          const adopted = await store.withIdentity(state);
          state = await store.write(state, adopted);
        }
        await store.syncArchive(state);
      }
      blocked = false;
      mode = 'normal';
      message = 'Saved match loaded. Verify the score, then select the next delivery.';
    } catch (error) {
      failed(error);
    } finally {
      showMatch();
      saving = false;
      render();
    }
  }

  document.querySelectorAll('[data-delivery]').forEach(button => button.addEventListener('click', () => {
    if (saving || blocked || !authenticated || !E.canScore(state)) return;
    mode = button.dataset.delivery;
    pending = mode === 'wicket' ? E.delivery('wicket', 0) : null;
    render();
  }));
  document.querySelectorAll('[data-runs]').forEach(button => button.addEventListener('click', () => {
    if (saving || blocked || !authenticated || !E.canScore(state)) return;
    pending = E.delivery(mode, Number(button.dataset.runs));
    render();
  }));
  $('cancelBtn').addEventListener('click', () => {
    if (saving || blocked) return;
    pending = null;
    mode = 'normal';
    render();
  });
  $('confirmBtn').addEventListener('click', () => {
    if (!pending) return;
    const selection = pending;
    change(() => E.score(state, selection));
  });
  $('undoBtn').addEventListener('click', () => {
    if (pending || saving || blocked) return;
    change(() => E.undo(state));
  });
  function endInnings() {
    if (pending || saving || blocked || state?.status !== 'live') return;
    if (!confirm('End innings at ' + state.runs + '/' + state.wickets + ' (' + E.overs(state.legal_balls) + ' overs)?')) return;
    change(() => E.endInnings(state));
  }
  $('inningsBtn').addEventListener('click', endInnings);
  $('finishBtn').addEventListener('click', () => { if (state?.innings === 2) endInnings(); });
  $('newMatchBtn').addEventListener('click', () => {
    if (saving || blocked || pending || state?.status !== 'finished') return;
    if (!confirm('Set up the next match? The completed result remains in match history.')) return;
    $('scorerCard').hidden = true;
    $('setupCard').hidden = false;
    $('backToMatchBtn').hidden = false;
  });
  $('backToMatchBtn').addEventListener('click', () => { if (!saving) showMatch(); });
  $('startMatchBtn').addEventListener('click', () => {
    if (saving || blocked || !authenticated) return;
    const teamA = $('teamA').value.trim();
    const teamB = $('teamB').value.trim();
    const overs = Number($('oversLimit').value);
    if (!teamA || !teamB || teamA.toLowerCase() === teamB.toLowerCase()) {
      alert('Enter two different team names.'); return;
    }
    if (!Number.isInteger(overs) || overs < 1 || overs > 50) {
      alert('Enter a whole number of overs from 1 to 50.'); return;
    }
    const first = $('battingFirst').value === 'A';
    change(async () => {
      if (state) await store.syncArchive(state);
      return store.withIdentity({ id: 1, team_a: teamA, team_b: teamB, overs_limit: overs,
        batting_team: first ? teamA : teamB, bowling_team: first ? teamB : teamA,
        innings: 1, runs: 0, wickets: 0, legal_balls: 0, target: null,
        status: 'live', winner: null, history: [] });
    });
  });
  $('recoveryBtn').addEventListener('click', recover);
  $('setupRecoveryBtn').addEventListener('click', recover);
  $('logoutBtn').addEventListener('click', async () => {
    if (saving) return;
    await client.auth.signOut();
    window.location.href = 'admin.html';
  });
  client.auth.onAuthStateChange((event, session) => {
    authenticated = !!session;
    if (!session) {
      pending = null;
      $('authGate').hidden = false;
      $('authGate').querySelector('h1').textContent = 'Admin login required';
      $('setupCard').hidden = $('scorerCard').hidden = true;
    }
    render();
  });
  window.addEventListener('beforeunload', event => {
    if (saving || pending) { event.preventDefault(); event.returnValue = ''; }
  });
  try {
    await store.authenticated();
    authenticated = true;
    $('authGate').hidden = true;
    await recover();
  } catch (error) {
    $('authGate').querySelector('h1').textContent = error.message;
  }
});
