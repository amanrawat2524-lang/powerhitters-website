/* Supabase persistence. Keep authentication/RLS authoritative; never use a service key. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./scorer-engine.js') : root.PowerHittersScoring;
  class ScorerStore {
    constructor(client) { this.client = client; }

    async authenticated() {
      const { data, error } = await this.client.auth.getSession();
      if (error || !data?.session) throw new Error('Admin login expired. Sign in again before scoring.');
    }

    async load() {
      const { data, error } = await this.client.from('live_match').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    }

    async write(previous, candidate) {
      await this.authenticated();
      const next = E.copy(candidate);
      const payload = { history: E.history(next) };
      E.fields.forEach(key => { payload[key] = next[key]; });
      // A compare-and-swap rejects stale tabs and retries of an uncertain delivery.
      const oldTime = Date.parse(previous?.updated_at) || 0;
      payload.updated_at = new Date(Math.max(Date.now(), oldTime + 1)).toISOString();
      let query;
      if (previous) {
        query = this.client.from('live_match').update(payload).eq('id', 1);
        query = previous.updated_at == null ? query.is('updated_at', null) : query.eq('updated_at', previous.updated_at);
      } else {
        // Do not upsert over a match that another scorer just started.
        query = this.client.from('live_match').insert({ id: 1, ...payload });
      }
      const { data, error } = await query.select('*').single();
      if (error) throw new Error('Score save was not confirmed. ' + error.message);
      if (!data) throw new Error('No score row was updated. Reload to check for another scorer or denied write access.');
      return data;
    }

    async withIdentity(state) {
      if (E.metadata(state)) return state;
      const next = E.copy(state);
      // Existing integer primary key: reserve a negative ID without changing the schema
      // or interfering with positive sequence-generated history rows.
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const meta = { scorer_version: 2, archive_id: -(1 + random[0] % 2147483647),
        played_at: new Date().toISOString(), match_group: state.match_group || 'Group Stage' };
      if (state.status === 'finished' && state.innings === 2) {
        // Adopt an already archived legacy result only when every score field matches.
        const row = E.archiveRow(state);
        let query = this.client.from('match_history').select('*');
        Object.entries(row).forEach(([key, value]) => { query = value == null ? query.is(key, null) : query.eq(key, value); });
        const { data, error } = await query.limit(2);
        if (error) throw error;
        if (data?.length > 1) throw new Error('This legacy result has duplicate history rows. Resolve these before continuing.');
        if (data?.length === 1) {
          meta.archive_id = data[0].id;
          meta.played_at = data[0].played_at;
        }
      }
      if (meta.archive_id < 0) {
        const { data, error } = await this.client.from('match_history').select('id').eq('id', meta.archive_id).maybeSingle();
        if (error) throw error;
        if (data) throw new Error('History ID collision. Reload to allocate a fresh match ID.');
      }
      next.history = [meta, ...E.history(next)];
      return next;
    }

    async syncArchive(state) {
      const meta = E.metadata(state);
      if (!meta) return;
      await this.authenticated();
      const read = () => this.client.from('match_history').select('*').eq('id', meta.archive_id).maybeSingle();
      let { data: existing, error } = await read();
      if (error) throw error;
      // Never update/delete a different match if a random ID collides.
      const owned = row => row && Date.parse(row.played_at) === Date.parse(meta.played_at) &&
        row.team_a === state.team_a && row.team_b === state.team_b;
      if (existing && !owned(existing)) throw new Error('History ID belongs to another match. No history row was changed.');

      if (state.status !== 'finished' || state.innings !== 2) {
        if (existing) {
          const removed = await this.client.from('match_history').delete().eq('id', meta.archive_id)
            .eq('played_at', existing.played_at).select('id');
          if (removed.error) throw removed.error;
          // RLS can silently filter a DELETE; verify it actually disappeared.
          const checked = await read();
          if (checked.error || checked.data) throw new Error('Score restored, but old result removal failed. Check admin history DELETE policy and retry.');
        }
        return;
      }

      const row = { ...E.archiveRow(state), id: meta.archive_id, played_at: meta.played_at };
      if (!existing) {
        const inserted = await this.client.from('match_history').insert(row);
        // A lost response or concurrent recovery may already have inserted this exact ID.
        if (inserted.error && inserted.error.code !== '23505') throw inserted.error;
        const checked = await read();
        if (checked.error) throw checked.error;
        existing = checked.data;
      }
      const matches = owned(existing) && Object.entries(row).every(([key, value]) =>
        key === 'played_at' || existing[key] === value);
      if (!matches) throw new Error('Archived result could not be verified. Scoring is paused; reload/retry history sync.');
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = ScorerStore;
  else root.PowerHittersScorerStore = ScorerStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
