# Sofia 4.55.7

## Umfang

- 4.52: Stabile Titel für Interessen und eigene Vorhaben, getrennte Fortschrittsverläufe und begründete Statusänderungen. Höchstens drei neue offene Interessen beziehungsweise Vorhaben; kein automatischer Fortschritt durch Zeitablauf.
- 4.53: Persönliche Ereignisbezüge nur aus ausdrücklich erzählten Aussagen mit belegtem Datum in Hamburg. Erledigte, geschlossene, kürzlich angesprochene oder vergessene Bezüge ruhen. Einzelnes Vergessen entfernt den gespeicherten Eintrag und verhindert erneute Extraktion aus altem Verlauf. Die Chatnachrichten bleiben erhalten.
- 4.54: Alltagsdetails (Kaffee, Buch, Arbeitsplatz) neben Selfies und Umgebungsbildern. Gemeinsamer Orts-, Aktivitäts-, Tageslicht- und Wetterkontext; Masterbild bleibt erste Identitätsreferenz. Varianten behalten ihre Bildart.
- 4.55: Aufklappbare Charakterübersicht, individuelle Bearbeitung und Vergessen, sichtbare Speicherbestätigung sowie Auswahl selbst angebotener Fotomotive. Datumsanzeige DD.MM.YYYY in Hamburger Ortszeit.

## Prüfung

- Automatisierte Regressionen für Text/Live, Tasks, Kalender, Idempotenz, PWA, Fotogalerie und Limits sowie neue Charakter-, Ereignis-, Vergessen- und Detailfoto-Fälle.
- Syntaxcheck aller geänderten JavaScript-Dateien und der Inline-Skripte.
- Test zuerst deployen; Browser: Übersicht öffnen, Bereiche prüfen, Motivoption speichern und nach Neuladen prüfen; ursprüngliche Auswahl wiederherstellen. Galerie-Filter prüfen. Einen realen Textturn mit einem bestehenden Vorhaben prüfen, sofern das Tagesbudget es zulässt.
- Produktiv übernimmt ausschließlich die geprüften geänderten Dateien; Test-only-Vorschau bleibt auf test-web. Danach Deployment-SHA, ausgelieferte Assets und bestehende Authentifizierung prüfen.

## Grenzen der Abnahme

Das Test-Fotobudget ist am 08.10.2026 bereits ausgeschöpft (2/2). Provideraufruf, Masterreferenz, Detailprompt, Szene, Varianten und Galerie werden mit gemocktem Provider getestet; neue tatsächlich generierte Bilder können heute nicht visuell abgenommen werden. Verhalten über mehrere Tage und subjektive Natürlichkeit bleiben Teil der Nutzerabnahme. Keine Limits umgehen oder Produktions-Login ändern.

Keine neuen Umgebungsvariablen. Bestehende Daten werden ohne Migration gelesen. Voice-, WebRTC-, Half-Duplex-, Lipsync- und Avatar-Assets bleiben unverändert.
