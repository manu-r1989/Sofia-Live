# Sofia V4.94–V4.96.7

11.10.2026 · Asset-/Cachekennung `4967v1`.
Main-Basis `2e67a297797534de22f4f7d7cf9f966df7769c31`, Test-Basis `80973b79f1c155c8da4389d79b52a54264994956`.

## 4.94 — Gesprächsfäden und natürliche Reaktionen

Die bestehende kanonische Fragenagenda enthält nun eine begrenzte Gesprächssteuerung: fortsetzen, ausdrücklich wieder aufnehmen, Thema wechseln, Grenze respektieren und verabschieden. Ein eingehender Themenwechsel lässt offene Fragen sofort ruhen; ein ausdrückliches Zitat hat Vorrang. Mehrere jüngste Fragenenden erzeugen einen Hinweis, mit einer konkreten Reaktion oder eigenen passenden Aussage weiterzuführen statt routinemäßig erneut nachzufragen. Eine erklärte Grenze wird berücksichtigt, aber eine ausdrücklich angeforderte Frage bleibt möglich. Keine Pflichtfrage, keine erfundenen Erlebnisse und keine permanenten Fakten aus dieser Steuerung. Text und Live verwenden weiterhin denselben Kontext; keine Änderung an Audio-/WebRTC-Dateien.

## 4.95 — Fotoaufträge und Vergleiche

Galerieänderungen öffnen vor dem kostenpflichtigen Auslösen eine kompakte Vorschau mit exakt eingefrorener Quelle, Aufnahmezeitpunkt, Änderungswunsch und zu bewahrenden Merkmalen. Abbrechen erzeugt keinen Auftrag. Bestätigen sendet höchstens einmal; bei laufender Aktion bleibt die Vorschau erhalten. Ein direkter Fotoauftrag im Chat bleibt direkt möglich. Der serverseitige Änderungsvertrag und die ehrliche unsichere Bildprüfung aus 4.93 bleiben erhalten.

Der Vergleich erlaubt zwei frei ausgewählte, noch verfügbare Bilder derselben Fotoreihe. Auswahl verändert keine Generierungsquelle und erzeugt kein Foto. Gleiche Auswahl auf beiden Seiten wird erkennbar gemeldet. Ein bevorzugtes Ergebnis ist eindeutig je Reihe und auf diesem Gerät gespeichert; es überschreibt keine Quelle, löscht kein Bild und verlängert die 30-Tage-Aufbewahrung nicht. Quellen, Kopf-/Mimik-/Licht-/Kameraregeln und begrenzte Korrekturversuche werden weiter geprüft, Budgets bleiben unverändert.

## 4.96 — PWA-Rückkehr und Bedienung

Beim Verlassen wird die aktuelle Chat-Leseposition anhand kanonischer Nachrichtentimestamps oder Foto-IDs für höchstens 24 Stunden gesichert. Keine zusätzlichen Nachrichtentexte in diesem Positionsspeicher. Passende Anker werden nach Wiederaufbau verwendet; fehlende/abgelaufene Anker lassen den bisherigen neuesten Einstieg zu. Eine neue Nutzergeste verhindert verspätetes Überschreiben der Position. Wer bei der neuesten Nachricht war, bleibt dort. Entwurf und Zitat nutzen weiterhin die bestätigte Versandlogik, ohne automatische Neuversendung.

Eine beim Verlassen offene Galerie samt Viewer wird nach dem ersten Bilderladen einmal wieder geöffnet. Normales Schließen verhindert dies; Filter, Reihenfolge, Position und gewähltes Foto bleiben erhalten. Dialogrückkehr fokussiert bei mehreren Ebenen den obersten Viewer. Neue Vorschau und Vergleichsauswahl sind umbrechbar und besitzen mindestens 44px hohe Bedienelemente. Bekannte zukünftige Foto-Retry-Zeitpunkte werden im deutschen Hamburgformat angezeigt; unbekannte Freigabezeiten und Guthaben werden nicht erfunden.

## Prüfung und Veröffentlichung

