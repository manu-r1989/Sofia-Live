# Sofia 4.211.2 – Unicode-sichere KI-Anfragen

Produktiv wurde HTTP 400 mit Anbietercode `invalid_json` beobachtet. Die Gesprächskürzung konnte UTF-16-Zeichenpaare an der Grenze teilen. Ein Regressionstest stellt diesen Fehler nach. Die Kürzung erhält jetzt vollständige Zeichen. Ausgehende Text- und Live-Anfragen normalisieren zusätzlich isolierte Surrogatzeichen; gespeicherte Originalinhalte werden nicht umgeschrieben. Eine produktive Erfolgsprüfung der betroffenen Sitzung steht noch aus.

1.031 automatisierte Tests erfolgreich, darunter verschachtelte beschädigte Zeichen, unveränderte gültige Emojis und unveränderte Originaldaten.
