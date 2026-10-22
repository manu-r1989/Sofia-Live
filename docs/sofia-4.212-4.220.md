# Sofia 4.212–4.220.0

Diese zusammenhängende Erweiterung baut auf 4.211.11 auf. Die vorhandene Chatgeometrie, Anmeldung, Bildprüfung, Anbieterprüfung, Ruhezeiten und Nutzungsgrenzen bleiben bestehen. Der neue Bereich heißt **Gemeinsam erleben** und ist in den Einstellungen und unter Persönlich erreichbar. Öffnen oder Speichern der persönlichen Inhalte benötigt keinen Modellaufruf.

| Version | Umsetzung |
| --- | --- |
| 4.212 | Neue Bildaufträge erhalten einen gespeicherten Bildwunsch mit Motiv, Bildart, Ausschnitt, Hintergrund, Kleidung, Haltung und Quellenbindung. Generator und anschließende Prüfung bekommen diesen selben Stand. Die Auftragsansicht zeigt den angenommenen Wunsch sowie getrennte Meldungen für Anbieterablehnung, technische Prüfung und sichtbare Abweichungen. Identisch moderierte Aufträge bieten dort keinen erneuten Generierungsversuch. |
| 4.213 | Der Textversand erhält eine feste Kennung und eine atomare Ausführungssperre. Parallele oder wiederholte Anfragen unter derselben Kennung verwenden das gespeicherte Ergebnis statt erneut Aktionen auszuführen. Ausgang und Antwort sind 24 Stunden nachlesbar, auch unter Letzter Versand und Aufträge und Status. Ein nicht bestätigter Ausgang wird nicht automatisch neu ausgeführt. Bildaufträge werden beim Wiederöffnen über ihre vorhandenen Kennungen wiederaufgenommen. |
| 4.214 | Die acht Persönlichkeitsachsen erhalten konkrete Verhaltensbeispiele. Ausdrücklich gespeicherte persönliche Vorlieben ergänzen die fiktionale Rolle in Text und Live; archivierte Einträge werden nicht verwendet. Sie ersetzen weder die Identität noch ausdrückliche aktuelle Nutzerwünsche. |
| 4.215 | Ein Kleiderschrank enthält einzelne Kleidungsstücke und kombinierte Looks. Looks lassen sich bearbeiten und für eine, vier oder zwölf Stunden übernehmen. Fehlende oder archivierte Bestandteile verhindern stillschweigende Ersetzungen. Im Chat sind benannte Looks übernehmbar; ein ausdrücklich benannter Bestandteil kann durch ein anderes gespeichertes Stück ersetzt werden. |
| 4.216 | Bildgeschichten speichern zwei bis vier Motive und optional einen Look. Alle Motive werden zunächst als Entwürfe vorbereitet und erst gemeinsam atomar freigegeben. Kleidung und Aufnahmekontext stammen vom Start; jedes Motiv erhält eine eigene Prüfung und ein eigenes Ergebnis. Die gemeinsame Reihenfolge überlebt Neuladen. Eine gespeicherte Auftragskennung findet dieselbe Serie wieder. Weitere Bilder benötigen eine ausdrückliche neue Bestellung. |
| 4.217 | Kochen, Spaziergang, Filmabend und Entdeckungstour bieten gespeicherte Schritte, eigene Notizen, Pause und Fortsetzen. Nur ein ausdrücklicher Schrittabschluss erhöht den Fortschritt. Ein neuer aktiver Ablauf pausiert den vorherigen. Text und Live erhalten bei passendem Gesprächsbezug den aktuellen Schritt; es entstehen keine automatischen Fotos, Aufgaben oder Termine. |
| 4.218 | Gespeicherte Profiländerungen und Antwortpausen werden für den nächsten Live-Redezug übernommen; die reservierte maximale Sitzungsdauer bleibt bis zum nächsten Start bestehen. Eine ausdrücklich unterbrochene Erklärung lässt sich bis zu zehn Minuten fortsetzen. Dabei wird eine reine Sprachantwort angefordert und keine frühere Aufgaben-, Kalender- oder Bildaktion wiederholt. Neu begonnene Nutzersprache verwirft die alte Fortsetzungswahl. |
| 4.219 | Gemeinsame Bezüge können auf bestehende Momente und andere Bezüge verweisen. Eine Gesprächsquelle wird gegen den tatsächlich sichtbaren Verlauf geprüft. Korrekturen behalten die ursprüngliche Quelle und bis zu fünf frühere Fassungen. Quellenangaben sind Herkunft, keine automatische Bestätigung der Richtigkeit. |
| 4.220 | Initiative kann für die vier Aktivitätsarten, pausierte Aktivitäten und gespeicherte Bezüge gewählt werden. Diese Freigabe ergänzt die bestehenden Kontaktfrequenzen und Ruhezeiten. Sie erlaubt Vorschläge, startet aber keine Aktivität und keine zusätzlichen kostenpflichtigen Bilder automatisch. |

