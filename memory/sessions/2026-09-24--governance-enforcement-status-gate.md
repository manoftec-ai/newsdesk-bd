# Session 2026-09-24 — P0-1: Governance enforcement (status gate)

## What changed
- **verify.mjs**: added automation-only enforcement (`if (status !== 'passed') status = 'human_check'`) and explanatory comments. Backup `.bak` saved.
- **extract.mjs**: exportBriefs now skips briefs where `verdict.status !== 'passed'`. Tier A blocks unless badge is `confirmed` or `verified`. Backups `.bak2/.bak3/.bak4` saved.
- **finalize_stories.mjs**: blocks finalization if `brief.verdict.status !== 'passed'`. Added `blocked` counter to summary. Backups `.bak2/.bak5` saved.

## Verification
- Existing state: 325 briefs in state/briefs, many Tier A `confirmed/passed`. `pick.json` had national-453 (existing .md live) — finalize gave 0 written/skipped/failed/blocked.
- Enforcement is applied at both extraction (brief generation) and finalization (publish gate). No human-touch path introduced.

## Notes
- Current pipeline already produces `verdict.status` (`passed|human_check`) per tier floor. Enforcement now makes it a hard gate for automation (no manual flip).
- Site content unchanged. Backups created in `/usr/tmp/opencode/newsdesk-bd-backup-*`.
