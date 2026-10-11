# Sofia 4.97–4.99.12

Version 4.99.12, Assets/Cache 49912v2. Das geplante größere Update wird als 4.99 geführt.

## Umsetzung

- 4.97: begrenzter gemeinsamer aktueller Kontext für Text/Live aus demselben gespeicherten Rollenalltag: Hamburgdatum/-zeit, Ort, Tätigkeit, Outfit, Frisur, Stimmung, Revision und beobachtete Wetterquelle. Feldquellen bleiben nachvollziehbar. Nutzerorte und vergangene Fotos bleiben getrennt. Vorhandene evidenzgesicherte Situation/Status/Foto-Logik wird weiterverwendet, keine zusätzliche Klassifikation.
- 4.98: dauerhafte Nutzererinnerungen zeigen Herkunft. Neue Einträge aus Text/Live werden als Gespräch erfasst, manuelle Änderungen als manuell. Bei alten Einträgen wird keine Herkunft erfunden. Bestehende Einzelbearbeitung/-löschung mit versionsabhängiger Identität, Wohnortkonfliktprüfung und getrennte Sofia-Erinnerungen bleiben erhalten.
- 4.99.0–.2: Hauptnavigation Chat/Heute/Galerie in der Chatspalte, Tastaturfokus und aktive Bereichsmarkierung. Kein automatischer Dialog-/Live-Abbruch; Entwürfe werden beim Wechsel nicht gesendet. Bestehende einheitliche Einstellungen/Chatwerkzeuge bleiben erreichbar.
- 4.99.3–.5: Heute zeigt die aktuelle Sofia-Szene und vorhandene aktive Interessen/Vorhaben mit beobachtetem Fortschritt bzw. beabsichtigtem nächsten Schritt. Vorhandene Entwicklung, Pausen und Wiederholungsschutz werden weiterverwendet; keine automatische Fertigstellung durch Zeitablauf.
- 4.99.6–.8: eigene Rückfragen und Themenvorschläge separat auswählbar. Versionsgesicherte Speicherung, Entwurfswiederherstellung und Abgleich mit parallel geänderten Einstellungen. Aktueller Abschied, Nein/Zuhörwunsch und notwendige Aktionsklärung haben Vorrang. Gilt über gemeinsame Kontextfunktion auch für Live; Audiopipeline unverändert.
- 4.99.9–.10: freiwilliger Rückblick „Gesprächsmomente“ aus den letzten sieben Tagen, maximal 20 vorhandene Nachrichten/Fotos mit Zeitstempel, eingebettetem Antwortbezug und direkter Nachricht-/Fotoöffnung. Keine erfundene Zusammenfassung, neue Nachricht, neue Generierung oder permanente Erinnerung durch GET.
- 4.99.11–.12: additive Kompatibilität ohne Datenmigration/-reset. Alte Draft-/Galerie-/Heute-Schlüssel bleiben erhalten; neue Einstellungen werden ergänzt. Ältere Clients dürfen neue Rhythmusfelder nicht entfernen. Neuer versionierter Service-Worker-Cache. Test-only Stimmenvergleich wird ausschließlich auf test-web erhalten.

## Prüfung

- 692 automatisierte Tests bestanden, darunter 11 neue Prüfungen zu Kontexttrennung, Datum/Wetterquelle, Einstellungs-Kompatibilität, Rückblick/Quellöffnung und Navigation/Datenbestand.
- Syntax: 9 geänderte JS-Dateien und Inline-Skripte bestanden.
- Browserabnahme auf Test: PWA-Update erhält ungesendeten Entwurf; Heute-Szene stimmt mit Status überein; bestehende neun Fotos und zwei Aufgaben vorhanden. Rückblick mit Zitaten und exakter Fotoöffnung (d25e580b-5490-46d8-804b-7ffc36f48aee) bestätigt. Kleine Nachbesserung: versteckte Foto-Vorbereitungsnachrichten nicht im Rückblick wieder anzeigen. Neue Rhythmuseinstellungen speichern; abschließende Reloadprüfung am finalen Kandidaten.
- Neue kostenpflichtige Fotos heute nicht erzeugt: bestehendes Test-Tageslimit bereits verbraucht. Die noch offene reale Fotoqualitätsabnahme aus 4.93 bleibt offen; kein automatisches Review als visuelle Abnahme ausgegeben. Bestehende Foto-/Perspektivlogik unverändert.
- Reale iPhone-PWA-/Mikrofon-/Audioprüfung und Mehrtagesbeobachtung erfolgen durch Nutzer im laufenden Betrieb. Kein Avatar-/Voice-/WebRTC-/Lipsync-Code verändert.

## Veröffentlichung und Rückkehr

Test zuerst aus exaktem Commit, READY/Alias/Assets prüfen und Browserabläufe abnehmen. Danach aktuellen main-Kopf/Dateien erneut prüfen, nur Releasepfade übernehmen; Produktionsindex ohne Test-only Stimmenvergleich. Produktivcommit, READY, Alias und tatsächliche Assets verifizieren. Bei Problemen vorherigen geprüften Deploymentstand zurücksetzen; keine Redis-/Browserdaten löschen und keine Limits erhöhen.
