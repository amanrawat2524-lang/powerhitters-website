-- Run once in the Supabase SQL editor. No existing scores/registrations are changed.
-- Afterwards enroll the intended existing admin with the separate bootstrap query
-- in TOURNAMENT-TESTING.md. No public signup is implicitly an administrator.
begin;
create table public.tournament_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.tournament_admins enable row level security;
revoke all on public.tournament_admins from anon, authenticated;

create function public.ph_tournament_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select exists(select 1 from public.tournament_admins where user_id = auth.uid()) $$;
revoke all on function public.ph_tournament_admin() from public;
grant execute on function public.ph_tournament_admin() to anon, authenticated;

create table public.tournament_matches (
  id integer primary key check (id between 1 and 32),
  bracket_id uuid not null,
  day text not null check(day in ('Saturday','Sunday','Overall')),
  round integer not null check(round between 0 and 4),
  match_number integer not null,
  team_a text, team_b text,
  a_source integer references public.tournament_matches(id),
  b_source integer references public.tournament_matches(id),
  a_outcome text not null default 'winner' check(a_outcome in ('winner','loser')),
  b_outcome text not null default 'winner' check(b_outcome in ('winner','loser')),
  score_a jsonb, score_b jsonb,
  winner text, loser text,
  status text not null default 'upcoming' check(status in ('upcoming','live','tied','completed')),
  tied boolean not null default false,
  archive_id bigint,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  check(a_source is null or a_source < id),
  check(b_source is null or b_source < id),
  check(winner is null or winner = team_a or winner = team_b),
  check(loser is null or loser = team_a or loser = team_b)
);
alter table public.tournament_matches enable row level security;
revoke all on public.tournament_matches from anon, authenticated;
grant select on public.tournament_matches to anon, authenticated;
create policy tournament_public_read on public.tournament_matches for select to anon, authenticated using (true);
-- There are deliberately no INSERT/UPDATE/DELETE grants or policies for clients.

create function public.ph_generate_tournament(saturday text[], sunday text[]) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare names text[]; d integer; base integer; i integer; bid uuid := gen_random_uuid();
begin
  if not public.ph_tournament_admin() then raise exception 'Tournament administrator required'; end if;
  perform pg_advisory_xact_lock(735202632);
  if exists(select 1 from public.tournament_matches) then
    raise exception 'Bracket already exists. Generation never overwrites teams or results.';
  end if;
  for d in 0..1 loop
    names := case when d=0 then saturday else sunday end;
    select array_agg(regexp_replace(btrim(n), '\s+', ' ', 'g') order by ord) into names
      from unnest(names) with ordinality x(n,ord);
    if coalesce(cardinality(names),0) <> 16 or
      exists(select 1 from unnest(names) n where n is null or length(n)=0 or length(n)>80 or lower(n)='tie') or
      (select count(distinct lower(n)) from unnest(names) n) <> 16 then
      raise exception 'Each day needs exactly 16 unique non-empty team names (max 80 characters; Tie is reserved)';
    end if;
    -- Names identify sides in the existing scorer; cross-day duplicates would make
    -- the Grand Final ambiguous, so reject those too.
    if d=0 then saturday:=names; else sunday:=names; end if;
  end loop;
  if exists(select 1 from unnest(saturday) a join unnest(sunday) b on lower(a)=lower(b)) then
    raise exception 'Use different team names across the two days as well';
  end if;
  for d in 0..1 loop
    base:=d*15; names:=case when d=0 then saturday else sunday end;
    for i in 1..8 loop
      insert into public.tournament_matches(id,bracket_id,day,round,match_number,team_a,team_b)
      values(base+i,bid,case when d=0 then 'Saturday' else 'Sunday' end,0,i,names[i*2-1],names[i*2]);
    end loop;
    for i in 1..4 loop
      insert into public.tournament_matches(id,bracket_id,day,round,match_number,a_source,b_source)
      values(base+8+i,bid,case when d=0 then 'Saturday' else 'Sunday' end,1,i,base+i*2-1,base+i*2);
    end loop;
    for i in 1..2 loop
      insert into public.tournament_matches(id,bracket_id,day,round,match_number,a_source,b_source)
      values(base+12+i,bid,case when d=0 then 'Saturday' else 'Sunday' end,2,i,base+8+i*2-1,base+8+i*2);
    end loop;
    insert into public.tournament_matches(id,bracket_id,day,round,match_number,a_source,b_source)
    values(base+15,bid,case when d=0 then 'Saturday' else 'Sunday' end,3,1,base+13,base+14);
  end loop;
  insert into public.tournament_matches(id,bracket_id,day,round,match_number,a_source,b_source,a_outcome,b_outcome)
  values (31,bid,'Overall',4,1,15,30,'loser','loser'), (32,bid,'Overall',4,2,15,30,'winner','winner');
