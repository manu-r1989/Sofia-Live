# Sofia 4.74.11–4.78.7

## Umsetzung
- 4.74.11: eingebettete Zitate mit Sprecher/Datum; Nachrichten aus dem Chat dauerhaft ausblenden, ohne sichtbaren Löschplatzhalter. Aufgaben/Memory/Galeriefotos bleiben bestehen. Galerie-Fotos können separat aus dem Chat ausgeblendet werden.
- 4.75.0–4.75.6: längere Zitatvorschau, Quellhervorhebung, ältere Fragen als begrenzte Bezüge, Sprecher-/Orts-/Zeitregeln und gezielte Korrekturkontexte; Suche mit Nachbartext. 4.75.7: Regressionen und Browserabnahme.
- 4.76.0–4.76.6: zitiertes Foto bindet eine konkrete gültige Bild-ID; Varianten bewahren nicht angeforderte Dimensionen, Review prüft eindeutige Identitäts-/Haarfarben-/Kleidungsabweichung; navigierbare Fotoreihe; Detailbereichsauswahl; bestehende Quellenbindung bei Retry. 4.76.7: Quellen-/Prompt-/Reviewtests, echte Fotoprüfung nur bei verfügbarem Tagesbudget.
- 4.77.0–4.77.6: offene Fragen/Fäden, datumsbezogene Folgefragen erst nach dem Ereignis, keine erneute Nachfrage innerhalb eines Tages, abwechslungsreiche Reaktionen ohne Pflichtfrage, zusätzliche Dreistundenpause; Ruhezeiten/Versandgrenzen und situative Fotoprüfung beibehalten. 4.77.7: automatische Policytests, mehrtägige Abnahme beim Nutzer.
- 4.78.0–4.78.6: Heute zeigt Entwurf und beantwortbare ältere Fragen zusätzlich zu Nachrichten/Fotos/Aufgaben; Aufgaben aus gewählter Nachricht erst nach explizitem Speichern mit Hamburger Fälligkeit; gemeinsame Dialog-Rückkehr erhält Chatposition; Einstellungen gruppiert; Entwurf/Zitat/Versand und Fehlerfälle regressionsgeprüft. 4.78.7: vollständige Tests, Testbrowser, danach Produktiv.

## Grenzen und Abnahme
Keine Änderungen an stabiler Voice-/WebRTC-/Lipsync-/Avatar-Pipeline. Kein Reset/Anheben von Tageslimits. Am 10.10.2026 bereits zwei Foto-Provider-Versuche aus 4.74.7 verbraucht: neue Fotofunktionen können heute strukturell und ohne Generierung geprüft werden; reale neue Generierung bleibt für verfügbare Nutzung offen. Kein automatischer Neuversand aus GET. Geräteaudio und Mehrtagesbeobachtung erfolgen im laufenden Betrieb.
