# Sofia 4.100.7

- Add Einstellungen → Chat with Heute, Letzte 7 Tage (including today), Bestimmtes Datum and Gesamter Chatverlauf; day boundaries use Europe/Berlin.
- Require a server-side snapshot preview and explicit confirmation with message/photo-entry counts.
- Apply reversible visibility tombstones atomically. Existing long-term memory, tasks, character facts and photo storage/retention are not deleted. Reset only snapshotted short-term dialogue for removed dates; preserve newer conversations and all durable memories.
- Hide chat photo references through a separate id list, including pending jobs that complete after cleanup; keep all gallery photos accessible.
- Restore only changes introduced by the selected cleanup, with a 24-hour undo option. New messages outside the snapshot and previous hidden entries are preserved.
- Unsaved drafts remain untouched. Cache 41007v2.

## Validation
- 746 automated tests passed. Included date/DST scopes, invalid inputs, deduplication, confirmation and idempotency, fixture apply/undo with protected memory/task/gallery data, and short-term dialogue concurrency guards.
- Syntax and inline script checks passed.
- Final test deployment 528cd64cdf0fe8232ae2e80946042b4e523040d4 READY.
- Browser verified Chat menu, four options, preview counts, cancellation back to Chat settings, date selector and disabled empty-range confirmation. Existing test conversations were not cleared.
