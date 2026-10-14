# Sofia 4.113–4.117

Approved scope: implement through 4.117, verify on test-web, then release to main. Calendar, routines and the additional personality work remain outside this release.

| Stage | Delivered behavior |
| --- | --- |
| 4.113 | Per-format contact ceilings; optional like/less/more feedback on actual delivered contacts, weighted topic/photo-category selection, and last-attempt explanations. Total frequency, quiet hours, pauses, allowed photo kinds, photo share and strict 100%-photo behavior remain authoritative. |
| 4.114 | Explicit audio recording (60 seconds maximum), local playback/file input, server transcription, editable transcript review and explicit chat send. Optional AI audio reply and manual playback from message actions use existing TTS. Microphone tracks stop on close. Original recordings are temporary on-device; reviewed transcripts use normal chat storage. |
| 4.115 | Confirmed diary entries with date, editable text and up to six retained gallery references; source extracts from chosen moments/milestones/photos; monthly draft from actual diary entries; archive/restore. Drafts never save themselves or create memories/tasks. Existing photo retention still applies. |
| 4.116 | Embedding-based meaning search over currently available chat, active memories, active topics, retained photo descriptions and active diary entries. Original source/date is shown; deleted/archived sources are rechecked before returning results. Explicit query only, no background indexing. Vectors are content-hashed and cached for 24 hours. |
| 4.117 | Explicit uploaded-image discussion; source-bound edit preview and separate generation confirmation; no Sofia master injected. Confirmed edits use existing test/personal image quotas, serialize image work, store results in the existing gallery and do not automatically regenerate. Later gallery changes route back to the own-photo workflow. |

Diary, contact feedback and preferences participate in the existing versioned backup with validation and selected-area restore. No original audio or uploaded-image bytes are included in JSON backups. New menu panels reuse Back/Close and safe-area layout. Provider calls remain server-side with authentication and origin checks.

Provider integration uses existing direct HTTP conventions; no new SDK/dependency. New endpoints used: audio/transcriptions (gpt-4o-mini-transcribe) and embeddings (text-embedding-3-small, 256 dimensions). Existing image edit and TTS providers are reused.

Verification: 798 automated tests pass (zero failures/skips), including stale edits, explicit confirmation/idempotency, source provenance, semantic synonym ranking, concurrent deletion filtering, retained 100%-photo rules and API access/test guards. Browser/device verification is recorded separately after the test deployment. Physical iPhone microphone, codec behavior and playback restrictions require a device test; mocked provider tests do not establish subjective transcription/image quality.
