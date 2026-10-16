# Sofia 4.100.6

- Add a percentage split between proactive text contacts and photo contacts in Eigeninitiative and Fotos in eigenständigen Kontakten.
- Store photoShare (0–100, default 30); message share is its complement. Validate inputs and preserve the ratio through pause/resume and saves from old clients.
- Apply weighting before selecting background contact kind and before spontaneous in-chat photo decisions. Keep scene suitability, opt-outs, unanswered-contact rules, quiet hours and existing image/contact budgets.
- Display as a weighting rather than guaranteed quota; manual photo requests remain independent.
- Cache 41006v1.

## Validation
- 740 automated tests passed: exact weighted draw counts, exclusions, validation and persistence through pauses/old clients, frontend save and zero-share proactive suppression without affecting manual requests.
- Syntax and inline script checks passed.
- Test commit aacafbb4fe022411a6ce1e7f6daaf46b878b6100 READY.
- Browser: saved 70% photos / 30% text, reopened and confirmed persisted selection; restored original test setting afterwards. Top scroll remained zero.
