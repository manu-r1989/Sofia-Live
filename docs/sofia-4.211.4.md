# Sofia 4.211.4 – Bildprüfung und Haltungsänderungen

Technische Prüfprobleme erhalten sichere Fehlerkategorien für abgewiesene Anfragen, abgebrochene Antworten, ungültige Prüfdaten und Verbindungsprobleme. Die Prüfanfrage verwendet Unicode-sichere Serialisierung und ein festes JSON-Schema mit den erlaubten Merkmalen. Sichtbare Widersprüche werden weiter abgewiesen; die Bildprüfung wird nicht übersprungen.

Ein erzeugtes, technisch nicht prüfbares Bild bleibt für eine Stunde unveröffentlicht gespeichert. „Dasselbe Bild erneut prüfen“ verwendet dieselbe Auftrags-ID und denselben Bildinhalt; dabei wird kein weiteres Bild erzeugt. Die Prüfung selbst benötigt weiterhin einen Modellaufruf. Abgelaufene Prüfbilder werden nicht automatisch neu generiert. Frühere fehlgeschlagene Aufträge ohne gespeichertes Prüfbild lassen sich nicht nachträglich wiederherstellen.

„Im Stehen“, „im Sitzen“, „im Liegen“ und entsprechende Haltungswünsche werden als Änderung der Körperhaltung erkannt. Ausgangsbild und nicht angeforderte Merkmale bleiben an denselben Bearbeitungsauftrag gebunden.

Regressionstests prüfen ungültige und abgebrochene Prüfantworten, feste Antwortstruktur, Unicode, unveröffentlichte Zwischenergebnisse, Wiederholung ohne zweite Bildgenerierung, Ablauf der Zwischenspeicherung und den genauen Änderungswunsch aus dem Screenshot.

Abnahme: 1.039 automatisierte Tests. Eine echte Variante erreichte die strukturierte Prüfung; diese antwortete regulär mit einer Abweichung des Bildausschnitts. Daraufhin wurde die Zielhaltungsprüfung präzisiert. Ein weiterer echter Bildtest der präzisierten Vorgabe blieb am Tagesbildlimit der Testversion hängen. Das Limit wurde nicht erhöht. Die technische Prüfung ist damit real bestätigt, die vollständige Bildabnahme der nachgeschärften Haltung bleibt offen.
