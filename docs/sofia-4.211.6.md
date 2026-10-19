# Sofia 4.211.6 – Bildfehler korrekt anzeigen

Die Produktionsprotokolle vom 19. Oktober 2026 um 21:45 Uhr (Hamburg) bestätigen: „Ja“ wurde als neuer Bildauftrag erkannt, der Bildanbieter lehnte ihn anschließend mit `portrait_moderated` und HTTP 400 ab. Eine konkrete Ursache innerhalb der Sicherheitsprüfung ist nicht bekannt.

Sofia nennt bei dieser Ablehnung jetzt die Sicherheitsprüfung des Bildanbieters. Auch bereits gespeicherte Fehlermeldungen werden anhand ihres Fehlercodes korrekt dargestellt. Der allgemeine Fehlertext erfindet keine unpassende Umgebung mehr. Die Bild-API liefert ebenfalls den zum Fehlercode passenden Text.

Ein erneutes „Ja“ direkt nach einem fehlgeschlagenen Auftrag erklärt dessen Fehler. Für abgelehnte Aufträge wird keine identische Wiederholung angeboten; „Nochmal“ und die Aufgaben-Wiederholung erklären die Ablehnung. Ein neuer, ausdrücklich formulierter Bildwunsch durchläuft weiterhin die üblichen Prüfungen. Die Sicherheitsprüfung und die Kleidungsvorgaben bleiben unverändert.

Regressionstests simulieren die Anbieterablehnung einschließlich gespeichertem Hinweis, erneutem „Ja“, „Nochmal“, Aufgaben-Wiederholung und einer unabhängigen Zustimmung. Ein DOM-Test prüft die Korrektur alter Hinweise und das fehlende Wiederholungsangebot. Es werden dabei keine kostenpflichtigen Bilder erzeugt.
