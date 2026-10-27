/* UX gate only: database/storage RLS must enforce the same allowlist. */
(function (root) {
  'use strict';
  async function requireAdmin(client) {
    const session = await client.auth.getSession();
    if (session.error || !session.data?.session) throw new Error('Admin login required. Please sign in again.');
    const result = await client.rpc('ph_tournament_admin');
    if (result.error || result.data !== true) throw new Error('Approved administrator access required.');
    return session.data.session;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = requireAdmin;
  else root.PowerHittersRequireAdmin = requireAdmin;
})(typeof window !== 'undefined' ? window : globalThis);
