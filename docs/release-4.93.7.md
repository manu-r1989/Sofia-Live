# Sofia V4.91–V4.93.7

Datum: 11.10.2026. Asset-/Cachekennung: `4937v1`.
Basis main `06d5412dc739856e25398e4b7100bf578b140b0b`, test-web `c2853e6d1f25214f8f8e2df07e9f5d8e215848f2` (V4.90.12).

Die drei Runden bilden einen gemeinsamen Release. Bestehende Funktionen werden erhalten und geprüft, statt als neue Implementierung ausgegeben.

## 4.91.0–4.91.7 — Gesprächsbezüge

Eine begrenzte Fragenagenda wird aus den kanonischen sichtbaren Nachrichten neu aufgebaut. Sie unterscheidet Frage und Fotoangebot sowie offen, beantwortet, abgelehnt und ruhend. Ausdrückliche Zitate und eindeutige Themenbezüge haben Vorrang. Kurze Antworten auf mehrere aktuelle Fragen werden vor einem kostenpflichtigen Bild-/Aufgabenauftrag konkret geklärt, in Text und im Live-Kontext. Ordinale Antworten wählen nur den vorhandenen ersten/zweiten/dritten Punkt. Klärungsfragen vervielfachen die Agenda nicht. Alte, zukünftige, ungültige und gelöschte Nachrichten erzeugen keine aktiven Auftragsbezüge. Die Agenda enthält keine neuen permanenten Fakten und löst selbst keine Aktionen aus.

Bereits bestehend und erneut geprüft: eigene Vorhaben mit bestätigtem Fortschritt und Status, getrennte Nutzer-/Sofia-Ereignisse, Pausenkontext, keine Erledigung allein durch Zeitablauf, thematische Bezugnahme und abwechslungsreiche optionale Meinungen/Reaktionen statt Pflichtfragen. Die neue Agenda ergänzt diese Logik, ersetzt sie nicht.

## 4.92.0–4.92.7 — Fotoänderungen

Varianten halten nun einen serverseitigen Änderungsvertrag im Job und im gespeicherten Bildresultat fest: exakte sourceId, Aufnahmezeitpunkt, ausgewählte Dimensionen, übrige zu erhaltende Merkmale und stets geschützte Gesichtszüge/Haarfarbe. Kameraänderungen gelten relativ zur konkret ausgewählten Quelle, nicht zur Serienwurzel. Licht allein erlaubt keine neue Kleidung, Haltung, Kopfhaltung, Tageszeit oder Szene.

Die vorhandene Bildprüfung vergleicht zusätzlich klare nicht angeforderte Änderungen von Kopfhaltung, Mimik, Gestik, Ausschnitt, Licht und Frisur. Ausdrücklich gewählte Dimensionen werden nicht als unbeabsichtigte Fehler gewertet. Unsichere Kameraprüfung wird auch bei einem schwach bestätigten ok=true als unsicher gekennzeichnet; die Oberfläche behauptet dann keinen sicher geprüften Perspektiverfolg und startet keinen automatischen neuen Versuch. Bestehender begrenzter Korrekturversuch nur bei klarer Abweichung bleibt erhalten. Keine Erhöhung/Zurücksetzung von Provider-/Testbudgets.

Bereits bestehend und erneut geprüft: unmittelbare Quellverkettung, gezielte Korrekturformulierungen, tatsächlicher Fotostatus statt dauerhaftem Chat-Platzhalter, explizite neue Anfrage nach Fehler und korrekter Quellenbezug. Ein Änderungsvertrag ist keine Garantie pixelgleicher Generierung.

## 4.93.0–4.93.7 — Bedienung und Stabilisierung

Vorgänger, Ursprung und Folgevarianten wechseln im selben Viewer. Der ursprüngliche Dialog-/Chat-Rückkehrpunkt bleibt erhalten; Familientraversierung springt nicht ungefragt zur neuesten Nachricht. Quellenwahl und Downloadvorbereitung werden nach jedem Wechsel erneuert, zusätzliche Änderungsmenüs schließen sich. Vorhandene Navigation, Vergleich und galerieinterne Scrollposition bleiben erhalten.

Textentwürfe halten nun auch ihren beim Schreiben gewählten Fotobezug fest. Späteres Betrachten eines anderen Fotos überschreibt diesen Bezug nicht. Reload, gesicherter unbestätigter Versand und Wiederherstellung behalten ihn. Absenden übergibt den eingefrorenen Bezug zusammen mit dem Zitat. Bereits gesendete Texte werden nicht erneut als Entwurf geöffnet; kein automatisches Neuversenden nach GET/Reload/Update. Lange Zitate bleiben kompakt, umbrechbar und vollständig aufklappbar; bestehende Dialogfokus-, Tastatur-, PWA-Update- und Reconciliation-Tests bleiben erhalten.

## Prüfungen

- **666 automatisierte Tests bestanden**, kein Fehler.
- Syntax: **8 JS-Dateien und 2 Inline-Skripte bestanden**.
- Neue konkrete Tests: Mehrdeutigkeit vor Fotoannahme, eindeutiges/ordinales/ausdrücklich zitiertes Ziel, erledigte oder abgelehnte Fragen, Themenwechsel und Pause, Klärung ohne Endlosschleife, fester Fotovertrag im Job/Resultat, nicht ausgewählte vs. ausgewählte Kopf-/Mimikänderung, unsichere Kamerabestätigung, Viewer-Wiederverwendung, Fotobezug über Entwurf/Reload/Fehler.
- Reale Test-Abnahme und exakte Deploymentprüfung stehen beim Anlegen dieses Dokuments noch aus. Prüfpunkte: aktueller Assetstand, alter Antwortbezug, Entwurf/Reload/Senden, Galeriequelle und Viewer-Rückkehr, Vergleich, gezielte Fotoänderung im verbleibenden Tagesbudget. Danach aktuelle main-Dateien/SHA laden, unabhängige Änderungen erhalten, Test-only voicePreview-Link nicht nach main übernehmen und exakten Produktivcommit/READY/Alias/Assets verifizieren.

Keine Änderung an Voice-/WebRTC-/Half-Duplex-/Lipsync-Logik oder Avatarassets. api/live-context.js ergänzt ausschließlich die gemeinsame Bezugsklärung. Reale Mikrofon-/iPhone-Geräteprüfung und mehrtägige Beobachtung erfolgen durch den Nutzer im laufenden Betrieb.
