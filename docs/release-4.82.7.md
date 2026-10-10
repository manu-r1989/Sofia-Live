# Sofia 4.80–4.82.7

## Umsetzung
Bestehende geprüfte Funktionen bleiben erhalten; diese Runde ergänzt konkrete Lücken. Keine Änderungen an Voice-, WebRTC-, Half-Duplex-, Lipsync- oder Avatar-Dateien. Bildprovider, Winkel-/Haltungsreview und Limits bleiben unverändert.

| Stufen | Umsetzung / vorhandene Absicherung |
|---|---|
| 4.80.0–4.80.2 | Eingabe passt sich sichtbarer Höhe an, bei extrem kleiner Tastaturansicht kompakter; Antwortbezug bleibt erreichbar. Lange Zitate klappen mit stabilen Scrollankern auf und springen zur Quelle. |
| 4.80.3–4.80.4 | Touchflächen mindestens 44 px, schmale Galerieraster. Swipe verwirft Pinch, zunächst vertikales Scrollen und lange Haltegesten; gefilterte Reihenfolge und Grenzen bleiben erhalten. |
| 4.80.5–4.80.6 | Verschachtelte Dialoge geben Fokus an den sichtbaren Elternbereich zurück, ohne Hintergrund-Chat zu bewegen. Dialoghöhe folgt visualViewport, deutlichere Fokusmarkierungen. |
| 4.80.7 | Automatisierte Regressionen und anschließend Testbrowser, mobile Gerätebeobachtung gesondert. |
| 4.81.0–4.81.2 | Zitatkontext enthält Hamburger Datum/Uhrzeit; relative Angaben gelten am Datum der Quelle. Sprecher, Korrekturen und hypothetische Orte getrennt halten. Live erhält erstmals sichtbaren gemeinsamen Verlauf für Nutzerorte und ältere Fragen; ausgeblendete Nachrichten bleiben ausgeschlossen. |
| 4.81.3–4.81.5 | Exakte zitierte/ausgewählte Fotoreferenz und Variantenkette erhalten. Abgelaufene Fotos werden als Antwortquelle zurückgewiesen, fehlender Galeriebezug wird erklärt statt still auf ein anderes Foto zu wechseln. Vorhandener Review bewahrt Haltung, Kleidung, Szene und Kamerawinkel. Aktueller Charakteralltag bleibt getrennt von alter Fotoumgebung. |
| 4.81.6–4.81.7 | Bestehende Gesprächssteuerung für eigene Meinung, seltene passende Fragen und Themenwechsel regressionsgeprüft; Text und Live verwenden gemeinsame Bezugsregeln. |
| 4.82.0–4.82.2 | Offline keine Foto-POSTs. Ausstehende Verarbeitung wird anhand bestehender Job-ID gelesen, bereitliegende bereits autorisierte Jobs einmal fortgesetzt. Versandquittung verlangt passenden Text, Zeitfenster und Antwortbezug; identischer Text mit anderem Zitat bestätigt keinen Turn. Langsamere bestätigte Turns werden bis fünf Minuten korrekt erkannt. Kein automatisches erneutes Senden von Chatturns. |
| 4.82.3–4.82.4 | Bestehende Scrollanker/Ungelesen-Ledger halten Leseposition. Badge-Schreibvorgänge sind serialisiert, sodass eine langsame alte Zählung keinen neueren Gelesen-Stand überschreibt. Mitteilungsöffnung bleibt an exakter Kontakt-ID. |
| 4.82.5–4.82.6 | Archiv-/Ablaufverweise behalten Versandzeit; Galerie erklärt fehlende Quellen. Updates blockieren zusätzlich bei unbestätigtem Versand. Service Worker entfernt ausschließlich alte Sofia-Caches und ignoriert fremde Ursprünge; APIs bleiben uncached. |
| 4.82.7 | Gesamttests/Syntax, Testabnahme, dann Produktiv und exakte Assetprüfung. |

## Prüfung
599 automatisierte Tests bestanden, 0 Fehler. Syntax: acht geänderte JavaScript-Dateien und zwei Inline-Skripte bestanden. Asset-/Cachekennung 4827v1. Bestehende Tests zu Fotoreferenzen, Winkel-/Pose-Review, Tageszeit/Wetter, Entwürfen, Updates, Kalender, Sichtbarkeit und Kontext bestanden ebenfalls.

Testbrowser prüft reale Dialog-/Galerie-/Quellwahl-/Vergleichsabläufe, Entwurf/Reload, Ausgangszustand der Leiste und neue Assets. Echte mobile Tastatur, Pinch/Swipe auf Geräten, Audio/Mikrofon und Mehrtagesbeobachtung verbleiben für die Nutzerabnahme im laufenden Betrieb. Diese Runde verändert die Bildgenerierung nicht; keine kostenpflichtigen Bildversuche für UI-/Kontextprüfungen erforderlich. Gesprächsqualität ist modellabhängig und nicht durch reine Prompttests abschließend garantiert.
