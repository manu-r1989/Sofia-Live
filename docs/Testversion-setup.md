# Sofia – separate öffentliche Testversion (V4.28.0 Test)

Der Zweig `test-web` enthält die Testversion. `main` und das bestehende Produktionsprojekt bleiben unverändert. Das neue Projekt ist noch nicht angelegt: Der verbundene Vercel-Zugang lehnt die Projektanlage mit HTTP 403 („You don’t have permission to create the project“) ab.

## Einmalige Einrichtung durch den Projektinhaber

1. In Vercel ein **neues** Projekt `sofia-live-test` aus `manu-r1989/Sofia-Live` anlegen; Framework „Other“, Repository-Wurzel verwenden. Unter Git **Production Branch = `test-web`** wählen.
2. Eine **eigene Upstash-Redis-Datenbank** für dieses Projekt anlegen. Produktionsdatenbank und Produktionszugangsdaten dürfen nicht übernommen werden.
3. Die folgenden Umgebungsvariablen im neuen Projekt setzen (für jede dort verwendete Umgebung). Geheimnisse ausschließlich direkt im Dashboard eingeben, niemals im Chat.

| Variable | Wert |
| --- | --- |
| `SOFIA_TEST_MODE` | `true` |
| `SOFIA_DATA_NAMESPACE` | `test-web` |
| `SOFIA_TEST_PROJECT_ID` | Projekt-ID des **neuen** Projekts (`prj_…`) |
| `SOFIA_TEST_STORAGE` | `isolated`, erst nach Einrichtung der eigenen Datenbank |
| `SOFIA_TEST_ALLOW_PAID` | Zunächst `false`; nach Prüfung `true`, um KI-Aufrufe zuzulassen |
| `KV_REST_API_URL` | REST-URL der eigenen Testdatenbank |
| `KV_REST_API_TOKEN` | REST-Token der eigenen Testdatenbank |
| `OPENAI_API_KEY` | Eigener Schlüssel eines separaten OpenAI-Testprojekts |

`VERCEL_PROJECT_ID` stellt Vercel bereit; nicht manuell überschreiben. `SOFIA_PASSWORD` ist im korrekt konfigurierten öffentlichen Testprojekt nicht erforderlich. Der Code prüft Projekt-ID, Namespace und Isolationsbestätigung; ob tatsächlich eine separate Datenbank verwendet wird, muss bei der Einrichtung sichergestellt werden.

4. Nur für das neue Testprojekt Vercel Deployment Protection deaktivieren, damit die Testadresse ohne Anmeldung erreichbar ist. Schutz der bestehenden Sofia-Version unverändert lassen.
5. Deployen. Beim bisherigen Projekt wurde außerdem ein Tageslimit von 100 Deployments erreicht; falls dieses Limit erneut gemeldet wird, dessen Ablauf abwarten.
6. Testadresse weitergeben. Danach können Browser- und API-Prüfungen direkt dort erfolgen.

## Verhalten und Grenzen

Der sichtbare Testbanner enthält einen Reset für Chats, Fotos, Aufgaben, Erinnerungen und Charakterzustand. Alle Besucher teilen sich diese Testdaten; hier ausschließlich Testinhalte verwenden. Reset löscht nur Schlüssel des Test-Namespace und behält Nutzungszähler. Für einen Reset muss der laufende API-Aufruf abgeschlossen sein. Maximal 500 Namespace-Schlüssel werden atomar geprüft; bei mehr Schlüsseln wird ohne Löschung abgebrochen.

KI-Aufrufe sind standardmäßig deaktiviert. Bei Freischaltung gelten gemeinsam für alle Besucher:

| Nutzung | Grenze |
| --- | --- |
| Tatsächliche Bildgenerierungen | 2 pro UTC-Tag; auch Varianten und proaktive Fotos |
| Live-Session-Starts | 2 pro UTC-Tag |
| TTS-Anfragen | 20 pro UTC-Tag |
| Chat, Live-Kontext, Memory, Identität | Je 50 API-Anfragen pro UTC-Tag |
| Gesamtbudget | 100 Einheiten pro UTC-Tag: API-Aufruf 1, Live-Start 5, zusätzliches Bild 10 |
| Schreibende Anfragen | Höchstens eine gleichzeitig; 10 pro Minute und IP |
| Lesende Datenabfragen | 60 pro Minute und IP |
| Reset | 4 pro UTC-Tag; setzt Limits nicht zurück |

Limits reservieren vor Ausführung; fehlgeschlagene Aufrufe verbrauchen ebenfalls ihre Reservierung. Bei nicht erreichbarem Redis werden KI-Aufrufe abgelehnt. Die Grenzen begrenzen **Anfragen, nicht Euro oder Live-Minuten**. Ein Live-Start kann eine längere Sitzung ermöglichen. Zusätzlich im eigenen OpenAI-Testprojekt passende Anbieterlimits/Kostenüberwachung einrichten. Ohne aktivierte KI entstehen durch die App keine neuen Modellaufrufe.

## Kleine Abnahme

- Testadresse ohne Login öffnen: Testbanner sichtbar, normale Sofia-Adresse weiterhin geschützt.
- KI zunächst deaktiviert: Text/Live/Bildaufruf wird abgelehnt.
- Nach Freischaltung: Textantwort, Aufgabenfolge, Bildminiatur öffnen/herunterladen, Live-Start samt sichtbarer Fehlermeldung prüfen.
- Reset: Testverlauf und Aufgaben verschwinden, Nutzungsgrenzen bleiben bestehen; normale Sofia-Daten bleiben erhalten.
- Dritte Bildgenerierung bzw. dritter Live-Start desselben UTC-Tages wird vor dem Anbieteraufruf abgelehnt.

Die bestehenden Live-Startprobleme werden durch die Testversion nicht automatisch behoben; sie schafft eine separat erreichbare Umgebung für ihre Diagnose.
