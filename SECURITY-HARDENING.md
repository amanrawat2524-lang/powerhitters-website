# Security hardening
## Scope
- Admin dashboard, gallery uploads and every scorer write require the existing server-side ph_tournament_admin allowlist. A valid login session alone is insufficient.
- These client checks improve the UI and fail closed; they do NOT replace table/storage policies. A direct REST caller bypasses browser code.
- Vercel sends a CSP without inline/eval script permissions, anti-framing, nosniff, referrer and permissions headers. Inline live-page code is moved unchanged to js/live-page.js. Founder image error fallbacks use event listeners.
- Existing inline CSS remains allowed for compatibility. jsDelivr remains a trusted script source. HTTPS/HSTS are supplied by hosting.
- Upload UI rejects unsupported extensions, photos over 20 MB, invalid categories and captions over 500 characters. Bucket settings/RLS must enforce upload rules server-side.
- Environment files and local Vercel metadata are ignored by Git.

## Database review before production rollout
Run SECURITY-AUDIT.sql as the project owner. It is read-only and returns policies, grants and configuration, not registration/payment records.
Confirm:
1. The intended current administrator is enrolled in tournament_admins and the RPC returns true for that login. Do not enroll arbitrary signed-up users.
2. RLS is enabled on all exposed public tables.
3. registrations and payments can only be read/changed by the approved administrator or trusted backend service.
4. Public SELECT remains available for live_match, match_history, gallery_photos and tournament_matches. Their writes require the approved administrator or authorized server functions.
5. gallery-photos is public-read only; INSERT/UPDATE/DELETE require the approved administrator. Set a suitable server-side upload limit and image MIME allowlist.
6. Inspect every exposed SECURITY DEFINER RPC: browser client guards do not protect such functions.
7. If public account registration is unnecessary, disable new signups in Auth settings after confirming existing admin login/recovery still work. Enable MFA for owner/admin accounts through the supported account flow.
Do not run speculative policy replacements. Existing base policies are not stored in this repository. Capture current definitions before proposing a reversible migration.

## Validation
Run:
    node --test tests/security.test.cjs tests/public-media.test.cjs tests/scorer-public.test.cjs
    node --test tests/scorer.test.cjs

The scorer suite has three pre-existing assertions expecting Tie; deployed scoring awards the first-batting team on equal scores. This change does not alter that rule.
Check Vercel preview headers and public pages, logged-out admin/scorer gates, owner login, gallery upload and Mark Paid/Pending in a test environment before production.
No production database writes, signup changes or secret rotation are performed by these source changes.
