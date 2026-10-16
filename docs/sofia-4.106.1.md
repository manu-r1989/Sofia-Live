# Sofia 4.106.1

Activities: answer buttons and new-round buttons use a consistent grid, 10px gaps and a 44px minimum touch height. Small screens use one column. Suggestion preferences form a separate section. Existing game state is preserved.

Initiative: 100% photos means photo contacts only. If photo permission, allowed contact types, sleep/unanswered state, preparation or generation prevent a photo, no standalone text is delivered. Due rituals wait while this selection applies. Selected photo contacts no longer depend on a text-model photo flag. A newly selected 100% setting is rechecked before text delivery. New photos are not discarded merely because their short caption was recently used. Existing quiet periods, contact spacing, image limits and scene checks remain in force.

Validation: 768 tests passed, 0 skipped. Mock-provider integration tests cover successful photo publication and failed-photo suppression. Browser verified 44px activity buttons and 10px gaps, loaded saved quiz state without advancing it, and preserved Back/Close controls. No paid providers were called during verification.
