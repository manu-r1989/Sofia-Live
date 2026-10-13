# Sofia 4.100.1 — gemeinsame Icon-Zeile und Chatgrößen

- Chat, Heute, Galerie, Einstellungen, Suche, Live-Mikrofon und Chatgröße stehen nebeneinander in einer oberen Zeile. Einheitliche SVG-Symbole, zugängliche Labels und Tooltips; keine Textbeschriftungen in der Leiste. Status bleibt darunter.
- Drei explizite Größen: volle nutzbare Höhe, halbe nutzbare Höhe, ausgeblendet. Größenwechsel funktioniert auch im Querformat, übersteht Reload, erhält Entwürfe und Leseposition und wird durch Rotation/Tastatur-Resize nicht überschrieben. Ausgeblendet bleibt der Wiederherstellungsbutton erreichbar.
- Fotoaktionen stehen kompakt in drei Spalten; Fotoreihen- und weitere Aktionen sowie Vorheriges/Nächstes haben kleinere Abstände und Höhen. Quellen-/Variantenvertrag und generierende Aktionen unverändert.
- Keine Änderungen an Daten, Limits, Avatar, WebRTC oder Audiopipeline. Releaseassets 41001v2.

Abnahme: 723 Tests sowie Syntax- und Inline-Prüfungen bestanden. Browser bestätigt sieben SVG-Buttons auf gleicher Y-Koordinate, Voll-/Halb-/Ausblenden inklusive Reload und Wiederherstellung, erhaltenen Entwurf, drei Fotohauptaktionen mit 40px und Fotoreihenbuttons mit 36px Höhe. Korrigierter Testcommit 46868b8e0b9cdff2a7ee782b497c07abc998f71b READY. Kein kostenpflichtiger KI-/Fotoauftrag und keine Mikrofonfreigabe ausgelöst. Native iPhone-Tastatur bleibt Geräteabnahme.
