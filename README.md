# Sofia Live – GitHub Pages / iPhone PWA

## Online stellen
1. Neues GitHub-Repository anlegen, z. B. `sofia-live`.
2. **Alle Dateien und Ordner aus diesem Paket** in das Hauptverzeichnis des Repositories hochladen. `index.html` muss auf oberster Ebene liegen.
3. Commit durchführen.
4. In GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
5. Branch **main**, Ordner **/(root)** wählen und speichern.
6. Nach dem Deployment die von GitHub angezeigte Pages-Adresse in Safari öffnen.

Typische Adresse: `https://DEIN-NAME.github.io/sofia-live/`

## Auf dem iPhone installieren
In Safari die GitHub-Pages-Adresse öffnen → **Teilen** → **Zum Home-Bildschirm** → **Hinzufügen**.

Die App nutzt relative Pfade und funktioniert deshalb auch in einem GitHub-Pages-Projekt-Unterordner. Ein Service Worker cached die statischen Dateien für Offline-Starts nach dem ersten erfolgreichen Laden.

## Wichtige Einschränkung
Die aktuelle Sofia-Antwortlogik läuft lokal im Browser. Keine privaten API-Keys in `app.js` oder andere Dateien dieses öffentlichen Repositories eintragen. Für echte KI, sichere API-Zugriffe, persistente Cloud-Memory oder hochwertige Echtzeit-Stimme ist ein Backend/Serverless-Endpunkt nötig.
