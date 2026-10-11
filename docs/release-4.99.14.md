# Sofia 4.99.14 — neues Foto, Statusabschluss und erster Sendetipp

## Ursache und Korrektur

- Ein neues Foto kann sourceId:null besitzen, obwohl ein älteres Foto als Gesprächskontext ausgewählt ist. Der Browser hatte daraus fälschlich expectedSourceId gebildet und das vorbereitete neue Foto vor dem Generierungs-POST abgewiesen. Die neue Bindung verwendet einen exakten Quellvertrag nur für tatsächliche Varianten oder ausdrücklich gesperrte Galerieaktionen. Der Serverplan bestimmt weiterhin neue Aufnahme versus Variante; keine zusätzliche Intent-Klassifikation.
- Galerieaktionen behalten referenceLocked und den eingefrorenen Quellbezug. Quelle/Ergebnis werden weiterhin exakt geprüft; keine Rückkehr zum letzten normalen Chatfoto oder Serienursprung.
- Lokal abgelehnte Quellverträge werden mit Auftrags-ID für höchstens 24 Stunden (max. 100 IDs) vermerkt. Eine spätere pending-Antwort oder ein Reload startet diese abgelehnte Generierung nicht und hält den Fotostatus nicht künstlich aktiv. Bekannte Fehler zeigen eine passende Nachricht und enden im Zustand bereit.
- Bei verlorener Antwort und noch unbestätigtem Auftrag zeigt die UI „Fotoausgang wird geprüft“. GET-Prüfungen starten keine wiederholten Provider-POSTs für denselben abgeschlossenen/unsicheren Versuch. Bestätigte processing-Aufträge behalten den Fotostatus; endgültige Ergebnisse/Fehler beenden ihn.
- Mobile Sendebetätigung: pointerdown hält bei primärem Touch/Stift den Eingabefokus; ein gültiges pointerup sendet genau einmal und unterdrückt den folgenden Kompatibilitätsclick. Die Tastatur kann erst nach der Versandentscheidung einklappen. Abbruch/Drag außerhalb sendet nicht. Maus, Tastatur und Formular-Submit bleiben möglich; kein Versand allein beim Fokuswechsel.

## Prüfung

706 automatisierte Tests bestanden; acht neue Regressionen zu neuem Foto trotz Galeriebezug, verbindlicher Variantenquelle, Statusabschluss/Reloadschutz, unsicherem Fotoausgang sowie Touch-/Maus-/Tastatur-/Abbruchfällen. JS und Inline-Syntaxchecks bestanden.

Test zuerst, Browserprüfung und READY/Commit/Alias/Assets vor Produktivpromotion. Neue kostenpflichtige Provider-Fototests stehen wegen des bereits verbrauchten UTC-Tagesbudgets nicht zur Verfügung; die reale Fotoqualität und native iPhone-Tastatur bleiben Nutzerabnahme im Betrieb. Keine Limits erhöht, keine Testdaten zurückgesetzt und keine Avatar-/Voice-/WebRTC-/Lipsync-Dateien verändert.

Version 4.99.14 / Assets 49914v1. Produktivindex ohne Test-only Stimmenvergleich. PWA über Einstellungen → Neue Version laden aktualisieren; bestehende Entwürfe bleiben erhalten.
