# Sofia V4.71.7 — delivery recovery, photo review and conversation pacing

Scope: 4.69.0 plus the agreed 4.69–4.71 refinements, building on the already present source/review, gallery and role-continuity foundations of 4.68.7. One release commit per environment; no empty stage commits. Assets/cache: 4717v2. Voice D, WebRTC, half-duplex, lipsync and avatar assets are unchanged. No credentials, environment configuration, protection, namespace or limits changed.

## 4.69.0 — sent message returning as a draft

A normal unsent draft and a request awaiting a receipt are now separate fields in local draft storage. Closing the PWA parks the request, not its text in the composer. Reopening restores only a genuinely unsent draft. A successful response clears the parked request. A read-only server history reconciliation also clears it when the exact text, a matching recent user timestamp and following assistant receipt are present; historical identical messages and optimistic local history cannot acknowledge it. Reconciliation runs before unchanged-history and pending-action early returns. A newly typed draft survives the receipt of an older request.

Unknown network/5xx outcomes remain parked. Known rejection can restore the draft. Unconfirmed text remains manually recoverable under Settings → Letzten Versand prüfen; recovery cannot overwrite a newer draft and never sends automatically. Legacy drafts without a pending marker are retained rather than guessing whether their identical text was intentionally retyped. Already stale drafts from older versions may therefore require one manual removal.

## 4.69 — photo reliability and review

- 4.69.1–3: combined editor displays exact selected-photo date/time plus named camera/light/crop/expression/head/body changes before the explicit submission. Source choice is visibly focused and the summary updates with it.
- 4.69.4–6: clarification freezes the current source even when it was not supplied explicitly. A later last-photo change cannot replace that source. Explicit pose/head edits take precedence over generic posture-preservation language; camera movement remains distinct. Existing safe failures, source availability checks and bounded source/result review remain.
- 4.69.7: automated source-chain, clarification, dimension, mismatch/no-publication and UI no-submission tests run. New real 90-degree image acceptance remains outstanding because the two paid Test attempts for UTC 2026-10-09 are already consumed; no budget reset, extra attempt or false geometry claim.

## 4.70 — gallery and Today

- 4.70.1–3: source/changes review and grouped edit/compare accessible label clarify photo actions. Comparison identifies source date/time; existing source/50/variant controls, exact ancestor selection and restored gallery position remain.
- 4.70.4–6: Today exposes overdue open tasks separately from today's tasks, excluding completed/future tasks; counts include overdue tasks. Detail remains read-only with a second close control. Refresh/error/partial-result handling stays coalesced and never performs mutations. Controls wrap at large type and narrow widths with usable minimum height.
- 4.70.7: regression coverage for reload/receipt, draft preservation, busy/cancel, gallery position, comparison, navigation, Today targets and settings; browser checks recorded below. Physical devices remain user acceptance if unavailable.

## 4.71 — conversation and initiative

- 4.71.1–3: short acknowledgements such as “ja genau”, “mhm” and “verstehe” leave room rather than generating another interview question. Explicit opinion requests select a grounded opinion without mandatory follow-up; context discourages repeated questions and repeated openings.
- 4.71.4–6: recent unanswered dialogue questions suppress unsolicited contact for four hours, alongside existing inbox/unread, sensitive/distance and quiet-hour safeguards. Existing current-station/observed-transition context is retained; no fabricated trips or accomplishments. Frequency, hourly photo limits and variety remain unchanged.
- 4.71.7: full regression/syntax checks, Test browser verification and exact production deployment/version verification. Multi-day initiative and real microphone/audio remain user checks in ongoing production use.

## Automated verification, 2026-10-09

547 tests passed, including 11 new cases. 33 JavaScript files and HTML inline scripts pass syntax checks. Providers are mocked in the regression suite. It verifies delayed/unknown delivery across restart and receipt, identical older message rejection, new-draft preservation, explicit recovery, selected source freezing, combined edit summary, overdue task filtering, short-reply pacing and unanswered-contact suppression. This does not certify newly generated image quality or device audio.

## Release procedure

Use current branch heads and file SHAs, retain unrelated changes, and update with leases. Test preserves its Test-only voice-comparison link; Productiv omits it. Known exact Vercel project IDs are used without redundant team filters. Check Git deploy first, avoid duplicate API deploys. Main changes only after Test UI verification. Productiv acceptance by the user is authorized for the ongoing live operation.


## Actual Test browser acceptance, 2026-10-09

Test candidate 295a052182097f341549ace845aea25f72685940 deployed READY as dpl_6ikvqNE1DK74u2WHVz9jTWS7vmQQ. One actual text-only request was submitted; the window was closed during “denkt nach” and reopened. The exact response “Versandprobe 4717 bestätigt.” appeared in server history, while the composer stayed empty. No photo was requested. Today showed retained variants and an overdue test task with read-only reminder/priority detail and both close controls. Browser QA exposed a null-date task falsely displayed as 01.01.1970; the follow-up rejects missing dates before calendar conversion and tests this case. Final assets are 4717v2.
