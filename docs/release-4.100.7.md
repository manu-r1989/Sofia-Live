# Sofia 4.100.7

- Add Einstellungen → Chat with Heute, Letzte 7 Tage (including today), Bestimmtes Datum and Gesamter Chatverlauf; day boundaries use Europe/Berlin.
- Require a server-side snapshot preview and explicit confirmation with message/photo-entry counts.
- Apply reversible visibility tombstones atomically. Existing memory, tasks, character state and photo storage/retention are not deleted.
- Hide chat photo references through a separate id list, including pending jobs that complete after cleanup; keep all gallery photos accessible.
- Restore only changes introduced by the selected cleanup, with a 24-hour undo option. New messages outside the snapshot and previous hidden entries are preserved.
- Unsaved drafts remain untouched. Cache 41007v2.
