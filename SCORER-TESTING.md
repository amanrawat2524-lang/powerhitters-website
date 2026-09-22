# Scorer match-day check

Branch: `scorer-final-v2`. Do not merge before preview testing.

## What changed

- `scorer.html`: delivery type, runs, preview, Cancel and Confirm; recovery controls.
- `js/scorer.js`: staged UI, save lock, auth handling, recovery, timeout and match setup.
- `js/scorer-engine.js`: pure scoring, innings, exact undo and result rules.
- `js/scorer-store.js`: conditional writes, durable history identity and retry/undo reconciliation.
- `css/live-score.css`: scoped phone-friendly scorer controls.
- `live.html`: displays “Match tied” rather than “Tie won the match”.
- `tests/scorer.test.cjs`, `tests/scorer-public.test.cjs`, `tests/scorer-mock.js`, `tests/scorer-browser.cjs`, `tests/scorer-browser.js`: automated regression checks using an in-memory database.

No changes to admin login, registrations, payments, homepage layout, homepage live script, realtime subscriptions or unrelated pages.

## Database and access

No SQL migration, new column/table, service-role credential, or RLS change is included. Existing `live_match.history` stays an array: a versioned metadata entry records this match's archive ID/date/group alongside complete undo snapshots. Old score snapshots remain readable. No snapshot truncation; the final first-innings snapshot remains available for the result.

`match_history.id` is an integer in the observed database. New matches reserve a negative integer primary key and persist it in `live_match.history` before scoring. Inserts reuse that key on recovery, so a lost response cannot insert a second row. Existing positive sequence-generated IDs are untouched. An ID collision stops safely; it never overwrites a different match. Completed legacy matches adopt an existing row only when all score fields match. Legacy duplicate/incomplete histories produce a visible error instead of guessing.

**Preview smoke test must confirm authenticated explicit-ID INSERT and DELETE on `match_history`.** The source repository contains no schema migrations or RLS definitions. Public read-only inspection confirmed the expected fields, but cannot prove constraints, identity configuration or admin policies. The code verifies saves/readbacks and detects silently denied deletes. If the deployed schema rejects explicit IDs, stop and review the database setup before match day; do not weaken RLS or silently alter the schema.

The existing login checks authenticate a session, not an administrator role. Server RLS must restrict writes to approved admins. No anonymous writes were attempted in production and deployed policies were not audited. Verify `live_match` INSERT/UPDATE and `match_history` INSERT/DELETE are admin-only; public SELECT can stay available for scores. Do not grant anonymous writes.

Use one active scoring device for the match. Stale score updates from other tabs are rejected using `updated_at`. Score and archive writes are separate database operations, not a cross-table transaction: after a connection failure, the scorer pauses and requires recovery before continuing or replacing the match. Reopening a finished match may briefly precede removal of its archived result. Do not operate Undo/result recovery concurrently from different devices.

The Vercel preview uses the existing Supabase URL. Unless you configure a separate test backend, preview scoring changes the same database as the live website. Run the real smoke test during a planned test window using clearly named test teams.

## Automated checks

With Node.js 22+:

```sh
node --test --test-isolation=none tests/scorer.test.cjs tests/scorer-public.test.cjs
node tests/scorer-browser.cjs
```

Open `http://localhost:4173/scorer.html` for the browser suite. It replaces Supabase with an in-memory mock and reports pass/fail at the bottom. It never writes to the real database. Test server is local-only; it is not used by Vercel. The ordinary deployed scorer does not load these test scripts.

## Manual preview checklist

1. Log in through `admin.html`, open `scorer.html`, then set distinct teams, 4 overs, Team A first. In a private logged-out window, the scorer should require login. Public `live.html` should remain readable.
2. Choose Normal → 6. Preview must say 6 runs / legal ball, while the score and public viewer remain unchanged. Cancel; nothing should save. Select again and Confirm: 6/0 at 0.1. Dot + Confirm: 6/0 at 0.2.
3. NB → 0 adds 1 without a legal ball. NB → 6 adds 7 without a legal ball. Wide → 0 adds 1; Wide → 2 adds 3. Undo each and confirm the exact previous score/balls return. Normal Wicket adds one wicket/one legal ball/no runs. Run Out → 3 adds three runs/one wicket/one legal ball. Extras and wickets cannot be combined.
4. Rapidly double-tap Confirm. Only one delivery should save; all score/end/undo/new-match controls should be disabled throughout the save. Cancel a pending selection before ending innings or Undo.
5. At 3.5, add a no-ball: still 3.5, next delivery allowed. Add a legal dot: 4.0, **all** delivery controls disabled, including Wide/No Ball. End 1st / Start 2nd: target = first score + 1, teams swap, score resets. Undo the transition to check the complete first score returns.
6. In the chase check target, runs needed and balls remaining. Separately finish a chase with Normal, NB and Wide. NB/Wide must not add a legal ball. Undo the winning delivery: live status/target/score return and its archived result is removed. Refinish: only one result remains.
7. Set first innings to 20 and end it. End second innings at 20: result must be Tie in the scorer, public page and `match_history.winner`. At 19 the defending side wins; at 21 the chasing side wins. Repeat with Team B batting first and inspect all six score fields in history.
8. Switch the browser offline, confirm a delivery, then wait for the error/timeout. Controls must pause with a clear recovery message. Restore connectivity and use Reload / Retry Sync. Verify the server score before selecting a delivery again: a lost response may already have committed it. Repeat for history save/Undo deletion failures if you can simulate them in a test backend.
9. Refresh mid-match and after completion. Saved score, innings, target and Undo must load. Inspect `match_history`: one row per completed match, with correct teams, overs, both scores/balls, winner and match_group. Start another match with the same teams/result: it must get its own record.
10. In a second public window verify realtime totals/overs/target/result and the homepage LIVE NOW banner. The banner should disappear when finished and return after Undo reopens the match.

There is no automatic ten-wicket rule. End an innings manually when the tournament's own wicket rule requires it. First innings stops at the legal-ball limit and waits for the explicit innings switch; second innings auto-finishes at its limit or when the target is reached.
