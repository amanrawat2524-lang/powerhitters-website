const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const requireAdmin = require('../js/admin-access.js');
const Store = require('../js/scorer-store.js');
const {fixture, mockClient} = require('./scorer-mock.js');

test('signed-out users cannot request admin access or write scores', async () => {
  const client = mockClient(); client.session = false;
  let rpcCalls = 0; client.rpc = async () => { rpcCalls++; return {data:true}; };
  await assert.rejects(requireAdmin(client), /login required/);
  await assert.rejects(new Store(client).write(fixture(),fixture()), /login required/);
  assert.equal(rpcCalls,0); assert.equal(client.calls.length,0);
});
test('a signed-up non-admin cannot write scores or archive results', async () => {
  const client = mockClient(); client.admin = false;
  await assert.rejects(new Store(client).write(fixture(),fixture()), /administrator/);
  await assert.rejects(new Store(client).syncArchive(fixture()), /administrator/);
  assert.equal(client.calls.length,0);
});
test('only boolean true from the server allowlist grants access', async () => {
  for (const value of [false,null,undefined,'true',1,[],{}]) {
    const client = mockClient(); client.rpc = async () => ({data:value,error:null});
    await assert.rejects(requireAdmin(client), /administrator/);
  }
  const client=mockClient();
  assert.equal((await requireAdmin(client)).user.id,'admin');
  await new Store(client).write(fixture(),fixture({runs:1}));
  assert.equal(client.db.live_match[0].runs,1);
});
test('RPC and session failures fail closed', async () => {
  const client=mockClient();
  client.rpc=async()=>({data:true,error:{message:'denied'}});
  await assert.rejects(requireAdmin(client),/administrator/);
  client.rpc=async()=>{throw Error('offline');};
  await assert.rejects(new Store(client).write(fixture(),fixture()),/offline/);
  assert.equal(client.calls.length,0);
  client.auth.getSession=async()=>({data:{session:{}},error:{message:'invalid'}});
  await assert.rejects(requireAdmin(client),/login required/);
});
test('CSP forbids inline/eval scripts and framing while allowing required services', () => {
  const config=require('../vercel.json');
  const headers=Object.fromEntries(config.headers[0].headers.map(h=>[h.key,h.value]));
  const csp=headers['Content-Security-Policy'];
  const scripts=csp.split('; ').find(d=>d.startsWith('script-src '));
  assert.ok(scripts.includes("'self'") && scripts.includes('https://cdn.jsdelivr.net'));
  assert.ok(!scripts.includes('unsafe-inline') && !scripts.includes('unsafe-eval'));
  for (const directive of ["frame-ancestors 'none'","object-src 'none'","base-uri 'self'","form-action 'self'"]) assert.ok(csp.includes(directive));
  assert.equal(headers['X-Frame-Options'],'DENY');
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
  for(const name of fs.readdirSync(path.join(__dirname,'..')).filter(n=>n.endsWith('.html'))) {
    const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html),name+' has an inline script');
    assert.ok(!/\bon(?:error|click|load|submit)=/i.test(html),name+' has an inline handler');
  }
});