end $$;

-- Called only from trusted RPCs/triggers, never directly by browsers.
create function public.ph_advance_tournament() returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.tournament_matches; a text; b text;
begin
  for m in select * from public.tournament_matches where a_source is not null order by id loop
    select case when m.a_outcome='winner' then winner else loser end into a
      from public.tournament_matches where id=m.a_source and status='completed';
    select case when m.b_outcome='winner' then winner else loser end into b
      from public.tournament_matches where id=m.b_source and status='completed';
    if m.team_a is distinct from a or m.team_b is distinct from b then
      if m.status <> 'upcoming' then raise exception 'Cannot change an earlier result after the next round has started'; end if;
      update public.tournament_matches set team_a=a,team_b=b,revision=revision+1,updated_at=now() where id=m.id;
    end if;
  end loop;
end $$;

create function public.ph_resolve_tie(match_id integer, advancing_team text, expected_revision bigint) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.tournament_matches;
begin
  if not public.ph_tournament_admin() then raise exception 'Tournament administrator required'; end if;
  perform pg_advisory_xact_lock(735202632);
  select * into m from public.tournament_matches where id=match_id for update;
  if not found or m.status <> 'tied' or m.revision <> expected_revision then raise exception 'Tie changed. Reload before resolving.'; end if;
  if advancing_team is null or advancing_team not in (m.team_a,m.team_b) then raise exception 'Select one of the tied teams'; end if;
  update public.tournament_matches set winner=advancing_team,
    loser=case when advancing_team=m.team_a then m.team_b else m.team_a end,
    status='completed',revision=revision+1,updated_at=now() where id=match_id;
  perform public.ph_advance_tournament();
end $$;

create function public.ph_sync_tournament_score() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare meta jsonb; old_meta jsonb; m public.tournament_matches; first_score jsonb;
  sa jsonb; sb jsonb; current_score jsonb; next_status text; win text; lose text; is_tie boolean; changed boolean;
