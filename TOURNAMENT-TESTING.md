# Tournament testing handoff

Branch: `scorer-mobile-redo` (the existing scorer testing branch). Do not merge into main.

## Exact format

Saturday: 8 Round-of-16 matches → 4 Quarter Finals → 2 Semi Finals → Saturday Final (15).
Sunday: the same 15 matches. Match 31 is 3rd Place: **Saturday Final loser vs Sunday Final loser**.
Match 32 is Grand Final: **Saturday Final winner vs Sunday Final winner**. Other losers are eliminated.
All 32 cards remain visible, including eliminated sides and their scores.

## Files

Changed: `admin.html` (Tournament entry), `index.html` and `tournaments.html` (permanent public links),
`live.html` (separate tabs and permanent empty score card), `scorer.html` and `js/scorer.js`
(bracket selector and metadata linkage), `tests/scorer-public.test.cjs` (new empty-state expectations).

New: `points-table.html`, `tournament-admin.html`, `css/tournament.css`, `js/tournament.js`,
`js/tournament-page.js`, `TOURNAMENT-MIGRATION.sql`, `TOURNAMENT-SECURITY-AUDIT.sql`,
this guide, `tests/tournament-db.test.cjs`, `tests/tournament-preview.cjs`,
`tests/tournament-preview-client.js`, `tests/package.json`, `tests/pnpm-lock.yaml`, `.gitignore`.

The earlier deferred homepage chase enhancement is NOT included. Public `js/live-score.js`,
registration, payment logic, gallery, sponsors and About files are unchanged.

## Database installation (one-time, not automatically applied)

Read-only inspection confirmed the deployed `live_match` and `match_history` fields used by the scorer.
The public OpenAPI endpoint refused schema access with “Secret API key required”; private SQL types,
constraints and deployed RLS were not accessible. No service key/password was requested or exposed.

1. Run `TOURNAMENT-SECURITY-AUDIT.sql` in the Supabase SQL editor and review the existing admin-only
   write protections on `live_match` and `match_history`. Existing RLS security is **unverified**;
   do not assume an authenticated user is an approved admin. No existing policies are weakened.
2. Run the exact contents of `TOURNAMENT-MIGRATION.sql` once. The transaction creates
   `tournament_matches` and `tournament_admins`, four mutation/helper functions plus the admin-check
   function, and one `live_match` trigger. It does not modify existing scores or add columns to them.
3. Enroll the existing, intended admin account with this one query, substituting its real login email:

```sql
insert into public.tournament_admins(user_id)
select id from auth.users where lower(email)=lower('YOUR_EXISTING_ADMIN_EMAIL')
on conflict do nothing;
```

Verify exactly that intended user was enrolled. Use the Supabase owner console, never browser code,
to manage this allowlist. No team/match records need manual editing.

The new tables have RLS. Public and authenticated clients can only SELECT the bracket; neither can
directly insert/update/delete bracket rows. The generation/tie RPCs require an enrolled authenticated
admin; the score trigger also checks that allowlist. The allowlist itself is not public-readable.
No unrestricted anon-write policy is introduced. New SQL privileges and denied write paths were
tested in local PostgreSQL (PGlite), not against the deployed Supabase policies.

**Preview uses the existing Supabase backend.** After installation, scoring from Vercel Preview writes
to the same `live_match`/history as the live website. Use the isolated local SQL preview below for test
teams, or a separate test Supabase project. Do not generate throwaway brackets in production.
Without the migration, admin/points pages explicitly show unavailable/setup errors; standalone scoring
continues to work. Remote migration installation/admin enrollment remain required for a usable Vercel bracket.

## Admin and scorer workflow

1. Sign in on `admin.html` as the enrolled admin → **Tournament**.
2. Paste 16 Saturday and 16 Sunday names into their textareas, one per line. Whitespace-only lines are
   ignored. Names must be unique within each day; cross-day duplicates are also rejected because the
   existing scorer identifies teams by name. “Tie” is reserved; max name length is 80 characters.
3. **Generate Tournament Bracket** asks for confirmation. Pairings follow input order (1 vs 2, 3 vs 4).
   Generation is atomic and cannot overwrite an existing bracket. Correct spelling/order before generation.
4. Choose **Score This Match** on a ready card, or select it in the scorer's Tournament match dropdown.
   Names fill automatically and are read-only. Choose overs and batting first, then Start Match.
   Unresolved future slots and played matches are not selectable. Refresh Matches gets latest results.
5. Score normally. A database trigger saves the bracket score/result and advances teams in the SAME
   transaction as `live_match`. Stable match IDs are stored in the scorer's existing history metadata.
   `match_history` still uses the scorer's existing verified archive/recovery path.
