# Sofia 4.166.0 — persönlicher Arbeitsbereich und gemeinsame Aktivitäten

Kalenderanbindung, bestehende ICS-Einträge, Chats, Aufgaben und Fotodateien bleiben erhalten. Keine neuen Kontoverbindungen oder Kalenderaktionen.

| Version | Umsetzung |
| --- | --- |
| 4.155 | Persönlicher Startbereich mit aktiven Vorhaben, tatsächlich zuletzt benutzten Sitzungen und auswählbaren Schnellzugriffen. Reihenfolge und Sichtbarkeit serverseitig gespeichert. Zusätzliches Startsymbol; der Hauptchat bleibt direkt erreichbar. |
| 4.156 | Bis zu acht eigene Situationsprofile mit Antwortlänge, Audio-Pause und Eigeninitiative. Ausdrückliche zeitlich begrenzte Aktivierung. Aktive Werte werden kopiert, spätere Profilbearbeitung ändert nicht heimlich die aktuelle Auswahl. Keine automatische Audioaktivierung. |
| 4.157 | Bis zu acht Fokus-Etappen mit Arbeit/Pause und eigener Dauer. Echte Restzeit bei Unterbrechen/Fortsetzen, expliziter Etappenabschluss oder Überspringen, gespeicherte Reflexion und Abschlussverlauf. Weitere Etappen starten nur ausdrücklich; kein garantierter Hintergrundalarm. |
| 4.158 | Strukturierte Sprachsitzungen mit Zielsprache, CEFR-Niveau, Ziel und Korrekturwahl. Gesammelte Korrekturen auf Wunsch, Sprechübungen und explizit angeforderte TTS-Wiedergabe. Vokabelübernahme und gezielte Wiederholung in vorhandenen Lernkarten. Keine akustische Aussprachebewertung aus reinem Text. |
| 4.159 | Figuren, Orte, bestätigte Ereignisse und bearbeitbar übernehmbare Kapitelzusammenfassung. Alternativzweige übernehmen den ausgewählten Abschnitt und dessen strukturierte Angaben. Vergleich zeigt gemeinsame und abweichende gespeicherte Kapitel. |
| 4.160 | Gespeicherte Gegenrolle, Trainingsziel und Schwierigkeit. Modellkontext fordert Feedback mit konkreten Beispielen aus dem tatsächlichen Übungsverlauf. Kein Eingriff in Hauptchat, Aufgaben oder Kalender. |
| 4.161 | Vorteile, Nachteile, offene Annahmen und spätere Erfahrung je Entscheidung. Was-wäre-wenn-Vergleich mit veränderter Gewichtung; Szenario als eigener eingefrorener Stand, Ursprungsbewertung unverändert. |
| 4.162 | Verknüpfte Ideen, eigene Weiterentwicklung und explizit kostenpflichtiger Ausarbeitungsvorschlag. Vorschlag vor Übernahme bearbeitbar; für ein Vorhaben anschließend eigene Projektvorschau/Bestätigung. |
| 4.163 | Eigene Ritualschritte mit Frage, Reihenfolge und ungefährer Dauer. Antworten und übersprungene Schritte gespeichert, Pause/Fortsetzung, Besprechung des aktuellen Schritts in der zugehörigen Sitzung. Keine automatische Kontaktfreigabe. |
| 4.164 | Stilgalerie mit tatsächlich verfügbaren Beispielbildern und kombinierbarer Auswahl für den vorhandenen Fotoauftrag. Fotokarten: ein bis vier Fotos, fünf Layouts, drei Farbthemen, Rand/Beschnitt, editierbare Texte und pixelgleicher lokaler PNG-Export. |
| 4.165 | Quiz aus eigenen Themenstapeln, Schwierigkeit anhand vorhandener Lernhistorie und optionaler Rundenzeit. Modell bekommt nur Frage, keine Musterlösung/Nutzerantwort. Gespeicherte Antworten und korrigierbare Bewertungen; Lernfortschritt erst nach gesonderter einmaliger Übernahme. |
| 4.166 | Benannte Gesprächszweige mit gespeichertem Ausgangspunkt. Zusammenfassung kostenpflichtig vorbereiten, vor Hauptchatübernahme bearbeiten und ausdrücklich bestätigen. Hauptchat und Übernahmebeleg werden atomar mit beiden Versionsständen geschrieben. |

## Datensicherheit und überprüfbare Grenzen

Neue Bereiche werden über die vorhandene validierte Sicherung exportiert/wiederhergestellt. Importierte Fokuspläne werden nicht aktiviert; laufende lokale Pläne bleiben beim Zusammenführen erhalten. Eingaben, Referenzen, Anzahl und Gesamtgröße bleiben begrenzt. Archivierte/fehlende Bilder und Ideen werden nicht neu erzeugt. Bei gleichzeitig geänderten persönlichen Daten wird eine veraltete Übernahme abgelehnt.

