# Sofia 4.180.2 · installierte iPhone-App

Die beiden vorherigen CSS-Anpassungen haben auf dem gemeldeten iPhone die Position nicht verändert. 4.180.1 hat lediglich sichtbar die Farbe verändert; diese Farbänderung ist zurückgenommen.

Gezielte Änderung nur bei navigator.standalone === true auf mobilen Breiten: Root und Body bilden einen nicht fixierten 100vh-Canvas, die App liegt absolut darin. Der Chat erhält ohne Tastatur position:absolute und richtet seine Unterkante damit am App-Canvas aus, statt am fehlerhaft verkürzten Fixed-Viewport. Die halbe Chatgröße verwendet denselben Canvas. Mit Tastatur bleibt die bestehende Visual-Viewport-Positionierung aktiv. Der Home-Indikator-Abstand bleibt einmal unter der Schreibzeile.

Grundlage der Fehlerhypothese: WebKit 236445, Kommentar 9, beschreibt einen Zusatzabstand in Höhe des oberen Safe Areas bei bottom:0 und black-translucent; WebKit 254868, Kommentar 2, unterscheidet 100vh im Standalone-Modus von verkürzten Viewportwerten. https://bugs.webkit.org/show_bug.cgi?id=236445 https://bugs.webkit.org/show_bug.cgi?id=254868

Eine Browserabnahme mit nachgebildetem navigator.standalone prüft den speziellen Layoutpfad. Sie reproduziert nicht den iOS-Compositorfehler. Der tatsächliche Erfolg am physischen iPhone muss bestätigt werden. Technische Übersicht zeigt die verwendeten Viewport- und Elementgrenzen zur Diagnose ohne Chattexte.
