# Sofia 4.99.15 — PWA-Abschluss, Galerie-Ausrichtung, Änderungsfokus

## Änderungen

- Mobile Portrait-PWA: App-Canvas füllt den festen Viewport statt einer ggf. kürzeren dynamischen vh-Fläche. Chatfenster liegt bei geschlossener Tastatur 6px vom unteren Rand; Home-Indicator-Abstand bleibt im inneren Padding, nicht als zusätzlicher äußerer schwarzer Streifen. Galerie nutzt oberen/unteren sicheren Bereich mit festen Rändern statt zentrierter 85vh-Höhe.
- Vergrößerung beim Schreiben nur bei erkannter Bildschirmtastatur. Kleine Unterschiede durch Systemleisten/Safe Area werden nicht als Tastatur gewertet. Breitenwechsel/Rotation verwirft eine veraltete höhere Layout-Basis; der schnelle Fokuswechsel aus 4.99.13 bleibt geschützt.
- Galerie-Kacheln sind flexible Spalten mit gemeinsamem Reihenende. Unterschiedliche Zeit-/Varianten-/Bevorzugt-Metadaten bleiben vorhanden; der Foto-Button füllt den freien Zwischenraum, wodurch Fotos und Favorit-Buttons in einer Reihe gleich ausgerichtet sind. Keine Änderung der Datumsgruppierung, Bildaufbewahrung oder Auswahl.
- „Änderungswunsch“ öffnet das Feld, scrollt es sichtbar, erzwingt Layout und fokussiert synchron im Benutzerereignis. Keine Timer-Fokussierung, welche die iOS-Tastaturaktivierung verlieren könnte. Bei Tastatur-Viewportänderung bleibt der aktive Fotoeditor sichtbar; Dialog berücksichtigt Statusleistenbereich. Öffnen/Fokussieren erzeugt keinen Bildauftrag und verändert den Quellbezug nicht.

## Prüfung

712 automatisierte Tests bestanden, sechs neue Regressionen zu kleiner Viewportabweichung, Rotation, Fokusreihenfolge, aktivem Editor bei Keyboard-Resize, Galerie-Fokus ohne Versand und einheitlichen Kachel-/Quellstrukturen. Bestehender Eintipp-Versand, Foto-/Variantenvertrag und Fehlerstatus bleiben geprüft. Geänderte JS-Dateien, Service Worker und Inline-Skripte syntaxgeprüft.

Teststand 61bbd258eec5c0f8604e63b168a2c217cae5b72b am 12.10.2026 READY und kanonisch aliasiert (dpl_3v3VvjMBHuq7zML5fhg7b76PcsiZ). Browser lädt style/ui/images mit 49915v1. Änderungswunsch setzt den aktiven Fokus direkt auf das vollständig sichtbare TEXTAREA. Galerieprüfung mit vorübergehender zusätzlicher Bevorzugt-Metadatenzeile: Beide Fotos beginnen bei y=778.375, beide Favoritenbuttons bei y=1017.375. Sichtbarer Screenshot bestätigt gleiche Ausrichtung; lokale Testmarkierung anschließend entfernt. Kein Fotoauftrag ausgelöst.

Native iPhone-PWA-Safe-Area und native Tastatur sind im Desktopbrowser nicht verfügbar; deren Abnahme erfolgt im laufenden Betrieb. Keine neuen kostenpflichtigen Fotos nötig für diesen UI-Patch. Keine Daten-/Budget-/Schutzänderungen, kein Avatar-/Voice-/WebRTC-/Lipsync-Code geändert.

4.99.15, Assets/Cache 49915v1. Test-only Stimmenvergleich nur auf test-web. Bestehenden PWA-Updatemechanismus verwenden; gespeicherte Entwürfe erhalten.
