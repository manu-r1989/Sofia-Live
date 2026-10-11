# Sofia V4.86–V4.90.12

Stand 11.10.2026. Asset-/Cachekennung: `49012v1`.
Basis: main `7fc02d82492e60feb7c9cf91ee1dd4ac8b4a5a77`, test-web `e749f54695a0014b27dfcc6e134d0613f9f08239` (V4.85.7).

## Änderungen und geprüfte bestehende Grundlagen

Die Versionsrunden bilden einen gemeinsamen Release. Bereits vorhandene Funktionen werden erhalten und erneut geprüft, nicht als neue Implementierung ausgegeben.

- **4.86.0–4.86.7, Fehler und Wiederholung:** sichere öffentliche Fehlercodes unterscheiden bestätigtes Guthabenende, Ausgaben-/Nutzungslimit, unbestätigtes Abrechnungskontingent, kurzfristige Anfragegrenze und Überlastung. Test-Minutenlimit, belegter Request und Test-Tagesbudget werden getrennt; bestehende Budgetwerte, Namespaces und Sperren bleiben erhalten. Ein Wiederholungszeitpunkt erscheint nur bei einem tatsächlich bekannten Retry-After oder dem realen Test-Zählzeitraum. Text, Foto und Live-Start verwenden dieselbe konservative Ursachenklassifizierung. Eine sichere ausdrücklich gewählte Chat-Wiederholung behält ihr ursprüngliches Zitat und den Fotobezug und wartet einen bekannten Termin ab. Unsichere Aktionen werden nicht automatisch erneut gesendet. Bestätigte Teilresultate und gespeicherte Nachrichtenbelege bleiben erhalten. Technische Übersicht in den Chat-Einstellungen zeigt Version, Verbindung und letzten Chatfehler dieser Sitzung, ohne Texte, Schlüssel oder Kontodaten. Sie liest kein Guthaben aus.
- **4.87.0–4.87.7, Gesprächsbezüge:** Nutzer-Ortsaussagen und Gesprächsquellen erhalten das Datum in Hamburg. Nutzer und Sofia bleiben getrennt; relative Angaben beziehen sich auf die jeweilige Nachricht. Ältere thematisch passende Fragen, ausdrückliche Zitate und genau zugeordnete Korrekturen haben Vorrang vor bloßer Nähe zur letzten Nachricht. Unklare Aussagen überschreiben keine dauerhaften Fakten. Bereits vorhandene Pausen-/Themenlogik, Interessen, Meinungen und bestätigte Erinnerungsänderungen bleiben erhalten.
- **4.88.0–4.88.7, Oberfläche:** Fotoviewer behält Navigation, Speichern und Schließen; Perspektive, Vergleich und Chatbezug sind direkt erreichbar. Detail, Licht, Ausschnitt, eigener Wunsch und kombinierte Änderungen liegen unter „Weitere Fotoänderungen“. Gemeinsame Größen, Umbruch und schmale Darstellung der Buttons. Erinnerungsfilter behalten Auswahl bei erneutem Öffnen und Bearbeiten; auch leere Ergebnisse aktualisieren die Prüfhinweise. Bestehende Dialog-Fokus-/Scroll-Rückgabe und Tastaturbedienung bleiben erhalten.
- **4.89.0–4.89.7, Fotoaufträge:** kurze Zustimmung wie „ja“ startet nur nach einem aktuellen tatsächlichen Fotoangebot, nicht nach einer beliebigen Gesprächsfrage. Ein Aussehensangebot wird in seinem konkreten Gesprächsbezug erkannt. Bestehende direkte Aufträge, Details, indirekte Perspektivwünsche, Korrekturen, genaue Quellenverkettung und Gesicht-/Haarfarbenschutz bleiben erhalten. Fehlgeschlagene Varianten behalten jetzt zusätzlich ihren exakten Quellbezug und einen verlässlich bekannten Wiederholungstermin in der Fehleranzeige. Keine automatische Neuversendung und kein Zurücksetzen von Bildlimits.
- **4.90.0–4.90.12, Alltag und Stabilisierung:** Kontext betont, dass alte Fotos keine aktuelle Tagesstation oder eine unbeobachtete Reise beweisen und nach einer Nutzerantwort keine versäumten Kontakte nachgeholt werden. Bereits implementierte Hamburger Tages-/Nachtzeiten und Datumswechsel, explizite Zustandskorrekturen, begrenzte Szenenkontinuität, frische Wetterdaten mit sicherem Ausfall, aktuelle Wünsche, Fotoarten-Auswahl, Kontaktpausen und eigene offene Pläne werden erneut geprüft. Kontakteinstellungen erklären die Trennung von eigenständigen Nachrichten, Gesprächsinitiative und Fotos innerhalb des Kontaktlimits. Keine Stimme, Audioparameter, VAD, WebRTC, Half-Duplex, Lipsync oder Avatarassets geändert; in live.js ausschließlich Startfehlertext und Weitergabe der öffentlichen Fehlerursache.

## Automatisierte Prüfung

- Gesamtsuite: **647 Tests bestanden**, kein Fehler (lokaler Releasekandidat).
- Syntax: **11 JS-Dateien und 2 Inline-Skripte bestanden**.
- Zusätzliche Prüfungen: tatsächliche Ursachen statt pauschalem „Nutzungspause“, konservatives unbekanntes 429, valide/nicht erfundene Wiederholungsfrist, unveränderte Budgets, alte Zitate bei Retry, keine Überschreibung eines anderen Entwurfs, getrennte Sprecher und Hamburger Mitternacht, kurze Fotozustimmung mit/ohne aktuelles Angebot, fehlgeschlagene Variante mit genauem Quellbezug und ohne erneuten Provider-Aufruf.
- Offizielle Grundlage öffentlicher Provider-Fehlercodes: https://developers.openai.com/api/docs/guides/error-codes. Keine Provider-Rohmeldungen werden an die Oberfläche weitergereicht.

## Reale Abnahme vor Veröffentlichung

Noch ausstehend beim Anlegen dieses Release-Dokuments:
1. Exakten Testcommit/READY/Alias und geladene `49012v1`-Assets prüfen.
2. Technische Übersicht, Einstellungen, leerer Erinnerungsfilter, Fotoaktionen auf großem/schmalem Fenster, exakte Quelle/Vorschau, Vergleich und Rückkehr in den Chat.
3. Entwurf und Zitat nach Öffnen/Schließen/Reload; Absenden darf keinen Entwurf zurücklassen. Keine automatischen Nachrichten oder Fotoaufträge aus GET.
4. Ein gezielter echter Fototest innerhalb des bestehenden Budgets, Ergebnis und genaue Quelle prüfen. Provider-Ausfälle ehrlich dokumentieren; höchstens zwei Provider-Versuche pro UTC-Tag.
5. Erst danach main mit Branch-Lease aktualisieren, Test-only Stimmen-vergleichen-Link nur auf test-web erhalten; exakten Produktivcommit/READY/Alias und Versionsassets prüfen.

Reale Mikrofon-/Audio-Geräteprüfung und mehrtägige Beobachtung erfolgen durch den Nutzer im laufenden Betrieb. Simulierte Tests sind kein Beleg einer erfolgreichen physischen Mikrofonprüfung.
