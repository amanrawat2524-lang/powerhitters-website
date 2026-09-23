/* Injected ONLY by the localhost preview server. Never included in deployed HTML. */
window.supabase = { createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'local-test-admin' } } } }),
    onAuthStateChange: () => {}, signOut: async () => ({})
  },
  rpc: (name, args) => fetch('/__db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rpc: name, args }) }).then(r=>r.json()),
  channel: () => ({ on() { return this; }, subscribe() {} }),
  from(table) {
    const request = { table, verb: 'select', filters: [] };
    const q = {
      select() { return q; }, order() { request.ordered=true;return q; },
      update(data) { request.verb='update';request.data=data;return q; },
      insert(data) { request.verb='insert';request.data=data;return q; },
      delete() { request.verb='delete';return q; },
      eq(key,value) { request.filters.push([key,value]);return q; },
      is(key,value) { request.filters.push([key,value]);return q; },
      limit(n) { request.limit=n;return q; },
      single() { request.single=true;return q; }, maybeSingle() { request.single=true;return q; },
      then(resolve,reject) { return fetch('/__db',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}).then(r=>r.json()).then(resolve,reject); }
    }; return q;
  }
}) };
