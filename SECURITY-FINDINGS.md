# Verified security review — 2026-10-27
Read-only inspection of the owner's Supabase project confirmed:
- RLS enabled on all seven public tables and storage.objects/buckets.
- One administrator enrolled. Existing admin helper checks auth.uid() against tournament_admins using SECURITY DEFINER with fixed search_path.
- Tournament generation/tie RPCs contain the expected admin guard. Internal advancement/sync functions deny anon/authenticated execution.
- registrations: authenticated SELECT and UPDATE use true; INSERT remains blocked by season3_registration_closed.
- payments: authenticated SELECT uses true.
- live_match: authenticated INSERT/UPDATE use true.
- match_history: anonymous/authenticated INSERT uses true.
- gallery_photos: authenticated INSERT/DELETE use true.
- storage.objects gallery upload/delete checks only the bucket, not the administrator.
- Public gallery bucket has no file-size or MIME restrictions.
- Five base public tables grant unnecessary TRUNCATE/TRIGGER/REFERENCES to API roles.
No registration, payment or match records were read or changed in the policy audit.

## Prepared remedy
SECURITY-MIGRATION.sql adds restrictive approved-admin policies for private records and public-data mutations, restricts gallery-bucket mutations, sets future photo uploads to 20 MiB and JPEG/PNG/WebP/GIF, and revokes unnecessary table-administration privileges. Existing permissive policies, public SELECT rules, service-role access and historical records remain in place.
SECURITY-ROLLBACK.sql restores the exact new policy/config/privilege changes. Rollback deliberately restores the insecure baseline and requires owner approval.

## Verification
14 focused security/public-display tests pass, including an isolated PostgreSQL migration and rollback test. Preview returned enforced CSP/anti-framing/nosniff on six routes. Owner logged into the preview dashboard successfully with the approved-admin check.
Public gallery loaded 6 photos and no guest upload control. Existing live.html redirects to the Season 3 champions page; its public-render tests continue to pass.
Three pre-existing scorer Tie assertions remain failing. Original production match_history has no UPDATE/DELETE policy: this hardening preserves that baseline and does not claim live archive correction/undo is fixed.
Authenticated writes, uploads and payment marking have not been exercised against production records.

Production policy application, Auth signup settings/MFA, and production deployment require the owner's final confirmation. No production security settings or database records have been modified so far.
