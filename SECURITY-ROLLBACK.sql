-- Emergency rollback only: restores the audited broad access rules. Owner approval required.
begin;
drop policy ph_security_admin_only on public.registrations;
drop policy ph_security_admin_only on public.payments;
drop policy ph_security_admin_insert on public.live_match;
drop policy ph_security_admin_update on public.live_match;
drop policy ph_security_admin_delete on public.live_match;
drop policy ph_security_admin_insert on public.match_history;
drop policy ph_security_admin_update on public.match_history;
drop policy ph_security_admin_delete on public.match_history;
drop policy ph_security_admin_insert on public.gallery_photos;
drop policy ph_security_admin_update on public.gallery_photos;
drop policy ph_security_admin_delete on public.gallery_photos;
drop policy ph_security_gallery_insert on storage.objects;
drop policy ph_security_gallery_update on storage.objects;
drop policy ph_security_gallery_delete on storage.objects;
-- Original audited bucket settings were both NULL.
update storage.buckets set file_size_limit=null,allowed_mime_types=null where id='gallery-photos';
-- Restore only the original three privileges removed by this migration.
grant truncate, trigger, references on public.registrations,public.payments,public.live_match,public.match_history,public.gallery_photos to anon,authenticated;
commit;