## Bedienung

Beispiele für ausdrücklich unterstützte Chatbefehle:

- `Starte einen Filmabend` beziehungsweise `Starte einen Spaziergang`.
- `Zieh den Look Alltag für vier Stunden an`.
- `Look Alltag: Ersetze Top durch Pullover`.
- `Das hat sich geändert: Filmvorliebe: Neuer Inhalt`.

Die Namen müssen zu eindeutig gespeicherten Einträgen passen. Zitierte, verneinte und zukünftige Varianten dieser Befehle werden nicht auf diesem Weg ausgeführt. Die Oberfläche bietet alle Änderungen auch ohne Befehlsformulierungen an.

## Speicherung und Grenzen

Der revisionsgeschützte persönliche Stand erhält einen versionierten Erlebnisbereich mit höchstens 30 Vorlieben, 60 Kleidungsstücken, 30 Looks, 30 Aktivitäten, 50 Bezügen und 20 Bildgeschichten. Looks enthalten höchstens zehn Stücke; Bezüge höchstens acht Verbindungen. Aktivitätsschritte enthalten nur ausdrücklich gespeicherte Nutzerangaben. Formularentwürfe gehören zum jeweiligen Bereich und Aktivitätsschritt; das Speichern eines Teilformulars verwirft keine anderen Eingaben.

Persönliche Sicherungen enthalten die neuen Daten. Importierte aktive Aktivitäten bleiben pausiert. Ältere Sicherungen ohne Erlebnisbereich erhalten vorhandene neue Daten; beim Zusammenführen werden gleiche IDs ersetzt und andere Einträge erhalten. Die bestehenden Größenbegrenzungen gelten weiter.

Bildgeschichten verwenden je Motiv die bestehenden Anbieter- und Bildprüfungen und persönlichen beziehungsweise Testlimits. Ein atomar angenommener Gesamtauftrag garantiert nicht, dass jedes Motiv vom Anbieter akzeptiert oder erfolgreich geprüft wird. Eine spätere Anbieterablehnung wird nicht automatisch umformuliert oder erneut bestellt. Gemeinsame Motive bilden keine Perspektivvariantenfamilie und verdrängen deshalb keine anderen Bilder in der Galerie.

Textquittungen und Bildgeschichten-Kennungen werden 24 Stunden gehalten. Ein älterer, unbestätigter Versand erfordert zunächst eine Verlaufsprüfung. Unterbrochene Live-Erklärungen bleiben nur in der laufenden Sitzung verfügbar. Das Fortsetzen ersetzt keine verlorene Verbindung und startet Live nicht selbstständig. Bei Abbruch kann die bereits reservierte Live-Zeit bis zur bestehenden Abrechnung erhalten bleiben.

## Prüfung

Die Abnahme umfasst Zustandsvalidierung, Rückwärtskompatibilität, gleichzeitigen Textversand, verlorene Antworten, abgelaufene Quittungen, atomare Bildserien, serielle Bildausführung und Wiederherstellung, unveränderte Perspektivfamilien, Herkunftsprüfung, veraltete Revisionen, Schrittwiederholungen, Lookänderungen, Sicherungen und Live-Fortsetzung ohne Aktionswiederholung. Der automatisierte Gesamtlauf umfasst 1.080 erfolgreiche Tests. Die Veröffentlichung erfolgt nach Abnahme zunächst auf Test und anschließend auf Produktiv. Anbieterablehnungen und modellabhängige Bildqualität werden nicht pauschal als behoben ausgewiesen.