6. A tied score shows **TIE — WINNER REQUIRED**. Tournament Admin offers **Advance [team]** buttons.
   Confirm only after the tie-break. Actual innings and `match_history.winner = Tie` remain tied;
   bracket winner/loser record the advancement decision. Run rate never decides advancement.
7. Grand Final winner/loser become Champion/Runner-up. Only the Third Place match winner gets 3RD PLACE.

Run rate = `runs * 6 / legal_balls`, rounded to two decimals; zero balls → `0.00`.
23 balls renders `3.5` overs, never mathematical 3.5 overs.

## Corrections and concurrency

Undo/Redo updates the linked bracket and removes/reinstates advancement through the same transaction.
An undone tie-break result needs a fresh tie-break confirmation when it becomes tied again. A retry of
an identical finished tied score retains the existing decision. Double generation and stale tie resolutions
are rejected. Pairings never reshuffle on refresh. Refresh preserves database state, not local fake state.

Once an immediate next-round match has started, changing the earlier completed result is rejected
(including Undo), rolling back the score write. This prevents changing teams in an already played match.
Recover/reload after a rejected or uncertain save. There is intentionally no destructive reset UI.
Do not start a new season in this singleton bracket without an owner-managed archival/migration plan.

## Public pages

`live.html` stays separate and permanent. Its card shows “No live match right now. Live match will be shown
here.” for missing/not-started/finished matches. A current live match restores the normal score card.
Both pages keep LIVE SCORE / POINTS TABLE tabs; active tab uses `aria-current`.
Homepage LIVE NOW still links to `live.html`. Permanent navigation links work when the banner is hidden.
The bracket refreshes every 15 seconds while visible, plus a manual Refresh button. No realtime
publication change is required. Phones show stacked rounds/cards, without a horizontal bracket.

## Automated/local testing

Install test-only dependencies with `pnpm --dir tests install --frozen-lockfile` (Node 22+), then run:

```sh
pnpm --dir tests test
node tests/scorer-browser.cjs
node tests/tournament-preview.cjs
```

The scorer regression runner is `http://localhost:4173/scorer.html` (12 browser checks).
The separate SQL-backed integration preview is `http://localhost:4174/tournament-admin.html`.
It substitutes the Supabase client ONLY in locally served HTML, uses an in-memory PostgreSQL database,
and never contacts production. Restart it to reset test data. The test client is not loaded by deployed pages.

## Manual preview checklist

1. Public points page before generation: Coming Soon, no empty match cards. Admin without login/enrollment:
   clear login/access message and no generation controls.
2. Try 15/17 names, a duplicate (also different case), blanks and a name over 80 chars. No bracket saved.
3. Paste valid 16 + 16; generate once. Confirm 15 Saturday, 15 Sunday, Third Place and Grand Final cards.
   Refresh; input order and all slots must stay identical. Attempt second generation: refused.
4. Choose Saturday R16 M1 in admin/scorer. Confirm auto-filled names, selectable overs/batting first.
   Start; public card becomes LIVE and links to `live.html`.
5. Score a result. Both innings show runs/wickets, legal overs, two-decimal RR, WON/LOST. Winner fills QF1
   first slot; loser stays on R16 card. Repeat to fill quarter-finals, semi-finals, both day finals.
6. Before each day final, confirm semifinal losers have NO third-place slot. Finish day finals: their
   losers populate Third Place; winners populate Grand Final. Complete both and inspect all three honours.
7. Finish tied. Neither side advances. Choose an advancing team in admin and confirm. Scores remain tied;
   WON/LOST labels reflect the tie-break and a tie-break note remains. Repeat an old decision: rejected.
8. Undo a finished match before downstream play; next slot clears and archive is removed. Redo restores
   score/result. Test an extra, wicket and innings-boundary Undo/Redo. Start a downstream match: old-result
   corrections must be rejected without changing the saved score/bracket.
9. Test 24/24 → RR 6.00, 18/18 → 6.00, 23/23 → 6.00 at 3.5 overs, zero balls → 0.00.
10. Stop/finish a live match: live.html retains its card/empty message; homepage banner hides; permanent
    tabs remain. Start another: normal live score and banner return. Do not use a finished match as LIVE.
11. On 390px and desktop widths, inspect tab contrast, long team names, stacked rounds, visible scores
    and no horizontal overflow. Verify registration/payment/admin-list navigation still works.
12. As anon and an unenrolled signed-in user, attempt bracket mutation/RPCs in a separate TEST database;
    writes must fail while public reads succeed. Never probe production with destructive write tests.