Generierte Textvorschläge sind Vorschläge und bleiben vor Übernahme bearbeitbar. Keine automatische Ausführung darin enthaltener Aufgaben, Bild- oder Kalenderwünsche. Quizbewertungen erkennen gespeicherte Antworten; freie Formulierungen lassen sich durch den Nutzer korrigieren. Schwierigkeiten sind Auswahl anhand der bisherigen Kartenhistorie, keine objektive Kompetenzmessung. Live-Sitzungen für neue Profile/Vorgaben neu starten.

Kontaktpause gilt während einer laufenden Fokus-Etappe; bei abgelaufener oder pausierter Etappe greifen wieder die sonstigen Kontaktregeln. Der Timer berechnet sich aus gespeicherter Endzeit/Restzeit, ohne Hintergrundalarm oder automatische Etappenwechsel. Physischer iPhone-/Mikrofontest und subjektive Modellqualität bleiben gesonderte Prüfungen.

## Prüfung vor Browser-Abnahme

921 Tests bestanden, einschließlich Profile/Ablauf, Fokus-Restzeit und Etappen, Backup ohne aktivierte Importtimer, Sprachkontext, Figurenübernahme bei Zweigen, Ritualpausen, Entscheidungsszenarien, Ideenfreigaben, Quizkorrektur/einmaliger Lernübernahme, atomarer Hauptchatübernahme sowie vorhandenen Foto-/Live-/Kalender-Regressionsprüfungen. Neue Zwei-Schlüssel-Übernahme zusätzlich mit tatsächlicher Lua-Ausführung gegen konkurrierende History-Änderungen und Doppelübernahmen geprüft. Alle ausgelieferten JavaScript-Dateien/Inline-Skripte werden auf Syntax geprüft.


## Browserprüfung auf Test

- Persönlicher Startbereich lädt tatsächliche Vorhaben/Sitzungen; Profil mit eigener Antwortlänge gespeichert, bis zur angezeigten Uhrzeit aktiviert und wieder beendet.
- Fokus mit zwei Etappen gestartet, mit gespeicherter Restzeit unterbrochen/fortgesetzt, erste Etappe ausdrücklich bestätigt und zweite übersprungen. Abschluss zeigt die tatsächlich bestätigte Anzahl. Etappennotizen werden im aktuellen Ablauf und in den letzten 40 Abschlussaufzeichnungen angezeigt.
- Strukturierte Sprachsitzung Spanisch/A2 mit Ziel „Im Café bestellen“ angelegt. Echte Modellantwort in Spanisch empfangen, drei Vokabelpaare vor Übernahme geprüft und als Lernkarten gespeichert. Kein automatischer Hauptchatversand oder Audiostart.
- Fotokarte aus zwei vorhandenen Fotos mit Layout untereinander und eigenem Text erstellt, PNG tatsächlich heruntergeladen und visuell geprüft: 1200 × 1000 Pixel, beide ausgewählten Fotos und kompletter Text vorhanden. Keine KI-Bildgenerierung.
- Nachbesserungen: konsistente Minuten-/Sekundenanzeige, deutsche Profilbeschreibungen und verständlicher gespeicherter Ausgangspunkt von Chat-Zweigen. Situationshinweis passt auch zu einem Profil außerhalb des Arbeitsmodus.

- Quiz-Schnellzugriff ausgewählt und in geänderter Startreihenfolge gespeichert. Echte Quizantworten aus übernommenen Vokabelkarten erzeugt; eine ausführliche, inhaltlich richtige Modellantwort manuell als richtig bewertet, Punkte angepasst und Lernstand zunächst unverändert belassen.
- Gesprächszweig aus einer konkreten Testnachricht mit sichtbarem Sprecher und Ausgangsdatum erstellt. Eigene Antwort gespeichert, Zweigzusammenfassung erzeugt, vor Übernahme bearbeitet und atomar in den Test-Hauptchat übernommen. Backendbeleg und gespeicherte Hauptchatnachricht stimmen überein.
- Bei bereits laufendem älterem Verlaufslesen konnte die sichtbare Hauptchataktualisierung zunächst verzögert sein. Eine ausdrückliche Aktualisierung nach einer externen Änderung wartet jetzt auf einen frischen Read; zwei parallele Aktualisierungswünsche teilen diesen Read. Regressionstest prüft genau diese Reihenfolge.
- Modellvorlagen präzisiert: Vokabelkarten erhalten kurze deutsche Bedeutungen ohne Anfrage nach einer weiteren Frage; Zweig-/Kapitelzusammenfassungen bekommen explizite Sprecherrollen. Generierte Texte bleiben zur eigenen Prüfung bearbeitbar.
