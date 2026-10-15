# Sofia 4.144.0

Kalenderkonto-Anbindung und bestehender ICS-Kalender bleiben unverändert. Keine neuen Kalender-Zugriffe oder automatischen externen Einträge.

| Version | Ergebnis |
| --- | --- |
| 4.135 | Konsistente kompakte neue Dialoge, sichere Rücknavigation, Mindestschriftgröße für mobile Eingaben, verständliche Konflikt-/Ladezustände. Physischer iPhone-Test bleibt gesondert. |
| 4.136 | Mehrere Änderungsrechtecke und Schutzrechtecke. Natürliches Einpassen durch Modell oder technisch geschützter PNG-Zusammenschnitt. Schutz gilt für die angezeigte Arbeitskopie bis 1200 Pixel Seitenlänge, nicht die ursprüngliche Dateiauflösung. |
| 4.137 | Verfügbare Foto-Versionen mit Vorgänger/Zweigen, gespeicherten Aufträgen und Bewertungen; Vorher-Nachher-Regler. Neue Zweige verwenden die bewusst gewählte vorhandene Version. |
| 4.138 | Eigene Alternativantworten und Hinweise; kurze Runden aus fälligen Karten; Sofia-JSON-Lernstapelimport mit Vorschau und ausdrücklicher Übernahme, Export ohne Fortschrittswerte. Bestehende Karten werden bei Import übersprungen. |
| 4.139 | Wiederverwendbare Projektvorlagen mit Zielen und Schritten. Projekt-/Schrittübernahme nach Vorschau atomar und einmalig. Aufgaben entstehen erst durch separate Bestätigung in der bestehenden Schrittverwaltung. |
| 4.140 | Sichtbare Gesprächswünsche mit Gültigkeitsdauer/Pause. Neue Text-/Live-Kontexte berücksichtigen aktive Wünsche. Aktuelles Anliegen und notwendige Klärungen haben Vorrang. |
| 4.141 | Konkrete Begriffe für proaktive Kontakte bevorzugen/ausschließen. Literalprüfung offener Bezüge und fertiger Kontakttexte, erneut vor Zustellung. Explizite kostenpflichtige Beispielnachricht ohne Zustellung/Foto/Chatänderung; getrennte Bewertung ohne automatische Regeländerung. |
| 4.142 | Lokale Formularentwürfe bis sieben Tage, expliziter Vergleich/Übernahme bei Wiederöffnung und Tab-Konflikten. Keine automatische Übertragung nach Verbindungswechsel. Keine Bild-/Audiodateien oder Zugangsdaten im Formularspeicher. |
| 4.143 | Gewünschtes TTS-Tempo und Audioauswahl geräteübergreifend. Sichtbarer Player zum Pausieren/Fortsetzen/Springen. Voice-Transkript bleibt vor Versand bearbeitbar. Live-Sprechtempo bleibt unverändert. |
| 4.144 | Serverseitig widerrufbare Anmeldungen, getrennt von Push-Geräten. Bestehende ältere Anmeldung kann explizit als Gerät registriert werden; alte gemeinsam verwaltete Anmeldungen optional gesammelt sperren. Speicher-/Verknüpfungsprüfung, keine Rekonstruktion fehlender Bilddateien oder Aufgaben. |

## Technische Grenzen

- Bildschutz: Nur die Editierbereiche abzüglich Schutzrechtecke werden in die Arbeitskopie übernommen, PNG verlustfrei. Generiertes Ergebnis wird nötigenfalls auf die Arbeitsmaße abgebildet. Harte Rechteckränder sind möglich. Natürliches Einpassen ist eine Modellvorgabe ohne Garantie für unveränderte Außenbereiche.
- Geschützte PNGs verwenden eine begrenzte, geprüfte 8-Bit-RGB/RGBA-Decodierung mit PNG-Prüfsummen und begrenzter Dekompression. Andere PNG-Varianten werden abgelehnt; kein automatischer bezahlter Neuversuch. PNG-Download und Teilen verwenden den korrekten MIME-Typ und Dateinamen.
- Foto-Versionen bleiben an die vorhandene Aufbewahrungszeit gebunden. Nicht verfügbare Vorgänger werden kenntlich gemacht.
- Gesprächswünsche sind Kontextvorgaben, keine garantierte Modellsteuerung. Laufende Live-Sitzung für neue Wünsche neu starten.
- Begriffssperren erkennen den eingegebenen Wortlaut unabhängig von Groß-/Kleinschreibung. Keine semantische Synonymerkennung behauptet. Bei blockiertem Fotokontakt gibt es weiterhin keine Text-Ersatznachricht bei 100-%-Fotowahl.
- Lokale Formularentwürfe liegen unverschlüsselt im Browser und werden nach sieben Tagen nicht mehr angeboten. Zugangsdaten, Datei-Inputs, Bilder und Originalaufnahmen werden nicht gespeichert. Entwürfe werden nicht serverseitig synchronisiert. Das ist keine Offline-KI.
- Geräte-Anmeldungen: Zufällige undurchsichtige Cookie-Tokens, nur Hash im gemeinsamen Redis-Speicher. HttpOnly/Secure/SameSite, 30 Tage Ablauf, Passwortbindung und frische Prüfung auf jeder geschützten API-Route; bei Speicherausfall kein Zugriff. Keine Sitzungstokens in Exporten, Listen oder Logs.
- Neue Logins sind einzeln widerrufbar. Ältere bestehende gemeinsame Anmeldung bleibt kompatibel, bis der Nutzer sie bewusst gesammelt sperrt. Sie ist davor nicht pro Gerät widerrufbar. Einzelwiderruf sperrt neue API-Zugriffe, beendet aber keine bereits laufende Live-Verbindung oder schon angenommene Aktion.
- Keine neue Auth-Anbieter-/Datenbank-/SDK-Migration, keine Kalenderänderung. Bestehende konfigurierte Provider-Anbindung bleibt erhalten.

## Prüfung

877 Regressionstests bestanden, ohne Fehler oder übersprungene Tests: tatsächliche Lua-Ausführung, synthetische PNG-Pixelvergleiche, gemockte Providerantworten, Widerruf/Ablauf/Passwortbindung von Sitzungen und Schutz neuerer Formularentwürfe während einer Speicherung. Browser-Abnahme im getrennten Testsystem: Gesprächswunsch speichern/pausieren; Vorlage mit zwei Schritten prüfen/übernehmen und danach archivieren, Testvorhaben pausieren; Karte mit Hinweis und Alternativantwort speichern, kurze Lernrunde, Export und Import mit Duplikatprüfung; Audioauswahl speichern und lokalen Entwurf ausdrücklich vergleichen/übernehmen; zwei Änderungsbereiche plus Schutzbereich vor kostenpflichtigem Start prüfen; veraltete Bildbestätigung wird entfernt; Vergleichsregler und exakte Ausgangsversion eines neuen Zweigs; Speicherprüfung mit unverändert drei Aufgaben; öffentliche Testversion zeigt keine privaten Anmeldungen. Keine kostenpflichtige Bildgenerierung oder Beispielnachricht bei dieser Browser-Abnahme gestartet. Keine Produktiv-Nutzerdaten zur Abnahme verändert. Kein subjektiver Qualitätsnachweis für KI-Bilder oder Dialoge; kein Test auf physischem iPhone.
