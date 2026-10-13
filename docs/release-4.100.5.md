# Sofia 4.100.5

- Route clear everyday self-photo requests (“zeig dich mal”, “lass mal was von dir sehen”, “in dem Outfit würde ich dich gern sehen”) into tracked image jobs, even when the image planner classifies them as conversation.
- Supply recent outfit conversation to the planner for indirect outfit requests; preserve current scene and master portrait rules.
- Exclude refusals, scheduled tasks, quotations and explanations from forced routing.
- Suppress unsupported photo preparation promises in generated text responses before storing the dialogue; announce only actual backend-created jobs.
- Shared routing covers text and Live; cache 41005v1.
