# Sofia 4.65.7 — Test candidate

## Scope

Release covers the agreed 4.62–4.65 stages as one reviewable change. Stable avatar assets, voice profile D, WebRTC, half-duplex and lipsync code are unchanged. No credentials, environment variables, test isolation or usage limits are changed.

### 4.62 — Photo source and visible continuity

The 4.61.10/11 source-first generation and paired source/result review are retained: exact selected source ID is frozen at submission and checked before and after generation. Camera-only changes preserve visible posture, scene and clothing. Rear views do not force a front-facing face. Clear posture changes and clearly unchanged/opposite compass directions can trigger at most one correction; ambiguous geometry does not trigger a retry. A failed retry cannot fall back to the newest chat photo. New explicit source selection in the viewer extends this to chains and to deliberately returning to their root.

### 4.63 — Gallery

- Current photo, immediate source and retained series root are selectable, with a preview before submission. Missing ancestors are not silently replaced.
- Variants receive a compact series indication within existing date/time groups; no grouping by situation.
- Comparison uses a touch/keyboard operable range slider between the immediate source and its variant.
- Compass explains camera movement relative to the selected source, with larger controls; navigation resets source selection and closes old compass state.
- Gallery date/type/order/favorites and scroll survive closing and reopening on this device. Returning from a photo preserves the existing gallery view.

### 4.64 — Conversation and role life

Shared Text/Live photo context explicitly separates past capture from current Hamburg life. An explicit photo question uses the selected photo, never a different fallback. Ambiguous “dort” or “das Outfit” uses photo context only immediately after an actual photo topic; otherwise current role context remains authoritative. Expired/deleted/unpublished pictures contribute no context. Ordinary conversation adds no Redis photo lookup.

Single photo changes do not become permanent preferences; role transitions must not invent unseen shared events. Existing relevance, unanswered-contact suppression, motif/category variety, daily 3–7/configured contacts, quiet hours and maximum two unsolicited photos per hour remain in force and retain their regression coverage.

### 4.65 — Today

“Chatwerkzeuge → Heute” shows selected sections: unread messages, today's retained photos, the user's open tasks due today, and unexpired open conversation topics. Dates use Hamburg/Berlin time and German display format. Entries open the exact message/contact, photo or task detail. “Weiterreden” only prepares a draft after explicit selection; it does not overwrite a draft or submit automatically. Section visibility is stored locally with feedback.

Today is read-only: coalesced GET requests, independent error handling and last loaded entries on partial failure. It neither resumes image generation nor repeats task actions. Unread contacts use the same ledger as existing notification badges; normal unread chat replies are added once and contact duplicates are excluded. Opening Today does not mark the conversation as read.

## Verification and release gate

Automated tests include source chains, explicit ancestor selection, compare boundaries, gallery restoration, source/result review, failed retry publication, ambiguous deictic questions, photo age limits, Hamburg summer/winter dates, completed-task exclusion, settings normalization, coalesced GETs, partial outage, draft preservation, navigation and shared unread counts. Syntax checks cover all changed JS and HTML inline scripts.

Automated/mocked image tests do **not** verify real generated photo geometry. Before updating main or deploying Productiv, deploy this exact candidate to the isolated Test project and verify the following against the actual browser/API/data flow:

1. Test banner reads 4.65.7; all versioned scripts including sofia-today.js load, no relevant console errors.
2. Open a retained gallery photograph, change to a variant and change that variant again. Chosen source preview and result belong to the exact chain. Test camera 90° and rear view within the existing test budget; inspect posture and scene yourself. A model's own “passed” review is insufficient evidence.
3. Slider, source choices, gallery filters/scroll, compass cancellation, keyboard and photo navigation work. Open Today, confirm exact targets, section persistence, no automatic action and unchanged existing draft. Check narrow layout/large type as supported by the browser.
4. Text and Live context share current life while explicit old-photo references remain past. No microphone permission is required for read-only UI verification; real audio/device behavior remains a user check if unavailable.
5. Existing task/calendar and proactive notification paths remain covered by automated tests; inspect an existing task without creating or completing real user data.
6. Multi-day quiet hours, contact variety and ongoing role continuity remain observational checks in normal use.

Do not reset test data, bypass auth/isolation, lift budget limits or use Productiv credentials/data as a sandbox. If Test deployment, permissions or budget blocks verification, main stays unchanged. Retry Test hourly as authorized; only after meaningful Test verification apply these changed files to the then-current main with a branch lease, preserving its Production-only index differences, then deploy Productiv and verify exact version/hash. Disable the retry automation after successful Productiv release.
