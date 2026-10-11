# Sofia 4.99.13 — PWA-Tastatur und Schreibcursor

Ausgangspunkt: iPhone-PWA-Screenshot mit Abstand zwischen Chatfenster und Tastatur sowie einem sichtbar in der Nachrichtenblase gezeichneten Eingabecursor.

## Gezielte Korrektur

- Sichtbarer Viewport einschließlich offsetTop steuert bei geöffneter Bildschirmtastatur die Position und Höhe des mobilen Chatfensters direkt. Kein zusätzliches Bottom-Inset/Home-Indicator-Padding in diesem Zustand.
- Tastaturerkennung hält die ursprüngliche Layout-Höhe fest; ein bereits durch iOS verkleinertes innerHeight darf die Tastaturerkennung nicht wieder löschen. Zoom wird nicht als Bildschirmtastatur interpretiert.
- Bei Viewport-Scroll/-Resize wird die Textarea nicht fortlaufend auf height:auto zusammengeklappt. Gemessene Inhaltshöhe bleibt erhalten, neue Grenze wird nur bei tatsächlicher Höhenänderung geschrieben. Eingaben werden weiterhin passend vermessen.
- Während des Schreibens auf schmalen Portrait-Geräten: Chat-Backdrop-Blur und Chat-Layout-Transition deaktiviert, native Textauswahl/Caret beibehalten. Dies vermeidet eine plausible WebKit-Ursache für versetztes Caret-Painting; tatsächliche iPhone-Abnahme bleibt erforderlich.
- Werkzeugleiste wird während geöffneter Tastatur nur visuell verborgen; keine Änderung ihrer gespeicherten Auswahl. Nach Schließen der Tastatur gelten wieder vorhandene Layout-/Werkzeugregeln.
- Desktoplayout, Chatdaten, Entwürfe, Avatar-/Voice-/WebRTC-/Lipsync-Logik unverändert.

## Prüfung

698 automatisierte Tests bestanden, darunter fünf neue Regressionen zu innerHeight-Schrumpfung, Viewport-Panning ohne Textarea-Kollaps, Zoom und Wiederherstellung nach Tastaturschluss ohne Entwurfs-/Fokusänderung. JS-/Inline-Syntaxchecks bestanden.

Testdeploy 3cecf23b9fd2fde4a4a68787f463c0a8508aca95 READY und aliasiert. Browser lädt 4.99.13, Schreibfeld ist tatsächlich document.activeElement, Nachrichten nicht editierbar. Mehrzeiliger ungesendeter Entwurf und Schreibfokus nach Reload geprüft; eigener Testentwurf danach entfernt. Zusatzprüfung: rascher Fokuswechsel während der Tastaturanimation verliert die ursprüngliche Layout-Höhe nicht. Finaler Folgekandidat wird vor Produktivpromotion auf READY/Alias/Assets geprüft. Eine echte iPhone-PWA-Tastatur ist im verfügbaren Desktopbrowser nicht vorhanden. Native Cursorposition und Abstand zur iPhone-Tastatur können daher nicht als real auf iOS abgenommen ausgegeben werden.

Version 4.99.13; Asset-/Cachekennung 49913v2. Test-only Stimmenvergleich bleibt nur auf test-web. Bestehenden PWA-Updatemechanismus verwenden („Neue Version laden“ in Einstellungen), Entwurf bleibt gesichert. Kein Datenreset.
