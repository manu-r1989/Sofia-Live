# Sofia 4.72–4.74.7

## Änderungen
- 4.72: Gemeinsamer Alltag-Kontext für Text und Live unterscheidet aktuelle Station, gültigen beobachteten Übergang, Gesprächspause und Hamburger Datumswechsel. Persönliche Meinungen behalten einen nachvollziehbaren Bezug; keine Pflicht zu Rückfragen oder Fortschrittsberichten. Keine Änderung der Stimme, WebRTC-, Half-Duplex-, Lipsync- oder Avatar-Pipeline.
- 4.73: Bearbeitbare Foto-Vorschläge (Kopf gerade, dezentes Lächeln, seitliche Kamera, näherer Ausschnitt). Vorschläge füllen nur den kombinierten Editor; allein der ausdrückliche Anwenden-Button erzeugt einen Auftrag. Varianten zeigen ihren gewählten Ausgangsbezug und angeforderte Änderungen. Aktuell/Vorgänger/Wurzel bleiben auswählbar, Galerie weiterhin nach Datum/Zeit.
- 4.74: Versandkennungen verhindern Verwechslungen identischer Nachrichten und die Wiederherstellung eines bestätigten Versands durch ältere Fenster. Empfangsbelege werden beim Speichern zusammengeführt; neuere ungesendete Entwürfe anderer Fenster bleiben beim Schließen eines unveränderten Fensters erhalten. Entwürfe werden auch beim Wechsel in den Hintergrund gesichert. Kein automatisches Neuversenden. Verständliches Versandfeedback; Heute kennzeichnet fehlgeschlagene Teilbereiche mit erhaltenen, möglicherweise veralteten Daten. Dialoghöhe berücksichtigt den sichtbaren Bildschirm.

## Automatisierte Prüfung
10.10.2026: 554 Tests bestanden; Syntaxprüfung aller 33 JS-Dateien sowie zwei Inline-Skripte bestanden. Zusätzliche Regressionen für gültige/abgelaufene Übergänge, Hamburger Tageswechsel, ältere Fenster nach Versandbestätigung, neueren Entwurf eines anderen Fensters, eindeutige Wiederholungskennungen und Foto-Vorschläge ohne automatisches Absenden.

## Testabnahme / Veröffentlichung
Browserprüfung auf dem exakten Testkandidaten steht vor Veröffentlichung an: Heute, Foto-Vorschläge/Quellbezüge, Versand und Entwurf nach Reload; echte Fotoprüfung innerhalb des bestehenden Tagesbudgets. Reale Mikrofon-/Audioprüfung und Mehrtagesbeobachtung erfolgen durch den Nutzer im laufenden Betrieb. Produktiv erst nach Testprüfung; Test-only Stimmen-vergleichen-Link bleibt aus main ausgeschlossen. Vercel-Projektzugriff mit exakter Projekt-ID ohne zusätzlichen Teamfilter; keine Limits oder Schutzmechanismen ändern.
