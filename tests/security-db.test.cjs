const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
test('restrictive policies block public/non-admin access and preserve existing admin/public permissions',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`
 create role anon;create role authenticated;
 create schema storage;
 create table public.tournament_admins(user_id text);
 insert into public.tournament_admins values ('owner');
 create function public.ph_tournament_admin() returns boolean language sql stable security definer
 set search_path=pg_catalog,public as $f$
 select exists(select 1 from public.tournament_admins where user_id=current_setting('request.jwt.claim.sub',true))
 $f$;
 revoke all on public.tournament_admins from public;
 grant usage on schema public,storage to anon,authenticated;
 `);
 for(const table of ['registrations','payments','live_match','match_history','gallery_photos']){
 await db.exec('create table public.'+table+'(id int primary key,value text); alter table public.'+table+' enable row level security; grant all on public.'+table+' to anon,authenticated; insert into public.'+table+" values(1,'original');");
 const roles=['registrations','payments'].includes(table)?'authenticated':'anon,authenticated';
 await db.exec('create policy baseline_select on public.'+table+' for select to '+roles+' using(true)');
 if(table!=='payments')await db.exec('create policy baseline_insert on public.'+table+' for insert to '+(table==='match_history'?'anon,authenticated':'authenticated')+' with check(true)');
 if(['registrations','live_match','gallery_photos'].includes(table))await db.exec('create policy baseline_update on public.'+table+' for update to authenticated using(true) with check(true)');
 if(table==='gallery_photos')await db.exec('create policy baseline_delete on public.'+table+' for delete to authenticated using(true)');
 }
 await db.exec(`
 create table storage.buckets(id text primary key,file_size_limit bigint,allowed_mime_types text[]);
 insert into storage.buckets values('gallery-photos',null,null);
 create table storage.objects(id int primary key,bucket_id text);
 alter table storage.objects enable row level security;
 grant all on storage.objects to anon,authenticated;
 insert into storage.objects values(1,'gallery-photos'),(2,'other-bucket');
 create policy baseline_storage_select on storage.objects for select to anon,authenticated using(true);
 create policy baseline_storage_insert on storage.objects for insert to authenticated with check(true);
 create policy baseline_storage_update on storage.objects for update to authenticated using(true) with check(true);
 create policy baseline_storage_delete on storage.objects for delete to authenticated using(true);
 `);
 await db.exec(fs.readFileSync(require.resolve('../SECURITY-MIGRATION.sql'),'utf8'));
 assert.equal((await db.query("select file_size_limit from storage.buckets where id='gallery-photos'")).rows[0].file_size_limit,20971520);
 async function as(role,uid,sql){
   await db.exec('set role '+role);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
   try{return await db.query(sql);}finally{await db.exec('reset role');}
 }
 for(const role of ['anon','authenticated']){
 const uid=role==='anon'?'':'outsider';
 await assert.rejects(as(role,uid,'truncate public.match_history'));
 for(const table of ['registrations','payments'])assert.equal((await as(role,uid,'select * from public.'+table)).rows.length,0);
 for(const table of ['live_match','match_history','gallery_photos'])assert.equal((await as(role,uid,'select * from public.'+table)).rows.length,1);
 for(const table of ['live_match','match_history','gallery_photos','registrations','payments']){
 await assert.rejects(as(role,uid,'insert into public.'+table+" values(99,'unauthorized')"));
 assert.equal((await as(role,uid,'update public.'+table+" set value='unauthorized' where id=1 returning id")).rows.length,0);
 assert.equal((await as(role,uid,'delete from public.'+table+' where id=1 returning id')).rows.length,0);
 }
 await assert.rejects(as(role,uid,"insert into storage.objects values(99,'gallery-photos')"));
 assert.equal((await as(role,uid,"delete from storage.objects where id=1 returning id")).rows.length,0);
 }
 for(const table of ['registrations','payments'])assert.equal((await as('authenticated','owner','select * from public.'+table)).rows.length,1);
 assert.equal((await as('authenticated','owner',"update public.registrations set value='paid' where id=1 returning id")).rows.length,1);
 await as('authenticated','owner',"insert into public.live_match values(2,'approved')");
 await as('authenticated','owner',"insert into public.match_history values(2,'approved')");
 await as('authenticated','owner',"insert into storage.objects values(3,'gallery-photos')");
 await assert.rejects(as('authenticated','outsider',"update storage.objects set bucket_id='gallery-photos' where id=2"));
 assert.equal((await as('authenticated','outsider',"update storage.objects set bucket_id='other-bucket' where id=1 returning id")).rows.length,0);
 await as('authenticated','outsider',"insert into storage.objects values(4,'other-bucket')");
 assert.equal((await as('authenticated','outsider',"delete from storage.objects where id=4 returning id")).rows.length,1);
 // Restrictions never grant new permissions: match-history UPDATE/DELETE remain denied by the audited baseline.
 assert.equal((await as('authenticated','owner',"delete from public.match_history where id=1 returning id")).rows.length,0);
 await db.exec(fs.readFileSync(require.resolve('../SECURITY-ROLLBACK.sql'),'utf8'));
 await as('anon','',"insert into public.match_history values(99,'baseline restored')");
 } finally {await db.close();}
});
