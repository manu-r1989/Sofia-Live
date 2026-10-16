# Sofia 4.100.5

- Route clear everyday self-photo requests (“zeig dich mal”, “lass mal was von dir sehen”, “in dem Outfit würde ich dich gern sehen”) into tracked image jobs, even when the image planner classifies them as conversation.
- Supply recent outfit conversation to the planner for indirect outfit requests; preserve current scene and master portrait rules.
- Exclude refusals, scheduled tasks, quotations and explanations from forced routing.
- Suppress unsupported photo preparation promises in generated text responses before storing the dialogue; announce only actual backend-created jobs.
- Shared routing covers text and Live; cache 41005v1.

## Validation
- 736 automated tests passed, including planner-none fallbacks, exclusions, request tracking, Text/Live endpoint routing and grounded reply persistence.
- Syntax checks passed for changed backend and inline scripts.
- Test deployment 498988a90fc87e1e2911d4140340b602147a0b02 READY.
- Browser end-to-end: submitting “zeig dich mal” generated and displayed photo 77b759f0-1304-4baa-975b-fb03b539d9a6 in the chat.
