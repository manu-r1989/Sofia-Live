# Sofia 4.180.0 · Start und untere Schreibzeile

- Neuer Standard: Chat beim Öffnen in voller Größe, unabhängig von der zuletzt verwendeten Chatgröße.
- Unter Darstellung und Ton → Darstellung → Chat beim Start wählbar: Vollbild, halbe Größe, ausgeblendet oder letzte Größe. Die Auswahl gilt pro Gerät und ab dem nächsten Öffnen/Neuladen. Die laufende Größenauswahl und ihre Symbolleiste bleiben erhalten.
- Bei jedem Seitenstart Registrierung des Service Workers ohne Scriptcache und ausdrückliche Updateprüfung. Nach Installation wird die tatsächliche Worker-Revision über einen Nachrichtenkanal mit den geladenen Seitenassets verglichen. Eine bereits aktuelle Seite wird nicht erneut geladen.
- Ein abweichender Stand wird nur während des ersten, noch unberührten Startfensters automatisch geladen. Entwurfssicherung, unbestätigter Versand, Bildgenerierung, Live-Gespräch, laufende Aktionen und offene Dialoge werden berücksichtigt. Eine Sitzungsmarkierung verhindert Neuladeschleifen. Im Offlinefall bleibt die vorhandene App bedienbar. Später gefundene oder gerade unsichere Updates bleiben über App und Hilfe ladbar.
- Chat am unteren App-Rand angedockt, auf kleinen Displays ohne seitlichen Außenspalt. Die Nachrichtenliste nimmt den verfügbaren Raum ein; das Eingabeformular bleibt darunter am unteren Rand. Der iPhone-Home-Indikator wird einmal berücksichtigt. Bei geöffneter Tastatur bleibt die vorhandene Visual-Viewport-Ankerung bestehen.
- Keine Änderung an Kalender, Inhalten oder kostenpflichtigen Anbieteraktionen.

Prüfung: bisherige Suite sowie zusätzliche Startgrößen- und Updateprüfungen. Browserabnahme und finaler Dateiabgleich vor Veröffentlichung. Ein physischer iPhone-/Tastaturtest ist weiterhin nicht durch die Desktopprüfung ersetzt.
