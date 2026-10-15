# Sofia 4.134.0 – Weiterentwicklung ohne Kalenderkonto

4.130 (Kalenderkonten/OAuth/Live-Synchronisation) bleibt ausdrücklich ausgelassen.
Der bisherige manuell freigegebene ICS-Import ist unverändert verfügbar.

## Funktionen

| Schritt | Umsetzung |
| --- | --- |
| 4.126 | Kompakte neue Menüs, bestehende sichere Dialognavigation, keine unbeabsichtigte Formularnavigation; Aufnahme wird bei App-Hintergrundwechsel beendet; begrenzte Netzwerk-Wartezeit. |
| 4.127 | Mein Heute mit freiwilligem Tagesfokus, offenen Aufgaben, heutigen gespeicherten Terminen, fälligen Routinen und Lernzielen. |
| 4.128 | Gesprächsauszüge vor Aktivierung prüfen und bearbeiten; aktives Thema gemeinsam für Text, Sprachnachricht und neue Live-Kontexte. Versteckte Nachrichten nicht erneut aufnehmen. |
| 4.129 | Kontaktarten bevorzugen oder sperren, Regeln für 24 Stunden oder bis Änderung, einmalige Pause bis Hamburger Ortszeit, Vorschau von Regeln und Versandstatus. |
| 4.130 | Bewusst ausgelassen: keine neue Kalenderkontoverbindung. |
| 4.131 | Rechteckige Bereichsauswahl per Touch/Maus oder Prozentfeldern, serverseitig erzeugte PNG-Alpha-Maske, feste Quelle, explizite kostenpflichtige Bestätigung; neue Version mit Vorgängerbezug und eigener Ergebnisbewertung. |
| 4.132 | Eigene Karten/Vokabeln, optionale KI-Entwürfe aus ausgewähltem Text, Faktenprüfung und explizites Speichern; Antwortprüfung nach normalisiertem Wortlaut, Wiederholung aus tatsächlichen Antworten. |
| 4.133 | Ziele mit vorhandenen Meilensteinen verbinden, Projektmaterial lokal durchsuchen, Wochenplan aus voraussetzungsbereiten Schritten prüfen und speichern; belegter Rückblick ohne erfundene Erfolge. |
| 4.134 | Inhaltsübersicht, Teilsicherung mit enthaltenen Bereichen und Prüfsumme, geprüfte Wiederherstellung, Push-Geräte nach separater Bestätigung entfernen. |

## Grenzen und Datenschutz

- Kein Test auf einem physischen iPhone durchgeführt. Mikrofon/Codec, Tastatur und subjektive Gesprächsqualität sind dort separat zu prüfen.
- Keine neue SDK-/Gateway-Migration: bestehende konfigurierte Provider-Anbindung bleibt erhalten. Zusätzliche KI-Kartenentwürfe und Bildbearbeitung nur nach ausdrücklichem Start.
- Eine Modellmaske ist keine Garantie pixelgenauer Unverändertheit. Original bleibt erhalten. Kein automatischer neuer Versuch.
- Eigene Karten: Groß-/Kleinschreibung und mehrfache Leerzeichen werden ignoriert. Synonyme werden nicht automatisch bewertet. Inhaltliche Kartenänderungen setzen den zugehörigen Lernstand zurück.
- Ein Wochenplan erzeugt weder Aufgaben noch externe Kalendereinträge. Manuell gepflegter Schrittfortschritt ist kein automatisch beobachteter Erfolg.
- Sicherung enthält Einstellungen/persönliche Einträge, Langzeiterinnerungen und Vorhaben, nicht Chatverlauf, Aufgabenobjekte, Bilddateien, Audiodaten, Anmeldung oder Push-Zugangsdaten. Unverschlüsselte Datei geschützt aufbewahren.
- Wiederherstellung erhält andere Karten/Verknüpfungen, ergänzt neue IDs und ersetzt gleiche IDs; Kalenderfreigabe bleibt nach Wiederherstellung deaktiviert. Nicht exportierte Bereiche können nicht aus einer Teilsicherung wiederhergestellt werden.
- Entfernen eines Mitteilungsgerätes widerruft Push, nicht eine aktive Browser-Anmeldung. Keine vollständige Mehrgeräte-/Sitzungssynchronisation behauptet.
- 100-%-Fotoauswahl bleibt strikt: keine Textersatznachricht bei blockierter oder fehlgeschlagener Fotogenerierung. Regeln werden vor Auslieferung erneut geprüft.

## Prüfung

Automatisierte Gesamtsuite sowie isolierte Browser-Abnahme vor Veröffentlichung. Bezahlte Bild-/Kartenaufrufe werden in Regressionstests mit Provider-Antworten simuliert; damit ist keine subjektive Bildqualität nachgewiesen.
