document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const T = window.PowerHittersTournament;
  const $ = id => document.getElementById(id);
  const admin = document.body.dataset.tournamentAdmin === 'true';
  const message = $('tournamentMessage');
  let matches = [], allowed = false, busy = false, loading = false;
  const node = (tag, text, className) => {
    const n = document.createElement(tag); if (text != null) n.textContent = text;
    if (className) n.className = className; return n;
  };
  function notice(text, error = false) {
    message.textContent = text; message.hidden = !text; message.setAttribute('role', error ? 'alert' : 'status');
  }
  if (!window.supabase || !T) { notice('Tournament could not load. Please refresh or try again shortly.', true); return; }
  const client = window.supabase.createClient('https://icebgysininolvjbueet.supabase.co', 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4');
  const api = T.api(client);
  function team(m, slot) {
    const name = m['team_' + slot]; const score = m['score_' + slot];
    const row = node('div', null, 'bracket-team');
    row.append(node('strong', name || T.source(m, slot, matches)));
    if (m.status === 'completed') row.append(node('span', m.winner === name ? 'WON' : 'LOST', 'team-result' + (m.winner !== name ? ' lost' : '')));
    if (score) row.append(node('span', score.runs + '/' + score.wickets + ' · ' + T.overs(score.balls) + ' Overs · RR ' + T.rr(score.runs, score.balls), 'team-figures'));
    return row;
  }

  // Published Season 3 Round of 16 fixtures, in India Standard Time.
  const fixtures = {
  "Saturday": {
    "date": "2026-09-26",
    "label": "26 Sep 2026",
    "start": 16,
    "teams": [
      "JAY AMBE",
      "SWING THINGS",
      "EKTA SPORTS",
      "DEFENDER",
      "POWERHITTERS",
      "TROPHY FIGHTERS",
      "IRON PARADISE",
      "BOSS XI",
      "PATTERN BOYS",
      "MUMBRA XI",
      "WE ALL STARS",
      "OM SHANTI",
      "GSD WARRIORS",
      "NAVKAR BOYS",
      "THE SPIN KINGS",
      "Anonymous"
    ]
  },
  "Sunday": {
    "date": "2026-09-27",
    "label": "27 Sep 2026",
    "start": 12,
    "teams": [
      "EKVIRA XI",
      "CHEDDA BOYS",
      "FRIENDS XI",
      "DAKSHITA XI",
      "YOUNGSTER BOYS",
      "MANOR",
      "MAULI XI B",
      "SWAMI XI",
      "ANCC",
      "4K CRICKET CLUB",
      "AYODHYA TITANS",
      "MAULI XI A",
      "THE SLAYERS",
      "OCL",
      "ALAM XI",
      "BCC CRICKET CLUB"
    ]
  }
};
  function fixtureTime(m) {
    const day = fixtures[m.day];
    if (!day || m.round !== 0) return null;
    const i = day.teams.findIndex((name, index) => index % 2 === 0 && name === m.team_a && day.teams[index + 1] === m.team_b);
    if (i < 0) return null;
    const minutes = day.start * 60 + (i / 2) * 30;
    const hour = Math.floor(minutes / 60), minute = String(minutes % 60).padStart(2, '0');
    const time = node('time', day.label + ' · ' + (hour % 12 || 12) + ':' + minute + ' PM IST', 'tournament-note');
    time.dateTime = day.date + 'T' + String(hour).padStart(2, '0') + ':' + minute + ':00+05:30';
    return time;
  }
  function reviewBracket(sat, sun) {
    return new Promise(resolve => {
      const dialog = node('dialog');
      dialog.setAttribute('aria-labelledby', 'bracketReviewTitle');
      dialog.style.cssText = 'width:min(600px,calc(100% - 32px));max-height:85vh;overflow:auto;border:0;border-radius:16px;padding:24px;background:#fff;color:#14251c;';
      const title = node('h2', 'Confirm tournament pairings'); title.id = 'bracketReviewTitle';
      dialog.append(title, node('p', 'Generate the 32-match bracket in this order? Pairings will be fixed; existing results cannot be overwritten.'));
      for (const [day, teams] of [['Saturday', sat], ['Sunday', sun]]) {
        dialog.append(node('h3', day));
        const list = node('ol');
        for (let i = 0; i < teams.length; i += 2) list.append(node('li', teams[i] + ' vs ' + teams[i + 1]));
        dialog.append(list);
      }
      const actions = node('div', null, 'tournament-admin-actions');
      const cancel = node('button', 'Cancel'), accept = node('button', 'CONFIRM AND GENERATE');
      cancel.type = accept.type = 'button';
      cancel.addEventListener('click', () => dialog.close('cancel'));
      accept.addEventListener('click', () => dialog.close('confirm'));
      dialog.addEventListener('close', () => { const confirmed = dialog.returnValue === 'confirm'; dialog.remove(); resolve(confirmed); }, { once: true });
      actions.append(cancel, accept); dialog.append(actions); document.body.append(dialog); dialog.showModal(); cancel.focus();
    });
  }
  function card(m) {
    const c = node('article', null, 'bracket-match'); c.id = 'match-' + m.id;
    c.append(node('div', m.status === 'tied' ? 'TIE — WINNER REQUIRED' : m.status.toUpperCase(), 'match-status'));
    c.append(node('h4', T.label(m)));
    const scheduled = fixtureTime(m); if (scheduled) c.append(scheduled);
    c.append(team(m, 'a'), team(m, 'b'));
    if (m.tied) c.append(node('p', m.status === 'completed' ? 'Scores tied · advancement decided by admin after tie-break.' : 'Scores tied · awaiting the tournament tie-break.', 'tournament-note'));
    if (m.status === 'live') { const a = node('a', 'VIEW LIVE SCORE'); a.href = 'live.html'; c.append(a); }
    if (admin && allowed && T.ready(m)) { const a = node('a', 'SCORE THIS MATCH'); a.href = 'scorer.html?tournament_match=' + m.id; c.append(a); }
    if (admin && allowed && m.status === 'tied') {
      const actions = node('div', null, 'tournament-admin-actions');
      for (const name of [m.team_a, m.team_b]) {
        const button = node('button', 'Advance ' + name); button.type = 'button'; button.disabled = busy;
        button.addEventListener('click', async () => {
          if (busy || !confirm('Confirm ' + name + ' won the tie-break and advances? The actual match score stays tied.')) return;
          busy = true; render();
          try { await api.resolve(m.id, name, m.revision); await load(); }
          catch (e) { notice('Tie resolution was not confirmed. Reload and verify before retrying. ' + e.message, true); }
          finally { busy = false; render(); }
        }); actions.append(button);
      }
      c.append(actions);
    }
    return c;
  }
  function render() {
    const root = $('tournamentRounds'); root.replaceChildren();
    if (admin) { $('tournamentSetup').hidden = !allowed || matches.length > 0; $('generateBracket').disabled = busy; }
    if (!matches.length) return;
    for (const day of ['Saturday', 'Sunday']) {
      const section = node('section', null, 'bracket-day'); section.append(node('h2', day.toUpperCase() + ' — 16 TEAMS'));
      T.rounds.forEach((name, round) => {
        const area = node('section', null, 'bracket-round'); area.append(node('h3', round === 3 ? day.toUpperCase() + ' FINAL' : name.toUpperCase()));
        const grid = node('div', null, 'bracket-grid'); matches.filter(m => m.day === day && m.round === round).forEach(m => grid.append(card(m)));
        area.append(grid); section.append(area);
      });
      const final = matches.find(m => m.day === day && m.round === 3);
      const places = node('div', null, 'day-places');
      places.append(node('div', day + ' Winner: ' + (final?.winner || 'To be decided')), node('div', day + ' Runner-up: ' + (final?.loser || 'To be decided')));
      section.append(places); root.append(section);
    }
    for (const id of [31,32]) {
      const section = node('section', null, 'bracket-day'); const m = matches.find(x => x.id === id);
      if (m) { section.append(node('h2', T.label(m).toUpperCase()), card(m)); root.append(section); }
    }
    const grand = matches.find(m => m.id === 32), third = matches.find(m => m.id === 31);
    const podium = node('section', null, 'tournament-podium'); podium.append(node('h2', 'POWERHITTERS HONOURS'));
    podium.append(node('p', 'CHAMPION: ' + (grand?.winner || 'To be decided')), node('p', 'RUNNER-UP: ' + (grand?.loser || 'To be decided')), node('p', '3RD PLACE: ' + (third?.winner || 'To be decided')));
    root.append(podium);
  }
  async function load() {
    if (loading) return; loading = true;
    try { matches = await api.load(); notice(matches.length ? '' : 'TOURNAMENT BRACKET COMING SOON'); render(); }
    catch (e) { notice(e.message + ' Use Refresh to retry.', true); }
    finally { loading = false; }
  }
  $('refreshTournament').addEventListener('click', load);
  if (admin) {
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data?.session) { notice('Sign in through Admin to manage the tournament.'); $('tournamentLogin').hidden = false; return; }
      allowed = await api.isAdmin();
      if (!allowed) { notice('This account has not been enrolled as a tournament administrator.', true); return; }
    } catch (e) { notice(e.message, true); return; }
    client.auth.onAuthStateChange((event, session) => { if (!session) { allowed = false; render(); notice('Admin login expired. Sign in again.', true); $('tournamentLogin').hidden = false; } });
    $('generateBracket').addEventListener('click', async () => {
      if (!allowed || busy) return;
      let sat, sun;
      try {
        sat = T.teams($('saturdayTeams').value, 'Saturday'); sun = T.teams($('sundayTeams').value, 'Sunday');
        if (new Set([...sat,...sun].map(s => s.toLocaleLowerCase())).size !== 32) throw new Error('Use different team names across both days.');
      } catch (e) { notice(e.message, true); return; }
      busy = true; render();
      try {
        if (!await reviewBracket(sat, sun)) return;
        if (!allowed) throw new Error('Admin login expired. Sign in again.');
        await api.generate(sat,sun); await load();
      }
      catch (e) { notice('Generation was not confirmed. Refresh to check before retrying. ' + e.message, true); }
      finally { busy = false; render(); }
    });
  }
  await load();
  // Polling works without changing the existing Supabase realtime publication.
  setInterval(() => { if (!document.hidden && !busy) load(); }, 15000);
});
