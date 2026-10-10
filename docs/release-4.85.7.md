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

## Reale Testprüfung am 10.10.2026
Testcommit e749f54695a0014b27dfcc6e134d0613f9f08239, Vercel dpl_3C2xyPEpmbLwuyWe7N3LV93Uh6iM READY, kanonischer Testalias bestätigt.
- PWA-Update über „Neue Version laden“ auf 4.85.7; tatsächlich geladene Assets 4857v1. Sechs geänderte öffentliche Dateien vom Testalias bytegleich mit dem geprüften Stand.
- Kontaktpause-Direktzugang fokussiert den Pausenbereich; Ruhezeit-Direktzugang fokussiert „Ruhezeit beginnt“. Öffnen allein erzeugt keine Pause.
- „Heute weniger“ änderte den sichtbaren Richtwert von 3–7 auf 1–5. Tageswahl wieder auf „Wie gewohnt“. Eine Stunde Pause mit sichtbarem Hamburger Ende/Bestätigung geprüft, danach beendet; vorherige Werte wiederhergestellt.
- Erinnerungsübersicht mit leerem Testbestand lädt; Suche/Kategorie/Prüfhinweisfilter und „Über Sofia“ sichtbar. Zeit-/Versionsschutz und Konflikthinweise an synthetischen Daten automatisiert geprüft; keine echten Nutzererinnerungen verändert.
- Fotoreihe im echten vorhandenen Variantenpaar: fünf Familienfotos statt aller acht; Vor-/Zurück behält Reihenmodus. Änderungsquelle wählbar exakt auf Vorgänger-ID 70e5102c-d198-46a8-9daa-a5cb968c983f, während betrachtetes Foto ID 336d47cb-47b1-4416-bc52-ba25aa91181a bleibt. Preview-URL und Auswahl stimmen überein.
- Kompass und kombinierter Editor zeigen Schutzmerkmale; Auswahl/Abbrechen erzeugt keinen Fotoauftrag. Änderungsvorschau aktualisiert auf „Kamera: 90° links“. Vergleich 0/50/100 Prozent und Rückkehr zum Viewer geprüft.
- Galerie bleibt nach Datum/Zeit gruppiert. Datumsfilter 10.10.2026 und Sortierung „Älteste zuerst“ bleiben beim Schließen/Öffnen erhalten; anschließend Filter zurückgesetzt. Keine bezahlte Fotoerzeugung.
