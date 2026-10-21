# Sofia 4.211.9 – Auswahl beider angebotener Fotos

Sofias konkrete Auswahl zwischen zwei neuen Bildmotiven wird für zehn Minuten behalten. Der Screenshot-Fall „ein gemütliches Selfie im Bett oder ein Bild von meinem ganzen Outfit“ löst nach „Beides?“, „Beide“ oder „Beides jetzt“ zwei getrennte Aufträge aus. „Das erste“, „Das zweite“ sowie eindeutige Motivnamen wählen ein Bild. Ein unbestimmtes „Ja“ fragt nach der gewünschten Auswahl. Unverwandte, zitierte, zukünftige oder abgelaufene Angebote erzeugen keine Bildaufträge.

Beide Motive werden zunächst als nicht ausführbare Entwürfe vorbereitet. Eine atomare Redis-Operation gibt sie erst gemeinsam frei und speichert die Zuordnung zum Angebot. Wiederholte Zustimmungen verwenden dieselben Aufträge; fehlgeschlagene Motive werden dabei nicht automatisch neu generiert. Eine gescheiterte Vorbereitung lässt keine halbfertige Bildserie automatisch anlaufen.

Text und Live übergeben die Auswahl an dieselbe Bildwarteschlange. Die Generierung läuft nacheinander, auch bei Wiederaufnahme nach Neuladen. Eine Ablehnung des ersten Motivs verhindert die Ausführung des zweiten ausdrücklich bestellten Motivs nicht. Beide Ergebnisse beziehungsweise Fehler bleiben beim zugehörigen Chatbeitrag. Anbieterprüfungen, Bildprüfung und Nutzungslimits gelten für jeden Auftrag.

Die unberechtigte Ankündigung „Klar, beides 😉 Gib mir einen kleinen Moment.“ wird ohne angelegten Bildauftrag abgefangen. Bei bereits vorhandener Auswahl wird auf deren Stand verwiesen, statt neue Erstellung zu versprechen.

Tests prüfen den genauen Screenshot-Wortlaut, Auswahl und Wiederholung, Text/Live, atomare Freigabe, fehlgeschlagene Vorbereitung, serielle Generierung, Anbieterablehnung des ersten Motivs, Wiederaufnahme und Chatpositionen. Die separate Anbieterablehnung `moderation_blocked` wird durch diesen Stand nicht als behoben ausgewiesen.
