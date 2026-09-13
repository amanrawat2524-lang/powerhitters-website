document.addEventListener('DOMContentLoaded', async function () {
  const SUPABASE_URL = 'https://icebgysininolvjbueet.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4';

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const authGate = document.getElementById('authGate');
  const setupCard = document.getElementById('setupCard');
  const scorerCard = document.getElementById('scorerCard');
  const logoutBtn = document.getElementById('logoutBtn');

  let state = null;
  let saving = false;

  function ballsToOvers(balls) {
    return Math.floor((balls || 0) / 6) + '.' + ((balls || 0) % 6);
  }

  function cloneState(s) {
    return {
      runs: s.runs,
      wickets: s.wickets,
      legal_balls: s.legal_balls,
      innings: s.innings,
      batting_team: s.batting_team,
      bowling_team: s.bowling_team,
      target: s.target,
      status: s.status,
      winner: s.winner || null
    };
  }

  function safeHistory() {
    return Array.isArray(state?.history) ? state.history : [];
  }

  function pushHistory() {
    const h = safeHistory();

    h.push(cloneState(state));

    if (h.length > 100) {
      h.shift();
    }

    state.history = h;
  }

  function maxBalls() {
    return Number(state?.overs_limit || 4) * 6;
  }

  function chaseText() {
    if (!state || state.innings !== 2 || !state.target) {
      return '';
    }

    const need = Math.max(0, state.target - state.runs);
    const ballsLeft = Math.max(0, maxBalls() - state.legal_balls);

    if (need <= 0) {
      return state.batting_team + ' won the chase';
    }

    return (
      'Need ' +
      need +
      ' run' +
      (need === 1 ? '' : 's') +
      ' from ' +
      ballsLeft +
      ' ball' +
      (ballsLeft === 1 ? '' : 's')
    );
  }

  async function saveState() {
    if (!state) {
      return false;
    }

    saving = true;
    render();

    const saveStateEl = document.getElementById('saveState');

    if (saveStateEl) {
      saveStateEl.textContent = 'Saving…';
    }

    const payload = {
      team_a: state.team_a,
      team_b: state.team_b,
      overs_limit: state.overs_limit,
      innings: state.innings,
      batting_team: state.batting_team,
      bowling_team: state.bowling_team,
      runs: state.runs,
      wickets: state.wickets,
      legal_balls: state.legal_balls,
      target: state.target,
      status: state.status,
      winner: state.winner || null,
      history: state.history || [],
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from('live_match')
      .update(payload)
      .eq('id', 1);

    saving = false;

    if (error) {
      if (saveStateEl) {
        saveStateEl.textContent = 'Save failed';
      }

      alert('Could not save score: ' + error.message);

      render();

      return false;
    }

    if (saveStateEl) {
      saveStateEl.textContent = 'Saved ✓';
    }

    render();

    return true;
  }

  function checkAutoFinish() {
    if (!state || state.status !== 'live') {
      return;
    }

    if (
      state.innings === 2 &&
      state.target &&
      state.runs >= state.target
    ) {
      state.status = 'finished';
      state.winner = state.batting_team;
    }
  }

  function render() {
    if (!state) {
      return;
    }

    const $ = (id) => document.getElementById(id);

    if ($('runs')) {
      $('runs').textContent = state.runs;
    }

    if ($('wickets')) {
      $('wickets').textContent = state.wickets;
    }

    if ($('oversText')) {
      $('oversText').textContent = ballsToOvers(state.legal_balls);
    }

    if ($('limitText')) {
      $('limitText').textContent = state.overs_limit;
    }

    if ($('battingName')) {
      $('battingName').textContent = state.batting_team || '—';
    }

    if ($('bowlingName')) {
      $('bowlingName').textContent = state.bowling_team || '—';
    }

    if ($('inningsLabel')) {
      $('inningsLabel').textContent =
        state.innings === 1 ? '1st Innings' : '2nd Innings';
    }

    if (state.innings === 2 && state.target) {
      if ($('targetWrap')) {
        $('targetWrap').hidden = false;
      }

      if ($('targetText')) {
        $('targetText').textContent = state.target;
      }
    } else {
      if ($('targetWrap')) {
        $('targetWrap').hidden = true;
      }
    }

    const chase = chaseText();

    if ($('chaseInfo')) {
      $('chaseInfo').hidden = !chase;
      $('chaseInfo').textContent = chase;
    }

    if ($('matchStatus')) {
      $('matchStatus').textContent =
        state.status === 'finished'
          ? 'MATCH FINISHED'
          : state.status === 'live'
          ? 'LIVE'
          : 'READY';
    }

    if ($('inningsBtn')) {
      $('inningsBtn').textContent =
        state.innings === 1
          ? 'END 1ST INNINGS'
          : 'END 2ND INNINGS';

      $('inningsBtn').disabled =
        saving || state.status === 'finished';
    }

    document
      .querySelectorAll(
        '[data-runs], [data-action="dot"], #wicketBtn, #wideBtn, #noBallBtn'
      )
      .forEach(function (el) {
        el.disabled =
          saving ||
          state.status !== 'live' ||
          (
            state.legal_balls >= maxBalls() &&
            !el.matches('#wideBtn, #noBallBtn')
          );
      });

    if ($('undoBtn')) {
      $('undoBtn').disabled =
        saving || safeHistory().length === 0;
    }

    if ($('finishBtn')) {
      $('finishBtn').disabled =
        saving || state.status === 'finished';
    }

    if (
      $('saveState') &&
      state.legal_balls >= maxBalls() &&
      state.status === 'live'
    ) {
      $('saveState').textContent =
        'Over limit reached — end innings.';
    }
  }

  async function scoreRuns(runsToAdd) {
    if (!state || saving || state.status !== 'live') {
      return;
    }

    if (state.legal_balls >= maxBalls()) {
      return;
    }

    pushHistory();

    state.runs += runsToAdd;
    state.legal_balls += 1;

    checkAutoFinish();

    const wasFinished =
      state.status === 'finished';

    await saveState();

    if (wasFinished) {
      await saveFinishedMatchToHistory();
    }
  }

  async function addExtra() {
    if (!state || saving || state.status !== 'live') {
      return;
    }

    pushHistory();

    state.runs += 1;

    checkAutoFinish();

    const wasFinished =
      state.status === 'finished';

    await saveState();

    if (wasFinished) {
      await saveFinishedMatchToHistory();
    }
  }

  async function addWicket() {
    if (!state || saving || state.status !== 'live') {
      return;
    }

    if (state.legal_balls >= maxBalls()) {
      return;
    }

    pushHistory();

    state.wickets += 1;
    state.legal_balls += 1;

    await saveState();
  }

  async function undo() {
    const h = safeHistory();

    if (!h.length || saving) {
      return;
    }

    const previous = h.pop();

    state.runs = previous.runs;
    state.wickets = previous.wickets;
    state.legal_balls = previous.legal_balls;
    state.innings = previous.innings;
    state.batting_team = previous.batting_team;
    state.bowling_team = previous.bowling_team;
    state.target = previous.target;
    state.status = previous.status;
    state.winner = previous.winner || null;
    state.history = h;

    await saveState();
  }

  function getFirstInningsSnapshot() {
    const h = safeHistory();

    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i] && h[i].innings === 1) {
        return h[i];
      }
    }

    return null;
  }

  function buildMatchHistoryRow() {
    const first = getFirstInningsSnapshot();

    if (!first || state.innings !== 2) {
      return null;
    }

    let teamARuns = 0;
    let teamAWickets = 0;
    let teamABalls = 0;

    let teamBRuns = 0;
    let teamBWickets = 0;
    let teamBBalls = 0;

    if (first.batting_team === state.team_a) {
      teamARuns = first.runs || 0;
      teamAWickets = first.wickets || 0;
      teamABalls = first.legal_balls || 0;
    } else if (first.batting_team === state.team_b) {
      teamBRuns = first.runs || 0;
      teamBWickets = first.wickets || 0;
      teamBBalls = first.legal_balls || 0;
    }

    if (state.batting_team === state.team_a) {
      teamARuns = state.runs || 0;
      teamAWickets = state.wickets || 0;
      teamABalls = state.legal_balls || 0;
    } else if (state.batting_team === state.team_b) {
      teamBRuns = state.runs || 0;
      teamBWickets = state.wickets || 0;
      teamBBalls = state.legal_balls || 0;
    }

    return {
      team_a: state.team_a,
      team_b: state.team_b,
      overs_limit: state.overs_limit,

      team_a_runs: teamARuns,
      team_a_wickets: teamAWickets,
      team_a_balls: teamABalls,

      team_b_runs: teamBRuns,
      team_b_wickets: teamBWickets,
      team_b_balls: teamBBalls,

      winner: state.winner || null,
      match_group: 'Group Stage'
    };
  }

  async function saveFinishedMatchToHistory() {
    if (!state || state.status !== 'finished') {
      return;
    }

    const row = buildMatchHistoryRow();

    if (!row) {
      return;
    }

    const { data: existing } = await client
      .from('match_history')
      .select('id')
      .eq('team_a', row.team_a)
      .eq('team_b', row.team_b)
      .eq('team_a_runs', row.team_a_runs)
      .eq('team_b_runs', row.team_b_runs)
      .eq('winner', row.winner)
      .limit(1);

    if (existing && existing.length) {
      return;
    }

    const { error } = await client
      .from('match_history')
      .insert(row);

    if (error) {
      console.error(
        'Could not save match history:',
        error
      );

      alert(
        'Match finished, but history save failed: ' +
          error.message
      );
    }
  }

  async function switchInnings() {
    if (!state || saving) {
      return;
    }

    if (state.innings === 1) {
      if (
        !confirm(
          'End first innings at ' +
            state.runs +
            '/' +
            state.wickets +
            '?'
        )
      ) {
        return;
      }

      pushHistory();

      state.target = state.runs + 1;
      state.innings = 2;

      const oldBatting =
        state.batting_team;

      state.batting_team =
        state.bowling_team;

      state.bowling_team =
        oldBatting;

      state.runs = 0;
      state.wickets = 0;
      state.legal_balls = 0;
      state.status = 'live';
      state.winner = null;

      await saveState();

      return;
    }

    if (
      !confirm(
        'End second innings and finish the match?'
      )
    ) {
      return;
    }

    await finishMatch();
  }

  async function finishMatch() {
    if (!state || saving) {
      return;
    }

    pushHistory();

    if (state.innings === 2 && state.target) {
      state.winner =
        state.runs >= state.target
          ? state.batting_team
          : state.bowling_team;
    }

    state.status = 'finished';

    const saved = await saveState();

    if (saved) {
      await saveFinishedMatchToHistory();
    }
  }

  async function startMatch() {
    const teamA =
      document
        .getElementById('teamA')
        ?.value.trim();

    const teamB =
      document
        .getElementById('teamB')
        ?.value.trim();

    const overs =
      parseInt(
        document
          .getElementById('oversLimit')
          ?.value || '4',
        10
      );

    const first =
      document
        .getElementById('battingFirst')
        ?.value || 'A';

    if (!teamA || !teamB) {
      alert('Enter both team names.');
      return;
    }

    if (!overs || overs < 1) {
      alert('Enter a valid over count.');
      return;
    }

    state = {
      id: 1,

      team_a: teamA,
      team_b: teamB,

      overs_limit: overs,

      innings: 1,

      batting_team:
        first === 'A'
          ? teamA
          : teamB,

      bowling_team:
        first === 'A'
          ? teamB
          : teamA,

      runs: 0,
      wickets: 0,
      legal_balls: 0,

      target: null,

      status: 'live',

      winner: null,

      history: []
    };

    const { error } = await client
      .from('live_match')
      .upsert({
        id: 1,

        team_a: state.team_a,
        team_b: state.team_b,

        overs_limit:
          state.overs_limit,

        innings:
          state.innings,

        batting_team:
          state.batting_team,

        bowling_team:
          state.bowling_team,

        runs: 0,
        wickets: 0,
        legal_balls: 0,

        target: null,

        status: 'live',

        winner: null,

        history: [],

        updated_at:
          new Date().toISOString()
      });

    if (error) {
      alert(
        'Could not start match: ' +
          error.message
      );

      return;
    }

    setupCard.hidden = true;
    scorerCard.hidden = false;

    render();
  }

  async function loadExisting() {
    const { data, error } = await client
      .from('live_match')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      alert(
        'Could not load live match: ' +
          error.message
      );

      setupCard.hidden = false;

      return;
    }

    if (
      data &&
      data.status &&
      data.status !== 'not_started' &&
      data.team_a
    ) {
      state = data;

      scorerCard.hidden = false;
      setupCard.hidden = true;

      render();
    } else {
      setupCard.hidden = false;
    }
  }

  document
    .querySelectorAll('[data-runs]')
    .forEach(function (btn) {
      btn.addEventListener(
        'click',
        function () {
          scoreRuns(
            parseInt(
              btn.getAttribute('data-runs'),
              10
            )
          );
        }
      );
    });

  document
    .querySelector(
      '[data-action="dot"]'
    )
    ?.addEventListener(
      'click',
      function () {
        scoreRuns(0);
      }
    );

  document
    .getElementById('wicketBtn')
    ?.addEventListener(
      'click',
      addWicket
    );

  document
    .getElementById('wideBtn')
    ?.addEventListener(
      'click',
      addExtra
    );

  document
    .getElementById('noBallBtn')
    ?.addEventListener(
      'click',
      addExtra
    );

  document
    .getElementById('undoBtn')
    ?.addEventListener(
      'click',
      undo
    );

  document
    .getElementById('inningsBtn')
    ?.addEventListener(
      'click',
      switchInnings
    );

  document
    .getElementById('finishBtn')
    ?.addEventListener(
      'click',
      function () {
        if (
          confirm(
            'Finish this match?'
          )
        ) {
          finishMatch();
        }
      }
    );

  document
    .getElementById('newMatchBtn')
    ?.addEventListener(
      'click',
      function () {
        if (
          !confirm(
            'Start a new match? Current live score will be replaced.'
          )
        ) {
          return;
        }

        scorerCard.hidden = true;
        setupCard.hidden = false;
      }
    );

  document
    .getElementById('startMatchBtn')
    ?.addEventListener(
      'click',
      startMatch
    );

  logoutBtn?.addEventListener(
    'click',
    async function () {
      await client.auth.signOut();

      window.location.href =
        'admin.html';
    }
  );

  const {
    data: {
      session
    }
  } = await client.auth.getSession();

  if (!session) {
    authGate.hidden = false;
    setupCard.hidden = true;
    scorerCard.hidden = true;

    return;
  }

  authGate.hidden = true;

  await loadExisting();
});
