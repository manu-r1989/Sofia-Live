# Sofia 4.211.11 – Angenommene Motive und ausdrücklicher Bildhintergrund

Die Produktionslogs am 22.10.2026 bestätigen um 23:31 und 23:33 Anbieterablehnungen (`moderation_blocked`) für neue Ganzkörperporträts. Der Nutzer-Screenshot zeigt dagegen ein angebotenes Gesichtsporträt mit schlichtem Hintergrund und die ausdrückliche Bestellung „Dann schicke mir davon ein Foto“. Ein konkreter Moderationsauslöser wird vom Anbieter nicht offengelegt; die Motivabweichung ist keine bewiesene Erklärung für dessen Ablehnung.

Die Bildvorbereitung übernimmt bei einer aktuellen, ausdrücklichen Bezugnahme auf ein angebotenes Motiv dessen konkrete Beschreibung. „Gesichtsporträt“ bestimmt die Bildart `portrait`, auch wenn der Klassifikator `full_portrait`, `variant` oder `none` liefert. Der ursprüngliche Nutzertext bleibt als Auftragsbezug gespeichert. Negationen, Zitate, zukünftige und abgelaufene Angebote sowie Varianten und Aufgaben werden nicht auf diesem Weg übernommen.

Ein ausdrücklich gewünschter schlichter, neutraler oder einfarbiger Hintergrund ersetzt die automatische Orts-/Aktivitäts-/Wettervorgabe für dieses neue Foto. Bei einem Gesichtsporträt wird die aktuelle Körperhaltung nicht durch einen breiteren Bildausschnitt sichtbar gemacht. Diese Vorgabe gilt ebenfalls für die anschließende Bildprüfung. Die aktuelle Lebenssituation selbst wird nicht verändert. Varianten behalten ihren Ausgangsbildvertrag.

Anbieterprüfung, Referenzbild, Kleidung und Nutzungsgrenzen bleiben bestehen. Es gibt keine automatische Umformulierung oder Wiederholung abgelehnter Aufträge. Die Korrektur beansprucht nicht, Anbieterablehnungen zu beseitigen. Regressionstests verwenden den Screenshot-Wortlaut und prüfen tatsächlichen Generator-Payload, Bildtyp, Hintergrund, Quellenbindung und negative Fälle.
