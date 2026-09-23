/* Real PostgreSQL execution via PGlite; no Supabase/production writes. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PH_PGLITE_PATH || '@electric-sql/pglite');
const E = require('../js/scorer-engine.js');
const T = require('../js/tournament.js');
const admin = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
let db;
async function setup() {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${admin}'),('${other}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    create table public.live_match(id integer primary key,team_a text,team_b text,overs_limit integer,innings integer,
      batting_team text,bowling_team text,runs integer,wickets integer,legal_balls integer,target integer,status text,winner text,history jsonb,updated_at timestamptz);
    grant usage on schema public,auth to anon,authenticated;
    grant select,insert,update on public.live_match to authenticated;`);
  await db.exec(fs.readFileSync(require.resolve('../TOURNAMENT-MIGRATION.sql'),'utf8'));
  await db.exec(`insert into public.tournament_admins values('${admin}');set role authenticated;set request.jwt.claim.sub='${admin}'`);
}
async function save(s) {
  const fields=['id',...E.fields,'history'];
  return db.query(`insert into live_match(${fields.join(',')}) values(${fields.map((f,i)=>'$'+(i+1)).join(',')}) on conflict(id) do update set ${fields.slice(1).map(f=>f+'=excluded.'+f).join(',')}`,
    fields.map(f=>f==='history'?JSON.stringify(s.history):s[f]));
}
const rows = async () => (await db.query('select * from tournament_matches order by id')).rows;
function start(m) {
  return {id:1,team_a:m.team_a,team_b:m.team_b,overs_limit:4,innings:1,batting_team:m.team_a,bowling_team:m.team_b,runs:0,wickets:0,legal_balls:0,target:null,status:'live',winner:null,
    history:[{scorer_version:2,archive_id:-m.id,played_at:'2026-09-23T00:00:00Z',tournament_match_id:m.id,tournament_bracket_id:m.bracket_id}]};
}
async function complete(m,tie=false) {
  let s=start(m);await save(s);
  s={...s,runs:24,wickets:2,legal_balls:24};await save(s);
  s=E.endInnings(s);await save(s);
  s={...s,runs:tie?24:18,wickets:3,legal_balls:24};
  s=E.endInnings(s);await save(s);return s;
}
test('32-match database lifecycle, security, ties and reversible advancement', async t => {
  await setup();
  try {
    const sat=Array.from({length:16},(_,i)=>'Saturday '+(i+1));
    const sun=Array.from({length:16},(_,i)=>'Sunday '+(i+1));
    await t.test('reject unauthenticated and unapproved writes', async()=>{
      await db.exec('reset role;set role anon');
      await assert.rejects(()=>db.query('select ph_generate_tournament($1,$2)',[sat,sun]),/permission denied/);
      await assert.rejects(()=>db.query("insert into tournament_matches(id,bracket_id,day,round,match_number) values(1,gen_random_uuid(),'Saturday',0,1)"),/permission denied/);
      await assert.rejects(()=>db.query("update tournament_matches set winner='fake'"),/permission denied/);
      await assert.rejects(()=>db.query('delete from tournament_matches'),/permission denied/);
      await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${other}'`);
      await assert.rejects(()=>db.query('select ph_generate_tournament($1,$2)',[sat,sun]),/administrator required/);
      await db.exec(`set request.jwt.claim.sub='${admin}'`);
    });
    await t.test('validate and persist exactly 32 stable matches',async()=>{
      await assert.rejects(()=>db.query('select ph_generate_tournament($1,$2)',[sat.slice(1),sun]),/16 unique/);
      await assert.rejects(()=>db.query('select ph_generate_tournament($1,$2)',[[...sat.slice(0,15),sat[0].toUpperCase()],sun]),/16 unique/);
      await db.query('select ph_generate_tournament($1,$2)',[sat,sun]);
      const all=await rows();assert.equal(all.length,32);
      assert.deepEqual(all.filter(m=>m.day==='Saturday').map(m=>m.round),[0,0,0,0,0,0,0,0,1,1,1,1,2,2,3]);
      assert.equal(all[0].team_a,sat[0]);assert.equal(all[0].team_b,sat[1]);
      assert.equal(all[30].a_source,15);assert.equal(all[30].b_source,30);assert.equal(all[30].a_outcome,'loser');
      assert.equal(all[31].a_outcome,'winner');
      await assert.rejects(()=>db.query('select ph_generate_tournament($1,$2)',[sat,sun]),/already exists/);
      assert.deepEqual(await rows(),all);
    });
    let finished;
    await t.test('tie stays pending; explicit decision advances; undo/redo restores',async()=>{
      finished=await complete((await rows())[0],true);
      let all=await rows();assert.equal(all[0].status,'tied');assert.equal(all[8].team_a,null);
      await assert.rejects(()=>db.query('select ph_resolve_tie($1,$2,$3)',[1,'Unknown',all[0].revision]),/Select one/);
      await db.query('select ph_resolve_tie($1,$2,$3)',[1,sat[0],all[0].revision]);
      all=await rows();assert.equal(all[0].tied,true);assert.equal(all[8].team_a,sat[0]);assert.equal(all[0].loser,sat[1]);
      await save(finished);assert.equal((await rows())[0].winner,sat[0],'idempotent score sync retains tie break');
      await assert.rejects(()=>db.query('select ph_resolve_tie($1,$2,$3)',[1,sat[1],0]),/Reload/);
      await save(E.undo(finished));assert.equal((await rows())[8].team_a,null);
      await save(finished);all=await rows();assert.equal(all[0].status,'tied');
      await db.query('select ph_resolve_tie($1,$2,$3)',[1,sat[0],all[0].revision]);
    });
    await t.test('all rounds advance with day-final losers only in third place',async()=>{
      for(let id=2;id<=30;id++) await complete((await rows()).find(m=>m.id===id));
      let all=await rows();
      assert.equal(all[14].winner,sat[0]);assert.equal(all[14].loser,sat[8]);
      assert.equal(all[29].winner,sun[0]);assert.equal(all[29].loser,sun[8]);
      assert.equal(all[30].team_a,sat[8]);assert.equal(all[30].team_b,sun[8]);
      assert.equal(all[31].team_a,sat[0]);assert.equal(all[31].team_b,sun[0]);
      assert.equal(all[12].loser,sat[4]);assert.notEqual(all[30].team_a,sat[4]);
      await complete(all[30]);await complete((await rows())[31]);
      all=await rows();assert.equal(all[30].winner,sat[8]);assert.equal(all[31].winner,sat[0]);assert.equal(all[31].loser,sun[0]);
      assert.equal(all.filter(m=>m.status==='completed').length,32);
      assert.deepEqual(all[31].score_a,{runs:24,wickets:2,balls:24});
    });
    await t.test('earlier correction cannot invalidate a started downstream match',async()=>{
      await assert.rejects(()=>save(E.undo(finished)),/Next round has started/);
      assert.equal((await rows())[0].status,'completed');
      assert.equal((await db.query('select team_a from live_match')).rows[0].team_a,sat[0]);
    });
    await t.test('public reads completed history but cannot resolve ties',async()=>{
      await db.exec('reset role;set role anon');
      assert.equal((await rows()).length,32);
      await assert.rejects(()=>db.query('select ph_resolve_tie(1,$1,0)',[sat[1]]),/permission denied/);
      await assert.rejects(()=>db.query('select * from tournament_admins'),/permission denied/);
    });
  } finally {await db.close();}
});
test('team validation and legal-ball run rates',()=>{
  assert.throws(()=>T.teams('A\na','Saturday'),/16/);
  assert.equal(T.rr(24,24),'6.00');assert.equal(T.rr(18,18),'6.00');assert.equal(T.rr(23,23),'6.00');assert.equal(T.rr(9,0),'0.00');assert.equal(T.overs(23),'3.5');
});
