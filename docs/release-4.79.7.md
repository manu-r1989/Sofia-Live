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
