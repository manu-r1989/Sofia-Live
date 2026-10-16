# Sofia 4.79.0–4.79.7

## UI-Korrekturen
- 4.79.0: Bestandsprüfung auf dem aktuellen 4.78.7-Stand. Fotoreihen-Navigation verdrängte Andere Perspektive/Detail ansehen im Flexlayout; verschachteltes Label verfälschte den zugänglichen Namen des Fotoantwort-Buttons.
- 4.79.1: konsistente Nachrichtenbreite, Zeilenhöhe, lange Links und kompakte Metadaten; ausreichend große Nachrichtenaktionen bei Touch.
- 4.79.2: lange eingebettete Zitate kompakt und explizit aufklappbar, Fotozitate mit Vorschau; Quelle bleibt direkt anwählbar.
- 4.79.3: stabile Nachrichtenschlüssel und mehrere sichtbare Scrollanker verhindern Positionssprünge durch Metadaten, Zitatänderungen und Löschen. Kein Löschplatzhalter.
- 4.79.4: zweizeiliger Antwortbezug, an sichtbare Bildschirmhöhe angepasste Texteingabe, erreichbarer Sendebutton; vorhandene Entwurf-/Versandlogik bleibt erhalten.
- 4.79.5: einheitliche erreichbare Sticky-Schließen-Köpfe für Einstellungen, Nachrichtenaktionen, Heute und Fotoviewer; Aktionsleiste ohne überbreite Spalten.
- 4.79.6: separate Fotoreihe und einheitliches Raster aller acht Fotoaktionen inklusive Andere Perspektive; identische Form/Abstände/Ausrichtung, geöffnete Aktion markiert. Datum weiterhin deutsch.
- 4.79.7: Regressionen/Syntax und Testbrowser; danach Produktiv. Keine Änderungen an API-/Voice-/WebRTC-/Lipsync-/Avatar- oder Bildgenerierungslogik.

## Abnahmepunkte
Fotobutton-Geometrie und kein horizontaler Überlauf; Kompass öffnen/abbrechen ohne Bildauftrag; Quellwahl und Vergleich; Nachrichtenaktion/Zitat und ruhige Leseposition; Dialog-Rückkehr und Entwurf; Heute-Aufgabendetail; PWA-Reload mit anfangs geschlossener Leiste. Mobile Bildschirmtastatur und echtes Swipe benötigen abschließende Gerätebeobachtung; responsive Regeln und Touchflächen werden strukturell geprüft.

## Prüfung und Freigabe am 10.10.2026
- 589 automatisierte Tests bestanden, keine Fehler; JS-Syntaxchecks für sechs geänderte JS-Dateien und beide Inline-Skripte bestanden.
- Testbereitstellung eaa2493735bb5245cd40f86a1c0b0e532d1b83ef, Assets 4797v1: Browser bestätigte alle acht Fotoaktionen in zwei gleich breiten Spalten, jeweils 354 × 52 px und 12 px Radius; kein horizontaler Überlauf. Kompass geöffnet und ohne Bildauftrag abgebrochen, Quellwahl und Vergleich 0/100 geprüft.
- Sticky-Schließen, Einstellungen ohne Überlauf, Aktionsleiste auf Chatbreite und nach Reload geschlossen geprüft. Mehrzeiliger ungesendeter Entwurf samt Antwortbezug blieb nach Reload erhalten; Prüfentwurf anschließend entfernt.
- Heute-Aufgabendetail und Rückkehr geprüft. Gelöschte synthetische Testnachricht bleibt nach erneutem Laden verschwunden, ohne Löschplatzhalter. Scrollanker bei gelöschter Quelle und lange Zitate werden durch gezielte Frontendtests abgesichert.
- Reale mobile Tastatur und Swipe bleiben für die Geräteabnahme im laufenden Betrieb. Keine bezahlten Bildaufträge für diese UI-Prüfung, keine Änderungen an der Voice-Pipeline.
- Produktivpromotion erhält sämtliche unabhängigen Main-Dateien und übernimmt den Test-only Stimmenvergleich-Link nicht. Bereitstellungsstatus wird nach dem Release separat verifiziert.
