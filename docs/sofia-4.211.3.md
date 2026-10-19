# Sofia 4.211.3 – Bestätigte Bildangebote

Die Bildabsicht erkennt nun auch Angebote mit „erstellen“, „machen“ und „generieren“ und prüft die Verneinung im jeweiligen Angebotssatz. Ein vorangehendes „nicht nur beschrieben“ verwirft ein späteres ausdrückliches Bildangebot nicht mehr. Ablehnungen, hypothetische und zitierte Angebote sowie Angebote nach Ablauf der bestehenden zehn Minuten bleiben ausgeschlossen.

Die Schutzprüfung für unbelegte Wartefloskeln erfasst auch angehängte Emojis einschließlich Hauttönen und Zeichenverbindungen. „Gib mir einen kleinen Moment. 😉“ wird ohne serverseitigen Auftrag nicht mehr unverändert angezeigt oder gespeichert. Bestätigte Aufträge behalten ihre Bestätigung.

Regressionstests verwenden den genauen Screenshot-Wortlaut, prüfen eine gespeicherte Auftrags-ID und die Text- und Live-Endpunkte. Die Tests legen keine kostenpflichtigen Bilder an. Gespeicherter Verlauf und bestehende Fotos werden nicht verändert; alte unbelegte Bestätigungen starten nachträglich keinen Auftrag.
