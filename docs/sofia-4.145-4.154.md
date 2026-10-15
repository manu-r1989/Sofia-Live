# Sofia 4.154.0

Kalenderkonto-Anbindung und bestehender ICS-Kalender bleiben auf dem bisherigen Stand. Keine neuen Kalenderzugriffe, Termine oder externen Kontoverbindungen.

## Entwicklungsblock

| Version | Umsetzung |
| --- | --- |
| 4.145 | Gemeinsame Dialognavigation, sichere mobile Eingaben, neue kompakte Formulare, versionierte PWA-Dateien und vollständige Syntaxprüfung. Physischer iPhone-Test bleibt gesondert. |
| 4.146 | Bestehende angenommene Bildaufträge zeigen Zeitpunkt und Status und aktualisieren sich während der geöffneten Ansicht. Neue Foto-Freigaben besitzen einmalige serverseitige Startmarkierungen. |
| 4.147 | Bearbeitbare Fotovorgaben für Motiv/Pose/Umgebung und Licht/Stil, kombinierbar und mit expliziter Vorschau vor einem einzelnen bezahlten Start. |
| 4.148 | Beschriebene Outfit-Vorgaben mit Favorit und vorhandenem Foto als Merkhilfe, integrierbar in neue Bildaufträge. Bestehender Kleiderschrank bleibt erhalten. |
| 4.149 | Fotoserien mit bis zu sechs Motiven. Jedes Motiv separat prüfen und freigeben; zukünftige Motive stoppen. Keine automatische Seriengenerierung. |
| 4.150 | Gezieltes „Das hatten wir schon“-Feedback aus Nachrichtenaktionen als Kontext für neue Antworten, ohne Erinnerungen zu löschen. |
| 4.151 | Herkunft und Zeitpunkte vorhandener Erinnerungen, Korrektur und direkter Weg zu Widerspruchs-/Gültigkeitsprüfung werden in der Gedächtnisverwaltung zusammengeführt. |
| 4.152 | Ausdrückliche Freigabe, Pause und Mindestabstand für aktive Vorhaben. Projektkontakte müssen zum freigegebenen Vorhaben passen und werden vor Zustellung erneut geprüft. |
| 4.153 | Zusätzliche Tageshöchstzahl/Mindestabstand und Vorschau persönlicher Versandblockaden. Fokus- und Arbeitsmodus pausieren proaktive Kontakte. Fotoquote und bestehende Limits bleiben verbindlich. |
| 4.154 | Auf Wunsch erzeugter, vor Speicherung bearbeitbarer Wochenrückblick aus tatsächlich gespeicherten Vorhaben, Schrittänderungen und verfügbaren Fotomomenten. |

## Zusätzliche Funktionen

- Entscheidungen mit bis zu acht gewichteten Kriterien und sechs Optionen; Bewertungen, Notizen und Vergleich bearbeitbar speichern.
- Interaktive Geschichten mit benannten Sitzungen, Kapiteln, Entscheidungen und alternativen Zweigen. Alle gespeicherten Kapitel der Sitzung werden als Kontext mitgeschickt.
- Übungsgespräche mit frei gewählter Gegenrolle und ausdrücklich angefordertem Feedback.
- Sprachgespräche mit Sprache/Niveau/Korrekturwunsch; vorgeschlagene Vokabeln vor Übernahme prüfen und ohne Duplikate als eigene Lernkarten speichern.
- Fokusziel, gespeicherte Endzeit und Abschlussreflexion. Kein garantierter Hintergrundalarm.
- Ideensammlung mit Kategorien, Suchfilter, Links und vorhandenen Fotos. Projektvorlage nur nach Auswahl; eigentliches Vorhaben anschließend separat prüfen/bestätigen.
- Stilbibliothek als kombinierbare Fotovorgaben.
- Lokaler PNG-Export für ein oder zwei vorhandene Fotos, eigenen Text und optionales Datum. Keine neue KI-Bildgenerierung, keine Änderung der Originale.
- Eigene manuell gestartete Gesprächsrituale mit beschriebenen Schritten/Fragen/Dauer; bestehende Frequenzverwaltung persönlicher Rituale separat zugänglich.
- Befristete Situationen Arbeit, Unterwegs und Zeit zum Reden. Arbeitsmodus unterdrückt ungefragte Kontakte und automatische Text-Audiowiedergabe; manuell angefordertes Audio bleibt möglich. Kein automatisches Einschalten von Audio.
- Quizduelle aus eigenen Lernkarten: echte Modellantwort ohne Musterlösung oder Nutzerantwort im Prompt. Beide Antworten anhand der gespeicherten gültigen Antworten bewerten; Lernstand unverändert. Keine Garantie für semantisch gleichwertige freie Antworten.
- Gesprächszweig aus einer Chatnachricht; eigener gespeicherter Verlauf und Rückweg zum Hauptchat. Keine Aufgaben-/Kalender-/Bildausführung aus Übungssitzungen oder Zweigen.

## Datenerhalt und Grenzen

Neue persönliche Bereiche werden im validierten persönlichen Backup mitgesichert. Übernahmen verwenden Versionsvergleich gegen gleichzeitige Änderungen. Wiederherstellung startet keine importierte Fokuseinheit oder Quizrunde und übernimmt keinen temporären Situationsmodus. Bestehende Chats, Fotos, Aufgaben und Erinnerungen werden nicht bereinigt.

Bis zu 30 Sitzungen mit je 40 Abschnitten und insgesamt 500 KB Erweiterungsdaten; keine unbegrenzte Langzeitablage. Archivieren blendet Einträge aus und löscht sie nicht. Foto-Merkhilfen sind keine automatische Erkennung von Kleidungsstücken oder technische Garantie visueller Übereinstimmung. Fotos behalten ihre bestehende Aufbewahrungszeit. Bildaufträge, die bereits angenommen wurden, lassen sich durch Serien-Stopp nicht zurücknehmen. Unbestätigte Starts werden nicht automatisch kostenpflichtig wiederholt.

902 automatisierte Tests bestanden, einschließlich Zustand/Backup, Versionskonflikten, Sitzungszweigen, echten abgeschirmten Quizprompts, Vokabel-Deduplizierung, Kontaktregeln, zeitabhängigen Fokusgrenzen sowie doppelten Foto-/Serienfreigaben. Keine subjektive Modellqualitätsgarantie und kein physischer iPhone-Test.

## Ergänzende Releaseprüfung

- Alte Fotovorschauen werden bei Eingabe-/Auswahländerung oder Serien-Stopp entfernt, auch wenn die Vorschauantwort erst später eintrifft.
- Serienstarts behalten eine dauerhafte Startmarkierung. Angenommene Aufträge werden nach parallelen Formularänderungen gezielt mit frischem Stand verknüpft; andere Änderungen und ein zwischenzeitlicher Stopp bleiben erhalten. Unklare Starts werden nicht kostenpflichtig wiederholt. Eine neue bewusst geplante Serie hat eine eigene Identität.
- Bestehende Serien lassen sich nicht durch neue Motive überschreiben. Leere Serien und leere Eintragstitel werden abgelehnt.
- Wochenrückblicke berücksichtigen auch archivierte abgeschlossene Schritte, verwenden die tatsächlich datierten Fortschrittsänderungen und schließen zukünftige Änderungseinträge aus.
- Situationsauswahl zeigt den aktuell gültigen Modus; abgelaufene Modi werden nicht als aktiv angezeigt.

- Nach angenommenen Fotoaufträgen wird der gespeicherte Serienstand erneut geladen, damit Fortschrittsanzeige und anschließender Stopp die aktuelle Revision verwenden.
