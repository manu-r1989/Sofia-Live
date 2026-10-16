# Sofia 4.181–4.190 · Quellen, Lernwege und persönliche Abläufe

Releaseziel 4.190.0 auf Basis der am iPhone bestätigten 4.180.2. Alle neuen Werkzeuge sind unter Einstellungen → Aktivitäten und Wissen → Werkzeuge und Abläufe erreichbar. Die gemeinsame Suche ist zusätzlich im Suchmenü verfügbar; die Werkzeuge stehen auch im Funktionskatalog und als auswählbare Favoriten bereit.

| Version | Umsetzung |
| --- | --- |
| 4.181 | Gemeinsame kostenlose Begriffssuche über sichtbaren gespeicherten Chat, freigegebene Erinnerungen, aktive Notizen, einzelne Dokumentseiten und aktive Vorhaben. Bereichsfilter und Datumsgrenzen in Berliner Zeit, höchstens 80 Treffer. Originalstelle erneut aus dem aktuellen Speicher lesen, archivierte/ausgeblendete Quellen nicht öffnen. |
| 4.182 | Kostenpflichtige Texterkennung aus JPEG/PNG/WebP oder maximal sechs gescannten PDF-Seiten bis 2,4 MB. Tatsächliche PDF-Seitenzahl vor Provideraufruf prüfen. Erkannten Text pro Originalseite korrigieren und ausdrücklich speichern. Keine Originaldatei im persönlichen Speicher; keine automatische Erkennung beim Dateiauswählen. |
| 4.183 | Kostenloser wörtlicher Vergleich zweier gespeicherter Dokumente mit alten/neuen Textblöcken, Originalseiten, hinzugekommenen/entfallenen Zahlen und möglichen Datumsangaben. Optionale kostenpflichtige Besprechung mit verifizierten Originalzitaten; bearbeitbarer Bericht. Umgestellte Abschnitte können als entfallen/neu erscheinen. |
| 4.184 | Besprechungsprotokoll aus gewählten Notizen oder Dokumentstellen: Zusammenfassung, Entscheidungen, offene Fragen und bearbeitbare Aufgabenvorschläge. Erst Bericht bestätigen; danach jeden Vorschlag einzeln einem aktiven Vorhaben als Schritt zuordnen. Die bestehende Planung kann daraus Aufgaben verknüpfen. Keine automatische Kalender- oder Aufgabenanlage. |
| 4.185 | Anpassbare Vorlagen für Reise-, Dokument- und Gesprächsvorbereitung sowie eigene Vorlagen mit bis zwölf Schritten. Jeder Durchlauf kopiert die Vorlage, speichert Antworten und bestätigte Schritte und lässt sich pausieren/fortsetzen. Optionale kostenpflichtige Hilfe bezieht sich nur auf den aktuellen Schritt. |
| 4.186 | Lernpfade aus vorhandenen Quellenauszügen und Lernkarten, bis acht Einheiten. Schwierige Karten anhand tatsächlicher Fehlerhistorie auswählen; Fragen mit vorhandenen Muster-/Alternativantworten prüfen, Lernstand atomar aktualisieren und schwache Karten wiederholen. Einheit ausdrücklich mit Reflexion abschließen; Materialauszug als Snapshot erhalten. |
| 4.187 | Trainingsziel, Situation und fiktionale Gegenrolle; bis 18 bestätigte Runden mit vorgeschlagener steigender, frei änderbarer Schwierigkeit. Belegtes Feedback aus tatsächlich gespeicherten Nutzerbeiträgen und Verlauf mehrerer subjektiver Einschätzungen. Keine objektive Kompetenzmessung. |
| 4.188 | Geschichtenwelten mit Figuren, Orten, Beziehungen, Ereignissen und offenen Handlungen. Vorhandene Geschichte optional als Kapitel übernehmen. Neue Kapitel erhalten das gesamte begrenzte Weltwissen und Kapitel als Kontext. Strukturierte Änderungen mit bestehenden Fakten vergleichen und vor Übernahme ausdrücklich freigeben. Freier Fließtext wird dadurch nicht vollständig auf literarische Widersprüche geprüft. |
| 4.189 | Gespeicherte Fotogeschichten aus bis acht verfügbaren Bildern mit Kapitelreihenfolge, Titeln, Einleitung und Bildtexten. Hoch-, Quer- und Quadratlayout, pixelgleiche PNG-Kapitelvorschau und komplette selbständige HTML-Datei inklusive Bildern. Zu lange Texte vor Export zurückweisen statt abschneiden. Zusätzliche Bilder nur im bestehenden Fotoauftrag gezielt beauftragen. |
| 4.190 | Eigene wiederverwendbare Abläufe aus Lesen, Fragen, Lernen, Training, Notizen und Prüfschritten. Schrittweise selbst öffnen und bestätigen, Ergebnisse speichern, pausieren und getrennte neue Durchläufe beginnen. Keine automatische Kette kostenpflichtiger Aufrufe. |

## Speicherung und Grenzen

