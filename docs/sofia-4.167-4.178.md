# Sofia 4.167–4.178 · Aktivitätsstudio

Release: 4.178.0. Neue Funktionen unter Einstellungen → Entdecken und Suchen sowie Start → Funktionen suchen und entdecken. Favoriten erscheinen zusätzlich im Startbereich. Kalenderintegration, bestehende Daten und Bildbudgets bleiben unverändert.

| Version | Ergebnis |
| --- | --- |
| 4.167 | Funktionskatalog mit Stichwortsuche und serverseitig gespeicherten Favoriten. |
| 4.168 | Notizbücher, Suche, Bearbeitung, Archiv/Wiederherstellung, bis vier vorhandene Fotos. Chat-Ausschnitte werden im tatsächlichen Verlauf geprüft und als unveränderte Quellenkopie getrennt vom bearbeitbaren Text gespeichert. |
| 4.169 | PDF-Textimport mit PDF.js 6.4.299, Originalseiten; Textimport mit eindeutig bezeichneten Textabschnitten. Fragen und Zusammenfassungen aus bis sechs gewählten Quellen; jede ausgegebene Quellenstelle wird gegen den gespeicherten Text geprüft. Kein OCR, keine externen PDF-Ressourcen, Originaldatei wird nicht aufbewahrt. |
| 4.170 | Bearbeitbare, auswählbare Lernkartenentwürfe aus gewählten Notizen/Dokumentstellen; Quellenprüfung, ausdrückliche einmalige Übernahme in bestehende Lernstapel und Quiz. Keine automatische Bewertung des Lernstands. |
| 4.171 | Beispielsatz als Sofia-Audio, eigene Aufnahme oder Audiodatei, Wiedergabe und Transkription, bearbeitbares Transkript und Textvergleich. Aufnahme maximal 60 s/2,4 MB; Datei nur bis zum Schließen lokal. Gespeichert werden nur Sprache, Beispiel und geprüftes Transkript. Keine akustische Aussprachebewertung. |
| 4.172 | Zwei kooperative Rätselabenteuer mit je drei fest geprüften Schritten, Hinweisen, Inventar, Versuchen und dauerhaftem Spielstand. Keine Modellkosten. |
| 4.173 | Zwei bis vier benannte fiktionale Rollen, Ziel und Situation. KI-Runden mit getrennten bekannten Sprechern, bestätigte Speicherung, Feedback ausschließlich aus dem gespeicherten Verlauf. |
| 4.174 | SVG-Gedankenkarte und zugängliche vollständige Verbindungsliste. Vom Nutzer definierte beschriftete Verbindungen zwischen Notizen, Dokumenten, Ideen, Entscheidungen und aktiven Vorhaben. Verbindungen entfernen und Einträge öffnen. |
| 4.175 | Ausflugsentwürfe mit Ort, Interessen, Zeit, Budget und bearbeitbaren Stopps. Ideenmodell hat keine aktuelle Recherche und darf keine bestätigten Öffnungszeiten/Preise behaupten. Separater ausdrücklich gewählter Rechercheauftrag im bestehenden Chat; keine Buchung oder Kalenderaktion. |
| 4.176 | Sofia-Vorlesemodus mit hervorgehobenem Textabschnitt, Audioplayer/Pause, manuell gewähltem nächsten Abschnitt und gespeicherter Position (Quelle, Textdigest, Abschnitt und Sekunde). Fortsetzen nach erneutem Öffnen erzeugt den betreffenden Abschnitt nach ausdrücklicher Auswahl erneut kostenpflichtig. Keine automatische kostenpflichtige Kette. |
| 4.177 | Auf Wunsch Vorschläge anhand Interessen, Stimmung, Zeit und tatsächlich verfügbaren Funktionen. Öffnen und Speichern ausdrücklich, kein automatischer Aktivitätsstart. |
| 4.178 | Gemeinsamer Verlauf gespeicherter Aktivitäten und vorhandener Sitzungen/Fokuseinheiten, direkter Wiedereinstieg, Integration in Datensicherung und Formularentwürfe. |

## Daten und Ausführung

`featureState.studio` wird mit der bestehenden Normalisierung und CAS-Speicherung validiert; ältere Daten erhalten leere Standardwerte. Begrenzte Sammlungen, insgesamt maximal 400.000 Zeichen serialisierter Studiozustand und 120.000 Dokumentzeichen. PDF maximal 2,4 MB, 60 Seiten/60.000 Textzeichen; Textdateien werden in Abschnitte zu höchstens 3.000 Zeichen geteilt. Löschen eines Dokuments ist gesondert zu bestätigen und entfernt seine Kartenverbindungen und Leseposition, aber keine früher bestätigten Lernkarten.

KI-Ergebnisse sind zehn Minuten gültige Entwürfe. Bestätigte Speicherung erfordert die unveränderte Datenrevision. Zwischenzeitliche Änderungen werden nicht überschrieben; alte Übernahmen und unbestätigte Runden bleiben unverändert. Kostenpflichtige Studioanfragen durchlaufen vor dem Modulimport die vorhandenen Testbudgets. Audiodienste behalten ihre bisherigen Grenzen. Keine geheimen Antworten in Rätselzuständen, keine neuen externen Aufgabenaktionen.

## Prüfung

- Gesamte Suite: 939 Tests bestanden, keine fehlgeschlagenen oder übersprungenen Tests (abschließende vollständige Prüfung).
- Neue Integrationstests: echte zweiseitige PDF-Extraktion, keine Textscans; tatsächliche Chatquellen, ungültige Fotos, Archiv/Wiederherstellung, Revisionskonflikte, erfundene Quellen, Kartenübernahme genau einmal, laufende parallele Änderungen, Rätsel bis Abschluss, Rollentrennung und Feedback, Kartenverbindungen, unveränderte Kalenderdaten, Leseposition und geänderte Quellen, optionale Empfehlungen, Backup-Rundlauf und Anbieterfehler.
- Browserabnahme auf getrenntem Testdeployment: Funktionssuche „Spanisch üben“, Favorit, Notiz mit Fotozuordnung, tatsächlicher zweiseitiger PDF-Import, belegte PDF-Antwort mit beiden Originalseiten, bearbeitete Besprechungsnotiz, vier bearbeitete Lernkarten, Rätsel einschließlich Fehlversuch/Hinweis bis Abschluss sowie getrennte Rollenantworten bestätigt.
- Nach Unterbrechungen der Browserverbindung wurden die tatsächlichen Speicherstände zuerst gelesen; keine unbestätigte Aktion blind wiederholt. Weitere API-Abnahme: bestätigte Rollenspielrunde und Feedback, echte Kartenverbindung, gespeicherte Leseposition, Ausflugsentwurf, optionale Aktivitätsvorschläge und kombinierter Verlauf. Tatsächliche TTS-Ausgabe (55.296 Bytes audio/mpeg) und anschließende Transkription mit erzeugtem spanischem Testaudio bestätigt: „Quiero un café con leche, por favor.“ Kalenderdaten vor und nach der Abnahme unverändert.
- Quellenprüfung toleriert reine Unterschiede bei Zeilenumbrüchen/Leerraum, gibt jedoch den gefundenen Originalausschnitt zurück. Erfundenen Wortlaut und unbekannte Quellen weist sie zurück. Lernkarten verwenden möglichst kurze Musterantworten und bleiben vor Übernahme bearbeitbar.
- Physischer Mikrofon-/iPhone-Test bleibt gesondert offen. Server-Runtimeprotokolle sind über die aktuelle Verbindung nicht zugänglich; keine Aussage über einen vollständigen serverseitigen Fehlerscan.
