# Sofia 4.100.3 — kompakte Menüs und getrennte Navigation

- Einheitliche Kopfzeile mit « zum vorherigen Menü und × direkt zum Chat. Root-Menüs haben deaktiviertes Zurück. X/Escape schließt alle offenen Menüflächen, ohne Elternmenüs erneut zu öffnen; unbestätigte Einstellungen verhindern das Verlassen. Die gewählte sichtbare Chatgröße bleibt erhalten.
- Schließen-Buttons am unteren Rand entfallen. Beim Öffnen/Zurückkehren startet das Menü oben. Die früheren Fokuswechsel zum unteren Schließen-Button und das automatische Scrollen zu Einstellungsgruppen entfallen.
- Pausenauswahl in einem 2×2-Raster, Tagesauswahl in einer Reihe und Stimmung in einem Raster. Einheitliche kleinere Abstände, kurze Beschriftungen und zugängliche Icon-Labels. Die gewählten Dauern und Tagesmodi bleiben gleich.
- Release 4.100.3, Assets/Cache 41003v1. Keine KI-/Fotoaufträge und keine Daten-/Voice-/Avataränderungen erforderlich.


## Validation
- 729 automated tests passed; JavaScript and inline script syntax checks passed.
- Test deployment f2d7b144f1225c083297c917ba5fc8ae5edb8f21 verified in browser: top opening, back to settings/gallery, X closes nested gallery/photo to chat, preserved half-size chat and draft, compact 40px pause buttons.
- Native iPhone safe-area and keyboard verification remains a device check.
