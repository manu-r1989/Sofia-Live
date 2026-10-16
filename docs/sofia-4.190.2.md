# Sofia 4.190.2 · Vollständige und lesbare Chatantworten

Fehlerbild: Bei einer längeren Webrecherche konnte das bisherige 800-Token-Ausgabelimit eine JSON-Antwort mitten im `reply`-Text abschneiden. Der bisherige Parser übernahm bei ungültigem JSON den gesamten Rohtext als Nachricht. Dadurch wurden JSON-Klammern, Markdown und lange Quellen-URLs sichtbar.

Das Ausgabelimit beträgt jetzt 3000 Tokens. Der Server prüft den Providerstatus und die vollständige Antwortstruktur, vereinigt alle Antworttextsegmente und weist unvollständige/ungültige Antworten mit einem verständlichen Fehler zurück. Kein Rohtext-Fallback, keine Speicherung des defekten Antworttexts und keine automatische kostenpflichtige Wiederholung. Bereits ausgeführte Aufgabenbelege werden weiterhin im Fehlerergebnis übergeben.

Die Anzeige stellt einfache Hervorhebungen und HTTP(S)-Quellenlinks ohne HTML-Ausführung dar. Bereits gespeicherte JSON-Fehlantworten werden beim Anzeigen lesbar aufbereitet; bei einem abgebrochenen JSON-Text erscheint ein ausdrücklicher Hinweis, dass der fehlende Schluss nicht gespeichert wurde. Gespeicherter Verlauf und Nachrichtenidentität bleiben unverändert. Der fehlende Inhalt wird nicht erfunden.

971 automatisierte Tests bestanden, einschließlich Status-/Parserprüfung, Teiltextanzeige, Escape-Sequenzen, sicherer Linkdarstellung und eines nachgestellten API-Abbruchs ohne Speicherung/Providerwiederholung. Browserabnahme und Produktiv-Dateiabgleich folgen vor Abschluss.
