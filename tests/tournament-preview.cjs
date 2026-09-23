// Local-only integration preview. Uses real SQL migration in an in-memory PGlite DB.
// Never connects to Supabase. Restart this server to reset all test data.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PH_PGLITE_PATH || '@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const db=new PGlite();
const ident=s=>{if(!/^[a-z_]+$/.test(s))throw Error('Bad identifier');return '"'+s+'"';};
(async()=>{
 await db.exec(`create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key);
 insert into auth.users values('00000000-0000-4000-8000-000000000001');
 create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
 create table live_match(id integer primary key,team_a text,team_b text,overs_limit integer,innings integer,batting_team text,bowling_team text,runs integer,wickets integer,legal_balls integer,target integer,status text,winner text,history jsonb,updated_at timestamptz);
 create table match_history(id integer primary key,team_a text,team_b text,overs_limit integer,team_a_runs integer,team_a_wickets integer,team_a_balls integer,team_b_runs integer,team_b_wickets integer,team_b_balls integer,winner text,match_group text,played_at timestamptz);`);
 await db.exec(fs.readFileSync(path.join(root,'TOURNAMENT-MIGRATION.sql'),'utf8'));
 await db.exec("insert into tournament_admins values('00000000-0000-4000-8000-000000000001')");
 http.createServer(async(req,res)=>{
  try {
   if(req.url==='/__db' && req.method==='POST'){
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)throw Error('Too large');}
    const r=JSON.parse(raw);let result;
    if(r.rpc){
     if(r.rpc==='ph_tournament_admin')result={data:true};
     else if(r.rpc==='ph_generate_tournament')result={data:(await db.query('select ph_generate_tournament($1,$2)',[r.args.saturday,r.args.sunday])).rows};
     else if(r.rpc==='ph_resolve_tie')result={data:(await db.query('select ph_resolve_tie($1,$2,$3)',[r.args.match_id,r.args.advancing_team,r.args.expected_revision])).rows};
     else throw Error('Unknown RPC');
    } else {
     if(!['live_match','match_history','tournament_matches'].includes(r.table))throw Error('Unknown table');
     const args=[];const val=v=>{args.push(typeof v==='object'&&v!==null?JSON.stringify(v):v);return '$'+args.length;};
     let sql;
     if(r.verb==='select')sql='select * from '+ident(r.table);
     else if(r.verb==='update')sql='update '+ident(r.table)+' set '+Object.entries(r.data).map(([k,v])=>ident(k)+'='+val(v)).join(',');
     else if(r.verb==='insert')sql='insert into '+ident(r.table)+'('+Object.keys(r.data).map(ident).join(',')+') values('+Object.values(r.data).map(val).join(',')+')';
     else if(r.verb==='delete')sql='delete from '+ident(r.table);else throw Error('Bad verb');
     if(r.filters?.length)sql+=' where '+r.filters.map(([k,v])=>ident(k)+(v===null?' is null':'='+val(v))).join(' and ');
     if(r.verb==='select'){if(r.ordered)sql+=' order by id';if(r.limit)sql+=' limit '+Number(r.limit);}else sql+=' returning *';
     const rows=(await db.query(sql,args)).rows;result={data:r.single?(rows[0]||null):rows};
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
   }
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('Bad path');
   let data=fs.readFileSync(file);
   if(file.endsWith('.html')) data=data.toString().replace(/<script src="https:\/\/cdn[^>]+><\/script>/,'<script src="/tests/tournament-preview-client.js"></script>');
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:{message:e.message,code:e.code}}));}
 }).listen(4174,'127.0.0.1',()=>console.log('Local SQL tournament preview: http://localhost:4174/tournament-admin.html'));
})();
