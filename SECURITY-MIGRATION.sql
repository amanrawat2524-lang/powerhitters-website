-- Reviewed against production metadata on 2026-10-27. APPLY ONLY AFTER OWNER APPROVAL.
-- Adds restrictive admin guards; does not replace existing policies or change tournament/registration/photo records.
begin;
do $$
begin
  if not exists(select 1 from public.tournament_admins) then raise exception 'No approved administrator enrolled'; end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relrowsecurity and ((n.nspname='public' and c.relname in
      ('registrations','payments','live_match','match_history','gallery_photos')) or (n.nspname='storage' and c.relname='objects'))) <> 6
  then raise exception 'Expected RLS-protected tables missing; audit before proceeding'; end if;
end $$;
create policy ph_security_admin_only on public.registrations as restrictive for all to anon, authenticated using ((select public.ph_tournament_admin())) with check ((select public.ph_tournament_admin()));
create policy ph_security_admin_only on public.payments as restrictive for all to anon, authenticated using ((select public.ph_tournament_admin())) with check ((select public.ph_tournament_admin()));
create policy ph_security_admin_insert on public.live_match as restrictive for insert to anon, authenticated with check ((select public.ph_tournament_admin()));
create policy ph_security_admin_update on public.live_match as restrictive for update to anon, authenticated using ((select public.ph_tournament_admin())) with check ((select public.ph_tournament_admin()));
create policy ph_security_admin_delete on public.live_match as restrictive for delete to anon, authenticated using ((select public.ph_tournament_admin()));
create policy ph_security_admin_insert on public.match_history as restrictive for insert to anon, authenticated with check ((select public.ph_tournament_admin()));
create policy ph_security_admin_update on public.match_history as restrictive for update to anon, authenticated using ((select public.ph_tournament_admin())) with check ((select public.ph_tournament_admin()));
create policy ph_security_admin_delete on public.match_history as restrictive for delete to anon, authenticated using ((select public.ph_tournament_admin()));
create policy ph_security_admin_insert on public.gallery_photos as restrictive for insert to anon, authenticated with check ((select public.ph_tournament_admin()));
create policy ph_security_admin_update on public.gallery_photos as restrictive for update to anon, authenticated using ((select public.ph_tournament_admin())) with check ((select public.ph_tournament_admin()));
create policy ph_security_admin_delete on public.gallery_photos as restrictive for delete to anon, authenticated using ((select public.ph_tournament_admin()));
create policy ph_security_gallery_insert on storage.objects as restrictive for insert to anon, authenticated with check ((bucket_id <> 'gallery-photos' or (select public.ph_tournament_admin())));
create policy ph_security_gallery_update on storage.objects as restrictive for update to anon, authenticated using ((bucket_id <> 'gallery-photos' or (select public.ph_tournament_admin()))) with check ((bucket_id <> 'gallery-photos' or (select public.ph_tournament_admin())));
create policy ph_security_gallery_delete on storage.objects as restrictive for delete to anon, authenticated using ((bucket_id <> 'gallery-photos' or (select public.ph_tournament_admin())));
-- Existing public photos remain readable. Only future uploads are limited.
update storage.buckets set file_size_limit=20971520,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif']::text[]
where id='gallery-photos';
-- Browser/API roles never need whole-table or trigger/foreign-key administration.
revoke truncate, trigger, references on public.registrations,public.payments,public.live_match,public.match_history,public.gallery_photos from anon,authenticated;
commit;
