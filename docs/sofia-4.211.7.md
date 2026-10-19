# Sofia 4.211.7 – Bildprüfung verständlich unterscheiden

Die Produktionsprotokolle vom 20. Oktober 2026 bestätigen um 00:44 Uhr einen neuen Fotoauftrag, dessen generiertes Bild mit `portrait_context_mismatch` bei der Prüfung verworfen wurde. Der neue Auftrag um 00:45 Uhr scheiterte hingegen bereits beim Bildanbieter mit `portrait_moderated`. Die Ablehnung ist somit nicht durchgehend und nicht mit der nachgelagerten Bildprüfung gleichzusetzen.

Der Chat hatte alle Kontextabweichungen als gescheiterte Änderung eines Ausgangsfotos bezeichnet. Neue Fotos erhalten jetzt eine zutreffende Erklärung ohne erfundenes Ausgangsfoto. Varianten behalten ihren Bezug zum ausgewählten Bild. Bereits gespeicherte Prüfergebnisse werden mit festen deutschen Bezeichnungen angezeigt, beispielsweise Körperhaltung oder Ort. Unbekannte Freitexte werden nicht übernommen. Die Meldung gilt auch für vorhandene Hinweise nach dem Neuladen.

Die Produktionsdiagnose protokolliert bei Prüfungsfehlern zusätzlich die bereits geprüften Abweichungsdimensionen, Konfidenz und neue Aufnahme/Variante. Anbieterfehler erhalten die bestehende begrenzte Anbieterdiagnose. Prompts, Bilddaten, private Anbietertexte und Zugangsdaten werden nicht protokolliert.

Die Bildprüfung, Sicherheitsprüfung und Veröffentlichungsvoraussetzungen bleiben unverändert. Dieser Stand behebt die falsche Darstellung und ergänzt die Diagnose; er behauptet keine Behebung der Anbieterablehnung oder der Bildabweichung. DOM-Regressionstests prüfen neue Aufnahme, Variante und die feste Bezeichnungsliste ohne kostenpflichtige Bildgenerierung.
