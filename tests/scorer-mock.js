/* In-memory Supabase contract used only by tests. Never contacts a real database. */
(function (root) {
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  function fixture(overrides = {}) {
    return { id: 1, team_a: 'A', team_b: 'B', overs_limit: 4, innings: 1,
      batting_team: 'A', bowling_team: 'B', runs: 0, wickets: 0, legal_balls: 0,
      target: null, status: 'live', winner: null, updated_at: '2026-09-20T00:00:00.000Z',
      history: [{ scorer_version: 2, archive_id: -123, played_at: '2026-09-20T00:00:00.000Z', match_group: 'Final' }], ...overrides };
  }
  function mockClient(initial = fixture()) {
    const db = { live_match: initial ? [copy(initial)] : [], match_history: [] };
    const client = { db, calls: [], failures: [], delay: 0, session: true,
      auth: { getSession: async () => ({ data: { session: client.session ? { user: { id: 'admin' } } : null } }),
        onAuthStateChange: callback => { client.authCallback = callback; },
        signOut: async () => { client.session = false; client.authCallback?.('SIGNED_OUT', null); } },
      from(table) {
        let verb = 'select', payload, single = false, limit = Infinity;
        const filters = [];
        const q = {
          select() { return q; },
          update(value) { verb = 'update'; payload = value; return q; },
          insert(value) { verb = 'insert'; payload = value; return q; },
          delete() { verb = 'delete'; return q; },
          eq(key, value) { filters.push(row => row[key] === value); return q; },
          is(key, value) { filters.push(row => row[key] == value); return q; },
          limit(value) { limit = value; return q; },
          single() { single = 'required'; return q; },
          maybeSingle() { single = true; return q; },
          async then(resolve, reject) {
            try {
              client.calls.push({ table, verb, payload: copy(payload) });
              if (client.delay) await new Promise(r => setTimeout(r, client.delay));
              const index = client.failures.findIndex(f => f.table === table && f.verb === verb);
              const failure = index < 0 ? null : client.failures.splice(index, 1)[0];
              if (failure && !failure.after && !failure.silent) {
                if (failure.throws) throw new Error('Network disconnected');
                return resolve({ data: null, error: { message: 'Simulated denied/network write', code: '42501' } });
              }
              let rows = db[table].filter(row => filters.every(f => f(row))).slice(0, limit);
              if (!failure?.silent && verb === 'insert') {
                if (db[table].some(row => row.id === payload.id)) return resolve({ data: null, error: { code: '23505', message: 'Duplicate ID' } });
                rows = [copy(payload)]; db[table].push(...rows);
              } else if (!failure?.silent && verb === 'update') rows.forEach(row => Object.assign(row, copy(payload)));
              else if (!failure?.silent && verb === 'delete') db[table] = db[table].filter(row => !rows.includes(row));
              if (failure?.silent) rows = [];
              if (failure?.after) throw new Error('Response lost after commit');
              if (single === 'required' && rows.length !== 1) return resolve({ data: null, error: { message: 'Expected one row; stale version or RLS denial' } });
              return resolve({ data: copy(single ? rows[0] || null : rows), error: null });
            } catch (error) { return reject(error); }
          }
        };
        return q;
      }
    };
    return client;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { fixture, mockClient };
  else root.ScorerTest = { fixture, mockClient };
})(typeof globalThis !== 'undefined' ? globalThis : this);
