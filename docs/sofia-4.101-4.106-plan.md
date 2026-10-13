# Sofia 4.101–4.106

Authorized scope: implement all six roadmap releases plus the seven extensions from the discussion, with test then production deployment per release.

- 4.101: job overview, confirmed action receipts, safe cancellation before processing, hide in-progress photo results, idempotent retry links.
- 4.102: persistent conversation profile, temporary conversation modes, “Über uns”, memory provenance/review.
- 4.103: wardrobe, structured photo wishbook, reusable outfit requests, thematic albums with existing favorites/preferred variants.
- 4.104: persistent playable stories, riddles and quiz rounds; resume later, opt-in activity suggestions.
- 4.105: project milestones/progress/reviews, permitted proactive contact types and optional personal rituals using existing quiet-hour/contact limits.
- 4.106: continuous Text/Live context and mode, pause/turn controls, visible Live actions/photos, usage counters, configurable limits and user-supplied cost estimates.

Existing long-term memory, tasks, gallery, cleanup, safe areas and drafts must remain intact. No paid limits are increased for testing. Provider billing is never represented as exact unless actually available.

## Completed
- 4.101.0 production c829e323123223d09cab53f01c79c468b68f78ef READY, 748 tests; test job overview verified and deployed static files matched.

- 4.102.0 production 32cc15763377887841d4a07cfd8c3c68ff55a858 READY, 751 tests; profile persistence, archive and memory browser views verified; deployed assets matched.

- 4.103.0 production 28f8cf9b5475d3358e76890759a997efd7b32153 READY, 753 tests; outfit reuse, wish storage/archive and one-photo album browser flow verified; deployed assets matched.

- 4.104.0 production a42115def7efdcbe0308e0c4c8f09dd449cf40e4 READY, 755 tests; quiz progress survives close/reopen; deployed assets matched.
