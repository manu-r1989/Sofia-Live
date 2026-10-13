# Sofia 4.100.2 — Auswahllisten, Rücknavigation und sichere iPhone-Menüs

- Auswahllisten stehen blockweise unter ihren Beschriftungen. Erinnerungskategorien haben eine eigene Beschriftung; Suche und Filter werden vertikal angeordnet. Checkboxen bleiben neben ihrer Beschriftung.
- Einstellungen und Chatwerkzeuge wechseln mit einem gespeicherten Elternmenü in Untermenüs. Schließen/Escape bringt das vorherige Menü zurück, einschließlich verschachtelter Fotoeinstellungen und App-Hilfe. Ein fehlgeschlagener Speicherabschluss verhindert den Wechsel; explizite Sprünge zum Chat öffnen kein Menü erneut.
- Erinnerungs-Hintergrund und Menüfläche sind getrennt. Hintergrund füllt den sichtbaren Viewport; das Menü liegt innerhalb der gemeldeten oberen/unteren Safe Areas. Native mobile Dialoge beachten ebenfalls Safe Areas und den sichtbaren Viewport bei geöffneter Tastatur.
- Fluides Layout für 390–430 CSS-Pixel breite Geräte, einschließlich des Layoutziels 402 × 874 für iPhone 17 Pro. Keine Fixierung auf physische Displaypixel; Rotation, Statusleiste und Home-Indicator verwenden gemeldete Viewportwerte. Schriftgröße der Formularfelder 16px, damit Safari nicht beim Fokussieren hineinzoomt.
- Release 4.100.2, Assets/Cache 41002v2. Daten und Voice-/Avatar-Pipeline unverändert.

Abnahme: 726 Tests sowie Syntax- und Inline-Prüfungen bestanden. Browser bestätigt vertikale Auswahllisten, Rücknavigation Fotos → eigene Kontakte → Fotos → Einstellungen und technische Übersicht → App-Hilfe → Einstellungen, erhaltenen Chatentwurf und korrekte Trennung ausgeblendeter Gesprächs-/Fotokontrollen. Erinnerungsrahmen liegt vollständig im sichtbaren Desktop-Viewport. Testcommit a4c78d449a6d75b0407596c4ecf4f5f6c395338a READY. Reale iPhone-Statusleisten-/Tastaturprüfung bleibt Geräteabnahme.