Neuer validierter Bereich `featureState.journey`, bestehende Quellen bleiben erhalten. Revisionen und atomare Companion-Speicherung schützen gegen parallele Änderungen. Modellantworten bleiben zehn Minuten gültige, zunächst ungespeicherte Entwürfe. Jede Übernahme verlangt die unveränderte Revision, ausdrückliche Bestätigung und eine noch nicht angewendete Vorschlags-ID. Quellenbelege werden als Originalausschnitte gegen die ausgewählten Texte geprüft; dies bestätigt die Zitatstelle, nicht jede Interpretation des Modells. OCR bleibt vor Übernahme manuell zu prüfen.

Bis 24 Berichte, 24 Vorlagen, 30 Durchläufe, 16 Lernpfade, 16 Trainings, 12 Geschichtenwelten, 16 Fotogeschichten, 80 Ereignisse und 650.000 Zeichen im neuen Bereich. Studio-Dokumentgrenzen und bestehende Bildaufbewahrung gelten zusätzlich. Archivierung und Wiederherstellung sind im Werkzeugbereich zugänglich. Vollständige Datensicherung integriert; importierte aktive Durchläufe werden pausiert und überschreiben keinen bereits vorhandenen Durchlauf mit derselben ID.

Die in 4.180.2 bestätigte iPhone-Verankerung und Schreibzeile werden nicht verändert. Neue Dialoge verwenden die vorhandene Navigation und Tastaturbehandlung. Kalenderanbindung und native iOS-App sind nicht Bestandteil dieses Releases.

## Prüfung

Neue Integrationsprüfungen decken Suchsichtbarkeit/Zeitzone, Seitennummern und Textdiff, echte PDF-Strukturprüfung vor OCR, korrigierte Seitenübernahme ohne Rohdatei, verifizierte Zitate, einmalige Vorhabenschritte, Revisionskonflikte, kopierte Vorlagen, Schrittfolge/Pause, Backup ohne automatisches Fortsetzen, Lernantworten/Wiederholung, belegtes Trainingsfeedback, Faktenkonflikte und Fotoreferenzen ab. Browserabnahme und Produktiv-Dateiabgleich folgen vor Abschluss.

Stand 16. Oktober 2026: 965 automatisierte Tests bestanden, keine Fehler oder übersprungenen Tests. Bereitstellung auf test-web erfolgreich; ausgelieferter Quellstand und 34 statische Assets geprüft.

Der zuvor erschöpfte Testdatenspeicher antwortet wieder. Reale Abnahme mit isolierten Testdaten erfolgreich: Dokumentvergleich erkennt 100/120 EUR und geänderte Frist; tatsächliche KI-Texterkennung eines synthetischen Dokumentfotos mit Seitenübernahme; Besprechungsprotokoll mit verifizierten Originalzitaten und Aufgabenvorschlägen; Gesprächsrunde und belegtes Trainingsfeedback; neues Geschichtenkapitel ohne Faktenkonflikt. Speicherung jeweils durch frisches Lesen bestätigt. Ablauf pausiert und wieder aufgenommen; vorhandene Lernkarte tatsächlich bewertet und Einheit abgeschlossen. Kalender unverändert.

Browserprüfung: Werkzeugübersicht, gemeinsame Suche mit zwei Treffern und aktuell geladener Originalstelle sowie gespeicherte Fotogeschichte geöffnet. PNG und vollständige HTML-Fotogeschichte tatsächlich heruntergeladen: zwei eingebettete Bildseiten, PNG 1200 × 1600, erste HTML-Bildseite bytegleich mit dem PNG; Bild und Beschriftung visuell kontrolliert. Die HTML-Datei benötigt keine externen Bildressourcen. Neue physische iPhone-Abnahme wurde hier nicht durchgeführt; die bereits vom Nutzer bestätigte Chat-Geometrie aus 4.180.2 bleibt erhalten.

Temporäre Speicherdiagnose ist aus dem Release entfernt. Keine Tarif-/Zugangsdatenänderung und keine Ersatzdatenbank angelegt.


## UI-Nachbesserung 4.190.1

Werkzeugübersicht in drei Themenbereiche gegliedert und Suchstichworte durch verständliche Aktionshinweise ersetzt. Verwendet dieselben linksbündigen Menüeinträge wie die bestehenden Einstellungen. Zurück/Schließen auf 44 × 44 Pixel vergrößert, sichtbaren Tastaturfokus ergänzt und Formularfelder in Fotokapiteln und Weltwissen über die Kartenbreite angeordnet. Menübuttons unter 360 Pixeln erhalten eine einheitliche Mindesthöhe von 66 Pixeln für zweizeilige Titel. Training und neue Geschichtenwelt zeigen nach dem Laden einen echten Hinweis statt dauerhaft „Wird geladen …“.

965 automatisierte Tests bestanden. Responsive Browserprüfung bei 320 und 390 Pixeln: Menütexte, lange Überschriften, Zurücknavigation sowie Trainings- und Fotokapitel-Formulare geprüft, kein horizontaler Dialogüberlauf. Dies ist keine Prüfung auf einem physischen iPhone. Chat-Geometrie und Farben wurden nicht geändert. Die ausschließlich auf dem Testzweig abgelegte UI-Prüfseite wird nicht produktiv veröffentlicht.
