/* Shared tournament display helpers. Advancement is authoritative in PostgreSQL. */
(function (root) {
  'use strict';
  const rounds = ['Round of 16', 'Quarter Finals', 'Semi Finals', 'Day Final'];
  function teams(text, day) {
    const list = text.split(/\r?\n/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (list.length !== 16) throw new Error(day + ' needs exactly 16 non-empty team names.');
    if (list.some(s => s.length > 80)) throw new Error('Team names must be 80 characters or fewer.');
    if (new Set(list.map(s => s.toLocaleLowerCase())).size !== 16) throw new Error(day + ' has duplicate team names.');
    if (list.some(s => s.toLowerCase() === 'tie')) throw new Error('“Tie” is reserved for tied results.');
    return list;
  }
  const overs = balls => Math.floor(balls / 6) + '.' + balls % 6;
  const rr = (runs, balls) => balls > 0 ? (runs * 6 / balls).toFixed(2) : '0.00';
  const label = m => m.id === 31 ? '3rd Place Match' : m.id === 32 ? 'Grand Final' :
    m.round === 3 ? m.day + ' Final' : m.day + ' · ' + rounds[m.round] + ' · Match ' + m.match_number;
  const ready = m => m.status === 'upcoming' && !!m.team_a && !!m.team_b;
  function source(m, slot, matches) {
    const id = m[slot + '_source'];
    const parent = matches.find(x => x.id === id);
    if (!parent) return 'To be decided';
    if (parent.round === 3) return parent.day + (m[slot + '_outcome'] === 'loser' ? ' Runner-up' : ' Winner');
    return label(parent) + (m[slot + '_outcome'] === 'loser' ? ' loser' : ' winner');
  }
  function api(client) {
    return {
      async load() {
        const { data, error } = await client.from('tournament_matches').select('*').order('id');
        if (error) throw new Error('Tournament data is unavailable. ' + error.message);
        return data || [];
      },
      async generate(saturday, sunday) {
        const { error } = await client.rpc('ph_generate_tournament', { saturday, sunday });
        if (error) throw error;
      },
      async resolve(id, winner, revision) {
        const { error } = await client.rpc('ph_resolve_tie', { match_id: id, advancing_team: winner, expected_revision: revision });
        if (error) throw error;
      },
      async isAdmin() {
        const { data, error } = await client.rpc('ph_tournament_admin');
        if (error) throw new Error('Tournament migration/admin access is not ready. ' + error.message);
        return data === true;
      }
    };
  }
  const exported = { teams, overs, rr, label, ready, source, rounds, api };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.PowerHittersTournament = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this);