begin
  if jsonb_typeof(new.history::jsonb)='array' then
    select x into meta from jsonb_array_elements(new.history::jsonb) x where x->>'scorer_version'='2' limit 1;
  end if;
  if tg_op='UPDATE' and jsonb_typeof(old.history::jsonb)='array' then
    select x into old_meta from jsonb_array_elements(old.history::jsonb) x where x->>'scorer_version'='2' limit 1;
  end if;
  if old_meta ? 'tournament_match_id' and
    (old_meta->>'archive_id' is distinct from meta->>'archive_id' or old_meta->>'tournament_match_id' is distinct from meta->>'tournament_match_id') and old.status <> 'finished' then
    raise exception 'Finish the current tournament match before starting another match';
  end if;
  if not coalesce(meta ? 'tournament_match_id',false) then
    if old_meta ? 'tournament_match_id' and old_meta->>'archive_id'=meta->>'archive_id' then raise exception 'Cannot unlink tournament scoring history'; end if;
    return new;
  end if;
  if not public.ph_tournament_admin() then raise exception 'Tournament administrator required'; end if;
  perform pg_advisory_xact_lock(735202632);
  select * into m from public.tournament_matches where id=(meta->>'tournament_match_id')::integer for update;
  if not found or m.bracket_id::text is distinct from meta->>'tournament_bracket_id' then raise exception 'Tournament match no longer exists'; end if;
  if m.team_a is null or m.team_b is null or new.team_a is distinct from m.team_a or new.team_b is distinct from m.team_b then raise exception 'Bracket teams changed or are not ready. Reload match selection.'; end if;
  if meta->>'archive_id' is null or (m.archive_id is not null and m.archive_id::text is distinct from meta->>'archive_id') then raise exception 'This bracket match is already linked to another score'; end if;
  if m.archive_id is null and m.status <> 'upcoming' then raise exception 'Match already started'; end if;
  if new.status is null or new.innings is null or new.runs is null or new.wickets is null or new.legal_balls is null or new.overs_limit is null or new.overs_limit not between 1 and 50 or new.status not in ('live','finished') or new.innings not in (1,2) or new.runs<0 or new.wickets<0 or new.legal_balls<0 or new.legal_balls>new.overs_limit*6 then raise exception 'Invalid tournament score'; end if;
  if new.batting_team not in (m.team_a,m.team_b) or new.bowling_team not in (m.team_a,m.team_b) or new.batting_team=new.bowling_team then raise exception 'Invalid batting/bowling teams'; end if;
  current_score:=jsonb_build_object('runs',new.runs,'wickets',new.wickets,'balls',new.legal_balls);
  if new.innings=2 then
    select x into first_score from jsonb_array_elements(new.history::jsonb) with ordinality e(x,n)
      where x->>'innings'='1' order by n desc limit 1;
    if first_score is null or (first_score->>'runs')::integer+1 is distinct from new.target or first_score->>'batting_team' is distinct from new.bowling_team then raise exception 'First innings missing or inconsistent'; end if;
    first_score:=jsonb_build_object('runs',(first_score->>'runs')::integer,'wickets',(first_score->>'wickets')::integer,'balls',(first_score->>'legal_balls')::integer);
  end if;
  if new.batting_team=m.team_a then sa:=current_score;sb:=first_score;else sb:=current_score;sa:=first_score;end if;
  is_tie:=new.status='finished' and new.runs=new.target-1;
  next_status:=case when new.status='live' then 'live' when is_tie then 'tied' else 'completed' end;
  if new.status='finished' then
    if new.innings<>2 then raise exception 'A tournament result requires two innings'; end if;
    win:=case when is_tie then null when new.runs>=new.target then new.batting_team else new.bowling_team end;
    if new.winner is distinct from coalesce(win,'Tie') then raise exception 'Winner does not match the scores'; end if;
    if win is not null then lose:=case when win=m.team_a then m.team_b else m.team_a end;end if;
    -- A retry of an identical tied score must retain an admin's tie-break decision.
    if is_tie and m.tied and m.status='completed' and m.score_a=sa and m.score_b=sb then
      win:=m.winner;lose:=m.loser;next_status:='completed';
    end if;
  end if;
  changed:=m.score_a is distinct from sa or m.score_b is distinct from sb or m.status is distinct from next_status or m.winner is distinct from win;
  if changed and m.status='completed' and exists(select 1 from public.tournament_matches where (a_source=m.id or b_source=m.id) and status<>'upcoming') then
    raise exception 'Next round has started. This earlier result cannot be changed.';
  end if;
  if changed or m.archive_id is null then
    update public.tournament_matches set score_a=sa,score_b=sb,status=next_status,tied=is_tie,
      winner=win,loser=lose,archive_id=(meta->>'archive_id')::bigint,revision=revision+1,updated_at=now() where id=m.id;
    perform public.ph_advance_tournament();
  end if;
  return new;
end $$;

create trigger ph_live_tournament_sync after insert or update on public.live_match
for each row execute function public.ph_sync_tournament_score();
revoke all on function public.ph_generate_tournament(text[],text[]) from public;
revoke all on function public.ph_resolve_tie(integer,text,bigint) from public;
revoke all on function public.ph_advance_tournament() from public,anon,authenticated;
revoke all on function public.ph_sync_tournament_score() from public,anon,authenticated;
grant execute on function public.ph_generate_tournament(text[],text[]) to authenticated;
grant execute on function public.ph_resolve_tie(integer,text,bigint) to authenticated;
commit;
