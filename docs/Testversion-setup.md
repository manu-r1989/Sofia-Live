# Sofia – Testversion Schritt für Schritt einrichten

Stand: 7. Oktober 2026. Diese Anleitung betrifft ausschließlich das **neue Testprojekt `sofia-live-test`** und den GitHub-Zweig **`test-web`**.

Die erste Anleitung war zu knapp und enthielt einen veralteten Menüpfad: Den Produktionszweig stellst du aktuell unter **Settings → Environments → Production → Branch Tracking** ein, nicht unter Git.

## Bevor du beginnst

Du benötigst drei geöffnete Webseiten:

| Webseite | Wofür? | Einstieg |
| --- | --- | --- |
| Vercel | Die eigene Testadresse und ihre Einstellungen | [Vercel öffnen](https://vercel.com/dashboard) |
| Upstash | Die separate Redis-Datenbank für Testdaten | [Upstash öffnen](https://console.upstash.com/) |
| OpenAI API Platform | Den eigenen API-Schlüssel für Testaufrufe | [API Platform öffnen](https://platform.openai.com/) |

Vercel kann Menüpunkte direkt in der linken Projektleiste oder innerhalb von **Settings** anzeigen. Auf schmalen Fenstern ist die Leiste gegebenenfalls eingeklappt. Vergrößere das Browserfenster, wenn Einträge fehlen. Achte bei jedem Schritt auf den **Projektnamen**: Es muss `sofia-live-test` sein.

**Wenn das Testprojekt bereits existiert, starte bei Schritt 2.** Du musst es nicht nochmals erstellen. Ein Terminal und Änderungen am GitHub-Code sind nicht erforderlich.

## 1. Das neue Vercel-Projekt anlegen

1. Öffne [Vercel Dashboard](https://vercel.com/dashboard).
2. Wähle oben über den Team-/Account-Wechsler denselben Bereich, in dem dein bisheriges Sofia-Projekt liegt. Der bekannte Team-Slug ist `mr-bec9`; der angezeigte Name kann davon abweichen.
3. Klicke **Add New… → Project** beziehungsweise **New Project**. Alternativ öffne [Neues Projekt](https://vercel.com/new).
4. Suche im Bereich **Import Git Repository** nach `Sofia-Live`. Prüfe den Eigentümer `manu-r1989`.
5. Klicke neben diesem Repository auf **Import**.
6. Trage als **Project Name** `sofia-live-test` ein. Falls der Name vergeben ist, ist ein anderer eindeutiger Testname möglich; die weiteren Direktlinks müssen dann diesen Namen verwenden.
7. Wähle als **Framework Preset** den Eintrag **Other**.
8. Lass **Root Directory** auf der Repository-Wurzel; keinen Unterordner wie `api` oder `ios` auswählen. Build-/Install-Einstellungen zunächst bei den automatisch vorgeschlagenen Werten belassen.
9. Trage bei diesem ersten Import **noch keine Zugangsdaten** ein. Klicke **Deploy**, um das neue Projekt anzulegen.

Beim Erstimport kann Vercel zunächst `main` verwenden. Die Testkonfiguration folgt in den nächsten Schritten. Eine zu diesem Zeitpunkt sichtbare Login- oder Konfigurationsmeldung ist noch kein Ergebnis der fertigen Testversion.

**Repository fehlt?** Prüfe den GitHub-Account im Importbereich. Falls vorhanden, öffne **Adjust GitHub App Permissions** und erlaube Vercel den Zugriff auf `manu-r1989/Sofia-Live`. Du importierst dasselbe Repository in ein zweites Vercel-Projekt; du brauchst keinen Fork.

**Ergebnis:** Im Dashboard existiert ein zweites Projekt namens `sofia-live-test`.

## 2. Den richtigen Zweig auswählen

1. Öffne das **neue** Projekt.
2. Klicke **Settings**.
3. Wähle **Environments**.
4. Öffne **Production**.
5. Suche **Branch Tracking**.
6. Ersetze den dortigen Zweignamen `main` durch **`test-web`**.
7. Klicke **Save**.

„Production“ bezeichnet hier die Hauptadresse **dieses Testprojekts**. Es bedeutet nicht, dass du die normale Sofia-Version änderst. Dort bleibt der Zweig `main`.

Falls du den Eintrag nicht findest, prüfe, ob du tatsächlich in den **Projekt-Einstellungen** und nicht in den Team-Einstellungen bist. Der von Vercel dokumentierte Weg ist Environments → Production → Branch Tracking.

**Ergebnis:** Beim neuen Projekt wird `test-web` als Produktionszweig verwendet.

## 3. Die neue Projekt-ID kopieren

1. Bleibe im neuen Projekt.
2. Öffne **Settings → General**.
3. Scrolle zum Abschnitt **Project ID**. Mit **⌘F** am Mac kannst du auf der Seite nach „Project ID“ suchen.
4. Kopiere die vollständige ID, die mit **`prj_`** beginnt.

Diese ID brauchst du in Schritt 6 für `SOFIA_TEST_PROJECT_ID`. Sie ist weder der Projektname noch die Webadresse. Verwende nicht die ID des bisherigen Sofia-Projekts.

**Ergebnis:** Du hast die ID des neuen Testprojekts griffbereit.

## 4. Eine eigene Redis-Datenbank erstellen

Für diese Anleitung verwenden wir direkt Upstash. Du musst den Punkt „Storage“ in Vercel deshalb nicht suchen.

1. Öffne [Upstash Console](https://console.upstash.com/) und melde dich an.
2. Wähle **Redis**.
3. Klicke **+ Create Database**.
4. Nenne die Datenbank beispielsweise **`sofia-test`**.
5. Wähle eine passende europäische Primärregion, wenn verfügbar. Die vorhandene normale Sofia-Datenbank nicht auswählen.
6. Klicke **Next**, prüfe den angebotenen Tarif und erstelle die Datenbank. Für kleine Tests den kostenlosen Tarif wählen, falls er deinem Account angeboten wird.
7. Öffne die neue Datenbank. Suche **Connect** beziehungsweise **Connection** und wähle **REST**. Je nach Ansicht stehen die Werte auch unter **Details**.
8. Dort benötigst du die **HTTPS REST URL** und den **beschreibbaren REST Token**.

| Wert bei Upstash | Späterer Variablenname bei Sofia |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` / REST URL | `KV_REST_API_URL` |
| `UPSTASH_REDIS_REST_TOKEN` / REST Token | `KV_REST_API_TOKEN` |

Kopiere beim Übertragen nur den jeweiligen Wert. Die URL beginnt mit `https://`. Eine Adresse mit `redis://` oder `rediss://` ist hierfür falsch. Verwende nicht den **Read Only Token**, weil Sofia auch Aufgaben, Chats und Nutzungszähler speichern muss.

Die Namen unterscheiden sich absichtlich: Sofia erwartet weiterhin `KV_REST_API_URL` und `KV_REST_API_TOKEN`, auch wenn Upstash andere Namen anzeigt.

**Ergebnis:** Eine neue Datenbank und ihre beiden REST-Zugangswerte sind vorhanden. Keine Datenbankinhalte oder Zugangsdaten der normalen Version übernehmen.

## 5. Den eigenen OpenAI-Testschlüssel erstellen

Dieser Schritt erfolgt in der **API Platform**, nicht in den ChatGPT-Einstellungen.

1. Öffne [OpenAI API Platform](https://platform.openai.com/).
2. Öffne links oben den Projekt-Wechsler und wähle **Create project**. Nenne das Projekt beispielsweise `Sofia Test`.
3. Wähle dieses neue Projekt aus.
4. Öffne die Einstellungen und darin **API Keys** des ausgewählten Projekts.
5. Klicke **Create new secret key** und benenne den Schlüssel beispielsweise `Sofia Vercel Test`.
6. Übertrage den angezeigten Schlüssel direkt in Schritt 6 nach Vercel. Er wird später nicht erneut vollständig angezeigt.

Fehlt **Create project**, prüfe Account/Organisation und deine Owner-Berechtigung. API-Abrechnung und Zugriff auf die verwendeten Modelle müssen für dieses Testprojekt verfügbar sein. Bei einer späteren Meldung zu Bildberechtigungen prüfen wir gezielt die Modellfreigabe.

Unter **Limits** lassen sich die angebotenen Nutzungs- und Kostenkontrollen prüfen. Lies bei einem Budget die angezeigte Wirkung: Eine reine Warnschwelle stoppt keine Anfragen. Die eingebauten Sofia-Limits sind ebenfalls kein festes Euro-Limit.

**Ergebnis:** Ein separater Schlüssel ist vorhanden. Schlüssel und Tokens nicht an mich schicken.

## 6. Die Variablen im neuen Vercel-Projekt eintragen

1. Kehre zu **`sofia-live-test`** in Vercel zurück.
2. Öffne **Settings → Environment Variables** oder den direkt sichtbaren Eintrag **Environment Variables**.
3. Klicke **Add Environment Variable** beziehungsweise verwende das Formular **Add New**.
4. Trage bei **Key/Name** den Variablennamen und bei **Value** den Wert ein.
5. Wähle zunächst **Production** als Umgebung. Auch die Hauptadresse dieses Testprojekts verwendet Production. Für zusätzliche Preview-Tests später dieselben Testwerte zusätzlich unter **Preview** setzen.
6. Klicke **Save** und wiederhole das für jede Tabellenzeile.

| Key / Name | Value | Erklärung |
| --- | --- | --- |
| `SOFIA_TEST_MODE` | `true` | Aktiviert die Testkonfiguration |
| `SOFIA_DATA_NAMESPACE` | `test-web` | Eigener Datenbereich |
| `SOFIA_TEST_PROJECT_ID` | Deine neue ID aus Schritt 3 | Vollständigen Wert `prj_…` einsetzen |
| `SOFIA_TEST_STORAGE` | `isolated` | Bestätigt die separate Datenbank aus Schritt 4 |
| `SOFIA_TEST_ALLOW_PAID` | `false` | KI zunächst deaktiviert lassen |
| `KV_REST_API_URL` | REST URL aus Schritt 4 | Vollständige HTTPS-Adresse |
| `KV_REST_API_TOKEN` | REST Token aus Schritt 4 | Schreibbarer Token |
| `OPENAI_API_KEY` | Schlüssel aus Schritt 5 | Schlüssel des Testprojekts |

Werte ohne zusätzliche Anführungszeichen eintragen: also `true`, nicht `"true"`. Platzhalter wie „Deine neue ID“ nicht wörtlich übernehmen.

Falls ein Typ auswählbar ist, Tokens und API-Schlüssel als **Secret** speichern; die nicht geheimen `SOFIA_…`-Konfigurationswerte können **Config** sein. In älteren Ansichten heißt der Schutz für geheime Werte möglicherweise **Sensitive**. Die konkrete Eingabemaske kann abweichen.

**Systemvariablen einschalten:** Suche auf derselben Seite nach **Enable access to System Environment Variables** und aktiviere die Checkbox. Manche Ansichten verwenden eine ähnliche Beschriftung mit „Automatically expose“. Dadurch steht Sofia `VERCEL_PROJECT_ID` zur Verfügung. Diese Variable **nicht selbst anlegen**.

Ein `SOFIA_PASSWORD` ist für den korrekt eingerichteten Testmodus nicht notwendig. Die normale Sofia-Version behält ihre bisherige Zugangssperre.

**Ergebnis:** Acht eigene Variablen sind gespeichert, Systemvariablen sind freigegeben, KI ist noch deaktiviert.

## 7. Vercels Zugangsschutz nur für das Testprojekt ausschalten

Hier gibt es zwei unterschiedliche Sperren: die Vercel-Anmeldung vor der Webseite und Sofias eigenes Login. Schritt 6 regelt Sofias Login; jetzt folgt Vercel.

1. Prüfe erneut den Projektnamen `sofia-live-test`.
2. Suche links **Security → Deployment Protection**. Je nach Dashboard findest du es stattdessen unter **Settings → Deployment Protection** oder direkt als **Deployment Protection**.
3. Deaktiviere **Vercel Authentication** mit dem Schalter und speichere. Wenn die Ansicht stattdessen eine Schutzstufe anbietet, wähle die Variante ohne Schutz, beispielsweise **None/Disabled**.
4. Falls im neuen Projekt zusätzlich **Password Protection** aktiviert ist, deaktiviere auch diese und speichere.
5. Ändere diese Einstellung **nicht** in den globalen Team-Einstellungen oder beim bisherigen Sofia-Projekt.

**Ergebnis:** Die fertige Testadresse kann ohne Vercel-Anmeldung geöffnet werden.

## 8. Jetzt ausdrücklich `test-web` bereitstellen

Eine Änderung des Zweigs oder der Variablen macht ein altes Deployment nicht automatisch zur richtigen Testversion.

1. Öffne im neuen Projekt **Deployments**.
2. Klicke **Create Deployment**.
3. Trage als Git-Referenz **`test-web`** ein. Falls das Formular einen Link verlangt, verwende [diesen Branch-Link](https://github.com/manu-r1989/Sofia-Live/tree/test-web).
4. Prüfe die Umgebung **Production**, falls das Formular eine Auswahl zeigt.
5. Klicke **Create Deployment** und warte auf **Ready**.

Nicht einfach ein früheres `main`-Deployment über „Redeploy“ wiederholen: Dabei bleibt dessen alter Code erhalten. **Redeploy** eignet sich später, wenn bereits ein korrektes `test-web`-Deployment existiert und nur Variablen geändert wurden.

Falls **Create Deployment** fehlt, suche nach einem **…**-Menü in der Deployments-Ansicht. Bleibt der Eintrag unauffindbar, teile mir den erreichten Schritt und den neuen Projektnamen mit; ich kann dann prüfen, ob der verbundene Zugang ein Deployment des inzwischen existierenden Projekts erlaubt. Keine Test-Commits dafür anlegen.

**Ergebnis:** Das Deployment zeigt **Branch `test-web`** und **Ready**.

## 9. Öffnen, prüfen und KI freischalten

1. Öffne beim fertigen Deployment **Visit** oder die Hauptadresse aus der Projektübersicht.
2. Prüfe zusätzlich in einem privaten/Inkognito-Fenster, ob die Adresse ohne Vercel- oder Sofia-Anmeldung erreichbar ist.
3. Oben muss **TESTVERSION** mit **KI-Aufrufe deaktiviert** stehen. Auch der Button **Testdaten zurücksetzen** muss sichtbar sein.
4. Erst wenn dieser Banner stimmt, bearbeite unter Environment Variables die Variable **`SOFIA_TEST_ALLOW_PAID`** und ändere sie von `false` auf `true`.
5. Speichere und erstelle ein neues Deployment von `test-web` oder redeploye das bereits geprüfte `test-web`-Deployment.
6. Nach **Ready** neu laden. Der Banner zeigt nun **Begrenzte KI-Nutzung**.

Schicke mir anschließend nur die Testadresse. Dann kann ich die erreichbaren Browser-/API-Abläufe dort prüfen. Mikrofonberechtigungen und tatsächliche Audioausgabe bleiben zusätzlich auf deinem Gerät zu prüfen.

## Wenn etwas fehlt oder anders aussieht

| Beobachtung | Was prüfen? |
| --- | --- |
| „Production Branch“ fehlt unter Git | Settings → Environments → Production → Branch Tracking |
| „Storage“ fehlt in Vercel | Nicht benötigt; Upstash direkt verwenden, siehe Schritt 4 |
| Project ID fehlt | Neues Projekt → Settings → General; nach „Project ID“ suchen |
| Variablen sind gespeichert, aber Verhalten unverändert | Neues Deployment erstellen; alte Deployments übernehmen geänderte Werte nicht |
| Vercel-Anmeldung erscheint | Deployment Protection des neuen Projekts, siehe Schritt 7 |
| Sofias altes Login erscheint / kein Testbanner | Deployment-Branch `test-web` und Variablen der Umgebung Production prüfen |
| „Testkonfiguration unvollständig“ | Projekt-ID, Namespace, `isolated` und freigegebene Systemvariablen prüfen |
| „Testdatenspeicher nicht erreichbar“ | HTTPS REST URL und schreibbaren REST Token der neuen Datenbank prüfen |
| „KI-Aufrufe … deaktiviert“ | Bei der ersten Prüfung gewollt; später `SOFIA_TEST_ALLOW_PAID=true` setzen und erneut deployen |
| HTTP 403 / fehlende Berechtigung | Den richtigen Team-/Account-Bereich und deine Projektberechtigung prüfen |
| Deployment-Tageslimit erreicht | Angezeigten Ablauf abwarten; nicht wiederholt neue Deployments auslösen |
| Live startet weiterhin nicht | Sichtbare Live-Fehlermeldung weitergeben; die Testumgebung behebt den bisherigen Fehler nicht automatisch |

Wenn du weiterhin an einem Schritt festhängst, genügt die Schrittnummer und der sichtbare Menütext. Bei einem Screenshot zuvor alle Schlüssel und Tokens unkenntlich machen.

## Verifizierte offizielle Hilfeseiten

Die Menüpfade wurden anhand der aktuellen Dokumentation geprüft; dein konkretes angemeldetes Dashboard wurde dabei nicht eingesehen.

- [Vercel: Projekt-ID finden](https://vercel.com/docs/project-configuration/general-settings#project-id)
- [Vercel: Produktionszweig ändern und Git-Referenz deployen](https://vercel.com/docs/git)
- [Vercel: Variablen eintragen](https://vercel.com/docs/environment-variables/managing-environment-variables)
- [Vercel: Systemvariablen aktivieren](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Vercel: Deployment Protection, aktuelle Security-Ansicht](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)
- [Upstash: Datenbank anlegen](https://upstash.com/docs/redis/overall/getstarted)
- [Upstash: REST-Verbindung](https://upstash.com/docs/redis/features/restapi)
- [OpenAI: API-Projekte und Schlüssel](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)

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
