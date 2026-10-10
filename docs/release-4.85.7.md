# Sofia 4.83–4.85.7

## Umfang
Gezielte Ergänzungen auf der geprüften 4.82.7. Bestehende Funktionen werden weiterverwendet; keine Änderungen an stabiler Voice-, WebRTC-, Half-Duplex-, Lipsync- oder Avatar-Pipeline. Kein Wechsel des Bildproviders oder seiner Review-/Budgetregeln.

| Stufen | Neue Ergänzung und vorhandene Grundlage |
|---|---|
| 4.83.0–4.83.3 | Gemeinsamer Text-/Live-Bezug trennt dauerhafte Nutzerfakten, vorübergehende Gesprächsdetails und Sofias Alltag. Datierte Zitate, gezielte Korrekturen und Wiederaufnahme bleiben erhalten. Erinnerungsübersicht markiert doppelte Einträge und konservativ erkennbare widersprüchliche aktuelle Wohnorte zur Prüfung; keine automatischen Überschreibungen. |
| 4.83.4 | Erinnerungen zeigen vorhandenen Speicher-/Änderungszeitpunkt in Hamburg sowie Prüfhinweise. Suche und Kategorien sind mit „Nur Prüfhinweise“ kombinierbar. Bearbeiten/Vergessen adressiert zusätzlich die angezeigte Version; veraltete oder mehrdeutige Auswahl wird abgelehnt. Bestehender Redis-Vergleichsschutz bleibt erhalten. |
| 4.83.5–4.83.7 | Bestehende datierte Themen-/Pausensteuerung und Sprechertrennung weiterverwenden; Regressionen für Mehrdeutigkeit, fremde Orte und veraltete Fassungen. Hinweise ersetzen keine allgemeine semantische Konflikterkennung. |
| 4.84.0–4.84.2 | Betrachtetes Foto mit Zeit und Original-/Variantenstatus ausdrücklich vom ausgewählten Änderungs-Ausgangsfoto unterscheiden. Umschaltbare Navigation „Nur diese Fotoreihe“; Datum-/Zeitgruppierung der Galerie bleibt erhalten. |
| 4.84.3–4.84.5 | Vorhandener kombinierter Änderungseditor und Kompass nennen geschützte Identität/Haarfarbe bzw. Haltung/Kleidung/Umgebung. Bestehende Quellvorschau, exakte Variantenverkettung und expliziter Retry bleiben erhalten; Betrachten allein erzeugt kein Foto. |
| 4.84.6–4.84.7 | Vorhandene Galerie-/Filter-/Vergleichsrückkehr mit neuer Reihen-Navigation prüfen. Bild-Backend unverändert; keine kostenpflichtigen Fotoerzeugungen für diesen UI-Test nötig. |
| 4.85.0–4.85.2 | Einstellungen zeigen gespeicherten Richtwert pro Hamburger Tag inklusive Fotos, Tageswahl und ausdrücklicher fehlender Mindestanzahl. Bestehende Grenzen und variierende Abstände unverändert. Wiederholungsprüfung erkennt zusätzlich stark überlappende umgestellte Formulierungen. |
| 4.85.3–4.85.4 | Bei unbeantwortetem Kontakt auch auffordernde Formulierungen ohne Fragezeichen zurückhalten. Bestehende Kontakt-/Fototypvariation und Begrenzung bleiben erhalten. |
| 4.85.5–4.85.6 | Chatwerkzeugmenü führt direkt zu Kontaktpause und Ruhezeiten mit Fokus im passenden Einstellungsbereich. Öffnen pausiert nicht automatisch. Bestehende Hamburger Tagesumschaltung und Pause-/Ruhezeitprüfung bleiben erhalten. |
| 4.85.7 | Gesamttests, Syntax, reale Testbrowserprüfung, anschließend Produktivverifikation. |

## Automatisierte Prüfung
619 Tests bestanden, 0 Fehler. Neun geänderte JavaScript-Dateien und zwei Inline-Skripte syntaktisch geprüft. Neue Tests für Erinnerungsidentität, veraltete und mehrdeutige Änderungen, konservative Konflikthinweise, Reihen-Navigation, Frequenzanzeige, Hamburger Tageswechsel und zurückhaltende Kontakte. Bestehende Referenz-, Task-, Kalender-, Entwurf-, Update-, Kontext-, Foto- und Sicherheitsregressionen bestanden.

Asset-/Cachekennung: 4857v1. Test behält den Stimmenvergleich; Produktiv übernimmt diesen Test-only-Link nicht. Vor Veröffentlichung werden Testbrowser und exakte Commit-/Alias-/Assetstände geprüft.

## Grenzen der Abnahme
Reale mobile Tastatur/Touchgesten, Mikrofon-/Audiogeräte und Mehrtagesbeobachtung verbleiben für die Nutzerabnahme im laufenden Betrieb. Modellabhängige Gesprächsqualität lässt sich nicht durch Prompttests garantieren. Konservative Prüfhinweise erkennen keine beliebigen semantischen Widersprüche und entscheiden keine Korrektur für den Nutzer. Keine zusätzlichen Fotokosten oder Kontaktbudgetänderungen.
