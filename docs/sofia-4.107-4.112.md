# Sofia 4.107–4.112

This scope implements the six approved roadmap stages. Voice messages, a shared diary, initiative feedback, general conversation search, calendar synchronization and the additional image-understanding extension remain deferred until after the user test.

| Stage | Delivered flow |
| --- | --- |
| 4.107 | Proposed memory changes are held for explicit confirmation. Known conflicting facts are flagged; source quotes and dates remain visible. Per-memory archive and temporary expiry control use in Text/Live while retaining the original. |
| 4.108 | Named topics capture bounded actual conversation turns. Extractive summaries retain sources, can be edited, and are selected for both Text and Live. Answered turns are not replayed as new tasks. |
| 4.109 | Interest/difficulty quiz banks, saved scores, validated generated branching stories, persistent decision paths, and shared writing with draft review/adoption. Generation requires an explicit click and retains existing paid/test guards. |
| 4.110 | Saved source-bound photo plans select editable dimensions. Identity and hair color remain fixed. Clear review mismatches are reported with dimensions; no automatic second image generation. |
| 4.111 | Project steps with acyclic dependencies, actual linked-task progress, confirmation before task creation, recorded changes and an opt-in Sunday review using existing contact/quiet/photo-only rules. |
| 4.112 | Versioned checksum-checked JSON export, selected-area import preview and atomic one-use confirmation. Existing unrelated records are retained; stale previews are rejected. Images, chat, tasks, credentials and usage counters are not restored. |

All new menus reuse existing Back/Close navigation and safe-area layout. Restore preserves JSON array shapes and checks companion, memory, project and task snapshots together. Task links are retained only when the referenced task currently exists. Imported rituals remain disabled until explicitly reactivated.

Memory conflict detection includes structured facts (home, profession, preferences, favorite color) and all proposed classifier updates. It is a review aid, not a claim to detect every semantic contradiction. Quiz banks currently cover Spanish, nature and travel at two difficulty levels. Generated stories and writing drafts depend on provider availability and are structurally validated before saving.
