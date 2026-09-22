/* Team scoring rules. No network or DOM side effects. */
(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fields = ['team_a', 'team_b', 'overs_limit', 'runs', 'wickets',
    'legal_balls', 'innings', 'batting_team', 'bowling_team', 'target', 'status', 'winner'];
  const history = state => Array.isArray(state.history) ? state.history : [];
  const snapshots = state => history(state).filter(item => item && (item.innings === 1 || item.innings === 2));
  const metadata = state => history(state).find(item => item && item.scorer_version === 2);
  const maxBalls = state => Number(state.overs_limit) * 6;
  const canScore = state => !!state && state.status === 'live' && state.legal_balls < maxBalls(state);
  const overs = balls => Math.floor(balls / 6) + '.' + balls % 6;

  function remember(state) {
    const next = copy(state);
    const snapshot = {};
    fields.forEach(key => { if (state[key] !== undefined) snapshot[key] = state[key]; });
    // Never truncate: the innings boundary is also the authoritative first-innings score.
    next.history = [...history(next), snapshot];
    return next;
  }

  function delivery(type, runs = 0) {
    const choices = {
      normal: [0, 1, 2, 3, 4, 6], noball: [0, 1, 2, 3, 4, 6],
      wide: [0, 1, 2, 3, 4], wicket: [0], runout: [0, 1, 2, 3]
    };
    if (!choices[type]?.includes(runs)) throw new Error('Select a valid delivery and runs.');
    const legal = type !== 'noball' && type !== 'wide';
    return { type, runs, total: runs + (legal ? 0 : 1), legal,
      wicket: type === 'wicket' || type === 'runout' };
  }

  function result(state) {
    if (state.innings !== 2 || !Number.isInteger(state.target) || state.target < 1) {
      throw new Error('A valid second innings and target are required to finish.');
    }
    state.status = 'finished';
    state.winner = state.runs >= state.target ? state.batting_team :
      state.runs === state.target - 1 ? 'Tie' : state.bowling_team;
    return state;
  }

  function score(state, selection) {
    if (!canScore(state)) throw new Error('Innings closed. No more deliveries can be scored.');
    const ball = delivery(selection.type, selection.runs);
    const next = remember(state);
    next.runs += ball.total;
    next.wickets += Number(ball.wicket);
    next.legal_balls += Number(ball.legal);
    if (next.innings === 2 && (next.runs >= next.target || next.legal_balls >= maxBalls(next))) result(next);
    return next;
  }

  function endInnings(state) {
    if (state.status !== 'live') throw new Error('Match is not live.');
    const next = remember(state);
    if (state.innings === 2) return result(next);
    next.target = state.runs + 1;
    next.innings = 2;
    next.batting_team = state.bowling_team;
    next.bowling_team = state.batting_team;
    next.runs = next.wickets = next.legal_balls = 0;
    next.winner = null;
    return next;
  }

  function undo(state) {
    const next = copy(state);
    const index = history(next).findLastIndex(item => item && (item.innings === 1 || item.innings === 2));
    if (index < 0) throw new Error('Nothing to undo.');
    const previous = next.history.splice(index, 1)[0];
    fields.forEach(key => { if (previous[key] !== undefined) next[key] = previous[key]; });
    next.winner = previous.winner || null;
    return next;
  }

  function archiveRow(state) {
    const first = snapshots(state).findLast(item => item.innings === 1);
    if (state.innings !== 2 || !first) throw new Error('First-innings score is missing. Match history cannot be saved safely.');
    if (first.runs + 1 !== state.target || first.batting_team !== state.bowling_team ||
        ![state.team_a, state.team_b].includes(first.batting_team) ||
        ![state.team_a, state.team_b].includes(state.batting_team) || first.batting_team === state.batting_team) {
      throw new Error('Innings scores do not match the target/teams. Check this legacy match before archiving.');
    }
    const a = first.batting_team === state.team_a ? first : state;
    const b = first.batting_team === state.team_b ? first : state;
    return {
      team_a: state.team_a, team_b: state.team_b, overs_limit: state.overs_limit,
      team_a_runs: a.runs, team_a_wickets: a.wickets, team_a_balls: a.legal_balls,
      team_b_runs: b.runs, team_b_wickets: b.wickets, team_b_balls: b.legal_balls,
      winner: state.winner, match_group: metadata(state)?.match_group || state.match_group || 'Group Stage'
    };
  }

  const api = { copy, fields, history, snapshots, metadata, maxBalls, canScore, overs,
    delivery, score, endInnings, undo, archiveRow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PowerHittersScoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
