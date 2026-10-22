# Sofia 4.211.10 – Kurze Fotoaufträge und vollständige Zustimmung

„Neues Foto“, „Neues Foto bitte“ und „Bitte neues Bild von dir“ sind unmittelbare neue Bildaufträge. Auch wenn der Klassifikator `none` oder `variant` meldet, erzeugt der ausdrückliche Auftrag einen neuen, gespeicherten Auftrag ohne Ausgangsbild.

„Ja, das möchte ich sehen“, „Ja das würde ich gern sehen“ und „Ja, ich möchte das sehen“ werden als Zustimmung zu einem aktuellen Bildangebot erkannt. Eine unmittelbar nach einem ausdrücklichen Fotowunsch gegebene Beschreibung wie „Ein neues Selfie als Nachtgruß – zurückgelehnt im Bett, mit offenen Haaren und einem warmen Lächeln für dich“ gilt ebenfalls als konkretes Angebot. Das Zeitfenster bleibt zehn Minuten; verneinte, zitierte oder auf später verschobene Angebote werden nicht übernommen. Eine Zustimmung ohne passenden Bezug erzeugt keinen Auftrag.

Text und Live verwenden dieselbe Erkennung. Regressionstests prüfen den Screenshot-Wortlaut, gespeicherte ausführbare Aufträge, den neuen Fotoauftrag trotz alter Bildreferenz und abweichender Klassifikatorantwort sowie Negativfälle. Der Bildanbieter wird in diesen Tests nicht aufgerufen. Die gesonderte Anbieterablehnung `moderation_blocked` und die in den Logs am 22.10. um 23:14 bestätigte Generierung bleiben von der Erkennung getrennt.