- **681 automatisierte Tests erfolgreich**, darunter 15 neue konkrete Szenarien für Gesprächssteuerung, Vorschau/Abbrechen/feste Quelle/Doppelklick/Busy, Vergleichsreihe, lokale Bevorzugung, PWA-Galerierückkehr, bekannte Wartezeit, datensparsame Leseposition und Dialogfokus.
- **5 geänderte JS-Dateien und 2 Inline-Skripte: Syntax OK.**
- Bestehende Entwurf-/Versand-, Quellenketten-, Identitäts-/Haarfarben-, Galerie-, Aufgaben- und Kontexttests weiterhin erfolgreich.
- Reale Browser-Abnahme folgt auf dem exakten Testcommit. Die echte Fotoänderung aus 4.93 ist am 11.10. weiter durch das bestätigte Test-Tageslimit blockiert; in dieser Runde keinen weiteren kostenpflichtigen Bildversuch starten. Sichtbare Bildqualität wird nicht als abgenommen behauptet. Mikrofon-/iPhone-Geräteprüfung und längere Beobachtung bleiben Nutzerabnahme im laufenden Betrieb.
- Anschließend aktuellen main-Kopf und Datei-SHAs erneut prüfen, Main-Basis und unabhängige Dateien erhalten, Test-only Stimmen-vergleichen-Link nicht übernehmen. Produktivcommit, READY, Alias und tatsächlich ausgelieferte Versionsdateien verifizieren.

Keine Änderung an stabiler Voice-/Avatar-/Lipsync-Pipeline, Secrets, Zugangsschutz, Budgets, Namespace oder Projektkonfiguration. Bestehende Funktionen werden ausdrücklich erhalten und geprüft; keine zusätzliche Umsetzung der nur als spätere Ideen genannten Einstellungssammlung oder dauerhaften Erinnerungskorrektur in dieser Runde.

## Reale Testabnahme am 11.10.2026, 21:45–21:49 Hamburg

- Exakter Testcommit `349daf96a2e7829cd6e895c53dc122505c8815ac`, automatischer Git-Deploy `dpl_BGP168d6SaWyLhYRoXdzUk2cwvrd`: READY, kanonischer Testalias und sichtbare TESTVERSION 4.96.7 bestätigt. Kein redundanter Deploy. Acht öffentliche Assetdateien bytegleich mit dem geprüften Stand.
- Galerie zeigt neun vorhandene Fotos. Lichtänderung am Foto `d25e580b-5490-46d8-804b-7ffc36f48aee` öffnet ausschließlich die neue Vorschau mit genau dieser Quelle und dem ursprünglichen Aufnahmezeitpunkt. Abbrechen kehrt zum Viewer zurück; kein Auftrag und kein neues Foto.
- Bevorzugtes Ergebnis auf diesem Gerät markiert. Vergleichsauswahl enthält genau die sechs Bilder derselben Reihe, keine fremden Fotos. Frei gewähltes Paar `0c4c6620-9d00-4d91-9e68-c7552408945a` / `70e5102c-d198-46a8-9daa-a5cb968c983f` wird korrekt verwendet; 100% zeigt das rechte Vergleichsfoto. Anschließender Reload stellt Galerie und exakt den Viewer `d25e…` wieder her; Bevorzugung bleibt gespeichert. Normales Schließen und nächster Reload zeigen keinen Galerie-Dialog.
- Älteres Zitat aufgerufen und Leseposition gesichert. Nach Reload bleiben die beiden sichtbaren Nachrichtentimestamps und ihre Pixelabstände exakt gleich (`2026-10-10T11:53:25.724Z`, −69.34375px; `2026-10-10T11:59:30.742Z`, 31.15625px). Kein ungefragter Sprung zur neuesten Nachricht.
- Echter Textauftrag „Gute Nacht. Bitte keine Rückfrage und kein Foto.“ beantwortet mit „Gute Nacht und schlaf gut.“ Keine Frage und kein Fotoauftrag. Eingabefeld anschließend leer.
- Main-Kopf und alle 13 vorhandenen geänderten Pfade vor der Übernahme erneut geladen und unverändert bestätigt. Test-only Stimmenvergleich bleibt nur auf Test. Veröffentlichung mit anschließender Nutzerabnahme ist autorisiert; echte neue Bildqualität und reale Mikrofon-/iPhone-Prüfung bleiben ausdrücklich offen.
